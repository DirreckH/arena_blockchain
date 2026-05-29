const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const SCRIPT_PATH = path.resolve(
  __dirname,
  "check-validation-runtime-deps.cjs",
);

const {
  inspectRuntimeDependencies,
} = require("./check-validation-runtime-deps.cjs");

test("check-validation-runtime-deps reports local container-runtime and RPC remediation when dependencies are down", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-deps-check-"),
  );

  fs.writeFileSync(
    path.join(workspace, ".env"),
    [
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
    ].join("\n"),
  );

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: "",
    },
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(
    output,
    /Docker or another compatible container runtime is not available in PATH/i,
  );
  assert.match(
    output,
    /pnpm run deps:up cannot start Postgres or Redis here/i,
  );
  assert.match(
    output,
    /Start it with pnpm exec hardhat node/i,
  );
  assert.match(
    output,
    /rerun pnpm run validation:deps:check and pnpm run validation:chain:check/i,
  );
});

test("inspectRuntimeDependencies returns structured failed dependency names", async () => {
  const result = await inspectRuntimeDependencies({
    env: {
      DATABASE_URL:
        "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
      REDIS_URL: "redis://127.0.0.1:6379/0",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: "1337",
    },
    checkTcpUrl: async (name) => ({
      name,
      ok: name !== "redis",
      message: name === "redis" ? "down" : "up",
    }),
    checkRpc: async () => ({
      name: "rpc",
      ok: false,
      message: "fetch failed",
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failedNames, ["redis", "rpc"]);
  assert.equal(result.results.length, 3);
});
