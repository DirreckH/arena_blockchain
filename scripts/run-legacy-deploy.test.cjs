const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildLegacyDeployRerunCommand,
  defaultLegacyDeployOutputPath,
  defaultShouldWriteLegacyEnvFile,
  parseArgs,
  runLegacyDeploy,
} = require("./run-legacy-deploy.cjs");

test("parseArgs resolves env-file, network, output, and write-env options", () => {
  const parsed = parseArgs([
    "--env-file",
    "config/staging.env",
    "--network",
    "validation",
    "--output",
    "artifacts/deployment.legacy.json",
    "--write-env",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(parsed.network, "validation");
  assert.equal(
    parsed.outputPath,
    path.resolve(process.cwd(), "artifacts/deployment.legacy.json"),
  );
  assert.equal(parsed.writeEnv, true);
});

test("parseArgs ignores a pnpm forwarded bare double-dash separator", () => {
  const parsed = parseArgs([
    "--",
    "--env-file",
    "config/staging.env",
    "--network",
    "validation",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(parsed.network, "validation");
});

test("defaultLegacyDeployOutputPath keeps localhost on the historical root artifact path", () => {
  const workspace = path.resolve(__dirname, "..");
  assert.equal(
    defaultLegacyDeployOutputPath(workspace, "localhost"),
    path.resolve(workspace, "deployment.json"),
  );
});

test("defaultLegacyDeployOutputPath isolates non-local deployment evidence by network", () => {
  const workspace = path.resolve(__dirname, "..");
  assert.equal(
    defaultLegacyDeployOutputPath(workspace, "validation"),
    path.resolve(
      workspace,
      "validation-rehearsal",
      "deployments",
      "deployment.legacy.validation.json",
    ),
  );
});

test("defaultShouldWriteLegacyEnvFile only auto-updates the root local env for localhost deploys", () => {
  const workspace = path.resolve(__dirname, "..");
  assert.equal(
    defaultShouldWriteLegacyEnvFile({
      cwd: workspace,
      envFilePath: path.resolve(workspace, ".env"),
      network: "localhost",
    }),
    true,
  );
  assert.equal(
    defaultShouldWriteLegacyEnvFile({
      cwd: workspace,
      envFilePath: path.resolve(workspace, "config", "staging.env"),
      network: "validation",
    }),
    false,
  );
});

test("buildLegacyDeployRerunCommand keeps optional deploy flags aligned with the invoked deploy", () => {
  assert.equal(
    buildLegacyDeployRerunCommand({
      envFilePath: "config/staging.env",
      network: "validation",
      outputPath: "artifacts/deployment.legacy.json",
      writeEnv: true,
    }),
    "pnpm run legacy:deploy -- --env-file config/staging.env --network validation --output artifacts/deployment.legacy.json --write-env",
  );
});

test("runLegacyDeploy passes env-file and deployment output controls into the hardhat child process", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-legacy-deploy-wrapper-"),
  );
  const logger = createLogger();
  const calls = [];
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111",
      "RPC_URL=https://rpc.example",
      "CHAIN_ID=8453",
      "",
    ].join("\n"),
    "utf8",
  );

  const exitCode = await runLegacyDeploy({
    cwd: workspace,
    envFilePath,
    network: "validation",
    logger,
    runCommand(command) {
      calls.push(command);
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].label, "legacy:deploy");
  assert.deepEqual(calls[0].args, [
    "exec",
    "hardhat",
    "run",
    "scripts/deploy.cjs",
    "--network",
    "validation",
  ]);
  assert.equal(calls[0].env.ARENA_DEPLOY_ENV_FILE, envFilePath);
  assert.equal(calls[0].env.ARENA_DEPLOY_WRITE_ENV, "0");
  assert.equal(calls[0].env.ARENA_DEPLOY_OUTPUT_PATH, path.resolve(
    workspace,
    "validation-rehearsal",
    "deployments",
    "deployment.legacy.validation.json",
  ));
  assert.equal(calls[0].env.RPC_URL, "https://rpc.example");
  assert.equal(calls[0].env.CHAIN_ID, "8453");
  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Legacy Arena deploy completed for network validation.",
  ]);
});

test("runLegacyDeploy fails honestly when network is missing", async () => {
  const logger = createLogger();
  const exitCode = await runLegacyDeploy({
    cwd: path.resolve(__dirname, ".."),
    logger,
    requireEnvFile: false,
    runCommand() {
      throw new Error("runCommand should not be reached without a network");
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Legacy Arena deployment requires --network <name>. Use localhost for local rehearsal or validation for the non-local RPC-backed deploy alias.",
  ]);
});

test("runLegacyDeploy fails honestly when a non-local deploy env omits the deployer private key", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-legacy-deploy-wrapper-missing-key-"),
  );
  const logger = createLogger();
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "RPC_URL=https://rpc.example",
      "CHAIN_ID=8453",
      "",
    ].join("\n"),
    "utf8",
  );

  const exitCode = await runLegacyDeploy({
    cwd: workspace,
    envFilePath,
    network: "validation",
    logger,
    runCommand() {
      throw new Error("runCommand should not execute when deployer config is incomplete");
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Legacy Arena deployment for non-local networks requires ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY or PRIVATE_KEY in the selected env file.",
  ]);
});

test("runLegacyDeploy preserves env-file and output controls in rerun guidance", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-legacy-deploy-wrapper-rerun-"),
  );
  const logger = createLogger();
  const envFilePath = path.join(workspace, "config", "staging.env");
  const outputPath = path.join(workspace, "artifacts", "deployment.legacy.staging.json");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111",
      "RPC_URL=https://rpc.example",
      "CHAIN_ID=8453",
      "",
    ].join("\n"),
    "utf8",
  );

  const exitCode = await runLegacyDeploy({
    cwd: workspace,
    envFilePath,
    network: "validation",
    outputPath,
    writeEnv: false,
    logger,
    runCommand() {
      return { status: 1 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    `Legacy Arena deploy failed for network validation. Fix the failing command above, then rerun pnpm run legacy:deploy -- --env-file ${envFilePath} --network validation --output ${outputPath} --no-write-env.`,
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
