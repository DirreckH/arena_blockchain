#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, loadEnvFile, pass } = require("./_validation-common.cjs");
const {
  assertSafeIdentifier,
  buildPostgresClientEnv,
  defaultBackupOutputPath,
  parsePostgresConnectionString,
  renderCommand,
} = require("./_postgres-admin.cjs");

const DEFAULT_POSTGRES_CONTAINER_NAME =
  process.env.ARENA_POSTGRES_CONTAINER_NAME || "arena-postgres";

function parseArgs(argv) {
  const options = {
    envFilePath: path.resolve(process.cwd(), ".env"),
    label: "arena",
    overwrite: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--") {
      continue;
    }

    if (argument === "--env-file") {
      options.envFilePath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--output") {
      options.outputPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--database-url") {
      options.databaseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--schema") {
      options.schema = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--label") {
      options.label = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--overwrite") {
      options.overwrite = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function createBackupCommand(options) {
  const connection = parsePostgresConnectionString(options.databaseUrl);
  const schema = options.schema || connection.schema;
  assertSafeIdentifier(schema, "schema");

  return {
    args: [
      "--format=custom",
      "--file",
      options.outputPath,
      "--schema",
      schema,
      "--no-owner",
      "--no-privileges",
    ],
    command: "pg_dump",
    cwd: options.cwd,
    env: buildPostgresClientEnv(connection, {
      baseEnv: options.env,
    }),
    label: "postgres:backup",
    metadata: {
      databaseName: connection.databaseName,
      host: connection.host,
      maskedDatabaseUrl: connection.maskedDatabaseUrl,
      port: connection.port,
      schema,
      username: connection.username || "",
    },
  };
}

function createDockerClientEnvironmentArgs(connection) {
  const args = [
    "-e",
    `PGHOST=${connection.host}`,
    "-e",
    `PGPORT=${connection.port}`,
    "-e",
    `PGDATABASE=${connection.databaseName}`,
  ];

  if (connection.username) {
    args.push("-e", `PGUSER=${connection.username}`);
  }

  if (connection.password) {
    args.push("-e", `PGPASSWORD=${connection.password}`);
  }

  if (connection.connectTimeout) {
    args.push("-e", `PGCONNECT_TIMEOUT=${connection.connectTimeout}`);
  }

  if (connection.sslmode) {
    args.push("-e", `PGSSLMODE=${connection.sslmode}`);
  }

  return args;
}

function createDockerBackupCommand(options) {
  const connection = parsePostgresConnectionString(options.databaseUrl);
  const schema = options.schema || connection.schema;
  assertSafeIdentifier(schema, "schema");

  return {
    args: [
      "exec",
      "-i",
      ...createDockerClientEnvironmentArgs(connection),
      options.containerName || DEFAULT_POSTGRES_CONTAINER_NAME,
      "pg_dump",
      "--format=custom",
      "--schema",
      schema,
      "--no-owner",
      "--no-privileges",
    ],
    command: "docker",
    cwd: options.cwd,
    env: buildPostgresClientEnv(connection, {
      baseEnv: options.env,
    }),
    label: "postgres:backup:docker",
    outputPath: options.outputPath,
  };
}

function defaultRunCommand(command) {
  info(`Running ${command.label}: ${renderCommand(command)}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });

  return {
    error: result.error,
    status: typeof result.status === "number" ? result.status : 1,
  };
}

function defaultRunDockerCommand(command) {
  info(`Running ${command.label}: ${renderCommand(command)}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    shell: false,
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
  });

  if (
    !result.error &&
    result.status === 0 &&
    command.outputPath &&
    (Buffer.isBuffer(result.stdout) || result.stdout instanceof Uint8Array)
  ) {
    fs.mkdirSync(path.dirname(command.outputPath), { recursive: true });
    fs.writeFileSync(command.outputPath, Buffer.from(result.stdout));
  }

  return {
    error: result.error,
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout,
  };
}

async function runPostgresBackup(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = options.envFilePath || path.resolve(cwd, ".env");
  const loadedEnv = loadEnvFile(envFilePath, { override: true });
  const baseEnv = {
    ...process.env,
    ...loadedEnv.loaded,
    ...(options.env || {}),
  };

  const databaseUrl =
    options.databaseUrl ||
    (options.env && options.env.DATABASE_URL) ||
    loadedEnv.loaded.DATABASE_URL ||
    "";
  if (!databaseUrl) {
    logger.fail(
      "Missing DATABASE_URL. Provide --database-url <postgres-url> or set DATABASE_URL in the selected env file.",
    );
    return {
      ok: false,
    };
  }

  let connection;
  try {
    connection = parsePostgresConnectionString(databaseUrl);
  } catch (error) {
    logger.fail(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
    };
  }

  const schema = options.schema || connection.schema;
  try {
    assertSafeIdentifier(schema, "schema");
  } catch (error) {
    logger.fail(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
    };
  }

  const outputPath =
    options.outputPath ||
    defaultBackupOutputPath(cwd, options.label || "arena", options.now || new Date());
  if (fs.existsSync(outputPath) && options.overwrite !== true) {
    logger.fail(
      `Backup output already exists at ${outputPath}. Pass --overwrite to replace it or choose a different --output path.`,
    );
    return {
      ok: false,
      outputPath,
    };
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const command = createBackupCommand({
    cwd,
    databaseUrl,
    env: baseEnv,
    outputPath,
    schema,
  });
  const runCommand = options.runCommand || defaultRunCommand;
  let result = await runCommand(command);
  if (!result || result.status !== 0) {
    const errorCode =
      result &&
      result.error &&
      typeof result.error === "object" &&
      typeof result.error.code === "string"
        ? result.error.code
        : "";

    if (errorCode === "ENOENT") {
      logger.info(
        `Missing PostgreSQL client command \`pg_dump\` in PATH. Retrying via Docker container \`${options.containerName || DEFAULT_POSTGRES_CONTAINER_NAME}\`.`,
      );
      const runDockerCommand =
        options.runDockerCommand || defaultRunDockerCommand;
      result = await runDockerCommand(
        createDockerBackupCommand({
          containerName: options.containerName,
          cwd,
          databaseUrl,
          env: baseEnv,
          outputPath,
          schema,
        }),
      );
      if (!result || result.status !== 0) {
        logger.fail(
          `Database backup failed at ${command.label}. Fix the failing command above, then rerun pnpm run backend:db:backup.`,
        );
        return {
          ok: false,
          outputPath,
        };
      }
      if (!fs.existsSync(outputPath) && result.stdout) {
        fs.writeFileSync(outputPath, Buffer.from(result.stdout));
      }
    } else {
      logger.fail(
        `Database backup failed at ${command.label}. Fix the failing command above, then rerun pnpm run backend:db:backup.`,
      );
      return {
        ok: false,
        outputPath,
      };
    }
  }

  const outputStats = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
  if (!outputStats || outputStats.size <= 0) {
    logger.fail(
      `Database backup completed without a usable archive at ${outputPath}. Verify the PostgreSQL client or Docker fallback writes a non-empty dump before rerunning pnpm run backend:db:backup.`,
    );
    return {
      ok: false,
      outputPath,
    };
  }

  const metadataPath = `${outputPath}.json`;
  const metadata = {
    createdAt: (options.now || new Date()).toISOString(),
    database: {
      databaseName: command.metadata.databaseName,
      host: command.metadata.host,
      maskedDatabaseUrl: command.metadata.maskedDatabaseUrl,
      port: command.metadata.port,
      schema: command.metadata.schema,
      username: command.metadata.username,
    },
    envFilePath,
    outputPath,
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  logger.pass(`Database backup created at ${outputPath}`);
  return {
    metadataPath,
    ok: true,
    outputPath,
  };
}

async function main() {
  const result = await runPostgresBackup(parseArgs(process.argv.slice(2)));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  createBackupCommand,
  createDockerBackupCommand,
  parseArgs,
  runPostgresBackup,
};
