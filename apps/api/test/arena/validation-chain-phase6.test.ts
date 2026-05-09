import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ValidationChainCursor, ValidationChainEvent } from "@prisma/client";

import {
  ArenaConflictError,
} from "../../src/arena/arena.errors";
import type { ValidationChainMonitoringViewModel } from "../../src/arena/internal-ops.types";
import { ValidationChainProjectionService } from "../../src/arena/validation-chain/validation-chain-projection.service";
import { ValidationChainAlertService } from "../../src/arena/validation-chain/validation-chain-alert.service";
import { ValidationChainCommandRuntimeService } from "../../src/arena/validation-chain/validation-chain-command-runtime.service";
import { ValidationChainPauserService } from "../../src/arena/validation-chain/validation-chain-pauser.service";
import {
  ValidationContractMarketState,
  type ValidationChainCommandJobPayload,
} from "../../src/arena/validation-chain/validation-chain.types";
import { createArenaHarness } from "./harness";

const propositionDraftInput = {
  category: "general" as const,
  title: "Phase six proposition",
  description: "desc",
  options: ["Yes", "No"] as [string, string],
  sampleConstraints: [],
  minEffectiveSample: 1,
  minBetAmount: "10",
  minDurationSeconds: 60,
  maxDurationSeconds: 600,
  rewardBudget: "0",
  baseResponseReward: "0",
  createdByUserId: "admin_1",
  marketEnabled: true,
};

class FakeValidationChainRuntime {
  readonly createOpenCalls: Array<Record<string, unknown>> = [];
  readonly freezeCalls: Array<Record<string, unknown>> = [];
  readonly resolveCalls: Array<Record<string, unknown>> = [];

  async enqueueCreateOpenCommands(input: Record<string, unknown>): Promise<void> {
    this.createOpenCalls.push(input);
  }

  async enqueueFreezeCommand(input: Record<string, unknown>): Promise<void> {
    this.freezeCalls.push(input);
  }

  async enqueueResolveCommand(input: Record<string, unknown>): Promise<void> {
    this.resolveCalls.push(input);
  }
}

class FakeQueueService {
  readonly calls: Array<{
    payload: ValidationChainCommandJobPayload;
    overrides: Record<string, unknown>;
  }> = [];

  async enqueueValidationChainCommand(
    payload: ValidationChainCommandJobPayload,
    overrides: Record<string, unknown> = {},
  ) {
    this.calls.push({ payload, overrides });
    return {
      queue: "scheduler",
      name: "validation-chain.command",
      jobId: `job_${this.calls.length}`,
    };
  }
}

class FakeMarketRepository {
  constructor(
    private readonly state: {
      marketId?: string;
      chainMarketId?: string | null;
      onChainState?: ValidationContractMarketState | null;
    },
  ) {}

  async findByPropositionId() {
    if (!this.state.marketId) {
      return null;
    }

    return {
      id: this.state.marketId,
      chainMarketId: this.state.chainMarketId ?? null,
    };
  }
}

class FakeValidationChainIdService {
  buildChainMarketId(marketId: string): string {
    return `chain_${marketId}`;
  }
}

class FakeValidationChainContractService {
  constructor(
    private readonly state: {
      onChainState?: ValidationContractMarketState | null;
      paused?: boolean;
    } = {},
  ) {}

  async getMarketOrNull() {
    if (this.state.onChainState === undefined || this.state.onChainState === null) {
      return null;
    }

    return {
      state: this.state.onChainState,
    };
  }

  async isPaused(): Promise<boolean> {
    return this.state.paused ?? false;
  }

  async sendPause() {
    this.state.paused = true;
    return { hash: "0x01" };
  }

  async sendUnpause() {
    this.state.paused = false;
    return { hash: "0x02" };
  }

  getContractAddress(): string {
    return "0x0000000000000000000000000000000000000002";
  }
}

class FakeOperatorService {
  createError?: Error;
  openError?: Error;
  freezeError?: Error;
  readonly createCalls: ValidationChainCommandJobPayload[] = [];
  readonly openCalls: ValidationChainCommandJobPayload[] = [];
  readonly freezeCalls: ValidationChainCommandJobPayload[] = [];

  async createMarket(input: ValidationChainCommandJobPayload): Promise<void> {
    this.createCalls.push(input);
    if (this.createError) {
      throw this.createError;
    }
  }

  async openMarket(input: ValidationChainCommandJobPayload): Promise<void> {
    this.openCalls.push(input);
    if (this.openError) {
      throw this.openError;
    }
  }

  async freezeMarket(input: ValidationChainCommandJobPayload): Promise<void> {
    this.freezeCalls.push(input);
    if (this.freezeError) {
      throw this.freezeError;
    }
  }
}

class FakeOracleService {
  resolveError?: Error;
  readonly resolveCalls: ValidationChainCommandJobPayload[] = [];

  async resolveMarket(input: ValidationChainCommandJobPayload): Promise<void> {
    this.resolveCalls.push(input);
    if (this.resolveError) {
      throw this.resolveError;
    }
  }
}

class FakeAlertService {
  readonly enqueued: Array<Record<string, unknown>> = [];
  readonly skipped: Array<Record<string, unknown>> = [];
  readonly terminals: Array<Record<string, unknown>> = [];
  readonly exhausted: Array<Record<string, unknown>> = [];
  readonly projector: Array<Record<string, unknown>> = [];
  readonly audits: Array<Record<string, unknown>> = [];
  healthSnapshot: ValidationChainMonitoringViewModel | null = null;

  async recordCommandEnqueued(input: Record<string, unknown>): Promise<void> {
    this.enqueued.push(input);
  }

  async recordCommandSkipped(input: Record<string, unknown>): Promise<void> {
    this.skipped.push(input);
  }

  async recordCommandTerminal(input: Record<string, unknown>): Promise<void> {
    this.terminals.push(input);
  }

  async recordCommandRetryExhausted(input: Record<string, unknown>): Promise<void> {
    this.exhausted.push(input);
  }

  async recordProjectorEntityMissing(input: Record<string, unknown>): Promise<void> {
    this.projector.push(input);
  }

  async getHealthSnapshot(): Promise<ValidationChainMonitoringViewModel | null> {
    return this.healthSnapshot;
  }

  async record(input: Record<string, unknown>): Promise<void> {
    this.audits.push(input);
  }
}

class FakeLogger {
  setContext(): void {}
  warn(): void {}
  error(): void {}
}

class FakePrismaService {
  constructor(
    public readonly internalAuditEvent: {
      findMany: (input: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
      findFirst: (input: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
      count?: (input: Record<string, unknown>) => Promise<number>;
    },
    public readonly market: {
      findMany: (input: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
      findFirst?: (input: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    },
    public readonly validationChainEvent = {
      count: async () => 0,
      findMany: async () => [] as Array<Record<string, unknown>>,
    },
    public readonly bet = {
      findFirst: async () => null as Record<string, unknown> | null,
    },
  ) {}

  async $transaction<T>(callback: (tx: FakePrismaService) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async $queryRawUnsafe(): Promise<Array<Record<string, unknown>>> {
    return [];
  }
}

class FakeCursorRepository {
  constructor(private readonly cursor: ValidationChainCursor | null) {}

  async getCursor(): Promise<ValidationChainCursor | null> {
    return this.cursor;
  }
}

class FakeAuditService {
  readonly records: Array<Record<string, unknown>> = [];

  async record(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.records.push(input);
    return input;
  }
}

function createCommandRuntimeService(input?: {
  onChainState?: ValidationContractMarketState | null;
}) {
  const queue = new FakeQueueService();
  const operator = new FakeOperatorService();
  const oracle = new FakeOracleService();
  const alerts = new FakeAlertService();
  const service = new ValidationChainCommandRuntimeService(
    queue as never,
    new FakeMarketRepository({
      marketId: "market_1",
      chainMarketId: "chain_market_1",
      onChainState: input?.onChainState,
    }) as never,
    new FakeValidationChainIdService() as never,
    new FakeValidationChainContractService({
      onChainState: input?.onChainState,
    }) as never,
    operator as never,
    oracle as never,
    alerts as never,
    new FakeLogger() as never,
  );

  return {
    service,
    queue,
    operator,
    oracle,
    alerts,
  };
}

describe("Validation chain phase six runtime integration", () => {
  it("queues create/open from proposition publish and freeze/resolve from reveal runtime", async () => {
    const runtime = new FakeValidationChainRuntime();
    const harness = createArenaHarness({
      validationChainRuntime: runtime as never,
    });

    const draft = await harness.propositionEngineService.createProposition({
      ...propositionDraftInput,
    });
    const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: draft.id,
      publishedAt: "2026-04-24T10:00:00.000Z",
      updatedByUserId: "admin_1",
    });

    await harness.propositionEngineService.publishLiveProposition({
      propositionId: scheduled.id,
      liveAt: "2026-04-24T10:05:00.000Z",
      updatedByUserId: "admin_1",
    });

    assert.equal(runtime.createOpenCalls.length, 1);
    assert.equal(runtime.createOpenCalls[0]?.propositionId, draft.id);

    const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
      propositionId: draft.id,
      userIds: ["phase6_user"],
      assignedAt: "2026-04-24T10:05:10.000Z",
      expiresAt: "2026-04-24T10:16:00.000Z",
    });
    await harness.dispatchEngineService.startTask({
      taskId: task.id,
      userId: "phase6_user",
      startedAt: "2026-04-24T10:05:15.000Z",
    });
    const response = await harness.responseService.submitResponse({
      propositionId: draft.id,
      taskId: task.id,
      userId: "phase6_user",
      selectedOption: 0,
      confirmationOption: 0,
      clientStartedAt: "2026-04-24T10:05:20.000Z",
      clientSubmittedAt: "2026-04-24T10:05:40.000Z",
      submittedAt: "2026-04-24T10:05:40.000Z",
      understandingAck: true,
    });
    await harness.qualityEngineService.reviewPendingResponse({
      responseId: response.id,
      reviewedAt: "2026-04-24T10:05:50.000Z",
      reviewedByUserId: "reviewer_1",
    });
    await harness.counterService.rebuildCounterForProposition(draft.id);

    await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
      propositionId: draft.id,
      now: "2026-04-24T10:06:00.000Z",
      updatedByUserId: "admin_1",
    });

    assert.equal(runtime.freezeCalls.length, 1);
    assert.equal(runtime.resolveCalls.length, 1);
    assert.equal(runtime.freezeCalls[0]?.propositionId, draft.id);
    assert.equal(runtime.resolveCalls[0]?.propositionId, draft.id);
  });

  it("schedules create/open with staggered delays for runtime publish", async () => {
    const { service, queue, alerts } = createCommandRuntimeService();

    await service.enqueueCreateOpenCommands({
      propositionId: "prop_1",
      actorUserId: "system_1",
      reason: "validation_chain.runtime.publish_live",
    });

    assert.equal(queue.calls.length, 2);
    assert.equal(queue.calls[0]?.payload.command, "create_market");
    assert.equal(queue.calls[0]?.overrides.delay, 0);
    assert.equal(queue.calls[1]?.payload.command, "open_market");
    assert.equal(queue.calls[1]?.overrides.delay, 5000);
    assert.equal(alerts.enqueued.length, 2);
  });

  it("retries transient queued commands and skips idempotent duplicates", async () => {
    const retryable = createCommandRuntimeService();
    retryable.operator.openError = new ArenaConflictError(
      "validation_chain.market_not_created",
      "Validation market does not exist on-chain yet",
    );

    await assert.rejects(
      () =>
        retryable.service.executeQueuedCommand({
          command: "open_market",
          propositionId: "prop_1",
          reason: "validation_chain.runtime.publish_live",
          requestedAt: new Date().toISOString(),
        }),
      /does not exist on-chain yet/i,
    );

    const noop = createCommandRuntimeService({
      onChainState: ValidationContractMarketState.Resolved,
    });
    noop.oracle.resolveError = new ArenaConflictError(
      "validation_chain.resolve.already_resolved",
      "Validation market is already resolved on-chain",
    );

    await noop.service.executeQueuedCommand({
      command: "resolve_market",
      propositionId: "prop_1",
      reason: "validation_chain.runtime.official_result",
      requestedAt: new Date().toISOString(),
    });

    assert.equal(noop.alerts.skipped.length, 1);
    assert.equal(noop.alerts.terminals.length, 0);
  });

  it("records manual pause and unpause with audit identity", async () => {
    const audit = new FakeAuditService();
    const contract = new FakeValidationChainContractService({
      paused: false,
    });
    const pauser = new ValidationChainPauserService(
      contract as never,
      audit as never,
    );

    const pauseResult = await pauser.pauseValidationChain({
      actorUserId: "admin_1",
      reason: "validation_chain.pause.manual",
    });
    assert.equal(pauseResult.txHash, "0x01");

    const unpauseResult = await pauser.unpauseValidationChain({
      actorUserId: "admin_1",
      reason: "validation_chain.unpause.manual",
    });
    assert.equal(unpauseResult.txHash, "0x02");
    assert.equal(audit.records.length, 2);
    assert.deepEqual(
      audit.records.map((record) => record.action),
      [
        "validation_chain.pause.submitted",
        "validation_chain.unpause.submitted",
      ],
    );
    assert.deepEqual(
      audit.records.map((record) => record.actorUserId),
      ["admin_1", "admin_1"],
    );
  });

  it("raises projector entity-missing alerts when chain event cannot map to a local market", async () => {
    const alerts = new FakeAlertService();
    const projector = new ValidationChainProjectionService(
      {
        async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
          return callback(this);
        },
      } as never,
      {
        async findByChainMarketId() {
          return null;
        },
        async findByChainPropositionId() {
          return null;
        },
      } as never,
      {} as never,
      {
        async record() {
          return null;
        },
      } as never,
      alerts as never,
    );

    await assert.rejects(
      () =>
        projector.projectEvent(
          {
            id: "event_1",
            chainId: 1337,
            contractAddress: "0x0000000000000000000000000000000000000002",
            blockNumber: 1,
            blockHash: "0x01",
            transactionHash: "0x02",
            transactionIndex: 0,
            logIndex: 0,
            eventName: "MarketCreated",
            marketChainId: "chain_market_1",
            propositionChainId: "chain_prop_1",
            payloadJson: {
              marketId: "chain_market_1",
              propositionId: "chain_prop_1",
              minStake: "10",
              operator: "0x00000000000000000000000000000000000000a1",
              blockTimestamp: 1_700_000_000,
            },
            processedAt: new Date(),
          } as ValidationChainEvent,
        ),
      /projection target was not found/i,
    );

    assert.equal(alerts.projector.length, 1);
  });

  it("marks a stalled cursor through the validation health check", async () => {
    const staleCursor: ValidationChainCursor = {
      streamKey: "validation_market_main",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000000002",
      lastProcessedBlock: 10,
      lastProcessedTxHash: "0x10",
      lastProcessedLogIndex: 0,
      lastFinalizedBlock: 12,
      syncStatus: "idle",
      createdAt: new Date("2026-04-24T00:00:00.000Z"),
      updatedAt: new Date("2026-04-24T00:00:00.000Z"),
    };

    const audit = new FakeAuditService();
    const prisma = new FakePrismaService(
      {
        findMany: async () =>
          [
            {
              action: "validation_chain.sync.failed",
              entityType: "validation_chain_stream",
              entityId: staleCursor.streamKey,
              reason: "validation_chain.sync.error",
              metadataJson: {},
              createdAt: new Date("2026-04-24T00:10:00.000Z"),
            },
            {
              action: "validation_chain.sync.failed",
              entityType: "validation_chain_stream",
              entityId: staleCursor.streamKey,
              reason: "validation_chain.sync.error",
              metadataJson: {},
              createdAt: new Date("2026-04-24T00:11:00.000Z"),
            },
            {
              action: "validation_chain.sync.failed",
              entityType: "validation_chain_stream",
              entityId: staleCursor.streamKey,
              reason: "validation_chain.sync.error",
              metadataJson: {},
              createdAt: new Date("2026-04-24T00:12:00.000Z"),
            },
          ] as Array<Record<string, unknown>>,
        findFirst: async () => null,
        count: async () => 3,
      },
      {
        findMany: async () => [],
        findFirst: async () => null,
      },
    );

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(staleCursor) as never,
      audit as never,
    );

    const snapshot = await alerts.getHealthSnapshot("2026-04-24T01:00:00.000Z");
    assert.equal(snapshot.isCursorStalled, true);
    assert.equal(snapshot.eventLedger.totalEventCount, 0);
    assert.deepEqual(snapshot.eventLedger.duplicateRows, []);
    assert.equal(snapshot.projection.latestMarket, null);
    assert.equal(snapshot.projection.latestBet, null);
    assert.equal(snapshot.failures.syncFailuresCount, 3);

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");

    assert.equal(
      audit.records.some(
        (record) => record.action === "validation_chain.alert.cursor_stalled",
      ),
      true,
    );
  });
});
