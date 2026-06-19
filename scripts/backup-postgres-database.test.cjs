const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createBackupCommand,
  createDockerBackupCommand,
  parseArgs,
  runPostgresBackup,
} = require("./backup-postgres-database.cjs");

test("parseArgs resolves backup env, output path, label, and overwrite flag", () => {
  const parsed = parseArgs([
    "--",
    "--env-file",
    "config/staging.env",
    "--output",
    "tmp/arena.dump",
    "--label",
    "staging-drill",
    "--overwrite",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(parsed.outputPath, path.resolve(process.cwd(), "tmp/arena.dump"));
  assert.equal(parsed.label, "staging-drill");
  assert.equal(parsed.overwrite, true);
});

test("createBackupCommand renders a safe pg_dump invocation without embedding secrets in args", () => {
  const command = createBackupCommand({
    cwd: path.resolve(__dirname, ".."),
    databaseUrl:
      "postgresql://arena:super-secret@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
    env: {},
    outputPath: "F:/arena.dump",
  });

  assert.equal(command.command, "pg_dump");
  assert.deepEqual(command.args, [
    "--format=custom",
    "--file",
    "F:/arena.dump",
    "--schema",
    "public",
    "--no-owner",
    "--no-privileges",
  ]);
  assert.equal(command.env.PGHOST, "127.0.0.1");
  assert.equal(command.env.PGDATABASE, "arena");
  assert.equal(command.env.PGPASSWORD, "super-secret");
  assert.equal(command.env.PGCONNECT_TIMEOUT, "5");
  assert.equal(command.args.some((argument) => /super-secret/u.test(argument)), false);
});

test("createDockerBackupCommand streams the archive to stdout instead of a container-local file", () => {
  const command = createDockerBackupCommand({
    cwd: path.resolve(__dirname, ".."),
    databaseUrl:
      "postgresql://arena:super-secret@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
    env: {},
    outputPath: "F:/arena.dump",
  });

  assert.equal(command.command, "docker");
  assert.equal(command.args.includes("arena-postgres"), true);
  assert.equal(command.args.includes("pg_dump"), true);
  assert.equal(command.args.includes("--format=custom"), true);
  assert.equal(command.args.some((argument) => argument === "--file"), false);
  assert.equal(command.args.some((argument) => argument === "--file=-"), false);
  assert.equal(command.args.some((argument) => argument === "F:/arena.dump"), false);
  assert.equal(command.args.some((argument) => argument === "-e"), true);
});

test("runPostgresBackup writes metadata after a successful backup", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-backup-script-"),
  );
  const envFilePath = path.join(workspace, ".env");
  const outputPath = path.join(workspace, "snapshots", "arena.dump");
  fs.writeFileSync(
    envFilePath,
    "DATABASE_URL=postgresql://arena:secret@127.0.0.1:5432/arena?schema=public&connect_timeout=5\n",
    "utf8",
  );

  const logger = createLogger();
  const result = await runPostgresBackup({
    cwd: workspace,
    envFilePath,
    logger,
    now: new Date("2026-06-07T10:00:00.000Z"),
    outputPath,
    runCommand(command) {
      assert.equal(command.command, "pg_dump");
      assert.equal(command.env.PGHOST, "127.0.0.1");
      assert.equal(command.env.PGDATABASE, "arena");
      assert.equal(command.env.PGPASSWORD, "secret");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, "backup", "utf8");
      return { status: 0 };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.outputPath, outputPath);
  assert.equal(fs.existsSync(result.metadataPath), true);
  const metadata = JSON.parse(fs.readFileSync(result.metadataPath, "utf8"));
  assert.equal(metadata.database.maskedDatabaseUrl.includes("***"), true);
  assert.equal(metadata.database.schema, "public");
  assert.equal(
    logger.passMessages.includes(`Database backup created at ${outputPath}`),
    true,
  );
});

test("runPostgresBackup fails honestly when DATABASE_URL is missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-backup-missing-db-url-"),
  );
  const envFilePath = path.join(workspace, ".env");
  fs.writeFileSync(envFilePath, "JWT_SECRET=test\n", "utf8");

  const logger = createLogger();
  const result = await runPostgresBackup({
    cwd: workspace,
    envFilePath,
    logger,
    runCommand() {
      throw new Error("runCommand should not be reached without DATABASE_URL");
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(logger.failMessages, [
    "Missing DATABASE_URL. Provide --database-url <postgres-url> or set DATABASE_URL in the selected env file.",
  ]);
});

test("runPostgresBackup falls back to docker when pg_dump is unavailable on the host", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-backup-docker-fallback-"),
  );
  const envFilePath = path.join(workspace, ".env");
  const outputPath = path.join(workspace, "snapshots", "arena.dump");
  fs.writeFileSync(
    envFilePath,
    "DATABASE_URL=postgresql://arena:secret@127.0.0.1:5432/arena?schema=public&connect_timeout=5\n",
    "utf8",
  );

  const logger = createLogger();
  const dockerCalls = [];
  const result = await runPostgresBackup({
    cwd: workspace,
    envFilePath,
    logger,
    outputPath,
    runCommand() {
      return {
        error: { code: "ENOENT" },
        status: 1,
      };
    },
    runDockerCommand(command) {
      dockerCalls.push(command);
      fs.mkdirSync(path.dirname(command.outputPath), { recursive: true });
      fs.writeFileSync(command.outputPath, "backup", "utf8");
      return { status: 0 };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(dockerCalls.length, 1);
  assert.equal(dockerCalls[0].command, "docker");
  assert.equal(dockerCalls[0].args.includes("arena-postgres"), true);
  assert.equal(dockerCalls[0].args.includes("pg_dump"), true);
  assert.equal(dockerCalls[0].outputPath, outputPath);
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
