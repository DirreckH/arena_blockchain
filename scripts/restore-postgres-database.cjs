#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, loadEnvFile, pass } = require("./_validation-common.cjs");
const {
  assertSafeIdentifier,
  buildPostgresClientEnv,
  parsePostgresConnectionString,
  quoteSqlIdentifier,
  quoteSqlLiteral,
  renderCommand,
} = require("./_postgres-admin.cjs");

const DEFAULT_POSTGRES_CONTAINER_NAME =
  process.env.ARENA_POSTGRES_CONTAINER_NAME || "arena-postgres";

function parseArgs(argv) {
  const options = {
    envFilePath: path.resolve(process.cwd(), ".env"),
    maintenanceDatabase: "postgres",
    yes: false,
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

    if (argument === "--input") {
      options.inputPath = path.resolve(process.cwd(), argv[index + 1]);
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

    if (argument === "--maintenance-database") {
      options.maintenanceDatabase = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--yes") {
      options.yes = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function createTerminateConnectionsCommand(options) {
  const connection = parsePostgresConnectionString(options.databaseUrl);
  return {
    args: [
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteSqlLiteral(connection.databaseName)} AND pid <> pg_backend_pid();`,
    ],
    command: "psql",
    cwd: options.cwd,
    env: buildPostgresClientEnv(connection, {
      baseEnv: options.env,
      databaseName: options.maintenanceDatabase || "postgres",
    }),
    label: "postgres:terminate-connections",
  };
}

function createResetSchemaCommand(options) {
  const connection = parsePostgresConnectionString(options.databaseUrl);
  const schema = options.schema || connection.schema;
  assertSafeIdentifier(schema, "schema");

  return {
    args: [
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `DROP SCHEMA IF EXISTS ${quoteSqlIdentifier(schema)} CASCADE; CREATE SCHEMA ${quoteSqlIdentifier(schema)};`,
    ],
    command: "psql",
    cwd: options.cwd,
    env: buildPostgresClientEnv(connection, {
      baseEnv: options.env,
    }),
    label: "postgres:reset-schema",
  };
}

function createRestoreCommand(options) {
  const connection = parsePostgresConnectionString(options.databaseUrl);
  const schema = options.schema || connection.schema;
  assertSafeIdentifier(schema, "schema");

  return {
    args: [
      "--dbname",
      connection.databaseName,
      "--single-transaction",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--schema",
      schema,
      options.inputPath,
    ],
    command: "pg_restore",
    cwd: options.cwd,
    env: buildPostgresClientEnv(connection, {
      baseEnv: options.env,
    }),
    label: "postgres:restore",
  };
}

function createDockerClientEnvironmentArgs(connection, databaseName) {
  const args = [
    "-e",
    `PGHOST=${connection.host}`,
    "-e",
    `PGPORT=${connection.port}`,
    "-e",
    `PGDATABASE=${databaseName || connection.databaseName}`,
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

function createDockerTerminateConnectionsCommand(options) {
  const connection = parsePostgresConnectionString(options.databaseUrl);
  return {
    args: [
      "exec",
      "-i",
      ...createDockerClientEnvironmentArgs(
        connection,
        options.maintenanceDatabase || "postgres",
      ),
      options.containerName || DEFAULT_POSTGRES_CONTAINER_NAME,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteSqlLiteral(connection.databaseName)} AND pid <> pg_backend_pid();`,
    ],
    command: "docker",
    cwd: options.cwd,
    env: buildPostgresClientEnv(connection, {
      baseEnv: options.env,
      databaseName: options.maintenanceDatabase || "postgres",
    }),
    label: "postgres:terminate-connections:docker",
  };
}

function createDockerResetSchemaCommand(options) {
  const connection = parsePostgresConnectionString(options.databaseUrl);
  const schema = options.schema || connection.schema;
  assertSafeIdentifier(schema, "schema");

  return {
    args: [
      "exec",
      "-i",
      ...createDockerClientEnvironmentArgs(connection),
      options.containerName || DEFAULT_POSTGRES_CONTAINER_NAME,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `DROP SCHEMA IF EXISTS ${quoteSqlIdentifier(schema)} CASCADE; CREATE SCHEMA ${quoteSqlIdentifier(schema)};`,
    ],
    command: "docker",
    cwd: options.cwd,
    env: buildPostgresClientEnv(connection, {
      baseEnv: options.env,
    }),
    label: "postgres:reset-schema:docker",
  };
}

function createDockerRestoreCommand(options) {
  const connection = parsePostgresConnectionString(options.databaseUrl);
  const schema = options.schema || connection.schema;
  assertSafeIdentifier(schema, "schema");

  return {
    args: [
      "exec",
      "-i",
      ...createDockerClientEnvironmentArgs(connection),
      options.containerName || DEFAULT_POSTGRES_CONTAINER_NAME,
      "pg_restore",
      "--dbname",
      connection.databaseName,
      "--single-transaction",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--schema",
      schema,
      "-",
    ],
    command: "docker",
    cwd: options.cwd,
    env: buildPostgresClientEnv(connection, {
      baseEnv: options.env,
    }),
    label: "postgres:restore:docker",
    stdinPath: options.inputPath,
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
    input: command.stdinPath ? fs.readFileSync(command.stdinPath) : undefined,
    shell: false,
    stdio: command.stdinPath ? ["pipe", "inherit", "inherit"] : "inherit",
    windowsHide: true,
  });

  return {
    error: result.error,
    status: typeof result.status === "number" ? result.status : 1,
  };
}

async function runPostgresRestore(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = options.envFilePath || path.resolve(cwd, ".env");
  const loadedEnv = loadEnvFile(envFilePath, { override: true });
  const baseEnv = {
    ...process.env,
    ...loadedEnv.loaded,
    ...(options.env || {}),
  };

  if (options.yes !== true) {
    logger.fail(
      "PostgreSQL restore is destructive. Re-run with --yes after confirming the target database can be replaced from backup.",
    );
    return {
      ok: false,
    };
  }

  if (!options.inputPath) {
    logger.fail(
      "Missing backup input path. Provide --input <path-to-backup.dump>.",
    );
    return {
      ok: false,
    };
  }

  if (!fs.existsSync(options.inputPath)) {
    logger.fail(`Backup input not found at ${options.inputPath}.`);
    return {
      ok: false,
      inputPath: options.inputPath,
    };
  }

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
      inputPath: options.inputPath,
    };
  }

  let connection;
  try {
    connection = parsePostgresConnectionString(databaseUrl);
  } catch (error) {
    logger.fail(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      inputPath: options.inputPath,
    };
  }

  const schema = options.schema || connection.schema;
  try {
    assertSafeIdentifier(schema, "schema");
    assertSafeIdentifier(
      options.maintenanceDatabase || "postgres",
      "maintenance database",
    );
  } catch (error) {
    logger.fail(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      inputPath: options.inputPath,
    };
  }

  const commands = [
    createTerminateConnectionsCommand({
      cwd,
      databaseUrl,
      env: baseEnv,
      maintenanceDatabase: options.maintenanceDatabase || "postgres",
    }),
    createResetSchemaCommand({
      cwd,
      databaseUrl,
      env: baseEnv,
      schema,
    }),
    createRestoreCommand({
      cwd,
      databaseUrl,
      env: baseEnv,
      inputPath: options.inputPath,
      schema,
    }),
  ];
  const runCommand = options.runCommand || defaultRunCommand;
  const runDockerCommand = options.runDockerCommand || defaultRunDockerCommand;

  for (const command of commands) {
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
          `Missing PostgreSQL client command \`${command.command}\` in PATH. Retrying via Docker container \`${options.containerName || DEFAULT_POSTGRES_CONTAINER_NAME}\`.`,
        );
        const dockerCommand =
          command.label === "postgres:terminate-connections"
            ? createDockerTerminateConnectionsCommand({
                containerName: options.containerName,
                cwd,
                databaseUrl,
                env: baseEnv,
                maintenanceDatabase: options.maintenanceDatabase || "postgres",
              })
            : command.label === "postgres:reset-schema"
              ? createDockerResetSchemaCommand({
                  containerName: options.containerName,
                  cwd,
                  databaseUrl,
                  env: baseEnv,
                  schema,
                })
              : createDockerRestoreCommand({
                  containerName: options.containerName,
                  cwd,
                  databaseUrl,
                  env: baseEnv,
                  inputPath: options.inputPath,
                  schema,
                });
        result = await runDockerCommand(dockerCommand);
        if (!result || result.status !== 0) {
          logger.fail(
            `Database restore failed at ${dockerCommand.label}. Fix the failing command above, then rerun pnpm run backend:db:restore -- --input <path-to-backup.dump> --yes.`,
          );
          return {
            ok: false,
            inputPath: options.inputPath,
          };
        }
        continue;
      }

      logger.fail(
        `Database restore failed at ${command.label}. Fix the failing command above, then rerun pnpm run backend:db:restore -- --input <path-to-backup.dump> --yes.`,
      );
      return {
        ok: false,
        inputPath: options.inputPath,
      };
    }
  }

  logger.pass(
    `Database restore completed from ${options.inputPath}.`,
  );
  return {
    inputPath: options.inputPath,
    ok: true,
  };
}

async function main() {
  const result = await runPostgresRestore(parseArgs(process.argv.slice(2)));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  createResetSchemaCommand,
  createRestoreCommand,
  createTerminateConnectionsCommand,
  parseArgs,
  runPostgresRestore,
};
