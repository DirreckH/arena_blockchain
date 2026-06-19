import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Module,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import { SystemRole } from "@arena/shared";

import { ArenaInternalMonitoringController } from "../../src/arena/internal-monitoring.controller";
import { InternalMonitoringService } from "../../src/arena/services/internal-monitoring.service";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import type { RequestWithUser } from "../../src/common/interfaces/request-with-user.interface";

type JsonResponse = {
  status: number;
  body: any;
};

type HttpContext = {
  app: INestApplication;
  baseUrl: string;
};

class TestAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userIdHeader = request.headers["x-test-user-id"];
    if (typeof userIdHeader !== "string" || userIdHeader.trim().length === 0) {
      throw new UnauthorizedException("Authentication required");
    }

    const rolesHeader = request.headers["x-test-roles"];
    const chainIdHeader = request.headers["x-test-chain-id"];
    const roles =
      typeof rolesHeader === "string" && rolesHeader.trim().length > 0
        ? (rolesHeader
            .split(",")
            .map((value) => value.trim())
            .filter((value): value is SystemRole => value.length > 0) as SystemRole[])
        : undefined;
    const chainId =
      typeof chainIdHeader === "string" && chainIdHeader.trim().length > 0
        ? Number(chainIdHeader)
        : 1;

    request.user = {
      sub: userIdHeader.trim(),
      walletAddress: `wallet_${userIdHeader.trim()}`,
      chainId,
      roles,
    };
    request.requestId = request.requestId ?? "test-request-id";
    request.traceId = request.traceId ?? "test-trace-id";
    return true;
  }
}

const requestJson = async (
  baseUrl: string,
  path: string,
  input: {
    method?: "GET";
    user?: {
      userId: string;
      chainId?: number;
      roles?: SystemRole[];
    };
  } = {},
): Promise<JsonResponse> => {
  const headers = new Headers({
    accept: "application/json",
  });

  if (input.user) {
    headers.set("x-test-user-id", input.user.userId);
    if (typeof input.user.chainId === "number") {
      headers.set("x-test-chain-id", String(input.user.chainId));
    }
    if (input.user.roles && input.user.roles.length > 0) {
      headers.set("x-test-roles", input.user.roles.join(","));
    }
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method ?? "GET",
    headers,
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const withMonitoringHttpApp = async (
  monitoring: Pick<
    InternalMonitoringService,
    | "listSampleShortage"
    | "listQualityAnomalies"
    | "listValidationLifecycleDrift"
    | "getValidationChainHealth"
    | "getValidationChainRuntimeReadiness"
    | "getRuntimeContract"
  >,
  callback: (context: HttpContext) => Promise<void>,
): Promise<void> => {
  @Module({
    controllers: [ArenaInternalMonitoringController],
    providers: [
      {
        provide: APP_GUARD,
        useClass: TestAuthGuard,
      },
      {
        provide: APP_GUARD,
        useClass: RolesGuard,
      },
      {
        provide: Reflector,
        useValue: new Reflector(),
      },
      {
        provide: InternalMonitoringService,
        useValue: monitoring,
      },
    ],
  })
  class TestArenaHttpModule {}

  const app = await NestFactory.create(TestArenaHttpModule, {
    logger: false,
  });
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address();
  const port =
    typeof address === "object" && address !== null ? address.port : undefined;
  if (!port) {
    throw new Error("Failed to resolve HTTP test port");
  }

  try {
    await callback({
      app,
      baseUrl: `http://127.0.0.1:${port}`,
    });
  } finally {
    await app.close();
  }
};

test("validation chain health route exposes current operator summary in a focused smoke path", async () => {
  await withMonitoringHttpApp(
    {
      async listSampleShortage() {
        return [];
      },
      async listQualityAnomalies() {
        return [];
      },
      async listValidationLifecycleDrift() {
        return [];
      },
      async getValidationChainHealth() {
        return {
          streamKey: "validation_market_main",
          chainId: 1337,
          contractAddress: "0x0000000000000000000000000000000000000002",
          syncStatus: "idle",
          lastProcessedBlock: 118,
          lastProcessedTxHash: "0x10",
          lastProcessedLogIndex: 0,
          lastFinalizedBlock: 118,
          cursorUpdatedAt: "2026-04-24T00:35:00.000Z",
          pollIntervalMs: 15000,
          cursorStaleThresholdMs: 60000,
          isCursorStalled: false,
          schedulerWorker: null,
          recentAlerts: [
            {
              action: "validation_chain.alert.stale_payouts",
              entityType: "validation_chain_stream",
              entityId: "validation_market_main",
              reason: "validation_chain.payout.stale",
              metadata: {
                marketId: "market_resolved_1",
              },
              createdAt: "2026-04-24T00:59:00.000Z",
            },
          ],
          metrics: {
            recentRetryExhaustedCount: 0,
            recentTerminalCommandCount: 0,
            recentSyncFailureCount: 0,
            recentProjectorEntityMissingCount: 0,
            stalePayoutMarketCount: 1,
            unsyncedBetBacklogCount: 0,
          },
          eventLedger: {
            totalEventCount: 0,
            duplicateRows: [],
            recentEvents: [],
          },
          projection: {
            latestMarket: null,
            latestBet: null,
            unsyncedBetBacklog: [],
          },
          failures: {
            projectorFailuresCount: 0,
            syncFailuresCount: 0,
            recentFailures: [],
          },
          stalePayoutMarkets: [
            {
              marketId: "market_resolved_1",
              propositionId: "prop_1",
              chainStatus: "resolved",
              terminalAt: "2026-04-22T00:00:00.000Z",
              unclaimedBetCount: 2,
              operatorActions: [
                "POST /arena/internal/validation-chain/sync",
                "POST /arena/internal/validation-chain/markets/market_resolved_1/replay-projection",
                "GET /arena/internal/monitoring/validation-chain",
              ],
            },
          ],
          operatorSummary: {
            status: "action_required",
            requiresActionNow: true,
            focusArea: "stale_payouts",
            summary:
              "Stale payout recovery is required for at least one terminal market before settlement completeness can be trusted.",
            operatorActions: [
              "POST /arena/internal/validation-chain/sync",
              "POST /arena/internal/validation-chain/markets/market_resolved_1/replay-projection",
              "GET /arena/internal/monitoring/validation-chain",
            ],
            blockers: ["stale_payouts"],
            latestRelevantEvidence: {
              action: "validation_chain.alert.stale_payouts",
              entityType: "validation_chain_stream",
              entityId: "validation_market_main",
              reason: "validation_chain.payout.stale",
              createdAt: "2026-04-24T00:59:00.000Z",
            },
          },
        };
      },
      async getValidationChainRuntimeReadiness() {
        throw new Error("not used");
      },
      async getRuntimeContract() {
        throw new Error("not used");
      },
    },
    async ({ baseUrl }) => {
      const response = await requestJson(
        baseUrl,
        "/arena/internal/monitoring/validation-chain",
        {
          user: {
            userId: "operator_validation_chain",
            roles: [SystemRole.Operator],
          },
        },
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.operatorSummary.status, "action_required");
      assert.equal(response.body.operatorSummary.requiresActionNow, true);
      assert.equal(response.body.operatorSummary.focusArea, "stale_payouts");
      assert.equal(
        response.body.operatorSummary.latestRelevantEvidence.action,
        "validation_chain.alert.stale_payouts",
      );
    },
  );
});

test("runtime contract route exposes current operator summary in a focused smoke path", async () => {
  await withMonitoringHttpApp(
    {
      async listSampleShortage() {
        return [];
      },
      async listQualityAnomalies() {
        return [];
      },
      async listValidationLifecycleDrift() {
        return [];
      },
      async getValidationChainHealth() {
        return null;
      },
      async getValidationChainRuntimeReadiness() {
        throw new Error("not used");
      },
      async getRuntimeContract() {
        return {
          status: "degraded",
          generatedAt: "2026-05-24T00:36:00.000Z",
          environment: {
            nodeEnv: "production",
            validationEnvironment: "staging",
            port: 4000,
          },
          health: {
            live: {
              status: "ok",
              timestamp: "2026-05-24T00:36:00.000Z",
            },
            readiness: {
              status: "degraded",
              timestamp: "2026-05-24T00:36:00.000Z",
              dependencies: [
                { name: "database", status: "up" },
                { name: "redis", status: "up" },
                { name: "rpc", status: "up" },
                {
                  name: "scheduler_queue",
                  status: "down",
                  details: "scheduler queue worker is disconnected",
                },
              ],
            },
            queues: {
              status: "degraded",
              timestamp: "2026-05-24T00:36:00.000Z",
              redis: { status: "up" },
              queues: [
                {
                  name: "scheduler",
                  status: "down",
                  paused: true,
                  details: "scheduler queue worker is disconnected",
                  policy: {
                    retryable: true,
                    attempts: 5,
                    backoffType: "exponential",
                    backoffDelayMs: 1000,
                  },
                },
              ],
            },
          },
          validationChain: {
            status: "degraded",
            checkedAt: "2026-05-24T00:36:00.000Z",
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
          validationProofRecord: {
            environment: "staging",
            chainId: 8453,
            propositionId: "prop_runtime_contract",
            proofComplete: false,
            failures: ["reward_payout_follow_through_incomplete"],
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
            latestCheckpointAt: "2026-05-24T00:34:00.000Z",
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
            summaryArtifactPath:
              "validation-rehearsal/prop_runtime_contract/proof-summary.json",
            evidenceArtifactPath:
              "validation-rehearsal/prop_runtime_contract/evidence-bundle.json",
            publicResultArtifactPath:
              "validation-rehearsal/prop_runtime_contract/public-settled-result.json",
            rewardPayoutArtifactPath:
              "validation-rehearsal/prop_runtime_contract/reward-payout-summary.json",
            publicIntegrityArtifactPath:
              "validation-rehearsal/prop_runtime_contract/public-integrity-overview.json",
            note: "staging proof pending payout follow-through",
            recordedByUserId: "operator_validation_chain",
            checkedAt: "2026-05-24T00:35:00.000Z",
            recordedAt: "2026-05-24T00:36:00.000Z",
          },
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
            totalGateCount: 3,
          },
          releaseChecklist: [
            {
              id: "env",
              status: "ready",
              summary:
                "Populate required backend and validation-chain environment variables.",
              blockingDependencies: [],
              commands: ["pnpm run validation:env:check"],
              operatorActions: [],
            },
            {
              id: "readiness",
              status: "blocked",
              summary:
                "Verify public and validation runtime readiness before accepting traffic.",
              blockingDependencies: ["scheduler_queue"],
              commands: [
                "GET /health/ready",
                "GET /arena/internal/monitoring/validation-chain/runtime-readiness",
              ],
              operatorActions: [
                "GET /system/queues/overview",
                "GET /arena/internal/monitoring/validation-chain",
              ],
            },
          ],
          recentAlerts: [
            {
              id: "internal_audit_1",
              entityType: "runtime_contract",
              entityId: "release",
              action: "runtime_contract.alert.release_blocked",
              actorUserId: null,
              reason: "runtime_contract.release_blocked",
              note: null,
              metadata: {
                blockingDependencies: ["scheduler_queue", "rpc"],
              },
              createdAt: "2026-05-24T00:35:00.000Z",
            },
          ],
          operatorSummary: {
            status: "action_required",
            requiresActionNow: true,
            focusArea: "readiness",
            summary:
              "Release is blocked at readiness: Verify public and validation runtime readiness before accepting traffic.",
            operatorActions: [
              "GET /system/queues/overview",
              "GET /arena/internal/monitoring/validation-chain",
            ],
            blockers: ["scheduler_queue", "rpc"],
            latestRelevantEvidence: {
              action: "runtime_contract.alert.release_blocked",
              entityType: "runtime_contract",
              entityId: "release",
              reason: "runtime_contract.release_blocked",
              createdAt: "2026-05-24T00:35:00.000Z",
            },
          },
        };
      },
    },
    async ({ baseUrl }) => {
      const response = await requestJson(
        baseUrl,
        "/arena/internal/monitoring/runtime-contract",
        {
          user: {
            userId: "operator_validation_chain",
            roles: [SystemRole.Operator],
          },
        },
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.operatorSummary.status, "action_required");
      assert.equal(response.body.operatorSummary.requiresActionNow, true);
      assert.equal(response.body.operatorSummary.focusArea, "readiness");
      assert.equal(
        response.body.validationProofRecord.rewardPayoutArtifactPath,
        "validation-rehearsal/prop_runtime_contract/reward-payout-summary.json",
      );
      assert.equal(
        response.body.validationProofRecord.rewardPayoutStaleExecutingCount,
        1,
      );
      assert.equal(
        response.body.operatorSummary.latestRelevantEvidence.action,
        "runtime_contract.alert.release_blocked",
      );
    },
  );
});
