const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  prepareReleaseRehearsalEnv,
} = require("./prepare-release-rehearsal-env.cjs");

test("prepare-release-rehearsal-env writes a production-shaped env file with compose-safe overrides", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-"),
  );
  const sourceEnvPath = path.join(tempDir, ".env");
  const outputPath = path.join(tempDir, "release-rehearsal.env");

  fs.writeFileSync(
    sourceEnvPath,
    [
      "JWT_SECRET=test-secret",
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "AUTH_CHALLENGE_TTL=300",
    ].join("\n"),
    "utf8",
  );

  const result = await prepareReleaseRehearsalEnv({
    cwd: tempDir,
    sourceEnvPath,
    outputPath,
    logger: createLogger(),
  });

  assert.equal(result.ok, true);
  const contents = fs.readFileSync(outputPath, "utf8");
  const expectedProjectName = `${path.basename(tempDir).toLowerCase()}-release-rehearsal`;
  assert.match(
    contents,
    new RegExp(`^COMPOSE_PROJECT_NAME=${expectedProjectName}$`, "m"),
  );
  assert.match(contents, /^NODE_ENV=production$/m);
  assert.match(contents, /^PORT=4000$/m);
  assert.match(
    contents,
    /^ARENA_COMPOSE_DATABASE_URL=postgresql:\/\/arena:arena@host\.docker\.internal:5432\/arena\?schema=public&connect_timeout=5$/m,
  );
  assert.match(
    contents,
    /^ARENA_COMPOSE_REDIS_URL=redis:\/\/host\.docker\.internal:6379\/0$/m,
  );
  assert.match(
    contents,
    /^ARENA_COMPOSE_RPC_URL=http:\/\/host\.docker\.internal:8545$/m,
  );
  assert.match(contents, /^JWT_SECRET=test-secret$/m);
});

test("prepare-release-rehearsal-env allows an explicit compose project name override", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-project-"),
  );
  const sourceEnvPath = path.join(tempDir, ".env");
  const outputPath = path.join(tempDir, "release-rehearsal.env");

  fs.writeFileSync(
    sourceEnvPath,
    [
      "JWT_SECRET=test-secret",
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
    ].join("\n"),
    "utf8",
  );

  const result = await prepareReleaseRehearsalEnv({
    cwd: tempDir,
    sourceEnvPath,
    outputPath,
    composeProjectName: "arena-custom-release",
    logger: createLogger(),
  });

  assert.equal(result.ok, true);
  const contents = fs.readFileSync(outputPath, "utf8");
  assert.match(contents, /^COMPOSE_PROJECT_NAME=arena-custom-release$/m);
});

test("prepare-release-rehearsal-env fails honestly when the source env file is missing", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-missing-"),
  );
  const outputPath = path.join(tempDir, "release-rehearsal.env");

  const result = await prepareReleaseRehearsalEnv({
    cwd: tempDir,
    sourceEnvPath: path.join(tempDir, ".env"),
    outputPath,
    logger: createLogger(),
  });

  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(outputPath), false);
});

function createLogger() {
  return {
    fail() {},
    info() {},
    pass() {},
  };
}
