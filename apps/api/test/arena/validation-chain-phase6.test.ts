import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ValidationChainCursor, ValidationChainEvent } from "@prisma/client";

import {
  ArenaConflictError,
} from "../../src/arena/arena.errors";
import type { ValidationChainMonitoringViewModel } from "../../src/arena/internal-ops.types";
import { AppQueueService } from "../../src/queue/queue.service";
import { ValidationChainProjectionService } from "../../src/arena/validation-chain/validation-chain-projection.service";
import { ValidationChainAlertService } from "../../src/arena/validation-chain/validation-chain-alert.service";
import { ValidationChainCommandRuntimeService } from "../../src/arena/validation-chain/validation-chain-command-runtime.service";
import { ValidationChainBetReconciliationService } from "../../src/arena/validation-chain/validation-chain-bet-reconciliation.service";
import { ValidationChainCommandRecoveryService } from "../../src/arena/validation-chain/validation-chain-command-recovery.service";
import { ValidationChainPauserService } from "../../src/arena/validation-chain/validation-chain-pauser.service";
import { ValidationChainProjectionReplayService } from "../../src/arena/validation-chain/validation-chain-projection-replay.service";
import { InternalMonitoringService } from "../../src/arena/services/internal-monitoring.service";
import { ValidationRehearsalCheckpointService } from "../../src/arena/services/validation-rehearsal-checkpoint.service";
import {
  ValidationChainContractError,
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
  readonly jobs = new Map<
    string,
    {
      id: string;
      state: "waiting" | "active" | "completed" | "failed";
      removed: boolean;
    }
  >();

  async enqueueValidationChainCommand(
    payload: ValidationChainCommandJobPayload,
    overrides: Record<string, unknown> = {},
  ) {
    const configuredJobId =
      typeof overrides.jobId === "string" && overrides.jobId.length > 0
        ? overrides.jobId
        : undefined;
    const existingJob =
      configuredJobId ? this.jobs.get(configuredJobId) ?? null : null;

    if (existingJob && !existingJob.removed) {
      this.calls.push({ payload, overrides });
      return {
        queue: "scheduler",
        name: "validation-chain.command",
        jobId: existingJob.id,
      };
    }

    const jobId = configuredJobId ?? `job_${this.calls.length + 1}`;
    this.jobs.set(jobId, {
      id: jobId,
      state: "waiting",
      removed: false,
    });
    this.calls.push({ payload, overrides });
    return {
      queue: "scheduler",
      name: "validation-chain.command",
      jobId,
    };
  }

  async getJob(jobId: string) {
    const job = this.jobs.get(jobId) ?? null;
    if (!job || job.removed) {
      return undefined;
    }

    return {
      id: job.id,
      async getState() {
        return job.state;
      },
      async remove() {
        job.removed = true;
      },
    };
  }
}

class FakeBullQueue {
  readonly addCalls: Array<{
    name: string;
    data: Record<string, unknown>;
    opts: Record<string, unknown>;
  }> = [];
  readonly jobs = new Map<
    string,
    {
      id: string;
      name: string;
      data: Record<string, unknown>;
      opts: Record<string, unknown>;
      state: "waiting" | "active" | "completed" | "failed";
      removed: boolean;
    }
  >();

  async add(
    name: string,
    data: Record<string, unknown>,
    opts: Record<string, unknown> = {},
  ) {
    this.addCalls.push({ name, data, opts });

    const configuredJobId =
      typeof opts.jobId === "string" && opts.jobId.length > 0
        ? opts.jobId
        : `job_${this.addCalls.length}`;
    const existing = this.jobs.get(configuredJobId);

    if (existing && !existing.removed) {
      return {
        id: existing.id,
        name: existing.name,
        data: existing.data,
        opts: existing.opts,
      };
    }

    const job = {
      id: configuredJobId,
      name,
      data,
      opts,
      state: "waiting" as const,
      removed: false,
    };
    this.jobs.set(configuredJobId, job);

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
    };
  }

  async getJob(jobId: string) {
    const job = this.jobs.get(jobId) ?? null;
    if (!job || job.removed) {
      return undefined;
    }

    return {
      id: job.id,
      async getState() {
        return job.state;
      },
      async remove() {
        job.removed = true;
      },
    };
  }

  async getJobCounts() {
    return {
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
    };
  }

  async isPaused() {
    return false;
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

  buildChainPropositionId(propositionId: string): string {
    return `chain_${propositionId}`;
  }
}

class FakeValidationChainContractService {
  constructor(
    private readonly state: {
      onChainState?: ValidationContractMarketState | null;
      paused?: boolean;
      hasRuntimeCode?: boolean;
      runtimeBytecodeMatchesArtifact?: boolean;
      signerIssues?: Partial<Record<"operator" | "oracle" | "pauser", {
        hasBalance?: boolean;
        hasRequiredRole?: boolean;
      }>>;
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

  getArtifactPath(): string {
    return __filename;
  }

  async assertReady(): Promise<void> {
    return undefined;
  }

  async getDeploymentReadiness() {
    const signerIssueState = this.state.signerIssues ?? {};

    return {
      contractAddress: "0x0000000000000000000000000000000000000002",
      hasRuntimeCode: this.state.hasRuntimeCode ?? true,
      runtimeBytecodeMatchesArtifact:
        this.state.runtimeBytecodeMatchesArtifact ?? true,
      paused: this.state.paused ?? false,
      signers: (["operator", "oracle", "pauser"] as const).map((role, index) => {
        const issue = signerIssueState[role] ?? {};
        return {
          role,
          address: `0x00000000000000000000000000000000000000a${index + 1}`,
          hasBalance: issue.hasBalance ?? true,
          hasRequiredRole: issue.hasRequiredRole ?? true,
          balance: issue.hasBalance === false ? "0" : "1",
        };
      }),
    };
  }

  getReadOnlyContract() {
    return {
      async paused() {
        return false;
      },
    };
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

class FakeValidationRehearsalCheckpointService {
  readonly records: Array<Record<string, unknown>> = [];

  async recordCheckpoint(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.records.push(input);
    return input;
  }
}

class FakeLogger {
  setContext(): void {}
  info(): void {}
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
      findMany: async () => [] as Array<Record<string, unknown>>,
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

class FakeValidationChainContractReadService {
  position:
    | {
        selectedOption: number;
        stakeAmount: { toString(): string };
        claimed: boolean;
        claimableAmount: { toString(): string };
      }
    | null = null;
  claimable = "0";
  readonly positionsByKey = new Map<
    string,
    {
      selectedOption: number;
      stakeAmount: { toString(): string };
      claimed: boolean;
      claimableAmount: { toString(): string };
    }
  >();
  readonly claimablesByKey = new Map<string, string>();

  async getUserPosition(marketChainId?: string, userId?: string) {
    const key = `${marketChainId ?? ""}:${userId ?? ""}`;
    const position = this.positionsByKey.get(key) ?? this.position;
    if (!position) {
      throw new Error("position not configured");
    }

    return position;
  }

  async claimableAmount(marketChainId?: string, userId?: string) {
    const key = `${marketChainId ?? ""}:${userId ?? ""}`;
    const claimable = this.claimablesByKey.get(key) ?? this.claimable;
    return {
      toString: () => claimable,
    };
  }
}

function createCommandRuntimeService(input?: {
  onChainState?: ValidationContractMarketState | null;
}) {
  const queue = new FakeQueueService();
  const operator = new FakeOperatorService();
  const oracle = new FakeOracleService();
  const alerts = new FakeAlertService();
  const rehearsalCheckpoints = new FakeValidationRehearsalCheckpointService();
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
    rehearsalCheckpoints as never as ValidationRehearsalCheckpointService,
    new FakeLogger() as never,
  );

  return {
    service,
    queue,
    operator,
    oracle,
    alerts,
    rehearsalCheckpoints,
  };
}

function createCommandRecoveryService(input: {
  proposition?: Record<string, unknown> | null;
  market?: Record<string, unknown> | null;
  onChainState?: ValidationContractMarketState | null;
}) {
  const proposition =
    input.proposition === undefined
      ? {
          id: "prop_1",
          status: "live",
          marketEnabled: true,
          resultKind: null,
          winningOption: null,
          voidReason: null,
          resultComputedAt: null,
        }
      : input.proposition;
  const market =
    input.market === undefined
      ? {
          id: "market_1",
          propositionId: "prop_1",
          status: "live",
          chainMarketId: "chain_market_1",
          chainPropositionId: "chain_prop_1",
          chainStatus: null,
        }
      : input.market;
  const runtime = new FakeValidationChainRuntime();
  const audit = new FakeAuditService();
  const service = new ValidationChainCommandRecoveryService(
    {
      async findById() {
        return proposition;
      },
    } as never,
    {
      async findByPropositionId() {
        return market;
      },
    } as never,
    new FakeValidationChainIdService() as never,
    new FakeValidationChainContractService({
      onChainState: input.onChainState,
    }) as never,
    runtime as never,
    audit as never,
  );

  return {
    service,
    runtime,
    audit,
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

  it("allows re-enqueue after a completed validation-chain command job is retained", async () => {
    const systemQueue = new FakeBullQueue();
    const authQueue = new FakeBullQueue();
    const schedulerQueue = new FakeBullQueue();
    const service = new AppQueueService(
      systemQueue as never,
      authQueue as never,
      schedulerQueue as never,
      {
        getStateSnapshot() {
          return { status: "up" as const };
        },
      } as never,
      new FakeLogger() as never,
    );

    await service.enqueueValidationChainCommand({
      command: "resolve_market",
      propositionId: "prop_1",
      actorUserId: "system_1",
      reason: "validation_chain.runtime.official_result",
      requestedAt: new Date().toISOString(),
    });

    const firstJobId = String(schedulerQueue.addCalls[0]?.opts.jobId ?? "");
    assert.equal(firstJobId, "validation-chain:resolve_market:prop_1");

    const retainedJob = schedulerQueue.jobs.get(firstJobId);
    assert.equal(retainedJob?.removed, false);
    if (retainedJob) {
      retainedJob.state = "completed";
    }

    await service.enqueueValidationChainCommand({
      command: "resolve_market",
      propositionId: "prop_1",
      actorUserId: "operator_1",
      reason: "validation_chain.command_recovery.manual",
      note: "retry_after_completed_job",
      requestedAt: new Date().toISOString(),
    });

    assert.equal(schedulerQueue.addCalls.length, 2);
    assert.equal(retainedJob?.removed, true);
    assert.equal(String(schedulerQueue.addCalls[1]?.opts.jobId ?? ""), firstJobId);
  });

  it("keeps a waiting validation-chain command job as the active dedupe target", async () => {
    const systemQueue = new FakeBullQueue();
    const authQueue = new FakeBullQueue();
    const schedulerQueue = new FakeBullQueue();
    const service = new AppQueueService(
      systemQueue as never,
      authQueue as never,
      schedulerQueue as never,
      {
        getStateSnapshot() {
          return { status: "up" as const };
        },
      } as never,
      new FakeLogger() as never,
    );

    await service.enqueueValidationChainCommand({
      command: "freeze_market",
      propositionId: "prop_1",
      actorUserId: "system_1",
      reason: "validation_chain.runtime.prepare_reveal",
      requestedAt: new Date().toISOString(),
    });

    const jobId = String(schedulerQueue.addCalls[0]?.opts.jobId ?? "");
    const pendingJob = schedulerQueue.jobs.get(jobId);

    await service.enqueueValidationChainCommand({
      command: "freeze_market",
      propositionId: "prop_1",
      actorUserId: "operator_1",
      reason: "validation_chain.command_recovery.manual",
      note: "should_reuse_waiting_job",
      requestedAt: new Date().toISOString(),
    });

    assert.equal(schedulerQueue.addCalls.length, 2);
    assert.equal(pendingJob?.removed, false);
    assert.equal(String(schedulerQueue.addCalls[1]?.opts.jobId ?? ""), jobId);
  });

  it("allows re-enqueue after a completed validation-chain sync job is retained", async () => {
    const systemQueue = new FakeBullQueue();
    const authQueue = new FakeBullQueue();
    const schedulerQueue = new FakeBullQueue();
    const service = new AppQueueService(
      systemQueue as never,
      authQueue as never,
      schedulerQueue as never,
      {
        getStateSnapshot() {
          return { status: "up" as const };
        },
      } as never,
      new FakeLogger() as never,
    );

    await service.enqueueValidationChainSync();

    const syncJobId = String(schedulerQueue.addCalls[0]?.opts.jobId ?? "");
    assert.equal(syncJobId, "validation-chain:sync");

    const retainedJob = schedulerQueue.jobs.get(syncJobId);
    assert.equal(retainedJob?.removed, false);
    if (retainedJob) {
      retainedJob.state = "completed";
    }

    await service.enqueueValidationChainSync();

    assert.equal(schedulerQueue.addCalls.length, 2);
    assert.equal(retainedJob?.removed, true);
    assert.equal(String(schedulerQueue.addCalls[1]?.opts.jobId ?? ""), syncJobId);
  });

  it("keeps a waiting validation-chain sync job as the active dedupe target", async () => {
    const systemQueue = new FakeBullQueue();
    const authQueue = new FakeBullQueue();
    const schedulerQueue = new FakeBullQueue();
    const service = new AppQueueService(
      systemQueue as never,
      authQueue as never,
      schedulerQueue as never,
      {
        getStateSnapshot() {
          return { status: "up" as const };
        },
      } as never,
      new FakeLogger() as never,
    );

    await service.enqueueValidationChainSync();

    const syncJobId = String(schedulerQueue.addCalls[0]?.opts.jobId ?? "");
    const pendingJob = schedulerQueue.jobs.get(syncJobId);

    await service.enqueueValidationChainSync();

    assert.equal(schedulerQueue.addCalls.length, 2);
    assert.equal(pendingJob?.removed, false);
    assert.equal(String(schedulerQueue.addCalls[1]?.opts.jobId ?? ""), syncJobId);
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
      { next() { return "bet_1"; } } as never,
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

  it("exposes unsynced local bet backlog in validation-chain health snapshots", async () => {
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
      updatedAt: new Date("2026-04-24T00:59:45.000Z"),
    };

    const audit = new FakeAuditService();
    const prisma = new FakePrismaService(
      {
        findMany: async () => [] as Array<Record<string, unknown>>,
        findFirst: async () => null,
        count: async () => 0,
      },
      {
        findMany: async () => [] as Array<Record<string, unknown>>,
        findFirst: async () => null,
      },
      {
        count: async () => 0,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findFirst: async () => null,
        findMany: async () =>
          [
            {
              id: "bet_unsynced_1",
              marketId: "market_1",
              propositionId: "prop_1",
              userId: "bettor_1",
              status: "placed",
              stakeAmount: "25",
              placedAt: new Date("2026-04-24T00:20:00.000Z"),
              chainSyncedAt: null,
              market: {
                chainMarketId: "chain_market_1",
                chainStatus: "live",
              },
            },
            {
              id: "bet_unsynced_2",
              marketId: "market_2",
              propositionId: "prop_2",
              userId: "bettor_2",
              status: "placed",
              stakeAmount: "40",
              placedAt: new Date("2026-04-24T00:30:00.000Z"),
              chainSyncedAt: null,
              market: {
                chainMarketId: "chain_market_2",
                chainStatus: "frozen",
              },
            },
          ] as Array<Record<string, unknown>>,
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

    assert.equal(snapshot.metrics.unsyncedBetBacklogCount, 2);
    assert.equal(snapshot.projection.unsyncedBetBacklog.length, 2);
    assert.deepEqual(
      snapshot.projection.unsyncedBetBacklog.map((item) => item.betId),
      ["bet_unsynced_1", "bet_unsynced_2"],
    );
    assert.equal(snapshot.projection.unsyncedBetBacklog[0]?.chainMarketId, "chain_market_1");
    assert.equal(snapshot.projection.unsyncedBetBacklog[0]?.oldestUnsyncedAgeMs, 40 * 60 * 1000);
    assert.equal(snapshot.projection.unsyncedBetBacklog[1]?.oldestUnsyncedAgeMs, 30 * 60 * 1000);
  });

  it("raises an alert when unsynced local bet backlog remains stale", async () => {
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
      updatedAt: new Date("2026-04-24T00:59:45.000Z"),
    };

    const audit = new FakeAuditService();
    const prisma = new FakePrismaService(
      {
        findMany: async () => [] as Array<Record<string, unknown>>,
        findFirst: async () => null,
        count: async () => 0,
      },
      {
        findMany: async () => [] as Array<Record<string, unknown>>,
        findFirst: async () => null,
      },
      {
        count: async () => 0,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findFirst: async () => null,
        findMany: async () =>
          [
            {
              id: "bet_unsynced_old",
              marketId: "market_1",
              propositionId: "prop_1",
              userId: "bettor_1",
              status: "placed",
              stakeAmount: "25",
              placedAt: new Date("2026-04-24T00:20:00.000Z"),
              chainSyncedAt: null,
              market: {
                chainMarketId: "chain_market_1",
                chainStatus: "live",
              },
            },
          ] as Array<Record<string, unknown>>,
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

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");

    assert.equal(
      audit.records.some(
        (record) =>
          record.action === "validation_chain.alert.unsynced_bet_backlog",
      ),
      true,
    );
  });

  it("reconciles a local validation bet against on-chain position data with audit context", async () => {
    const contract = new FakeValidationChainContractReadService();
    contract.position = {
      selectedOption: 1,
      stakeAmount: {
        toString: () => "40",
      },
      claimed: false,
      claimableAmount: {
        toString: () => "0",
      },
    };
    contract.claimable = "0";
    const audit = new FakeAuditService();
    const service = new ValidationChainBetReconciliationService(
      {
        async findByMarketAndUser() {
          return {
            id: "bet_1",
            marketId: "market_1",
            propositionId: "prop_1",
            userId: "0x00000000000000000000000000000000000000aa",
            selectedOption: 1,
            stakeAmount: "40",
            status: "placed",
            claimed: false,
            chainSyncedAt: null,
            placedAt: new Date("2026-04-24T00:20:00.000Z"),
          };
        },
      } as never,
      {
        async findById() {
          return {
            id: "market_1",
            propositionId: "prop_1",
            chainMarketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
            chainStatus: "live",
          };
        },
      } as never,
      contract as never,
      audit as never,
    );

    const result = await service.reconcileBet({
      marketId: "market_1",
      userId: "0x00000000000000000000000000000000000000aa",
      actorUserId: "operator_1",
      reason: "validation_chain.reconcile.manual",
      note: "backlog_investigation",
    });

    assert.equal(result.betId, "bet_1");
    assert.equal(result.marketId, "market_1");
    assert.equal(result.localBet.selectedOption, 1);
    assert.equal(result.onChainPosition.stakeAmount, "40");
    assert.equal(result.comparison.positionExists, true);
    assert.equal(result.comparison.optionMatches, true);
    assert.equal(result.comparison.amountMatches, true);
    assert.equal(result.comparison.claimableAmount, "0");
    assert.equal(audit.records.length, 1);
    assert.equal(audit.records[0]?.action, "validation_chain.bet_reconciliation.performed");
  });

  it("reconciles unsynced validation bet backlog in batches and continues past failed items", async () => {
    const chainMarketId = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const matchedUser = "0x00000000000000000000000000000000000000aa";
    const mismatchedUser = "0x00000000000000000000000000000000000000bb";
    const invalidUser = "not_a_wallet_address";
    const contract = new FakeValidationChainContractReadService();
    contract.positionsByKey.set(`${chainMarketId}:${matchedUser}`, {
      selectedOption: 1,
      stakeAmount: {
        toString: () => "40",
      },
      claimed: false,
      claimableAmount: {
        toString: () => "0",
      },
    });
    contract.positionsByKey.set(`${chainMarketId}:${mismatchedUser}`, {
      selectedOption: 0,
      stakeAmount: {
        toString: () => "15",
      },
      claimed: false,
      claimableAmount: {
        toString: () => "3",
      },
    });
    contract.claimablesByKey.set(`${chainMarketId}:${matchedUser}`, "0");
    contract.claimablesByKey.set(`${chainMarketId}:${mismatchedUser}`, "3");

    const betsByKey = new Map([
      [
        `market_1:${matchedUser}`,
        {
          id: "bet_1",
          marketId: "market_1",
          propositionId: "prop_1",
          userId: matchedUser,
          selectedOption: 1,
          stakeAmount: "40",
          status: "placed",
          claimed: false,
          chainSyncedAt: null,
          placedAt: new Date("2026-04-24T00:20:00.000Z"),
        },
      ],
      [
        `market_1:${mismatchedUser}`,
        {
          id: "bet_2",
          marketId: "market_1",
          propositionId: "prop_1",
          userId: mismatchedUser,
          selectedOption: 1,
          stakeAmount: "25",
          status: "placed",
          claimed: false,
          chainSyncedAt: null,
          placedAt: new Date("2026-04-24T00:21:00.000Z"),
        },
      ],
    ]);

    const audit = new FakeAuditService();
    const service = new ValidationChainBetReconciliationService(
      {
        async findByMarketAndUser(marketId: string, userId: string) {
          return betsByKey.get(`${marketId}:${userId}`) ?? null;
        },
        async listUnsyncedProjectedBacklog(limit: number) {
          assert.equal(limit, 3);
          return [
            {
              id: "bet_1",
              marketId: "market_1",
              propositionId: "prop_1",
              userId: matchedUser,
              selectedOption: 1,
              stakeAmount: "40",
              status: "placed",
              claimed: false,
              chainSyncedAt: null,
              placedAt: new Date("2026-04-24T00:20:00.000Z"),
              market: {
                chainMarketId,
                chainStatus: "live",
              },
            },
            {
              id: "bet_2",
              marketId: "market_1",
              propositionId: "prop_1",
              userId: mismatchedUser,
              selectedOption: 1,
              stakeAmount: "25",
              status: "placed",
              claimed: false,
              chainSyncedAt: null,
              placedAt: new Date("2026-04-24T00:21:00.000Z"),
              market: {
                chainMarketId,
                chainStatus: "live",
              },
            },
            {
              id: "bet_3",
              marketId: "market_2",
              propositionId: "prop_2",
              userId: invalidUser,
              selectedOption: 0,
              stakeAmount: "10",
              status: "placed",
              claimed: false,
              chainSyncedAt: null,
              placedAt: new Date("2026-04-24T00:22:00.000Z"),
              market: {
                chainMarketId,
                chainStatus: "frozen",
              },
            },
          ];
        },
      } as never,
      {
        async findById(marketId: string) {
          return {
            id: marketId,
            propositionId: marketId === "market_1" ? "prop_1" : "prop_2",
            chainMarketId,
            chainStatus: marketId === "market_1" ? "live" : "frozen",
          };
        },
      } as never,
      contract as never,
      audit as never,
    );

    const result = await (service as any).reconcileUnsyncedBets({
      actorUserId: "operator_1",
      reason: "validation_chain.reconcile.batch",
      note: "backlog_triage",
      limit: 3,
    });

    assert.equal(result.processedCount, 3);
    assert.equal(result.matchedCount, 1);
    assert.equal(result.mismatchedCount, 1);
    assert.equal(result.failedCount, 1);
    assert.deepEqual(
      result.items.map((item: { status: string }) => item.status),
      ["matched", "mismatched", "failed"],
    );
    assert.equal(result.items[0]?.reconciliation?.comparison.amountMatches, true);
    assert.equal(result.items[1]?.reconciliation?.comparison.amountMatches, false);
    assert.equal(
      result.items[2]?.errorCode,
      "validation_chain.reconcile.unexpected_error",
    );
    assert.deepEqual(
      audit.records.map((record) => record.action),
      [
        "validation_chain.bet_reconciliation.performed",
        "validation_chain.bet_reconciliation.performed",
        "validation_chain.bet_reconciliation.batch.performed",
      ],
    );
  });

  it("replays persisted validation-chain market events to rebuild local projection state with audit trail", async () => {
    const audit = new FakeAuditService();
    const replayEvents = [
      {
        id: "event_1",
        chainId: 1337,
        contractAddress: "0x0000000000000000000000000000000000000002",
        blockNumber: 10,
        blockHash: "0x10",
        transactionHash: "0x20",
        transactionIndex: 0,
        logIndex: 0,
        eventName: "MarketCreated",
        marketChainId:
          "0x00000000000000000000000000000000000000000000000000000000000000f1",
        propositionChainId:
          "0x00000000000000000000000000000000000000000000000000000000000000e1",
        payloadJson: {
          marketId:
            "0x00000000000000000000000000000000000000000000000000000000000000f1",
          propositionId:
            "0x00000000000000000000000000000000000000000000000000000000000000e1",
          minStake: "10",
          operator: "0x00000000000000000000000000000000000000a1",
          blockTimestamp: 1_700_000_010,
        },
        processedAt: new Date("2026-04-24T00:10:00.000Z"),
      },
      {
        id: "event_2",
        chainId: 1337,
        contractAddress: "0x0000000000000000000000000000000000000002",
        blockNumber: 11,
        blockHash: "0x11",
        transactionHash: "0x21",
        transactionIndex: 0,
        logIndex: 0,
        eventName: "MarketOpened",
        marketChainId:
          "0x00000000000000000000000000000000000000000000000000000000000000f1",
        propositionChainId: null,
        payloadJson: {
          marketId:
            "0x00000000000000000000000000000000000000000000000000000000000000f1",
          openedAt: 1_700_000_020,
          operator: "0x00000000000000000000000000000000000000a1",
          blockTimestamp: 1_700_000_020,
        },
        processedAt: new Date("2026-04-24T00:11:00.000Z"),
      },
      {
        id: "event_3",
        chainId: 1337,
        contractAddress: "0x0000000000000000000000000000000000000002",
        blockNumber: 12,
        blockHash: "0x12",
        transactionHash: "0x22",
        transactionIndex: 0,
        logIndex: 0,
        eventName: "BetPlaced",
        marketChainId:
          "0x00000000000000000000000000000000000000000000000000000000000000f1",
        propositionChainId:
          "0x00000000000000000000000000000000000000000000000000000000000000e1",
        payloadJson: {
          marketId:
            "0x00000000000000000000000000000000000000000000000000000000000000f1",
          propositionId:
            "0x00000000000000000000000000000000000000000000000000000000000000e1",
          user: "0x00000000000000000000000000000000000000aa",
          selectedOption: 1,
          amount: "40",
          blockTimestamp: 1_700_000_030,
        },
        processedAt: new Date("2026-04-24T00:12:00.000Z"),
      },
      {
        id: "event_4",
        chainId: 1337,
        contractAddress: "0x0000000000000000000000000000000000000002",
        blockNumber: 13,
        blockHash: "0x13",
        transactionHash: "0x23",
        transactionIndex: 0,
        logIndex: 0,
        eventName: "MarketResolved",
        marketChainId:
          "0x00000000000000000000000000000000000000000000000000000000000000f1",
        propositionChainId:
          "0x00000000000000000000000000000000000000000000000000000000000000e1",
        payloadJson: {
          marketId:
            "0x00000000000000000000000000000000000000000000000000000000000000f1",
          propositionId:
            "0x00000000000000000000000000000000000000000000000000000000000000e1",
          resultKind: "resolved",
          winningOption: 1,
          voidReason: null,
          resolvedAt: 1_700_000_040,
          oracle: "0x00000000000000000000000000000000000000b1",
          blockTimestamp: 1_700_000_040,
        },
        processedAt: new Date("2026-04-24T00:13:00.000Z"),
      },
      {
        id: "event_5",
        chainId: 1337,
        contractAddress: "0x0000000000000000000000000000000000000002",
        blockNumber: 14,
        blockHash: "0x14",
        transactionHash: "0x24",
        transactionIndex: 0,
        logIndex: 0,
        eventName: "Claimed",
        marketChainId:
          "0x00000000000000000000000000000000000000000000000000000000000000f1",
        propositionChainId:
          "0x00000000000000000000000000000000000000000000000000000000000000e1",
        payloadJson: {
          marketId:
            "0x00000000000000000000000000000000000000000000000000000000000000f1",
          propositionId:
            "0x00000000000000000000000000000000000000000000000000000000000000e1",
          user: "0x00000000000000000000000000000000000000aa",
          amount: "40",
          blockTimestamp: 1_700_000_050,
        },
        processedAt: new Date("2026-04-24T00:14:00.000Z"),
      },
    ];

    const marketState = {
      id: "market_1",
      propositionId: "prop_1",
      chainMarketId:
        "0x00000000000000000000000000000000000000000000000000000000000000f1",
      chainPropositionId:
        "0x00000000000000000000000000000000000000000000000000000000000000e1",
      chainStatus: "cancelled",
      chainOpenedAt: null,
      chainFrozenAt: null,
      chainResolvedAt: null,
      chainCancelledAt: new Date("2026-04-23T23:59:00.000Z"),
      chainResultKind: null,
      chainWinningOption: null,
      chainVoidReason: null,
      resolutionTxHash: null,
      cancelTxHash: "0xstale",
      chainSyncedAt: new Date("2026-04-23T23:59:00.000Z"),
    };
    const betState = {
      id: "bet_1",
      marketId: "market_1",
      propositionId: "prop_1",
      userId: "0x00000000000000000000000000000000000000aa",
      selectedOption: 1,
      stakeAmount: "40",
      status: "settled",
      claimed: true,
      settledAt: new Date("2026-04-23T23:59:00.000Z"),
      settlementOutcome: "refund",
      grossPayout: "40",
      pnl: "0",
      refundAmount: "40",
      claimedAt: null,
      claimTxHash: null,
      refundedAt: new Date("2026-04-23T23:59:00.000Z"),
      refundTxHash: "0xstale_refund",
      chainSyncedAt: new Date("2026-04-23T23:59:00.000Z"),
    };

    const service = new ValidationChainProjectionReplayService(
      {
        async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
          return callback(this);
        },
      } as never,
      {
        async findById() {
          return {
            ...marketState,
          };
        },
        async update(_marketId: string, data: Record<string, unknown>) {
          Object.assign(marketState, data);
          return {
            ...marketState,
          };
        },
      } as never,
      {
        async listByMarketId() {
          return [
            {
              ...betState,
            },
          ];
        },
        async update(_betId: string, data: Record<string, unknown>) {
          Object.assign(betState, data);
          return {
            ...betState,
          };
        },
        async findByMarketAndUser() {
          return {
            ...betState,
          };
        },
      } as never,
      {
        async findById() {
          return {
            id: "prop_1",
            status: "settled",
            settledAt: null,
          };
        },
      } as never,
      {
        async listByChainReferences() {
          return replayEvents;
        },
      } as never,
      new ValidationChainProjectionService(
        {
          async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
            return callback(this);
          },
        } as never,
        {
          async findByChainMarketId() {
            return {
              ...marketState,
            };
          },
          async findByChainPropositionId() {
            return {
              ...marketState,
            };
          },
          async update(_marketId: string, data: Record<string, unknown>) {
            Object.assign(marketState, data);
            return {
              ...marketState,
            };
          },
        } as never,
        {
          async findByMarketAndUser() {
            return {
              ...betState,
            };
          },
          async create() {
            return {
              ...betState,
            };
          },
          async listByMarketId() {
            return [
              {
                ...betState,
              },
            ];
          },
          async update(_betId: string, data: Record<string, unknown>) {
            Object.assign(betState, data);
            return {
              ...betState,
            };
          },
        } as never,
        { next() { return "bet_1"; } } as never,
        audit as never,
      ) as never,
      audit as never,
    );

    const replay = await service.replayMarketProjection({
      marketId: "market_1",
      actorUserId: "operator_1",
      reason: "validation_chain.replay.manual",
      note: "repair_projection",
    });

    assert.equal(replay.marketId, "market_1");
    assert.equal(replay.replayedEventCount, 5);
    assert.equal(replay.propositionStatus, "settled");
    assert.equal(replay.propositionSettledAt, null);
    assert.equal(replay.finalMarketProjection.chainStatus, "resolved");
    assert.equal(replay.finalMarketProjection.cancelTxHash, null);
    assert.equal(replay.finalBetProjections[0]?.status, "settled");
    assert.equal(replay.finalBetProjections[0]?.settlementOutcome, "won");
    assert.equal(replay.finalBetProjections[0]?.grossPayout, "40");
    assert.equal(replay.finalBetProjections[0]?.refundTxHash, null);
    assert.equal(replay.finalBetProjections[0]?.claimTxHash, "0x24");
    assert.equal(audit.records[audit.records.length - 1]?.action, "validation_chain.projection_replay.performed");
  });
  it("queues create and open recovery for a live proposition whose chain market is missing", async () => {
    const { service, runtime, audit } = createCommandRecoveryService({
      proposition: {
        id: "prop_1",
        status: "live",
        marketEnabled: true,
        resultKind: null,
        winningOption: null,
        voidReason: null,
        resultComputedAt: null,
      },
      market: {
        id: "market_1",
        propositionId: "prop_1",
        status: "live",
        chainMarketId: null,
        chainPropositionId: null,
        chainStatus: null,
      },
      onChainState: null,
    });

    const result = await service.recoverQueuedCommands({
      propositionId: "prop_1",
      actorUserId: "operator_1",
      reason: "validation_chain.command_recovery.manual",
      note: "market_missing",
    });

    assert.deepEqual(result.plannedCommands, ["create_market", "open_market"]);
    assert.equal(result.recoveryReason, "create_open_missing_market");
    assert.equal(result.onChainState, null);
    assert.equal(result.driftReason, "chain_market_not_created");
    assert.equal(runtime.createOpenCalls.length, 1);
    assert.equal(runtime.freezeCalls.length, 0);
    assert.equal(runtime.resolveCalls.length, 0);
    assert.equal(
      audit.records[audit.records.length - 1]?.action,
      "validation_chain.command_recovery.queued",
    );
  });

  it("queues freeze and resolve recovery for a revealing proposition whose chain market is still live", async () => {
    const { service, runtime } = createCommandRecoveryService({
      proposition: {
        id: "prop_1",
        status: "revealing",
        marketEnabled: true,
        resultKind: "resolved",
        winningOption: 0,
        voidReason: null,
        resultComputedAt: new Date("2026-04-24T00:10:00.000Z"),
      },
      market: {
        id: "market_1",
        propositionId: "prop_1",
        status: "frozen_for_reveal",
        chainMarketId: "chain_market_1",
        chainPropositionId: "chain_prop_1",
        chainStatus: "live",
      },
      onChainState: ValidationContractMarketState.Live,
    });

    const result = await service.recoverQueuedCommands({
      propositionId: "prop_1",
      actorUserId: "operator_1",
      reason: "validation_chain.command_recovery.manual",
      note: "stuck_live_chain_market",
    });

    assert.deepEqual(result.plannedCommands, ["freeze_market", "resolve_market"]);
    assert.equal(result.recoveryReason, "freeze_resolve_live_market");
    assert.equal(result.onChainState, "live");
    assert.equal(runtime.createOpenCalls.length, 0);
    assert.equal(runtime.freezeCalls.length, 1);
    assert.equal(runtime.resolveCalls.length, 1);
  });

  it("queues resolve-only recovery for a settled proposition whose chain market is already frozen", async () => {
    const { service, runtime } = createCommandRecoveryService({
      proposition: {
        id: "prop_1",
        status: "settled",
        marketEnabled: true,
        resultKind: "resolved",
        winningOption: 1,
        voidReason: null,
        resultComputedAt: new Date("2026-04-24T00:10:00.000Z"),
      },
      market: {
        id: "market_1",
        propositionId: "prop_1",
        status: "settled",
        chainMarketId: "chain_market_1",
        chainPropositionId: "chain_prop_1",
        chainStatus: "frozen",
      },
      onChainState: ValidationContractMarketState.Frozen,
    });

    const result = await service.recoverQueuedCommands({
      propositionId: "prop_1",
      actorUserId: "operator_1",
      reason: "validation_chain.command_recovery.manual",
      note: "settled_chain_market_not_resolved",
    });

    assert.deepEqual(result.plannedCommands, ["resolve_market"]);
    assert.equal(result.recoveryReason, "resolve_settled_market");
    assert.equal(result.onChainState, "frozen");
    assert.equal(result.driftReason, "chain_market_not_resolved");
    assert.equal(runtime.createOpenCalls.length, 0);
    assert.equal(runtime.freezeCalls.length, 0);
    assert.equal(runtime.resolveCalls.length, 1);
  });

  it("refuses unsafe auto-recovery when a frozen proposition still has a pre-live chain market", async () => {
    const { service, runtime } = createCommandRecoveryService({
      proposition: {
        id: "prop_1",
        status: "frozen",
        marketEnabled: true,
        resultKind: null,
        winningOption: null,
        voidReason: null,
        resultComputedAt: null,
      },
      market: {
        id: "market_1",
        propositionId: "prop_1",
        status: "frozen_for_reveal",
        chainMarketId: "chain_market_1",
        chainPropositionId: "chain_prop_1",
        chainStatus: "pre_live",
      },
      onChainState: ValidationContractMarketState.PreLive,
    });

    await assert.rejects(
      () =>
        service.recoverQueuedCommands({
          propositionId: "prop_1",
          actorUserId: "operator_1",
          reason: "validation_chain.command_recovery.manual",
          note: "unsafe_reopen",
        }),
      /cannot safely recover/i,
    );

    assert.equal(runtime.createOpenCalls.length, 0);
    assert.equal(runtime.freezeCalls.length, 0);
    assert.equal(runtime.resolveCalls.length, 0);
  });

  it("rejects command recovery without an explicit actor", async () => {
    const { service } = createCommandRecoveryService({
      onChainState: null,
    });

    await assert.rejects(
      () =>
        service.recoverQueuedCommands({
          propositionId: "prop_1",
          actorUserId: null,
          reason: "validation_chain.command_recovery.manual",
        }),
      /requires an explicit actor/i,
    );
  });

  it("reports degraded validation-chain runtime readiness when signer env is incomplete or dependencies fail", async () => {
    const monitoring = new InternalMonitoringService(
      {
        async assertReady() {
          return undefined;
        },
      } as never,
      {
        validationEnvironment: "staging",
        chainId: 8453,
        rpcUrl: "https://rpc.example",
        arenaContractAddress: "0x0000000000000000000000000000000000000001",
        validationContractAddress: "0x0000000000000000000000000000000000000002",
        validationOperatorPrivateKey: "",
        validationOraclePrivateKey: "",
        validationPauserPrivateKey: "",
      } as never,
      {
        async assertReady() {
          throw new Error("rpc timeout");
        },
      } as never,
      {
        async ping() {
          throw new Error("redis timeout");
        },
      } as never,
      {
        getLiveSnapshot() {
          return {
            status: "ok",
            timestamp: "2026-04-24T00:36:00.000Z",
          };
        },
        async getReadinessSnapshot() {
          return {
            status: "degraded",
            timestamp: "2026-04-24T00:36:00.000Z",
            dependencies: [
              { name: "database", status: "up" },
              { name: "redis", status: "down", details: "redis timeout" },
              { name: "rpc", status: "down", details: "rpc timeout" },
              { name: "scheduler_queue", status: "up" },
            ],
          };
        },
      } as never,
      {
        async getQueueOverview() {
          return {
            status: "ok",
            timestamp: "2026-04-24T00:36:00.000Z",
            redis: { status: "up" },
            queues: [
              {
                name: "scheduler",
                status: "up",
                policy: {
                  retryable: true,
                  attempts: 5,
                  backoffType: "exponential",
                  backoffDelayMs: 1000,
                },
                paused: false,
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
      new FakeValidationChainContractService() as never,
      undefined,
    );

    const snapshot = await monitoring.getValidationChainRuntimeReadiness();

    assert.equal(snapshot.status, "degraded");
    assert.equal(snapshot.validationEnvironment, "staging");
    assert.equal(snapshot.dependencies.find((item) => item.name === "env")?.status, "down");
    assert.equal(snapshot.dependencies.find((item) => item.name === "redis")?.status, "down");
    assert.equal(snapshot.dependencies.find((item) => item.name === "rpc")?.status, "down");
    assert.equal(
      snapshot.dependencies.find((item) => item.name === "validation_contract")?.status,
      "up",
    );
    assert.equal(snapshot.requiredEnvKeys.includes("ARENA_VALIDATION_OPERATOR_PRIVATE_KEY"), true);
    assert.equal(snapshot.preflightCommands.includes("pnpm run validation:chain:check"), true);
    assert.equal(snapshot.runbookPath, "docs/contracts/arena-validation-chain-runbook.md");
    assert.equal(snapshot.operatorActions.some((item) => item.dependency === "env"), true);
    assert.equal(snapshot.operatorActions.some((item) => item.dependency === "rpc"), true);
  });

  it("surfaces bootstrap-first local runtime guidance when the validation environment is local", async () => {
    const monitoring = new InternalMonitoringService(
      {
        async assertReady() {
          throw new Error("database offline");
        },
      } as never,
      {
        validationEnvironment: "local",
        chainId: 1337,
        rpcUrl: "http://127.0.0.1:8545",
        arenaContractAddress: "0x0000000000000000000000000000000000000001",
        validationContractAddress: "0x0000000000000000000000000000000000000002",
        validationOperatorPrivateKey: "",
        validationOraclePrivateKey: "",
        validationPauserPrivateKey: "",
        nodeEnv: "development",
        port: 4000,
      } as never,
      {
        async assertReady() {
          throw new Error("rpc offline");
        },
      } as never,
      {
        async ping() {
          throw new Error("redis offline");
        },
      } as never,
      {
        getLiveSnapshot() {
          return {
            status: "ok",
            timestamp: "2026-05-27T00:36:00.000Z",
          };
        },
        async getReadinessSnapshot() {
          return {
            status: "degraded",
            timestamp: "2026-05-27T00:36:00.000Z",
            dependencies: [
              { name: "database", status: "down", details: "database offline" },
              { name: "redis", status: "down", details: "redis offline" },
              { name: "rpc", status: "down", details: "rpc offline" },
              { name: "scheduler_queue", status: "up" },
            ],
          };
        },
      } as never,
      {
        async getQueueOverview() {
          return {
            status: "ok",
            timestamp: "2026-05-27T00:36:00.000Z",
            redis: { status: "up" },
            queues: [
              {
                name: "scheduler",
                status: "up",
                policy: {
                  retryable: true,
                  attempts: 5,
                  backoffType: "exponential",
                  backoffDelayMs: 1000,
                },
                paused: false,
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
      new FakeValidationChainContractService({
        hasRuntimeCode: false,
        signerIssues: {
          operator: {
            hasBalance: false,
            hasRequiredRole: false,
          },
        },
      }) as never,
      undefined,
    );

    const snapshot = await monitoring.getRuntimeContract();
    const envAction = snapshot.validationChain.operatorActions.find(
      (item) => item.dependency === "env",
    );
    const databaseAction = snapshot.validationChain.operatorActions.find(
      (item) => item.dependency === "database",
    );
    const redisAction = snapshot.validationChain.operatorActions.find(
      (item) => item.dependency === "redis",
    );
    const rpcAction = snapshot.validationChain.operatorActions.find(
      (item) => item.dependency === "rpc",
    );
    const contractCodeAction = snapshot.validationChain.operatorActions.find(
      (item) => item.dependency === "validation_contract_code",
    );
    const operatorSignerAction = snapshot.validationChain.operatorActions.find(
      (item) => item.dependency === "validation_operator_signer",
    );
    const envGate = snapshot.releaseChecklist.find((item) => item.id === "env");
    const validationGate = snapshot.releaseChecklist.find(
      (item) => item.id === "validation-runtime",
    );

    assert.equal(snapshot.validationChain.validationEnvironment, "local");
    assert.deepEqual(snapshot.validationChain.preflightCommands, [
      "pnpm run validation:prepare:local",
      "pnpm run validation:preflight",
      "pnpm run validation:db:deploy",
      "pnpm run validation:db:status",
    ]);
    assert.deepEqual(envAction?.commands, [
      "pnpm run validation:prepare:local",
      "pnpm run validation:env:check",
    ]);
    assert.equal(
      databaseAction?.commands.includes("pnpm run validation:prepare:local"),
      true,
    );
    assert.equal(
      redisAction?.commands.includes("pnpm run validation:prepare:local"),
      true,
    );
    assert.equal(
      databaseAction?.summary.includes("Docker Desktop"),
      true,
    );
    assert.equal(
      redisAction?.summary.includes("Docker Desktop"),
      true,
    );
    assert.equal(
      rpcAction?.commands.includes("pnpm run validation:prepare:local"),
      true,
    );
    assert.equal(
      contractCodeAction?.commands.includes(
        "pnpm run validation:deploy -- --network localhost",
      ),
      true,
    );
    assert.equal(
      operatorSignerAction?.commands.includes(
        "pnpm run validation:deploy -- --network localhost",
      ),
      true,
    );
    assert.equal(
      snapshot.validationRehearsal.steps[0]?.commands.includes(
        "pnpm run validation:prepare:local",
      ),
      true,
    );
    assert.equal(
      snapshot.validationRehearsal.steps[0]?.commands.includes(
        "pnpm run validation:preflight",
      ),
      true,
    );
    assert.equal(
      envGate?.commands.includes("pnpm run validation:prepare:local"),
      true,
    );
    assert.equal(
      validationGate?.commands.includes("pnpm run validation:deploy -- --network localhost"),
      true,
    );
  });

  it("reports deployment-level validation-chain readiness failures for bytecode drift and signer role gaps", async () => {
    const monitoring = new InternalMonitoringService(
      {
        async assertReady() {
          return undefined;
        },
      } as never,
      {
        validationEnvironment: "staging",
        chainId: 8453,
        rpcUrl: "https://rpc.example",
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
            timestamp: "2026-04-24T00:36:00.000Z",
          };
        },
        async getReadinessSnapshot() {
          return {
            status: "ok",
            timestamp: "2026-04-24T00:36:00.000Z",
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
            timestamp: "2026-04-24T00:36:00.000Z",
            redis: { status: "up" },
            queues: [
              {
                name: "scheduler",
                status: "up",
                policy: {
                  retryable: true,
                  attempts: 5,
                  backoffType: "exponential",
                  backoffDelayMs: 1000,
                },
                paused: false,
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
      new FakeValidationChainContractService({
        runtimeBytecodeMatchesArtifact: false,
        signerIssues: {
          operator: {
            hasRequiredRole: false,
          },
          pauser: {
            hasBalance: false,
          },
        },
      }) as never,
      undefined,
    );

    const snapshot = await monitoring.getValidationChainRuntimeReadiness();

    assert.equal(snapshot.status, "degraded");
    assert.equal(
      snapshot.dependencies.find((item) => item.name === "validation_contract_code")?.status,
      "up",
    );
    assert.equal(
      snapshot.dependencies.find((item) => item.name === "validation_contract_bytecode")?.status,
      "down",
    );
    assert.equal(
      snapshot.dependencies.find((item) => item.name === "validation_operator_signer")?.status,
      "down",
    );
    assert.equal(
      snapshot.dependencies.find((item) => item.name === "validation_pauser_signer")?.status,
      "down",
    );
    assert.equal(
      snapshot.dependencies.find((item) => item.name === "validation_oracle_signer")?.status,
      "up",
    );
    assert.equal(
      snapshot.operatorActions.find((item) => item.dependency === "validation_contract_bytecode")
        ?.commands.includes("pnpm run validation:deploy -- --network <network>"),
      true,
    );
    assert.equal(
      snapshot.operatorActions.find((item) => item.dependency === "validation_pauser_signer")
        ?.envKeys.includes("ARENA_VALIDATION_PAUSER_PRIVATE_KEY"),
      true,
    );
  });

  it("builds a validation rehearsal contract for environment-backed operator verification", async () => {
    const monitoring = new InternalMonitoringService(
      {
        async assertReady() {
          return undefined;
        },
      } as never,
      {
        validationEnvironment: "staging",
        chainId: 8453,
        rpcUrl: "https://rpc.example",
        arenaContractAddress: "0x0000000000000000000000000000000000000001",
        validationContractAddress: "0x0000000000000000000000000000000000000002",
        validationOperatorPrivateKey:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        validationOraclePrivateKey:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        validationPauserPrivateKey:
          "0x3333333333333333333333333333333333333333333333333333333333333333",
        nodeEnv: "production",
        port: 4000,
      } as never,
      {
        async assertReady() {
          throw new Error("rpc timeout");
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
            timestamp: "2026-05-24T00:36:00.000Z",
          };
        },
        async getReadinessSnapshot() {
          return {
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
          };
        },
      } as never,
      {
        async getQueueOverview() {
          return {
            status: "degraded",
            timestamp: "2026-05-24T00:36:00.000Z",
            redis: { status: "up" },
            queues: [
              {
                name: "scheduler",
                status: "down",
                details: "scheduler queue worker is disconnected",
                policy: {
                  retryable: true,
                  attempts: 5,
                  backoffType: "exponential",
                  backoffDelayMs: 1000,
                },
                paused: false,
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
      new FakeValidationChainContractService() as never,
      undefined,
    );

    const snapshot = await monitoring.getRuntimeContract();

    assert.equal(snapshot.validationRehearsal.status, "blocked");
    assert.equal(
      snapshot.validationRehearsal.targetOutcome.includes(
        "publish -> local bet -> on-chain placeBet -> manual or scheduled sync -> projection -> settlement",
      ),
      true,
    );
    assert.deepEqual(
      snapshot.validationRehearsal.steps.map((step) => step.id),
      [
        "preflight",
        "publish_and_open",
        "local_bet_and_sync",
        "freeze_and_resolve",
        "projection_and_settlement",
      ],
    );
    assert.equal(
      snapshot.validationRehearsal.blockingDependencies.includes("scheduler_queue"),
      true,
    );
    assert.equal(
      snapshot.validationRehearsal.blockingDependencies.includes("rpc"),
      true,
    );
    assert.equal(
      snapshot.validationRehearsal.steps[0]?.commands.includes(
        "GET /arena/internal/monitoring/runtime-contract",
      ),
      true,
    );
    assert.equal(
      snapshot.validationRehearsal.steps[2]?.commands.includes(
        "POST /arena/internal/validation-chain/sync",
      ),
      true,
    );
    assert.equal(
      snapshot.validationRehearsal.steps[3]?.evidence.includes(
        "GET /arena/internal/monitoring/validation-lifecycle-drift",
      ),
      true,
    );
    assert.equal(
      snapshot.validationRehearsal.steps[4]?.commands.includes(
        "POST /arena/internal/validation-chain/markets/:marketId/replay-projection",
      ),
      true,
    );
    assert.equal(snapshot.releaseReadiness.status, "blocked");
    assert.equal(snapshot.releaseReadiness.totalGateCount >= 4, true);
    assert.equal(snapshot.releaseReadiness.completedGateCount < snapshot.releaseReadiness.totalGateCount, true);
    assert.equal(
      snapshot.releaseReadiness.blockingDependencies.includes("scheduler_queue"),
      true,
    );
    const readinessGate = snapshot.releaseChecklist.find((item) => item.id === "readiness");
    assert.equal(readinessGate?.status, "blocked");
    assert.equal(readinessGate?.blockingDependencies.includes("scheduler_queue"), true);
    assert.equal(readinessGate?.blockingDependencies.includes("rpc"), false);
    const validationGate = snapshot.releaseChecklist.find(
      (item) => item.id === "validation-runtime",
    );
    assert.equal(validationGate?.status, "blocked");
    assert.equal(validationGate?.blockingDependencies.includes("rpc"), true);
  });
});
