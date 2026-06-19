#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  addressFromPrivateKey,
  createHs256Jwt,
  fail,
  info,
  pass,
} = require("./_validation-common.cjs");

const CURRENT_GENERATED_KEYS = [
  "JWT_SECRET",
  "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN",
  "ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY",
  "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY",
  "ARENA_VALIDATION_ORACLE_PRIVATE_KEY",
  "ARENA_VALIDATION_PAUSER_PRIVATE_KEY",
  "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY",
  "ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS",
];

const PREVIOUS_GENERATED_KEYS = [...CURRENT_GENERATED_KEYS];

const CURRENT_REQUIRED_EXTERNAL_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "RPC_URL",
  "ARENA_CONTRACT_ADDRESS",
  "ARENA_VALIDATION_CONTRACT_ADDRESS",
  "ARENA_REWARD_PAYOUT_ERC20_ADDRESS",
  "ARENA_OPS_ALERT_WEBHOOK_TARGETS",
];

const PREVIOUS_REQUIRED_EXTERNAL_KEYS = [
  ...CURRENT_REQUIRED_EXTERNAL_KEYS,
  "ARENA_INTERNAL_API_BASE_URL",
];

const DEFAULT_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const DEFAULT_RELEASE_API_BASE_URL =
  "https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app";
const LEGACY_DEPLOYMENT_ARTIFACT_PATTERN =
  /^deployment\.legacy(?:\.[^.]+)?\.json$/iu;
const VALIDATION_DEPLOYMENT_ARTIFACT_PATTERN =
  /^deployment\.validation(?:\.[^.]+)?\.json$/iu;
const REWARD_PAYOUT_DEPLOYMENT_ARTIFACT_PATTERN =
  /^deployment\.reward-payout-token(?:\.[^.]+)?\.json$/iu;

function parseArgs(argv) {
  const cwd = process.cwd();
  const options = {
    baseUrl: "",
    currentEnvPath: path.resolve(cwd, "config", "staging.env"),
    databaseUrl: "",
    force: false,
    legacyContractAddress: "",
    opsAlertWebhookTargets: "",
    previousEnvPath: path.resolve(cwd, "config", "staging.previous.env"),
    redisUrl: "",
    rewardPayoutTokenAddress: "",
    rpcUrl: "",
    validationContractAddress: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--current-env") {
      options.currentEnvPath = path.resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--previous-env") {
      options.previousEnvPath = path.resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--base-url") {
      options.baseUrl = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--database-url") {
      options.databaseUrl = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--legacy-contract-address") {
      options.legacyContractAddress = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--ops-alert-webhook-targets") {
      options.opsAlertWebhookTargets = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--redis-url") {
      options.redisUrl = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--reward-payout-token-address") {
      options.rewardPayoutTokenAddress = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--rpc-url") {
      options.rpcUrl = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--validation-contract-address") {
      options.validationContractAddress = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--force") {
      options.force = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function readEnvFile(filePath) {
  const contents = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const values = {};

  for (const line of contents.split(/\r?\n/u)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) {
      continue;
    }

    const delimiterIndex = line.indexOf("=");
    const key = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim();
    values[key] = value;
  }

  return {
    contents,
    values,
  };
}

function setEnvValue(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  if (pattern.test(contents)) {
    return contents.replace(pattern, line);
  }

  const suffix = contents.endsWith("\n") || contents.length === 0 ? "" : "\n";
  return `${contents}${suffix}${line}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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

function defaultComposeProjectName(cwd) {
  return `${sanitizeComposeProjectName(path.basename(cwd))}-release-rehearsal`;
}

function randomSecret(prefix) {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

function randomPrivateKey() {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function hasMeaningfulValue(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return !/^<.+>$/u.test(normalized) && !/^(todo|changeme|replace-me)$/iu.test(normalized);
}

function shouldSet(values, key, force) {
  return force || !hasMeaningfulValue(values[key]);
}

function normalizeAddress(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^0x[a-fA-F0-9]{40}$/u.test(normalized) ? normalized : "";
}

function buildGeneratedMaterial(label) {
  const deployerPrivateKey = randomPrivateKey();
  const operatorPrivateKey = randomPrivateKey();
  const oraclePrivateKey = randomPrivateKey();
  const pauserPrivateKey = randomPrivateKey();
  const payoutPrivateKey = operatorPrivateKey;
  const jwtSecret = randomSecret(`arena_${label}_jwt`);
  const operatorAddress = addressFromPrivateKey(operatorPrivateKey);
  const adminAddress = addressFromPrivateKey(deployerPrivateKey);
  const oracleAddress = addressFromPrivateKey(oraclePrivateKey);
  const pauserAddress = addressFromPrivateKey(pauserPrivateKey);
  const token = createHs256Jwt(
    {
      chainId: 11155111,
      roles: ["admin", "operator", "user"],
      sub: operatorAddress.toLowerCase(),
      walletAddress: operatorAddress,
    },
    jwtSecret,
    {
      expiresInSeconds: 60 * 60 * 24 * 365,
      issuedAt: Math.floor(Date.now() / 1000),
    },
  );

  return {
    ARENA_INTERNAL_OPERATOR_BEARER_TOKEN: token,
    ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS: `closure:${randomSecret(`arena_${label}_alert`)}`,
    ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY: payoutPrivateKey,
    ARENA_VALIDATION_ADMIN_ADDRESS: adminAddress,
    ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY: deployerPrivateKey,
    ARENA_VALIDATION_OPERATOR_ADDRESS: operatorAddress,
    ARENA_VALIDATION_OPERATOR_PRIVATE_KEY: operatorPrivateKey,
    ARENA_VALIDATION_ORACLE_ADDRESS: oracleAddress,
    ARENA_VALIDATION_ORACLE_PRIVATE_KEY: oraclePrivateKey,
    ARENA_VALIDATION_PAUSER_ADDRESS: pauserAddress,
    ARENA_VALIDATION_PAUSER_PRIVATE_KEY: pauserPrivateKey,
    JWT_SECRET: jwtSecret,
    OPERATOR_WALLET_ADDRESSES: operatorAddress.toLowerCase(),
    ADMIN_WALLET_ADDRESSES: adminAddress.toLowerCase(),
  };
}

function applyValues(filePath, valuesToApply, options) {
  const envFile = readEnvFile(filePath);
  let contents = envFile.contents;
  const changedKeys = [];

  for (const [key, value] of Object.entries(valuesToApply)) {
    if (!hasMeaningfulValue(value) || !shouldSet(envFile.values, key, options.force)) {
      continue;
    }

    contents = setEnvValue(contents, key, value);
    envFile.values[key] = value;
    changedKeys.push(key);
  }

  if (changedKeys.length > 0) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, "utf8");
  }

  return {
    changedKeys,
    values: envFile.values,
  };
}

function summarizeMissing(values, keys) {
  return keys.filter((key) => !hasMeaningfulValue(values[key]));
}

function omitEmptyValues(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => hasMeaningfulValue(value)),
  );
}

function parseDeploymentArtifact(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function collectDeploymentArtifacts(directoryPath, pattern) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => ({
      artifact: parseDeploymentArtifact(path.resolve(directoryPath, entry.name)),
      filePath: path.resolve(directoryPath, entry.name),
    }))
    .filter((entry) => entry.artifact)
    .sort((left, right) => String(left.filePath).localeCompare(String(right.filePath)));
}

function extractArtifactChainId(artifact) {
  const networkChainId = artifact?.network?.chainId;
  if (Number.isInteger(networkChainId)) {
    return networkChainId;
  }

  const parsedNetworkChainId = Number.parseInt(String(networkChainId || ""), 10);
  if (!Number.isNaN(parsedNetworkChainId)) {
    return parsedNetworkChainId;
  }

  const chainId = artifact?.chainId;
  if (Number.isInteger(chainId)) {
    return chainId;
  }

  const parsedChainId = Number.parseInt(String(chainId || ""), 10);
  return Number.isNaN(parsedChainId) ? null : parsedChainId;
}

function extractArtifactRpcUrl(artifact) {
  if (hasMeaningfulValue(artifact?.network?.rpcUrl)) {
    return String(artifact.network.rpcUrl).trim();
  }

  if (hasMeaningfulValue(artifact?.rpcUrl)) {
    return String(artifact.rpcUrl).trim();
  }

  return "";
}

function isLocalArtifact(artifact) {
  const chainId = extractArtifactChainId(artifact);
  if (chainId === 1337 || chainId === 31337) {
    return true;
  }

  const rpcUrl = extractArtifactRpcUrl(artifact);
  return /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(?::\d+)?/iu.test(rpcUrl);
}

function isNonLocalArtifact(artifact) {
  const chainId = extractArtifactChainId(artifact);
  const rpcUrl = extractArtifactRpcUrl(artifact);

  if (isLocalArtifact(artifact)) {
    return false;
  }

  if (chainId !== null) {
    return true;
  }

  return hasMeaningfulValue(rpcUrl);
}

function extractArtifactAddress(artifact, key) {
  return normalizeAddress(artifact?.[key]);
}

function chooseArtifactAddress(artifacts, key) {
  for (const entry of artifacts) {
    if (!isNonLocalArtifact(entry.artifact)) {
      continue;
    }

    const address = extractArtifactAddress(entry.artifact, key);
    if (address) {
      return address;
    }
  }

  return "";
}

function discoverDeploymentArtifacts(cwd) {
  const deploymentsDirectory = path.resolve(cwd, "validation-rehearsal", "deployments");

  return {
    legacyArtifact: parseDeploymentArtifact(path.resolve(cwd, "deployment.json")),
    legacyArtifacts: collectDeploymentArtifacts(
      deploymentsDirectory,
      LEGACY_DEPLOYMENT_ARTIFACT_PATTERN,
    ),
    rewardPayoutArtifacts: collectDeploymentArtifacts(
      deploymentsDirectory,
      REWARD_PAYOUT_DEPLOYMENT_ARTIFACT_PATTERN,
    ),
    validationArtifacts: collectDeploymentArtifacts(
      deploymentsDirectory,
      VALIDATION_DEPLOYMENT_ARTIFACT_PATTERN,
    ),
  };
}

function chooseLegacyContractAddress(discoveredArtifacts) {
  const legacyArtifacts = [...(discoveredArtifacts.legacyArtifacts || [])];

  if (discoveredArtifacts.legacyArtifact) {
    legacyArtifacts.push({ artifact: discoveredArtifacts.legacyArtifact });
  }

  return chooseArtifactAddress(legacyArtifacts, "contractAddress");
}

function resolveExternalValues(options, currentValues) {
  const discoveredArtifacts = discoverDeploymentArtifacts(options.cwd || process.cwd());
  const legacyAddress =
    normalizeAddress(options.legacyContractAddress)
    || chooseLegacyContractAddress(discoveredArtifacts);

  return omitEmptyValues({
    ARENA_CONTRACT_ADDRESS: legacyAddress,
    COMPOSE_PROJECT_NAME:
      currentValues.COMPOSE_PROJECT_NAME
      || defaultComposeProjectName(options.cwd || process.cwd()),
    ARENA_INTERNAL_API_BASE_URL:
      options.baseUrl
      || currentValues.ARENA_INTERNAL_API_BASE_URL
      || DEFAULT_RELEASE_API_BASE_URL,
    ARENA_OPS_ALERT_WEBHOOK_TARGETS:
      options.opsAlertWebhookTargets || currentValues.ARENA_OPS_ALERT_WEBHOOK_TARGETS || "",
    ARENA_REWARD_PAYOUT_ERC20_ADDRESS:
      normalizeAddress(options.rewardPayoutTokenAddress)
      || chooseArtifactAddress(discoveredArtifacts.rewardPayoutArtifacts, "tokenAddress"),
    ARENA_VALIDATION_CONTRACT_ADDRESS:
      normalizeAddress(options.validationContractAddress)
      || chooseArtifactAddress(discoveredArtifacts.validationArtifacts, "contractAddress"),
    DATABASE_URL: options.databaseUrl || currentValues.DATABASE_URL || "",
    REDIS_URL: options.redisUrl || currentValues.REDIS_URL || "",
    RPC_URL: options.rpcUrl || currentValues.RPC_URL || DEFAULT_SEPOLIA_RPC_URL,
  });
}

function fillStagingClosureMaterials(options = {}) {
  const logger = options.logger || { fail, info, pass };
  const cwd = options.cwd || process.cwd();
  const currentEnvPath =
    options.currentEnvPath || path.resolve(cwd, "config", "staging.env");
  const previousEnvPath =
    options.previousEnvPath || path.resolve(cwd, "config", "staging.previous.env");
  const force = options.force === true;
  const currentGenerated = options.currentGenerated || buildGeneratedMaterial("current");
  const previousGenerated = options.previousGenerated || buildGeneratedMaterial("previous");
  const currentValues = readEnvFile(currentEnvPath).values;
  const externalValues = resolveExternalValues({ ...options, cwd }, currentValues);

  const currentResult = applyValues(
    currentEnvPath,
    {
      ...currentGenerated,
      ...externalValues,
    },
    { force },
  );
  const previousResult = applyValues(
    previousEnvPath,
    {
      ...previousGenerated,
      ...externalValues,
    },
    { force },
  );

  const currentMissingExternal = summarizeMissing(
    currentResult.values,
    CURRENT_REQUIRED_EXTERNAL_KEYS,
  );
  const previousMissingExternal = summarizeMissing(
    previousResult.values,
    PREVIOUS_REQUIRED_EXTERNAL_KEYS,
  );
  const currentGeneratedPresent = CURRENT_GENERATED_KEYS.filter((key) =>
    hasMeaningfulValue(currentResult.values[key]),
  );
  const previousGeneratedPresent = PREVIOUS_GENERATED_KEYS.filter((key) =>
    hasMeaningfulValue(previousResult.values[key]),
  );

  logger.info(`Current env updated keys: ${currentResult.changedKeys.join(", ") || "none"}`);
  logger.info(`Previous env updated keys: ${previousResult.changedKeys.join(", ") || "none"}`);
  logger.info(
    `Current generated material fingerprints: ${currentGeneratedPresent
      .map((key) => `${key}:${fingerprint(currentResult.values[key])}`)
      .join(", ")}`,
  );
  logger.info(
    `Previous generated material fingerprints: ${previousGeneratedPresent
      .map((key) => `${key}:${fingerprint(previousResult.values[key])}`)
      .join(", ")}`,
  );
  logger.info(
    `External current values still requiring real environment material: ${currentMissingExternal.join(", ") || "none"}`,
  );
  logger.info(
    `External previous values still requiring real environment material: ${previousMissingExternal.join(", ") || "none"}`,
  );
  logger.pass("Staging closure material files were safely hydrated.");

  return {
    currentGeneratedPresent,
    currentMissingExternal,
    currentUpdatedKeys: currentResult.changedKeys,
    previousGeneratedPresent,
    previousMissingExternal,
    previousUpdatedKeys: previousResult.changedKeys,
  };
}

async function main() {
  fillStagingClosureMaterials(parseArgs(process.argv.slice(2)));
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildGeneratedMaterial,
  fillStagingClosureMaterials,
  parseArgs,
};
