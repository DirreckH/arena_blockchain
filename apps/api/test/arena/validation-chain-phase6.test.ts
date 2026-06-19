import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ValidationChainCursor, ValidationChainEvent } from "@prisma/client";

import {
  ArenaConflictError,
} from "../../src/arena/arena.errors";
import type {
  ValidationChainCommandSubmissionViewModel,
  ValidationChainMonitoringViewModel,
} from "../../src/arena/internal-ops.types";
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
  nextCreateOpenResult:
    | ValidationChainCommandSubmissionViewModel[]
    | null = null;
  nextFreezeResult: ValidationChainCommandSubmissionViewModel | null = null;
  nextResolveResult: ValidationChainCommandSubmissionViewModel | null = null;

  async enqueueCreateOpenCommands(
    input: Record<string, unknown>,
  ): Promise<ValidationChainCommandSubmissionViewModel[]> {
    this.createOpenCalls.push(input);
    return (
      this.nextCreateOpenResult ?? [
        {
          command: "create_market",
          status: "enqueued",
          queueJobId: "validation-chain.create_market.prop_1",
          delayMs: 0,
          errorMessage: null,
        },
        {
          command: "open_market",
          status: "enqueued",
          queueJobId: "validation-chain.open_market.prop_1",
          delayMs: 5000,
          errorMessage: null,
        },
      ]
    );
  }

  async enqueueFreezeCommand(
    input: Record<string, unknown>,
  ): Promise<ValidationChainCommandSubmissionViewModel> {
    this.freezeCalls.push(input);
    return (
      this.nextFreezeResult ?? {
        command: "freeze_market",
        status: "enqueued",
        queueJobId: "validation-chain.freeze_market.prop_1",
        delayMs: 0,
        errorMessage: null,
      }
    );
  }

  async enqueueResolveCommand(
    input: Record<string, unknown>,
  ): Promise<ValidationChainCommandSubmissionViewModel> {
    this.resolveCalls.push(input);
    return (
      this.nextResolveResult ?? {
        command: "resolve_market",
        status: "enqueued",
        queueJobId: "validation-chain.resolve_market.prop_1",
        delayMs: 5000,
        errorMessage: null,
      }
    );
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
    if (configuredJobId.includes(":")) {
      throw new Error("Custom Id cannot contain :");
    }
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
    public readonly state: {
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

class FakeRedisService {
  schedulerWorkerHeartbeat: Record<string, unknown> | null = null;
  schedulerWorkerHeartbeatError: Error | null = null;

  async getSchedulerWorkerHeartbeat() {
    if (this.schedulerWorkerHeartbeatError) {
      throw this.schedulerWorkerHeartbeatError;
    }

    return this.schedulerWorkerHeartbeat as never;
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
      findMany: async (_input?: Record<string, unknown>) =>
        [] as Array<Record<string, unknown>>,
    },
    public readonly bet = {
      findFirst: async () => null as Record<string, unknown> | null,
      findMany: async () => [] as Array<Record<string, unknown>>,
    },
    public readonly proposition = {
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

class FakeOpsAlertNotifier {
  readonly notifications: Array<Record<string, unknown>> = [];

  async notifyAlert(input: Record<string, unknown>): Promise<void> {
    this.notifications.push(structuredClone(input));
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

type MonitoringContractTestOverrides = {
  config?: Record<string, unknown>;
  blockchain?: Record<string, unknown>;
  redis?: Record<string, unknown>;
  health?: Record<string, unknown>;
  queue?: Record<string, unknown>;
  validationContract?: FakeValidationChainContractService;
  proofRecords?: { getLatestProof: () => Promise<unknown> };
};

function createMonitoringForContractTests(
  overrides: MonitoringContractTestOverrides = {},
) {
  const defaultConfig = {
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
    rewardPayoutAssetSymbol: "USDC",
    rewardPayoutErc20Address:
      "0x0000000000000000000000000000000000000010",
    rewardPayoutOperatorPrivateKey:
      "0x4444444444444444444444444444444444444444444444444444444444444444",
    nodeEnv: "production",
    port: 4000,
  };
  const defaultBlockchain = {
    async assertReady() {
      return undefined;
    },
  };
  const defaultRedis = {
    async ping() {
      return "PONG";
    },
  };
  const defaultHealth = {
    getLiveSnapshot() {
      return {
        status: "ok",
        timestamp: "2026-06-07T00:36:00.000Z",
      };
    },
    async getReadinessSnapshot() {
      return {
        status: "ok",
        timestamp: "2026-06-07T00:36:00.000Z",
        dependencies: [
          { name: "database", status: "up" },
          { name: "redis", status: "up" },
          { name: "rpc", status: "up" },
          { name: "scheduler_queue", status: "up" },
        ],
      };
    },
  };
  const defaultQueue = {
    async getQueueOverview() {
      return {
        status: "ok",
        timestamp: "2026-06-07T00:36:00.000Z",
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
  };
  const validationContract =
    overrides.validationContract ?? new FakeValidationChainContractService();
  const proofRecords =
    overrides.proofRecords ??
    ({
      async getLatestProof() {
        return null;
      },
    } as const);

  return new InternalMonitoringService(
    {
      async assertReady() {
        return undefined;
      },
    } as never,
    {
      ...defaultConfig,
      ...overrides.config,
    } as never,
    {
      ...defaultBlockchain,
      ...overrides.blockchain,
    } as never,
    {
      ...defaultRedis,
      ...overrides.redis,
    } as never,
    {
      ...defaultHealth,
      ...overrides.health,
    } as never,
    {
      ...defaultQueue,
      ...overrides.queue,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      async listByEntity() {
        return [];
      },
    } as never,
    validationContract as never,
    undefined as never,
    proofRecords as never,
  );
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
    await harness.userRepository.create({
      id: "phase6_user",
      primaryWalletAddress: "0x00000000000000000000000000000000000000f6",
      normalizedPrimaryWalletAddress:
        "0x00000000000000000000000000000000000000f6",
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

    const firstSubmission = await service.enqueueValidationChainCommand({
      command: "resolve_market",
      propositionId: "prop_1",
      actorUserId: "system_1",
      reason: "validation_chain.runtime.official_result",
      requestedAt: new Date().toISOString(),
    });

    const firstJobId = String(schedulerQueue.addCalls[0]?.opts.jobId ?? "");
    assert.equal(firstJobId, "validation-chain.resolve_market.prop_1");
    assert.equal(firstSubmission.dedupeStatus, "enqueued");

    const retainedJob = schedulerQueue.jobs.get(firstJobId);
    assert.equal(retainedJob?.removed, false);
    if (retainedJob) {
      retainedJob.state = "completed";
    }

    const secondSubmission = await service.enqueueValidationChainCommand({
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
    assert.equal(secondSubmission.dedupeStatus, "enqueued");
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

    const firstSubmission = await service.enqueueValidationChainCommand({
      command: "freeze_market",
      propositionId: "prop_1",
      actorUserId: "system_1",
      reason: "validation_chain.runtime.prepare_reveal",
      requestedAt: new Date().toISOString(),
    });

    const jobId = String(schedulerQueue.addCalls[0]?.opts.jobId ?? "");
    const pendingJob = schedulerQueue.jobs.get(jobId);
    assert.equal(firstSubmission.dedupeStatus, "enqueued");

    const secondSubmission = await service.enqueueValidationChainCommand({
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
    assert.equal(secondSubmission.dedupeStatus, "already_pending");
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
    assert.equal(syncJobId, "validation-chain.sync");

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
      Object.assign(new FakeRedisService(), {
        schedulerWorkerHeartbeat: {
          processRole: "worker",
          startedAt: "2026-04-24T00:58:00.000Z",
          lastSeenAt: "2026-04-24T00:59:55.000Z",
          lastJobProcessedAt: "2026-04-24T00:59:50.000Z",
          lastJobName: "validation-chain.sync",
          lastWorkerErrorAt: null,
          lastWorkerErrorMessage: null,
        },
      }) as never,
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

  it("filters recovered stream failures out of current validation-chain monitoring noise", async () => {
    const healthyCursor: ValidationChainCursor = {
      streamKey: "validation_market_main",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000000002",
      lastProcessedBlock: 12,
      lastProcessedTxHash: "0x12",
      lastProcessedLogIndex: 0,
      lastFinalizedBlock: 12,
      syncStatus: "idle",
      createdAt: new Date("2026-04-24T00:00:00.000Z"),
      updatedAt: new Date("2026-04-24T01:05:00.000Z"),
    };

    const recoveredFailure = {
      action: "validation_chain.sync.failed",
      entityType: "validation_chain_stream",
      entityId: healthyCursor.streamKey,
      reason: "validation_chain.sync.error",
      metadataJson: {
        error: "old rpc failure",
      },
      createdAt: new Date("2026-04-24T01:00:00.000Z"),
    };

    let syncFailureCountQuery: Record<string, unknown> | null = null;
    const matchesCreatedAtFloor = (
      where:
        | {
            action?: string | { in?: string[] };
            createdAt?: {
              gte?: Date;
              gt?: Date;
            };
            OR?: Array<Record<string, unknown>>;
          }
        | undefined,
      eventCreatedAt: Date,
    ): boolean => {
      if (Array.isArray(where?.OR)) {
        return where.OR.some((entry) =>
          matchesCreatedAtFloor(
            entry as {
              action?: string | { in?: string[] };
              createdAt?: {
                gte?: Date;
                gt?: Date;
              };
              OR?: Array<Record<string, unknown>>;
            },
            eventCreatedAt,
          ),
        );
      }

      const actionFilter = where?.action;
      if (typeof actionFilter === "string") {
        if (actionFilter !== recoveredFailure.action) {
          return false;
        }
      } else if (Array.isArray(actionFilter?.in)) {
        if (!actionFilter.in.includes(recoveredFailure.action)) {
          return false;
        }
      }

      const floor = where?.createdAt?.gte ?? where?.createdAt?.gt ?? null;
      return floor ? eventCreatedAt >= floor : true;
    };
    const audit = new FakeAuditService();
    const prisma = new FakePrismaService(
      {
        findMany: async (input) => {
          if (
            matchesCreatedAtFloor(
              input.where as
                | {
                    action?: string | { in?: string[] };
                    createdAt?: {
                      gte?: Date;
                      gt?: Date;
                    };
                    OR?: Array<Record<string, unknown>>;
                  }
                | undefined,
              recoveredFailure.createdAt,
            )
          ) {
            return [recoveredFailure] as Array<Record<string, unknown>>;
          }
          return [] as Array<Record<string, unknown>>;
        },
        findFirst: async () => null,
        count: async (input) => {
          const action = (input.where as { action?: string } | undefined)?.action;
          if (action === "validation_chain.sync.failed") {
            syncFailureCountQuery = input;
          }
          return 0;
        },
      },
      {
        findMany: async () => [],
        findFirst: async () => null,
      },
      {
        count: async () => 0,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findFirst: async () => null,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
    );

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(healthyCursor) as never,
      new FakeRedisService() as never,
      audit as never,
    );

    const snapshot = await alerts.getHealthSnapshot("2026-04-24T01:06:00.000Z");
    const createdAtFilter = (
      (
        syncFailureCountQuery?.where as
          | { createdAt?: { gte?: Date; gt?: Date } }
          | undefined
      )?.createdAt?.gte ??
      (
        syncFailureCountQuery?.where as
          | { createdAt?: { gte?: Date; gt?: Date } }
          | undefined
      )?.createdAt?.gt ??
      null
    );

    assert.equal(createdAtFilter?.toISOString(), healthyCursor.updatedAt.toISOString());
    assert.deepEqual(snapshot.recentAlerts, []);
    assert.equal(snapshot.metrics.recentSyncFailureCount, 0);
    assert.equal(snapshot.failures.syncFailuresCount, 0);
    assert.deepEqual(snapshot.failures.recentFailures, []);
  });

  it("keeps command-level validation-chain failures visible after later sync recovery", async () => {
    const healthyCursor: ValidationChainCursor = {
      streamKey: "validation_market_main",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000000002",
      lastProcessedBlock: 12,
      lastProcessedTxHash: "0x12",
      lastProcessedLogIndex: 0,
      lastFinalizedBlock: 12,
      syncStatus: "idle",
      createdAt: new Date("2026-04-24T00:00:00.000Z"),
      updatedAt: new Date("2026-04-24T01:05:00.000Z"),
    };

    const terminalFailure = {
      action: "validation_chain.alert.command_terminal",
      entityType: "validation_chain_command",
      entityId: "prop_1",
      reason: "validation_chain.runtime.resolve_market",
      metadataJson: {
        command: "resolve_market",
        error: "manual intervention still required",
      },
      createdAt: new Date("2026-04-24T01:00:00.000Z"),
    };

    const audit = new FakeAuditService();
    const prisma = new FakePrismaService(
      {
        findMany: async () => [terminalFailure] as Array<Record<string, unknown>>,
        findFirst: async () => null,
        count: async () => 0,
      },
      {
        findMany: async () => [],
        findFirst: async () => null,
      },
      {
        count: async () => 0,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findFirst: async () => null,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
    );

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(healthyCursor) as never,
      new FakeRedisService() as never,
      audit as never,
    );

    const snapshot = await alerts.getHealthSnapshot("2026-04-24T01:06:00.000Z");

    assert.equal(snapshot.failures.recentFailures.length, 1);
    assert.equal(
      snapshot.failures.recentFailures[0]?.action,
      "validation_chain.alert.command_terminal",
    );
  });

  it("requests recent event ledger activity by processed time before block height", async () => {
    const cursor: ValidationChainCursor = {
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

    let recentEventQuery: Record<string, unknown> | null = null;
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
        count: async () => 2,
        findMany: async (input) => {
          recentEventQuery = input;
          return [
            {
              eventName: "MarketCreated",
              blockNumber: 2,
              transactionHash: "0x02",
              transactionIndex: 0,
              logIndex: 0,
              marketChainId: "chain_market_new",
              propositionChainId: "chain_prop_new",
              processedAt: new Date("2026-04-24T01:00:10.000Z"),
            },
            {
              eventName: "MarketResolved",
              blockNumber: 999,
              transactionHash: "0x999",
              transactionIndex: 0,
              logIndex: 0,
              marketChainId: "chain_market_old",
              propositionChainId: "chain_prop_old",
              processedAt: new Date("2026-04-24T00:00:10.000Z"),
            },
          ] as Array<Record<string, unknown>>;
        },
      },
      {
        findFirst: async () => null,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
    );

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      Object.assign(new FakeRedisService(), {
        schedulerWorkerHeartbeat: {
          processRole: "worker",
          startedAt: "2026-04-24T00:58:00.000Z",
          lastSeenAt: "2026-04-24T00:59:55.000Z",
          lastJobProcessedAt: "2026-04-24T00:59:50.000Z",
          lastJobName: "validation-chain.sync",
          lastWorkerErrorAt: null,
          lastWorkerErrorMessage: null,
        },
      }) as never,
      audit as never,
    );

    const snapshot = await alerts.getHealthSnapshot("2026-04-24T01:00:00.000Z");

    assert.deepEqual(recentEventQuery?.orderBy, [
      { processedAt: "desc" },
      { blockNumber: "desc" },
      { transactionIndex: "desc" },
      { logIndex: "desc" },
    ]);
    assert.equal(snapshot.eventLedger.recentEvents[0]?.eventName, "MarketCreated");
    assert.equal(snapshot.eventLedger.recentEvents[1]?.eventName, "MarketResolved");
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
      Object.assign(new FakeRedisService(), {
        schedulerWorkerHeartbeat: {
          processRole: "worker",
          startedAt: "2026-04-24T00:58:00.000Z",
          lastSeenAt: "2026-04-24T00:59:55.000Z",
          lastJobProcessedAt: "2026-04-24T00:59:50.000Z",
          lastJobName: "validation-chain.sync",
          lastWorkerErrorAt: null,
          lastWorkerErrorMessage: null,
        },
      }) as never,
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
    assert.deepEqual(snapshot.projection.unsyncedBetBacklog[0]?.operatorActions, [
      "POST /arena/internal/validation-chain/sync",
      "POST /arena/internal/validation-chain/backlog/reconcile",
      "POST /arena/internal/validation-chain/markets/market_1/bets/bettor_1/reconcile",
      "GET /arena/internal/monitoring/validation-chain",
    ]);
    assert.equal(snapshot.operatorSummary.status, "action_required");
    assert.equal(snapshot.operatorSummary.requiresActionNow, true);
    assert.equal(snapshot.operatorSummary.focusArea, "unsynced_bet_backlog");
    assert.equal(
      snapshot.operatorSummary.summary,
      "Unsynced local validation bets are backlogged. Run sync and reconciliation before trusting bet projections.",
    );
    assert.deepEqual(snapshot.operatorSummary.operatorActions, [
      "POST /arena/internal/validation-chain/sync",
      "POST /arena/internal/validation-chain/backlog/reconcile",
      "POST /arena/internal/validation-chain/markets/market_1/bets/bettor_1/reconcile",
      "GET /arena/internal/monitoring/validation-chain",
    ]);
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
      new FakeRedisService() as never,
      audit as never,
    );

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");

    const backlogAlert = audit.records.find(
      (record) =>
        record.action === "validation_chain.alert.unsynced_bet_backlog",
    );

    assert.equal(
      backlogAlert !== undefined,
      true,
    );
    assert.deepEqual((backlogAlert?.metadata as { operatorActions?: string[] }).operatorActions, [
      "POST /arena/internal/validation-chain/sync",
      "POST /arena/internal/validation-chain/backlog/reconcile",
      "POST /arena/internal/validation-chain/markets/market_1/bets/bettor_1/reconcile",
      "GET /arena/internal/monitoring/validation-chain",
    ]);
  });

  it("exposes stale payout markets with operator recovery actions in validation-chain health snapshots", async () => {
    const cursor: ValidationChainCursor = {
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
        findMany: async () =>
          [
            {
              id: "market_resolved_1",
              propositionId: "prop_1",
              chainStatus: "resolved",
              chainResolvedAt: new Date("2026-04-22T00:00:00.000Z"),
              chainCancelledAt: null,
              bets: [{ id: "bet_1" }, { id: "bet_2" }],
            },
          ] as Array<Record<string, unknown>>,
        findFirst: async () => null,
      },
      {
        count: async () => 0,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findFirst: async () => null,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
    );

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      Object.assign(new FakeRedisService(), {
        schedulerWorkerHeartbeat: {
          processRole: "worker",
          startedAt: "2026-04-24T00:58:00.000Z",
          lastSeenAt: "2026-04-24T00:59:55.000Z",
          lastJobProcessedAt: "2026-04-24T00:59:50.000Z",
          lastJobName: "validation-chain.sync",
          lastWorkerErrorAt: null,
          lastWorkerErrorMessage: null,
        },
      }) as never,
      audit as never,
    );

    const snapshot = await alerts.getHealthSnapshot("2026-04-24T01:00:00.000Z");

    assert.equal(snapshot.metrics.stalePayoutMarketCount, 1);
    assert.equal(snapshot.stalePayoutMarkets.length, 1);
    assert.equal(snapshot.stalePayoutMarkets[0]?.marketId, "market_resolved_1");
    assert.equal(snapshot.stalePayoutMarkets[0]?.unclaimedBetCount, 2);
    assert.deepEqual(snapshot.stalePayoutMarkets[0]?.operatorActions, [
      "POST /arena/internal/validation-chain/sync",
      "POST /arena/internal/validation-chain/markets/market_resolved_1/replay-projection",
      "GET /arena/internal/monitoring/validation-chain",
    ]);
    assert.equal(snapshot.operatorSummary.status, "action_required");
    assert.equal(snapshot.operatorSummary.requiresActionNow, true);
    assert.equal(snapshot.operatorSummary.focusArea, "stale_payouts");
    assert.equal(
      snapshot.operatorSummary.summary,
      "Stale payout recovery is required for at least one terminal market before settlement completeness can be trusted.",
    );
    assert.deepEqual(snapshot.operatorSummary.operatorActions, [
      "POST /arena/internal/validation-chain/sync",
      "POST /arena/internal/validation-chain/markets/market_resolved_1/replay-projection",
      "GET /arena/internal/monitoring/validation-chain",
    ]);
  });

  it("raises an alert when stale payout markets remain unresolved", async () => {
    const cursor: ValidationChainCursor = {
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
        findMany: async () =>
          [
            {
              id: "market_cancelled_1",
              propositionId: "prop_2",
              chainStatus: "cancelled",
              chainResolvedAt: null,
              chainCancelledAt: new Date("2026-04-22T00:00:00.000Z"),
              bets: [{ id: "bet_3" }],
            },
          ] as Array<Record<string, unknown>>,
        findFirst: async () => null,
      },
      {
        count: async () => 0,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findFirst: async () => null,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
    );

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      new FakeRedisService() as never,
      audit as never,
    );

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");

    const stalePayoutAlert = audit.records.find(
      (record) => record.action === "validation_chain.alert.stale_payouts",
    );

    assert.equal(stalePayoutAlert !== undefined, true);
    assert.equal(stalePayoutAlert?.reason, "validation_chain.payout.stale");
    assert.deepEqual(
      (stalePayoutAlert?.metadata as { operatorActions?: string[] }).operatorActions,
      [
        "POST /arena/internal/validation-chain/sync",
        "POST /arena/internal/validation-chain/markets/market_cancelled_1/replay-projection",
        "GET /arena/internal/monitoring/validation-chain",
      ],
    );
  });

  it("ignores stale payout items that belong to a historical chain epoch no longer present on the current chain", async () => {
    const cursor: ValidationChainCursor = {
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
        findMany: async () =>
          [
            {
              id: "market_resolved_legacy",
              propositionId: "prop_legacy",
              chainMarketId: "chain_market_legacy",
              chainStatus: "resolved",
              chainResolvedAt: new Date("2026-04-22T00:00:00.000Z"),
              chainCancelledAt: null,
              bets: [{ id: "bet_legacy" }],
            },
          ] as Array<Record<string, unknown>>,
        findFirst: async () => null,
      },
      {
        count: async () => 0,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findFirst: async () => null,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
    );

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      new FakeRedisService() as never,
      audit as never,
      new FakeValidationChainContractService({
        onChainState: null,
      }) as never,
    );

    const snapshot = await alerts.getHealthSnapshot("2026-04-24T01:00:00.000Z");

    assert.equal(snapshot.metrics.stalePayoutMarketCount, 0);
    assert.deepEqual(snapshot.stalePayoutMarkets, []);

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");

    assert.equal(
      audit.records.some(
        (record) => record.action === "validation_chain.alert.stale_payouts",
      ),
      false,
    );
  });

  it("raises lifecycle drift alerts with queue recovery guidance for recoverable drift", async () => {
    const cursor: ValidationChainCursor = {
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

    const persistedAuditEvents: Array<Record<string, unknown>> = [];
    const prisma = new FakePrismaService(
      {
        findMany: async () => persistedAuditEvents,
        findFirst: async (input) =>
          persistedAuditEvents.find(
            (record) =>
              record.entityType === (input.where as { entityType?: string }).entityType &&
              record.entityId === (input.where as { entityId?: string }).entityId &&
              record.action === (input.where as { action?: string }).action,
          ) ?? null,
        count: async () => 0,
      },
      {
        findMany: async (input) => {
          const where = input.where as {
            propositionId?: { in?: string[] };
          };
          if (where.propositionId?.in) {
            return [
              {
                id: "market_1",
                propositionId: "prop_1",
                status: "live",
                chainMarketId: null,
                chainStatus: null,
              },
            ] as Array<Record<string, unknown>>;
          }

          return [] as Array<Record<string, unknown>>;
        },
        findFirst: async () => null,
      },
      {
        count: async () => 0,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findFirst: async () => null,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findMany: async () =>
          [
            {
              id: "prop_1",
              status: "live",
              marketEnabled: true,
              resultComputedAt: null,
              resultKind: null,
            },
          ] as Array<Record<string, unknown>>,
      },
    );
    const audit = {
      async record(input: Record<string, unknown>) {
        const stored = {
          ...input,
          metadataJson: input.metadata,
          createdAt: new Date("2026-04-24T01:00:00.000Z"),
        };
        persistedAuditEvents.unshift(stored);
        return stored;
      },
    };

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      new FakeRedisService() as never,
      audit as never,
    );

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");

    const lifecycleAlert = persistedAuditEvents.find(
      (record) => record.action === "validation_chain.alert.lifecycle_drift",
    );

    assert.equal(lifecycleAlert !== undefined, true);
    assert.equal(
      lifecycleAlert?.reason,
      "validation_chain.lifecycle_drift.chain_market_not_created.queue_recovery",
    );
    assert.equal(
      (lifecycleAlert?.metadataJson as { driftReason?: string }).driftReason,
      "chain_market_not_created",
    );
    assert.equal(
      (
        lifecycleAlert?.metadataJson as {
          operatorGuidance?: { kind?: string; recoveryReason?: string };
        }
      ).operatorGuidance?.kind,
      "queue_recovery",
    );
    assert.equal(
      (
        lifecycleAlert?.metadataJson as {
          operatorGuidance?: { recoveryReason?: string };
        }
      ).operatorGuidance?.recoveryReason,
      "create_open_missing_market",
    );
  });

  it("raises lifecycle drift alerts with manual intervention guidance when the market row is missing", async () => {
    const cursor: ValidationChainCursor = {
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

    const persistedAuditEvents: Array<Record<string, unknown>> = [];
    const prisma = new FakePrismaService(
      {
        findMany: async () => persistedAuditEvents,
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
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findMany: async () =>
          [
            {
              id: "prop_missing_market",
              status: "live",
              marketEnabled: true,
              resultComputedAt: null,
              resultKind: null,
            },
          ] as Array<Record<string, unknown>>,
      },
    );
    const audit = {
      async record(input: Record<string, unknown>) {
        const stored = {
          ...input,
          metadataJson: input.metadata,
          createdAt: new Date("2026-04-24T01:00:00.000Z"),
        };
        persistedAuditEvents.unshift(stored);
        return stored;
      },
    };

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      new FakeRedisService() as never,
      audit as never,
    );

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");

    const lifecycleAlert = persistedAuditEvents.find(
      (record) => record.action === "validation_chain.alert.lifecycle_drift",
    );

    assert.equal(lifecycleAlert !== undefined, true);
    assert.equal(
      lifecycleAlert?.reason,
      "validation_chain.lifecycle_drift.market_missing.manual_intervention",
    );
    assert.equal(
      (
        lifecycleAlert?.metadataJson as {
          operatorGuidance?: { kind?: string; operatorActions?: string[] };
        }
      ).operatorGuidance?.kind,
      "manual_intervention",
    );
    assert.deepEqual(
      (
        lifecycleAlert?.metadataJson as {
          operatorGuidance?: { operatorActions?: string[] };
        }
      ).operatorGuidance?.operatorActions,
      ["docs/contracts/arena-validation-chain-runbook.md"],
    );
  });

  it("dedupes unchanged lifecycle drift alerts and records a new alert when recovery guidance changes", async () => {
    const cursor: ValidationChainCursor = {
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

    const persistedAuditEvents: Array<Record<string, unknown>> = [];
    const contract = new FakeValidationChainContractService({
      onChainState: ValidationContractMarketState.PreLive,
    });
    const prisma = new FakePrismaService(
      {
        findMany: async () => persistedAuditEvents,
        findFirst: async (input) =>
          persistedAuditEvents.find(
            (record) =>
              record.entityType === (input.where as { entityType?: string }).entityType &&
              record.entityId === (input.where as { entityId?: string }).entityId &&
              record.action === (input.where as { action?: string }).action,
          ) ?? null,
        count: async () => 0,
      },
      {
        findMany: async (input) => {
          const where = input.where as {
            propositionId?: { in?: string[] };
          };
          if (where.propositionId?.in) {
            return [
              {
                id: "market_1",
                propositionId: "prop_1",
                status: "live",
                chainMarketId: "chain_market_1",
                chainStatus: "pre_live",
              },
            ] as Array<Record<string, unknown>>;
          }

          return [] as Array<Record<string, unknown>>;
        },
        findFirst: async () => null,
      },
      {
        count: async () => 0,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findFirst: async () => null,
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
      {
        findMany: async () =>
          [
            {
              id: "prop_1",
              status: "live",
              marketEnabled: true,
              resultComputedAt: null,
              resultKind: null,
            },
          ] as Array<Record<string, unknown>>,
      },
    );
    const audit = {
      async record(input: Record<string, unknown>) {
        const stored = {
          ...input,
          metadataJson: input.metadata,
          createdAt: new Date(
            `2026-04-24T01:00:0${persistedAuditEvents.length}.000Z`,
          ),
        };
        persistedAuditEvents.unshift(stored);
        return stored;
      },
    };

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      new FakeRedisService() as never,
      audit as never,
      contract as never,
    );

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");
    await alerts.runHealthCheck("2026-04-24T01:01:00.000Z");

    contract.state.onChainState = ValidationContractMarketState.Live;
    await alerts.runHealthCheck("2026-04-24T01:02:00.000Z");

    const driftAlerts = persistedAuditEvents.filter(
      (record) => record.action === "validation_chain.alert.lifecycle_drift",
    );

    assert.equal(driftAlerts.length, 2);
    assert.equal(
      (
        driftAlerts[1]?.metadataJson as {
          operatorGuidance?: { kind?: string };
        }
      ).operatorGuidance?.kind,
      "queue_recovery",
    );
    assert.equal(
      (
        driftAlerts[0]?.metadataJson as {
          operatorGuidance?: { kind?: string };
        }
      ).operatorGuidance?.kind,
      "projection_repair",
    );
  });

  it("includes scheduler worker heartbeat state in validation-chain health snapshots", async () => {
    const cursor: ValidationChainCursor = {
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
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
    );
    const redis = new FakeRedisService();
    redis.schedulerWorkerHeartbeat = {
      processRole: "worker",
      startedAt: "2026-04-24T00:58:00.000Z",
      lastSeenAt: "2026-04-24T00:59:55.000Z",
      lastJobProcessedAt: "2026-04-24T00:59:50.000Z",
      lastJobName: "validation-chain.sync",
      lastWorkerErrorAt: null,
      lastWorkerErrorMessage: null,
    };

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      redis as never,
      audit as never,
    );

    const snapshot = await alerts.getHealthSnapshot("2026-04-24T01:00:00.000Z");

    assert.equal(snapshot.schedulerWorker?.status, "up");
    assert.equal(
      snapshot.schedulerWorker?.lastJobName,
      "validation-chain.sync",
    );
    assert.deepEqual(snapshot.schedulerWorker?.operatorActions, []);
    assert.equal(snapshot.operatorSummary.status, "ready");
    assert.equal(snapshot.operatorSummary.requiresActionNow, false);
    assert.equal(snapshot.operatorSummary.focusArea, "healthy");
    assert.equal(
      snapshot.operatorSummary.summary,
      "Validation-chain health is green. No operator recovery is required right now.",
    );
  });

  it("raises sync worker unhealthy alert when scheduler worker heartbeat is down", async () => {
    const cursor: ValidationChainCursor = {
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
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
    );
    const redis = new FakeRedisService();
    redis.schedulerWorkerHeartbeat = {
      processRole: "worker",
      startedAt: "2026-04-24T00:40:00.000Z",
      lastSeenAt: "2026-04-24T00:45:00.000Z",
      lastJobProcessedAt: "2026-04-24T00:45:00.000Z",
      lastJobName: "validation-chain.sync",
      lastWorkerErrorAt: null,
      lastWorkerErrorMessage: null,
    };

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      redis as never,
      audit as never,
    );

    const snapshot = await alerts.getHealthSnapshot("2026-04-24T01:00:00.000Z");

    assert.equal(snapshot.operatorSummary.status, "action_required");
    assert.equal(snapshot.operatorSummary.requiresActionNow, true);
    assert.equal(snapshot.operatorSummary.focusArea, "scheduler_worker");
    assert.equal(
      snapshot.operatorSummary.summary,
      "Scheduler worker heartbeat is down. Restore worker processing before trusting sync or queued recovery flows.",
    );
    assert.deepEqual(snapshot.operatorSummary.operatorActions, [
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml ps scheduler-worker",
      "docker logs --tail 200 <scheduler-worker-container>",
      "GET /system/queues/overview",
    ]);

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");

    const workerAlert = audit.records.find(
      (record) =>
        record.action === "validation_chain.alert.sync_worker_unhealthy" &&
        record.reason === "validation_chain.sync.worker_heartbeat_down",
    );

    assert.equal(workerAlert !== undefined, true);
    assert.deepEqual((workerAlert?.metadata as { operatorActions?: string[] }).operatorActions, [
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml ps scheduler-worker",
      "docker logs --tail 200 <scheduler-worker-container>",
      "GET /system/queues/overview",
    ]);
  });

  it("forwards validation-chain alerts to the configured notifier when a new alert is recorded", async () => {
    const cursor: ValidationChainCursor = {
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
    const notifier = new FakeOpsAlertNotifier();
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
        findMany: async () => [] as Array<Record<string, unknown>>,
      },
    );
    const redis = new FakeRedisService();
    redis.schedulerWorkerHeartbeat = {
      processRole: "worker",
      startedAt: "2026-04-24T00:40:00.000Z",
      lastSeenAt: "2026-04-24T00:45:00.000Z",
      lastJobProcessedAt: "2026-04-24T00:45:00.000Z",
      lastJobName: "validation-chain.sync",
      lastWorkerErrorAt: null,
      lastWorkerErrorMessage: null,
    };

    const alerts = new ValidationChainAlertService(
      prisma as never,
      {
        validationSyncPollIntervalMs: 15_000,
      } as never,
      new FakeCursorRepository(cursor) as never,
      redis as never,
      audit as never,
      undefined,
      notifier as never,
    );

    await alerts.runHealthCheck("2026-04-24T01:00:00.000Z");

    assert.equal(notifier.notifications.length, 1);
    assert.equal(
      notifier.notifications[0]?.source,
      "validation_chain",
    );
    assert.equal(
      notifier.notifications[0]?.action,
      "validation_chain.alert.sync_worker_unhealthy",
    );
    assert.equal(
      notifier.notifications[0]?.reason,
      "validation_chain.sync.worker_heartbeat_down",
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

  it("rejects manual bet reconciliation without an explicit actor", async () => {
    const contract = new FakeValidationChainContractReadService();
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
            chainMarketId:
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            chainStatus: "live",
          };
        },
      } as never,
      contract as never,
      new FakeAuditService() as never,
    );

    await assert.rejects(
      () =>
        service.reconcileBet({
          marketId: "market_1",
          userId: "0x00000000000000000000000000000000000000aa",
          actorUserId: null,
          reason: "validation_chain.reconcile.manual",
        }),
      /requires an explicit actor/i,
    );
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

  it("rejects batch backlog reconciliation without an explicit actor", async () => {
    const service = new ValidationChainBetReconciliationService(
      {
        async listUnsyncedProjectedBacklog() {
          return [];
        },
      } as never,
      {} as never,
      {} as never,
      new FakeAuditService() as never,
    );

    await assert.rejects(
      () =>
        service.reconcileUnsyncedBets({
          actorUserId: null,
          reason: "validation_chain.reconcile.batch",
        }),
      /requires an explicit actor/i,
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

  it("rejects projection replay without an explicit actor", async () => {
    const service = new ValidationChainProjectionReplayService(
      {
        async $transaction<T>(callback: () => Promise<T>) {
          return callback();
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new FakeAuditService() as never,
    );

    await assert.rejects(
      () =>
        service.replayMarketProjection({
          marketId: "market_1",
          actorUserId: null,
          reason: "validation_chain.replay.manual",
        }),
      /requires an explicit actor/i,
    );
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
    assert.equal(result.requestStatus, "queued");
    assert.equal(result.commandSubmissions.length, 2);
    assert.equal(result.commandSubmissions[0]?.status, "enqueued");
    assert.equal(runtime.createOpenCalls.length, 1);
    assert.equal(runtime.freezeCalls.length, 0);
    assert.equal(runtime.resolveCalls.length, 0);
    assert.equal(
      audit.records[audit.records.length - 1]?.action,
      "validation_chain.command_recovery.queued",
    );
  });

  it("marks recovery as already pending when every command reuses an active single-flight job", async () => {
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
        chainMarketId: "chain_market_1",
        chainPropositionId: "chain_prop_1",
        chainStatus: "pre_live",
      },
      onChainState: ValidationContractMarketState.PreLive,
    });
    runtime.nextFreezeResult = null;
    runtime.nextResolveResult = null;
    runtime.nextCreateOpenResult = [
      {
        command: "open_market",
        status: "already_pending",
        queueJobId: "validation-chain.open_market.prop_1",
        delayMs: 5000,
        errorMessage: null,
      },
    ];

    const result = await service.recoverQueuedCommands({
      propositionId: "prop_1",
      actorUserId: "operator_1",
      reason: "validation_chain.command_recovery.manual",
      note: "open_job_already_waiting",
    });

    assert.equal(result.recoveryReason, "open_pre_live_market");
    assert.equal(result.requestStatus, "already_pending");
    assert.deepEqual(result.commandSubmissions, [
      {
        command: "open_market",
        status: "already_pending",
        queueJobId: "validation-chain.open_market.prop_1",
        delayMs: 5000,
        errorMessage: null,
      },
    ]);
    assert.equal(
      audit.records[audit.records.length - 1]?.action,
      "validation_chain.command_recovery.already_pending",
    );
  });

  it("marks recovery as partially failed when only some planned commands were submitted", async () => {
    const { service, runtime, audit } = createCommandRecoveryService({
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
    runtime.nextFreezeResult = {
      command: "freeze_market",
      status: "enqueued",
      queueJobId: "validation-chain.freeze_market.prop_1",
      delayMs: 0,
      errorMessage: null,
    };
    runtime.nextResolveResult = {
      command: "resolve_market",
      status: "failed",
      queueJobId: null,
      delayMs: 5000,
      errorMessage: "Redis unavailable",
    };

    const result = await service.recoverQueuedCommands({
      propositionId: "prop_1",
      actorUserId: "operator_1",
      reason: "validation_chain.command_recovery.manual",
      note: "resolve_enqueue_failed",
    });

    assert.equal(result.requestStatus, "partial_failure");
    assert.deepEqual(
      result.commandSubmissions.map((item) => item.status),
      ["enqueued", "failed"],
    );
    assert.equal(
      audit.records[audit.records.length - 1]?.action,
      "validation_chain.command_recovery.partial_failure",
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
      {
        async listByEntity() {
          return [];
        },
      } as never,
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
    assert.equal(
      snapshot.preflightCommands.includes(
        "pnpm run validation:chain:check -- --env-file <path-to-release-env>",
      ),
      true,
    );
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
      {
        async listByEntity() {
          return [];
        },
      } as never,
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
    const monitoring = createMonitoringForContractTests({
      health: {
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
      },
      queue: {
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
      },
      validationContract: new FakeValidationChainContractService({
        runtimeBytecodeMatchesArtifact: false,
        signerIssues: {
          operator: {
            hasRequiredRole: false,
          },
          pauser: {
            hasBalance: false,
          },
        },
      }),
    });

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
        ?.commands.includes(
          "pnpm run validation:deploy -- --env-file <path-to-release-env> --network validation",
        ),
      true,
    );
    assert.equal(
      snapshot.operatorActions.find((item) => item.dependency === "validation_pauser_signer")
        ?.envKeys.includes("ARENA_VALIDATION_PAUSER_PRIVATE_KEY"),
      true,
    );
  });

it("builds a validation rehearsal contract for environment-backed operator verification", async () => {
    const monitoring = createMonitoringForContractTests({
      blockchain: {
        async assertReady() {
          throw new Error("rpc timeout");
        },
      },
      health: {
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
      },
      queue: {
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
      },
    });

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
    assert.equal(
      readinessGate?.operatorActions.includes("GET /system/queues/overview"),
      true,
    );
    const validationGate = snapshot.releaseChecklist.find(
      (item) => item.id === "validation-runtime",
    );
    assert.equal(validationGate?.status, "blocked");
    assert.equal(validationGate?.blockingDependencies.includes("rpc"), true);
    assert.equal(
      validationGate?.operatorActions.includes(
        "pnpm run validation:chain:check -- --env-file <path-to-release-env>",
      ),
      true,
    );
  });

  it("treats reward payout readiness as a release gate without blocking validation rehearsal progress", async () => {
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
        rewardPayoutErc20Address: "",
        rewardPayoutOperatorPrivateKey: "",
        nodeEnv: "production",
        port: 4000,
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
            timestamp: "2026-06-07T00:36:00.000Z",
          };
        },
        async getReadinessSnapshot() {
          return {
            status: "ok",
            timestamp: "2026-06-07T00:36:00.000Z",
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
            timestamp: "2026-06-07T00:36:00.000Z",
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
      {
        async listByEntity() {
          return [];
        },
      } as never,
      new FakeValidationChainContractService() as never,
      undefined,
    );

    const snapshot = await monitoring.getRuntimeContract();
    const rewardPayoutGate = snapshot.releaseChecklist.find(
      (item) => item.id === "reward-payout",
    );
    const validationGate = snapshot.releaseChecklist.find(
      (item) => item.id === "validation-runtime",
    );

    assert.equal(snapshot.validationChain.status, "degraded");
    assert.equal(
      snapshot.validationChain.dependencies.find(
        (item) => item.name === "reward_payout_token",
      )?.status,
      "down",
    );
    assert.equal(
      snapshot.validationChain.dependencies.find(
        (item) => item.name === "reward_payout_operator_signer",
      )?.status,
      "down",
    );
    assert.equal(
      snapshot.validationChain.requiredEnvKeys.includes(
        "ARENA_REWARD_PAYOUT_ERC20_ADDRESS",
      ),
      true,
    );
    assert.equal(
      snapshot.validationChain.requiredEnvKeys.includes(
        "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY",
      ),
      true,
    );
    assert.equal(snapshot.validationRehearsal.status, "ready");
    assert.deepEqual(snapshot.validationRehearsal.blockingDependencies, []);
    assert.equal(validationGate, undefined);
    assert.equal(rewardPayoutGate?.status, "blocked");
    assert.deepEqual(rewardPayoutGate?.blockingDependencies, [
      "reward_payout_token",
      "reward_payout_operator_signer",
    ]);
    assert.equal(
      rewardPayoutGate?.commands.includes("GET /arena/internal/rewards"),
      true,
    );
    assert.equal(snapshot.releaseReadiness.status, "blocked");
    assert.deepEqual(snapshot.releaseReadiness.blockingDependencies, [
      "reward_payout_token",
      "reward_payout_operator_signer",
      "validation_proof_missing",
    ]);
    assert.equal(snapshot.operatorSummary.focusArea, "reward-payout");
    assert.equal(
      snapshot.operatorSummary.operatorActions.includes(
        "GET /arena/internal/rewards",
      ),
      true,
    );
  });

it("blocks non-local release readiness when no external validation proof record exists", async () => {
    const monitoring = createMonitoringForContractTests({
      proofRecords: {
        async getLatestProof() {
          return null;
        },
      },
    });

    const snapshot = await monitoring.getRuntimeContract();
    const validationProofGate = snapshot.releaseChecklist.find(
      (item) => item.id === "validation-proof",
    );

    assert.equal(snapshot.validationProofRecord, null);
    assert.equal(validationProofGate?.status, "blocked");
    assert.deepEqual(validationProofGate?.blockingDependencies, [
      "validation_proof_missing",
    ]);
    assert.equal(
      validationProofGate?.commands.includes(
        "pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <url> --auth-token <operator-token>",
      ),
      true,
    );
    assert.equal(
      validationProofGate?.operatorActions.includes(
        "pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <url> --auth-token <operator-token>",
      ),
      true,
    );
    assert.equal(
      validationProofGate?.commands.includes(
        "POST /arena/internal/validation-chain/proof-record",
      ),
      true,
    );
    assert.equal(snapshot.releaseReadiness.status, "blocked");
    assert.equal(
      snapshot.releaseReadiness.blockingDependencies.includes(
        "validation_proof_missing",
      ),
      true,
    );
    assert.equal(snapshot.operatorSummary.focusArea, "validation-proof");
  });

it("keeps non-local release readiness blocked when external proof exists but reward payout follow-through is still incomplete", async () => {
  const monitoring = createMonitoringForContractTests({
    proofRecords: {
      async getLatestProof() {
        return {
          environment: "staging",
            chainId: 8453,
            propositionId: "prop_staging_complete",
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
            latestCheckpointAt: "2026-06-07T00:35:00.000Z",
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
            summaryArtifactPath: "validation-rehearsal/prop_staging_complete/proof-summary.json",
            evidenceArtifactPath: "validation-rehearsal/prop_staging_complete/evidence-bundle.json",
            rewardPayoutArtifactPath:
              "validation-rehearsal/prop_staging_complete/reward-payout-summary.json",
            publicResultArtifactPath:
              "validation-rehearsal/prop_staging_complete/public-settled-result.json",
            publicIntegrityArtifactPath:
              "validation-rehearsal/prop_staging_complete/public-integrity-overview.json",
            note: "staging clean VM proof",
            recordedByUserId: "operator_validation_chain",
            checkedAt: "2026-06-07T00:35:00.000Z",
            recordedAt: "2026-06-07T00:36:00.000Z",
          };
        },
      },
    });

    const snapshot = await monitoring.getRuntimeContract();
    const validationProofGate = snapshot.releaseChecklist.find(
      (item) => item.id === "validation-proof",
    );

    assert.equal(snapshot.validationProofRecord?.proofComplete, true);
    assert.equal(snapshot.validationProofRecord?.rewardPayoutLedgerEntryCount, 3);
    assert.equal(snapshot.validationProofRecord?.rewardPayoutRecordCount, 2);
    assert.equal(
      snapshot.validationProofRecord?.rewardPayoutStatusCounts.completed,
      1,
    );
    assert.equal(
      snapshot.validationProofRecord?.rewardPayoutStaleExecutingCount,
      1,
    );
    assert.equal(
      snapshot.validationProofRecord
        ?.rewardPayoutStaleExecutingWithoutTxHashCount,
      1,
    );
    assert.equal(
      snapshot.validationProofRecord?.rewardPayoutArtifactPath,
      "validation-rehearsal/prop_staging_complete/reward-payout-summary.json",
    );
    assert.equal(validationProofGate?.status, "blocked");
    assert.deepEqual(validationProofGate?.blockingDependencies, [
      "validation_proof_reward_payout_incomplete",
    ]);
    assert.equal(snapshot.releaseReadiness.status, "blocked");
    assert.equal(
      snapshot.releaseReadiness.blockingDependencies.includes(
        "validation_proof_reward_payout_incomplete",
      ),
      true,
    );
    assert.equal(snapshot.operatorSummary.focusArea, "validation-proof");
  });
});

it("marks non-local release readiness ready when external proof and reward payout follow-through are both complete", async () => {
  const monitoring = createMonitoringForContractTests({
    proofRecords: {
      async getLatestProof() {
        return {
          environment: "staging",
          chainId: 8453,
          propositionId: "prop_staging_complete",
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
          latestCheckpointAt: "2026-06-07T00:35:00.000Z",
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
          summaryArtifactPath: "validation-rehearsal/prop_staging_complete/proof-summary.json",
          evidenceArtifactPath: "validation-rehearsal/prop_staging_complete/evidence-bundle.json",
          rewardPayoutArtifactPath:
            "validation-rehearsal/prop_staging_complete/reward-payout-summary.json",
          publicResultArtifactPath:
            "validation-rehearsal/prop_staging_complete/public-settled-result.json",
          publicIntegrityArtifactPath:
            "validation-rehearsal/prop_staging_complete/public-integrity-overview.json",
          note: "staging clean VM proof with payout closure",
          recordedByUserId: "operator_validation_chain",
          checkedAt: "2026-06-07T00:35:00.000Z",
          recordedAt: "2026-06-07T00:36:00.000Z",
        };
      },
    },
  });

  const snapshot = await monitoring.getRuntimeContract();
  const validationProofGate = snapshot.releaseChecklist.find(
    (item) => item.id === "validation-proof",
  );

  assert.equal(snapshot.validationProofRecord?.proofComplete, true);
  assert.equal(snapshot.validationProofRecord?.rewardPayoutStaleExecutingCount, 0);
  assert.equal(
    snapshot.validationProofRecord?.rewardPayoutArtifactPath,
    "validation-rehearsal/prop_staging_complete/reward-payout-summary.json",
  );
  assert.equal(validationProofGate?.status, "ready");
  assert.deepEqual(validationProofGate?.blockingDependencies, []);
  assert.equal(snapshot.releaseReadiness.status, "ready");
  assert.deepEqual(snapshot.releaseReadiness.blockingDependencies, []);
  assert.equal(snapshot.operatorSummary.focusArea, "healthy");
});
