const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const SCRIPT_PATH = path.resolve(__dirname, "check-validation-contract.cjs");

test("check-validation-contract loads a selected env file before validating required inputs", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-check-validation-contract-env-file-"),
  );

  fs.writeFileSync(
    path.join(workspace, ".env"),
    [
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x00000000000000000000000000000000000000ff",
      "",
    ].join("\n"),
    "utf8",
  );

  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "RPC_URL=https://rpc.example",
      "CHAIN_ID=8453",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000022",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--env-file", "config/staging.env"],
    {
      cwd: workspace,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Loaded \.env from config\/staging\.env/u);
  assert.match(
    output,
    /Validation artifact missing .* Run pnpm exec hardhat compile first\./u,
  );
  assert.doesNotMatch(
    output,
    /No \.env file found .* using process env only/u,
  );
  assert.doesNotMatch(
    output,
    /0x00000000000000000000000000000000000000ff/u,
  );
});
