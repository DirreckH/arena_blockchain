const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  cleanSafeCleanupCandidates,
  collectSafeCleanupCandidates,
  ensureDockerDesktopServiceRunning,
  getWindowsServiceStatus,
  inventoryDirectoryChildren,
  inventoryDirectoryChildrenReport,
  parseArgs,
  parseWslListOutput,
  readWslDistributionStates,
  recoverBackendReleaseHost,
  restartDockerDesktop,
  summarizeRecentDockerFailureLines,
  waitForDockerEngine,
} = require("./recover-backend-release-host.cjs");

test("parseArgs enables safe cache cleanup, docker restart, and LocalAppData inventory", () => {
  const parsed = parseArgs([
    "--clean-safe-caches",
    "--restart-docker",
    "--inventory-localappdata",
    "--inventory-path",
    "custom-cache",
    "--min-free-gb",
    "20",
    "--wait-for-docker-ms",
    "45000",
    "--top-localappdata-children",
    "12",
    "--localappdata-inventory-budget-ms",
    "9000",
    "--localappdata-child-budget-ms",
    "700",
  ]);

  assert.equal(parsed.cleanSafeCaches, true);
  assert.equal(parsed.restartDocker, true);
  assert.equal(parsed.inventoryLocalAppData, true);
  assert.equal(parsed.inventoryPath, path.resolve(process.cwd(), "custom-cache"));
  assert.equal(parsed.minDockerDesktopDriveFreeGb, 20);
  assert.equal(parsed.waitForDockerMs, 45000);
  assert.equal(parsed.topLocalAppDataChildren, 12);
  assert.equal(parsed.localAppDataInventoryBudgetMs, 9000);
  assert.equal(parsed.localAppDataChildBudgetMs, 700);
});

test("collectSafeCleanupCandidates reports the known safe cache targets and their sizes", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-targets-"),
  );
  const localAppData = path.join(workspace, "Local");
  const npmCacheFile = path.join(localAppData, "npm-cache", "blob.bin");
  const tempFile = path.join(localAppData, "Temp", "temp.txt");
  const dockerLogFile = path.join(localAppData, "Docker", "log", "host.log");
  const crashDumpFile = path.join(localAppData, "CrashDumps", "dump.dmp");

  fs.mkdirSync(path.dirname(npmCacheFile), { recursive: true });
  fs.mkdirSync(path.dirname(tempFile), { recursive: true });
  fs.mkdirSync(path.dirname(dockerLogFile), { recursive: true });
  fs.mkdirSync(path.dirname(crashDumpFile), { recursive: true });
  fs.writeFileSync(npmCacheFile, Buffer.alloc(8));
  fs.writeFileSync(tempFile, Buffer.alloc(16));
  fs.writeFileSync(dockerLogFile, Buffer.alloc(32));
  fs.writeFileSync(crashDumpFile, Buffer.alloc(64));

  const candidates = collectSafeCleanupCandidates({
    LOCALAPPDATA: localAppData,
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.label),
    [
      "npm cache",
      "local temp files",
      "Docker Desktop logs",
      "Windows crash dumps",
    ],
  );
  assert.equal(
    candidates.find((candidate) => candidate.label === "npm cache").bytes,
    8,
  );
  assert.equal(
    candidates.find((candidate) => candidate.label === "local temp files").bytes,
    16,
  );
});

test("cleanSafeCleanupCandidates clears only the known cache contents", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-clean-"),
  );
  const cacheDir = path.join(workspace, "Temp");
  const cacheFile = path.join(cacheDir, "nested", "artifact.txt");

  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, "artifact", "utf8");

  const logger = createLogger();
  const cleanupResult = cleanSafeCleanupCandidates(
    [
      {
        bytes: 8,
        exists: true,
        label: "local temp files",
        path: cacheDir,
      },
    ],
    logger,
  );

  assert.equal(cleanupResult.removedBytes, 8);
  assert.deepEqual(cleanupResult.failedPaths, []);
  assert.equal(fs.existsSync(cacheDir), true);
  assert.deepEqual(fs.readdirSync(cacheDir), []);
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("Removed local temp files"),
    ),
    true,
  );
});

test("cleanSafeCleanupCandidates skips locked paths and continues cleaning remaining entries", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-partial-clean-"),
  );
  const cacheDir = path.join(workspace, "Temp");
  const removableDir = path.join(cacheDir, "removable");
  const lockedDir = path.join(cacheDir, "locked");
  const removableFile = path.join(removableDir, "artifact.txt");
  const lockedFile = path.join(lockedDir, "artifact.txt");
  const originalRmSync = fs.rmSync;

  fs.mkdirSync(path.dirname(removableFile), { recursive: true });
  fs.mkdirSync(path.dirname(lockedFile), { recursive: true });
  fs.writeFileSync(removableFile, "removable", "utf8");
  fs.writeFileSync(lockedFile, "locked", "utf8");

  fs.rmSync = (targetPath, options) => {
    if (String(targetPath).includes(`${path.sep}locked`)) {
      const error = new Error("EPERM, Permission denied");
      error.code = "EPERM";
      throw error;
    }

    return originalRmSync.call(fs, targetPath, options);
  };

  try {
    const logger = createLogger();
    const cleanupResult = cleanSafeCleanupCandidates(
      [
        {
          bytes: 16,
          exists: true,
          label: "local temp files",
          path: cacheDir,
        },
      ],
      logger,
    );

    assert.equal(cleanupResult.removedBytes, 16);
    assert.equal(cleanupResult.failedPaths.length, 1);
    assert.equal(
      cleanupResult.failedPaths[0]?.path.endsWith(`${path.sep}locked`),
      true,
    );
    assert.equal(fs.existsSync(removableDir), false);
    assert.equal(fs.existsSync(lockedDir), true);
    assert.equal(
      logger.infoMessages.some((message) =>
        message.includes("Partially removed local temp files"),
      ),
      true,
    );
  } finally {
    fs.rmSync = originalRmSync;
  }
});

test("inventoryDirectoryChildren sorts LocalAppData children by descending size", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-inventory-"),
  );
  const smallFile = path.join(workspace, "small", "a.bin");
  const largeFile = path.join(workspace, "large", "b.bin");

  fs.mkdirSync(path.dirname(smallFile), { recursive: true });
  fs.mkdirSync(path.dirname(largeFile), { recursive: true });
  fs.writeFileSync(smallFile, Buffer.alloc(4));
  fs.writeFileSync(largeFile, Buffer.alloc(12));

  const entries = inventoryDirectoryChildren(workspace, 2);

  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["large", "small"],
  );
  assert.deepEqual(
    entries.map((entry) => entry.bytes),
    [12, 4],
  );
});

test("inventoryDirectoryChildrenReport marks partial scans and truncates when the time budget is exhausted", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-inventory-budget-"),
  );
  const alphaFile = path.join(workspace, "alpha", "a.bin");
  const betaFile = path.join(workspace, "beta", "b.bin");
  const gammaFile = path.join(workspace, "gamma", "c.bin");

  fs.mkdirSync(path.dirname(alphaFile), { recursive: true });
  fs.mkdirSync(path.dirname(betaFile), { recursive: true });
  fs.mkdirSync(path.dirname(gammaFile), { recursive: true });
  fs.writeFileSync(alphaFile, Buffer.alloc(4));
  fs.writeFileSync(betaFile, Buffer.alloc(16));
  fs.writeFileSync(gammaFile, Buffer.alloc(8));

  let nowMs = 0;
  const report = inventoryDirectoryChildrenReport(workspace, 5, {
    now: () => {
      nowMs += 5;
      return nowMs;
    },
    perEntryBudgetMs: 3,
    totalBudgetMs: 16,
  });

  assert.equal(report.entries.length >= 1, true);
  assert.equal(report.partialEntries >= 1, true);
  assert.equal(report.scannedChildren < report.totalChildren, true);
  assert.equal(report.truncatedChildren > 0, true);
  assert.equal(
    report.entries.some((entry) => entry.complete === false),
    true,
  );
});

test("logInventoryReport writes a labeled directory inventory summary", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-log-inventory-"),
  );
  const heavyFile = path.join(workspace, "heavy", "artifact.bin");
  const lightFile = path.join(workspace, "light", "artifact.bin");
  fs.mkdirSync(path.dirname(heavyFile), { recursive: true });
  fs.mkdirSync(path.dirname(lightFile), { recursive: true });
  fs.writeFileSync(heavyFile, Buffer.alloc(16));
  fs.writeFileSync(lightFile, Buffer.alloc(4));

  const logger = createLogger();
  const { logInventoryReport } = require("./recover-backend-release-host.cjs");
  const report = logInventoryReport(workspace, 2, logger, {
    label: "custom inventory path",
    perEntryBudgetMs: 200,
    totalBudgetMs: 1000,
  });

  assert.equal(report.entries.length, 2);
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("Top 2 custom inventory path children by size:"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) => message.includes("heavy")),
    true,
  );
});

test("summarizeRecentDockerFailureLines returns the latest high-signal backend log lines", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-log-summary-"),
  );
  const localAppData = path.join(workspace, "Local");
  const logPath = path.join(
    localAppData,
    "Docker",
    "log",
    "host",
    "com.docker.backend.exe.log",
  );

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    [
      "noise line",
      "[2026-06-08T00:59:54Z] Wsl/Service/CreateInstance/CreateVm/HCS_E_CONNECTION_TIMEOUT",
      "[2026-06-08T01:00:01Z] open \\\\.\\pipe\\dockerAgent: The system cannot find the file specified.",
      "[2026-06-08T01:00:08Z] context deadline exceeded while awaiting headers",
    ].join("\n"),
    "utf8",
  );

  const lines = summarizeRecentDockerFailureLines(
    { LOCALAPPDATA: localAppData },
    { lineLimit: 2 },
  );

  assert.deepEqual(lines, [
    "[2026-06-08T01:00:01Z] open \\\\.\\pipe\\dockerAgent: The system cannot find the file specified.",
    "[2026-06-08T01:00:08Z] context deadline exceeded while awaiting headers",
  ]);
});

test("parseWslListOutput extracts distro state rows from nul-padded wsl -l -v output", () => {
  const entries = parseWslListOutput(
    "\u0000  NAME               STATE           VERSION\r\n\u0000* Ubuntu-24.04      Stopped         2\r\n\u0000  docker-desktop     Running         2\r\n",
  );

  assert.deepEqual(entries, [
    { name: "Ubuntu-24.04", state: "Stopped", version: 2 },
    { name: "docker-desktop", state: "Running", version: 2 },
  ]);
});

test("readWslDistributionStates shells out to wsl -l -v and parses distro states", () => {
  const result = readWslDistributionStates((command, args) => {
    assert.equal(command, "wsl");
    assert.deepEqual(args, ["-l", "-v"]);
    return {
      status: 0,
      stdout:
        "\u0000  NAME               STATE           VERSION\r\n\u0000* Ubuntu-24.04      Stopped         2\r\n\u0000  docker-desktop     Running         2\r\n",
      stderr: "",
    };
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.entries, [
    { name: "Ubuntu-24.04", state: "Stopped", version: 2 },
    { name: "docker-desktop", state: "Running", version: 2 },
  ]);
});

test("recoverBackendReleaseHost surfaces the stuck-docker-desktop WSL hint when that distro still reports Running", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-running-wsl-hint-"),
  );
  const localAppData = path.join(workspace, "Local");
  const dockerDiskPath = path.join(
    localAppData,
    "Docker",
    "wsl",
    "disk",
    "docker_data.vhdx",
  );
  const backendLogPath = path.join(
    localAppData,
    "Docker",
    "log",
    "host",
    "com.docker.backend.exe.log",
  );

  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(backendLogPath), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(
    backendLogPath,
    "[2026-06-08T01:00:08Z] context deadline exceeded while awaiting headers",
    "utf8",
  );

  const logger = createLogger();
  await recoverBackendReleaseHost({
    cwd: workspace,
    env: { LOCALAPPDATA: localAppData, ProgramFiles: "C:\\Program Files" },
    getDriveFreeBytes: () => 4 * 1024 ** 3,
    logger,
    platform: "win32",
    runCommand(command, args) {
      if (command === "wsl") {
        return {
          status: 0,
          stdout:
            "\u0000  NAME               STATE           VERSION\r\n\u0000* Ubuntu-24.04      Stopped         2\r\n\u0000  docker-desktop     Running         2\r\n",
          stderr: "",
        };
      }
      return {
        status: 1,
        stdout: "",
        stderr: "request returned 500 Internal Server Error",
      };
    },
  });

  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("docker-desktop` still reports Running"),
    ),
    true,
  );
});

test("waitForDockerEngine polls until the Docker CLI reaches the Linux engine", async () => {
  let attempts = 0;
  let now = 0;
  const logger = createLogger();
  const result = await waitForDockerEngine({
    logger,
    now: () => now,
    pollIntervalMs: 1000,
    runCommand() {
      attempts += 1;
      if (attempts < 3) {
        return {
          status: 1,
          stdout: "",
          stderr: "request returned 500 Internal Server Error",
        };
      }

      return {
        status: 0,
        stdout: "29.5.2\n",
        stderr: "",
      };
    },
    sleep: async (ms) => {
      now += ms;
    },
    timeoutMs: 5000,
  });

  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
  assert.equal(
    logger.passMessages.includes("Docker engine reachable after recovery: 29.5.2"),
    true,
  );
});

test("getWindowsServiceStatus reads Docker Desktop Windows service state when present", () => {
  const status = getWindowsServiceStatus("com.docker.service", (command, args) => {
    assert.equal(command, "powershell");
    assert.equal(
      args.some((value) =>
        String(value).includes(
          "Get-Service -Name 'com.docker.service' -ErrorAction SilentlyContinue",
        ),
      ),
      true,
    );
    return {
      status: 0,
      stdout: "Running\n",
      stderr: "",
    };
  });

  assert.deepEqual(status, {
    available: true,
    status: "Running",
  });
});

test("getWindowsServiceStatus falls back to sc.exe when PowerShell service inspection times out", () => {
  let callCount = 0;
  const status = getWindowsServiceStatus("com.docker.service", (command, args) => {
    callCount += 1;
    if (callCount === 1) {
      assert.equal(command, "powershell");
      return {
        status: null,
        stdout: "",
        stderr: "",
        error: new Error("spawnSync powershell ETIMEDOUT"),
      };
    }

    assert.equal(command, "sc.exe");
    assert.deepEqual(args, ["query", "com.docker.service"]);
    return {
      status: 0,
      stdout: [
        "SERVICE_NAME: com.docker.service",
        "        TYPE               : 10  WIN32_OWN_PROCESS",
        "        STATE              : 4  RUNNING",
      ].join("\n"),
      stderr: "",
    };
  });

  assert.deepEqual(status, {
    available: true,
    status: "RUNNING",
  });
});

test("ensureDockerDesktopServiceRunning restarts the Windows service when it is already running", () => {
  const calls = [];
  const logger = createLogger();
  const result = ensureDockerDesktopServiceRunning({
    logger,
    runCommand(command, args) {
      calls.push([command, args]);
      if (calls.length === 1) {
        return {
          status: 0,
          stdout: "Running\n",
          stderr: "",
        };
      }

      return {
        status: 0,
        stdout: "",
        stderr: "",
      };
    },
  });

  assert.deepEqual(result, {
    action: "restarted",
    available: true,
    status: "Running",
  });
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("Restarting Docker Desktop Windows service"),
    ),
    true,
  );
  assert.equal(calls.length, 2);
});

test("restartDockerDesktop restarts the Windows service before relaunching Docker Desktop", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-restart-service-"),
  );
  const dockerDesktopPath = path.join(workspace, "Docker Desktop.exe");
  fs.writeFileSync(dockerDesktopPath, "exe", "utf8");

  const calls = [];
  const logger = createLogger();
  restartDockerDesktop({
    dockerDesktopPath,
    logger,
    runCommand(command, args) {
      calls.push([command, args]);
      if (
        args.includes(
          "($service = Get-Service -Name 'com.docker.service' -ErrorAction SilentlyContinue) | ForEach-Object { $_.Status.ToString() }",
        )
      ) {
        return {
          status: 0,
          stdout: "Running\n",
          stderr: "",
        };
      }

      return {
        status: 0,
        stdout: "",
        stderr: "",
      };
    },
    startProcess(filePath) {
      calls.push(["startProcess", [filePath]]);
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("Restarting Docker Desktop Windows service"),
    ),
    true,
  );
  assert.deepEqual(calls.at(-1), ["startProcess", [dockerDesktopPath]]);
});

test("recoverBackendReleaseHost reports incomplete recovery when Docker is still unreachable and free space remains below the safety threshold", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-fail-"),
  );
  const localAppData = path.join(workspace, "Local");
  const dockerDiskPath = path.join(
    localAppData,
    "Docker",
    "wsl",
    "disk",
    "docker_data.vhdx",
  );
  const npmCacheFile = path.join(localAppData, "npm-cache", "blob.bin");
  const backendLogPath = path.join(
    localAppData,
    "Docker",
    "log",
    "host",
    "com.docker.backend.exe.log",
  );

  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(npmCacheFile), { recursive: true });
  fs.mkdirSync(path.dirname(backendLogPath), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(npmCacheFile, Buffer.alloc(128));
  fs.writeFileSync(
    backendLogPath,
    [
      "[2026-06-08T00:59:54Z] Wsl/Service/CreateInstance/CreateVm/HCS_E_CONNECTION_TIMEOUT",
      "[2026-06-08T01:00:08Z] context deadline exceeded while awaiting headers",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await recoverBackendReleaseHost({
    cleanSafeCaches: true,
    cwd: workspace,
    env: { LOCALAPPDATA: localAppData, ProgramFiles: "C:\\Program Files" },
    getDriveFreeBytes: () => 4 * 1024 ** 3,
    logger,
    platform: "win32",
    runCommand() {
      return {
        status: 1,
        stdout: "",
        stderr: "request returned 500 Internal Server Error",
      };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Backend release host recovery is incomplete.",
  ]);
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("Docker CLI still cannot reach the Linux engine"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("still only has 4 GiB free"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("Recent Docker backend failure signals:"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("HCS_E_CONNECTION_TIMEOUT") ||
      message.includes("context deadline exceeded"),
    ),
    true,
  );
});

test("recoverBackendReleaseHost passes after safe cache cleanup and Docker restart restore the host guardrails", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-pass-"),
  );
  const localAppData = path.join(workspace, "Local");
  const dockerDiskPath = path.join(
    localAppData,
    "Docker",
    "wsl",
    "disk",
    "docker_data.vhdx",
  );
  const npmCacheFile = path.join(localAppData, "npm-cache", "blob.bin");
  const dockerDesktopPath = path.join(workspace, "Docker Desktop.exe");

  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(npmCacheFile), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(npmCacheFile, Buffer.alloc(128));
  fs.writeFileSync(dockerDesktopPath, "exe", "utf8");

  let dockerReachable = false;
  const logger = createLogger();
  const exitCode = await recoverBackendReleaseHost({
    cleanSafeCaches: true,
    cwd: workspace,
    dockerDesktopPath,
    env: { LOCALAPPDATA: localAppData, ProgramFiles: "C:\\Program Files" },
    getDriveFreeBytes: () => 24 * 1024 ** 3,
    logger,
    localAppDataChildBudgetMs: 10,
    localAppDataInventoryBudgetMs: 50,
    now: (() => {
      let value = 0;
      return () => value;
    })(),
    platform: "win32",
    restartDocker: true,
    runCommand(command, args) {
      if (command === "docker") {
        return dockerReachable
          ? { status: 0, stdout: "29.5.2\n", stderr: "" }
          : { status: 1, stdout: "", stderr: "request returned 500 Internal Server Error" };
      }

      return { status: 0, stdout: "", stderr: "" };
    },
    sleep: async () => {
      dockerReachable = true;
    },
    startProcess() {
      dockerReachable = true;
      return { status: 0, stdout: "", stderr: "" };
    },
    waitForDockerMs: 10000,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(logger.failMessages, []);
  assert.equal(
    logger.passMessages.includes("Backend release host recovery passed."),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(localAppData, "npm-cache", "blob.bin")),
    false,
  );
});

test("recoverBackendReleaseHost inventories an explicit target path when requested", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-recover-explicit-inventory-"),
  );
  const localAppData = path.join(workspace, "Local");
  const inventoryPath = path.join(workspace, "manual-inventory");
  const dockerDiskPath = path.join(
    localAppData,
    "Docker",
    "wsl",
    "disk",
    "docker_data.vhdx",
  );
  const inventoryFile = path.join(inventoryPath, "large", "blob.bin");

  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(inventoryFile), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(inventoryFile, Buffer.alloc(64));

  const logger = createLogger();
  const exitCode = await recoverBackendReleaseHost({
    cwd: workspace,
    env: { LOCALAPPDATA: localAppData, ProgramFiles: "C:\\Program Files" },
    getDriveFreeBytes: () => 4 * 1024 ** 3,
    inventoryPath,
    localAppDataChildBudgetMs: 100,
    localAppDataInventoryBudgetMs: 1000,
    logger,
    platform: "win32",
    runCommand(command, args) {
      if (command === "wsl") {
        return {
          status: 0,
          stdout:
            "\u0000  NAME               STATE           VERSION\r\n\u0000* Ubuntu-24.04      Stopped         2\r\n\u0000  docker-desktop     Running         2\r\n",
          stderr: "",
        };
      }
      return {
        status: 1,
        stdout: "",
        stderr: "request returned 500 Internal Server Error",
      };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes(`Top 10 inventory path ${inventoryPath} children by size:`) ||
      message.includes(`Top 10 inventory path ${inventoryPath.replace(/\\/gu, "\\")} children by size:`),
    ),
    true,
  );
});

function createLogger() {
  return {
    failMessages: [],
    infoMessages: [],
    passMessages: [],
    fail(message) {
      this.failMessages.push(message);
    },
    info(message) {
      this.infoMessages.push(message);
    },
    pass(message) {
      this.passMessages.push(message);
    },
  };
}
