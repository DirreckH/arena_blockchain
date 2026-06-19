#!/usr/bin/env node

const fs = require("node:fs");
const { ethers } = require("ethers");

const {
  addressFromPrivateKey,
  fail,
  info,
  isAddress,
  isPrivateKey,
  loadEnvFile,
  normalizeAddress,
  pass,
  resolveValidationArtifactPath,
  shortAddress,
} = require("./_validation-common.cjs");

const DEFAULT_ADMIN_ROLE = ethers.constants.HashZero;

function parseArgs(argv) {
  const options = {
    envFilePath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--") {
      continue;
    }

    if (argument === "--env-file") {
      options.envFilePath = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

async function main(options = {}) {
  const envState = loadEnvFile(options.envFilePath, { override: true });
  info(
    envState.exists
      ? `Loaded .env from ${envState.envPath}`
      : `No .env file found at ${envState.envPath}; using process env only`,
  );

  const blockers = [];
  for (const key of [
    "RPC_URL",
    "CHAIN_ID",
    "ARENA_VALIDATION_CONTRACT_ADDRESS",
  ]) {
    if (!process.env[key] || process.env[key].trim().length === 0) {
      blockers.push(`${key} is required`);
    }
  }

  const artifactPath = resolveValidationArtifactPath();
  if (!fs.existsSync(artifactPath)) {
    blockers.push(
      `Validation artifact missing at ${artifactPath}. Run pnpm exec hardhat compile first.`,
    );
  }

  if (blockers.length > 0) {
    for (const blocker of blockers) {
      fail(blocker);
    }
    process.exitCode = 1;
    return;
  }

  let hasFailures = false;
  const markFail = (message) => {
    fail(message);
    hasFailures = true;
  };

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_URL,
    Number(process.env.CHAIN_ID),
  );

  const contractAddress = normalizeAddress(process.env.ARENA_VALIDATION_CONTRACT_ADDRESS);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== Number(process.env.CHAIN_ID)) {
    fail(
      `CHAIN_ID mismatch. Expected ${process.env.CHAIN_ID}, provider returned ${Number(network.chainId)}`,
    );
    process.exitCode = 1;
    return;
  }
  pass(`Provider chain id matches env: ${Number(network.chainId)}`);

  const onChainCode = await provider.getCode(contractAddress);
  if (!onChainCode || onChainCode === "0x") {
    fail(`No runtime code found at ${contractAddress}`);
    process.exitCode = 1;
    return;
  }
  pass(`Runtime code found at ${contractAddress}`);

  const artifactRuntime = String(artifact.deployedBytecode || "").toLowerCase();
  const normalizedOnChainCode = onChainCode.toLowerCase();
  const runtimeMatches = artifactRuntime === normalizedOnChainCode;
  if (!runtimeMatches) {
    markFail(
      "On-chain runtime bytecode does not match the local ArenaValidationMarket artifact",
    );
  } else {
    pass("On-chain runtime bytecode matches local ArenaValidationMarket artifact");
  }

  info(`artifact path: ${artifactPath}`);
  info(`runtime bytecode hash: ${ethers.utils.keccak256(normalizedOnChainCode)}`);

  const contract = new ethers.Contract(contractAddress, artifact.abi, provider);
  const paused = await contract.paused();
  info(`paused: ${paused}`);

  const roleChecks = [
    {
      label: "admin",
      roleName: null,
      address:
        process.env.ARENA_VALIDATION_ADMIN_ADDRESS &&
        process.env.ARENA_VALIDATION_ADMIN_ADDRESS.trim(),
    },
    resolveSigner("operator", "OPERATOR_ROLE"),
    resolveSigner("oracle", "ORACLE_ROLE"),
    resolveSigner("pauser", "PAUSER_ROLE"),
  ];

  for (const roleCheck of roleChecks) {
    if (!roleCheck || !roleCheck.address) {
      continue;
    }

    if (!isAddress(roleCheck.address)) {
      markFail(`${roleCheck.label} address is not a valid EVM address`);
      continue;
    }

    const address = normalizeAddress(roleCheck.address);
    const balance = await provider.getBalance(address);
    info(`${roleCheck.label} address: ${shortAddress(address)} balance=${balance.toString()}`);

    if (balance.isZero()) {
      markFail(`${roleCheck.label} address has zero native token balance`);
    } else {
      pass(`${roleCheck.label} address has native token balance`);
    }

    const roleId =
      roleCheck.roleName === null ? DEFAULT_ADMIN_ROLE : await contract[roleCheck.roleName]();
    const hasRole = await contract.hasRole(roleId, address);
    if (!hasRole) {
      markFail(`${roleCheck.label} address is missing required on-chain role`);
    } else {
      pass(`${roleCheck.label} address has required on-chain role`);
    }
  }

  if (hasFailures) {
    process.exitCode = 1;
  }
}

function resolveSigner(label, roleName) {
  const envPrefix = `ARENA_VALIDATION_${label.toUpperCase()}`;
  const privateKey = process.env[`${envPrefix}_PRIVATE_KEY`] || "";
  const explicitAddress = process.env[`${envPrefix}_ADDRESS`] || "";

  if (privateKey && !isPrivateKey(privateKey)) {
    fail(`${envPrefix}_PRIVATE_KEY must be a 32-byte hex private key prefixed with 0x`);
    process.exitCode = 1;
    return {
      label,
      roleName,
      address: null,
    };
  }

  const derivedAddress = privateKey ? addressFromPrivateKey(privateKey) : null;
  if (derivedAddress && explicitAddress && isAddress(explicitAddress)) {
    if (normalizeAddress(derivedAddress) !== normalizeAddress(explicitAddress)) {
      fail(
        `${envPrefix}_ADDRESS does not match the address derived from ${envPrefix}_PRIVATE_KEY`,
      );
      process.exitCode = 1;
      return {
        label,
        roleName,
        address: derivedAddress,
      };
    }
  }

  const finalAddress = derivedAddress || explicitAddress || null;
  if (!finalAddress) {
    fail(`${envPrefix}_PRIVATE_KEY or ${envPrefix}_ADDRESS must be set`);
    process.exitCode = 1;
    return {
      label,
      roleName,
      address: null,
    };
  }

  return {
    label,
    roleName,
    address: finalAddress,
  };
}

main(parseArgs(process.argv.slice(2))).catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
