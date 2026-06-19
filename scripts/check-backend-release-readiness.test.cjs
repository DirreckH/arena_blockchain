const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseCliArgs,
  checkBackendReleaseReadiness,
} = require("./check-backend-release-readiness.cjs");

test("parseCliArgs resolves env-file, base-url, auth token, and output path", () => {
  const parsed = parseCliArgs([
    "--env-file",
    "config/staging.env",
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "staging-token",
    "--output",
    "artifacts/runtime-contract.json",
  ]);

  assert.equal(parsed.envFilePath, "config/staging.env");
  assert.equal(parsed.baseUrl, "https://arena.example");
  assert.equal(parsed.authToken, "staging-token");
  assert.equal(parsed.outputPath, "artifacts/runtime-contract.json");
});

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
          completedGateCount: 5,
          totalGateCount: 5,
        },
        validationProofRecord: {
          environment: "staging",
          chainId: 8453,
          propositionId: "prop_ready_1",
          proofComplete: true,
          failures: [],
          releaseReadinessStatus: "ready",
          releaseBlockingDependencies: [],
          validationRehearsalStatus: "ready",
          validationCurrentStepId: null,
          validationCurrentStepStatus: null,
          completedStepCount: 5,
          remainingStepCount: 0,
          latestCheckpointStepId: "projection_and_settlement",
          latestCheckpointStatus: "complete",
          latestCheckpointAt: "2026-05-28T02:58:00.000Z",
          publicSettledResultVisible: true,
          publicIntegrityOverviewVisible: true,
          rewardPayoutLedgerEntryCount: 2,
          rewardPayoutRecordCount: 2,
          rewardPayoutFinalizedWithoutPayoutCount: 0,
          rewardPayoutExecutingWithoutTxHashCount: 0,
          rewardPayoutStaleExecutingCount: 0,
          rewardPayoutStaleExecutingWithoutTxHashCount: 0,
          rewardPayoutStaleExecutingAwaitingConfirmationCount: 0,
          rewardPayoutCompletedWithExecutionTxHashCount: 2,
          rewardPayoutStatusCounts: {
            requested: 0,
            approved: 0,
            executing: 0,
            completed: 2,
            failed: 0,
            cancelled: 0,
            none: 0,
          },
          summaryArtifactPath: "validation-rehearsal/prop_ready_1/proof-summary.json",
          evidenceArtifactPath: "validation-rehearsal/prop_ready_1/evidence-bundle.json",
          rewardPayoutArtifactPath:
            "validation-rehearsal/prop_ready_1/reward-payout-summary.json",
          publicResultArtifactPath: "validation-rehearsal/prop_ready_1/public-settled-result.json",
          publicIntegrityArtifactPath:
            "validation-rehearsal/prop_ready_1/public-integrity-overview.json",
          note: null,
          recordedByUserId: "operator_validation_chain",
          checkedAt: "2026-05-28T03:00:00.000Z",
          recordedAt: "2026-05-28T03:01:00.000Z",
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
          {
            id: "validation-proof",
            status: "ready",
            summary: "Capture and register one external staging or production validation proof before approving non-local release traffic.",
            blockingDependencies: [],
            commands: [
              "pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <url> --auth-token <operator-token>",
              "POST /arena/internal/validation-chain/proof-record",
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
    /Release readiness: ready \(5\/5 gates complete\)/u,
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
    "- [ready] validation-proof: Capture and register one external staging or production validation proof before approving non-local release traffic.",
    "Validation proof record: complete / staging / chain 8453 / proposition prop_ready_1",
    "Validation proof release status: ready",
    "Validation proof payout summary: ledgers=2, payouts=2, finalizedWithoutPayout=0, executingWithoutTxHash=0, staleExecuting=0",
    "Validation proof payout statuses: requested=0, approved=0, executing=0, completed=2, failed=0, cancelled=0, none=0",
    "Validation proof blocking dependencies: none",
    "Validation proof summary artifact: validation-rehearsal/prop_ready_1/proof-summary.json",
    "Validation proof evidence artifact: validation-rehearsal/prop_ready_1/evidence-bundle.json",
    "Validation proof reward payout artifact: validation-rehearsal/prop_ready_1/reward-payout-summary.json",
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
                "pnpm run validation:deploy -- --env-file <path-to-release-env> --network validation",
                "pnpm run validation:chain:check -- --env-file <path-to-release-env>",
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
            "validation_proof_missing",
          ],
          completedGateCount: 1,
          totalGateCount: 6,
        },
        validationProofRecord: {
          environment: "staging",
          chainId: 8453,
          propositionId: "prop_blocked_1",
          proofComplete: false,
          failures: [
            "reward_payout_follow_through_incomplete",
          ],
          releaseReadinessStatus: "blocked",
          releaseBlockingDependencies: [
            "validation_proof_reward_payout_incomplete",
          ],
          validationRehearsalStatus: "ready",
          validationCurrentStepId: null,
          validationCurrentStepStatus: null,
          completedStepCount: 5,
          remainingStepCount: 0,
          latestCheckpointStepId: "projection_and_settlement",
          latestCheckpointStatus: "complete",
          latestCheckpointAt: "2026-05-28T03:10:00.000Z",
          publicSettledResultVisible: true,
          publicIntegrityOverviewVisible: true,
          rewardPayoutLedgerEntryCount: 3,
          rewardPayoutRecordCount: 2,
          rewardPayoutFinalizedWithoutPayoutCount: 1,
          rewardPayoutExecutingWithoutTxHashCount: 0,
          rewardPayoutStaleExecutingCount: 1,
          rewardPayoutStaleExecutingWithoutTxHashCount: 1,
          rewardPayoutStaleExecutingAwaitingConfirmationCount: 0,
          rewardPayoutCompletedWithExecutionTxHashCount: 1,
          rewardPayoutStatusCounts: {
            requested: 0,
            approved: 1,
            executing: 0,
            completed: 1,
            failed: 0,
            cancelled: 0,
            none: 1,
          },
          summaryArtifactPath: "validation-rehearsal/prop_blocked_1/proof-summary.json",
          evidenceArtifactPath: "validation-rehearsal/prop_blocked_1/evidence-bundle.json",
          rewardPayoutArtifactPath:
            "validation-rehearsal/prop_blocked_1/reward-payout-summary.json",
          publicResultArtifactPath: "validation-rehearsal/prop_blocked_1/public-settled-result.json",
          publicIntegrityArtifactPath:
            "validation-rehearsal/prop_blocked_1/public-integrity-overview.json",
          note: "staging proof still blocked on payout follow-through",
          recordedByUserId: "operator_validation_chain",
          checkedAt: "2026-05-28T03:15:00.000Z",
          recordedAt: "2026-05-28T03:16:00.000Z",
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
            commands: [
              "pnpm run api:prisma:deploy -- --env-file <path-to-release-env>",
              "pnpm run validation:db:deploy -- --env-file <path-to-release-env>",
            ],
            operatorActions: [
              "pnpm run validation:db:deploy -- --env-file <path-to-release-env>",
            ],
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
            operatorActions: [
              "GET /system/queues/overview",
              "GET /arena/internal/monitoring/validation-chain",
            ],
          },
          {
            id: "validation-runtime",
            status: "blocked",
            summary: "Resolve degraded validation-chain runtime dependencies before relying on live chain-backed settlement flows.",
            blockingDependencies: ["validation_contract_bytecode"],
            commands: [
              "pnpm run validation:preflight -- --env-file <path-to-release-env>",
              "pnpm exec hardhat compile",
              "pnpm run validation:deploy -- --env-file <path-to-release-env> --network validation",
            ],
            operatorActions: [
              "docs/contracts/arena-validation-chain-runbook.md",
              "GET /arena/internal/monitoring/validation-chain/runtime-readiness",
            ],
          },
          {
            id: "validation-proof",
            status: "blocked",
            summary: "Capture and register one external staging or production validation proof before approving non-local release traffic.",
            blockingDependencies: ["validation_proof_missing"],
            commands: [
              "pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <url> --auth-token <operator-token>",
              "POST /arena/internal/validation-chain/proof-record",
            ],
            operatorActions: [
              "docs/contracts/validation-proof-record-003.md",
              "pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <url> --auth-token <operator-token>",
              "POST /arena/internal/validation-chain/proof-record",
              "GET /arena/internal/monitoring/runtime-contract",
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
    "validation_proof_missing",
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
    logger.infoMessages.includes("- validation_proof_missing"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- [blocked] validation-runtime: Resolve degraded validation-chain runtime dependencies before relying on live chain-backed settlement flows.",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- [blocked] validation-proof: Capture and register one external staging or production validation proof before approving non-local release traffic.",
    ),
    true,
  );
  assert.equal(logger.infoMessages.includes("Blocked gate commands:"), true);
  assert.equal(logger.infoMessages.includes("- validation-runtime"), true);
  assert.equal(logger.infoMessages.includes("- validation-proof"), true);
  assert.equal(logger.infoMessages.includes("Blocked gate operator actions:"), true);
  assert.equal(
    logger.infoMessages.includes(
      "  - docs/contracts/arena-validation-chain-runbook.md",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "  - pnpm run validation:deploy -- --env-file <path-to-release-env> --network validation",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "  - pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <url> --auth-token <operator-token>",
    ),
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
  assert.equal(
    logger.infoMessages.includes(
      "Validation proof record: incomplete / staging / chain 8453 / proposition prop_blocked_1",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes("Validation proof release status: blocked"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "Validation proof payout summary: ledgers=3, payouts=2, finalizedWithoutPayout=1, executingWithoutTxHash=0, staleExecuting=1",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "Validation proof blocking dependencies: validation_proof_reward_payout_incomplete",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes("Suggested rerun commands after remediation:"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- pnpm run backend:release:check -- --base-url https://arena.example --auth-token <operator-token>",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- pnpm run validation:proof:capture -- --proposition-id prop_blocked_1 --base-url https://arena.example --env-file <path-to-release-env> --auth-token <operator-token>",
    ),
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
