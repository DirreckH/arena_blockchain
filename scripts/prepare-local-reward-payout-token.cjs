#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const {
  addressFromPrivateKey,
  fail,
  info,
  loadEnvFile,
  pass,
} = require("./_validation-common.cjs");

const DEFAULT_TOTAL_SUPPLY = ethers.utils.parseUnits("1000000", 18).toString();

function defaultArtifactPath(cwd) {
  return path.resolve(
    cwd,
    "artifacts",
    "contracts",
    "validation",
    "LocalRewardPayoutToken.sol",
    "LocalRewardPayoutToken.json",
  );
}

function defaultOutputPath(cwd) {
  return path.resolve(
    cwd,
    "validation-rehearsal",
    "deployments",
    "deployment.reward-payout-token.local.json",
  );
}

function parseArgs(argv) {
  const cwd = process.cwd();
  const options = {
    cwd,
    envFilePath: path.resolve(cwd, ".env"),
    artifactPath: defaultArtifactPath(cwd),
    outputPath: defaultOutputPath(cwd),
    totalSupply: DEFAULT_TOTAL_SUPPLY,
    holderAddress: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--") {
      continue;
    }

    if (argument === "--env-file") {
      options.envFilePath = path.resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--artifact-path") {
      options.artifactPath = path.resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--output") {
      options.outputPath = path.resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--total-supply") {
      options.totalSupply = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--holder-address") {
      options.holderAddress = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

async function prepareLocalRewardPayoutToken(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = options.envFilePath || path.resolve(cwd, ".env");
  const artifactPath = options.artifactPath || defaultArtifactPath(cwd);
  const outputPath = options.outputPath || defaultOutputPath(cwd);
  const deployToken = options.deployToken || defaultDeployToken;
  const fileExists = options.fileExists || fs.existsSync;
  const mkdirSync = options.mkdirSync || fs.mkdirSync;
  const readFile = options.readFile || fs.readFileSync;
  const writeFile = options.writeFile || fs.writeFileSync;

  const envResult = loadEnvFile(envFilePath, { override: false });
  const loadedEnv = {
    ...envResult.loaded,
    ...(options.env || {}),
  };

  const rpcUrl = String(loadedEnv.RPC_URL || "").trim();
  if (!rpcUrl) {
    logger.fail(
      `Local reward payout token deployment requires RPC_URL in ${envFilePath}.`,
    );
    return 1;
  }

  const holderAddress = normalizeAddress(
    options.holderAddress || resolveHolderAddress(loadedEnv),
  );
  const deployerPrivateKey = resolveDeployerPrivateKey(loadedEnv);
  const totalSupply = normalizePositiveIntegerString(
    options.totalSupply || DEFAULT_TOTAL_SUPPLY,
    "totalSupply",
  );

  if (!fileExists(artifactPath)) {
    logger.fail(
      `Local reward payout token artifact not found at ${artifactPath}. Run pnpm exec hardhat compile first.`,
    );
    return 1;
  }

  const artifact = JSON.parse(readFile(artifactPath, "utf8"));
  const deployedBytecode = normalizeBytecode(artifact.deployedBytecode);
  if (!deployedBytecode) {
    logger.fail(
      `Local reward payout token artifact at ${artifactPath} is missing deployed bytecode. Recompile the contracts and rerun this command.`,
    );
    return 1;
  }

  const deployment = await deployToken({
    artifact,
    holderAddress,
    rpcUrl,
    totalSupply,
    deployerPrivateKey,
  });
  const tokenAddress = normalizeAddress(deployment.tokenAddress);

  if (envResult.exists) {
    updateEnvFileTokenAddress({
      envFilePath,
      tokenAddress,
      readFile,
      writeFile,
    });
  }

  const output = {
    network: {
      chainId: Number(loadedEnv.CHAIN_ID || 1337),
      rpcUrl,
    },
    tokenAddress,
    deploymentTxHash: deployment.deploymentTxHash,
    deployerAddress: deployment.deployerAddress,
    holderAddress,
    totalSupply,
    artifactPath,
    deployedAt: new Date().toISOString(),
    codeHash: ethers.utils.keccak256(deployedBytecode),
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  logger.info(`Local reward payout token artifact: ${outputPath}`);
  logger.info(`Updated ${envFilePath} with ARENA_REWARD_PAYOUT_ERC20_ADDRESS=${tokenAddress}`);
  logger.pass(
    `Local reward payout token prepared at ${tokenAddress} and funded for ${holderAddress}.`,
  );
  return 0;
}

function resolveHolderAddress(env) {
  const rewardKey = String(
    env.ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY || "",
  ).trim();
  if (rewardKey) {
    return addressFromPrivateKey(rewardKey);
  }

  const validationKey = String(
    env.ARENA_VALIDATION_OPERATOR_PRIVATE_KEY || "",
  ).trim();
  if (validationKey) {
    return addressFromPrivateKey(validationKey);
  }

  throw new Error(
    "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY or ARENA_VALIDATION_OPERATOR_PRIVATE_KEY is required",
  );
}

function resolveDeployerPrivateKey(env) {
  const rewardKey = String(
    env.ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY || "",
  ).trim();
  if (rewardKey) {
    return rewardKey;
  }

  const validationKey = String(
    env.ARENA_VALIDATION_OPERATOR_PRIVATE_KEY || "",
  ).trim();
  if (validationKey) {
    return validationKey;
  }

  throw new Error(
    "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY or ARENA_VALIDATION_OPERATOR_PRIVATE_KEY is required",
  );
}

function normalizeAddress(value) {
  return ethers.utils.getAddress(String(value || "").trim());
}

function normalizeBytecode(value) {
  const bytecode = String(value || "").trim();
  if (!bytecode || bytecode === "0x") {
    return "";
  }

  return bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`;
}

function normalizePositiveIntegerString(value, label) {
  const normalized = String(value || "").trim();
  if (!/^[0-9]+$/u.test(normalized) || normalized === "0") {
    throw new Error(`${label} must be a non-zero integer string`);
  }

  return normalized;
}

async function defaultDeployToken({
  artifact,
  holderAddress,
  rpcUrl,
  totalSupply,
  deployerPrivateKey,
}) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(deployerPrivateKey, provider);
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
  );
  const contract = await factory.deploy(holderAddress, totalSupply);
  await contract.deployed();

  return {
    tokenAddress: contract.address,
    deploymentTxHash: contract.deployTransaction.hash,
    deployerAddress: wallet.address,
  };
}

function updateEnvFileTokenAddress({ envFilePath, tokenAddress, readFile, writeFile }) {
  const contents = readFile(envFilePath, "utf8");
  const nextLine = `ARENA_REWARD_PAYOUT_ERC20_ADDRESS=${tokenAddress}`;
  const nextContents = contents.match(/^ARENA_REWARD_PAYOUT_ERC20_ADDRESS=/m)
    ? contents.replace(/^ARENA_REWARD_PAYOUT_ERC20_ADDRESS=.*$/m, nextLine)
    : `${contents.replace(/\n*$/u, "\n")}${nextLine}\n`;

  writeFile(envFilePath, nextContents, "utf8");
}

async function main() {
  const exitCode = await prepareLocalRewardPayoutToken(
    parseArgs(process.argv.slice(2)),
  );
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_TOTAL_SUPPLY,
  defaultArtifactPath,
  defaultOutputPath,
  normalizeAddress,
  normalizeBytecode,
  normalizePositiveIntegerString,
  parseArgs,
  prepareLocalRewardPayoutToken,
  resolveDeployerPrivateKey,
  resolveHolderAddress,
  updateEnvFileTokenAddress,
};
