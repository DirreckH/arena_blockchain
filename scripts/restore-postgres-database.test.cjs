const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createResetSchemaCommand,
  createRestoreCommand,
  createTerminateConnectionsCommand,
  parseArgs,
  runPostgresRestore,
} = require("./restore-postgres-database.cjs");

test("parseArgs resolves restore input, env file, and destructive confirmation", () => {
  const parsed = parseArgs([
    "--",
    "--env-file",
    "config/staging.env",
    "--input",
    "snapshots/arena.dump",
    "--maintenance-database",
    "postgres",
    "--yes",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(
    parsed.inputPath,
    path.resolve(process.cwd(), "snapshots/arena.dump"),
  );
  assert.equal(parsed.maintenanceDatabase, "postgres");
  assert.equal(parsed.yes, true);
});

test("restore command builders keep secrets in env instead of command args", () => {
  const baseOptions = {
    cwd: path.resolve(__dirname, ".."),
    databaseUrl:
      "postgresql://arena:super-secret@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
    env: {},
    inputPath: "F:/arena.dump",
    maintenanceDatabase: "postgres",
  };

  const terminateCommand = createTerminateConnectionsCommand(baseOptions);
  const resetCommand = createResetSchemaCommand(baseOptions);
  const restoreCommand = createRestoreCommand(baseOptions);

  assert.equal(terminateCommand.command, "psql");
  assert.equal(resetCommand.command, "psql");
  assert.equal(restoreCommand.command, "pg_restore");
  assert.equal(restoreCommand.args.includes("--dbname"), true);
  assert.equal(restoreCommand.args.includes("arena"), true);
  assert.equal(terminateCommand.env.PGDATABASE, "postgres");
  assert.equal(resetCommand.env.PGDATABASE, "arena");
  assert.equal(restoreCommand.env.PGPASSWORD, "super-secret");
  assert.equal(
    [...terminateCommand.args, ...resetCommand.args, ...restoreCommand.args].some(
      (argument) => /super-secret/u.test(argument),
    ),
    false,
  );
});

test("runPostgresRestore executes terminate, reset, and restore in order", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-restore-script-"),
  );
  const envFilePath = path.join(workspace, ".env");
  const inputPath = path.join(workspace, "snapshots", "arena.dump");
  fs.mkdirSync(path.dirname(inputPath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    "DATABASE_URL=postgresql://arena:secret@127.0.0.1:5432/arena?schema=public&connect_timeout=5\n",
    "utf8",
  );
  fs.writeFileSync(inputPath, "backup", "utf8");

  const calls = [];
  const logger = createLogger();
  const result = await runPostgresRestore({
    cwd: workspace,
    envFilePath,
    inputPath,
    logger,
    yes: true,
    runCommand(command) {
      calls.push({
        args: [...command.args],
        env: {
          PGDATABASE: command.env.PGDATABASE,
          PGPASSWORD: command.env.PGPASSWORD,
        },
        label: command.label,
      });
      return { status: 0 };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    calls.map((entry) => entry.label),
    [
      "postgres:terminate-connections",
      "postgres:reset-schema",
      "postgres:restore",
    ],
  );
  assert.equal(calls[0].env.PGDATABASE, "postgres");
  assert.equal(calls[1].env.PGDATABASE, "arena");
  assert.equal(calls[2].env.PGPASSWORD, "secret");
  assert.equal(
    logger.passMessages.includes(
      `Database restore completed from ${inputPath}.`,
    ),
    true,
  );
});

test("runPostgresRestore requires explicit destructive confirmation", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-restore-confirmation-"),
  );
  const inputPath = path.join(workspace, "arena.dump");
  fs.writeFileSync(inputPath, "backup", "utf8");

  const logger = createLogger();
  const result = await runPostgresRestore({
    cwd: workspace,
    inputPath,
    logger,
    runCommand() {
      throw new Error("restore should not start without --yes");
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(logger.failMessages, [
    "PostgreSQL restore is destructive. Re-run with --yes after confirming the target database can be replaced from backup.",
  ]);
});

test("runPostgresRestore falls back to dockerized PostgreSQL tools when host clients are unavailable", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-restore-docker-fallback-"),
  );
  const envFilePath = path.join(workspace, ".env");
  const inputPath = path.join(workspace, "snapshots", "arena.dump");
  fs.mkdirSync(path.dirname(inputPath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    "DATABASE_URL=postgresql://arena:secret@127.0.0.1:5432/arena?schema=public&connect_timeout=5\n",
    "utf8",
  );
  fs.writeFileSync(inputPath, "backup", "utf8");

  const logger = createLogger();
  const dockerCalls = [];
  const result = await runPostgresRestore({
    cwd: workspace,
    envFilePath,
    inputPath,
    logger,
    yes: true,
    runCommand() {
      return {
        error: { code: "ENOENT" },
        status: 1,
      };
    },
    runDockerCommand(command) {
      dockerCalls.push(command);
      return { status: 0 };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    dockerCalls.map((command) => command.label),
    [
      "postgres:terminate-connections:docker",
      "postgres:reset-schema:docker",
      "postgres:restore:docker",
    ],
  );
  assert.equal(dockerCalls[0].args.includes("arena-postgres"), true);
  assert.equal(dockerCalls[2].stdinPath, inputPath);
  assert.equal(
    logger.infoMessages.some((message) =>
      /Retrying via Docker container `arena-postgres`/u.test(message),
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
