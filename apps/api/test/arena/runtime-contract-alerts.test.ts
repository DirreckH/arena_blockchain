import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import type { BackendRuntimeContractViewModel } from "../../src/arena/internal-ops.types";
import { InternalMonitoringService } from "../../src/arena/services/internal-monitoring.service";
import { RuntimeContractAlertService } from "../../src/arena/services/runtime-contract-alert.service";
import { createArenaHarness } from "./harness";

class FakeOpsAlertNotifier {
  readonly notifications: Array<Record<string, unknown>> = [];

  async notifyAlert(input: Record<string, unknown>): Promise<void> {
    this.notifications.push(structuredClone(input));
  }
}

const buildBlockedRuntimeContract = (): BackendRuntimeContractViewModel => ({
  status: "degraded",
  generatedAt: "2026-06-02T00:00:00.000Z",
  environment: {
    nodeEnv: "production",
    validationEnvironment: "staging",
    port: 4000,
  },
  health: {
    live: {
      status: "ok",
      timestamp: "2026-06-02T00:00:00.000Z",
    },
    readiness: {
      status: "degraded",
      timestamp: "2026-06-02T00:00:00.000Z",
      dependencies: [
        { name: "database", status: "up" },
        { name: "redis", status: "up" },
        { name: "rpc", status: "up" },
        {
          name: "scheduler_queue",
          status: "down",
          details: "scheduler worker heartbeat is missing",
        },
      ],
    },
    queues: {
      status: "degraded",
      timestamp: "2026-06-02T00:00:00.000Z",
      redis: {
        status: "up",
        details: null,
      },
      queues: [
        {
          name: "scheduler",
          status: "down",
          paused: false,
          details: "scheduler worker heartbeat is missing",
          policy: {
            retryable: true,
            attempts: 5,
            backoffType: "exponential",
            backoffDelayMs: 1000,
          },
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            completed: 0,
            failed: 0,
          },
        },
      ],
    },
  },
  validationChain: {
    status: "degraded",
    checkedAt: "2026-06-02T00:00:00.000Z",
    validationEnvironment: "staging",
    chainId: 8453,
    rpcUrl: "https://rpc.example",
    arenaContractAddress: "0x0000000000000000000000000000000000000001",
    validationContractAddress: "0x0000000000000000000000000000000000000002",
    dependencies: [
      { name: "env", status: "up" },
      { name: "database", status: "up" },
      { name: "redis", status: "up" },
      { name: "rpc", status: "down", details: "timeout" },
    ],
    requiredEnvKeys: ["DATABASE_URL", "REDIS_URL", "RPC_URL"],
    optionalEnvKeys: ["ARENA_VALIDATION_OPERATOR_ADDRESS"],
    preflightCommands: ["pnpm run validation:env:check"],
    runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
    operatorActions: [
      {
        dependency: "rpc",
        summary:
          "Restore RPC connectivity and confirm the configured chain id matches the provider.",
        envKeys: ["RPC_URL", "CHAIN_ID"],
        commands: [
          "pnpm run validation:deps:check",
          "pnpm run validation:chain:check",
        ],
      },
    ],
  },
  validationRehearsal: {
    status: "blocked",
    targetOutcome:
      "One proposition completes publish -> local bet -> on-chain placeBet -> manual or scheduled sync -> projection -> settlement against deployed validation infrastructure.",
    runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
    blockingDependencies: ["scheduler_queue", "rpc"],
    steps: [
      {
        id: "preflight",
        summary:
          "Clear backend, queue, database, Redis, RPC, signer, and contract blockers before attempting an environment-backed validation rehearsal.",
        commands: ["GET /arena/internal/monitoring/runtime-contract"],
        evidence: ["GET /health/ready"],
      },
    ],
  },
  validationProofRecord: null,
  commands: {
    install: ["pnpm install", "pnpm run deps:up"],
    dev: ["pnpm run api:dev"],
    typecheck: ["pnpm run api:typecheck"],
    unitTest: ["pnpm --filter @arena/shared test"],
    integrationTest: ["pnpm --filter @arena/api test:arena"],
    e2eOrSmoke: ["pnpm run validation:test"],
    productionBuild: ["pnpm run backend:build"],
    validationLocalPrepare: ["pnpm run validation:prepare:local"],
    databaseMigrate: [
      "pnpm run api:prisma:deploy",
      "pnpm run validation:db:deploy",
    ],
    preflight: ["pnpm run validation:preflight"],
  },
  releaseReadiness: {
    status: "blocked",
    blockingDependencies: ["scheduler_queue", "rpc"],
    completedGateCount: 2,
    totalGateCount: 4,
  },
  releaseChecklist: [
    {
      id: "env",
      status: "ready",
      summary:
        "Populate backend and validation-chain environment variables before runtime preflight.",
      blockingDependencies: [],
      commands: ["pnpm run validation:env:check"],
      operatorActions: [],
    },
    {
      id: "readiness",
      status: "blocked",
      summary:
        "Confirm public readiness, scheduler queue availability, and validation runtime readiness before accepting traffic.",
      blockingDependencies: ["scheduler_queue"],
      commands: ["GET /health/ready", "GET /system/queues/overview"],
      operatorActions: [
        "GET /system/queues/overview",
        "GET /arena/internal/monitoring/validation-chain",
      ],
    },
    {
      id: "validation-runtime",
      status: "blocked",
      summary:
        "Resolve degraded validation-chain runtime dependencies before relying on live chain-backed settlement flows.",
      blockingDependencies: ["rpc"],
      commands: ["pnpm run validation:deps:check", "pnpm run validation:chain:check"],
      operatorActions: [
        "pnpm run validation:deps:check",
        "pnpm run validation:chain:check",
      ],
    },
  ],
  recentAlerts: [],
  operatorSummary: {
    status: "action_required",
    requiresActionNow: true,
    focusArea: "readiness",
    summary:
      "Release is blocked at readiness: Confirm public readiness, scheduler queue availability, and validation runtime readiness before accepting traffic.",
    operatorActions: [
      "GET /system/queues/overview",
      "GET /arena/internal/monitoring/validation-chain",
    ],
    blockers: ["scheduler_queue", "rpc"],
    latestRelevantEvidence: null,
  },
});

const buildReadyRuntimeContract = (): BackendRuntimeContractViewModel => ({
  ...buildBlockedRuntimeContract(),
  status: "ok",
  health: {
    live: {
      status: "ok",
      timestamp: "2026-06-02T00:05:00.000Z",
    },
    readiness: {
      status: "ok",
      timestamp: "2026-06-02T00:05:00.000Z",
      dependencies: [
        { name: "database", status: "up" },
        { name: "redis", status: "up" },
        { name: "rpc", status: "up" },
        { name: "scheduler_queue", status: "up" },
      ],
    },
    queues: {
      status: "ok",
      timestamp: "2026-06-02T00:05:00.000Z",
      redis: {
        status: "up",
        details: null,
      },
      queues: [
        {
          name: "scheduler",
          status: "up",
          paused: false,
          details: null,
          policy: {
            retryable: true,
            attempts: 5,
            backoffType: "exponential",
            backoffDelayMs: 1000,
          },
          counts: {
            waiting: 0,
            active: 0,
            delayed: 0,
            completed: 0,
            failed: 0,
          },
        },
      ],
    },
  },
  validationChain: {
    ...buildBlockedRuntimeContract().validationChain,
    status: "ok",
    checkedAt: "2026-06-02T00:05:00.000Z",
    dependencies: [
      { name: "env", status: "up" },
      { name: "database", status: "up" },
      { name: "redis", status: "up" },
      { name: "rpc", status: "up" },
    ],
    operatorActions: [],
  },
  validationRehearsal: {
    ...buildBlockedRuntimeContract().validationRehearsal,
    status: "ready",
    blockingDependencies: [],
  },
  releaseReadiness: {
    status: "ready",
    blockingDependencies: [],
    completedGateCount: 3,
    totalGateCount: 3,
  },
  releaseChecklist: [
    {
      id: "env",
      status: "ready",
      summary:
        "Populate backend and validation-chain environment variables before runtime preflight.",
      blockingDependencies: [],
      commands: ["pnpm run validation:env:check"],
      operatorActions: [],
    },
    {
      id: "readiness",
      status: "ready",
      summary:
        "Confirm public readiness, scheduler queue availability, and validation runtime readiness before accepting traffic.",
      blockingDependencies: [],
      commands: ["GET /health/ready"],
      operatorActions: [],
    },
    {
      id: "build",
      status: "ready",
      summary: "Build shared and API packages before deployment or production start.",
      blockingDependencies: [],
      commands: ["pnpm run backend:build"],
      operatorActions: [],
    },
  ],
  operatorSummary: {
    status: "ready",
    requiresActionNow: false,
    focusArea: "healthy",
    summary:
      "Release readiness is green. No operator release action is required right now.",
    operatorActions: [],
    blockers: [],
    latestRelevantEvidence: null,
  },
});

const buildRuntimeContractAlertRecord = (
  action: "runtime_contract.alert.release_blocked" | "runtime_contract.alert.release_ready",
  createdAt: string,
  blockingDependencies: string[],
) => ({
  id: `internal_audit_${action}_${createdAt}`,
  entityType: "runtime_contract",
  entityId: "release",
  action,
  actorUserId: null,
  reason:
    action === "runtime_contract.alert.release_blocked"
      ? "runtime_contract.release_blocked"
      : "runtime_contract.release_ready",
  note: "scheduled_runtime_contract_health_check",
  metadata: {
    blockingDependencies,
    blockedGateIds: blockingDependencies.length === 0 ? [] : ["readiness"],
  },
  createdAt,
});

const buildValidationContractReadinessStub = () =>
  ({
    getArtifactPath() {
      return __filename;
    },
    async assertReady() {
      return undefined;
    },
    async getReadOnlyContract() {
      return {
        async paused() {
          return false;
        },
      };
    },
    async getDeploymentReadiness() {
      return {
        contractAddress: "0x0000000000000000000000000000000000000002",
        hasRuntimeCode: true,
        runtimeBytecodeMatchesArtifact: true,
        signers: [
          {
            role: "operator",
            address: "0x00000000000000000000000000000000000000a1",
            hasBalance: true,
            hasRequiredRole: true,
          },
          {
            role: "oracle",
            address: "0x00000000000000000000000000000000000000a2",
            hasBalance: true,
            hasRequiredRole: true,
          },
          {
            role: "pauser",
            address: "0x00000000000000000000000000000000000000a3",
            hasBalance: true,
            hasRequiredRole: true,
          },
        ],
      };
    },
  }) as never;

const markArtifactDependenciesReady = (
  monitoring: InternalMonitoringService,
): InternalMonitoringService => {
  const patchedMonitoring = monitoring as unknown as {
    checkArenaArtifactDependency: () => {
      name: "arena_artifact";
      status: "up";
    };
    checkValidationArtifactDependency: () => {
      name: "validation_artifact";
      status: "up";
    };
  };

  patchedMonitoring.checkArenaArtifactDependency = () => ({
    name: "arena_artifact",
    status: "up",
  });
  patchedMonitoring.checkValidationArtifactDependency = () => ({
    name: "validation_artifact",
    status: "up",
  });

  return monitoring;
};

const createBlockedRuntimeMonitoring = (
  records: Array<ReturnType<typeof buildRuntimeContractAlertRecord>>,
) =>
  markArtifactDependenciesReady(
    new InternalMonitoringService(
      {
        async assertReady() {
          return undefined;
        },
      } as never,
      {
        nodeEnv: "production",
        validationEnvironment: "local",
        port: 4000,
        chainId: 1337,
        rpcUrl: "http://127.0.0.1:8545",
        arenaContractAddress: "0x0000000000000000000000000000000000000001",
        validationContractAddress: "0x0000000000000000000000000000000000000002",
        validationOperatorPrivateKey:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        validationOraclePrivateKey:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        validationPauserPrivateKey:
          "0x3333333333333333333333333333333333333333333333333333333333333333",
      } as never,
      {
        async assertReady() {
          return undefined;
        },
      } as never,
      {
        async ping() {
          return "PONG";
        },
      } as never,
      {
        getLiveSnapshot() {
          return {
            status: "ok",
            timestamp: "2026-06-02T00:06:00.000Z",
          };
        },
        async getReadinessSnapshot() {
          return {
            status: "degraded",
            timestamp: "2026-06-02T00:06:00.000Z",
            dependencies: [
              { name: "database", status: "up" },
              { name: "redis", status: "up" },
              { name: "rpc", status: "up" },
              {
                name: "scheduler_queue",
                status: "down",
                details: "scheduler worker heartbeat is missing",
              },
            ],
          };
        },
      } as never,
      {
        async getQueueOverview() {
          return {
            status: "degraded",
            timestamp: "2026-06-02T00:06:00.000Z",
            redis: { status: "up" },
            queues: [
              {
                name: "scheduler",
                status: "down",
                paused: false,
                details: "scheduler worker heartbeat is missing",
                policy: {
                  retryable: true,
                  attempts: 5,
                  backoffType: "exponential",
                  backoffDelayMs: 1000,
                },
                counts: {
                  waiting: 0,
                  active: 0,
                  delayed: 0,
                  completed: 0,
                  failed: 0,
                },
              },
            ],
          };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        async listByEntity() {
          return records;
        },
      } as never,
      buildValidationContractReadinessStub(),
      undefined as never,
      {
        async getLatestProof() {
          return null;
        },
      } as never,
    ),
  );

const createReadyRuntimeMonitoring = (
  records: Array<ReturnType<typeof buildRuntimeContractAlertRecord>>,
) =>
  markArtifactDependenciesReady(
    new InternalMonitoringService(
      {
        async assertReady() {
          return undefined;
        },
      } as never,
      {
        nodeEnv: "production",
        validationEnvironment: "local",
        port: 4000,
        chainId: 1337,
        rpcUrl: "http://127.0.0.1:8545",
        arenaContractAddress: "0x0000000000000000000000000000000000000001",
        validationContractAddress: "0x0000000000000000000000000000000000000002",
        validationOperatorPrivateKey:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        validationOraclePrivateKey:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        validationPauserPrivateKey:
          "0x3333333333333333333333333333333333333333333333333333333333333333",
      } as never,
      {
        async assertReady() {
          return undefined;
        },
      } as never,
      {
        async ping() {
          return "PONG";
        },
      } as never,
      {
        getLiveSnapshot() {
          return {
            status: "ok",
            timestamp: "2026-06-02T00:06:00.000Z",
          };
        },
        async getReadinessSnapshot() {
          return {
            status: "ok",
            timestamp: "2026-06-02T00:06:00.000Z",
            dependencies: [
              { name: "database", status: "up" },
              { name: "redis", status: "up" },
              { name: "rpc", status: "up" },
              { name: "scheduler_queue", status: "up" },
            ],
          };
        },
      } as never,
      {
        async getQueueOverview() {
          return {
            status: "ok",
            timestamp: "2026-06-02T00:06:00.000Z",
            redis: { status: "up" },
            queues: [
              {
                name: "scheduler",
                status: "up",
                paused: false,
                details: null,
                policy: {
                  retryable: true,
                  attempts: 5,
                  backoffType: "exponential",
                  backoffDelayMs: 1000,
                },
                counts: {
                  waiting: 0,
                  active: 0,
                  delayed: 0,
                  completed: 0,
                  failed: 0,
                },
              },
            ],
          };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        async listByEntity() {
          return records;
        },
      } as never,
      buildValidationContractReadinessStub(),
      undefined as never,
      {
        async getLatestProof() {
          return null;
        },
      } as never,
    ),
  );

test("runtime contract audit records deduped release alerts only when the blocker set changes", async () => {
  const harness = createArenaHarness();
  let current = buildBlockedRuntimeContract();
  const monitoring = {
    async getRuntimeContract() {
      return current;
    },
  } as InternalMonitoringService;
  const alerts = new RuntimeContractAlertService(
    monitoring,
    harness.internalAuditService,
  );

  await alerts.runHealthCheck("2026-06-02T00:00:00.000Z");
  await alerts.runHealthCheck("2026-06-02T00:01:00.000Z");

  let auditEvents = await harness.internalAuditService.listByEntity(
    "runtime_contract",
    "release",
  );

  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.action, "runtime_contract.alert.release_blocked");
  assert.equal(auditEvents[0]?.reason, "runtime_contract.release_blocked");
  assert.deepEqual(
    (auditEvents[0]?.metadata as { blockingDependencies?: string[] }).blockingDependencies,
    ["rpc", "scheduler_queue"],
  );
  assert.deepEqual(
    (auditEvents[0]?.metadata as { blockedGateIds?: string[] }).blockedGateIds,
    ["readiness", "validation-runtime"],
  );

  current = buildReadyRuntimeContract();
  await alerts.runHealthCheck("2026-06-02T00:02:00.000Z");

  auditEvents = await harness.internalAuditService.listByEntity(
    "runtime_contract",
    "release",
  );

  assert.equal(auditEvents.length, 2);
  assert.equal(auditEvents[0]?.action, "runtime_contract.alert.release_ready");
  assert.equal(auditEvents[0]?.reason, "runtime_contract.release_ready");
  assert.deepEqual(
    (auditEvents[0]?.metadata as { blockingDependencies?: string[] }).blockingDependencies,
    [],
  );
});

test("runtime contract health checks forward structured release alerts to the configured notifier", async () => {
  const harness = createArenaHarness();
  const notifier = new FakeOpsAlertNotifier();
  const monitoring = {
    async getRuntimeContract() {
      return buildBlockedRuntimeContract();
    },
  } as InternalMonitoringService;
  const alerts = new RuntimeContractAlertService(
    monitoring,
    harness.internalAuditService,
    notifier as never,
  );

  await alerts.runHealthCheck("2026-06-02T00:00:00.000Z");

  assert.equal(notifier.notifications.length, 1);
  assert.equal(
    notifier.notifications[0]?.source,
    "runtime_contract",
  );
  assert.equal(
    notifier.notifications[0]?.action,
    "runtime_contract.alert.release_blocked",
  );
  assert.equal(
    notifier.notifications[0]?.entityType,
    "runtime_contract",
  );
});

test("runtime contract alert filtering hides recovered release blockers from the current ready view", async () => {
  const monitoring = createReadyRuntimeMonitoring([
    buildRuntimeContractAlertRecord(
      "runtime_contract.alert.release_ready",
      "2026-06-02T00:02:00.000Z",
      [],
    ),
    buildRuntimeContractAlertRecord(
      "runtime_contract.alert.release_blocked",
      "2026-06-02T00:01:00.000Z",
      ["scheduler_queue"],
    ),
  ]);

  const snapshot = await monitoring.getRuntimeContract();

  assert.deepEqual(
    snapshot.recentAlerts.map((item) => item.action),
    ["runtime_contract.alert.release_ready"],
  );
  assert.deepEqual(
    (snapshot.recentAlerts[0]?.metadata as { blockingDependencies?: string[] })
      .blockingDependencies,
    [],
  );
  assert.equal(snapshot.operatorSummary.status, "ready");
  assert.equal(snapshot.operatorSummary.requiresActionNow, false);
  assert.equal(snapshot.operatorSummary.focusArea, "healthy");
  assert.equal(
    snapshot.operatorSummary.summary,
    "Release readiness is green. No operator release action is required right now.",
  );
  assert.equal(snapshot.operatorSummary.latestRelevantEvidence?.action, "runtime_contract.alert.release_ready");
});

test("runtime contract snapshot keeps only the current blocked alert segment for degraded release state", async () => {
  const monitoring = createBlockedRuntimeMonitoring([
    buildRuntimeContractAlertRecord(
      "runtime_contract.alert.release_blocked",
      "2026-06-02T00:06:00.000Z",
      ["scheduler_queue"],
    ),
    buildRuntimeContractAlertRecord(
      "runtime_contract.alert.release_blocked",
      "2026-06-02T00:05:00.000Z",
      ["rpc", "scheduler_queue"],
    ),
    buildRuntimeContractAlertRecord(
      "runtime_contract.alert.release_ready",
      "2026-06-02T00:04:00.000Z",
      [],
    ),
    buildRuntimeContractAlertRecord(
      "runtime_contract.alert.release_blocked",
      "2026-06-02T00:03:00.000Z",
      ["rpc"],
    ),
  ]);

  const snapshot = await monitoring.getRuntimeContract();

  assert.equal(snapshot.releaseReadiness.status, "blocked");
  assert.equal(snapshot.status, "degraded");
  assert.deepEqual(
    snapshot.recentAlerts.map((item) => item.action),
    [
      "runtime_contract.alert.release_blocked",
      "runtime_contract.alert.release_blocked",
    ],
  );
  assert.deepEqual(
    snapshot.recentAlerts.map(
      (item) =>
        (item.metadata as { blockingDependencies?: string[] }).blockingDependencies ?? [],
    ),
    [["scheduler_queue"], ["rpc", "scheduler_queue"]],
  );
  assert.equal(snapshot.operatorSummary.status, "action_required");
  assert.equal(snapshot.operatorSummary.requiresActionNow, true);
  assert.equal(snapshot.operatorSummary.focusArea, "readiness");
  assert.equal(
    snapshot.operatorSummary.summary,
    "Release is blocked at readiness: Confirm public readiness, scheduler queue availability, and validation runtime readiness before accepting traffic.",
  );
  assert.deepEqual(snapshot.operatorSummary.blockers, ["scheduler_queue"]);
  assert.equal(
    snapshot.operatorSummary.operatorActions.includes("GET /system/queues/overview"),
    true,
  );
  assert.equal(
    snapshot.operatorSummary.latestRelevantEvidence?.action,
    "runtime_contract.alert.release_blocked",
  );
});
