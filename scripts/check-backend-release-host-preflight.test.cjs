const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  checkBackendReleaseHostPreflight,
  checkDockerCliReachable,
  parseArgs,
  readWindowsDriveFreeBytes,
} = require("./check-backend-release-host-preflight.cjs");

const VALID_PRIVATE_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const HARDHAT_LOCAL_ADMIN_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

test("parseArgs enables the local rehearsal override and env-file override", () => {
  const parsed = parseArgs([
    "--allow-local-rehearsal",
    "--env-file",
    "validation-local/custom-release.env",
    "--min-free-gb",
    "24",
  ]);

  assert.equal(parsed.allowLocalRehearsal, true);
  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "validation-local/custom-release.env"),
  );
  assert.equal(parsed.minDockerDesktopDriveFreeGb, 24);
});

test("check-backend-release-host-preflight passes for local Docker rehearsal when explicitly allowed", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-preflight-pass-"),
  );
  const localAppData = path.join(workspace, "localapp");
  const dockerDiskPath = path.join(
    localAppData,
    "Docker",
    "wsl",
    "disk",
    "docker_data.vhdx",
  );
  const envFilePath = path.join(
    workspace,
    "validation-local",
    "release-rehearsal.env",
  );
  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(
    envFilePath,
    [
      "COMPOSE_PROJECT_NAME=arena-release-rehearsal",
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "JWT_SECRET=test-secret",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await checkBackendReleaseHostPreflight({
    allowLocalRehearsal: true,
    cwd: workspace,
    env: { LOCALAPPDATA: localAppData },
    getDriveFreeBytes: () => 32 * 1024 ** 3,
    logger,
    platform: "win32",
    runCommand: () => ({
      status: 0,
      stdout: "29.5.2\n",
      stderr: "",
    }),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(logger.failMessages, []);
  assert.equal(
    logger.infoMessages.includes("Release host preflight mode: local-rehearsal"),
    true,
  );
  assert.equal(
    logger.passMessages.includes("Docker engine reachable: 29.5.2"),
    true,
  );
  assert.equal(
    logger.passMessages.includes("Backend release host preflight passed."),
    true,
  );
});

test("check-backend-release-host-preflight passes in strict mode when non-local promotion env is healthy", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-preflight-strict-pass-"),
  );
  const localAppData = path.join(workspace, "localapp");
  const dockerDiskPath = path.join(
    localAppData,
    "Docker",
    "wsl",
    "disk",
    "docker_data.vhdx",
  );
  const envFilePath = path.join(
    workspace,
    "validation-local",
    "release-rehearsal.env",
  );
  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(
    envFilePath,
    [
      "COMPOSE_PROJECT_NAME=arena-staging-release",
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "JWT_SECRET=staging-secret-value-1234567890",
      "RPC_URL=https://rpc.staging.example",
      "CHAIN_ID=11155111",
      "ARENA_CONTRACT_ADDRESS=0x1111111111111111111111111111111111111111",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x2222222222222222222222222222222222222222",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${VALID_PRIVATE_KEY.replace(/f$/u, "e")}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${VALID_PRIVATE_KEY.replace(/f$/u, "d")}`,
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x3333333333333333333333333333333333333333",
      `ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=${VALID_PRIVATE_KEY.replace(/f$/u, "c")}`,
      "ARENA_COMPOSE_RPC_URL=https://rpc.staging.compose.example",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await checkBackendReleaseHostPreflight({
    cwd: workspace,
    env: { LOCALAPPDATA: localAppData },
    getDriveFreeBytes: () => 32 * 1024 ** 3,
    logger,
    platform: "win32",
    runCommand: () => ({
      status: 0,
      stdout: "29.5.2\n",
      stderr: "",
    }),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(logger.failMessages, []);
  assert.equal(
    logger.infoMessages.includes("Release host preflight mode: non-local promotion"),
    true,
  );
});

test("check-backend-release-host-preflight fails when the compose project contract is missing and Docker Desktop data drive is too full", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-preflight-fail-"),
  );
  const localAppData = path.join(workspace, "localapp");
  const dockerDiskPath = path.join(
    localAppData,
    "Docker",
    "wsl",
    "disk",
    "docker_data.vhdx",
  );
  const envFilePath = path.join(
    workspace,
    "validation-local",
    "release-rehearsal.env",
  );
  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "JWT_SECRET=test-secret",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await checkBackendReleaseHostPreflight({
    cwd: workspace,
    env: { LOCALAPPDATA: localAppData },
    getDriveFreeBytes: () => 4 * 1024 ** 3,
    logger,
    minDockerDesktopDriveFreeGb: 15,
    platform: "win32",
    runCommand: () => ({
      status: 0,
      stdout: "29.5.2\n",
      stderr: "",
    }),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Backend release host preflight failed.",
  ]);
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("missing COMPOSE_PROJECT_NAME"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("only has 4 GiB free"),
    ),
    true,
  );
});

test("check-backend-release-host-preflight blocks local-only release env values in strict mode", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-preflight-local-block-"),
  );
  const envFilePath = path.join(
    workspace,
    "validation-local",
    "release-rehearsal.env",
  );
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "COMPOSE_PROJECT_NAME=arena-release-rehearsal",
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "JWT_SECRET=replace-with-a-long-random-secret",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000001",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000002",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${HARDHAT_LOCAL_ADMIN_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${HARDHAT_LOCAL_ADMIN_PRIVATE_KEY}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${HARDHAT_LOCAL_ADMIN_PRIVATE_KEY}`,
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x0000000000000000000000000000000000000010",
      `ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=${HARDHAT_LOCAL_ADMIN_PRIVATE_KEY}`,
      "ARENA_COMPOSE_RPC_URL=http://host.docker.internal:8545",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await checkBackendReleaseHostPreflight({
    cwd: workspace,
    env: {},
    logger,
    runCommand: () => ({
      status: 0,
      stdout: "29.5.2\n",
      stderr: "",
    }),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Backend release host preflight failed.",
  ]);
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("must be staging or prod"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("must not use the local placeholder address"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("must not reuse the local Hardhat bootstrap private key"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("must not point to localhost, 127.0.0.1, or host.docker.internal"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("JWT_SECRET must not use a local/default placeholder value"),
    ),
    true,
  );
});

test("readWindowsDriveFreeBytes falls back to fsutil when PowerShell free-space inspection times out", () => {
  let callCount = 0;
  const freeBytes = readWindowsDriveFreeBytes(
    "C:\\Users\\Administrator\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx",
    (command, args) => {
      callCount += 1;
      if (callCount === 1) {
        assert.equal(command, "powershell");
        return {
          status: null,
          stdout: "",
          stderr: "",
          error: new Error("spawnSync powershell ETIMEDOUT"),
        };
      }

      assert.equal(command, "fsutil");
      assert.deepEqual(args, ["volume", "diskfree", "C:"]);
      return {
        status: 0,
        stdout: [
          "Total free bytes        :  11,428,462,592 ( 10.6 GB)",
          "Total bytes             : 161,061,269,504 (150.0 GB)",
          "Total quota free bytes  :  11,428,462,592 ( 10.6 GB)",
        ].join("\n"),
        stderr: "",
      };
    },
  );

  assert.equal(freeBytes, 11428462592);
});

test("checkDockerCliReachable allows slower Docker Desktop startup probes", () => {
  let timeoutMs = null;
  const result = checkDockerCliReachable((command, args, options) => {
    assert.equal(command, "docker");
    assert.deepEqual(args, ["version", "--format", "{{.Server.Version}}"]);
    timeoutMs = options?.timeoutMs ?? null;
    return {
      status: 0,
      stdout: "29.5.2\n",
      stderr: "",
    };
  });

  assert.equal(timeoutMs, 120000);
  assert.equal(result.ok, true);
  assert.equal(result.message, "Docker engine reachable: 29.5.2");
});

test("readWindowsDriveFreeBytes gives slower Windows free-space checks more time before failing over", () => {
  let timeoutMs = null;
  const freeBytes = readWindowsDriveFreeBytes(
    "C:\\Users\\Administrator\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx",
    (command, args, options) => {
      assert.equal(command, "powershell");
      assert.deepEqual(args, [
        "-NoProfile",
        "-Command",
        "[int64](Get-PSDrive -Name 'C').Free",
      ]);
      timeoutMs = options?.timeoutMs ?? null;
      return {
        status: 0,
        stdout: "38087962624\n",
        stderr: "",
      };
    },
  );

  assert.equal(timeoutMs, 45000);
  assert.equal(freeBytes, 38087962624);
});

function createLogger() {
  return {
    failMessages: [],
    infoMessages: [],
    passMessages: [],
    fail(message) {
      this.failMessages.push(message);
    },
    info(message) {
      this.infoMessages.push(message);
    },
    pass(message) {
      this.passMessages.push(message);
    },
  };
}
