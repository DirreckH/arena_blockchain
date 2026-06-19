const path = require("node:path");

function parsePostgresConnectionString(databaseUrl) {
  if (typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    throw new Error(
      "Missing DATABASE_URL. Provide --database-url <postgres-url> or set DATABASE_URL in the selected env file.",
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (error) {
    throw new Error(
      `DATABASE_URL is not a valid PostgreSQL connection string: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (
    parsedUrl.protocol !== "postgres:" &&
    parsedUrl.protocol !== "postgresql:"
  ) {
    throw new Error(
      `DATABASE_URL must use postgres:// or postgresql://, received ${parsedUrl.protocol}`,
    );
  }

  const databaseName = decodeURIComponent(
    parsedUrl.pathname.replace(/^\/+/u, ""),
  );
  if (!databaseName) {
    throw new Error(
      "DATABASE_URL must include a database name in the pathname.",
    );
  }

  const schema = parsedUrl.searchParams.get("schema") || "public";
  assertSafeIdentifier(schema, "schema");

  return {
    connectTimeout: parsedUrl.searchParams.get("connect_timeout") || "",
    databaseName,
    host: parsedUrl.hostname,
    maskedDatabaseUrl: maskPostgresConnectionString(parsedUrl),
    password: decodeURIComponent(parsedUrl.password || ""),
    port: parsedUrl.port || "5432",
    schema,
    sslmode: parsedUrl.searchParams.get("sslmode") || "",
    username: decodeURIComponent(parsedUrl.username || ""),
  };
}

function buildPostgresClientEnv(connection, options = {}) {
  const environment = {
    ...process.env,
    ...(options.baseEnv || {}),
  };

  environment.PGHOST = connection.host;
  environment.PGPORT = connection.port;
  environment.PGDATABASE =
    options.databaseName || connection.databaseName;

  if (connection.username) {
    environment.PGUSER = connection.username;
  } else {
    delete environment.PGUSER;
  }

  if (connection.password) {
    environment.PGPASSWORD = connection.password;
  } else {
    delete environment.PGPASSWORD;
  }

  if (connection.connectTimeout) {
    environment.PGCONNECT_TIMEOUT = connection.connectTimeout;
  } else {
    delete environment.PGCONNECT_TIMEOUT;
  }

  if (connection.sslmode) {
    environment.PGSSLMODE = connection.sslmode;
  } else {
    delete environment.PGSSLMODE;
  }

  return environment;
}

function maskPostgresConnectionString(value) {
  const parsedUrl =
    value instanceof URL ? new URL(String(value)) : new URL(String(value));

  if (parsedUrl.password) {
    parsedUrl.password = "***";
  }

  return parsedUrl.toString();
}

function assertSafeIdentifier(value, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new Error(
      `Invalid ${label}: ${value}. Only simple PostgreSQL identifiers are supported.`,
    );
  }
}

function quoteSqlIdentifier(value) {
  assertSafeIdentifier(value, "identifier");
  return `"${value}"`;
}

function quoteSqlLiteral(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function sanitizeLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "");

  return normalized || "arena";
}

function defaultBackupOutputPath(cwd, label, now = new Date()) {
  const timestamp = now
    .toISOString()
    .replace(/:/gu, "-")
    .replace(/\./gu, "-");
  return path.resolve(
    cwd,
    "validation-rehearsal",
    "db-backups",
    `${timestamp}-${sanitizeLabel(label)}.dump`,
  );
}

function renderCommand(command) {
  return [command.command, ...command.args].join(" ");
}

module.exports = {
  assertSafeIdentifier,
  buildPostgresClientEnv,
  defaultBackupOutputPath,
  parsePostgresConnectionString,
  quoteSqlIdentifier,
  quoteSqlLiteral,
  renderCommand,
  sanitizeLabel,
};
