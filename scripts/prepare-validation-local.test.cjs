const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  prepareValidationLocal,
} = require("./prepare-validation-local.cjs");

test("prepare-validation-local bootstraps, starts the local RPC, deploys, and finishes preflight in documented order", async () => {
  const commands = [];
  const backgroundStarts = [];
  let rpcChecks = 0;

  const exitCode = await prepareValidationLocal({
    cwd: path.resolve(__dirname, ".."),
    logger: createLogger(),
    env: {
      ARENA_VALIDATION_ENVIRONMENT: "local",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: "1337",
    },
    runCommand: async (command) => {
      commands.push(command.label);

      if (command.label === "validation:chain:check") {
        return { status: 1 };
      }

      return { status: 0 };
    },
    isRpcReachable: async () => {
      rpcChecks += 1;
      return rpcChecks >= 3;
    },
    startBackgroundCommand: async (command) => {
      backgroundStarts.push(command.label);
      return { started: true, pid: 4242 };
    },
    rpcPollIntervalMs: 0,
    rpcReadyTimeoutMs: 1000,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, [
    "validation:bootstrap:local",
    "deps:up",
    "hardhat:compile",
    "validation:chain:check",
    "validation:deploy",
    "validation:preflight",
    "validation:db:deploy",
    "validation:db:status",
  ]);
  assert.deepEqual(backgroundStarts, ["hardhat:node"]);
  assert.equal(rpcChecks, 3);
});

test("prepare-validation-local reuses a healthy local validation deployment instead of redeploying it", async () => {
  const commands = [];
  const backgroundStarts = [];

  const exitCode = await prepareValidationLocal({
    cwd: path.resolve(__dirname, ".."),
    logger: createLogger(),
    env: {
      ARENA_VALIDATION_ENVIRONMENT: "local",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: "1337",
    },
    runCommand: async (command) => {
      commands.push(command.label);
      return { status: 0 };
    },
    isRpcReachable: async () => true,
    startBackgroundCommand: async (command) => {
      backgroundStarts.push(command.label);
      return { started: true, pid: 4242 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, [
    "validation:bootstrap:local",
    "deps:up",
    "hardhat:compile",
    "validation:chain:check",
    "validation:preflight",
    "validation:db:deploy",
    "validation:db:status",
  ]);
  assert.deepEqual(backgroundStarts, []);
});

test("prepare-validation-local falls back to validation dependency diagnostics when local dependency startup fails", async () => {
  const commands = [];
  const backgroundStarts = [];

  const exitCode = await prepareValidationLocal({
    cwd: path.resolve(__dirname, ".."),
    logger: createLogger(),
    env: {
      ARENA_VALIDATION_ENVIRONMENT: "local",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: "1337",
    },
    runCommand: async (command) => {
      commands.push(command.label);

      if (command.label === "deps:up") {
        return { status: 1 };
      }

      return { status: 0 };
    },
    inspectRuntimeDependencies: async () => ({
      ok: false,
      failedNames: ["postgres", "redis", "rpc"],
      results: [
        {
          name: "postgres",
          ok: false,
          message: "down",
        },
        {
          name: "redis",
          ok: false,
          message: "down",
        },
        {
          name: "rpc",
          ok: false,
          message: "fetch failed",
        },
      ],
    }),
    isRpcReachable: async () => false,
    startBackgroundCommand: async (command) => {
      backgroundStarts.push(command.label);
      return { started: true, pid: 4242 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(commands, [
    "validation:bootstrap:local",
    "deps:up",
  ]);
  assert.deepEqual(backgroundStarts, []);
});

test("prepare-validation-local continues when deps:up fails but dependency diagnostics prove external services are already reachable", async () => {
  const commands = [];
  const backgroundStarts = [];

  const exitCode = await prepareValidationLocal({
    cwd: path.resolve(__dirname, ".."),
    logger: createLogger(),
    env: {
      ARENA_VALIDATION_ENVIRONMENT: "local",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: "1337",
    },
    runCommand: async (command) => {
      commands.push(command.label);

      if (command.label === "deps:up") {
        return { status: 1 };
      }

      if (command.label === "validation:chain:check") {
        return { status: 1 };
      }

      return { status: 0 };
    },
    inspectRuntimeDependencies: async () => ({
      ok: true,
      failedNames: [],
      results: [
        {
          name: "postgres",
          ok: true,
          message: "up",
        },
        {
          name: "redis",
          ok: true,
          message: "up",
        },
        {
          name: "rpc",
          ok: true,
          message: "up",
        },
      ],
    }),
    isRpcReachable: async () => true,
    startBackgroundCommand: async (command) => {
      backgroundStarts.push(command.label);
      return { started: true, pid: 4242 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, [
    "validation:bootstrap:local",
    "deps:up",
    "hardhat:compile",
    "validation:chain:check",
    "validation:deploy",
    "validation:preflight",
    "validation:db:deploy",
    "validation:db:status",
  ]);
  assert.deepEqual(backgroundStarts, []);
});

test("prepare-validation-local continues when deps:up fails and diagnostics show only the local RPC is missing", async () => {
  const commands = [];
  const backgroundStarts = [];
  let rpcChecks = 0;

  const exitCode = await prepareValidationLocal({
    cwd: path.resolve(__dirname, ".."),
    logger: createLogger(),
    env: {
      ARENA_VALIDATION_ENVIRONMENT: "local",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: "1337",
    },
    runCommand: async (command) => {
      commands.push(command.label);

      if (command.label === "deps:up") {
        return { status: 1 };
      }

      if (command.label === "validation:chain:check") {
        return { status: 1 };
      }

      return { status: 0 };
    },
    inspectRuntimeDependencies: async () => ({
      ok: false,
      failedNames: ["rpc"],
      results: [
        {
          name: "postgres",
          ok: true,
        },
        {
          name: "redis",
          ok: true,
        },
        {
          name: "rpc",
          ok: false,
        },
      ],
    }),
    isRpcReachable: async () => {
      rpcChecks += 1;
      return rpcChecks >= 3;
    },
    startBackgroundCommand: async (command) => {
      backgroundStarts.push(command.label);
      return { started: true, pid: 4242 };
    },
    rpcPollIntervalMs: 0,
    rpcReadyTimeoutMs: 1000,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, [
    "validation:bootstrap:local",
    "deps:up",
    "hardhat:compile",
    "validation:chain:check",
    "validation:deploy",
    "validation:preflight",
    "validation:db:deploy",
    "validation:db:status",
  ]);
  assert.deepEqual(backgroundStarts, ["hardhat:node"]);
  assert.equal(rpcChecks, 3);
});

function createLogger() {
  return {
    fail() {},
    info() {},
    pass() {},
  };
}
