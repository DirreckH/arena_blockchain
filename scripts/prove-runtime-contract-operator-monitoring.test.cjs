const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  captureRuntimeContractOperatorMonitoringProof,
  parseCliArgs,
} = require("./prove-runtime-contract-operator-monitoring.cjs");

test("parseCliArgs resolves env-file, base-url, output, and polling overrides", () => {
  const parsed = parseCliArgs([
    "--env-file",
    "config/staging.env",
    "--base-url",
    "https://arena.example",
    "--output",
    "artifacts/runtime-proof.json",
    "--degraded-timeout-ms",
    "1000",
    "--recovered-timeout-ms",
    "2000",
    "--poll-interval-ms",
    "300",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(parsed.baseUrl, "https://arena.example");
  assert.equal(
    parsed.outputPath,
    path.resolve(process.cwd(), "artifacts/runtime-proof.json"),
  );
  assert.equal(parsed.degradedTimeoutMs, 1000);
  assert.equal(parsed.recoveredTimeoutMs, 2000);
  assert.equal(parsed.pollIntervalMs, 300);
});

test("captureRuntimeContractOperatorMonitoringProof fails clearly when the release env file is missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-runtime-operator-proof-missing-env-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release-rehearsal.env");
  const logger = createLogger();

  const exitCode = await captureRuntimeContractOperatorMonitoringProof({
    cwd: workspace,
    envFilePath,
    logger,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    `Release rehearsal env file not found at ${envFilePath}. Run pnpm run backend:release:env:prepare first.`,
  ]);
});

test("captureRuntimeContractOperatorMonitoringProof captures degraded and recovered runtime snapshots and writes the proof artifact", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-runtime-operator-proof-success-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release-rehearsal.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111",
      "CHAIN_ID=31337",
      "",
    ].join("\n"),
    "utf8",
  );

  const runCalls = [];
  const logger = createLogger();
  let liveCalls = 0;
  let readinessCalls = 0;
  let runtimeContractCalls = 0;
  let authChallengeCalls = 0;
  let authVerifyCalls = 0;
  const observedBypassHeaders = [];

  const exitCode = await captureRuntimeContractOperatorMonitoringProof({
    cwd: workspace,
    envFilePath,
    baseUrl: "http://127.0.0.1:4010",
    pollIntervalMs: 0,
    degradedTimeoutMs: 1000,
    recoveredTimeoutMs: 1000,
    logger,
    loadEnvFileImpl() {
      return {
        envPath: envFilePath,
        exists: true,
        loaded: {
          ARENA_VALIDATION_OPERATOR_PRIVATE_KEY:
            "0x1111111111111111111111111111111111111111111111111111111111111111",
          CHAIN_ID: "31337",
        },
      };
    },
    runCommandImpl(command, currentLogger) {
      runCalls.push({
        label: command.label,
        command: command.command,
        args: [...command.args],
      });
      currentLogger.info(`Running ${command.label}: ${command.command} ${command.args.join(" ")}`);
    },
    fetchImpl: async (url, init = {}) => {
      observedBypassHeaders.push(init.headers?.["x-vercel-protection-bypass"] || null);
      const parsedUrl = new URL(String(url));
      const route = `${String(init.method || "GET").toUpperCase()} ${parsedUrl.pathname}`;

      if (route === "GET /health/live") {
        liveCalls += 1;
        return jsonResponse({ status: "ok" });
      }

      if (route === "GET /health/ready") {
        readinessCalls += 1;
        if (readinessCalls <= 2) {
          return jsonResponse({ status: "ok" });
        }

        if (readinessCalls === 3) {
          return jsonResponse(
            {
              error: {
                details: {
                  status: "degraded",
                  dependencies: [
                    {
                      name: "scheduler_queue",
                      status: "down",
                    },
                  ],
                },
              },
            },
            503,
          );
        }

        return jsonResponse({ status: "ok" });
      }

      if (route === "POST /auth/challenge") {
        authChallengeCalls += 1;
        return jsonResponse({
          message: "arena-auth-challenge",
        });
      }

      if (route === "POST /auth/verify") {
        authVerifyCalls += 1;
        return jsonResponse({
          accessToken: "operator-access-token",
          identity: {
            walletAddress: "0x19E7E376E7C213B7E7E7E46CC70A5DD086DAFF2A",
            roles: ["Operator", "Admin"],
          },
        });
      }

      if (route === "GET /arena/internal/monitoring/runtime-contract") {
        runtimeContractCalls += 1;
        if (runtimeContractCalls === 1) {
          return jsonResponse(runtimeContractReadySnapshot());
        }

        if (runtimeContractCalls === 2) {
          return jsonResponse(runtimeContractBlockedSnapshot());
        }

        return jsonResponse(runtimeContractRecoveredSnapshot());
      }

      throw new Error(`Unexpected request ${route}`);
    },
    waitForStateImpl: async (_label, _timeoutMs, _pollIntervalMs, probe) => probe(),
    signMessageImpl: async (privateKey, message) => {
      assert.equal(
        privateKey,
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      );
      assert.equal(message, "arena-auth-challenge");
      return "signed-challenge";
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    runCalls.map((call) => call.label),
    [
      "docker:compose:up",
      "docker:compose:stop:scheduler-worker",
      "docker:compose:restart:scheduler-worker",
    ],
  );
  assert.equal(liveCalls, 1);
  assert.equal(authChallengeCalls, 1);
  assert.equal(authVerifyCalls, 1);
  assert.equal(runtimeContractCalls, 3);
  assert.equal(readinessCalls, 4);
  assert.equal(observedBypassHeaders.every((value) => value === null), true);

  const outputPath = path.join(
    workspace,
    "validation-local",
    "runtime-contract-operator-proof.json",
  );
  assert.equal(fs.existsSync(outputPath), true);

  const proof = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(proof.baseUrl, "http://127.0.0.1:4010");
  assert.equal(proof.operatorIdentity.walletAddress, "0x19E7E376E7C213B7E7E7E46CC70A5DD086DAFF2A");
  assert.equal(proof.initial.runtimeContract.releaseReadiness.status, "ready");
  assert.equal(proof.degraded.runtimeContract.releaseReadiness.status, "blocked");
  assert.equal(proof.recovered.runtimeContract.releaseReadiness.status, "ready");
  assert.equal(
    logger.infoMessages.includes(`Proof artifact: ${outputPath}`),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      `Next: archive ${outputPath} alongside the matching proposition-scoped validation evidence set, then rerun proposition proof closure with:`,
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      `  pnpm run validation:ops:brief -- --proposition-id <id> --env-file ${envFilePath} --base-url http://127.0.0.1:4010 --auth-token <operator-token>`,
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      `  pnpm run validation:proof:capture -- --proposition-id <id> --env-file ${envFilePath} --base-url http://127.0.0.1:4010 --auth-token <operator-token>`,
    ),
    true,
  );
  assert.equal(
    logger.passMessages.includes(
      "Runtime-contract operator monitoring proof captured across degraded and recovered scheduler-worker states.",
    ),
    true,
  );
});

function runtimeContractReadySnapshot() {
  return {
    status: "ok",
    generatedAt: "2026-06-08T00:00:00.000Z",
    releaseReadiness: {
      status: "ready",
    },
    health: {
      readiness: {
        dependencies: [
          {
            name: "scheduler_queue",
            status: "up",
          },
        ],
      },
      queues: {
        queues: [
          {
            name: "scheduler",
            status: "up",
            paused: false,
            details: {
              waiting: 0,
            },
            worker: {
              status: "up",
            },
          },
        ],
      },
    },
    releaseChecklist: [],
    recentAlerts: [
      {
        action: "runtime_contract.alert.release_ready",
        reason: "ready",
        createdAt: "2026-06-08T00:00:00.000Z",
        metadata: {},
      },
    ],
  };
}

function runtimeContractBlockedSnapshot() {
  return {
    status: "degraded",
    generatedAt: "2026-06-08T00:01:00.000Z",
    releaseReadiness: {
      status: "blocked",
    },
    health: {
      readiness: {
        dependencies: [
          {
            name: "scheduler_queue",
            status: "down",
          },
        ],
      },
      queues: {
        queues: [
          {
            name: "scheduler",
            status: "down",
            paused: false,
            details: {
              waiting: 0,
            },
            worker: {
              status: "down",
            },
          },
        ],
      },
    },
    releaseChecklist: [],
    recentAlerts: [
      {
        action: "runtime_contract.alert.release_blocked",
        reason: "scheduler_queue_down",
        createdAt: "2026-06-08T00:01:00.000Z",
        metadata: {},
      },
    ],
  };
}

function runtimeContractRecoveredSnapshot() {
  return {
    status: "ok",
    generatedAt: "2026-06-08T00:02:00.000Z",
    releaseReadiness: {
      status: "ready",
    },
    health: {
      readiness: {
        dependencies: [
          {
            name: "scheduler_queue",
            status: "up",
          },
        ],
      },
      queues: {
        queues: [
          {
            name: "scheduler",
            status: "up",
            paused: false,
            details: {
              waiting: 0,
            },
            worker: {
              status: "up",
            },
          },
        ],
      },
    },
    releaseChecklist: [],
    recentAlerts: [
      {
        action: "runtime_contract.alert.release_ready",
        reason: "scheduler_queue_recovered",
        createdAt: "2026-06-08T00:02:00.000Z",
        metadata: {},
      },
    ],
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
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
