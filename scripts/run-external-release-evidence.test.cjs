const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildExternalReleaseEvidenceRerunCommand,
  parseArgs,
  runExternalReleaseEvidence,
} = require("./run-external-release-evidence.cjs");

test("parseArgs resolves external evidence env, proposition, secret rotation, and rollout flags", () => {
  const parsed = parseArgs([
    "--env-file",
    "config/staging.env",
    "--previous-env",
    "config/staging.previous.env",
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "staging-token",
    "--proposition-id",
    "prop_staging_1",
    "--operator-monitoring-proof",
    "--validation-deploy",
    "--validation-network",
    "sepolia",
    "--backup-file",
    "validation-rehearsal/db-backups/staging.dump",
    "--backup-label",
    "staging-release",
    "--output",
    "validation-rehearsal/prop_staging_1/external-release-evidence-summary.json",
    "--yes",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(
    parsed.previousEnvPath,
    path.resolve(process.cwd(), "config/staging.previous.env"),
  );
  assert.equal(parsed.baseUrl, "https://arena.example");
  assert.equal(parsed.authToken, "staging-token");
  assert.equal(parsed.propositionId, "prop_staging_1");
  assert.equal(parsed.operatorMonitoringProof, true);
  assert.equal(parsed.validationDeploy, true);
  assert.equal(parsed.validationNetwork, "sepolia");
  assert.equal(
    parsed.backupPath,
    path.resolve(
      process.cwd(),
      "validation-rehearsal/db-backups/staging.dump",
    ),
  );
  assert.equal(parsed.backupLabel, "staging-release");
  assert.equal(
    parsed.outputPath,
    path.resolve(
      process.cwd(),
      "validation-rehearsal/prop_staging_1/external-release-evidence-summary.json",
    ),
  );
  assert.equal(parsed.yes, true);
});

test("buildExternalReleaseEvidenceRerunCommand preserves the external evidence contract", () => {
  assert.equal(
    buildExternalReleaseEvidenceRerunCommand({
      envFilePath: "config/staging.env",
      previousEnvPath: "config/staging.previous.env",
      baseUrl: "https://arena.example",
      authToken: "staging-token",
      propositionId: "prop_staging_1",
      operatorMonitoringProof: true,
      validationDeploy: true,
      validationNetwork: "sepolia",
      backupPath: "validation-rehearsal/db-backups/staging.dump",
      backupLabel: "staging-release",
      skipDatabaseRollback: false,
      skipSecretRotation: false,
      skipSecurityAudits: false,
      yes: true,
    }),
    "pnpm run backend:release:evidence:external -- --env-file config/staging.env --previous-env config/staging.previous.env --base-url https://arena.example --auth-token <operator-token> --proposition-id prop_staging_1 --operator-monitoring-proof --validation-deploy --validation-network sepolia --backup-file validation-rehearsal/db-backups/staging.dump --backup-label staging-release --yes",
  );
});

test("runExternalReleaseEvidence executes rehearsal, rollback, rotation, and audits in order and writes a summary artifact", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-release-evidence-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");
  const outputPath = path.join(
    workspace,
    "validation-rehearsal",
    "prop_staging_1",
    "external-release-evidence-summary.json",
  );
  const backupPath = path.join(
    workspace,
    "validation-rehearsal",
    "db-backups",
    "staging.dump",
  );
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token\n", "utf8");
  fs.writeFileSync(previousEnvPath, "JWT_SECRET=old\n", "utf8");

  const calls = [];
  const logger = createLogger();
  const exitCode = await runExternalReleaseEvidence({
    cwd: workspace,
    envFilePath,
    previousEnvPath,
    baseUrl: "https://arena.example",
    authToken: "staging-token",
    propositionId: "prop_staging_1",
    operatorMonitoringProof: true,
    validationDeploy: true,
    validationNetwork: "sepolia",
    backupPath,
    backupLabel: "staging-release",
    outputPath,
    yes: true,
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
      "backend:release:rehearse:external",
      "backend:db:rollback:rehearse",
      "backend:secrets:rotate:check",
      "backend:security:audit:prod",
      "backend:security:audit:all",
    ],
  );
  assert.deepEqual(calls[0].args, [
    "run",
    "backend:release:rehearse:external",
    "--",
    "--env-file",
    envFilePath,
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "staging-token",
    "--proposition-id",
    "prop_staging_1",
    "--operator-monitoring-proof",
    "--validation-deploy",
    "--validation-network",
    "sepolia",
  ]);
  assert.deepEqual(calls[1].args, [
    "run",
    "backend:db:rollback:rehearse",
    "--",
    "--env-file",
    envFilePath,
    "--backup-file",
    backupPath,
    "--backup-label",
    "staging-release",
    "--yes",
  ]);
  assert.deepEqual(calls[2].args, [
    "run",
    "backend:secrets:rotate:check",
    "--",
    "--previous-env",
    previousEnvPath,
    "--current-env",
    envFilePath,
    "--output",
    path.join(workspace, "validation-local", "secret-rotation-audit.json"),
  ]);
  assert.deepEqual(calls[3].args, [
    "run",
    "backend:security:audit:prod",
    "--",
    "--output",
    path.join(workspace, "validation-local", "dependency-audit-prod.json"),
  ]);
  assert.deepEqual(calls[4].args, [
    "run",
    "backend:security:audit:all",
    "--",
    "--output",
    path.join(workspace, "validation-local", "dependency-audit-all.json"),
  ]);

  const summary = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(summary.propositionId, "prop_staging_1");
  assert.equal(summary.baseUrl, "https://arena.example");
  assert.equal(summary.artifacts.rollbackBackup, backupPath);
  assert.equal(
    summary.artifacts.operatorMonitoringProof,
    path.join(workspace, "validation-local", "runtime-contract-operator-proof.json"),
  );
  assert.equal(
    logger.passMessages.includes(
      `External release evidence capture completed for proposition prop_staging_1. Summary: ${outputPath}`,
    ),
    true,
  );
});

test("runExternalReleaseEvidence can skip rollback, secret rotation, and dependency audits for a proof-only rerun", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-release-evidence-skip-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token\n", "utf8");

  const calls = [];
  const exitCode = await runExternalReleaseEvidence({
    cwd: workspace,
    envFilePath,
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_2",
    skipDatabaseRollback: true,
    skipSecretRotation: true,
    skipSecurityAudits: true,
    runCommand(command) {
      calls.push(command.label);
      return { status: 0 };
    },
    logger: createLogger(),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, ["backend:release:rehearse:external"]);
});

test("runExternalReleaseEvidence requires previous env evidence unless secret rotation is explicitly skipped", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-release-evidence-missing-previous-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token\n", "utf8");
  const logger = createLogger();

  const exitCode = await runExternalReleaseEvidence({
    cwd: workspace,
    envFilePath,
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_3",
    skipDatabaseRollback: true,
    logger,
    runCommand() {
      throw new Error("runCommand should not be called when previous env is missing");
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "External release evidence capture requires --previous-env <path> unless --skip-secret-rotation is set.",
  ]);
});

test("runExternalReleaseEvidence preserves the full contract in rerun guidance after a later-step failure", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-release-evidence-rerun-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");
  const backupPath = path.join(
    workspace,
    "validation-rehearsal",
    "db-backups",
    "staging.dump",
  );
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token\n", "utf8");
  fs.writeFileSync(previousEnvPath, "JWT_SECRET=old\n", "utf8");
  const logger = createLogger();

  const exitCode = await runExternalReleaseEvidence({
    cwd: workspace,
    envFilePath,
    previousEnvPath,
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_4",
    operatorMonitoringProof: true,
    backupPath,
    yes: true,
    logger,
    runCommand(command) {
      return {
        status: command.label === "backend:secrets:rotate:check" ? 1 : 0,
      };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    `External release evidence capture stopped at backend:secrets:rotate:check. Fix the failing command above, then rerun pnpm run backend:release:evidence:external -- --env-file ${envFilePath} --previous-env ${previousEnvPath} --base-url https://arena.example --proposition-id prop_staging_4 --operator-monitoring-proof --backup-file ${backupPath} --yes.`,
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
