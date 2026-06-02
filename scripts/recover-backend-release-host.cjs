#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, pass } = require("./_validation-common.cjs");
const {
  checkDockerCliReachable,
  readDriveFreeBytes,
  resolveDockerDesktopDataDiskPath,
} = require("./check-backend-release-host-preflight.cjs");

const DEFAULT_MIN_DOCKER_DESKTOP_DRIVE_FREE_GB = 15;
const DEFAULT_WAIT_FOR_DOCKER_MS = 120000;
const DEFAULT_DOCKER_POLL_INTERVAL_MS = 4000;

function parseArgs(argv) {
  const options = {
    cleanSafeCaches: false,
    cwd: process.cwd(),
    envFilePath: path.resolve(
      process.cwd(),
      "validation-local",
      "release-rehearsal.env",
    ),
    inventoryLocalAppData: false,
    minDockerDesktopDriveFreeGb: DEFAULT_MIN_DOCKER_DESKTOP_DRIVE_FREE_GB,
    restartDocker: false,
    topLocalAppDataChildren: 10,
    waitForDockerMs: DEFAULT_WAIT_FOR_DOCKER_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

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

    if (argument === "--wait-for-docker-ms") {
      options.waitForDockerMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--top-localappdata-children") {
      options.topLocalAppDataChildren = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--clean-safe-caches") {
      options.cleanSafeCaches = true;
      continue;
    }

    if (argument === "--restart-docker") {
      options.restartDocker = true;
      continue;
    }

    if (argument === "--inventory-localappdata") {
      options.inventoryLocalAppData = true;
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

  if (!Number.isFinite(options.waitForDockerMs) || options.waitForDockerMs <= 0) {
    throw new Error("--wait-for-docker-ms must be a positive number.");
  }

  if (
    !Number.isFinite(options.topLocalAppDataChildren) ||
    options.topLocalAppDataChildren <= 0
  ) {
    throw new Error("--top-localappdata-children must be a positive number.");
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

function defaultStartProcess(filePath, options = {}) {
  const escapedPath = String(filePath).replace(/'/gu, "''");
  return defaultRunCommand(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Start-Process -FilePath '${escapedPath}' -WindowStyle Hidden`,
    ],
    { timeoutMs: options.timeoutMs ?? 15000 },
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getSafeCleanupTargets(env = process.env) {
  const localAppData = env.LOCALAPPDATA;

  if (!localAppData) {
    return [];
  }

  return [
    {
      label: "npm cache",
      path: path.join(localAppData, "npm-cache"),
      type: "directory-contents",
    },
    {
      label: "local temp files",
      path: path.join(localAppData, "Temp"),
      type: "directory-contents",
    },
    {
      label: "Docker Desktop logs",
      path: path.join(localAppData, "Docker", "log"),
      type: "directory-contents",
    },
    {
      label: "Windows crash dumps",
      path: path.join(localAppData, "CrashDumps"),
      type: "directory-contents",
    },
  ];
}

function sumPathBytes(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return 0;
  }

  const rootStats = safeLstatSync(targetPath);
  if (!rootStats) {
    return 0;
  }

  if (!rootStats.isDirectory()) {
    return rootStats.size;
  }

  let totalBytes = 0;
  const stack = [targetPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile()) {
        const stats = safeLstatSync(entryPath);
        if (stats) {
          totalBytes += stats.size;
        }
      }
    }
  }

  return totalBytes;
}

function safeLstatSync(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    return null;
  }
}

function collectSafeCleanupCandidates(env = process.env) {
  return getSafeCleanupTargets(env).map((target) => ({
    ...target,
    bytes: sumPathBytes(target.path),
    exists: fs.existsSync(target.path),
  }));
}

function cleanupPathContents(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }

  const stats = safeLstatSync(targetPath);
  if (!stats) {
    return;
  }

  if (!stats.isDirectory()) {
    fs.rmSync(targetPath, { force: true });
    return;
  }

  for (const child of fs.readdirSync(targetPath)) {
    fs.rmSync(path.join(targetPath, child), {
      force: true,
      recursive: true,
    });
  }
}

function cleanSafeCleanupCandidates(candidates, logger = { info }, options = {}) {
  let removedBytes = 0;

  for (const candidate of candidates) {
    if (!candidate.exists || candidate.bytes <= 0) {
      continue;
    }

    cleanupPathContents(candidate.path);
    removedBytes += candidate.bytes;
    logger.info(
      `Removed ${candidate.label} from ${candidate.path} (${formatGigabytes(candidate.bytes)}).`,
    );
  }

  if (removedBytes <= 0) {
    logger.info("Safe cache cleanup found no removable bytes in the known targets.");
  } else if (options.recheck !== false) {
    logger.info(
      `Safe cache cleanup reclaimed approximately ${formatGigabytes(removedBytes)} before filesystem remeasurement.`,
    );
  }

  return removedBytes;
}

async function waitForDockerEngine(options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_FOR_DOCKER_MS;
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_DOCKER_POLL_INTERVAL_MS;
  const logger = options.logger || { info };
  const runCommand = options.runCommand || defaultRunCommand;
  const sleepImpl = options.sleep || sleep;
  const now = options.now || Date.now;
  const startedAt = now();
  let attempts = 0;
  let lastStatus = checkDockerCliReachable(runCommand);

  while (true) {
    attempts += 1;
    lastStatus = checkDockerCliReachable(runCommand);
    if (lastStatus.ok) {
      logger.pass(
        `Docker engine reachable after recovery: ${lastStatus.message.replace(/^Docker engine reachable:\s*/u, "")}`,
      );
      return {
        attempts,
        ...lastStatus,
      };
    }

    if (now() - startedAt >= timeoutMs) {
      logger.info(
        `Docker engine still unreachable after waiting ${Math.round(timeoutMs / 1000)}s.`,
      );
      return {
        attempts,
        ...lastStatus,
      };
    }

    await sleepImpl(pollIntervalMs);
  }
}

function restartDockerDesktop(options = {}) {
  const logger = options.logger || { info };
  const runCommand = options.runCommand || defaultRunCommand;
  const startProcess = options.startProcess || defaultStartProcess;
  const dockerDesktopPath =
    options.dockerDesktopPath ||
    path.join(
      process.env.ProgramFiles || "C:\\Program Files",
      "Docker",
      "Docker",
      "Docker Desktop.exe",
    );

  logger.info("Stopping Docker Desktop Windows-side processes.");
  runCommand(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "$targets = Get-Process -ErrorAction SilentlyContinue |",
        "  Where-Object {",
        "    $_.ProcessName -like 'Docker*' -or",
        "    $_.ProcessName -like 'docker*' -or",
        "    $_.ProcessName -like 'com.docker*'",
        "  };",
        "if ($targets) { $targets | Stop-Process -Force }",
      ].join(" "),
    ],
    { timeoutMs: 20000 },
  );

  logger.info("Shutting down WSL to clear the Docker Desktop Linux VM.");
  runCommand("wsl", ["--shutdown"], { timeoutMs: 30000 });

  if (!fs.existsSync(dockerDesktopPath)) {
    throw new Error(
      `Docker Desktop executable not found at ${dockerDesktopPath}. Reinstall Docker Desktop or pass a valid executable path.`,
    );
  }

  logger.info(`Starting Docker Desktop from ${dockerDesktopPath}.`);
  const startResult = startProcess(dockerDesktopPath, { timeoutMs: 20000 });
  if (startResult && typeof startResult.status === "number" && startResult.status !== 0) {
    const stderr = (startResult.stderr || startResult.stdout || "").trim();
    throw new Error(
      `Failed to start Docker Desktop: ${stderr || `process exited with ${startResult.status}`}.`,
    );
  }
}

function inventoryDirectoryChildren(targetPath, topCount = 10) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return [];
  }

  const entries = [];
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }

    entries.push({
      name: entry.name,
      path: entryPath,
      bytes: sumPathBytes(entryPath),
    });
  }

  return entries.sort((left, right) => right.bytes - left.bytes).slice(0, topCount);
}

async function recoverBackendReleaseHost(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const logger = options.logger || { fail, info, pass };
  const minDockerDesktopDriveFreeGb =
    options.minDockerDesktopDriveFreeGb ??
    DEFAULT_MIN_DOCKER_DESKTOP_DRIVE_FREE_GB;
  const minDockerDesktopDriveFreeBytes =
    minDockerDesktopDriveFreeGb * 1024 ** 3;
  const runCommand = options.runCommand || defaultRunCommand;
  const getDriveFreeBytes = options.getDriveFreeBytes;
  const localAppData = env.LOCALAPPDATA;
  const dockerDiskPath = resolveDockerDesktopDataDiskPath(env);
  const failures = [];

  logger.info(`Workspace: ${cwd}`);
  logger.info(
    `Release rehearsal env contract: ${options.envFilePath || path.resolve(cwd, "validation-local", "release-rehearsal.env")}`,
  );

  let initialDockerStatus = checkDockerCliReachable(runCommand);
  if (initialDockerStatus.ok) {
    logger.pass(initialDockerStatus.message);
  } else {
    logger.info(`Docker engine currently unreachable: ${initialDockerStatus.message}`);
  }

  let driveFreeBytes = null;
  if (dockerDiskPath && fs.existsSync(dockerDiskPath)) {
    const diskStats = fs.statSync(dockerDiskPath);
    logger.info(
      `Docker Desktop data disk: ${dockerDiskPath} (${formatGigabytes(diskStats.size)})`,
    );

    try {
      driveFreeBytes = readDriveFreeBytes(dockerDiskPath, {
        getDriveFreeBytes,
        platform: options.platform,
        runCommand,
      });
      logger.info(`Free space on ${path.parse(dockerDiskPath).root}: ${formatGigabytes(driveFreeBytes)}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    logger.info(
      "Docker Desktop data disk path is unavailable on this host, so drive-space recovery checks were skipped.",
    );
  }

  const cleanupCandidates = collectSafeCleanupCandidates(env);
  if (cleanupCandidates.length > 0) {
    logger.info("Known safe cache cleanup targets:");
    for (const candidate of cleanupCandidates) {
      logger.info(
        `- ${candidate.label}: ${candidate.path} (${formatGigabytes(candidate.bytes)})`,
      );
    }
  }

  if (options.cleanSafeCaches === true) {
    cleanSafeCleanupCandidates(cleanupCandidates, logger);
  }

  if (options.inventoryLocalAppData === true && localAppData) {
    logger.info(`Top ${options.topLocalAppDataChildren ?? 10} LocalAppData children by size:`);
    for (const entry of inventoryDirectoryChildren(
      localAppData,
      options.topLocalAppDataChildren,
    )) {
      logger.info(`- ${entry.name}: ${formatGigabytes(entry.bytes)} (${entry.path})`);
    }
  }

  if (options.restartDocker === true) {
    restartDockerDesktop({
      dockerDesktopPath: options.dockerDesktopPath,
      logger,
      runCommand,
      startProcess: options.startProcess,
    });

    initialDockerStatus = await waitForDockerEngine({
      logger,
      now: options.now,
      pollIntervalMs: options.pollIntervalMs,
      runCommand,
      sleep: options.sleep,
      timeoutMs: options.waitForDockerMs ?? DEFAULT_WAIT_FOR_DOCKER_MS,
    });
  }

  const finalDockerStatus = checkDockerCliReachable(runCommand);
  if (!finalDockerStatus.ok) {
    failures.push(
      `Docker CLI still cannot reach the Linux engine: ${finalDockerStatus.message}`,
    );
  }

  if (dockerDiskPath && fs.existsSync(dockerDiskPath)) {
    try {
      driveFreeBytes = readDriveFreeBytes(dockerDiskPath, {
        getDriveFreeBytes,
        platform: options.platform,
        runCommand,
      });
      logger.info(
        `Free space on ${path.parse(dockerDiskPath).root} after recovery: ${formatGigabytes(driveFreeBytes)}`,
      );
      if (driveFreeBytes < minDockerDesktopDriveFreeBytes) {
        failures.push(
          `Docker Desktop data drive ${path.parse(dockerDiskPath).root} still only has ${formatGigabytes(driveFreeBytes)} free. Free at least ${minDockerDesktopDriveFreeGb} GiB before retrying docker compose build.`,
        );
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (failures.length > 0) {
    logger.fail("Backend release host recovery is incomplete.");
    for (const failure of failures) {
      logger.info(`- ${failure}`);
    }
    logger.info(
      "Suggested next step: free additional C: space, rerun pnpm run backend:release:host:recover -- --clean-safe-caches --restart-docker, then rerun pnpm run backend:release:host:check.",
    );
    return 1;
  }

  logger.pass("Backend release host recovery passed.");
  return 0;
}

async function main() {
  const exitCode = await recoverBackendReleaseHost(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  cleanSafeCleanupCandidates,
  cleanupPathContents,
  collectSafeCleanupCandidates,
  formatGigabytes,
  getSafeCleanupTargets,
  inventoryDirectoryChildren,
  parseArgs,
  recoverBackendReleaseHost,
  restartDockerDesktop,
  sumPathBytes,
  waitForDockerEngine,
};
