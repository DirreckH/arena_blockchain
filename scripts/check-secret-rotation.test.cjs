const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  checkSecretRotation,
  parseArgs,
} = require("./check-secret-rotation.cjs");

const PREVIOUS_PRIVATE_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CURRENT_OPERATOR_PRIVATE_KEY =
  "0x1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CURRENT_ORACLE_PRIVATE_KEY =
  "0x2123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CURRENT_PAUSER_PRIVATE_KEY =
  "0x3123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CURRENT_PAYOUT_PRIVATE_KEY =
  "0x4123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const HARDHAT_LOCAL_ADMIN_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

test("parseArgs resolves current env, previous env, and output paths", () => {
  const parsed = parseArgs([
    "--",
    "--env-file",
    "envs/current.env",
    "--previous-env",
    "envs/previous.env",
    "--output",
    "reports/secret-rotation.json",
  ]);

  assert.equal(
    parsed.currentEnvPath,
    path.resolve(process.cwd(), "envs/current.env"),
  );
  assert.equal(
    parsed.previousEnvPath,
    path.resolve(process.cwd(), "envs/previous.env"),
  );
  assert.equal(
    parsed.outputPath,
    path.resolve(process.cwd(), "reports/secret-rotation.json"),
  );
});

test("checkSecretRotation writes a fingerprint-only audit report when secrets were rotated", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-secret-rotation-pass-"),
  );
  const previousEnvPath = path.join(workspace, "previous.env");
  const currentEnvPath = path.join(workspace, "current.env");
  const outputPath = path.join(workspace, "reports", "secret-rotation.json");

  fs.writeFileSync(
    previousEnvPath,
    [
      "JWT_SECRET=previous-secret-value-123456",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY.replace(/^0x/u, "0x52")}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY.replace(/^0x/u, "0x62")}`,
      `ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY.replace(/^0x/u, "0x72")}`,
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=old-token",
      "REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS=ops:old-requester-token",
      "ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS=pager:old-ops-token",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    currentEnvPath,
    [
      "JWT_SECRET=current-secret-value-123456",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${CURRENT_OPERATOR_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${CURRENT_ORACLE_PRIVATE_KEY}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${CURRENT_PAUSER_PRIVATE_KEY}`,
      `ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=${CURRENT_PAYOUT_PRIVATE_KEY}`,
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=new-token",
      "REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS=ops:new-requester-token",
      "ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS=pager:new-ops-token",
      "ARENA_VALIDATION_OPERATOR_ADDRESS=0x1111111111111111111111111111111111111111",
      "",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await checkSecretRotation({
    currentEnvPath,
    cwd: workspace,
    logger,
    now: new Date("2026-06-07T14:00:00.000Z"),
    outputPath,
    previousEnvPath,
  });

  assert.equal(exitCode, 0);
  const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(report.secretSummaries.length >= 6, true);
  assert.equal(JSON.stringify(report).includes("current-secret-value-123456"), false);
  assert.equal(JSON.stringify(report).includes("new-token"), false);
  assert.equal(
    logger.passMessages.includes("Secret rotation audit passed."),
    true,
  );
});

test("checkSecretRotation fails when secrets are unchanged or local bootstrap keys are reused", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-secret-rotation-fail-"),
  );
  const previousEnvPath = path.join(workspace, "previous.env");
  const currentEnvPath = path.join(workspace, "current.env");

  fs.writeFileSync(
    previousEnvPath,
    [
      "JWT_SECRET=same-secret-value-123456",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY}`,
      `ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY}`,
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=same-token",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    currentEnvPath,
    [
      "JWT_SECRET=same-secret-value-123456",
      `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=${HARDHAT_LOCAL_ADMIN_PRIVATE_KEY}`,
      `ARENA_VALIDATION_ORACLE_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY}`,
      `ARENA_VALIDATION_PAUSER_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY}`,
      `ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=${PREVIOUS_PRIVATE_KEY}`,
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=same-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await checkSecretRotation({
    currentEnvPath,
    cwd: workspace,
    logger,
    previousEnvPath,
  });

  assert.equal(exitCode, 1);
  assert.equal(
    logger.failMessages.some((message) =>
      /JWT_SECRET did not change/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.failMessages.some((message) =>
      /still uses the local Hardhat bootstrap private key/u.test(message),
    ),
    true,
  );
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
