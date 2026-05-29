const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ethers } = require("ethers");

function loadEnvFile(
  filePath = path.resolve(process.cwd(), ".env"),
  options = {},
) {
  const override = options.override === true;
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
    if (override || process.env[key] === undefined) {
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

function createHs256Jwt(payload, secret, options = {}) {
  const issuedAt =
    typeof options.issuedAt === "number"
      ? Math.floor(options.issuedAt)
      : Math.floor(Date.now() / 1000);
  const expiresInSeconds =
    typeof options.expiresInSeconds === "number"
      ? Math.floor(options.expiresInSeconds)
      : 60 * 60 * 24;
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const normalizedPayload = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
  };
  const encodedHeader = encodeBase64UrlJson(header);
  const encodedPayload = encodeBase64UrlJson(normalizedPayload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

function encodeBase64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function verifyHs256Jwt(token, secret) {
  if (typeof token !== "string") {
    throw new Error("JWT token must be a string");
  }

  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new Error("JWT token must contain three segments");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  if (encodedSignature !== expectedSignature) {
    throw new Error("JWT signature mismatch");
  }

  return {
    header: JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")),
    payload: JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ),
  };
}

function formatFetchFailure(error, input) {
  const targetUrl = String(input?.url ?? "");
  const label = input?.label ?? "remote resource";
  const fallbackMessage =
    error instanceof Error && error.message
      ? error.message
      : String(error);
  const causeCode =
    error &&
    typeof error === "object" &&
    error.cause &&
    typeof error.cause === "object" &&
    typeof error.cause.code === "string"
      ? error.cause.code
      : null;

  if (causeCode === "ECONNREFUSED" || /ECONNREFUSED/u.test(fallbackMessage)) {
    return `Unable to reach ${label} at ${targetUrl}. Connection was refused, which usually means the API is not running yet or the base URL/port is wrong. Start the backend with pnpm run api:start or pass --base-url <http://host:port>, then retry.`;
  }

  if (causeCode === "ENOTFOUND" || /ENOTFOUND/u.test(fallbackMessage)) {
    return `Unable to resolve ${label} host for ${targetUrl}. Check the hostname in --base-url or ARENA_INTERNAL_API_BASE_URL, then retry.`;
  }

  if (causeCode === "ETIMEDOUT" || /ETIMEDOUT|timed out/u.test(fallbackMessage)) {
    return `Unable to reach ${label} at ${targetUrl}. The request timed out, so confirm the backend is reachable on the target network and retry.`;
  }

  return `Unable to reach ${label} at ${targetUrl}: ${fallbackMessage}`;
}

module.exports = {
  addressFromPrivateKey,
  createHs256Jwt,
  fail,
  formatFetchFailure,
  info,
  isAddress,
  isPrivateKey,
  loadEnvFile,
  normalizeAddress,
  pass,
  resolveValidationArtifactPath,
  shortAddress,
  verifyHs256Jwt,
};
