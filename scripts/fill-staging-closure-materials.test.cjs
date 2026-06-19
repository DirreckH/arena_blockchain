const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildGeneratedMaterial,
  fillStagingClosureMaterials,
  parseArgs,
} = require("./fill-staging-closure-materials.cjs");

test("parseArgs resolves current and previous staging env paths", () => {
  const parsed = parseArgs([
    "--current-env",
    "config/custom-staging.env",
    "--previous-env",
    "config/custom-staging.previous.env",
    "--base-url",
    "https://api.example.com",
    "--rpc-url",
    "https://rpc.example.com",
    "--database-url",
    "postgresql://arena:arena@db.example.com:5432/arena",
    "--redis-url",
    "redis://cache.example.com:6379/0",
    "--legacy-contract-address",
    "0x0000000000000000000000000000000000000011",
    "--validation-contract-address",
    "0x0000000000000000000000000000000000000022",
    "--reward-payout-token-address",
    "0x0000000000000000000000000000000000000033",
    "--ops-alert-webhook-targets",
    "closure:https://alerts.example.com/hooks/arena",
    "--force",
  ]);

  assert.equal(
    parsed.currentEnvPath,
    path.resolve(process.cwd(), "config/custom-staging.env"),
  );
  assert.equal(
    parsed.previousEnvPath,
    path.resolve(process.cwd(), "config/custom-staging.previous.env"),
  );
  assert.equal(parsed.baseUrl, "https://api.example.com");
  assert.equal(parsed.rpcUrl, "https://rpc.example.com");
  assert.equal(
    parsed.databaseUrl,
    "postgresql://arena:arena@db.example.com:5432/arena",
  );
  assert.equal(parsed.redisUrl, "redis://cache.example.com:6379/0");
  assert.equal(
    parsed.legacyContractAddress,
    "0x0000000000000000000000000000000000000011",
  );
  assert.equal(
    parsed.validationContractAddress,
    "0x0000000000000000000000000000000000000022",
  );
  assert.equal(
    parsed.rewardPayoutTokenAddress,
    "0x0000000000000000000000000000000000000033",
  );
  assert.equal(
    parsed.opsAlertWebhookTargets,
    "closure:https://alerts.example.com/hooks/arena",
  );
  assert.equal(parsed.force, true);
});

test("buildGeneratedMaterial creates distinct secret-bearing closure material with derived addresses", () => {
  const current = buildGeneratedMaterial("current");
  const previous = buildGeneratedMaterial("previous");

  assert.match(current.JWT_SECRET, /^arena_current_jwt_/u);
  assert.match(previous.JWT_SECRET, /^arena_previous_jwt_/u);
  assert.notEqual(current.JWT_SECRET, previous.JWT_SECRET);
  assert.match(current.ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY, /^0x[a-f0-9]{64}$/u);
  assert.match(current.ARENA_VALIDATION_OPERATOR_PRIVATE_KEY, /^0x[a-f0-9]{64}$/u);
  assert.match(current.ARENA_VALIDATION_ADMIN_ADDRESS, /^0x[a-fA-F0-9]{40}$/u);
  assert.match(current.ARENA_VALIDATION_OPERATOR_ADDRESS, /^0x[a-fA-F0-9]{40}$/u);
  assert.match(current.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
});

test("fillStagingClosureMaterials hydrates generated closure secrets without pretending external infra exists", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-fill-staging-closure-materials-"),
  );
  const currentEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");

  writeSkeletonStagingEnv(currentEnvPath);
  fs.writeFileSync(
    previousEnvPath,
    fs.readFileSync(currentEnvPath, "utf8"),
    "utf8",
  );

  const logger = createLogger();
  const result = fillStagingClosureMaterials({
    currentEnvPath,
    logger,
    previousEnvPath,
  });

  const currentContents = fs.readFileSync(currentEnvPath, "utf8");
  const previousContents = fs.readFileSync(previousEnvPath, "utf8");

  assert.match(
    currentContents,
    /^ARENA_INTERNAL_API_BASE_URL=https:\/\/arenablockchain-5kx617r63-dirreck-h-s-projects\.vercel\.app$/m,
  );
  assert.match(
    currentContents,
    /^RPC_URL=https:\/\/ethereum-sepolia-rpc\.publicnode\.com$/m,
  );
  assert.match(
    previousContents,
    /^RPC_URL=https:\/\/ethereum-sepolia-rpc\.publicnode\.com$/m,
  );
  assert.match(currentContents, /^COMPOSE_PROJECT_NAME=arena_blockchain-release-rehearsal$/m);
  assert.match(previousContents, /^COMPOSE_PROJECT_NAME=arena_blockchain-release-rehearsal$/m);
  assert.match(currentContents, /^JWT_SECRET=arena_current_jwt_/m);
  assert.match(previousContents, /^JWT_SECRET=arena_previous_jwt_/m);
  assert.match(currentContents, /^ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/m);
  assert.match(currentContents, /^ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=0x[a-f0-9]{64}$/m);
  assert.match(currentContents, /^ARENA_VALIDATION_OPERATOR_ADDRESS=0x[a-fA-F0-9]{40}$/m);
  assert.match(currentContents, /^OPERATOR_WALLET_ADDRESSES=0x[a-f0-9]{40}$/m);
  assert.notEqual(
    extractEnvValue(currentContents, "JWT_SECRET"),
    extractEnvValue(previousContents, "JWT_SECRET"),
  );
  assert.equal(result.currentMissingExternal.includes("RPC_URL"), false);
  assert.equal(result.currentMissingExternal.includes("DATABASE_URL"), true);
  assert.equal(result.currentMissingExternal.includes("ARENA_VALIDATION_CONTRACT_ADDRESS"), true);
  assert.equal(result.currentMissingExternal.includes("ARENA_OPS_ALERT_WEBHOOK_TARGETS"), true);
  assert.equal(result.currentGeneratedPresent.includes("ARENA_INTERNAL_OPERATOR_BEARER_TOKEN"), true);
  assert.equal(
    logger.passMessages.includes("Staging closure material files were safely hydrated."),
    true,
  );
});

test("fillStagingClosureMaterials accepts explicit external values and mirrors non-secret release wiring into the previous env", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-fill-staging-closure-materials-explicit-"),
  );
  const currentEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");

  writeSkeletonStagingEnv(currentEnvPath);
  fs.writeFileSync(previousEnvPath, fs.readFileSync(currentEnvPath, "utf8"), "utf8");

  const logger = createLogger();
  const result = fillStagingClosureMaterials({
    baseUrl: "https://api.example.com",
    currentEnvPath,
    databaseUrl: "postgresql://arena:arena@db.example.com:5432/arena",
    legacyContractAddress: "0x0000000000000000000000000000000000000011",
    logger,
    opsAlertWebhookTargets: "closure:https://alerts.example.com/hooks/arena",
    previousEnvPath,
    redisUrl: "redis://cache.example.com:6379/0",
    rewardPayoutTokenAddress: "0x0000000000000000000000000000000000000033",
    rpcUrl: "https://rpc.example.com",
    validationContractAddress: "0x0000000000000000000000000000000000000022",
  });

  const currentContents = fs.readFileSync(currentEnvPath, "utf8");
  const previousContents = fs.readFileSync(previousEnvPath, "utf8");

  for (const contents of [currentContents, previousContents]) {
    assert.match(contents, /^COMPOSE_PROJECT_NAME=arena_blockchain-release-rehearsal$/m);
    assert.match(contents, /^DATABASE_URL=postgresql:\/\/arena:arena@db\.example\.com:5432\/arena$/m);
    assert.match(contents, /^REDIS_URL=redis:\/\/cache\.example\.com:6379\/0$/m);
    assert.match(contents, /^ARENA_INTERNAL_API_BASE_URL=https:\/\/api\.example\.com$/m);
    assert.match(contents, /^RPC_URL=https:\/\/rpc\.example\.com$/m);
    assert.match(contents, /^ARENA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000011$/m);
    assert.match(contents, /^ARENA_VALIDATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000022$/m);
    assert.match(contents, /^ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x0000000000000000000000000000000000000033$/m);
    assert.match(contents, /^ARENA_OPS_ALERT_WEBHOOK_TARGETS=closure:https:\/\/alerts\.example\.com\/hooks\/arena$/m);
  }

  assert.deepEqual(result.currentMissingExternal, []);
  assert.deepEqual(result.previousMissingExternal, []);
  assert.equal(logger.failMessages.length, 0);
});

test("fillStagingClosureMaterials discovers non-local deploy artifacts for chain addresses and ignores local-only payout artifacts", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-fill-staging-closure-materials-artifacts-"),
  );
  const currentEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");
  const deploymentDir = path.join(workspace, "validation-rehearsal", "deployments");

  writeSkeletonStagingEnv(currentEnvPath);
  fs.writeFileSync(previousEnvPath, fs.readFileSync(currentEnvPath, "utf8"), "utf8");
  fs.mkdirSync(deploymentDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "deployment.json"),
    JSON.stringify(
      {
        chainId: 11155111,
        contractAddress: "0x0000000000000000000000000000000000000011",
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(deploymentDir, "deployment.validation.validation.json"),
    JSON.stringify(
      {
        contractAddress: "0x0000000000000000000000000000000000000022",
        network: { chainId: 11155111, name: "sepolia" },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(deploymentDir, "deployment.reward-payout-token.local.json"),
    JSON.stringify(
      {
        network: { chainId: 1337, rpcUrl: "http://127.0.0.1:8545" },
        tokenAddress: "0x00000000000000000000000000000000000000aa",
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(deploymentDir, "deployment.reward-payout-token.validation.json"),
    JSON.stringify(
      {
        network: { chainId: 11155111, rpcUrl: "https://rpc.example.com" },
        tokenAddress: "0x0000000000000000000000000000000000000033",
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = fillStagingClosureMaterials({
    currentEnvPath,
    cwd: workspace,
    previousEnvPath,
    logger: createLogger(),
  });

  const currentContents = fs.readFileSync(currentEnvPath, "utf8");
  const previousContents = fs.readFileSync(previousEnvPath, "utf8");

  for (const contents of [currentContents, previousContents]) {
    assert.match(contents, /^ARENA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000011$/m);
    assert.match(contents, /^ARENA_VALIDATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000022$/m);
    assert.match(contents, /^ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x0000000000000000000000000000000000000033$/m);
  }

  assert.equal(result.currentMissingExternal.includes("ARENA_CONTRACT_ADDRESS"), false);
  assert.equal(result.currentMissingExternal.includes("ARENA_VALIDATION_CONTRACT_ADDRESS"), false);
  assert.equal(result.currentMissingExternal.includes("ARENA_REWARD_PAYOUT_ERC20_ADDRESS"), false);
  assert.equal(result.currentMissingExternal.includes("DATABASE_URL"), true);
  assert.doesNotMatch(
    currentContents,
    /^ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x00000000000000000000000000000000000000aa$/m,
  );
});

test("fillStagingClosureMaterials prefers non-local legacy deployment artifacts over a local root deployment", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-fill-staging-closure-materials-legacy-"),
  );
  const currentEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");
  const deploymentDir = path.join(workspace, "validation-rehearsal", "deployments");

  writeSkeletonStagingEnv(currentEnvPath);
  fs.writeFileSync(previousEnvPath, fs.readFileSync(currentEnvPath, "utf8"), "utf8");
  fs.mkdirSync(deploymentDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "deployment.json"),
    JSON.stringify(
      {
        chainId: 1337,
        contractAddress: "0x00000000000000000000000000000000000000aa",
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(deploymentDir, "deployment.legacy.validation.json"),
    JSON.stringify(
      {
        contractAddress: "0x0000000000000000000000000000000000000011",
        network: { chainId: 11155111, rpcUrl: "https://rpc.example.com" },
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = fillStagingClosureMaterials({
    currentEnvPath,
    cwd: workspace,
    logger: createLogger(),
    previousEnvPath,
  });

  const currentContents = fs.readFileSync(currentEnvPath, "utf8");

  assert.match(currentContents, /^ARENA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000011$/m);
  assert.equal(result.currentMissingExternal.includes("ARENA_CONTRACT_ADDRESS"), false);
});

function writeSkeletonStagingEnv(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    [
      "NODE_ENV=production",
      "ARENA_PROCESS_ROLE=api",
      "DATABASE_URL=",
      "REDIS_URL=",
      "JWT_SECRET=",
      "ARENA_INTERNAL_API_BASE_URL=",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=",
      "RPC_URL=",
      "CHAIN_ID=11155111",
      "ARENA_CONTRACT_ADDRESS=",
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=",
      "ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY=",
      "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=",
      "ARENA_VALIDATION_ORACLE_PRIVATE_KEY=",
      "ARENA_VALIDATION_PAUSER_PRIVATE_KEY=",
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=",
      "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=",
      "ARENA_OPS_ALERT_WEBHOOK_TARGETS=",
      "ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS=",
      "",
    ].join("\n"),
    "utf8",
  );
}

function extractEnvValue(contents, key) {
  const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1] : "";
}

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
