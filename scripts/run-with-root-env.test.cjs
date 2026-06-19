const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { parseCliArgs } = require("./run-with-root-env.cjs");

const SCRIPT_PATH = path.resolve(__dirname, "run-with-root-env.cjs");

test("parseCliArgs resolves and strips the optional env-file flag", () => {
  const parsed = parseCliArgs([
    "apps/api",
    "pnpm",
    "run",
    "prisma:migrate:deploy",
    "--env-file",
    "config/staging.env",
  ]);

  assert.equal(parsed.targetCwd, "apps/api");
  assert.equal(parsed.childCommandParts[0], "pnpm");
  assert.deepEqual(parsed.childCommandParts.slice(1), [
    "run",
    "prisma:migrate:deploy",
  ]);
  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
});

test("parseCliArgs ignores a pnpm forwarded bare double-dash separator", () => {
  const parsed = parseCliArgs([
    "--",
    "apps/api",
    "pnpm",
    "run",
    "prisma:migrate:deploy",
    "--env-file",
    "config/staging.env",
  ]);

  assert.equal(parsed.targetCwd, "apps/api");
  assert.deepEqual(parsed.childCommandParts, [
    "pnpm",
    "run",
    "prisma:migrate:deploy",
  ]);
  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
});

test("run-with-root-env loads the selected env file instead of the root default", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-run-with-root-env-selected-"),
  );
  const probePath = path.join(workspace, "probe-env.cjs");
  fs.writeFileSync(path.join(workspace, ".env"), "ARENA_TEST_KEY=root\n", "utf8");
  fs.mkdirSync(path.join(workspace, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "config", "staging.env"),
    "ARENA_TEST_KEY=staging\n",
    "utf8",
  );
  fs.writeFileSync(
    probePath,
    "process.stdout.write((process.env.ARENA_TEST_KEY||'') + '|' + JSON.stringify(process.argv.slice(2)))",
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      ".",
      "node",
      "probe-env.cjs",
      "--env-file",
      "config/staging.env",
    ],
    {
      cwd: workspace,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "staging|[]");
});

test("run-with-root-env falls back to the workspace root .env when no override is supplied", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-run-with-root-env-default-"),
  );
  const probePath = path.join(workspace, "probe-env.cjs");
  fs.writeFileSync(path.join(workspace, ".env"), "ARENA_TEST_KEY=root\n", "utf8");
  fs.writeFileSync(
    probePath,
    "process.stdout.write(process.env.ARENA_TEST_KEY||'')",
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      ".",
      "node",
      "probe-env.cjs",
    ],
    {
      cwd: workspace,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "root");
});
