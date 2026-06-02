const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseArgs,
  renderCommand,
  runBackendReleaseRehearsal,
} = require("./run-backend-release-rehearsal.cjs");

test("parseArgs resolves an explicit env file path", () => {
  const parsed = parseArgs(["--env-file", "validation-local/custom.env"]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "validation-local/custom.env"),
  );
});

test("renderCommand formats the executed command for logs", () => {
  assert.equal(
    renderCommand({
      command: "docker",
      args: ["compose", "build"],
    }),
    "docker compose build",
  );
});

test("runBackendReleaseRehearsal executes the guarded release sequence in order", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-run-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release-rehearsal.env");
  const expectedDockerEnvFilePath = envFilePath.replace(/\\/gu, "/");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    "COMPOSE_PROJECT_NAME=arena-release-rehearsal\n",
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    logger,
    runCommand(command) {
      calls.push({
        label: command.label,
        command: command.command,
        args: [...command.args],
        env: command.env,
      });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.label),
    [
      "backend:release:host:check",
      "validation:prepare:local",
      "api:prisma:deploy",
      "validation:db:deploy",
      "docker:compose:down",
      "docker:compose:build",
      "docker:compose:up",
    ],
  );
  assert.deepEqual(
    {
      ...calls.at(-1),
      env: {
        ARENA_ENV_FILE: calls.at(-1).env.ARENA_ENV_FILE,
      },
    },
    {
      label: "docker:compose:up",
      command: "docker",
      args: [
        "compose",
        "--env-file",
        expectedDockerEnvFilePath,
        "-f",
        "docker-compose.prod.yml",
        "up",
        "-d",
        "--no-deps",
        "api",
        "scheduler-worker",
        "nginx",
      ],
      env: {
        ARENA_ENV_FILE: expectedDockerEnvFilePath,
      },
    },
  );
  for (const call of calls.filter((entry) => entry.command === "docker")) {
    assert.equal(call.env.ARENA_ENV_FILE, expectedDockerEnvFilePath);
  }
  assert.equal(
    logger.passMessages.includes(
      "Local backend release rehearsal completed. Next: inspect container logs and run the smoke checks against /health and /arena/internal/monitoring/runtime-contract.",
    ),
    true,
  );
});

test("runBackendReleaseRehearsal fails honestly when the release env file is missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-missing-env-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release-rehearsal.env");
  const logger = createLogger();

  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    logger,
    runCommand() {
      throw new Error("runCommand should not be called when the env file is missing");
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    `Release rehearsal env file not found at ${envFilePath}. Run pnpm run backend:release:env:prepare first.`,
  ]);
});

test("runBackendReleaseRehearsal stops on the first failing guarded command", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-fail-step-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release-rehearsal.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    "COMPOSE_PROJECT_NAME=arena-release-rehearsal\n",
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    logger,
    runCommand(command) {
      calls.push(command.label);
      return { status: command.label === "docker:compose:build" ? 1 : 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [
    "backend:release:host:check",
    "validation:prepare:local",
    "api:prisma:deploy",
    "validation:db:deploy",
    "docker:compose:down",
    "docker:compose:build",
  ]);
  assert.deepEqual(logger.failMessages, [
    "Release rehearsal stopped at docker:compose:build. Fix the failing command above, then rerun pnpm run backend:release:rehearse:local.",
  ]);
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
