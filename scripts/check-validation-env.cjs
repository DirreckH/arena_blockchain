#!/usr/bin/env node

const {
  addressFromPrivateKey,
  fail,
  info,
  isAddress,
  isPrivateKey,
  loadEnvFile,
  normalizeAddress,
  pass,
  shortAddress,
} = require("./_validation-common.cjs");

const requiredKeys = [
  "DATABASE_URL",
  "REDIS_URL",
  "RPC_URL",
  "CHAIN_ID",
  "ARENA_CONTRACT_ADDRESS",
  "ARENA_VALIDATION_ENVIRONMENT",
  "ARENA_VALIDATION_CONTRACT_ADDRESS",
  "ARENA_VALIDATION_SYNC_CONFIRMATIONS",
  "ARENA_VALIDATION_SYNC_BATCH_SIZE",
  "ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS",
  "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY",
  "ARENA_VALIDATION_ORACLE_PRIVATE_KEY",
  "ARENA_VALIDATION_PAUSER_PRIVATE_KEY",
];

const optionalAddressPairs = [
  ["ARENA_VALIDATION_ADMIN_ADDRESS", null],
  ["ARENA_VALIDATION_OPERATOR_ADDRESS", "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY"],
  ["ARENA_VALIDATION_ORACLE_ADDRESS", "ARENA_VALIDATION_ORACLE_PRIVATE_KEY"],
  ["ARENA_VALIDATION_PAUSER_ADDRESS", "ARENA_VALIDATION_PAUSER_PRIVATE_KEY"],
];

function main() {
  const envState = loadEnvFile(undefined, { override: true });
  info(
    envState.exists
      ? `Loaded .env from ${envState.envPath}`
      : `No .env file found at ${envState.envPath}; using process env only`,
  );

  const blockers = [];

  for (const key of requiredKeys) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      blockers.push(`${key} is required for validation-chain staging/testnet integration`);
    }
  }

  const legacyAddress = process.env.ARENA_CONTRACT_ADDRESS;
  const validationAddress = process.env.ARENA_VALIDATION_CONTRACT_ADDRESS;
  if (legacyAddress && validationAddress) {
    if (!isAddress(legacyAddress)) {
      blockers.push("ARENA_CONTRACT_ADDRESS must be a 20-byte hex address");
    }
    if (!isAddress(validationAddress)) {
      blockers.push("ARENA_VALIDATION_CONTRACT_ADDRESS must be a 20-byte hex address");
    }
    if (
      isAddress(legacyAddress) &&
      isAddress(validationAddress) &&
      normalizeAddress(legacyAddress) === normalizeAddress(validationAddress)
    ) {
      blockers.push(
        "ARENA_VALIDATION_CONTRACT_ADDRESS must not reuse ARENA_CONTRACT_ADDRESS",
      );
    }
  }

  for (const [addressKey, privateKeyKey] of optionalAddressPairs) {
    const addressValue = process.env[addressKey];
    if (addressValue && !isAddress(addressValue)) {
      blockers.push(`${addressKey} must be a 20-byte hex address when set`);
    }

    if (!privateKeyKey) {
      continue;
    }

    const privateKeyValue = process.env[privateKeyKey];
    if (!privateKeyValue || privateKeyValue.trim().length === 0) {
      continue;
    }
    if (!isPrivateKey(privateKeyValue)) {
      blockers.push(`${privateKeyKey} must be a 32-byte hex private key prefixed with 0x`);
      continue;
    }

    const derivedAddress = addressFromPrivateKey(privateKeyValue);
    info(`${privateKeyKey} => ${shortAddress(derivedAddress)}`);
    if (
      addressValue &&
      isAddress(addressValue) &&
      normalizeAddress(addressValue) !== normalizeAddress(derivedAddress)
    ) {
      blockers.push(
        `${addressKey} does not match the address derived from ${privateKeyKey}`,
      );
    }
  }

  const environment = process.env.ARENA_VALIDATION_ENVIRONMENT;
  if (
    environment &&
    !["local", "dev", "staging", "prod"].includes(environment)
  ) {
    blockers.push(
      "ARENA_VALIDATION_ENVIRONMENT must be one of local, dev, staging, prod",
    );
  }

  const chainId = process.env.CHAIN_ID;
  if (chainId && !/^[1-9][0-9]*$/u.test(chainId)) {
    blockers.push("CHAIN_ID must be a positive integer");
  }

  for (const key of [
    "ARENA_VALIDATION_SYNC_CONFIRMATIONS",
    "ARENA_VALIDATION_SYNC_BATCH_SIZE",
    "ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS",
  ]) {
    const value = process.env[key];
    if (value && !/^[1-9][0-9]*$/u.test(value)) {
      blockers.push(`${key} must be a positive integer`);
    }
  }

  if (blockers.length > 0) {
    for (const blocker of blockers) {
      fail(blocker);
    }
    process.exitCode = 1;
    return;
  }

  pass("Validation-chain env is complete enough for staging/testnet preflight");
  info(`validation environment: ${process.env.ARENA_VALIDATION_ENVIRONMENT}`);
  info(`validation contract: ${process.env.ARENA_VALIDATION_CONTRACT_ADDRESS}`);
  info(`rpc url: ${process.env.RPC_URL}`);
  info(`chain id: ${process.env.CHAIN_ID}`);
}

main();
