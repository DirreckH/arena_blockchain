#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const net = require("node:net");
const { URL } = require("node:url");

const { fail, info, loadEnvFile, pass } = require("./_validation-common.cjs");

const CHECK_API = process.argv.includes("--check-api");

async function main() {
  const envState = loadEnvFile(undefined, { override: true });
  info(
    envState.exists
      ? `Loaded .env from ${envState.envPath}`
      : `No .env file found at ${envState.envPath}; using process env only`,
  );

  const inspection = await inspectRuntimeDependencies({
    env: process.env,
    checkApi: CHECK_API,
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

  emitLocalRemediation(results);

  if (failed.length > 0) {
    process.exitCode = 1;
    return;
  }

  pass("Runtime dependency preflight passed");
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
  if (process.env.ARENA_VALIDATION_ENVIRONMENT !== "local") {
    return;
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    return;
  }

  const failedNames = new Set(failed.map((result) => result.name));
  const dockerStatus = detectDockerCli();
  const needsContainerRuntime =
    failedNames.has("postgres") || failedNames.has("redis");

  if (needsContainerRuntime && !dockerStatus.available) {
    info(
      "Local runtime blocker: Docker or another compatible container runtime is not available in PATH, so pnpm run deps:up cannot start Postgres or Redis here.",
    );
    info(
      "Install Docker Desktop or provide equivalent local Postgres and Redis services, then rerun pnpm run validation:deps:check.",
    );
  } else if (needsContainerRuntime) {
    info(
      "Local runtime blocker: Postgres or Redis is down. Start them with pnpm run deps:up, then rerun pnpm run validation:deps:check.",
    );
  }

  if (failedNames.has("rpc")) {
    info(
      "Local runtime blocker: the Hardhat/local RPC is unavailable. Start it with pnpm exec hardhat node, redeploy the validation contract if needed, then rerun pnpm run validation:deps:check and pnpm run validation:chain:check.",
    );
  }
}

function detectDockerCli() {
  try {
    const result = spawnSync("docker", ["--version"], {
      encoding: "utf8",
      timeout: 3000,
      windowsHide: true,
    });

    if (result.error) {
      return {
        available: false,
        reason: result.error.message,
      };
    }

    return {
      available: result.status === 0,
      reason:
        result.status === 0
          ? null
          : (result.stderr || result.stdout || `exit ${result.status}`).trim(),
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "unknown docker detection error",
    };
  }
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
  main();
}

module.exports = {
  inspectRuntimeDependencies,
};
