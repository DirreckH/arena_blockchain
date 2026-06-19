const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_TOTAL_SUPPLY,
  defaultOutputPath,
  normalizePositiveIntegerString,
  parseArgs,
  prepareLocalRewardPayoutToken,
  updateEnvFileTokenAddress,
} = require("./prepare-local-reward-payout-token.cjs");

test("parseArgs resolves env-file, artifact-path, token address, holder, and supply options", () => {
  const parsed = parseArgs([
    "--env-file",
    "validation-local/release-rehearsal.env",
    "--artifact-path",
    "artifacts/contracts/validation/LocalRewardPayoutToken.sol/LocalRewardPayoutToken.json",
    "--output",
    "validation-rehearsal/deployments/deployment.reward-payout-token.local.json",
    "--holder-address",
    "0x00000000000000000000000000000000000000aa",
    "--total-supply",
    "1000",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "validation-local/release-rehearsal.env"),
  );
  assert.equal(
    parsed.outputPath,
    path.resolve(
      process.cwd(),
      "validation-rehearsal/deployments/deployment.reward-payout-token.local.json",
    ),
  );
  assert.equal(parsed.holderAddress, "0x00000000000000000000000000000000000000aa");
  assert.equal(parsed.totalSupply, "1000");
});

test("parseArgs ignores forwarded bare separators", () => {
  const parsed = parseArgs(["--", "--total-supply", "1000"]);

  assert.equal(parsed.totalSupply, "1000");
});

test("updateEnvFileTokenAddress replaces the selected env entry in place", () => {
  let contents = [
    "RPC_URL=http://127.0.0.1:8545",
    "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x0000000000000000000000000000000000000010",
    "CHAIN_ID=1337",
    "",
  ].join("\n");

  updateEnvFileTokenAddress({
    envFilePath: "ignored.env",
    tokenAddress: "0x00000000000000000000000000000000000000aa",
    readFile: () => contents,
    writeFile: (_path, nextContents) => {
      contents = nextContents;
    },
  });

  assert.match(
    contents,
    /^ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x00000000000000000000000000000000000000aa$/m,
  );
});

test("normalizePositiveIntegerString rejects zero and non-numeric values", () => {
  assert.equal(normalizePositiveIntegerString("1000", "supply"), "1000");
  assert.throws(() => normalizePositiveIntegerString("0", "supply"));
  assert.throws(() => normalizePositiveIntegerString("abc", "supply"));
});

test("prepareLocalRewardPayoutToken injects code and funds the holder balance", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arena-local-token-"));
  const envFilePath = path.join(workspace, ".env");
  const artifactPath = path.join(
    workspace,
    "artifacts",
    "contracts",
    "validation",
    "LocalRewardPayoutToken.sol",
    "LocalRewardPayoutToken.json",
  );
  const outputPath = defaultOutputPath(workspace);

  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x0000000000000000000000000000000000000010",
      "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    artifactPath,
    JSON.stringify({ deployedBytecode: "0x6001600055" }),
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await prepareLocalRewardPayoutToken({
    cwd: workspace,
    envFilePath,
    artifactPath,
    outputPath,
    deployToken: async (input) => {
      calls.push(input);
      return {
        tokenAddress: "0x00000000000000000000000000000000000000aa",
        deploymentTxHash: "0x1234",
        deployerAddress: "0x00000000000000000000000000000000000000bb",
      };
    },
    logger,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((entry) => entry.rpcUrl),
    ["http://127.0.0.1:8545"],
  );
  assert.equal(fs.existsSync(outputPath), true);

  const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(output.tokenAddress, "0x00000000000000000000000000000000000000AA");
  assert.equal(output.totalSupply, DEFAULT_TOTAL_SUPPLY);
  assert.equal(logger.failMessages.length, 0);
  assert.equal(logger.passMessages.length, 1);
  const envContents = fs.readFileSync(envFilePath, "utf8");
  assert.match(
    envContents,
    /^ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x00000000000000000000000000000000000000AA$/m,
  );
});

test("prepareLocalRewardPayoutToken fails when the artifact is missing", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arena-local-token-missing-"));
  const envFilePath = path.join(workspace, ".env");
  fs.writeFileSync(
    envFilePath,
    [
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x0000000000000000000000000000000000000010",
      "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111",
      "",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await prepareLocalRewardPayoutToken({
    cwd: workspace,
    envFilePath,
    artifactPath: path.join(workspace, "missing.json"),
    logger,
  });

  assert.equal(exitCode, 1);
  assert.equal(logger.failMessages.length, 1);
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
