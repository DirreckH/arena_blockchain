const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

function loadEnvFile(filePath = path.resolve(process.cwd(), ".env")) {
  const loaded = {};

  if (!fs.existsSync(filePath)) {
    return {
      envPath: filePath,
      loaded,
      exists: false,
    };
  }

  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const delimiterIndex = line.indexOf("=");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    let value = line.slice(delimiterIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    loaded[key] = value;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return {
    envPath: filePath,
    loaded,
    exists: true,
  };
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/u.test(value);
}

function isPrivateKey(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/u.test(value);
}

function normalizeAddress(value) {
  return ethers.utils.getAddress(value);
}

function addressFromPrivateKey(value) {
  return new ethers.Wallet(value).address;
}

function shortAddress(value) {
  if (!value || value.length < 10) {
    return value ?? "";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function fail(message) {
  console.error(`FAIL: ${message}`);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function info(message) {
  console.log(`INFO: ${message}`);
}

function resolveValidationArtifactPath() {
  return path.resolve(
    process.cwd(),
    "artifacts",
    "contracts",
    "validation",
    "ArenaValidationMarket.sol",
    "ArenaValidationMarket.json",
  );
}

module.exports = {
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
};
