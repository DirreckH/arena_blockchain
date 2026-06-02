const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  checkBackendReleaseHostPreflight,
} = require("./check-backend-release-host-preflight.cjs");

test("check-backend-release-host-preflight passes when the env contract, docker reachability, and host free space are healthy", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-preflight-pass-"),
  );
  const localAppData = path.join(workspace, "localapp");
  const dockerDiskPath = path.join(
    localAppData,
    "Docker",
    "wsl",
    "disk",
    "docker_data.vhdx",
  );
  const envFilePath = path.join(
    workspace,
    "validation-local",
    "release-rehearsal.env",
  );
  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(
    envFilePath,
    ["COMPOSE_PROJECT_NAME=arena-release-rehearsal", "JWT_SECRET=test-secret"].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await checkBackendReleaseHostPreflight({
    cwd: workspace,
    env: { LOCALAPPDATA: localAppData },
    getDriveFreeBytes: () => 32 * 1024 ** 3,
    logger,
    platform: "win32",
    runCommand: () => ({
      status: 0,
      stdout: "29.5.2\n",
      stderr: "",
    }),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(logger.failMessages, []);
  assert.equal(
    logger.passMessages.includes("Docker engine reachable: 29.5.2"),
    true,
  );
  assert.equal(
    logger.passMessages.includes("Backend release host preflight passed."),
    true,
  );
});

test("check-backend-release-host-preflight fails when the compose project contract is missing and Docker Desktop data drive is too full", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-host-preflight-fail-"),
  );
  const localAppData = path.join(workspace, "localapp");
  const dockerDiskPath = path.join(
    localAppData,
    "Docker",
    "wsl",
    "disk",
    "docker_data.vhdx",
  );
  const envFilePath = path.join(
    workspace,
    "validation-local",
    "release-rehearsal.env",
  );
  fs.mkdirSync(path.dirname(dockerDiskPath), { recursive: true });
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(dockerDiskPath, "disk", "utf8");
  fs.writeFileSync(envFilePath, "JWT_SECRET=test-secret\n", "utf8");

  const logger = createLogger();
  const exitCode = await checkBackendReleaseHostPreflight({
    cwd: workspace,
    env: { LOCALAPPDATA: localAppData },
    getDriveFreeBytes: () => 4 * 1024 ** 3,
    logger,
    minDockerDesktopDriveFreeGb: 15,
    platform: "win32",
    runCommand: () => ({
      status: 0,
      stdout: "29.5.2\n",
      stderr: "",
    }),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Backend release host preflight failed.",
  ]);
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("missing COMPOSE_PROJECT_NAME"),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("only has 4 GiB free"),
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
