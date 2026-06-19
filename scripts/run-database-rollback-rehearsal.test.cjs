const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseArgs,
  runDatabaseRollbackRehearsal,
} = require("./run-database-rollback-rehearsal.cjs");

test("parseArgs resolves env file, backup file, and destructive confirmation", () => {
  const parsed = parseArgs([
    "--",
    "--env-file",
    "config/staging.env",
    "--backup-file",
    "snapshots/arena.dump",
    "--backup-label",
    "staging",
    "--yes",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(
    parsed.backupPath,
    path.resolve(process.cwd(), "snapshots/arena.dump"),
  );
  assert.equal(parsed.backupLabel, "staging");
  assert.equal(parsed.yes, true);
});

test("runDatabaseRollbackRehearsal captures a snapshot, verifies migrations, and restores it", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-rollback-rehearsal-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, "DATABASE_URL=test\n", "utf8");

  const backupPath = path.join(workspace, "snapshots", "arena.dump");
  const calls = [];
  const logger = createLogger();
  const exitCode = await runDatabaseRollbackRehearsal({
    backupPath,
    cwd: workspace,
    envFilePath,
    logger,
    yes: true,
    runCommand(command) {
      calls.push({
        args: [...command.args],
        label: command.label,
      });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((entry) => entry.label),
    [
      "backend:db:backup",
      "api:prisma:deploy",
      "validation:db:deploy",
      "validation:db:status",
      "backend:db:restore",
    ],
  );
  assert.deepEqual(calls[0].args, [
    "run",
    "backend:db:backup",
    "--",
    "--env-file",
    envFilePath,
    "--output",
    backupPath,
    "--label",
    "rollback-rehearsal",
    "--overwrite",
  ]);
  assert.deepEqual(calls[1].args, [
    "run",
    "api:prisma:deploy",
    "--",
    "--env-file",
    envFilePath,
  ]);
  assert.deepEqual(calls[2].args, [
    "run",
    "validation:db:deploy",
    "--",
    "--env-file",
    envFilePath,
  ]);
  assert.deepEqual(calls[3].args, [
    "run",
    "validation:db:status",
    "--",
    "--env-file",
    envFilePath,
  ]);
  assert.deepEqual(calls.at(-1).args, [
    "run",
    "backend:db:restore",
    "--",
    "--env-file",
    envFilePath,
    "--input",
    backupPath,
    "--yes",
  ]);
  assert.equal(
    logger.passMessages.includes(
      `Rollback rehearsal completed and restored the pre-rehearsal snapshot from ${backupPath}.`,
    ),
    true,
  );
});

test("runDatabaseRollbackRehearsal restores the captured snapshot before surfacing a migration failure", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-rollback-rehearsal-failure-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, "DATABASE_URL=test\n", "utf8");

  const calls = [];
  const logger = createLogger();
  const exitCode = await runDatabaseRollbackRehearsal({
    cwd: workspace,
    envFilePath,
    logger,
    yes: true,
    runCommand(command) {
      calls.push(command.label);
      return {
        status: command.label === "validation:db:deploy" ? 1 : 0,
      };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [
    "backend:db:backup",
    "api:prisma:deploy",
    "validation:db:deploy",
    "backend:db:restore",
  ]);
  assert.equal(
    logger.failMessages.includes(
      `Rollback rehearsal failed at validation:db:deploy, but the pre-rehearsal snapshot was restored from ${path.join(workspace, "validation-rehearsal", "db-backups", "rollback-rehearsal.dump")}`.replace(
        `${path.join(workspace, "validation-rehearsal", "db-backups", "rollback-rehearsal.dump")}`,
        logger.failMessages[0]?.match(/from (.+)\./u)?.[1] || "",
      ),
    ),
    false,
  );
  assert.equal(
    logger.failMessages.some((message) =>
      /Rollback rehearsal failed at validation:db:deploy, but the pre-rehearsal snapshot was restored from .+\.dump/u.test(
        message,
      ),
    ),
    true,
  );
});

test("runDatabaseRollbackRehearsal requires explicit destructive confirmation", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-rollback-rehearsal-confirm-"),
  );
  const logger = createLogger();
  const exitCode = await runDatabaseRollbackRehearsal({
    cwd: workspace,
    logger,
    runCommand() {
      throw new Error("rehearsal should not start without --yes");
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Rollback rehearsal will restore the target database snapshot. Re-run with --yes after confirming the environment is safe for a destructive drill.",
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
