const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  cleanSafeCleanupCandidates,
  collectSafeCleanupCandidates,
  inventoryDirectoryChildren,
  parseArgs,
  recoverBackendReleaseHost,
  waitForDockerEngine,
} = require("./recover-backend-release-host.cjs");

test("parseArgs enables safe cache cleanup, docker restart, and LocalAppData inventory", () => {
  const parsed = parseArgs([
    "--clean-safe-caches",
    "--restart-docker",
    "--inventory-localappdata",
    "--min-free-gb",
    "20",
    "--wait-for-docker-ms",
    "45000",
    "--top-localappdata-children",
    "12",
  ]);

  assert.equal(parsed.cleanSafeCaches, true);
  assert.equal(parsed.restartDocker, true);
  assert.equal(parsed.inventoryLocalAppData, true);
  assert.equal(parsed.minDockerDesktopDriveFreeGb, 20);
  assert.equal(parsed.waitForDockerMs, 45000);
  assert.equal(parsed.topLocalAppDataChildren, 12);
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
  const removedBytes = cleanSafeCleanupCandidates(
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

  assert.equal(removedBytes, 8);
  assert.equal(fs.existsSync(cacheDir), true);
  assert.deepEqual(fs.readdirSync(cacheDir), []);
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("Removed local temp files"),
    ),
    true,
  );
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

  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(npmCacheFile), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(npmCacheFile, Buffer.alloc(128));

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
