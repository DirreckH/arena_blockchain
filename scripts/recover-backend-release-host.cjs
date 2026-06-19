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
const DEFAULT_LOCALAPPDATA_INVENTORY_TOTAL_BUDGET_MS = 15000;
const DEFAULT_LOCALAPPDATA_CHILD_SCAN_BUDGET_MS = 1200;
const DEFAULT_DOCKER_LOG_SUMMARY_LINE_COUNT = 6;

function parseArgs(argv) {
  const options = {
    cleanSafeCaches: false,
    cwd: process.cwd(),
    envFilePath: path.resolve(
      process.cwd(),
      "validation-local",
      "release-rehearsal.env",
    ),
    inventoryPath: null,
    inventoryLocalAppData: false,
    localAppDataChildBudgetMs: DEFAULT_LOCALAPPDATA_CHILD_SCAN_BUDGET_MS,
    localAppDataInventoryBudgetMs:
      DEFAULT_LOCALAPPDATA_INVENTORY_TOTAL_BUDGET_MS,
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

    if (argument === "--inventory-path") {
      options.inventoryPath = path.resolve(process.cwd(), argv[index + 1]);
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

    if (argument === "--localappdata-inventory-budget-ms") {
      options.localAppDataInventoryBudgetMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--localappdata-child-budget-ms") {
      options.localAppDataChildBudgetMs = Number(argv[index + 1]);
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

  if (
    !Number.isFinite(options.localAppDataInventoryBudgetMs) ||
    options.localAppDataInventoryBudgetMs <= 0
  ) {
    throw new Error("--localappdata-inventory-budget-ms must be a positive number.");
  }

  if (
    !Number.isFinite(options.localAppDataChildBudgetMs) ||
    options.localAppDataChildBudgetMs <= 0
  ) {
    throw new Error("--localappdata-child-budget-ms must be a positive number.");
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

function getWindowsServiceStatus(serviceName, runCommand = defaultRunCommand) {
  const escapedServiceName = String(serviceName).replace(/'/gu, "''");
  const result = runCommand(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `($service = Get-Service -Name '${escapedServiceName}' -ErrorAction SilentlyContinue) | ForEach-Object { $_.Status.ToString() }`,
    ],
    { timeoutMs: 15000 },
  );

  if (result.status !== 0) {
    const fallback = runCommand(
      "sc.exe",
      ["query", String(serviceName)],
      { timeoutMs: 15000 },
    );
    if (fallback.status === 0) {
      const stateMatch = String(fallback.stdout || "").match(
        /STATE\s*:\s*\d+\s+([A-Z_]+)/u,
      );
      if (stateMatch?.[1]) {
        return {
          available: true,
          status: stateMatch[1],
        };
      }
    }

    return {
      available: false,
      status: null,
      message: (fallback.stderr || fallback.stdout || result.stderr || result.stdout || "").trim() || `powershell exited with ${result.status}`,
    };
  }

  const status = String(result.stdout || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!status) {
    return {
      available: false,
      status: null,
      message: `Windows service ${serviceName} was not found.`,
    };
  }

  return {
    available: true,
    status,
  };
}

function ensureDockerDesktopServiceRunning(options = {}) {
  const logger = options.logger || { info };
  const runCommand = options.runCommand || defaultRunCommand;
  const serviceName = options.serviceName || "com.docker.service";
  const status = getWindowsServiceStatus(serviceName, runCommand);

  if (!status.available) {
    logger.info(
      `Docker Desktop Windows service ${serviceName} is unavailable or could not be inspected${status.message ? ` (${status.message})` : ""}.`,
    );
    return {
      action: "unavailable",
      ...status,
    };
  }

  if (status.status === "Running") {
    logger.info(
      `Restarting Docker Desktop Windows service ${serviceName} before relaunching the Linux engine.`,
    );
    runCommand(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Restart-Service -Name '${String(serviceName).replace(/'/gu, "''")}' -Force`,
      ],
      { timeoutMs: 30000 },
    );
    return {
      action: "restarted",
      available: true,
      status: "Running",
    };
  }

  logger.info(`Starting Docker Desktop Windows service ${serviceName}.`);
  runCommand(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Start-Service -Name '${String(serviceName).replace(/'/gu, "''")}'`,
    ],
    { timeoutMs: 30000 },
  );
  return {
    action: "started",
    available: true,
    status: status.status,
  };
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

function hasExceededDeadline(deadlineMs, now = Date.now) {
  return Number.isFinite(deadlineMs) && now() >= deadlineMs;
}

function measurePathBytes(targetPath, options = {}) {
  const now = options.now || Date.now;
  const deadlineMs =
    Number.isFinite(options.deadlineMs) && options.deadlineMs > 0
      ? options.deadlineMs
      : null;

  if (!targetPath || !fs.existsSync(targetPath)) {
    return {
      bytes: 0,
      complete: true,
      visitedEntries: 0,
    };
  }

  const rootStats = safeLstatSync(targetPath);
  if (!rootStats) {
    return {
      bytes: 0,
      complete: false,
      visitedEntries: 0,
    };
  }

  if (!rootStats.isDirectory()) {
    return {
      bytes: rootStats.size,
      complete: true,
      visitedEntries: 1,
    };
  }

  let totalBytes = 0;
  let complete = true;
  let visitedEntries = 0;
  const stack = [targetPath];

  while (stack.length > 0) {
    if (deadlineMs !== null && hasExceededDeadline(deadlineMs, now)) {
      complete = false;
      break;
    }

    const currentPath = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      complete = false;
      continue;
    }

    for (const entry of entries) {
      if (deadlineMs !== null && hasExceededDeadline(deadlineMs, now)) {
        complete = false;
        break;
      }

      const entryPath = path.join(currentPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      visitedEntries += 1;

      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile()) {
        const stats = safeLstatSync(entryPath);
        if (stats) {
          totalBytes += stats.size;
        } else {
          complete = false;
        }
      }
    }
  }

  return {
    bytes: totalBytes,
    complete,
    visitedEntries,
  };
}

function sumPathBytes(targetPath) {
  return measurePathBytes(targetPath).bytes;
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
    return {
      removedEntries: 0,
      failedPaths: [],
    };
  }

  const stats = safeLstatSync(targetPath);
  if (!stats) {
    return {
      removedEntries: 0,
      failedPaths: [],
    };
  }

  if (!stats.isDirectory()) {
    try {
      fs.rmSync(targetPath, { force: true });
      return {
        removedEntries: 1,
        failedPaths: [],
      };
    } catch (error) {
      return {
        removedEntries: 0,
        failedPaths: [
          {
            path: targetPath,
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  let removedEntries = 0;
  const failedPaths = [];

  for (const child of fs.readdirSync(targetPath)) {
    const childPath = path.join(targetPath, child);
    try {
      fs.rmSync(childPath, {
        force: true,
        recursive: true,
      });
      removedEntries += 1;
    } catch (error) {
      failedPaths.push({
        path: childPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    removedEntries,
    failedPaths,
  };
}

function cleanSafeCleanupCandidates(candidates, logger = { info }, options = {}) {
  let removedBytes = 0;
  const failedPaths = [];

  for (const candidate of candidates) {
    if (!candidate.exists || candidate.bytes <= 0) {
      continue;
    }

    const cleanupResult = cleanupPathContents(candidate.path);
    removedBytes += candidate.bytes;
    if (cleanupResult.failedPaths.length === 0) {
      logger.info(
        `Removed ${candidate.label} from ${candidate.path} (${formatGigabytes(candidate.bytes)}).`,
      );
    } else {
      logger.info(
        `Partially removed ${candidate.label} from ${candidate.path} (${formatGigabytes(candidate.bytes)} targeted, ${cleanupResult.failedPaths.length} locked path(s) skipped).`,
      );
      failedPaths.push(
        ...cleanupResult.failedPaths.map((item) => ({
          ...item,
          label: candidate.label,
        })),
      );
    }
  }

  if (removedBytes <= 0) {
    logger.info("Safe cache cleanup found no removable bytes in the known targets.");
  } else if (options.recheck !== false) {
    logger.info(
      `Safe cache cleanup reclaimed approximately ${formatGigabytes(removedBytes)} before filesystem remeasurement.`,
    );
  }

  return {
    removedBytes,
    failedPaths,
  };
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

  ensureDockerDesktopServiceRunning({
    logger,
    runCommand,
  });

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

function inventoryDirectoryChildrenReport(targetPath, topCount = 10, options = {}) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return {
      entries: [],
      partialEntries: 0,
      scannedChildren: 0,
      totalChildren: 0,
      truncatedChildren: 0,
    };
  }

  const now = options.now || Date.now;
  const totalBudgetMs =
    Number.isFinite(options.totalBudgetMs) && options.totalBudgetMs > 0
      ? options.totalBudgetMs
      : DEFAULT_LOCALAPPDATA_INVENTORY_TOTAL_BUDGET_MS;
  const perEntryBudgetMs =
    Number.isFinite(options.perEntryBudgetMs) && options.perEntryBudgetMs > 0
      ? options.perEntryBudgetMs
      : DEFAULT_LOCALAPPDATA_CHILD_SCAN_BUDGET_MS;
  const inventoryStartedAt = now();
  const directoryEntries = fs.readdirSync(targetPath, { withFileTypes: true });
  const candidates = directoryEntries.filter((entry) => !entry.isSymbolicLink());
  const entries = [];
  let scannedChildren = 0;

  for (const entry of candidates) {
    const elapsedMs = now() - inventoryStartedAt;
    const remainingBudgetMs = totalBudgetMs - elapsedMs;
    if (remainingBudgetMs <= 0) {
      break;
    }

    const entryPath = path.join(targetPath, entry.name);
    const measurement = measurePathBytes(entryPath, {
      deadlineMs: now() + Math.min(perEntryBudgetMs, remainingBudgetMs),
      now,
    });

    entries.push({
      name: entry.name,
      path: entryPath,
      bytes: measurement.bytes,
      complete: measurement.complete,
      visitedEntries: measurement.visitedEntries,
    });
    scannedChildren += 1;
  }

  return {
    entries: entries
      .sort((left, right) => {
        if (right.bytes !== left.bytes) {
          return right.bytes - left.bytes;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, topCount),
    partialEntries: entries.filter((entry) => entry.complete === false).length,
    scannedChildren,
    totalChildren: candidates.length,
    truncatedChildren: Math.max(candidates.length - scannedChildren, 0),
  };
}

function inventoryDirectoryChildren(targetPath, topCount = 10, options = {}) {
  return inventoryDirectoryChildrenReport(targetPath, topCount, options).entries;
}

function summarizeRecentDockerFailureLines(env = process.env, options = {}) {
  const localAppData = env.LOCALAPPDATA;
  if (!localAppData) {
    return [];
  }

  const lineLimit =
    Number.isFinite(options.lineLimit) && options.lineLimit > 0
      ? options.lineLimit
      : DEFAULT_DOCKER_LOG_SUMMARY_LINE_COUNT;
  const hostLogPath = path.join(
    localAppData,
    "Docker",
    "log",
    "host",
    "com.docker.backend.exe.log",
  );
  if (!fs.existsSync(hostLogPath)) {
    return [];
  }

  const content = fs.readFileSync(hostLogPath, "utf8");
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const matchers = [
    /HCS_E_CONNECTION_TIMEOUT/u,
    /CreateVm/u,
    /MountVhdx/u,
    /dockerAgent/u,
    /context deadline exceeded/u,
    /The system cannot find the file specified/u,
    /没有收到虚拟机或容器的回应/u,
    /未能启动 localhost 中继进程/u,
  ];

  const matches = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!matchers.some((pattern) => pattern.test(line))) {
      continue;
    }

    matches.push(line);
    if (matches.length >= lineLimit) {
      break;
    }
  }

  return matches.reverse();
}

function parseWslListOutput(rawOutput) {
  if (typeof rawOutput !== "string" || rawOutput.trim().length === 0) {
    return [];
  }

  return rawOutput
    .replace(/\u0000/gu, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^NAME\s+STATE\s+VERSION$/iu.test(line))
    .map((line) => line.replace(/^\*/u, "").trim())
    .map((line) => {
      const match = line.match(
        /^(.*?)\s{2,}(Running|Stopped|Installing|Uninstalling)\s+(\d+)$/u,
      );
      if (!match) {
        return null;
      }

      return {
        name: match[1].trim(),
        state: match[2],
        version: Number(match[3]),
      };
    })
    .filter((item) => item !== null);
}

function readWslDistributionStates(runCommand = defaultRunCommand) {
  const result = runCommand("wsl", ["-l", "-v"], { timeoutMs: 30000 });
  if (result.status !== 0) {
    return {
      ok: false,
      entries: [],
      message:
        (result.stderr || result.stdout || "").trim() ||
        `wsl -l -v exited with ${result.status}`,
    };
  }

  return {
    ok: true,
    entries: parseWslListOutput(String(result.stdout || "")),
  };
}

function logInventoryReport(targetPath, topCount, logger, options = {}) {
  const label = options.label || "directory";
  const inventory = inventoryDirectoryChildrenReport(targetPath, topCount, {
    now: options.now,
    perEntryBudgetMs: options.perEntryBudgetMs,
    totalBudgetMs: options.totalBudgetMs,
  });

  logger.info(`Top ${topCount} ${label} children by size:`);
  for (const entry of inventory.entries) {
    logger.info(
      `- ${entry.name}: ${formatGigabytes(entry.bytes)}${entry.complete ? "" : " (partial scan)"} (${entry.path})`,
    );
  }
  if (inventory.partialEntries > 0) {
    logger.info(
      `Some ${label} directory sizes are approximate because the recursive scan hit its per-directory time budget or an unreadable subtree.`,
    );
  }
  if (inventory.truncatedChildren > 0) {
    logger.info(
      `${label} inventory scanned ${inventory.scannedChildren}/${inventory.totalChildren} children before hitting the total time budget. Re-run with --localappdata-inventory-budget-ms or --localappdata-child-budget-ms for a deeper scan.`,
    );
  }

  return inventory;
}

async function recoverBackendReleaseHost(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const logger = options.logger || { fail, info, pass };
  const topInventoryChildren = options.topLocalAppDataChildren ?? 10;
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
  const dockerFailureSignalsBeforeCleanup = initialDockerStatus.ok
    ? []
    : summarizeRecentDockerFailureLines(env, {
        lineLimit: options.dockerLogSummaryLineCount,
      });

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
    const cleanupResult = cleanSafeCleanupCandidates(cleanupCandidates, logger);
    if (cleanupResult.failedPaths.length > 0) {
      for (const failedPath of cleanupResult.failedPaths.slice(0, 10)) {
        logger.info(
          `Skipped locked cleanup path (${failedPath.label}): ${failedPath.path} (${failedPath.error})`,
        );
      }
      if (cleanupResult.failedPaths.length > 10) {
        logger.info(
          `Skipped ${cleanupResult.failedPaths.length - 10} additional locked cleanup path(s).`,
        );
      }
    }
  }

  if (options.inventoryLocalAppData === true && localAppData) {
    logInventoryReport(
      localAppData,
      topInventoryChildren,
      logger,
      {
        label: "LocalAppData",
        now: options.now,
        perEntryBudgetMs: options.localAppDataChildBudgetMs,
        totalBudgetMs: options.localAppDataInventoryBudgetMs,
      },
    );
  }

  if (options.inventoryPath) {
    logInventoryReport(
      options.inventoryPath,
      topInventoryChildren,
      logger,
      {
        label: `inventory path ${options.inventoryPath}`,
        now: options.now,
        perEntryBudgetMs: options.localAppDataChildBudgetMs,
        totalBudgetMs: options.localAppDataInventoryBudgetMs,
      },
    );
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
    const wslStates = readWslDistributionStates(runCommand);
    const dockerDesktopWsl =
      wslStates.entries.find((entry) => entry.name === "docker-desktop") ?? null;
    if (dockerDesktopWsl?.state === "Running") {
      logger.info(
        "Docker-specific WSL distro `docker-desktop` still reports Running while the Linux engine is unreachable. This usually indicates a stuck Docker WSL VM/bootstrap path rather than a missing Docker install.",
      );
    }
    const recentDockerFailures = summarizeRecentDockerFailureLines(env, {
      lineLimit: options.dockerLogSummaryLineCount,
    });
    const failureSignalsToReport =
      recentDockerFailures.length > 0
        ? recentDockerFailures
        : dockerFailureSignalsBeforeCleanup;
    if (failureSignalsToReport.length > 0) {
      logger.info("Recent Docker backend failure signals:");
      for (const line of failureSignalsToReport) {
        logger.info(`- ${line}`);
      }
    }
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
  ensureDockerDesktopServiceRunning,
  formatGigabytes,
  getWindowsServiceStatus,
  getSafeCleanupTargets,
  inventoryDirectoryChildren,
  inventoryDirectoryChildrenReport,
  logInventoryReport,
  measurePathBytes,
  parseArgs,
  parseWslListOutput,
  readWslDistributionStates,
  recoverBackendReleaseHost,
  restartDockerDesktop,
  summarizeRecentDockerFailureLines,
  sumPathBytes,
  waitForDockerEngine,
};
