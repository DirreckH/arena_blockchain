const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  checkBackendReleaseReadiness,
} = require("./check-backend-release-readiness.cjs");

test("check-backend-release-readiness passes when the runtime contract reports all release gates ready", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-backend-release-ready-"),
  );
  const logger = createLogger();

  const exitCode = await checkBackendReleaseReadiness({
    cwd: workspace,
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
      assert.equal(
        String(url),
        "http://127.0.0.1:4000/arena/internal/monitoring/runtime-contract",
      );
      assert.equal(init.headers.authorization, "Bearer secret-token");
      return jsonResponse({
        status: "ok",
        generatedAt: "2026-05-28T03:00:00.000Z",
        environment: {
          nodeEnv: "production",
          validationEnvironment: "staging",
          port: 4000,
        },
        validationChain: {
          status: "ok",
          preflightCommands: ["pnpm run validation:preflight"],
          operatorActions: [],
        },
        releaseReadiness: {
          status: "ready",
          blockingDependencies: [],
          completedGateCount: 4,
          totalGateCount: 4,
        },
        releaseChecklist: [
          {
            id: "env",
            status: "ready",
            summary: "Populate backend and validation-chain environment variables before runtime preflight.",
            blockingDependencies: [],
            commands: ["pnpm run validation:env:check"],
          },
          {
            id: "database",
            status: "ready",
            summary: "Apply API and validation-chain migrations before starting production traffic.",
            blockingDependencies: [],
            commands: ["pnpm run api:prisma:deploy", "pnpm run validation:db:deploy"],
          },
          {
            id: "build",
            status: "ready",
            summary: "Build shared and API packages before deployment or production start.",
            blockingDependencies: [],
            commands: ["pnpm run backend:build"],
          },
          {
            id: "readiness",
            status: "ready",
            summary: "Confirm public readiness, scheduler queue availability, and validation runtime readiness before accepting traffic.",
            blockingDependencies: [],
            commands: [
              "GET /health/ready",
              "GET /arena/internal/monitoring/validation-chain/runtime-readiness",
            ],
          },
        ],
      });
    },
    logger,
  });

  assert.equal(exitCode, 0);

  const outputPath = path.join(workspace, "backend-release-readiness.json");
  assert.equal(fs.existsSync(outputPath), true);

  const snapshot = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(snapshot.baseUrl, "http://127.0.0.1:4000");
  assert.equal(snapshot.releaseReadiness.status, "ready");

  assert.match(
    logger.infoMessages[0],
    /Environment: production \/ staging \/ port 4000/u,
  );
  assert.match(
    logger.infoMessages[1],
    /Base URL: http:\/\/127\.0\.0\.1:4000/u,
  );
  assert.match(
    logger.infoMessages[2],
    /Generated at: 2026-05-28T03:00:00.000Z/u,
  );
  assert.match(logger.infoMessages[3], /Runtime contract status: ok/u);
  assert.match(
    logger.infoMessages[4],
    /Release readiness: ready \(4\/4 gates complete\)/u,
  );
  assert.match(
    logger.infoMessages[5],
    /Runbook: docs\/contracts\/arena-backend-release-runbook\.md/u,
  );
  assert.match(
    logger.infoMessages[6],
    new RegExp(
      escapeRegExp(`Runtime contract snapshot: ${outputPath}`),
      "u",
    ),
  );
  assert.deepEqual(logger.infoMessages.slice(7), [
    "Blocking dependencies: none",
    "Release checklist:",
    "- [ready] env: Populate backend and validation-chain environment variables before runtime preflight.",
    "- [ready] database: Apply API and validation-chain migrations before starting production traffic.",
    "- [ready] build: Build shared and API packages before deployment or production start.",
    "- [ready] readiness: Confirm public readiness, scheduler queue availability, and validation runtime readiness before accepting traffic.",
  ]);
  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Backend release readiness passed.",
  ]);
});

test("check-backend-release-readiness reuses the operator bearer token from .env when authToken is omitted", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-backend-release-env-token-"),
  );
  fs.writeFileSync(
    path.join(workspace, ".env"),
    [
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-operator-token",
      "ARENA_INTERNAL_API_BASE_URL=http://127.0.0.1:4100",
      "",
    ].join("\n"),
  );
  const logger = createLogger();

  const exitCode = await checkBackendReleaseReadiness({
    cwd: workspace,
    fetchImpl: async (url, init = {}) => {
      assert.equal(
        String(url),
        "http://127.0.0.1:4100/arena/internal/monitoring/runtime-contract",
      );
      assert.equal(init.headers.authorization, "Bearer env-operator-token");
      return jsonResponse({
        status: "ok",
        generatedAt: "2026-05-29T00:00:00.000Z",
        environment: {
          nodeEnv: "development",
          validationEnvironment: "local",
          port: 4100,
        },
        validationChain: {
          status: "ok",
          preflightCommands: ["pnpm run validation:preflight"],
          operatorActions: [],
        },
        releaseReadiness: {
          status: "ready",
          blockingDependencies: [],
          completedGateCount: 2,
          totalGateCount: 2,
        },
        releaseChecklist: [],
      });
    },
    logger,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Backend release readiness passed.",
  ]);
});

test("check-backend-release-readiness writes the runtime contract and fails with actionable output when release gates are blocked", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-backend-release-blocked-"),
  );
  const outputPath = path.join(workspace, "contract.json");
  const logger = createLogger();

  const exitCode = await checkBackendReleaseReadiness({
    cwd: workspace,
    outputPath,
    baseUrl: "https://arena.example",
    authToken: "secret-token",
    fetchImpl: async (url) => {
      assert.equal(
        String(url),
        "https://arena.example/arena/internal/monitoring/runtime-contract",
      );
      return jsonResponse({
        status: "degraded",
        generatedAt: "2026-05-28T03:15:00.000Z",
        environment: {
          nodeEnv: "production",
          validationEnvironment: "prod",
          port: 4000,
        },
        validationChain: {
          status: "degraded",
          preflightCommands: ["pnpm run validation:preflight"],
          operatorActions: [
            {
              dependency: "database",
              summary: "Bring Postgres online and apply validation-chain migrations before retrying runtime checks.",
              envKeys: ["DATABASE_URL"],
              commands: [
                "pnpm run validation:deps:check",
                "pnpm run validation:db:deploy",
                "pnpm run validation:db:status",
              ],
            },
            {
              dependency: "validation_contract_bytecode",
              summary: "Recompile and redeploy the validation contract when the on-chain runtime bytecode drifts from the local artifact.",
              envKeys: [
                "RPC_URL",
                "CHAIN_ID",
                "ARENA_VALIDATION_CONTRACT_ADDRESS",
              ],
              commands: [
                "pnpm exec hardhat compile",
                "pnpm run validation:deploy -- --network <network>",
                "pnpm run validation:chain:check",
              ],
            },
          ],
        },
        releaseReadiness: {
          status: "blocked",
          blockingDependencies: [
            "database",
            "scheduler_queue",
            "validation_contract_bytecode",
          ],
          completedGateCount: 1,
          totalGateCount: 5,
        },
        releaseChecklist: [
          {
            id: "env",
            status: "ready",
            summary: "Populate backend and validation-chain environment variables before runtime preflight.",
            blockingDependencies: [],
            commands: ["pnpm run validation:env:check"],
          },
          {
            id: "database",
            status: "blocked",
            summary: "Apply API and validation-chain migrations before starting production traffic.",
            blockingDependencies: ["database"],
            commands: ["pnpm run api:prisma:deploy", "pnpm run validation:db:deploy"],
          },
          {
            id: "build",
            status: "ready",
            summary: "Build shared and API packages before deployment or production start.",
            blockingDependencies: [],
            commands: ["pnpm run backend:build"],
          },
          {
            id: "readiness",
            status: "blocked",
            summary: "Confirm public readiness, scheduler queue availability, and validation runtime readiness before accepting traffic.",
            blockingDependencies: ["scheduler_queue"],
            commands: [
              "GET /health/ready",
              "GET /system/queues/overview",
              "GET /arena/internal/monitoring/validation-chain/runtime-readiness",
            ],
          },
          {
            id: "validation-runtime",
            status: "blocked",
            summary: "Resolve degraded validation-chain runtime dependencies before relying on live chain-backed settlement flows.",
            blockingDependencies: ["validation_contract_bytecode"],
            commands: [
              "pnpm run validation:preflight",
              "pnpm exec hardhat compile",
              "pnpm run validation:deploy -- --network <network>",
            ],
          },
        ],
      });
    },
    logger,
  });

  assert.equal(exitCode, 1);
  assert.equal(fs.existsSync(outputPath), true);

  const snapshot = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(snapshot.releaseReadiness.status, "blocked");
  assert.deepEqual(snapshot.releaseReadiness.blockingDependencies, [
    "database",
    "scheduler_queue",
    "validation_contract_bytecode",
  ]);
  assert.deepEqual(logger.passMessages, []);
  assert.deepEqual(logger.failMessages, [
    "Backend release readiness is blocked.",
  ]);
  assert.equal(
    logger.infoMessages.includes("Blocking dependencies:"),
    true,
  );
  assert.equal(logger.infoMessages.includes("- database"), true);
  assert.equal(logger.infoMessages.includes("- scheduler_queue"), true);
  assert.equal(
    logger.infoMessages.includes("- validation_contract_bytecode"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- [blocked] validation-runtime: Resolve degraded validation-chain runtime dependencies before relying on live chain-backed settlement flows.",
    ),
    true,
  );
  assert.equal(logger.infoMessages.includes("Blocked gate commands:"), true);
  assert.equal(logger.infoMessages.includes("- validation-runtime"), true);
  assert.equal(
    logger.infoMessages.includes("  - pnpm run validation:deploy -- --network <network>"),
    true,
  );
  assert.equal(logger.infoMessages.includes("Validation operator actions:"), true);
  assert.equal(
    logger.infoMessages.includes(
      "- validation_contract_bytecode: Recompile and redeploy the validation contract when the on-chain runtime bytecode drifts from the local artifact.",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes("  envKeys: RPC_URL, CHAIN_ID, ARENA_VALIDATION_CONTRACT_ADDRESS"),
    true,
  );
});

test("check-backend-release-readiness fails with actionable network guidance when the backend runtime contract cannot be reached", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-backend-release-unreachable-"),
  );
  const logger = createLogger();

  await assert.rejects(
    () =>
      checkBackendReleaseReadiness({
        cwd: workspace,
        baseUrl: "http://127.0.0.1:4999",
        authToken: "secret-token",
        fetchImpl: async () => {
          const error = new Error("connect ECONNREFUSED 127.0.0.1:4999");
          error.cause = {
            code: "ECONNREFUSED",
          };
          throw error;
        },
        logger,
      }),
    /Unable to reach backend runtime contract at http:\/\/127\.0\.0\.1:4999\/arena\/internal\/monitoring\/runtime-contract/u,
  );

  assert.deepEqual(logger.infoMessages, []);
  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, []);
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
