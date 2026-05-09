#!/usr/bin/env node

const net = require("node:net");
const { URL } = require("node:url");

const { fail, info, loadEnvFile, pass } = require("./_validation-common.cjs");

const CHECK_API = process.argv.includes("--check-api");

async function main() {
  const envState = loadEnvFile();
  info(
    envState.exists
      ? `Loaded .env from ${envState.envPath}`
      : `No .env file found at ${envState.envPath}; using process env only`,
  );

  const checks = [];

  if (process.env.DATABASE_URL) {
    checks.push(checkTcpUrl("postgres", process.env.DATABASE_URL));
  }
  if (process.env.REDIS_URL) {
    checks.push(checkTcpUrl("redis", process.env.REDIS_URL));
  }
  if (process.env.RPC_URL) {
    checks.push(checkRpc(process.env.RPC_URL, process.env.CHAIN_ID));
  }
  if (CHECK_API) {
    checks.push(checkApi(process.env.PORT || "4000"));
  }

  const results = await Promise.all(checks);
  const failed = results.filter((result) => !result.ok);

  for (const result of results) {
    if (result.ok) {
      pass(`${result.name}: ${result.message}`);
    } else {
      fail(`${result.name}: ${result.message}`);
    }
  }

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

main();
