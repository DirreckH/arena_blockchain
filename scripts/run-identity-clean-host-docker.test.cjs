const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildDockerBuildCommand,
  buildDockerCleanupCommand,
  buildDockerRunCommand,
  parseArgs,
  runIdentityCleanHostDocker,
} = require("./run-identity-clean-host-docker.cjs");

test("parseArgs resolves Docker clean-host identity gate options", () => {
  const parsed = parseArgs([
    "--runs",
    "5",
    "--image-tag",
    "arena-api-identity-gate:test",
    "--output",
    "validation-local/identity-clean-host-docker-summary.json",
    "--log-dir",
    "validation-local/identity-clean-host-logs",
    "--skip-build",
    "--build-no-cache",
    "--resume",
    "--accepted-output",
    "validation-local/identity-clean-host-docker-summary.accepted.json",
  ]);

  assert.equal(parsed.runs, 5);
  assert.equal(parsed.imageTag, "arena-api-identity-gate:test");
  assert.equal(
    parsed.outputPath,
    path.resolve(
      process.cwd(),
      "validation-local/identity-clean-host-docker-summary.json",
    ),
  );
  assert.equal(
    parsed.logDir,
    path.resolve(process.cwd(), "validation-local/identity-clean-host-logs"),
  );
  assert.equal(parsed.skipBuild, true);
  assert.equal(parsed.buildNoCache, true);
  assert.equal(parsed.resume, true);
  assert.equal(
    parsed.acceptedOutputPath,
    path.resolve(
      process.cwd(),
      "validation-local/identity-clean-host-docker-summary.accepted.json",
    ),
  );
});

test("buildDockerBuildCommand preserves the Docker image contract", () => {
  assert.deepEqual(
    buildDockerBuildCommand({
      cwd: "F:/arena_blockchain",
      dockerfilePath: "F:/arena_blockchain/apps/api/Dockerfile.identity-gate",
      imageTag: "arena-api-identity-gate:test",
      buildNoCache: true,
    }),
    {
      args: [
        "build",
        "--no-cache",
        "-f",
        "F:/arena_blockchain/apps/api/Dockerfile.identity-gate",
        "-t",
        "arena-api-identity-gate:test",
        ".",
      ],
      command: "docker",
      cwd: "F:/arena_blockchain",
      env: process.env,
      label: "docker:build:identity-clean-host",
    },
  );
});

test("buildDockerCleanupCommand builds the canonical stale-container cleanup invocation", () => {
  assert.deepEqual(
    buildDockerCleanupCommand({
      cwd: "F:/arena_blockchain",
      runIndex: 3,
    }),
    {
      args: ["rm", "-f", "arena-identity-clean-host-run-3"],
      command: "docker",
      cwd: "F:/arena_blockchain",
      env: process.env,
      label: "docker:cleanup:identity-clean-host#3",
    },
  );
});
test("buildDockerRunCommand builds the canonical container invocation for each run", () => {
  assert.deepEqual(
    buildDockerRunCommand({
      cwd: "F:/arena_blockchain",
      imageTag: "arena-api-identity-gate:test",
      runIndex: 3,
    }),
    {
      args: [
        "run",
        "--rm",
        "--name",
        "arena-identity-clean-host-run-3",
        "-e",
        "CI=true",
        "-e",
        "ARENA_STABLE_TEST_STEP_PAUSE_MS=0",
        "arena-api-identity-gate:test",
        "pnpm",
        "run",
        "api:test:identity",
      ],
      command: "docker",
      cwd: "F:/arena_blockchain",
      env: process.env,
      label: "docker:run:identity-clean-host#3",
    },
  );
});

test("runIdentityCleanHostDocker builds once, runs the requested passes, and writes a summary", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-identity-clean-host-docker-"),
  );
  const outputPath = path.join(
    workspace,
    "validation-local",
    "identity-clean-host-docker-summary.json",
  );
  const logDir = path.join(workspace, "validation-local", "identity-clean-host-logs");
  const calls = [];

  const exitCode = await runIdentityCleanHostDocker({
    cwd: workspace,
    runs: 2,
    outputPath,
    logDir,
    imageTag: "arena-api-identity-gate:test",
    nowFactory: createFixedNowFactory("2026-06-15T09:30:00.000Z"),
    getCommitSha: () => "abc123def456",
    logger: createLogger(),
    runCommand(command) {
      calls.push({
        label: command.label,
        command: command.command,
        args: [...command.args],
      });

      return {
        endedAt: new Date("2026-06-15T09:30:05.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-15T09:30:00.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.label),
    [
      "docker:build:identity-clean-host",
      "docker:cleanup:identity-clean-host#1",
      "docker:run:identity-clean-host#1",
      "docker:cleanup:identity-clean-host#2",
      "docker:run:identity-clean-host#2",
    ],
  );
  assert.deepEqual(calls[1].args, ["rm", "-f", "arena-identity-clean-host-run-1"]);
  assert.deepEqual(calls[2].args, [
    "run",
    "--rm",
    "--name",
    "arena-identity-clean-host-run-1",
    "-e",
    "CI=true",
    "-e",
    "ARENA_STABLE_TEST_STEP_PAUSE_MS=0",
    "arena-api-identity-gate:test",
    "pnpm",
    "run",
    "api:test:identity",
  ]);

  const summary = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(summary.accepted, false);
  assert.equal(summary.requiredConsecutivePasses, 5);
  assert.equal(summary.runsRequested, 2);
  assert.equal(summary.runsCompleted, 2);
  assert.equal(summary.consecutivePasses, 2);
  assert.equal(summary.commitSha, "abc123def456");
  assert.equal(summary.runs.length, 2);
  assert.equal(fs.existsSync(summary.runs[0].logPath), true);
});

test("runIdentityCleanHostDocker tolerates missing stale containers before each run", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-identity-clean-host-docker-missing-cleanup-"),
  );
  const calls = [];

  const exitCode = await runIdentityCleanHostDocker({
    cwd: workspace,
    runs: 1,
    imageTag: "arena-api-identity-gate:test",
    skipBuild: true,
    logger: createLogger(),
    runCommand(command) {
      calls.push(command.label);

      if (command.label === "docker:cleanup:identity-clean-host#1") {
        return {
          endedAt: new Date("2026-06-15T09:30:01.000Z"),
          error: null,
          signal: null,
          startedAt: new Date("2026-06-15T09:30:00.000Z"),
          status: 1,
          stderr: "Error response from daemon: No such container: arena-identity-clean-host-run-1\n",
          stdout: "",
        };
      }

      return {
        endedAt: new Date("2026-06-15T09:30:05.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-15T09:30:02.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "docker:cleanup:identity-clean-host#1",
    "docker:run:identity-clean-host#1",
  ]);
});
test("runIdentityCleanHostDocker resumes from sequential green logs and archives accepted proof", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-identity-clean-host-docker-resume-"),
  );
  const logDir = path.join(workspace, "validation-local", "identity-clean-host-logs");
  const outputPath = path.join(
    workspace,
    "validation-local",
    "identity-clean-host-docker-summary.json",
  );
  const acceptedOutputPath = path.join(
    workspace,
    "validation-local",
    "identity-clean-host-docker-summary.accepted.json",
  );
  const calls = [];

  fs.mkdirSync(logDir, { recursive: true });
  writeFixtureLog(path.join(logDir, "01-api-test-identity-docker-run-1.log"), {
    durationMs: 1000,
    endedAt: "2026-06-15T09:31:00.000Z",
    label: "docker:run:identity-clean-host#1",
    startedAt: "2026-06-15T09:30:00.000Z",
    status: 0,
  });
  writeFixtureLog(path.join(logDir, "02-api-test-identity-docker-run-2.log"), {
    durationMs: 1000,
    endedAt: "2026-06-15T09:32:00.000Z",
    label: "docker:run:identity-clean-host#2",
    startedAt: "2026-06-15T09:31:00.000Z",
    status: 0,
  });

  const logger = createLogger();
  const exitCode = await runIdentityCleanHostDocker({
    acceptedOutputPath,
    cwd: workspace,
    getCommitSha: () => "abc123def456",
    imageTag: "arena-api-identity-gate:test",
    logDir,
    logger,
    nowFactory: createFixedNowFactory("2026-06-15T09:30:00.000Z"),
    outputPath,
    resume: true,
    runs: 5,
    skipBuild: true,
    runCommand(command) {
      calls.push(command.label);
      return {
        endedAt: new Date("2026-06-15T09:35:05.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-15T09:35:00.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "docker:cleanup:identity-clean-host#3",
    "docker:run:identity-clean-host#3",
    "docker:cleanup:identity-clean-host#4",
    "docker:run:identity-clean-host#4",
    "docker:cleanup:identity-clean-host#5",
    "docker:run:identity-clean-host#5",
  ]);
  const summary = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const archived = JSON.parse(fs.readFileSync(acceptedOutputPath, "utf8"));
  assert.equal(summary.accepted, true);
  assert.equal(summary.runsCompleted, 5);
  assert.equal(summary.consecutivePasses, 5);
  assert.equal(summary.acceptedOutputPath, acceptedOutputPath);
  assert.equal(summary.runs.length, 5);
  assert.equal(archived.accepted, true);
  assert.equal(archived.runsCompleted, 5);
  assert.equal(
    logger.infoMessages.some((message) => message.includes("Reusing docker:run:identity-clean-host#1")),
    true,
  );
});
test("runIdentityCleanHostDocker fails honestly when a containerized identity run fails", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-identity-clean-host-docker-fail-"),
  );
  const logger = createLogger();

  const exitCode = await runIdentityCleanHostDocker({
    cwd: workspace,
    runs: 3,
    imageTag: "arena-api-identity-gate:test",
    logger,
    runCommand(command) {
      if (command.label === "docker:run:identity-clean-host#2") {
        return {
          endedAt: new Date("2026-06-15T09:30:05.000Z"),
          error: null,
          signal: null,
          startedAt: new Date("2026-06-15T09:30:00.000Z"),
          status: 1,
          stderr: "boom\n",
          stdout: "failed\n",
        };
      }

      return {
        endedAt: new Date("2026-06-15T09:30:05.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-15T09:30:00.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(
    logger.failMessages.some((message) =>
      message.includes("docker:run:identity-clean-host#2"),
    ),
    true,
  );
});

function writeFixtureLog(filePath, input) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    [
      `label: ${input.label}`,
      "command: docker run --rm arena-api-identity-gate:test pnpm run api:test:identity",
      `startedAt: ${input.startedAt}`,
      `endedAt: ${input.endedAt}`,
      `durationMs: ${input.durationMs}`,
      `status: ${input.status}`,
      "",
      "stdout:",
      "ok",
      "",
      "stderr:",
      "",
      "",
    ].join("\n"),
    "utf8",
  );
}

function createFixedNowFactory(isoString) {
  const fixedTime = new Date(isoString).getTime();
  return () => new Date(fixedTime);
}

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
