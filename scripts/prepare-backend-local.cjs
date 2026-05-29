#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const {
  fail,
  formatFetchFailure,
  info,
  loadEnvFile,
  pass,
} = require("./_validation-common.cjs");
const {
  prepareValidationLocal,
} = require("./prepare-validation-local.cjs");
const {
  checkBackendReleaseReadiness,
} = require("./check-backend-release-readiness.cjs");

async function prepareBackendLocal(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const runCommand = options.runCommand || defaultRunCommand;
  const startBackgroundCommand =
    options.startBackgroundCommand || defaultStartBackgroundCommand;
  const fetchImpl = options.fetchImpl || fetch;
  const prepareValidationLocalFn =
    options.prepareValidationLocalFn || prepareValidationLocal;
  const checkBackendReleaseReadinessFn =
    options.checkBackendReleaseReadinessFn || checkBackendReleaseReadiness;
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const liveTimeoutMs = options.liveTimeoutMs ?? 60_000;
  const readyTimeoutMs = options.readyTimeoutMs ?? 60_000;

  loadEnvFile(path.resolve(cwd, ".env"), { override: true });
  Object.assign(process.env, options.env || {});

  const validationExitCode = await prepareValidationLocalFn({
    cwd,
    logger,
  });
  if (validationExitCode !== 0) {
    return 1;
  }

  loadEnvFile(path.resolve(cwd, ".env"), { override: true });
  Object.assign(process.env, options.env || {});

  const baseUrl = stripTrailingSlash(
    options.baseUrl ||
      process.env.ARENA_INTERNAL_API_BASE_URL ||
      `http://127.0.0.1:${process.env.PORT || "4000"}`,
  );
  const outputDir =
    options.outputDir || path.resolve(cwd, "validation-local");
  const apiLogPath =
    options.apiLogPath || path.resolve(outputDir, "backend-api.log");
  const releaseOutputPath =
    options.releaseOutputPath ||
    path.resolve(outputDir, "backend-release-readiness.json");

  const liveProbe = await probeEndpoint(fetchImpl, `${baseUrl}/health/live`);
  if (!liveProbe.ok) {
    const buildResult = await runCommand(
      createCommand({
        label: "backend:build",
        command: "pnpm",
        args: ["run", "backend:build"],
        cwd,
        env: process.env,
      }),
    );
    if (!isSuccess(buildResult)) {
      return 1;
    }

    const apiStartResult = await startBackgroundCommand(
      createCommand({
        label: "api:start",
        command: "pnpm",
        args: ["run", "api:start"],
        cwd,
        env: process.env,
        logPath: apiLogPath,
      }),
    );

    if (!apiStartResult || apiStartResult.started !== true) {
      logger.fail(
        `Unable to start the local backend automatically. Start \`pnpm run api:start\` manually, then rerun \`pnpm run backend:prepare:local\`.${apiStartResult?.error ? ` ${apiStartResult.error}` : ""}`,
      );
      if (apiStartResult?.logPath) {
        logger.info(`Backend API log: ${apiStartResult.logPath}`);
      }
      return 1;
    }

    logger.info(`Started local backend API on ${baseUrl}.`);
    if (apiStartResult.pid) {
      logger.info(`Backend API pid: ${apiStartResult.pid}`);
    }
    if (apiStartResult.logPath) {
      logger.info(`Backend API log: ${apiStartResult.logPath}`);
    }
  } else {
    logger.info(`Reusing existing local backend API at ${baseUrl}.`);
  }

  const liveReady = await waitForHttpOk({
    fetchImpl,
    url: `${baseUrl}/health/live`,
    label: "local backend live health",
    timeoutMs: liveTimeoutMs,
    intervalMs: pollIntervalMs,
  });
  if (!liveReady.ok) {
    logger.fail(formatWaitFailure(liveReady));
    if (apiLogPath) {
      logger.info(`Backend API log: ${apiLogPath}`);
    }
    return 1;
  }

  const readyCheck = await waitForHttpOk({
    fetchImpl,
    url: `${baseUrl}/health/ready`,
    label: "local backend readiness health",
    timeoutMs: readyTimeoutMs,
    intervalMs: pollIntervalMs,
  });

  if (!readyCheck.ok) {
    logger.info(
      `Local backend readiness is still degraded after waiting ${readyTimeoutMs}ms. Running the backend release check for exact blockers.`,
    );
    if (typeof readyCheck.lastStatus === "number") {
      logger.info(`Latest /health/ready status: ${readyCheck.lastStatus}`);
    }
    if (readyCheck.lastBody) {
      logger.info(
        `Latest /health/ready body: ${truncate(readyCheck.lastBody, 500)}`,
      );
    }
  }

  const releaseExitCode = await checkBackendReleaseReadinessFn({
    cwd,
    logger,
    baseUrl,
    outputPath: releaseOutputPath,
    authToken: options.authToken,
    fetchImpl,
  });
  if (releaseExitCode !== 0) {
    if (apiLogPath) {
      logger.info(`Backend API log: ${apiLogPath}`);
    }
    return 1;
  }

  logger.pass(
    "Local backend runtime is prepared and passed release readiness. Next: exercise the proposition -> chain -> sync -> public proof flow.",
  );
  return 0;
}

function createCommand(command) {
  return command;
}

function isSuccess(result) {
  return !!result && result.status === 0;
}

async function probeEndpoint(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
    });
    const body = await readResponseText(response);

    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  }
}

async function waitForHttpOk(input) {
  const startedAt = Date.now();
  const deadline = startedAt + input.timeoutMs;
  let lastStatus = null;
  let lastBody = "";
  let lastError = null;
  let attempts = 0;

  while (Date.now() <= deadline) {
    attempts += 1;
    const result = await probeEndpoint(input.fetchImpl, input.url);

    if (result.ok) {
      return {
        ok: true,
        attempts,
        lastStatus: result.status,
        lastBody: result.body,
        label: input.label,
        url: input.url,
        timeoutMs: input.timeoutMs,
      };
    }

    if (typeof result.status === "number") {
      lastStatus = result.status;
      lastBody = result.body || "";
    }
    if (result.error) {
      lastError = result.error;
    }

    if (Date.now() + input.intervalMs > deadline) {
      break;
    }

    await sleep(input.intervalMs);
  }

  return {
    ok: false,
    attempts,
    label: input.label,
    url: input.url,
    timeoutMs: input.timeoutMs,
    lastStatus,
    lastBody,
    lastError,
  };
}

function formatWaitFailure(result) {
  if (result.lastError) {
    return formatFetchFailure(result.lastError, {
      url: result.url,
      label: result.label,
    });
  }

  if (typeof result.lastStatus === "number") {
    return `Timed out waiting for ${result.label} at ${result.url} to return HTTP 200. Latest status was ${result.lastStatus}.${result.lastBody ? ` Response: ${truncate(result.lastBody, 500)}` : ""}`;
  }

  return `Timed out waiting for ${result.label} at ${result.url} to return HTTP 200 after ${result.timeoutMs}ms.`;
}

function readResponseText(response) {
  if (typeof response.text !== "function") {
    return "";
  }

  return response.text();
}

function truncate(value, maxLength) {
  if (typeof value !== "string" || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function defaultRunCommand(command) {
  info(`Running ${command.label}: ${renderCommand(command)}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  return {
    status: typeof result.status === "number" ? result.status : 1,
  };
}

function defaultStartBackgroundCommand(command) {
  info(`Starting ${command.label}: ${renderCommand(command)}`);

  fs.mkdirSync(path.dirname(command.logPath), { recursive: true });
  fs.appendFileSync(
    command.logPath,
    `\n[${new Date().toISOString()}] Starting ${renderCommand(command)}\n`,
  );

  const outputFd = fs.openSync(command.logPath, "a");

  try {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ["ignore", outputFd, outputFd],
      detached: process.platform !== "win32",
      shell: process.platform === "win32",
      windowsHide: true,
    });

    child.unref();
    fs.closeSync(outputFd);

    return {
      started: true,
      pid: child.pid || null,
      logPath: command.logPath,
    };
  } catch (error) {
    fs.closeSync(outputFd);

    return {
      started: false,
      error: error instanceof Error ? error.message : String(error),
      logPath: command.logPath,
    };
  }
}

function renderCommand(command) {
  return [command.command, ...command.args].join(" ");
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/u, "");
}

function parseCliArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--base-url" && next) {
      parsed.baseUrl = next;
      index += 1;
      continue;
    }

    if (token === "--auth-token" && next) {
      parsed.authToken = next;
      index += 1;
    }
  }

  return parsed;
}

async function main() {
  const exitCode = await prepareBackendLocal(parseCliArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  prepareBackendLocal,
};
