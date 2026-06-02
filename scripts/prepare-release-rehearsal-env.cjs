#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { fail, info, loadEnvFile, pass } = require("./_validation-common.cjs");

function renderLine(key, value) {
  return `${key}=${value}`;
}

function sanitizeComposeProjectName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "");

  return normalized || "arena";
}

async function prepareReleaseRehearsalEnv(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const sourceEnvPath =
    options.sourceEnvPath || path.resolve(cwd, ".env");
  const outputDir =
    options.outputDir || path.resolve(cwd, "validation-local");
  const outputPath =
    options.outputPath || path.resolve(outputDir, "release-rehearsal.env");
  const composeProjectName =
    options.composeProjectName ||
    `${sanitizeComposeProjectName(path.basename(cwd))}-release-rehearsal`;

  const loaded = loadEnvFile(sourceEnvPath, { override: true });
  if (!loaded.exists) {
    logger.fail(
      `Source env file not found at ${sourceEnvPath}. Generate or restore a local .env before preparing the release rehearsal env.`,
    );
    return {
      ok: false,
      outputPath,
      sourceEnvPath,
    };
  }

  const output = {
    ...loaded.loaded,
    COMPOSE_PROJECT_NAME: composeProjectName,
    NODE_ENV: "production",
    PORT: "4000",
    POSTGRES_DB: loaded.loaded.POSTGRES_DB || "arena",
    POSTGRES_USER: loaded.loaded.POSTGRES_USER || "arena",
    POSTGRES_PASSWORD: loaded.loaded.POSTGRES_PASSWORD || "arena",
    ARENA_COMPOSE_DATABASE_URL:
      options.composeDatabaseUrl ||
      "postgresql://arena:arena@host.docker.internal:5432/arena?schema=public&connect_timeout=5",
    ARENA_COMPOSE_REDIS_URL:
      options.composeRedisUrl || "redis://host.docker.internal:6379/0",
    ARENA_COMPOSE_RPC_URL:
      options.composeRpcUrl || "http://host.docker.internal:8545",
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const lines = Object.entries(output)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => renderLine(key, String(value)));
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");

  logger.pass(`Prepared release rehearsal env at ${outputPath}`);
  return {
    ok: true,
    outputPath,
    sourceEnvPath,
  };
}

async function main() {
  const result = await prepareReleaseRehearsalEnv();
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  prepareReleaseRehearsalEnv,
};
