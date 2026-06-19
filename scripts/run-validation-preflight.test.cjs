const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  buildValidationPreflightRerunCommand,
  parseArgs,
  runValidationPreflight,
} = require("./run-validation-preflight.cjs");

test("parseArgs resolves env-file and check-api options", () => {
  const parsed = parseArgs([
    "--env-file",
    "config/staging.env",
    "--check-api",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(parsed.checkApi, true);
});

test("parseArgs resolves optional deploy-validation controls", () => {
  const parsed = parseArgs([
    "--env-file",
    "config/staging.env",
    "--deploy-validation",
    "--network",
    "validation",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(parsed.deployValidation, true);
  assert.equal(parsed.network, "validation");
});

test("parseArgs ignores a pnpm forwarded bare double-dash separator", () => {
  const parsed = parseArgs([
    "--",
    "--env-file",
    "config/staging.env",
    "--check-api",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(parsed.checkApi, true);
});

test("buildValidationPreflightRerunCommand keeps optional flags aligned with the invoked preflight", () => {
  assert.equal(
    buildValidationPreflightRerunCommand({
      envFilePath: "config/staging.env",
      checkApi: true,
      deployValidation: true,
      network: "sepolia",
    }),
    "pnpm run validation:preflight -- --env-file config/staging.env --check-api --deploy-validation --network sepolia",
  );
});

test("runValidationPreflight executes validation env, deps, and chain checks in order", async () => {
  const workspace = path.resolve(__dirname, "..");
  const calls = [];
  const logger = createLogger();

  const exitCode = await runValidationPreflight({
    cwd: workspace,
    envFilePath: path.join(workspace, "config", "staging.env"),
    checkApi: true,
    logger,
    runCommand(command) {
      calls.push({
        label: command.label,
        command: command.command,
        args: [...command.args],
      });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.label),
    [
      "validation:env:check",
      "validation:deps:check",
      "validation:chain:check",
    ],
  );
  assert.deepEqual(calls[0].args, [
    "run",
    "validation:env:check",
    "--",
    "--env-file",
    path.join(workspace, "config", "staging.env"),
  ]);
  assert.deepEqual(calls[1].args, [
    "run",
    "validation:deps:check",
    "--",
    "--env-file",
    path.join(workspace, "config", "staging.env"),
    "--check-api",
  ]);
  assert.deepEqual(calls[2].args, [
    "run",
    "validation:chain:check",
    "--",
    "--env-file",
    path.join(workspace, "config", "staging.env"),
  ]);
  assert.deepEqual(logger.passMessages, [
    "Validation preflight completed successfully.",
  ]);
});

test("runValidationPreflight stops on the first failing check", async () => {
  const calls = [];
  const logger = createLogger();

  const exitCode = await runValidationPreflight({
    cwd: path.resolve(__dirname, ".."),
    envFilePath: path.resolve(__dirname, "..", "config", "staging.env"),
    logger,
    runCommand(command) {
      calls.push(command.label);
      return { status: command.label === "validation:deps:check" ? 1 : 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [
    "validation:env:check",
    "validation:deps:check",
  ]);
  assert.deepEqual(logger.failMessages, [
    `Validation preflight stopped at validation:deps:check. Fix the failing command above, then rerun pnpm run validation:preflight -- --env-file ${path.resolve(__dirname, "..", "config", "staging.env")}.`,
  ]);
});

test("runValidationPreflight preserves optional flags in rerun guidance", async () => {
  const workspace = path.resolve(__dirname, "..");
  const envFilePath = path.join(workspace, "config", "staging.env");
  const logger = createLogger();

  const exitCode = await runValidationPreflight({
    cwd: workspace,
    envFilePath,
    checkApi: true,
    deployValidation: true,
    network: "sepolia",
    logger,
    runCommand(command) {
      return { status: command.label === "validation:chain:check" ? 1 : 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    `Validation preflight stopped at validation:chain:check. Fix the failing command above, then rerun pnpm run validation:preflight -- --env-file ${envFilePath} --check-api --deploy-validation --network sepolia.`,
  ]);
});

test("runValidationPreflight can deploy the validation contract before the final chain check", async () => {
  const workspace = path.resolve(__dirname, "..");
  const calls = [];
  const logger = createLogger();

  const exitCode = await runValidationPreflight({
    cwd: workspace,
    envFilePath: path.join(workspace, "config", "staging.env"),
    deployValidation: true,
    network: "validation",
    logger,
    runCommand(command) {
      calls.push({
        label: command.label,
        args: [...command.args],
      });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.label),
    [
      "validation:env:check",
      "validation:deps:check",
      "validation:deploy",
      "validation:chain:check",
    ],
  );
  assert.deepEqual(calls[2].args, [
    "run",
    "validation:deploy",
    "--",
    "--env-file",
    path.join(workspace, "config", "staging.env"),
    "--network",
    "validation",
  ]);
});

test("runValidationPreflight fails honestly when deploy-validation omits the network", async () => {
  const logger = createLogger();
  const exitCode = await runValidationPreflight({
    cwd: path.resolve(__dirname, ".."),
    envFilePath: path.resolve(__dirname, "..", "config", "staging.env"),
    deployValidation: true,
    logger,
    runCommand() {
      throw new Error("runCommand should not execute when deploy network is missing");
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Validation preflight with deployment requires --network <name>. Use localhost for local rehearsal or validation for the non-local RPC-backed deploy alias.",
  ]);
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
