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

import { ArenaInternalPropositionsController } from "../../src/arena/internal-propositions.controller";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import type { RequestWithUser } from "../../src/common/interfaces/request-with-user.interface";
import { InternalPropositionOpsService } from "../../src/arena/services/internal-proposition-ops.service";
import {
  type ArenaHarness,
  createArenaHarness,
} from "./harness";

const propositionDraftInput = {
  category:
    "general" as
      | "general"
      | "sports"
      | "ai"
      | "brand_research"
      | "politics"
      | "entertainment",
  title: "Will option A win?",
  description: "MVP binary proposition",
  options: ["A", "B"] as [string, string],
  minEffectiveSample: 3,
  minBetAmount: "10",
  minDurationSeconds: 60,
  maxDurationSeconds: 3600,
  rewardBudget: "1000",
  baseResponseReward: "20",
  marketEnabled: false,
  createdByUserId: "admin_1",
};

type TestUser = {
  userId: string;
  chainId?: number;
  roles?: SystemRole[];
};

type JsonResponse = {
  status: number;
  body: any;
};

type HttpArenaContext = {
  app: INestApplication;
  baseUrl: string;
  harness: ArenaHarness;
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

const createLiveProposition = async (
  harness: ArenaHarness,
  overrides: Partial<typeof propositionDraftInput> = {},
) => {
  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    ...overrides,
  });
  const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
    propositionId: draft.id,
    publishedAt: "2026-04-18T10:00:00.000Z",
    updatedByUserId: "admin_1",
  });

  return harness.propositionEngineService.publishLiveProposition({
    propositionId: scheduled.id,
    liveAt: "2026-04-18T10:05:00.000Z",
    updatedByUserId: "admin_1",
  });
};

const requestJson = async (
  baseUrl: string,
  path: string,
  input: {
    method?: "GET";
    user?: TestUser;
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

const createInternalPropositionHttpApp = async (): Promise<HttpArenaContext> => {
  const harness = createArenaHarness();

  @Module({
    controllers: [ArenaInternalPropositionsController],
    providers: [
      {
        provide: InternalPropositionOpsService,
        useValue: harness.internalPropositionOpsService,
      },
      {
        provide: APP_GUARD,
        useClass: TestAuthGuard,
      },
      {
        provide: APP_GUARD,
        useClass: RolesGuard,
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

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    harness,
  };
};

const withHttpArenaApp = async (
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  const context = await createInternalPropositionHttpApp();

  try {
    await callback(context);
  } finally {
    await context.app.close();
  }
};

const withCustomHttpArenaApp = async (
  harness: ArenaHarness,
  callback: (context: HttpArenaContext) => Promise<void>,
): Promise<void> => {
  @Module({
    controllers: [ArenaInternalPropositionsController],
    providers: [
      {
        provide: InternalPropositionOpsService,
        useValue: harness.internalPropositionOpsService,
      },
      {
        provide: APP_GUARD,
        useClass: TestAuthGuard,
      },
      {
        provide: APP_GUARD,
        useClass: RolesGuard,
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
      harness,
    });
  } finally {
    await app.close();
  }
};

test("internal proposition evidence bundle route exposes proposition-scoped recovery guidance", async () => {
  const harness = createArenaHarness({
    validationChainAlerts: {
      async getHealthSnapshot() {
        return {
          streamKey: "validation_market_main",
          chainId: 1337,
          contractAddress: "0x0000000000000000000000000000000000000002",
          syncStatus: "idle",
          lastProcessedBlock: 88,
          lastProcessedTxHash: "0xproof",
          lastProcessedLogIndex: 0,
          lastFinalizedBlock: 88,
          cursorUpdatedAt: "2026-04-18T10:05:50.000Z",
          pollIntervalMs: 15000,
          cursorStaleThresholdMs: 60000,
          isCursorStalled: false,
          schedulerWorker: null,
          recentAlerts: [],
          metrics: {
            recentRetryExhaustedCount: 0,
            recentTerminalCommandCount: 0,
            recentSyncFailureCount: 0,
            recentProjectorEntityMissingCount: 0,
            stalePayoutMarketCount: 0,
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
          stalePayoutMarkets: [],
        } as any;
      },
    } as any,
  });

  await withCustomHttpArenaApp(harness, async ({ baseUrl, harness }) => {
    const live = await createLiveProposition(harness, {
      marketEnabled: true,
      title: "Recovery evidence bundle proposition",
    });
    const market = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(market);
    await harness.marketRepository.update(market.id, {
      chainMarketId: `chain_market_${market.id}`,
      chainPropositionId: `chain_prop_${live.id}`,
      chainStatus: "pre_live",
      chainSyncedAt: new Date("2026-04-18T10:05:30.000Z"),
    });
    await harness.internalAuditService.record({
      entityType: "validation_market",
      entityId: market.id,
      action: "validation_chain.alert.lifecycle_drift",
      actorUserId: null,
      reason: "validation_chain.lifecycle_drift.chain_market_not_opened.queue_recovery",
      metadata: {
        propositionId: live.id,
        marketId: market.id,
        propositionStatus: "live",
        marketStatus: "live",
        localChainStatus: "pre_live",
        chainMarketId: `chain_market_${market.id}`,
        onChainState: "pre_live",
        driftReason: "chain_market_not_opened",
        operatorGuidance: {
          kind: "queue_recovery",
          summary:
            "Queue open_market to move the pre-live chain market into the live state.",
          recoveryReason: "open_pre_live_market",
          plannedCommands: ["open_market"],
          operatorActions: [
            `/arena/internal/validation-chain/propositions/${live.id}/recover-command`,
          ],
        },
      },
      createdAt: new Date("2026-04-18T10:05:40.000Z"),
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}/evidence-bundle`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(
      response.body.propositionExport.validationLifecycle.onChainState,
      "pre_live",
    );
    assert.equal(
      response.body.propositionExport.validationLifecycle.operatorGuidance.recoveryReason,
      "open_pre_live_market",
    );
    assert.equal(
      response.body.propositionExport.validationOperatorSummary.status,
      "action_required",
    );
    assert.equal(
      response.body.propositionExport.validationOperatorSummary.requiresActionNow,
      true,
    );
    assert.deepEqual(
      response.body.propositionExport.validationOperatorSummary.plannedCommands,
      ["open_market"],
    );
    assert.equal(
      response.body.propositionExport.validationOperatorSummary.operatorActions.includes(
        `/arena/internal/validation-chain/propositions/${live.id}/recover-command`,
      ),
      true,
    );
    assert.equal(
      response.body.propositionExport.validationChainActivity.driftAuditEvents[0].action,
      "validation_chain.alert.lifecycle_drift",
    );
    assert.equal(response.body.validationChainHealth.syncStatus, "idle");
    assert.equal(response.body.validationChainHealth.lastProcessedBlock, 88);
    assert.equal(
      response.body.validationChainHealth.metrics.recentSyncFailureCount,
      0,
    );
  });
});

test("internal proposition detail route exposes proposition-scoped lifecycle drift evidence", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const live = await createLiveProposition(harness, {
      marketEnabled: true,
      title: "Recovery detail proposition",
    });
    const market = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(market);
    harness.store.markets = harness.store.markets.filter((item) => item.id !== market.id);
    await harness.internalAuditService.record({
      entityType: "validation_proposition",
      entityId: live.id,
      action: "validation_chain.alert.lifecycle_drift",
      actorUserId: null,
      reason: "validation_chain.lifecycle_drift.market_missing.manual_intervention",
      metadata: {
        propositionId: live.id,
        marketId: null,
        propositionStatus: "live",
        marketStatus: null,
        localChainStatus: null,
        chainMarketId: null,
        onChainState: null,
        driftReason: "market_missing",
        operatorGuidance: {
          kind: "manual_intervention",
          summary:
            "The local validation market row is missing. Reconstruct or investigate local market state before replaying projection or queueing chain commands.",
          recoveryReason: null,
          plannedCommands: [],
          operatorActions: ["docs/contracts/arena-validation-chain-runbook.md"],
        },
      },
      createdAt: new Date("2026-04-18T10:06:20.000Z"),
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.market, null);
    assert.equal(response.body.validationLifecycle.driftReason, "market_missing");
    assert.equal(response.body.validationLifecycle.onChainState, null);
    assert.equal(
      response.body.validationLifecycle.operatorGuidance.kind,
      "manual_intervention",
    );
    assert.equal(
      response.body.validationChainActivity.driftAuditEvents[0].entityType,
      "validation_proposition",
    );
  });
});

test("internal proposition detail route exposes proposition-scoped recovery follow-through activity", async () => {
  await withHttpArenaApp(async ({ baseUrl, harness }) => {
    const live = await createLiveProposition(harness, {
      marketEnabled: true,
      title: "Recovery follow-through detail proposition",
    });
    const market = await harness.marketRepository.findByPropositionId(live.id);
    assert.ok(market);

    await harness.marketRepository.update(market.id, {
      chainMarketId: `chain_market_${market.id}`,
      chainPropositionId: `chain_prop_${live.id}`,
      chainStatus: "live",
      chainSyncedAt: new Date("2026-04-18T10:05:30.000Z"),
    });
    await harness.internalAuditService.record({
      entityType: "validation_market",
      entityId: market.id,
      action: "validation_chain.command_recovery.already_pending",
      actorUserId: "operator_validation_chain",
      reason: "manual_chain_command_recovery",
      metadata: {
        propositionId: live.id,
        marketId: market.id,
        requestStatus: "already_pending",
        commandSubmissions: [
          {
            command: "open_market",
            status: "already_pending",
            queueJobId: "validation-chain.open_market.prop_1",
            delayMs: 5000,
            errorMessage: null,
          },
        ],
      },
      createdAt: new Date("2026-04-18T10:05:40.000Z"),
    });
    await harness.internalAuditService.record({
      entityType: "validation_chain_stream",
      entityId: "validation_chain_unsynced_bet_backlog",
      action: "validation_chain.bet_reconciliation.batch.performed",
      actorUserId: "operator_validation_chain",
      reason: "manual_chain_backlog_reconcile",
      metadata: {
        processedCount: 1,
        matchedCount: 1,
        mismatchedCount: 0,
        failedCount: 0,
        propositionIds: [live.id],
        marketIds: [market.id],
        betIds: ["bet_1"],
      },
      createdAt: new Date("2026-04-18T10:05:50.000Z"),
    });

    const response = await requestJson(
      baseUrl,
      `/arena/internal/propositions/${live.id}`,
      {
        user: {
          userId: "operator_validation_chain",
          roles: [SystemRole.Operator],
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.validationChainActivity.recoveryAuditEvents.map(
        (event: { action: string }) => event.action,
      ),
      [
        "validation_chain.bet_reconciliation.batch.performed",
        "validation_chain.command_recovery.already_pending",
      ],
    );
    assert.equal(response.body.validationOperatorSummary.status, "ready");
    assert.equal(response.body.validationOperatorSummary.requiresActionNow, false);
    assert.equal(
      response.body.validationOperatorSummary.summary,
      "No active validation lifecycle drift. Latest operator evidence shows reconciliation completed.",
    );
    assert.equal(
      response.body.validationOperatorSummary.latestRelevantAudit.action,
      "validation_chain.bet_reconciliation.batch.performed",
    );
  });
});
