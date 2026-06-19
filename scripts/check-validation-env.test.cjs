const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const SCRIPT_PATH = path.resolve(__dirname, "check-validation-env.cjs");
const VALID_PRIVATE_KEY =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

test("check-validation-env allows local validation envs without reward payout config", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-check-validation-env-local-"),
  );

  fs.writeFileSync(
    path.join(workspace, ".env"),
    [
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000001",
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000002",
      "ARENA_VALIDATION_SYNC_CONFIRMATIONS=1",
      "ARENA_VALIDATION_SYNC_BATCH_SIZE=500",
      "ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS=15000",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      "",
    ].join("\n"),
  );

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: Validation-chain env is complete enough/u);
  assert.doesNotMatch(result.stdout, /reward payout token:/u);
});

test("check-validation-env blocks non-local envs when reward payout config is missing", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-check-validation-env-staging-"),
  );

  fs.writeFileSync(
    path.join(workspace, ".env"),
    [
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=https://rpc.example",
      "CHAIN_ID=8453",
      "ARENA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000001",
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000002",
      "ARENA_VALIDATION_SYNC_CONFIRMATIONS=12",
      "ARENA_VALIDATION_SYNC_BATCH_SIZE=500",
      "ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS=15000",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      "",
    ].join("\n"),
  );

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(
    output,
    /ARENA_REWARD_PAYOUT_ERC20_ADDRESS is required for reward payout staging\/testnet integration/u,
  );
  assert.match(
    output,
    /ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY is required for reward payout staging\/testnet integration/u,
  );
});

test("check-validation-env blocks non-local envs when validation signer roles reuse the same private key", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-check-validation-env-signer-reuse-"),
  );

  fs.writeFileSync(
    path.join(workspace, ".env"),
    [
      "DATABASE_URL=postgresql://arena:arena@db.example:5432/arena?schema=public&connect_timeout=5",
      "REDIS_URL=redis://redis.example:6379/0",
      "RPC_URL=https://rpc.example",
      "CHAIN_ID=8453",
      "ARENA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000011",
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000022",
      "ARENA_VALIDATION_SYNC_CONFIRMATIONS=12",
      "ARENA_VALIDATION_SYNC_BATCH_SIZE=500",
      "ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS=15000",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x0000000000000000000000000000000000000033",
      `ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      "",
    ].join("\n"),
  );

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(
    output,
    /ARENA_VALIDATION_OPERATOR_PRIVATE_KEY, ARENA_VALIDATION_ORACLE_PRIVATE_KEY, and ARENA_VALIDATION_PAUSER_PRIVATE_KEY must derive three distinct signer addresses outside local validation\./u,
  );
});

test("check-validation-env blocks non-local envs when RPC_URL still points at localhost", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-check-validation-env-local-rpc-"),
  );
  const ORACLE_PRIVATE_KEY =
    "0x2222222222222222222222222222222222222222222222222222222222222222";
  const PAUSER_PRIVATE_KEY =
    "0x3333333333333333333333333333333333333333333333333333333333333333";

  fs.writeFileSync(
    path.join(workspace, ".env"),
    [
      "DATABASE_URL=postgresql://arena:arena@db.example:5432/arena?schema=public&connect_timeout=5",
      "REDIS_URL=redis://redis.example:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=8453",
      "ARENA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000011",
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000022",
      "ARENA_VALIDATION_SYNC_CONFIRMATIONS=12",
      "ARENA_VALIDATION_SYNC_BATCH_SIZE=500",
      "ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS=15000",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${ORACLE_PRIVATE_KEY}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${PAUSER_PRIVATE_KEY}`,
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x0000000000000000000000000000000000000033",
      "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=0x4444444444444444444444444444444444444444444444444444444444444444",
      "",
    ].join("\n"),
  );

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(
    output,
    /RPC_URL must not point to localhost, 127\.0\.0\.1, or host\.docker\.internal outside local validation\./u,
  );
});

test("check-validation-env loads a selected env file instead of the workspace root .env", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-check-validation-env-explicit-file-"),
  );

  fs.writeFileSync(
    path.join(workspace, ".env"),
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "",
    ].join("\n"),
  );

  const envFilePath = path.join(workspace, "config", "release.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000001",
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000002",
      "ARENA_VALIDATION_SYNC_CONFIRMATIONS=1",
      "ARENA_VALIDATION_SYNC_BATCH_SIZE=500",
      "ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS=15000",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${VALID_PRIVATE_KEY}`,
      "",
    ].join("\n"),
  );

  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--env-file", "config/release.env"],
    {
      cwd: workspace,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Loaded \.env from config\/release\.env/u);
  assert.match(output, /validation environment: local/u);
});
