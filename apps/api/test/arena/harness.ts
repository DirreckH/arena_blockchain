import type {
  Bet,
  EffectiveSampleCounter,
  InternalAuditEvent,
  Market,
  Proposition,
  Response,
  ResponseReview,
  RewardLedger,
  SystemKeyValue,
  UserReputation,
  UserTag,
  ValidationChainEvent,
} from "@prisma/client";
import type { PinoLogger } from "nestjs-pino";

import { ArenaConflictError } from "../../src/arena/arena.errors";
import { ArenaIdService } from "../../src/arena/arena-id.service";
import { BetRepository } from "../../src/arena/repositories/bet.repository";
import { DispatchTaskRepository } from "../../src/arena/repositories/dispatch-task.repository";
import { EffectiveSampleCounterRepository } from "../../src/arena/repositories/effective-sample-counter.repository";
import { InternalAuditEventRepository } from "../../src/arena/repositories/internal-audit-event.repository";
import { MarketRepository } from "../../src/arena/repositories/market.repository";
import { PropositionRepository } from "../../src/arena/repositories/proposition.repository";
import { ResponseReviewRepository } from "../../src/arena/repositories/response-review.repository";
import { ResponseRepository } from "../../src/arena/repositories/response.repository";
import { RewardLedgerRepository } from "../../src/arena/repositories/reward-ledger.repository";
import { SystemKeyValueRepository } from "../../src/arena/repositories/system-key-value.repository";
import { UserReputationRepository } from "../../src/arena/repositories/user-reputation.repository";
import { UserTagRepository } from "../../src/arena/repositories/user-tag.repository";
import { ValidationChainEventRepository } from "../../src/arena/repositories/validation-chain-event.repository";
import { BetService } from "../../src/arena/services/bet.service";
import { AccountViewService } from "../../src/arena/services/account-view.service";
import { AccountExportService } from "../../src/arena/services/account-export.service";
import { AccountPreferencesService } from "../../src/arena/services/account-preferences.service";
import { ConsensusClosureService } from "../../src/arena/services/consensus-closure.service";
import { DispatchEngineService } from "../../src/arena/services/dispatch-engine.service";
import { DispatchTaskService } from "../../src/arena/services/dispatch-task.service";
import { EffectiveSampleCounterService } from "../../src/arena/services/effective-sample-counter.service";
import { FreezeRevealOrchestratorService } from "../../src/arena/services/freeze-reveal-orchestrator.service";
import { InternalAuditService } from "../../src/arena/services/internal-audit.service";
import { InternalMonitoringService } from "../../src/arena/services/internal-monitoring.service";
import { InternalPropositionOpsService } from "../../src/arena/services/internal-proposition-ops.service";
import { InternalRewardAuditService } from "../../src/arena/services/internal-reward-audit.service";
import { MarketService } from "../../src/arena/services/market.service";
import { PropositionEngineService } from "../../src/arena/services/proposition-engine.service";
import { PropositionDraftService } from "../../src/arena/services/proposition-draft.service";
import { PropositionLifecycleAutomationService } from "../../src/arena/services/proposition-lifecycle-automation.service";
import { PropositionStateService } from "../../src/arena/services/proposition-state.service";
import { QualityEngineService } from "../../src/arena/services/quality-engine.service";
import { ResponseReviewService } from "../../src/arena/services/response-review.service";
import { ResponseService } from "../../src/arena/services/response.service";
import { RewardLedgerService } from "../../src/arena/services/reward-ledger.service";
import { ResultViewService } from "../../src/arena/services/result-view.service";
import { RewardViewService } from "../../src/arena/services/reward-view.service";
import { ReputationService } from "../../src/arena/services/reputation.service";
import { TagService } from "../../src/arena/services/tag.service";
import { ValidationSettlementService } from "../../src/arena/services/validation-settlement.service";
import { WatchlistService } from "../../src/arena/services/watchlist.service";
import type { ValidationChainAlertService } from "../../src/arena/validation-chain/validation-chain-alert.service";
import type { ValidationChainCommandRuntimeService } from "../../src/arena/validation-chain/validation-chain-command-runtime.service";
import { ValidationChainIdService } from "../../src/arena/validation-chain/validation-chain-id.service";
import { PrismaService } from "../../src/database/prisma.service";

type DispatchTaskRecord = Awaited<
  ReturnType<DispatchTaskRepository["findById"]>
> extends infer TResult
  ? NonNullable<TResult>
  : never;

interface ArenaStore {
  propositions: Proposition[];
  dispatchTasks: DispatchTaskRecord[];
  responses: Response[];
  responseReviews: ResponseReview[];
  counters: EffectiveSampleCounter[];
  markets: Market[];
  bets: Bet[];
  rewardLedgers: RewardLedger[];
  systemKeyValues: SystemKeyValue[];
  userReputations: UserReputation[];
  userTags: UserTag[];
  internalAuditEvents: InternalAuditEvent[];
  validationChainEvents: ValidationChainEvent[];
}

const ACTIVE_TASK_STATUSES = new Set(["assigned", "started"]);

const clone = <T>(value: T): T => structuredClone(value);

const now = (): Date => new Date();

const createEmptyStore = (): ArenaStore => ({
  propositions: [],
  dispatchTasks: [],
  responses: [],
  responseReviews: [],
  counters: [],
  markets: [],
  bets: [],
  rewardLedgers: [],
  systemKeyValues: [],
  userReputations: [],
  userTags: [],
  internalAuditEvents: [],
  validationChainEvents: [],
});

const restoreStore = (target: ArenaStore, snapshot: ArenaStore): void => {
  target.propositions = clone(snapshot.propositions);
  target.dispatchTasks = clone(snapshot.dispatchTasks);
  target.responses = clone(snapshot.responses);
  target.responseReviews = clone(snapshot.responseReviews);
  target.counters = clone(snapshot.counters);
  target.markets = clone(snapshot.markets);
  target.bets = clone(snapshot.bets);
  target.rewardLedgers = clone(snapshot.rewardLedgers);
  target.systemKeyValues = clone(snapshot.systemKeyValues);
  target.userReputations = clone(snapshot.userReputations);
  target.userTags = clone(snapshot.userTags);
  target.internalAuditEvents = clone(snapshot.internalAuditEvents);
  target.validationChainEvents = clone(snapshot.validationChainEvents);
};

const applyDefinedFields = <T extends Record<string, unknown>>(
  target: T,
  patch: Record<string, unknown>,
): void => {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      target[key as keyof T] = clone(value) as T[keyof T];
    }
  }

  if ("updatedAt" in target) {
    (target as Record<string, unknown>).updatedAt = now();
  }
};

class FakePrismaService {
  constructor(private readonly store: ArenaStore) {}

  async $transaction<T>(callback: (tx: FakePrismaService) => Promise<T>): Promise<T> {
    const snapshot = clone(this.store);

    try {
      return await callback(this);
    } catch (error) {
      restoreStore(this.store, snapshot);
      throw error;
    }
  }

  get systemKeyValue() {
    return {
      findFirst: async (input: {
        where?: { key?: string; deletedAt?: null };
      }) => {
        const key = input.where?.key;
        const deletedAt = input.where?.deletedAt;

        return clone(
          this.store.systemKeyValues.find((item) => {
            if (key !== undefined && item.key !== key) {
              return false;
            }
            if (deletedAt === null && item.deletedAt !== null) {
              return false;
            }
            return true;
          }) ?? null,
        );
      },
      create: async (input: { data: any }) => {
        const record: SystemKeyValue = {
          id: input.data.id,
          key: input.data.key,
          valueJson: clone(input.data.valueJson ?? null),
          description: input.data.description ?? null,
          createdAt: input.data.createdAt ?? now(),
          updatedAt: input.data.updatedAt ?? now(),
          deletedAt: input.data.deletedAt ?? null,
        };

        this.store.systemKeyValues.push(record);
        return clone(record);
      },
      update: async (input: { where: { id: string }; data: any }) => {
        const record = this.store.systemKeyValues.find(
          (item) => item.id === input.where.id,
        );
        if (!record) {
          throw new Error(`SystemKeyValue ${input.where.id} not found`);
        }

        applyDefinedFields(record as Record<string, unknown>, input.data);
        return clone(record);
      },
    };
  }
}

class TestArenaIdService {
  private readonly sequences = new Map<string, number>();

  next(namespace: string): string {
    const current = this.sequences.get(namespace) ?? 0;
    const nextValue = current + 1;
    this.sequences.set(namespace, nextValue);
    return `${namespace}_${nextValue}`;
  }
}

class FakePropositionRepository {
  constructor(private readonly store: ArenaStore) {}

  async list(
    filters: {
      status?: Proposition["status"];
      category?: Proposition["category"];
      marketEnabled?: boolean;
      createdFrom?: Date;
      createdTo?: Date;
    } = {},
  ): Promise<Proposition[]> {
    return clone(
      this.store.propositions
        .filter((item) => {
          if (filters.status && item.status !== filters.status) {
            return false;
          }
          if (filters.category && item.category !== filters.category) {
            return false;
          }
          if (
            filters.marketEnabled !== undefined &&
            item.marketEnabled !== filters.marketEnabled
          ) {
            return false;
          }
          if (
            filters.createdFrom &&
            item.createdAt.getTime() < filters.createdFrom.getTime()
          ) {
            return false;
          }
          if (
            filters.createdTo &&
            item.createdAt.getTime() > filters.createdTo.getTime()
          ) {
            return false;
          }
          return true;
        })
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    );
  }

  async findById(id: string): Promise<Proposition | null> {
    return clone(this.store.propositions.find((item) => item.id === id) ?? null);
  }

  async getLiveById(id: string): Promise<Proposition | null> {
    return clone(
      this.store.propositions.find(
        (item) => item.id === id && item.status === "live",
      ) ?? null,
    );
  }

  async create(data: any): Promise<Proposition> {
    const record: Proposition = {
      id: data.id,
      chainPkId: data.chainPkId ?? null,
      type: data.type ?? "consensus",
      structure: data.structure ?? "binary",
      rollingMode: data.rollingMode ?? "non_rolling",
      marketEnabled: data.marketEnabled ?? true,
      settlementTarget: data.settlementTarget ?? "final",
      category: data.category ?? "general",
      title: data.title,
      description: data.description,
      options: [...data.options],
      sampleConstraints: [...(data.sampleConstraints ?? [])],
      minEffectiveSample: data.minEffectiveSample,
      minBetAmount: data.minBetAmount,
      minDurationSeconds: data.minDurationSeconds,
      maxDurationSeconds: data.maxDurationSeconds,
      rewardBudget: data.rewardBudget,
      baseResponseReward: data.baseResponseReward,
      status: data.status ?? "draft",
      resultKind: data.resultKind ?? null,
      winningOption: data.winningOption ?? null,
      voidReason: data.voidReason ?? null,
      publishedAt: data.publishedAt ?? null,
      liveAt: data.liveAt ?? null,
      frozenAt: data.frozenAt ?? null,
      revealStartedAt: data.revealStartedAt ?? null,
      resultComputedAt: data.resultComputedAt ?? null,
      settledAt: data.settledAt ?? null,
      closedAt: data.closedAt ?? null,
      archivedAt: data.archivedAt ?? null,
      createdByUserId: data.createdByUserId,
      updatedByUserId: data.updatedByUserId ?? null,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };

    this.store.propositions.push(record);
    return clone(record);
  }

  async update(id: string, data: any): Promise<Proposition> {
    const record = this.store.propositions.find((item) => item.id === id);
    if (!record) {
      throw new Error(`Proposition ${id} not found`);
    }

    applyDefinedFields(record as Record<string, unknown>, data);
    return clone(record);
  }

  async updateStatus(id: string, status: Proposition["status"], data: any = {}) {
    return this.update(id, { ...data, status });
  }

  async listByIds(ids: string[]): Promise<Proposition[]> {
    if (ids.length === 0) {
      return [];
    }

    return clone(this.store.propositions.filter((item) => ids.includes(item.id)));
  }
}

class FakeValidationChainIdService {
  buildChainPropositionId(propositionId: string): string {
    return `chain_prop_${propositionId}`;
  }

  buildChainMarketId(marketId: string): string {
    return `chain_market_${marketId}`;
  }
}

class FakeDispatchTaskRepository {
  constructor(private readonly store: ArenaStore) {}

  async create(data: any): Promise<DispatchTaskRecord> {
    const duplicate = this.store.dispatchTasks.find(
      (item) =>
        item.propositionId === data.propositionId &&
        item.userId === data.userId &&
        ACTIVE_TASK_STATUSES.has(item.status),
    );
    if (duplicate) {
      throw new ArenaConflictError("dispatch_task.active_duplicate");
    }

    const record: DispatchTaskRecord = {
      id: data.id,
      propositionId: data.propositionId,
      userId: data.userId,
      status: data.status ?? "assigned",
      assignedAt: data.assignedAt,
      startedAt: data.startedAt ?? null,
      submittedAt: data.submittedAt ?? null,
      expiresAt: data.expiresAt,
      skipReason: data.skipReason ?? null,
      expiryReason: data.expiryReason ?? null,
      cooldownUntil: data.cooldownUntil ?? null,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };

    this.store.dispatchTasks.push(record);
    return clone(record);
  }

  async findById(id: string): Promise<DispatchTaskRecord | null> {
    return clone(this.store.dispatchTasks.find((item) => item.id === id) ?? null);
  }

  async findActiveByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<DispatchTaskRecord | null> {
    return clone(
      this.store.dispatchTasks.find(
        (item) =>
          item.propositionId === propositionId &&
          item.userId === userId &&
          ACTIVE_TASK_STATUSES.has(item.status),
      ) ?? null,
    );
  }

  async listByUser(userId: string): Promise<DispatchTaskRecord[]> {
    return clone(
      this.store.dispatchTasks
        .filter((item) => item.userId === userId)
        .sort((left, right) => right.assignedAt.getTime() - left.assignedAt.getTime()),
    );
  }

  async listByProposition(propositionId: string): Promise<DispatchTaskRecord[]> {
    return clone(
      this.store.dispatchTasks
        .filter((item) => item.propositionId === propositionId)
        .sort((left, right) => left.assignedAt.getTime() - right.assignedAt.getTime()),
    );
  }

  async listByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<DispatchTaskRecord[]> {
    return clone(
      this.store.dispatchTasks
        .filter(
          (item) => item.propositionId === propositionId && item.userId === userId,
        )
        .sort((left, right) => right.assignedAt.getTime() - left.assignedAt.getTime()),
    );
  }

  async update(id: string, data: any): Promise<DispatchTaskRecord> {
    const record = this.store.dispatchTasks.find((item) => item.id === id);
    if (!record) {
      throw new Error(`Dispatch task ${id} not found`);
    }

    applyDefinedFields(record as Record<string, unknown>, data);
    return clone(record);
  }

  async updateStatus(id: string, status: DispatchTaskRecord["status"], data: any = {}) {
    return this.update(id, { ...data, status });
  }

  async listExpiredTasks(currentTime: Date): Promise<DispatchTaskRecord[]> {
    return clone(
      this.store.dispatchTasks.filter(
        (item) =>
          ACTIVE_TASK_STATUSES.has(item.status) && item.expiresAt <= currentTime,
      ),
    );
  }
}

class FakeResponseRepository {
  constructor(private readonly store: ArenaStore) {}

  async createVersion(data: any): Promise<Response> {
    const duplicateVersion = this.store.responses.find(
      (item) =>
        item.taskId === data.taskId && item.responseVersion === data.responseVersion,
    );
    if (duplicateVersion) {
      throw new ArenaConflictError("response.version_conflict");
    }

    const duplicateLatest = this.store.responses.find(
      (item) =>
        item.propositionId === data.propositionId &&
        item.userId === data.userId &&
        item.isLatest &&
        data.isLatest,
    );
    if (duplicateLatest) {
      throw new ArenaConflictError("response.latest_conflict");
    }

    const record: Response = {
      id: data.id,
      propositionId: data.propositionId,
      taskId: data.taskId,
      userId: data.userId,
      responsePayload: clone(data.responsePayload),
      responseVersion: data.responseVersion ?? 1,
      isLatest: data.isLatest ?? true,
      selectedOption: data.selectedOption,
      confirmationOption: data.confirmationOption,
      clientStartedAt: data.clientStartedAt,
      clientSubmittedAt: data.clientSubmittedAt,
      understandingAck: data.understandingAck ?? false,
      submittedAt: data.submittedAt,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };

    this.store.responses.push(record);
    return clone(record);
  }

  async findById(id: string): Promise<Response | null> {
    return clone(this.store.responses.find((item) => item.id === id) ?? null);
  }

  async findLatestByTaskId(taskId: string): Promise<Response | null> {
    const latest = this.store.responses
      .filter((item) => item.taskId === taskId && item.isLatest)
      .sort((left, right) => right.responseVersion - left.responseVersion)[0];
    return clone(latest ?? null);
  }

  async findLatestByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<Response | null> {
    const latest = this.store.responses
      .filter(
        (item) =>
          item.propositionId === propositionId &&
          item.userId === userId &&
          item.isLatest,
      )
      .sort((left, right) => right.responseVersion - left.responseVersion)[0];
    return clone(latest ?? null);
  }

  async clearLatestByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<void> {
    for (const response of this.store.responses) {
      if (
        response.propositionId === propositionId &&
        response.userId === userId &&
        response.isLatest
      ) {
        response.isLatest = false;
        response.updatedAt = now();
      }
    }
  }

  async listByTaskId(taskId: string): Promise<Response[]> {
    return clone(
      this.store.responses
        .filter((item) => item.taskId === taskId)
        .sort((left, right) => left.responseVersion - right.responseVersion),
    );
  }

  async listLatestByProposition(propositionId: string): Promise<Response[]> {
    return clone(
      this.store.responses.filter(
        (item) => item.propositionId === propositionId && item.isLatest,
      ),
    );
  }

  async listLatestByUser(userId: string): Promise<Response[]> {
    return clone(
      this.store.responses
        .filter((item) => item.userId === userId && item.isLatest)
        .sort((left, right) => right.submittedAt.getTime() - left.submittedAt.getTime()),
    );
  }
}

class FakeResponseReviewRepository {
  constructor(private readonly store: ArenaStore) {}

  async create(data: any): Promise<ResponseReview> {
    const duplicate = this.store.responseReviews.find(
      (item) => item.responseId === data.responseId,
    );
    if (duplicate) {
      throw new ArenaConflictError("response_review.duplicate");
    }

    const record: ResponseReview = {
      id: data.id,
      responseId: data.responseId,
      status: data.status ?? "pending_review",
      qualityScore: data.qualityScore ?? 0,
      flags: [...(data.flags ?? [])],
      reasonCodes: [...(data.reasonCodes ?? [])],
      reviewedByUserId: data.reviewedByUserId ?? null,
      reviewedAt: data.reviewedAt ?? null,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };

    this.store.responseReviews.push(record);
    return clone(record);
  }

  async findByResponseId(responseId: string): Promise<ResponseReview | null> {
    return clone(
      this.store.responseReviews.find((item) => item.responseId === responseId) ??
        null,
    );
  }

  async update(responseId: string, data: any): Promise<ResponseReview> {
    const record = this.store.responseReviews.find(
      (item) => item.responseId === responseId,
    );
    if (!record) {
      throw new Error(`Response review ${responseId} not found`);
    }

    applyDefinedFields(record as Record<string, unknown>, data);
    return clone(record);
  }

  async listByPropositionId(propositionId: string): Promise<ResponseReview[]> {
    const responseIds = new Set(
      this.store.responses
        .filter((item) => item.propositionId === propositionId)
        .map((item) => item.id),
    );

    return clone(
      this.store.responseReviews.filter((item) => responseIds.has(item.responseId)),
    );
  }

  async listPendingByPropositionId(propositionId: string): Promise<ResponseReview[]> {
    const responseIds = new Set(
      this.store.responses
        .filter((item) => item.propositionId === propositionId)
        .map((item) => item.id),
    );

    return clone(
      this.store.responseReviews.filter(
        (item) =>
          item.status === "pending_review" && responseIds.has(item.responseId),
      ),
    );
  }

  async listFinalizedByPropositionId(
    propositionId: string,
  ): Promise<ResponseReview[]> {
    const responseIds = new Set(
      this.store.responses
        .filter((item) => item.propositionId === propositionId)
        .map((item) => item.id),
    );

    return clone(
      this.store.responseReviews.filter(
        (item) =>
          responseIds.has(item.responseId) && item.status !== "pending_review",
      ),
    );
  }

  async listFinalizedByUserId(userId: string): Promise<ResponseReview[]> {
    const responseIds = new Set(
      this.store.responses
        .filter((item) => item.userId === userId)
        .map((item) => item.id),
    );

    return clone(
      this.store.responseReviews.filter(
        (item) =>
          responseIds.has(item.responseId) && item.status !== "pending_review",
      ),
    );
  }
}

class FakeEffectiveSampleCounterRepository {
  constructor(private readonly store: ArenaStore) {}

  async findByPropositionId(
    propositionId: string,
  ): Promise<EffectiveSampleCounter | null> {
    return clone(this.store.counters.find((item) => item.propositionId === propositionId) ?? null);
  }

  async createIfMissing(
    propositionId: string,
    id: string,
  ): Promise<EffectiveSampleCounter> {
    const existing = this.store.counters.find(
      (item) => item.propositionId === propositionId,
    );
    if (existing) {
      return clone(existing);
    }

    const record: EffectiveSampleCounter = {
      id,
      propositionId,
      totalResponses: 0,
      reviewedResponses: 0,
      validCount: 0,
      partialValidCount: 0,
      invalidCount: 0,
      createdAt: now(),
      updatedAt: now(),
    };

    this.store.counters.push(record);
    return clone(record);
  }

  async upsertSnapshot(
    propositionId: string,
    id: string,
    snapshot: Pick<
      EffectiveSampleCounter,
      | "totalResponses"
      | "reviewedResponses"
      | "validCount"
      | "partialValidCount"
      | "invalidCount"
    >,
  ): Promise<EffectiveSampleCounter> {
    const existing = this.store.counters.find(
      (item) => item.propositionId === propositionId,
    );

    if (existing) {
      existing.totalResponses = snapshot.totalResponses;
      existing.reviewedResponses = snapshot.reviewedResponses;
      existing.validCount = snapshot.validCount;
      existing.partialValidCount = snapshot.partialValidCount;
      existing.invalidCount = snapshot.invalidCount;
      existing.updatedAt = now();
      return clone(existing);
    }

    const record: EffectiveSampleCounter = {
      id,
      propositionId,
      totalResponses: snapshot.totalResponses,
      reviewedResponses: snapshot.reviewedResponses,
      validCount: snapshot.validCount,
      partialValidCount: snapshot.partialValidCount,
      invalidCount: snapshot.invalidCount,
      createdAt: now(),
      updatedAt: now(),
    };

    this.store.counters.push(record);
    return clone(record);
  }
}

class FakeMarketRepository {
  constructor(private readonly store: ArenaStore) {}

  async findById(id: string): Promise<Market | null> {
    return clone(this.store.markets.find((item) => item.id === id) ?? null);
  }

  async findByPropositionId(propositionId: string): Promise<Market | null> {
    return clone(
      this.store.markets.find((item) => item.propositionId === propositionId) ??
        null,
    );
  }

  async list(): Promise<Market[]> {
    return clone(
      this.store.markets
        .slice()
        .sort((left, right) => {
          const leftLiveAt = left.liveAt?.getTime() ?? 0;
          const rightLiveAt = right.liveAt?.getTime() ?? 0;
          const liveDiff = rightLiveAt - leftLiveAt;
          if (liveDiff !== 0) {
            return liveDiff;
          }

          return right.createdAt.getTime() - left.createdAt.getTime();
        }),
    );
  }

  async create(data: any): Promise<Market> {
    const duplicate = this.store.markets.find(
      (item) => item.propositionId === data.propositionId,
    );
    if (duplicate) {
      throw new ArenaConflictError("market.duplicate");
    }

    const record: Market = {
      id: data.id,
      propositionId: data.propositionId,
      settlementTarget: data.settlementTarget ?? "final",
      status: data.status ?? "pre_live",
      chainMarketId: data.chainMarketId ?? null,
      chainPropositionId: data.chainPropositionId ?? null,
      chainStatus: data.chainStatus ?? null,
      chainOpenedAt: data.chainOpenedAt ?? null,
      chainFrozenAt: data.chainFrozenAt ?? null,
      chainResolvedAt: data.chainResolvedAt ?? null,
      chainCancelledAt: data.chainCancelledAt ?? null,
      chainResultKind: data.chainResultKind ?? null,
      chainWinningOption: data.chainWinningOption ?? null,
      chainVoidReason: data.chainVoidReason ?? null,
      resolutionTxHash: data.resolutionTxHash ?? null,
      cancelTxHash: data.cancelTxHash ?? null,
      chainSyncedAt: data.chainSyncedAt ?? null,
      currentPublicProgress: data.currentPublicProgress ?? null,
      lastPublicResult: data.lastPublicResult ?? null,
      liveAt: data.liveAt ?? null,
      frozenAt: data.frozenAt ?? null,
      settlingAt: data.settlingAt ?? null,
      settledAt: data.settledAt ?? null,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };

    this.store.markets.push(record);
    return clone(record);
  }

  async update(id: string, data: any): Promise<Market> {
    const record = this.store.markets.find((item) => item.id === id);
    if (!record) {
      throw new Error(`Market ${id} not found`);
    }

    applyDefinedFields(record as Record<string, unknown>, data);
    return clone(record);
  }

  async updateStatus(id: string, status: Market["status"], data: any = {}) {
    return this.update(id, { ...data, status });
  }

  async updatePublicProgress(id: string, currentPublicProgress: unknown) {
    return this.update(id, { currentPublicProgress });
  }
}

class FakeBetRepository {
  constructor(private readonly store: ArenaStore) {}

  async create(data: any): Promise<Bet> {
    const duplicate = this.store.bets.find(
      (item) => item.marketId === data.marketId && item.userId === data.userId,
    );
    if (duplicate) {
      throw new ArenaConflictError("bet.duplicate_position");
    }

    const record: Bet = {
      id: data.id,
      marketId: data.marketId,
      propositionId: data.propositionId,
      userId: data.userId,
      selectedOption: data.selectedOption,
      stakeAmount: data.stakeAmount,
      status: data.status ?? "placed",
      placedAt: data.placedAt,
      settledAt: data.settledAt ?? null,
      settlementOutcome: data.settlementOutcome ?? null,
      grossPayout: data.grossPayout ?? null,
      pnl: data.pnl ?? null,
      refundAmount: data.refundAmount ?? null,
      claimed: data.claimed ?? false,
      claimedAt: data.claimedAt ?? null,
      claimTxHash: data.claimTxHash ?? null,
      refundedAt: data.refundedAt ?? null,
      refundTxHash: data.refundTxHash ?? null,
      chainSyncedAt: data.chainSyncedAt ?? null,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };

    this.store.bets.push(record);
    return clone(record);
  }

  async findById(id: string): Promise<Bet | null> {
    return clone(this.store.bets.find((item) => item.id === id) ?? null);
  }

  async findByMarketAndUser(
    marketId: string,
    userId: string,
  ): Promise<Bet | null> {
    return clone(
      this.store.bets.find(
        (item) => item.marketId === marketId && item.userId === userId,
      ) ?? null,
    );
  }

  async listByMarketId(marketId: string): Promise<Bet[]> {
    return clone(
      this.store.bets
        .filter((item) => item.marketId === marketId)
        .sort((left, right) => left.placedAt.getTime() - right.placedAt.getTime()),
    );
  }

  async listByUserId(userId: string): Promise<Bet[]> {
    return clone(
      this.store.bets
        .filter((item) => item.userId === userId)
        .sort((left, right) => {
          const leftSettledAt = left.settledAt?.getTime() ?? 0;
          const rightSettledAt = right.settledAt?.getTime() ?? 0;
          const settledDiff = rightSettledAt - leftSettledAt;
          if (settledDiff !== 0) {
            return settledDiff;
          }

          return right.placedAt.getTime() - left.placedAt.getTime();
        }),
    );
  }

  async listByUser(userId: string): Promise<Bet[]> {
    return this.listByUserId(userId);
  }

  async update(id: string, data: any): Promise<Bet> {
    const record = this.store.bets.find((item) => item.id === id);
    if (!record) {
      throw new Error(`Bet ${id} not found`);
    }

    applyDefinedFields(record as Record<string, unknown>, data);
    return clone(record);
  }
}

class FakeRewardLedgerRepository {
  constructor(private readonly store: ArenaStore) {}

  async list(
    filters: {
      propositionId?: string;
      userId?: string;
      responseId?: string;
      status?: RewardLedger["status"];
      sourceType?: RewardLedger["sourceType"];
    } = {},
  ): Promise<RewardLedger[]> {
    return clone(
      this.store.rewardLedgers
        .filter((item) => {
          if (filters.propositionId && item.propositionId !== filters.propositionId) {
            return false;
          }
          if (filters.userId && item.userId !== filters.userId) {
            return false;
          }
          if (filters.responseId && item.responseId !== filters.responseId) {
            return false;
          }
          if (filters.status && item.status !== filters.status) {
            return false;
          }
          if (filters.sourceType && item.sourceType !== filters.sourceType) {
            return false;
          }
          return true;
        })
        .sort((left, right) => {
          const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();
          if (createdDiff !== 0) {
            return createdDiff;
          }
          return right.ledgerVersion - left.ledgerVersion;
        }),
    );
  }

  async create(data: any): Promise<RewardLedger> {
    const record: RewardLedger = {
      id: data.id,
      propositionId: data.propositionId,
      responseId: data.responseId,
      userId: data.userId,
      sourceType: data.sourceType ?? "response",
      sourceId: data.sourceId,
      ledgerVersion: data.ledgerVersion ?? 1,
      pendingAmount: data.pendingAmount,
      finalAmount: data.finalAmount ?? null,
      status: data.status ?? "pending",
      reviewStatus: data.reviewStatus ?? null,
      finalizedAt: data.finalizedAt ?? null,
      voidedAt: data.voidedAt ?? null,
      reversedAt: data.reversedAt ?? null,
      reversalOfLedgerId: data.reversalOfLedgerId ?? null,
      reasonCode: data.reasonCode ?? null,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };

    this.store.rewardLedgers.push(record);
    return clone(record);
  }

  async findById(id: string): Promise<RewardLedger | null> {
    return clone(this.store.rewardLedgers.find((item) => item.id === id) ?? null);
  }

  async findByResponseId(responseId: string): Promise<RewardLedger[]> {
    return clone(
      this.store.rewardLedgers
        .filter((item) => item.responseId === responseId)
        .sort((left, right) => left.ledgerVersion - right.ledgerVersion),
    );
  }

  async findLatestByResponseId(responseId: string): Promise<RewardLedger | null> {
    return clone(
      this.store.rewardLedgers
        .filter((item) => item.responseId === responseId)
        .sort((left, right) => right.ledgerVersion - left.ledgerVersion)[0] ??
        null,
    );
  }

  async findByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<RewardLedger | null> {
    return clone(
      this.store.rewardLedgers
        .filter(
          (item) => item.propositionId === propositionId && item.userId === userId,
        )
        .sort((left, right) => right.ledgerVersion - left.ledgerVersion)[0] ??
        null,
    );
  }

  async listByUser(userId: string): Promise<RewardLedger[]> {
    return clone(
      this.store.rewardLedgers
        .filter((item) => item.userId === userId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    );
  }

  async update(id: string, data: any): Promise<RewardLedger> {
    const record = this.store.rewardLedgers.find((item) => item.id === id);
    if (!record) {
      throw new Error(`Reward ledger ${id} not found`);
    }

    applyDefinedFields(record as Record<string, unknown>, data);
    return clone(record);
  }
}

class FakeSystemKeyValueRepository {
  constructor(private readonly store: ArenaStore) {}

  async findByKey(key: string): Promise<SystemKeyValue | null> {
    return clone(
      this.store.systemKeyValues.find(
        (item) => item.key === key && item.deletedAt === null,
      ) ?? null,
    );
  }

  async upsertByKey(
    key: string,
    create: any,
    update: any,
  ): Promise<SystemKeyValue> {
    const existing = this.store.systemKeyValues.find(
      (item) => item.key === key && item.deletedAt === null,
    );

    if (existing) {
      applyDefinedFields(existing as Record<string, unknown>, {
        ...update,
        deletedAt: null,
      });
      return clone(existing);
    }

    const record: SystemKeyValue = {
      id: create.id,
      key: create.key,
      valueJson: clone(create.valueJson ?? null),
      description: create.description ?? null,
      createdAt: create.createdAt ?? now(),
      updatedAt: create.updatedAt ?? now(),
      deletedAt: create.deletedAt ?? null,
    };

    this.store.systemKeyValues.push(record);
    return clone(record);
  }
}

class FakeInternalAuditEventRepository {
  constructor(private readonly store: ArenaStore) {}

  async create(data: any): Promise<InternalAuditEvent> {
    const record: InternalAuditEvent = {
      id: data.id,
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      actorUserId: data.actorUserId ?? null,
      reason: data.reason,
      note: data.note ?? null,
      metadataJson: clone(data.metadataJson ?? null),
      createdAt: data.createdAt ?? now(),
    };

    this.store.internalAuditEvents.push(record);
    return clone(record);
  }

  async listByEntity(
    entityType: string,
    entityId: string,
  ): Promise<InternalAuditEvent[]> {
    return clone(
      this.store.internalAuditEvents
        .filter(
          (item) => item.entityType === entityType && item.entityId === entityId,
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    );
  }

  async listByEntityIds(
    entityType: string,
    entityIds: string[],
  ): Promise<InternalAuditEvent[]> {
    return clone(
      this.store.internalAuditEvents
        .filter(
          (item) =>
            item.entityType === entityType && entityIds.includes(item.entityId),
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    );
  }
}

class FakeValidationChainEventRepository {
  constructor(private readonly store: ArenaStore) {}

  async listIdsByChainReferences(input: {
    propositionChainId?: string | null;
    marketChainId?: string | null;
  }): Promise<string[]> {
    return clone(
      this.store.validationChainEvents
        .filter(
          (event) =>
            (input.propositionChainId !== undefined &&
              input.propositionChainId !== null &&
              event.propositionChainId === input.propositionChainId) ||
            (input.marketChainId !== undefined &&
              input.marketChainId !== null &&
              event.marketChainId === input.marketChainId),
        )
        .map((event) => event.id),
    );
  }
}

class FakeUserReputationRepository {
  constructor(private readonly store: ArenaStore) {}

  async findByUserId(userId: string): Promise<UserReputation | null> {
    return clone(
      this.store.userReputations.find((item) => item.userId === userId) ?? null,
    );
  }

  async upsertByUserId(
    userId: string,
    create: any,
    update: any,
  ): Promise<UserReputation> {
    const existing = this.store.userReputations.find(
      (item) => item.userId === userId,
    );

    if (existing) {
      applyDefinedFields(existing as Record<string, unknown>, update);
      return clone(existing);
    }

    const record: UserReputation = {
      id: create.id,
      userId: create.userId,
      reputationScore: create.reputationScore,
      reputationLevel: create.reputationLevel,
      ruleVersion: create.ruleVersion,
      metricsJson: clone(create.metricsJson),
      computedAt: create.computedAt,
      createdAt: create.createdAt ?? now(),
      updatedAt: create.updatedAt ?? now(),
    };

    this.store.userReputations.push(record);
    return clone(record);
  }
}

class FakeUserTagRepository {
  constructor(private readonly store: ArenaStore) {}

  async listByUser(userId: string): Promise<UserTag[]> {
    return clone(
      this.store.userTags
        .filter((item) => item.userId === userId)
        .sort((left, right) => {
          const leftExpires = left.expiresAt?.getTime() ?? Number.MIN_SAFE_INTEGER;
          const rightExpires = right.expiresAt?.getTime() ?? Number.MIN_SAFE_INTEGER;
          if (leftExpires !== rightExpires) {
            return leftExpires - rightExpires;
          }

          return right.updatedAt.getTime() - left.updatedAt.getTime();
        }),
    );
  }

  async listCurrentByUser(userId: string): Promise<UserTag[]> {
    return clone(
      this.store.userTags
        .filter((item) => item.userId === userId && item.expiresAt === null)
        .sort((left, right) => {
          if (left.tagType !== right.tagType) {
            return left.tagType.localeCompare(right.tagType);
          }

          if (left.confidenceScore !== right.confidenceScore) {
            return right.confidenceScore - left.confidenceScore;
          }

          return left.tagKey.localeCompare(right.tagKey);
        }),
    );
  }

  async findByUserIdAndTagKey(
    userId: string,
    tagKey: string,
  ): Promise<UserTag | null> {
    return clone(
      this.store.userTags.find(
        (item) => item.userId === userId && item.tagKey === tagKey,
      ) ?? null,
    );
  }

  async upsertByUserIdAndTagKey(
    userId: string,
    tagKey: string,
    create: any,
    update: any,
  ): Promise<UserTag> {
    const existing = this.store.userTags.find(
      (item) => item.userId === userId && item.tagKey === tagKey,
    );

    if (existing) {
      applyDefinedFields(existing as Record<string, unknown>, update);
      return clone(existing);
    }

    const record: UserTag = {
      id: create.id,
      userId: create.userId,
      tagKey: create.tagKey,
      tagType: create.tagType,
      tagValue: create.tagValue,
      confidenceScore: create.confidenceScore,
      sourceType: create.sourceType,
      ruleVersion: create.ruleVersion,
      metadataJson: clone(create.metadataJson),
      activatedAt: create.activatedAt,
      expiresAt: create.expiresAt ?? null,
      createdAt: create.createdAt ?? now(),
      updatedAt: create.updatedAt ?? now(),
    };

    this.store.userTags.push(record);
    return clone(record);
  }

  async update(id: string, data: any): Promise<UserTag> {
    const record = this.store.userTags.find((item) => item.id === id);
    if (!record) {
      throw new Error(`User tag ${id} not found`);
    }

    applyDefinedFields(record as Record<string, unknown>, data);
    return clone(record);
  }
}

export interface ArenaHarness {
  store: ArenaStore;
  propositionService: PropositionStateService;
  propositionEngineService: PropositionEngineService;
  propositionDraftService: PropositionDraftService;
  propositionLifecycleAutomationService: PropositionLifecycleAutomationService;
  dispatchEngineService: DispatchEngineService;
  dispatchTaskService: DispatchTaskService;
  qualityEngineService: QualityEngineService;
  responseService: ResponseService;
  responseReviewService: ResponseReviewService;
  counterService: EffectiveSampleCounterService;
  freezeRevealOrchestratorService: FreezeRevealOrchestratorService;
  marketService: MarketService;
  betService: BetService;
  validationSettlementService: ValidationSettlementService;
  rewardLedgerService: RewardLedgerService;
  accountExportService: AccountExportService;
  accountPreferencesService: AccountPreferencesService;
  watchlistService: WatchlistService;
  reputationService: ReputationService;
  tagService: TagService;
  consensusClosureService: ConsensusClosureService;
  internalAuditService: InternalAuditService;
  internalMonitoringService: InternalMonitoringService;
  internalPropositionOpsService: InternalPropositionOpsService;
  internalRewardAuditService: InternalRewardAuditService;
  validationChainIdService: FakeValidationChainIdService;
  propositionRepository: FakePropositionRepository;
  dispatchTaskRepository: FakeDispatchTaskRepository;
  responseRepository: FakeResponseRepository;
  responseReviewRepository: FakeResponseReviewRepository;
  counterRepository: FakeEffectiveSampleCounterRepository;
  marketRepository: FakeMarketRepository;
  betRepository: FakeBetRepository;
  rewardLedgerRepository: FakeRewardLedgerRepository;
  systemKeyValueRepository: FakeSystemKeyValueRepository;
  userReputationRepository: FakeUserReputationRepository;
  userTagRepository: FakeUserTagRepository;
  internalAuditEventRepository: FakeInternalAuditEventRepository;
  validationChainEventRepository: FakeValidationChainEventRepository;
}

interface ArenaHarnessOptions {
  validationChainRuntime?: ValidationChainCommandRuntimeService;
  validationChainAlerts?: ValidationChainAlertService;
}

export const createArenaHarness = (
  options: ArenaHarnessOptions = {},
): ArenaHarness => {
  const store = createEmptyStore();
  const prisma = new FakePrismaService(store) as unknown as PrismaService;
  const ids = new TestArenaIdService() as unknown as ArenaIdService;

  const propositionRepository =
    new FakePropositionRepository(store) as unknown as PropositionRepository;
  const dispatchTaskRepository =
    new FakeDispatchTaskRepository(store) as unknown as DispatchTaskRepository;
  const responseRepository =
    new FakeResponseRepository(store) as unknown as ResponseRepository;
  const responseReviewRepository =
    new FakeResponseReviewRepository(store) as unknown as ResponseReviewRepository;
  const counterRepository =
    new FakeEffectiveSampleCounterRepository(
      store,
    ) as unknown as EffectiveSampleCounterRepository;
  const marketRepository =
    new FakeMarketRepository(store) as unknown as MarketRepository;
  const betRepository = new FakeBetRepository(store) as unknown as BetRepository;
  const rewardLedgerRepository =
    new FakeRewardLedgerRepository(store) as unknown as RewardLedgerRepository;
  const systemKeyValueRepository =
    new FakeSystemKeyValueRepository(store) as unknown as SystemKeyValueRepository;
  const internalAuditEventRepository =
    new FakeInternalAuditEventRepository(
      store,
    ) as unknown as InternalAuditEventRepository;
  const validationChainEventRepository =
    new FakeValidationChainEventRepository(
      store,
    ) as unknown as ValidationChainEventRepository;
  const userReputationRepository =
    new FakeUserReputationRepository(
      store,
    ) as unknown as UserReputationRepository;
  const userTagRepository =
    new FakeUserTagRepository(store) as unknown as UserTagRepository;
  const validationChainIdService =
    new FakeValidationChainIdService() as unknown as ValidationChainIdService;

  const counterService = new EffectiveSampleCounterService(
    prisma,
    ids,
    propositionRepository,
    counterRepository,
    responseRepository,
    responseReviewRepository,
    marketRepository,
  );
  const rewardLedgerService = new RewardLedgerService(
    prisma,
    ids,
    propositionRepository,
    responseRepository,
    rewardLedgerRepository,
  );
  const accountPreferencesService = new AccountPreferencesService(
    prisma,
    ids,
    systemKeyValueRepository,
  );
  const watchlistService = new WatchlistService(
    prisma,
    ids,
    systemKeyValueRepository,
    marketRepository,
    propositionRepository,
  );
  const internalAuditService = new InternalAuditService(
    prisma,
    ids,
    internalAuditEventRepository,
  );
  const logger: Pick<PinoLogger, "setContext" | "error" | "warn" | "info" | "debug"> = {
    setContext() {},
    error() {},
    warn() {},
    info() {},
    debug() {},
  } as Pick<PinoLogger, "setContext" | "error" | "warn" | "info" | "debug">;
  const reputationService = new ReputationService(
    prisma,
    ids,
    dispatchTaskRepository,
    responseReviewRepository,
    userReputationRepository,
  );
  const tagService = new TagService(
    prisma,
    ids,
    responseRepository,
    propositionRepository,
    userReputationRepository,
    userTagRepository,
  );
  const reviewService = new ResponseReviewService(
    prisma,
    ids,
    responseRepository,
    responseReviewRepository,
    rewardLedgerService,
    reputationService,
    tagService,
  );
  const dispatchTaskService = new DispatchTaskService(
    prisma,
    ids,
    propositionRepository,
    dispatchTaskRepository,
    reputationService,
    tagService,
  );
  const dispatchEngineService = new DispatchEngineService(
    prisma,
    propositionRepository,
    dispatchTaskRepository,
    responseRepository,
    userReputationRepository,
    userTagRepository,
    dispatchTaskService,
  );
  const responseService = new ResponseService(
    prisma,
    ids,
    propositionRepository,
    dispatchTaskRepository,
    responseRepository,
    dispatchTaskService,
    reviewService,
    rewardLedgerService,
  );
  const qualityEngineService = new QualityEngineService(
    prisma,
    propositionRepository,
    dispatchTaskRepository,
    responseRepository,
    reviewService,
  );
  const marketService = new MarketService(
    prisma,
    ids,
    propositionRepository,
    marketRepository,
    betRepository,
    counterService,
  );
  const propositionService = new PropositionStateService(
    prisma,
    ids,
    propositionRepository,
    marketService,
  );
  const propositionEngineService = new PropositionEngineService(
    prisma,
    propositionRepository,
    propositionService,
    marketService,
    options.validationChainRuntime,
  );
  const propositionDraftService = new PropositionDraftService(
    prisma,
    propositionRepository,
    internalAuditService,
    propositionEngineService,
  );
  const freezeRevealOrchestratorService = new FreezeRevealOrchestratorService(
    prisma,
    propositionRepository,
    responseRepository,
    responseReviewRepository,
    counterService,
    marketRepository,
    propositionService,
    options.validationChainRuntime,
  );
  const betService = new BetService(
    prisma,
    ids,
    propositionRepository,
    marketRepository,
    betRepository,
  );
  const validationSettlementService = new ValidationSettlementService(
    prisma,
    propositionRepository,
    marketRepository,
    betRepository,
    marketService,
    propositionService,
    counterService,
  );
  const propositionLifecycleAutomationService =
    new PropositionLifecycleAutomationService(
      propositionRepository,
      marketRepository,
      propositionEngineService,
      freezeRevealOrchestratorService,
      validationSettlementService,
      internalAuditService,
      logger as PinoLogger,
      options.validationChainRuntime,
    );
  const consensusClosureService = new ConsensusClosureService(
    prisma,
    propositionRepository,
    responseRepository,
    responseReviewRepository,
    counterService,
    marketRepository,
    propositionService,
    validationSettlementService,
  );
  const internalMonitoringService = new InternalMonitoringService(
    prisma,
    propositionRepository,
    marketRepository,
    responseRepository,
    responseReviewRepository,
    userReputationRepository,
    counterService,
    options.validationChainAlerts,
  );
  const internalPropositionOpsService = new InternalPropositionOpsService(
    prisma,
    propositionRepository,
    dispatchTaskRepository,
    responseReviewRepository,
    rewardLedgerRepository,
    marketRepository,
    validationChainEventRepository,
    counterService,
    propositionEngineService,
    propositionService,
    freezeRevealOrchestratorService,
    internalAuditService,
    validationChainIdService,
  );
  const internalRewardAuditService = new InternalRewardAuditService(
    prisma,
    propositionRepository,
    responseRepository,
    responseReviewRepository,
    rewardLedgerRepository,
    rewardLedgerService,
    internalAuditService,
  );
  const rewardViewService = new RewardViewService(
    propositionRepository,
    rewardLedgerService,
  );
  const resultViewService = new ResultViewService(
    propositionRepository,
    counterRepository,
    rewardLedgerService,
    marketRepository,
    betRepository,
  );
  const accountViewService = new AccountViewService(
    rewardViewService,
    reputationService,
    tagService,
    resultViewService,
  );
  const accountExportService = new AccountExportService(
    prisma,
    ids,
    systemKeyValueRepository,
    accountViewService,
    accountPreferencesService,
  );

  return {
    store,
    propositionService,
    propositionEngineService,
    propositionDraftService,
    propositionLifecycleAutomationService,
    dispatchEngineService,
    dispatchTaskService,
    qualityEngineService,
    responseService,
    responseReviewService: reviewService,
    counterService,
    freezeRevealOrchestratorService,
    marketService,
    betService,
    validationSettlementService,
    rewardLedgerService,
    accountExportService,
    accountPreferencesService,
    watchlistService,
    reputationService,
    tagService,
    consensusClosureService,
    internalAuditService,
    internalMonitoringService,
    internalPropositionOpsService,
    internalRewardAuditService,
    validationChainIdService:
      validationChainIdService as unknown as FakeValidationChainIdService,
    propositionRepository: propositionRepository as unknown as FakePropositionRepository,
    dispatchTaskRepository:
      dispatchTaskRepository as unknown as FakeDispatchTaskRepository,
    responseRepository: responseRepository as unknown as FakeResponseRepository,
    responseReviewRepository:
      responseReviewRepository as unknown as FakeResponseReviewRepository,
    counterRepository:
      counterRepository as unknown as FakeEffectiveSampleCounterRepository,
    marketRepository: marketRepository as unknown as FakeMarketRepository,
    betRepository: betRepository as unknown as FakeBetRepository,
    rewardLedgerRepository:
      rewardLedgerRepository as unknown as FakeRewardLedgerRepository,
    systemKeyValueRepository:
      systemKeyValueRepository as unknown as FakeSystemKeyValueRepository,
    userReputationRepository:
      userReputationRepository as unknown as FakeUserReputationRepository,
    userTagRepository: userTagRepository as unknown as FakeUserTagRepository,
    internalAuditEventRepository:
      internalAuditEventRepository as unknown as FakeInternalAuditEventRepository,
    validationChainEventRepository:
      validationChainEventRepository as unknown as FakeValidationChainEventRepository,
  };
};
