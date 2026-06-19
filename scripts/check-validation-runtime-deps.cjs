#!/usr/bin/env node

const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const { URL } = require("node:url");

const { fail, info, loadEnvFile, pass } = require("./_validation-common.cjs");
const {
  formatGigabytes,
  readWslDistributionStates,
  summarizeRecentDockerFailureLines,
} = require("./recover-backend-release-host.cjs");
const {
  resolveDockerDesktopDataDiskPath,
} = require("./check-backend-release-host-preflight.cjs");

function parseArgs(argv) {
  const options = {
    checkApi: false,
    envFilePath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--") {
      continue;
    }

    if (argument === "--check-api") {
      options.checkApi = true;
      continue;
    }

    if (argument === "--env-file") {
      options.envFilePath = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

async function main(options = {}) {
  const envState = loadEnvFile(options.envFilePath, { override: true });
  info(
    envState.exists
      ? `Loaded .env from ${envState.envPath}`
      : `No .env file found at ${envState.envPath}; using process env only`,
  );

  const inspectRuntimeDependenciesFn =
    options.inspectRuntimeDependencies || inspectRuntimeDependencies;
  const inspection = await inspectRuntimeDependenciesFn({
    env: process.env,
    checkApi: options.checkApi === true,
  });
  const { results } = inspection;
  const failed = results.filter((result) => !result.ok);

  for (const result of results) {
    if (result.ok) {
      pass(`${result.name}: ${result.message}`);
    } else {
      fail(`${result.name}: ${result.message}`);
    }
  }

  emitLocalRemediation(results, {
    env: process.env,
    inspectContainerRuntime: options.inspectContainerRuntime,
  });

  if (failed.length > 0) {
    process.exitCode = 1;
    return;
  }

  pass("Runtime dependency preflight passed");
}

function defaultRunCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeoutMs ?? 15000,
    windowsHide: true,
  });
}

function checkTcpUrl(name, rawUrl) {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || defaultPort(parsed.protocol));
  return checkTcp(name, host, port);
}

function checkTcp(name, host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok, message) => {
      socket.destroy();
      resolve({ name, ok, message });
    };

    socket.setTimeout(1500);
    socket.once("connect", () => done(true, `${host}:${port} reachable`));
    socket.once("timeout", () => done(false, `${host}:${port} timed out`));
    socket.once("error", (error) => {
      done(false, `${host}:${port} refused: ${error.message}`);
    });
    socket.connect(port, host);
  });
}

async function checkRpc(rawUrl, expectedChainId) {
  try {
    const response = await fetch(rawUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
      }),
    });

    if (!response.ok) {
      return {
        name: "rpc",
        ok: false,
        message: `HTTP ${response.status}`,
      };
    }

    const body = await response.json();
    const actualChainId = Number.parseInt(body.result, 16);
    const expected =
      expectedChainId && expectedChainId.length > 0
        ? Number(expectedChainId)
        : null;

    if (expected !== null && actualChainId !== expected) {
      return {
        name: "rpc",
        ok: false,
        message: `chain id mismatch, expected ${expected}, got ${actualChainId}`,
      };
    }

    return {
      name: "rpc",
      ok: true,
      message: `${rawUrl} reachable on chain ${actualChainId}`,
    };
  } catch (error) {
    return {
      name: "rpc",
      ok: false,
      message: error instanceof Error ? error.message : "Unknown RPC error",
    };
  }
}

async function checkApi(port) {
  return checkTcp("api", "127.0.0.1", Number(port));
}

function defaultPort(protocol) {
  switch (protocol) {
    case "postgres:":
    case "postgresql:":
      return 5432;
    case "redis:":
      return 6379;
    case "http:":
      return 80;
    case "https:":
      return 443;
    default:
      return 0;
  }
}

function emitLocalRemediation(results) {
  const env = arguments[1]?.env || process.env;
  const logger = arguments[1]?.logger || { info };
  const inspectContainerRuntimeFn =
    arguments[1]?.inspectContainerRuntime || inspectContainerRuntime;

  if (env.ARENA_VALIDATION_ENVIRONMENT !== "local") {
    return;
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    return;
  }

  const failedNames = new Set(failed.map((result) => result.name));
  const needsContainerRuntime =
    failedNames.has("postgres") || failedNames.has("redis");

  if (needsContainerRuntime) {
    const containerRuntime = inspectContainerRuntimeFn();

    if (containerRuntime.status === "missing-cli") {
      logger.info(
        "Local runtime blocker: Docker or another compatible container runtime is not available in PATH, so pnpm run deps:up cannot start Postgres or Redis here.",
      );
      logger.info(
        "Install Docker Desktop or provide equivalent local Postgres and Redis services, then rerun pnpm run validation:deps:check.",
      );
    } else if (containerRuntime.status === "engine-unreachable") {
      logger.info(
        `Local runtime blocker: Docker CLI is installed but cannot reach the Linux engine${containerRuntime.message ? ` (${containerRuntime.message})` : ""}, so pnpm run deps:up cannot start Postgres or Redis here.`,
      );
      if (containerRuntime.dockerDataDisk?.path && Number.isFinite(containerRuntime.dockerDataDisk.sizeBytes)) {
        logger.info(
          `Docker Desktop data disk: ${containerRuntime.dockerDataDisk.path} (${formatGigabytes(containerRuntime.dockerDataDisk.sizeBytes)})`,
        );
      }
      const dockerDesktopDistro = Array.isArray(containerRuntime.wslDistributions)
        ? containerRuntime.wslDistributions.find(
            (entry) => entry?.name === "docker-desktop",
          )
        : null;
      if (dockerDesktopDistro?.state === "Running") {
        logger.info(
          "WSL hint: `docker-desktop` still reports Running while the Docker CLI cannot reach the engine. Terminate that distro with `wsl --terminate docker-desktop`, then restart Docker Desktop.",
        );
      }
      if (Array.isArray(containerRuntime.recentDockerFailureLines)) {
        for (const line of containerRuntime.recentDockerFailureLines) {
          logger.info(`Recent Docker backend failure: ${line}`);
        }
      }
      logger.info(
        "Start or recover Docker Desktop, then rerun pnpm run deps:up and pnpm run validation:deps:check.",
      );
    } else if (containerRuntime.status === "compose-unavailable") {
      logger.info(
        `Local runtime blocker: Docker engine is reachable but docker compose is unavailable from this shell${containerRuntime.message ? ` (${containerRuntime.message})` : ""}, so pnpm run deps:up cannot start Postgres or Redis here.`,
      );
      logger.info(
        "Install or enable Docker Compose v2, or provide equivalent local Postgres and Redis services, then rerun pnpm run validation:deps:check.",
      );
    } else {
      logger.info(
        "Local runtime blocker: Postgres or Redis is down. Start them with pnpm run deps:up, then rerun pnpm run validation:deps:check.",
      );
    }
  }

  if (failedNames.has("rpc")) {
    logger.info(
      "Local runtime blocker: the Hardhat/local RPC is unavailable. Start it with pnpm exec hardhat node, redeploy the validation contract if needed, then rerun pnpm run validation:deps:check and pnpm run validation:chain:check.",
    );
  }
}

function inspectContainerRuntime(options = {}) {
  const runCommand = options.runCommand || defaultRunCommand;
  const locateDockerCliFn = options.locateDockerCli || locateDockerCli;
  const readDockerDataDiskInfoFn =
    options.readDockerDataDiskInfo || readDockerDataDiskInfo;
  const platform = options.platform || process.platform;
  const readWslDistributionStatesFn =
    options.readWslDistributionStates || readWslDistributionStates;
  const summarizeRecentDockerFailureLinesFn =
    options.summarizeRecentDockerFailureLines || summarizeRecentDockerFailureLines;
  const env = options.env || process.env;

  try {
    const cliLocation = locateDockerCliFn({
      platform,
      runCommand,
    });

    if (!cliLocation.available) {
      return {
        status: "missing-cli",
        cliAvailable: false,
        engineReachable: false,
        composeAvailable: false,
        message: cliLocation.message,
      };
    }

    const engineResult = runCommand(
      "docker",
      ["version", "--format", "{{.Server.Version}}"],
      {
        timeoutMs: 30000,
      },
    );
    if (engineResult.error || engineResult.status !== 0) {
      const diagnostics = collectEngineUnreachableDiagnostics({
        env,
        platform,
        readDockerDataDiskInfo: readDockerDataDiskInfoFn,
        readWslDistributionStates: readWslDistributionStatesFn,
        runCommand,
        summarizeRecentDockerFailureLines: summarizeRecentDockerFailureLinesFn,
      });
      return {
        status: "engine-unreachable",
        cliAvailable: true,
        engineReachable: false,
        composeAvailable: false,
        dockerDataDisk: diagnostics.dockerDataDisk,
        message: summarizeCommandFailure(
          engineResult,
          "Docker CLI could not reach the Linux engine. Start or recover Docker Desktop, then retry.",
        ),
        recentDockerFailureLines: diagnostics.recentDockerFailureLines,
        wslDistributions: diagnostics.wslDistributions,
      };
    }

    const engineVersion = (engineResult.stdout || "").trim();
    if (!engineVersion) {
      const diagnostics = collectEngineUnreachableDiagnostics({
        env,
        platform,
        readDockerDataDiskInfo: readDockerDataDiskInfoFn,
        readWslDistributionStates: readWslDistributionStatesFn,
        runCommand,
        summarizeRecentDockerFailureLines: summarizeRecentDockerFailureLinesFn,
      });
      return {
        status: "engine-unreachable",
        cliAvailable: true,
        engineReachable: false,
        composeAvailable: false,
        dockerDataDisk: diagnostics.dockerDataDisk,
        message:
          "Docker CLI reached the engine but did not return a server version. Reopen Docker Desktop and retry.",
        recentDockerFailureLines: diagnostics.recentDockerFailureLines,
        wslDistributions: diagnostics.wslDistributions,
      };
    }

    const composeResult = runCommand("docker", ["compose", "version"], {
      timeoutMs: 15000,
    });
    if (composeResult.error || composeResult.status !== 0) {
      return {
        status: "compose-unavailable",
        cliAvailable: true,
        engineReachable: true,
        composeAvailable: false,
        engineVersion,
        message: summarizeCommandFailure(
          composeResult,
          "Docker Compose v2 is unavailable from this shell. Install or enable the docker compose plugin, then retry.",
        ),
      };
    }

    return {
      status: "ok",
      cliAvailable: true,
      engineReachable: true,
      composeAvailable: true,
      engineVersion,
      composeVersion: (composeResult.stdout || composeResult.stderr || "").trim(),
      message: `Docker engine reachable: ${engineVersion}`,
    };
  } catch (error) {
    return {
      status: "missing-cli",
      cliAvailable: false,
      engineReachable: false,
      composeAvailable: false,
      message:
        error instanceof Error
          ? error.message
          : "unknown docker detection error",
    };
  }
}

function collectEngineUnreachableDiagnostics(options = {}) {
  const platform = options.platform || process.platform;

  let dockerDataDisk = null;
  try {
    dockerDataDisk = options.readDockerDataDiskInfo(options.env);
  } catch {
    dockerDataDisk = null;
  }

  let recentDockerFailureLines = [];
  try {
    recentDockerFailureLines = options.summarizeRecentDockerFailureLines(
      options.env,
    );
  } catch {
    recentDockerFailureLines = [];
  }

  let wslDistributions = [];
  if (platform === "win32") {
    try {
      const result = options.readWslDistributionStates(options.runCommand);
      if (result?.ok && Array.isArray(result.entries)) {
        wslDistributions = result.entries;
      }
    } catch {
      wslDistributions = [];
    }
  }

  return {
    dockerDataDisk,
    recentDockerFailureLines,
    wslDistributions,
  };
}

function readDockerDataDiskInfo(env = process.env) {
  const dockerDataDiskPath = resolveDockerDesktopDataDiskPath(env);
  if (!dockerDataDiskPath || !fs.existsSync(dockerDataDiskPath)) {
    return null;
  }

  try {
    const stats = fs.statSync(dockerDataDiskPath);
    return {
      path: dockerDataDiskPath,
      sizeBytes: stats.size,
    };
  } catch {
    return {
      path: dockerDataDiskPath,
      sizeBytes: null,
    };
  }
}

function summarizeCommandFailure(result, fallbackMessage) {
  if (result?.error instanceof Error) {
    return result.error.message;
  }

  const detail = (result?.stderr || result?.stdout || "").trim();
  if (detail.length > 0) {
    return detail;
  }

  if (typeof result?.status === "number") {
    return `${fallbackMessage} (exit ${result.status})`;
  }

  return fallbackMessage;
}

function locateDockerCli(options = {}) {
  const runCommand = options.runCommand || defaultRunCommand;
  const platform = options.platform || process.platform;
  if (platform === "win32") {
    const windowsLocation = locateDockerCliOnWindows(runCommand);
    if (windowsLocation.available) {
      return windowsLocation;
    }

    return windowsLocation;
  }

  const result = runCommand("which", ["docker"], {
    timeoutMs: 5000,
  });

  if (result?.error || result?.status !== 0) {
    return {
      available: false,
      message: summarizeCommandFailure(
        result,
        "Docker CLI is not available in PATH.",
      ),
    };
  }

  const candidate = String(result.stdout || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!candidate) {
    return {
      available: false,
      message: "Docker CLI lookup returned no executable path.",
    };
  }

  return {
    available: true,
    path: candidate,
  };
}

function locateDockerCliOnWindows(runCommand) {
  const attempts = [
    {
      command: "where.exe",
      args: ["docker"],
      timeoutMs: 5000,
    },
    {
      command: "powershell",
      args: [
        "-NoProfile",
        "-Command",
        "(Get-Command docker -ErrorAction Stop).Source",
      ],
      timeoutMs: 15000,
    },
  ];

  const failures = [];
  for (const attempt of attempts) {
    const result = runCommand(attempt.command, attempt.args, {
      timeoutMs: attempt.timeoutMs,
    });

    if (!result?.error && result?.status === 0) {
      const candidate = String(result.stdout || "")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (candidate) {
        return {
          available: true,
          path: candidate,
        };
      }
    }

    failures.push(
      summarizeCommandFailure(result, `${attempt.command} failed to locate docker`),
    );
  }

  const knownDockerDesktopPath =
    "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
  try {
    if (require("node:fs").existsSync(knownDockerDesktopPath)) {
      return {
        available: true,
        path: knownDockerDesktopPath,
      };
    }
  } catch {
    // Ignore fs fallback errors and return the aggregated probe failure below.
  }

  return {
    available: false,
    message: failures.filter((value) => value.length > 0).join(" | ") ||
      "Docker CLI is not available in PATH.",
  };
}

async function inspectRuntimeDependencies(options = {}) {
  const env = options.env || process.env;
  const shouldCheckApi = options.checkApi === true;
  const checkTcpUrlImpl = options.checkTcpUrl || checkTcpUrl;
  const checkRpcImpl = options.checkRpc || checkRpc;
  const checkApiImpl = options.checkApiImpl || checkApi;
  const checks = [];

  if (env.DATABASE_URL) {
    checks.push(checkTcpUrlImpl("postgres", env.DATABASE_URL));
  }
  if (env.REDIS_URL) {
    checks.push(checkTcpUrlImpl("redis", env.REDIS_URL));
  }
  if (env.RPC_URL) {
    checks.push(checkRpcImpl(env.RPC_URL, env.CHAIN_ID));
  }
  if (shouldCheckApi) {
    checks.push(checkApiImpl(env.PORT || "4000"));
  }

  const results = await Promise.all(checks);
  const failedNames = results
    .filter((result) => !result.ok)
    .map((result) => result.name);

  return {
    ok: failedNames.length === 0,
    failedNames,
    results,
  };
}

if (require.main === module) {
  main(parseArgs(process.argv.slice(2)));
}

module.exports = {
  emitLocalRemediation,
  inspectContainerRuntime,
  inspectRuntimeDependencies,
  locateDockerCli,
  locateDockerCliOnWindows,
  main,
  parseArgs,
  readDockerDataDiskInfo,
};
