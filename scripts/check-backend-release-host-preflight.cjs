#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  fail,
  info,
  loadEnvFile,
  pass,
} = require("./_validation-common.cjs");

const DEFAULT_MIN_DOCKER_DESKTOP_DRIVE_FREE_GB = 15;

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
    { timeoutMs: 15000 },
  );

  if (result.status !== 0) {
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
    { timeoutMs: 30000 },
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

    if (!loaded.loaded.COMPOSE_PROJECT_NAME) {
      failures.push(
        `Release rehearsal env at ${envFilePath} is missing COMPOSE_PROJECT_NAME, so local release containers can collide with the default docker-compose.yml stack. Regenerate it with pnpm run backend:release:env:prepare.`,
      );
    } else {
      logger.info(
        `Release rehearsal compose project: ${loaded.loaded.COMPOSE_PROJECT_NAME}`,
      );
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
  const exitCode = await checkBackendReleaseHostPreflight();
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
  readDriveFreeBytes,
  readWindowsDriveFreeBytes,
  resolveDockerDesktopDataDiskPath,
};
