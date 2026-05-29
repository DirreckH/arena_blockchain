const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  prepareBackendLocal,
} = require("./prepare-backend-local.cjs");

test("prepare-backend-local prepares the validation runtime, starts the API, waits for readiness, and runs the release check", async () => {
  const commands = [];
  const backgroundStarts = [];
  const logger = createLogger();
  let livePolls = 0;
  let readyPolls = 0;

  const exitCode = await prepareBackendLocal({
    cwd: path.resolve(__dirname, ".."),
    logger,
    env: {
      PORT: "4000",
    },
    prepareValidationLocalFn: async () => 0,
    runCommand: async (command) => {
      commands.push(command.label);
      return { status: 0 };
    },
    startBackgroundCommand: async (command) => {
      backgroundStarts.push({
        label: command.label,
        logPath: command.logPath,
      });
      return {
        started: true,
        pid: 4242,
        logPath: command.logPath,
      };
    },
    checkBackendReleaseReadinessFn: async (options) => {
      assert.equal(options.baseUrl, "http://127.0.0.1:4000");
      assert.match(
        options.outputPath,
        /validation-local[\\\/]backend-release-readiness\.json$/u,
      );
      return 0;
    },
    fetchImpl: async (url) => {
      if (String(url).endsWith("/health/live")) {
        livePolls += 1;

        if (livePolls === 1) {
          const error = new Error("connect ECONNREFUSED 127.0.0.1:4000");
          error.cause = {
            code: "ECONNREFUSED",
          };
          throw error;
        }

        return jsonResponse({
          status: "ok",
        });
      }

      if (String(url).endsWith("/health/ready")) {
        readyPolls += 1;

        if (readyPolls === 1) {
          return {
            ok: false,
            status: 503,
            async text() {
              return JSON.stringify({
                status: "degraded",
                dependencies: [
                  {
                    name: "scheduler_queue",
                    status: "down",
                  },
                ],
              });
            },
          };
        }

        return jsonResponse({
          status: "ok",
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    pollIntervalMs: 0,
    liveTimeoutMs: 1000,
    readyTimeoutMs: 1000,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, ["backend:build"]);
  assert.equal(backgroundStarts.length, 1);
  assert.equal(backgroundStarts[0].label, "api:start");
  assert.match(
    backgroundStarts[0].logPath,
    /validation-local[\\\/]backend-api\.log$/u,
  );
  assert.equal(livePolls, 2);
  assert.equal(readyPolls, 2);
  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Local backend runtime is prepared and passed release readiness. Next: exercise the proposition -> chain -> sync -> public proof flow.",
  ]);
});

test("prepare-backend-local reuses an already-running backend instead of rebuilding or starting the API again", async () => {
  const commands = [];
  const backgroundStarts = [];

  const exitCode = await prepareBackendLocal({
    cwd: path.resolve(__dirname, ".."),
    logger: createLogger(),
    env: {
      PORT: "4010",
    },
    prepareValidationLocalFn: async () => 0,
    runCommand: async (command) => {
      commands.push(command.label);
      return { status: 0 };
    },
    startBackgroundCommand: async (command) => {
      backgroundStarts.push(command.label);
      return {
        started: true,
        pid: 4242,
        logPath: command.logPath,
      };
    },
    checkBackendReleaseReadinessFn: async (options) => {
      assert.equal(options.baseUrl, "http://127.0.0.1:4010");
      return 0;
    },
    fetchImpl: async (url) => {
      if (
        String(url).endsWith("/health/live") ||
        String(url).endsWith("/health/ready")
      ) {
        return jsonResponse({
          status: "ok",
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    pollIntervalMs: 0,
    liveTimeoutMs: 1000,
    readyTimeoutMs: 1000,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, []);
  assert.deepEqual(backgroundStarts, []);
});

test("prepare-backend-local fails when the API cannot be started automatically", async () => {
  const commands = [];
  const logger = createLogger();

  const exitCode = await prepareBackendLocal({
    cwd: path.resolve(__dirname, ".."),
    logger,
    env: {
      PORT: "4020",
    },
    prepareValidationLocalFn: async () => 0,
    runCommand: async (command) => {
      commands.push(command.label);
      return { status: 0 };
    },
    startBackgroundCommand: async (command) => ({
      started: false,
      error: `failed to start ${command.label}`,
      logPath: command.logPath,
    }),
    checkBackendReleaseReadinessFn: async () => 0,
    fetchImpl: async (url) => {
      if (String(url).endsWith("/health/live")) {
        const error = new Error("connect ECONNREFUSED 127.0.0.1:4020");
        error.cause = {
          code: "ECONNREFUSED",
        };
        throw error;
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    pollIntervalMs: 0,
    liveTimeoutMs: 1000,
    readyTimeoutMs: 1000,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(commands, ["backend:build"]);
  assert.deepEqual(logger.passMessages, []);
  assert.equal(logger.failMessages.length, 1);
  assert.match(
    logger.failMessages[0],
    /Unable to start the local backend automatically/u,
  );
});

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
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
