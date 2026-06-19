#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const {
  addressFromPrivateKey,
  createHs256Jwt,
  info,
  loadEnvFile,
  pass,
  verifyHs256Jwt,
} = require("./_validation-common.cjs");

const ROOT_DIR = process.cwd();
const ENV_PATH = path.resolve(ROOT_DIR, ".env");
const ENV_EXAMPLE_PATH = path.resolve(ROOT_DIR, ".env.example");
const DEPLOYMENT_INFO_PATH = path.resolve(ROOT_DIR, "deployment.validation.json");
const HARDHAT_LOCAL_ADMIN_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function main() {
  ensureEnvFile();
  loadEnvFile(ENV_PATH, { override: true });

  const adminWallet = {
    privateKey: HARDHAT_LOCAL_ADMIN_PRIVATE_KEY,
    address: addressFromPrivateKey(HARDHAT_LOCAL_ADMIN_PRIVATE_KEY),
  };
  const operatorWallet = adminWallet;
  const oracleWallet = adminWallet;
  const pauserWallet = adminWallet;

  const desiredValues = {
    NODE_ENV: "development",
    ARENA_PROCESS_ROLE: "all",
    PORT: "4000",
    DATABASE_URL:
      "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
    REDIS_URL: "redis://127.0.0.1:6379/0",
    JWT_SECRET: "arena-local-dev-secret-change-before-production",
    AUTH_CHALLENGE_TTL: "300",
    RPC_URL: "http://127.0.0.1:8545",
    CHAIN_ID: "1337",
    ARENA_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
    ARENA_VALIDATION_ENVIRONMENT: "local",
    ARENA_VALIDATION_CONTRACT_ADDRESS: resolveValidationContractAddress(),
    ARENA_VALIDATION_SYNC_CONFIRMATIONS: "1",
    ARENA_VALIDATION_SYNC_BATCH_SIZE: "500",
    ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS: "15000",
    ARENA_VALIDATION_OPERATOR_PRIVATE_KEY: operatorWallet.privateKey,
    ARENA_VALIDATION_ORACLE_PRIVATE_KEY: oracleWallet.privateKey,
    ARENA_VALIDATION_PAUSER_PRIVATE_KEY: pauserWallet.privateKey,
    ARENA_VALIDATION_ADMIN_ADDRESS: adminWallet.address,
    ARENA_VALIDATION_OPERATOR_ADDRESS: operatorWallet.address,
    ARENA_VALIDATION_ORACLE_ADDRESS: oracleWallet.address,
    ARENA_VALIDATION_PAUSER_ADDRESS: pauserWallet.address,
    ARENA_REWARD_PAYOUT_ASSET_SYMBOL: "USDC",
    ARENA_REWARD_PAYOUT_ERC20_ADDRESS:
      "0x0000000000000000000000000000000000000010",
    ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY: operatorWallet.privateKey,
    OPERATOR_WALLET_ADDRESSES: operatorWallet.address.toLowerCase(),
    ADMIN_WALLET_ADDRESSES: adminWallet.address.toLowerCase(),
    SYSTEM_WALLET_ADDRESSES: "",
  };
  desiredValues.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN =
    resolveLocalOperatorBearerToken(desiredValues, operatorWallet.address);

  const updateSummary = updateEnvFile(desiredValues);

  info(`Updated .env at ${ENV_PATH}`);
  info(`admin: ${adminWallet.address}`);
  info(`operator: ${operatorWallet.address}`);
  info(`oracle: ${oracleWallet.address}`);
  info(`pauser: ${pauserWallet.address}`);
  info(
    `validation contract: ${desiredValues.ARENA_VALIDATION_CONTRACT_ADDRESS}`,
  );

  for (const key of updateSummary.changedKeys) {
    pass(`set ${key}`);
  }

  if (updateSummary.changedKeys.length === 0) {
    pass("Local validation env already matched the bootstrap template");
  } else {
    pass(
      "Local validation env bootstrap complete. Next: pnpm deps:up, pnpm exec hardhat compile, pnpm exec hardhat node, pnpm run validation:deploy -- --network localhost, pnpm run validation:preflight",
    );
  }
}

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    return;
  }

  if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
    throw new Error(`Missing env example at ${ENV_EXAMPLE_PATH}`);
  }

  fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
  info(`Created .env from ${ENV_EXAMPLE_PATH}`);
}

function resolveValidationContractAddress() {
  if (!fs.existsSync(DEPLOYMENT_INFO_PATH)) {
    return "0x0000000000000000000000000000000000000002";
  }

  try {
    const payload = JSON.parse(fs.readFileSync(DEPLOYMENT_INFO_PATH, "utf8"));
    if (
      payload &&
      typeof payload.contractAddress === "string" &&
      ethers.utils.isAddress(payload.contractAddress)
    ) {
      return payload.contractAddress;
    }
  } catch {
    // Ignore malformed deployment info and keep the placeholder fallback.
  }

  return "0x0000000000000000000000000000000000000002";
}

function resolveLocalOperatorBearerToken(desiredValues, operatorWalletAddress) {
  const existingToken = process.env.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN;
  if (
    isReusableLocalOperatorBearerToken(
      existingToken,
      desiredValues,
      operatorWalletAddress,
    )
  ) {
    return existingToken;
  }

  return createHs256Jwt(
    {
      sub: operatorWalletAddress.toLowerCase(),
      walletAddress: operatorWalletAddress,
      chainId: Number(desiredValues.CHAIN_ID),
      roles: ["admin", "operator", "user"],
    },
    desiredValues.JWT_SECRET,
    {
      expiresInSeconds: 60 * 60 * 24,
    },
  );
}

function isReusableLocalOperatorBearerToken(
  token,
  desiredValues,
  operatorWalletAddress,
) {
  if (typeof token !== "string" || token.trim().length === 0) {
    return false;
  }

  try {
    const { payload } = verifyHs256Jwt(token, desiredValues.JWT_SECRET);
    const expectedRoles = ["admin", "operator", "user"];
    const normalizedRoles = Array.isArray(payload.roles) ? payload.roles : [];
    const nowSeconds = Math.floor(Date.now() / 1000);

    return (
      payload.sub === operatorWalletAddress.toLowerCase() &&
      payload.walletAddress === operatorWalletAddress &&
      payload.chainId === Number(desiredValues.CHAIN_ID) &&
      normalizedRoles.length === expectedRoles.length &&
      expectedRoles.every((role, index) => normalizedRoles[index] === role) &&
      typeof payload.exp === "number" &&
      payload.exp > nowSeconds
    );
  } catch {
    return false;
  }
}

function updateEnvFile(desiredValues) {
  const original = fs.readFileSync(ENV_PATH, "utf8");
  const lines = original.split(/\r?\n/u);
  const keyIndex = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^([A-Z0-9_]+)=/u.exec(line);
    if (match) {
      keyIndex.set(match[1], index);
    }
  }

  const changedKeys = [];
  for (const [key, value] of Object.entries(desiredValues)) {
    const nextLine = `${key}=${value}`;
    const existingIndex = keyIndex.get(key);

    if (existingIndex === undefined) {
      lines.push(nextLine);
      changedKeys.push(key);
      continue;
    }

    if (lines[existingIndex] !== nextLine) {
      lines[existingIndex] = nextLine;
      changedKeys.push(key);
    }
  }

  const nextContents = `${lines.join("\n").replace(/\n*$/u, "\n")}`;
  fs.writeFileSync(ENV_PATH, nextContents);

  return {
    changedKeys,
  };
}

main();
