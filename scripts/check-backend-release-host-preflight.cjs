#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  fail,
  info,
  isAddress,
  isPrivateKey,
  loadEnvFile,
  normalizeAddress,
  pass,
} = require("./_validation-common.cjs");

const DEFAULT_MIN_DOCKER_DESKTOP_DRIVE_FREE_GB = 15;
const DEFAULT_DOCKER_CLI_TIMEOUT_MS = 120000;
const DEFAULT_WINDOWS_FREE_SPACE_TIMEOUT_MS = 45000;
const HARDHAT_LOCAL_ADMIN_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const LOCAL_ONLY_HOSTNAMES = new Set([
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "host.docker.internal",
  "localhost",
]);
const REAL_RELEASE_ENVIRONMENTS = new Set(["staging", "prod"]);
const PLACEHOLDER_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000010",
]);
const PLACEHOLDER_JWT_SECRETS = new Set([
  "arena-local-dev-secret-change-before-production",
  "replace-with-a-long-random-secret",
  "test-secret",
]);

function parseArgs(argv) {
  const options = {
    allowLocalRehearsal: false,
    cwd: process.cwd(),
    envFilePath: path.resolve(
      process.cwd(),
      "validation-local",
      "release-rehearsal.env",
    ),
    minDockerDesktopDriveFreeGb: DEFAULT_MIN_DOCKER_DESKTOP_DRIVE_FREE_GB,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--allow-local-rehearsal") {
      options.allowLocalRehearsal = true;
      continue;
    }

    if (argument === "--env-file") {
      options.envFilePath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--min-free-gb") {
      options.minDockerDesktopDriveFreeGb = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (
    !Number.isFinite(options.minDockerDesktopDriveFreeGb) ||
    options.minDockerDesktopDriveFreeGb < 0
  ) {
    throw new Error("--min-free-gb must be a non-negative number.");
  }

  return options;
}

function formatGigabytes(bytes) {
  return `${Math.round((bytes / (1024 ** 3)) * 100) / 100} GiB`;
}

function defaultRunCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeoutMs ?? 15000,
    windowsHide: true,
  });
}

function resolveDockerDesktopDataDiskPath(env = process.env) {
  if (!env.LOCALAPPDATA) {
    return null;
  }

  return path.join(env.LOCALAPPDATA, "Docker", "wsl", "disk", "docker_data.vhdx");
}

function readWindowsDriveFreeBytes(targetPath, runCommand = defaultRunCommand) {
  const driveRoot = path.parse(path.resolve(targetPath)).root;
  const driveName = driveRoot.replace(/[\\/:]+$/gu, "");
  if (!driveName) {
    throw new Error(`Unable to resolve a Windows drive root for ${targetPath}.`);
  }

  const command = `[int64](Get-PSDrive -Name '${driveName}').Free`;
  const result = runCommand(
    "powershell",
    ["-NoProfile", "-Command", command],
    { timeoutMs: DEFAULT_WINDOWS_FREE_SPACE_TIMEOUT_MS },
  );

  if (result.status !== 0) {
    const fallback = readWindowsDriveFreeBytesViaFsutil(driveName, runCommand);
    if (fallback !== null) {
      return fallback;
    }
    const stderr = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `Unable to inspect free space for ${driveRoot}: ${stderr || `powershell exited with ${result.status}`}.`,
    );
  }

  const freeBytes = Number((result.stdout || "").trim());
  if (!Number.isFinite(freeBytes) || freeBytes < 0) {
    throw new Error(
      `Unable to parse free space for ${driveRoot} from PowerShell output: ${(result.stdout || "").trim()}.`,
    );
  }

  return freeBytes;
}

function readWindowsDriveFreeBytesViaFsutil(driveName, runCommand = defaultRunCommand) {
  const result = runCommand(
    "fsutil",
    ["volume", "diskfree", `${driveName}:`],
    { timeoutMs: 15000 },
  );

  if (result.status !== 0) {
    return null;
  }

  const match = String(result.stdout || "").match(
    /Total free bytes\s*:\s*([0-9,]+)/iu,
  );
  if (!match?.[1]) {
    return null;
  }

  const freeBytes = Number(match[1].replace(/,/gu, ""));
  if (!Number.isFinite(freeBytes) || freeBytes < 0) {
    return null;
  }

  return freeBytes;
}

function readDriveFreeBytes(targetPath, options = {}) {
  if (!targetPath) {
    return null;
  }

  if (typeof options.getDriveFreeBytes === "function") {
    return options.getDriveFreeBytes(targetPath);
  }

  if (options.platform === "win32" || process.platform === "win32") {
    return readWindowsDriveFreeBytes(targetPath, options.runCommand);
  }

  const driveRoot = path.parse(path.resolve(targetPath)).root;
  const stats = fs.statfsSync(driveRoot);
  return stats.bavail * stats.bsize;
}

function checkDockerCliReachable(runCommand = defaultRunCommand) {
  const result = runCommand(
    "docker",
    ["version", "--format", "{{.Server.Version}}"],
    { timeoutMs: DEFAULT_DOCKER_CLI_TIMEOUT_MS },
  );

  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || "").trim();
    return {
      ok: false,
      message:
        stderr ||
        "Docker CLI could not reach the Linux engine. Start or recover Docker Desktop, then retry.",
    };
  }

  const serverVersion = (result.stdout || "").trim();
  if (!serverVersion) {
    return {
      ok: false,
      message:
        "Docker CLI reached the engine but did not return a server version. Reopen Docker Desktop and retry.",
    };
  }

  return {
    ok: true,
    message: `Docker engine reachable: ${serverVersion}`,
  };
}

function getLoadedEnvValue(loadedEnv, key) {
  const value = loadedEnv[key];
  return typeof value === "string" ? value.trim() : "";
}

function isLocalOnlyUrl(value) {
  try {
    const parsed = new URL(value);
    return LOCAL_ONLY_HOSTNAMES.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function pushMissingEnvFailure(loadedEnv, failures, key, description) {
  if (getLoadedEnvValue(loadedEnv, key).length === 0) {
    failures.push(`${key} is required for ${description}.`);
  }
}

function validateLocalRehearsalEnv(loadedEnv, failures) {
  const environment = getLoadedEnvValue(loadedEnv, "ARENA_VALIDATION_ENVIRONMENT");
  if (environment.length === 0) {
    failures.push(
      "ARENA_VALIDATION_ENVIRONMENT is required in the release rehearsal env. Set it to local for repo-side Docker rehearsal.",
    );
    return;
  }

  if (environment !== "local") {
    failures.push(
      `ARENA_VALIDATION_ENVIRONMENT must stay local when --allow-local-rehearsal is set; received ${environment}. Use the strict host preflight for staging/prod promotion instead.`,
    );
  }
}

function validateRealReleaseEnv(loadedEnv, failures) {
  const environment = getLoadedEnvValue(loadedEnv, "ARENA_VALIDATION_ENVIRONMENT");
  if (environment.length === 0) {
    failures.push(
      "ARENA_VALIDATION_ENVIRONMENT is required for backend release host preflight. Use staging or prod for real promotion, or pass --allow-local-rehearsal for local Docker rehearsal.",
    );
  } else if (!REAL_RELEASE_ENVIRONMENTS.has(environment)) {
    failures.push(
      `ARENA_VALIDATION_ENVIRONMENT must be staging or prod for a real backend release host preflight; received ${environment}. Use --allow-local-rehearsal only for local Docker rehearsal.`,
    );
  }

  for (const key of [
    "JWT_SECRET",
    "RPC_URL",
    "CHAIN_ID",
    "ARENA_CONTRACT_ADDRESS",
    "ARENA_VALIDATION_CONTRACT_ADDRESS",
    "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY",
    "ARENA_VALIDATION_ORACLE_PRIVATE_KEY",
    "ARENA_VALIDATION_PAUSER_PRIVATE_KEY",
    "ARENA_REWARD_PAYOUT_ERC20_ADDRESS",
    "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY",
  ]) {
    pushMissingEnvFailure(loadedEnv, failures, key, "non-local backend promotion");
  }

  for (const key of [
    "ARENA_CONTRACT_ADDRESS",
    "ARENA_VALIDATION_CONTRACT_ADDRESS",
    "ARENA_REWARD_PAYOUT_ERC20_ADDRESS",
  ]) {
    const value = getLoadedEnvValue(loadedEnv, key);
    if (value.length === 0) {
      continue;
    }

    if (!isAddress(value)) {
      failures.push(`${key} must be a 20-byte hex address for non-local backend promotion.`);
      continue;
    }

    const normalized = normalizeAddress(value).toLowerCase();
    if (PLACEHOLDER_ADDRESSES.has(normalized)) {
      failures.push(
        `${key} must not use the local placeholder address ${normalized} in a non-local backend promotion env.`,
      );
    }
  }

  const legacyAddress = getLoadedEnvValue(loadedEnv, "ARENA_CONTRACT_ADDRESS");
  const validationAddress = getLoadedEnvValue(
    loadedEnv,
    "ARENA_VALIDATION_CONTRACT_ADDRESS",
  );
  if (
    isAddress(legacyAddress) &&
    isAddress(validationAddress) &&
    normalizeAddress(legacyAddress) === normalizeAddress(validationAddress)
  ) {
    failures.push(
      "ARENA_VALIDATION_CONTRACT_ADDRESS must not reuse ARENA_CONTRACT_ADDRESS in a non-local backend promotion env.",
    );
  }

  for (const key of [
    "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY",
    "ARENA_VALIDATION_ORACLE_PRIVATE_KEY",
    "ARENA_VALIDATION_PAUSER_PRIVATE_KEY",
    "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY",
  ]) {
    const value = getLoadedEnvValue(loadedEnv, key);
    if (value.length === 0) {
      continue;
    }

    if (!isPrivateKey(value)) {
      failures.push(
        `${key} must be a 32-byte hex private key prefixed with 0x for non-local backend promotion.`,
      );
      continue;
    }

    if (value.toLowerCase() === HARDHAT_LOCAL_ADMIN_PRIVATE_KEY) {
      failures.push(
        `${key} must not reuse the local Hardhat bootstrap private key in a non-local backend promotion env.`,
      );
    }
  }

  for (const key of ["RPC_URL", "ARENA_COMPOSE_RPC_URL"]) {
    const value = getLoadedEnvValue(loadedEnv, key);
    if (value.length === 0) {
      continue;
    }

    if (isLocalOnlyUrl(value)) {
      failures.push(
        `${key} must not point to localhost, 127.0.0.1, or host.docker.internal in a non-local backend promotion env.`,
      );
    }
  }

  const jwtSecret = getLoadedEnvValue(loadedEnv, "JWT_SECRET");
  if (jwtSecret.length > 0 && PLACEHOLDER_JWT_SECRETS.has(jwtSecret)) {
    failures.push(
      "JWT_SECRET must not use a local/default placeholder value in a non-local backend promotion env.",
    );
  }
}

async function checkBackendReleaseHostPreflight(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath =
    options.envFilePath ||
    path.resolve(cwd, "validation-local", "release-rehearsal.env");
  const minDockerDesktopDriveFreeGb =
    options.minDockerDesktopDriveFreeGb ??
    DEFAULT_MIN_DOCKER_DESKTOP_DRIVE_FREE_GB;
  const minDockerDesktopDriveFreeBytes =
    minDockerDesktopDriveFreeGb * 1024 ** 3;
  const runCommand = options.runCommand || defaultRunCommand;
  const env = options.env || process.env;
  const failures = [];

  if (!fs.existsSync(envFilePath)) {
    failures.push(
      `Release rehearsal env file not found at ${envFilePath}. Run pnpm run backend:release:env:prepare first.`,
    );
  }

  let loadedEnv = {};
  if (fs.existsSync(envFilePath)) {
    const loaded = loadEnvFile(envFilePath, { override: false });
    loadedEnv = loaded.loaded;

    logger.info(
      options.allowLocalRehearsal === true
        ? "Release host preflight mode: local-rehearsal"
        : "Release host preflight mode: non-local promotion",
    );

    if (!loaded.loaded.COMPOSE_PROJECT_NAME) {
      failures.push(
        `Release rehearsal env at ${envFilePath} is missing COMPOSE_PROJECT_NAME, so local release containers can collide with the default docker-compose.yml stack. Regenerate it with pnpm run backend:release:env:prepare.`,
      );
    } else {
      logger.info(
        `Release rehearsal compose project: ${loaded.loaded.COMPOSE_PROJECT_NAME}`,
      );
    }

    if (options.allowLocalRehearsal === true) {
      validateLocalRehearsalEnv(loadedEnv, failures);
    } else {
      validateRealReleaseEnv(loadedEnv, failures);
    }
  }

  const dockerReachability = checkDockerCliReachable(runCommand);
  if (!dockerReachability.ok) {
    failures.push(
      `Docker engine is not reachable from the CLI: ${dockerReachability.message}`,
    );
  } else {
    logger.pass(dockerReachability.message);
  }

  const dockerDesktopDataDiskPath = resolveDockerDesktopDataDiskPath(env);
  if (dockerDesktopDataDiskPath && fs.existsSync(dockerDesktopDataDiskPath)) {
    const diskStats = fs.statSync(dockerDesktopDataDiskPath);
    const driveRoot = path.parse(path.resolve(dockerDesktopDataDiskPath)).root;
    logger.info(
      `Docker Desktop data disk: ${dockerDesktopDataDiskPath} (${formatGigabytes(diskStats.size)})`,
    );

    try {
      const driveFreeBytes = readDriveFreeBytes(dockerDesktopDataDiskPath, {
        getDriveFreeBytes: options.getDriveFreeBytes,
        platform: options.platform,
        runCommand,
      });

      if (typeof driveFreeBytes === "number") {
        logger.info(
          `Free space on ${driveRoot}: ${formatGigabytes(driveFreeBytes)}`,
        );

        if (driveFreeBytes < minDockerDesktopDriveFreeBytes) {
          failures.push(
            `Docker Desktop data drive ${driveRoot} only has ${formatGigabytes(driveFreeBytes)} free. Keep at least ${minDockerDesktopDriveFreeGb} GiB free before docker compose build, or the WSL Docker disk can hit I/O faults under image-build pressure.`,
          );
        }
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    logger.info(
      "Docker Desktop WSL data disk path is not available on this host, so disk-capacity preflight was skipped.",
    );
  }

  if (failures.length > 0) {
    logger.fail("Backend release host preflight failed.");
    for (const failure of failures) {
      logger.info(`- ${failure}`);
    }
    return 1;
  }

  logger.pass("Backend release host preflight passed.");
  return 0;
}

async function main() {
  const exitCode = await checkBackendReleaseHostPreflight(
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
  checkBackendReleaseHostPreflight,
  checkDockerCliReachable,
  parseArgs,
  readDriveFreeBytes,
  readWindowsDriveFreeBytes,
  resolveDockerDesktopDataDiskPath,
};
