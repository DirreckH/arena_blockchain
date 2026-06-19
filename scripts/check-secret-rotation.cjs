#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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

const ROTATION_KEYS = [
  {
    key: "JWT_SECRET",
    label: "JWT secret",
    type: "secret",
  },
  {
    key: "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY",
    label: "validation operator signer",
    type: "privateKey",
  },
  {
    key: "ARENA_VALIDATION_ORACLE_PRIVATE_KEY",
    label: "validation oracle signer",
    type: "privateKey",
  },
  {
    key: "ARENA_VALIDATION_PAUSER_PRIVATE_KEY",
    label: "validation pauser signer",
    type: "privateKey",
  },
  {
    key: "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY",
    label: "reward payout signer",
    type: "privateKey",
  },
  {
    key: "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN",
    label: "internal operator bearer token",
    type: "secret",
  },
];

const OPTIONAL_KEYED_MAPPINGS = [
  {
    key: "REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS",
    label: "requester delivery bearer tokens",
    separator: ":",
  },
  {
    key: "ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS",
    label: "ops alert bearer tokens",
    separator: ":",
  },
];

const HARDHAT_LOCAL_ADMIN_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function parseArgs(argv) {
  const options = {
    currentEnvPath: path.resolve(process.cwd(), ".env"),
    previousEnvPath: path.resolve(process.cwd(), ".env.previous"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--") {
      continue;
    }

    if (argument === "--env-file") {
      options.currentEnvPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--current-env") {
      options.currentEnvPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--previous-env") {
      options.previousEnvPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--output") {
      options.outputPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function parseEnvFile(filePath) {
  return loadEnvFile(filePath, { override: false }).loaded;
}

function parseKeyedMappings(rawValue, separator) {
  return String(rawValue || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .reduce((mappings, entry) => {
      const separatorIndex = entry.indexOf(separator);
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        return mappings;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key.length === 0 || value.length === 0) {
        return mappings;
      }

      mappings[key] = value;
      return mappings;
    }, {});
}

function summarizeSecretRotation(keyDefinition, previousValue, currentValue) {
  const summary = {
    changed: false,
    currentFingerprint: currentValue ? hashSecret(currentValue) : "",
    key: keyDefinition.key,
    label: keyDefinition.label,
    previousFingerprint: previousValue ? hashSecret(previousValue) : "",
    valid: true,
    warnings: [],
  };

  if (!currentValue) {
    summary.valid = false;
    summary.warnings.push(`${keyDefinition.key} is missing in the current env.`);
    return summary;
  }

  summary.changed = previousValue.length > 0 && previousValue !== currentValue;

  if (keyDefinition.type !== "privateKey") {
    return summary;
  }

  if (!isPrivateKey(currentValue)) {
    summary.valid = false;
    summary.warnings.push(
      `${keyDefinition.key} must be a 32-byte hex private key prefixed with 0x.`,
    );
    return summary;
  }

  if (currentValue.toLowerCase() === HARDHAT_LOCAL_ADMIN_PRIVATE_KEY) {
    summary.valid = false;
    summary.warnings.push(
      `${keyDefinition.key} still uses the local Hardhat bootstrap private key.`,
    );
  }

  const currentAddress = addressFromPrivateKey(currentValue);
  summary.currentAddress = normalizeAddress(currentAddress);
  summary.currentAddressShort = shortAddress(currentAddress);

  if (previousValue && isPrivateKey(previousValue)) {
    const previousAddress = addressFromPrivateKey(previousValue);
    summary.previousAddress = normalizeAddress(previousAddress);
    summary.previousAddressShort = shortAddress(previousAddress);
  }

  return summary;
}

function summarizeBearerMappingRotation(definition, previousRawValue, currentRawValue) {
  const previousEntries = parseKeyedMappings(previousRawValue, definition.separator);
  const currentEntries = parseKeyedMappings(currentRawValue, definition.separator);
  const entryKeys = Array.from(
    new Set([...Object.keys(previousEntries), ...Object.keys(currentEntries)]),
  ).sort();

  const entries = entryKeys.map((entryKey) => {
    const previousValue = previousEntries[entryKey] || "";
    const currentValue = currentEntries[entryKey] || "";
    return {
      changed: previousValue.length > 0 && previousValue !== currentValue,
      currentFingerprint: currentValue ? hashSecret(currentValue) : "",
      entryKey,
      missing: currentValue.length === 0,
      previousFingerprint: previousValue ? hashSecret(previousValue) : "",
    };
  });

  return {
    entries,
    key: definition.key,
    label: definition.label,
  };
}

async function checkSecretRotation(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const currentEnvPath = options.currentEnvPath || path.resolve(cwd, ".env");
  const previousEnvPath =
    options.previousEnvPath || path.resolve(cwd, ".env.previous");
  const outputPath =
    options.outputPath ||
    path.resolve(cwd, "validation-local", "secret-rotation-audit.json");

  if (!fs.existsSync(currentEnvPath)) {
    logger.fail(
      `Current env file not found at ${currentEnvPath}. Provide --current-env <path> for the env you want to audit.`,
    );
    return 1;
  }

  if (!fs.existsSync(previousEnvPath)) {
    logger.fail(
      `Previous env file not found at ${previousEnvPath}. Provide --previous-env <path> with the prior secret material to compare against rotation state.`,
    );
    return 1;
  }

  const currentEnv = parseEnvFile(currentEnvPath);
  const previousEnv = parseEnvFile(previousEnvPath);

  const blockers = [];
  const secretSummaries = ROTATION_KEYS.map((keyDefinition) =>
    summarizeSecretRotation(
      keyDefinition,
      String(previousEnv[keyDefinition.key] || ""),
      String(currentEnv[keyDefinition.key] || ""),
    ),
  );

  for (const summary of secretSummaries) {
    if (summary.valid !== true) {
      blockers.push(...summary.warnings);
      continue;
    }

    if (summary.changed !== true) {
      blockers.push(
        `${summary.key} did not change between ${previousEnvPath} and ${currentEnvPath}.`,
      );
    }
  }

  const bearerMappingSummaries = OPTIONAL_KEYED_MAPPINGS.map((definition) =>
    summarizeBearerMappingRotation(
      definition,
      String(previousEnv[definition.key] || ""),
      String(currentEnv[definition.key] || ""),
    ),
  );

  for (const summary of bearerMappingSummaries) {
    for (const entry of summary.entries) {
      if (entry.missing) {
        continue;
      }

      if (entry.changed !== true) {
        blockers.push(
          `${summary.key}:${entry.entryKey} did not change between ${previousEnvPath} and ${currentEnvPath}.`,
        );
      }
    }
  }

  const validationAddresses = [
    "ARENA_VALIDATION_OPERATOR_ADDRESS",
    "ARENA_VALIDATION_ORACLE_ADDRESS",
    "ARENA_VALIDATION_PAUSER_ADDRESS",
    "ARENA_REWARD_PAYOUT_ERC20_ADDRESS",
  ];
  for (const key of validationAddresses) {
    const value = String(currentEnv[key] || "").trim();
    if (value.length > 0 && !isAddress(value)) {
      blockers.push(`${key} must be a 20-byte hex address when set.`);
    }
  }

  const report = {
    comparedAt: (options.now || new Date()).toISOString(),
    currentEnvPath,
    previousEnvPath,
    secretSummaries,
    bearerMappingSummaries,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  logger.info(`Secret rotation audit report: ${outputPath}`);
  for (const summary of secretSummaries) {
    const lineParts = [
      summary.key,
      summary.changed ? "rotated" : "unchanged",
      `fingerprint=${summary.currentFingerprint.slice(0, 12)}`,
    ];
    if (summary.currentAddressShort) {
      lineParts.push(`address=${summary.currentAddressShort}`);
    }
    logger.info(`- ${lineParts.join(" ")}`);
  }
  for (const summary of bearerMappingSummaries) {
    for (const entry of summary.entries) {
      if (entry.missing) {
        logger.info(`- ${summary.key}:${entry.entryKey} missing in current env`);
        continue;
      }
      logger.info(
        `- ${summary.key}:${entry.entryKey} ${entry.changed ? "rotated" : "unchanged"} fingerprint=${entry.currentFingerprint.slice(0, 12)}`,
      );
    }
  }

  if (blockers.length > 0) {
    for (const blocker of blockers) {
      logger.fail(blocker);
    }
    return 1;
  }

  logger.pass("Secret rotation audit passed.");
  return 0;
}

async function main() {
  const exitCode = await checkSecretRotation(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  checkSecretRotation,
  parseArgs,
};
