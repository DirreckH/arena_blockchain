import { Injectable } from "@nestjs/common";
import type {
  Bet,
  DispatchTask,
  Proposition,
  ResponseReview,
  RewardLedger,
  ValidationChainEvent,
} from "@prisma/client";
import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import {
  type ApprovePropositionControlInput,
  type EmergencyFreezePropositionControlInput,
  INTERNAL_AUDIT_ENTITY_TYPES,
  type InternalPropositionEvidenceBundleViewModel,
  type InternalPropositionDetailViewModel,
  type InternalPropositionListFilters,
  type InternalPropositionListItemViewModel,
  type InternalPropositionListPageViewModel,
  type PropositionDispatchSummaryViewModel,
  type PropositionValidationRehearsalCheckpointViewModel,
  type PropositionValidationRehearsalStepId,
  type PropositionValidationRehearsalStepStatus,
  type PropositionValidationRehearsalViewModel,
  type PropositionReviewSummaryViewModel,
  type PropositionRewardSummaryViewModel,
  type RejectPropositionControlInput,
} from "../internal-ops.types";
import {
  PROPOSITION_AUDIT_ACTIONS,
  buildPropositionSubmissionSnapshot,
} from "../proposition-submission";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { toDate } from "../arena.utils";
import { PrismaService } from "../../database/prisma.service";
import { BetRepository } from "../repositories/bet.repository";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { RewardLedgerRepository } from "../repositories/reward-ledger.repository";
import { ValidationChainEventRepository } from "../repositories/validation-chain-event.repository";
import { buildValidationLifecycleSnapshot } from "../validation-lifecycle";
import { EffectiveSampleCounterService } from "./effective-sample-counter.service";
import { FreezeRevealOrchestratorService } from "./freeze-reveal-orchestrator.service";
import { InternalAuditService } from "./internal-audit.service";
import { InternalMonitoringService } from "./internal-monitoring.service";
import { PropositionEngineService } from "./proposition-engine.service";
import { PropositionStateService } from "./proposition-state.service";
import { ArenaUserIdentityService } from "./arena-user-identity.service";
import { ValidationRehearsalCheckpointService } from "./validation-rehearsal-checkpoint.service";
import { assertPropositionTransition } from "../state-machines/proposition-state.machine";
import { ValidationChainIdService } from "../validation-chain/validation-chain-id.service";

const VALIDATION_REHEARSAL_RUNBOOK_PATH =
  "docs/contracts/arena-validation-chain-runbook.md";
const VALIDATION_REHEARSAL_TARGET_OUTCOME =
  "One proposition completes publish -> local bet -> on-chain placeBet -> manual or scheduled sync -> projection -> settlement against deployed validation infrastructure.";
const VALIDATION_REHEARSAL_RUNTIME_CONTRACT_ROUTE =
  "GET /arena/internal/monitoring/runtime-contract";
const VALIDATION_REHEARSAL_CHAIN_MONITORING_ROUTE =
  "GET /arena/internal/monitoring/validation-chain";
const VALIDATION_REHEARSAL_DRIFT_ROUTE =
  "GET /arena/internal/monitoring/validation-lifecycle-drift";
const VALIDATION_LIFECYCLE_DRIFT_AUDIT_ACTION =
  "validation_chain.alert.lifecycle_drift";
const VALIDATION_CHAIN_BATCH_RECONCILIATION_ENTITY_ID =
  "validation_chain_unsynced_bet_backlog";
const VALIDATION_CHAIN_COMMAND_RECOVERY_AUDIT_ACTIONS = new Set([
  "validation_chain.command_recovery.queued",
  "validation_chain.command_recovery.already_pending",
  "validation_chain.command_recovery.partial_failure",
  "validation_chain.command_recovery.enqueue_failed",
]);
const VALIDATION_CHAIN_RECOVERY_FOLLOW_THROUGH_AUDIT_ACTIONS = new Set([
  "validation_chain.projection_replay.performed",
  "validation_chain.bet_reconciliation.performed",
  "validation_chain.bet_reconciliation.batch.performed",
]);
const VALIDATION_CHAIN_COMMAND_PROBLEM_AUDIT_ACTIONS = new Set([
  "validation_chain.alert.command_terminal",
  "validation_chain.alert.command_retry_exhausted",
]);
const VALIDATION_CHAIN_EVENT_PROBLEM_AUDIT_ACTIONS = new Set([
  "validation_chain.project.failed",
  "validation_chain.alert.projector_entity_missing",
]);
const VALIDATION_CHAIN_TIMELINE_NOISE_ACTIONS = new Set([
  "validation_chain.command.skipped",
]);

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

const sortAuditEventsDesc = <T extends { createdAt: string; id: string }>(
  events: T[],
): T[] =>
  [...events].sort((left, right) => {
    const timeDiff = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return right.id.localeCompare(left.id);
  });

const dedupeAuditEventsById = <T extends { id: string }>(events: T[]): T[] => {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) {
      return false;
    }

    seen.add(event.id);
    return true;
  });
};

const DEFAULT_OPS_PAGE_LIMIT = 25;
const MAX_OPS_PAGE_LIMIT = 100;

const normalizeSearch = (value?: string): string | null => {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
};

const clampLimit = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_OPS_PAGE_LIMIT;
  }
  return Math.min(MAX_OPS_PAGE_LIMIT, Math.max(1, Math.trunc(value ?? DEFAULT_OPS_PAGE_LIMIT)));
};

const clampOffset = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value ?? 0));
};

const compareStrings = (
  left: string,
  right: string,
  direction: "asc" | "desc",
): number => {
  const normalized = left.localeCompare(right);
  return direction === "asc" ? normalized : -normalized;
};

const compareNullableDates = (
  left: string | null,
  right: string | null,
  direction: "asc" | "desc",
): number => {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  const diff = leftTime - rightTime;
  return direction === "asc" ? diff : -diff;
};

const compareNumbers = (
  left: number,
  right: number,
  direction: "asc" | "desc",
): number => {
  const diff = left - right;
  return direction === "asc" ? diff : -diff;
};

const sumAmountStrings = (
  values: Array<string | null | undefined>,
): string =>
  values
    .filter((value): value is string => Boolean(value))
    .reduce((total, value) => total + BigInt(value), 0n)
    .toString();

const buildTopFlags = (reviews: ResponseReview[]): Array<{ flag: string; count: number }> => {
  const counts = new Map<string, number>();

  for (const review of reviews) {
    for (const flag of review.flags) {
      counts.set(flag, (counts.get(flag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([flag, count]) => ({ flag, count }));
};

@Injectable()
export class InternalPropositionOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly dispatchTasks: DispatchTaskRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly rewards: RewardLedgerRepository,
    private readonly markets: MarketRepository,
    private readonly bets: BetRepository,
    private readonly validationChainEvents: ValidationChainEventRepository,
    private readonly counters: EffectiveSampleCounterService,
    private readonly propositionEngine: PropositionEngineService,
    private readonly propositionState: PropositionStateService,
    private readonly freezeReveal: FreezeRevealOrchestratorService,
    private readonly audits: InternalAuditService,
    private readonly userIdentity: ArenaUserIdentityService,
    private readonly monitoring: InternalMonitoringService,
    private readonly validationRehearsalCheckpoints: ValidationRehearsalCheckpointService,
    private readonly validationChainIds: ValidationChainIdService,
  ) {}

  async listPropositions(
    filters: InternalPropositionListFilters,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionListPageViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.pagePropositionItems(
        await this.buildPropositionListItems(filters, tx),
        filters,
        filters.sortBy ?? "createdAt",
        filters.sortDirection ?? "desc",
      ),
    );
  }

  async listReviewQueue(
    filters: Omit<InternalPropositionListFilters, "status" | "submissionStatus">,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionListPageViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.pagePropositionItems(
        await this.buildPropositionListItems(
          {
            ...filters,
            status: "draft",
            submissionStatus: "submitted",
          },
          tx,
        ),
        filters,
        filters.sortBy ?? "submittedAt",
        filters.sortDirection ?? "desc",
      ),
    );
  }

  private async buildPropositionListItems(
    filters: InternalPropositionListFilters,
    tx: ArenaDbClient,
  ): Promise<InternalPropositionListItemViewModel[]> {
    const propositions = await this.propositions.list(
      {
        status: filters.status,
        category: filters.category,
        marketEnabled: filters.marketEnabled,
        createdFrom: filters.createdFrom ? toDate(filters.createdFrom) : undefined,
        createdTo: filters.createdTo ? toDate(filters.createdTo) : undefined,
      },
      tx,
    );
    const propositionAudits = await this.audits.listByEntityIds(
      INTERNAL_AUDIT_ENTITY_TYPES.proposition,
      propositions.map((proposition) => proposition.id),
      tx,
    );
    const auditsByPropositionId = new Map<string, typeof propositionAudits>();
    for (const event of propositionAudits) {
      const existing = auditsByPropositionId.get(event.entityId) ?? [];
      existing.push(event);
      auditsByPropositionId.set(event.entityId, existing);
    }

    const items = await Promise.all(
      propositions.map(async (proposition) => {
        const [counter, pendingReviews] = await Promise.all([
          this.counters.rebuildCounterForProposition(proposition.id, tx),
          this.reviews.listPendingByPropositionId(proposition.id, tx),
        ]);
        const submission = buildPropositionSubmissionSnapshot(
          proposition,
          auditsByPropositionId.get(proposition.id) ?? [],
        );

        return {
          propositionId: proposition.id,
          title: proposition.title,
          category: proposition.category,
          status: proposition.status,
          submissionStatus: submission.status,
          submittedAt: submission.submittedAt,
          marketEnabled: proposition.marketEnabled,
          createdAt: proposition.createdAt.toISOString(),
          publishedAt: toIso(proposition.publishedAt),
          liveAt: toIso(proposition.liveAt),
          frozenAt: toIso(proposition.frozenAt),
          settledAt: toIso(proposition.settledAt),
          minEffectiveSample: proposition.minEffectiveSample,
          effectiveSampleCount: counter.effectiveSampleCount,
          reviewedResponseCount: counter.reviewedResponses,
          pendingReviewCount: pendingReviews.length,
          sampleShortageCount: Math.max(
            0,
            proposition.minEffectiveSample - counter.effectiveSampleCount,
          ),
        };
      }),
    );

    return items.filter(
      (item) =>
        filters.submissionStatus === undefined ||
        item.submissionStatus === filters.submissionStatus,
    );
  }

  private pagePropositionItems(
    items: InternalPropositionListItemViewModel[],
    filters: Pick<
      InternalPropositionListFilters,
      "search" | "sortBy" | "sortDirection" | "limit" | "offset"
    >,
    defaultSortBy: NonNullable<InternalPropositionListFilters["sortBy"]>,
    defaultDirection: NonNullable<InternalPropositionListFilters["sortDirection"]>,
  ): InternalPropositionListPageViewModel {
    const search = normalizeSearch(filters.search);
    const sortBy = filters.sortBy ?? defaultSortBy;
    const direction = filters.sortDirection ?? defaultDirection;
    const limit = clampLimit(filters.limit);
    const offset = clampOffset(filters.offset);

    const filteredItems = items
      .filter((item) => {
        if (!search) {
          return true;
        }

        return [
          item.propositionId,
          item.title,
          item.category,
          item.status,
          item.submissionStatus,
        ].some((value) => value.toLowerCase().includes(search));
      })
      .sort((left, right) =>
        this.comparePropositionItems(left, right, sortBy, direction),
      );

    return {
      items: filteredItems.slice(offset, offset + limit),
      totalCount: filteredItems.length,
      limit,
      offset,
    };
  }

  private comparePropositionItems(
    left: InternalPropositionListItemViewModel,
    right: InternalPropositionListItemViewModel,
    sortBy: NonNullable<InternalPropositionListFilters["sortBy"]>,
    direction: NonNullable<InternalPropositionListFilters["sortDirection"]>,
  ): number {
    switch (sortBy) {
      case "submittedAt":
        return (
          compareNullableDates(left.submittedAt, right.submittedAt, direction) ||
          compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "title":
        return (
          compareStrings(left.title, right.title, direction) ||
          compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "effectiveSampleCount":
        return (
          compareNumbers(
            left.effectiveSampleCount,
            right.effectiveSampleCount,
            direction,
          ) || compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "pendingReviewCount":
        return (
          compareNumbers(
            left.pendingReviewCount,
            right.pendingReviewCount,
            direction,
          ) || compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "sampleShortageCount":
        return (
          compareNumbers(
            left.sampleShortageCount,
            right.sampleShortageCount,
            direction,
          ) || compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "createdAt":
      default:
        return (
          compareNullableDates(left.createdAt, right.createdAt, direction) ||
          compareStrings(left.propositionId, right.propositionId, direction)
        );
    }
  }

  async approveProposition(
    input: ApprovePropositionControlInput,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(input.actorUserId, undefined, tx);
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      const audits = await this.audits.listByEntity(
        INTERNAL_AUDIT_ENTITY_TYPES.proposition,
        proposition.id,
        tx,
      );
      const submission = buildPropositionSubmissionSnapshot(proposition, audits);
      this.assertSubmittedDraftReadyForReview(
        proposition,
        submission.status,
        "approve",
      );

      const approved = await this.propositionEngine.approveOrScheduleProposition(
        {
          propositionId: input.propositionId,
          publishedAt: input.publishedAt,
          updatedByUserId: input.actorUserId,
        },
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.proposition,
          entityId: approved.id,
          action: PROPOSITION_AUDIT_ACTIONS.approved,
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            publishedAt: toDate(input.publishedAt).toISOString(),
            nextStatus: approved.status,
          },
        },
        tx,
      );

      return this.buildDetailView(approved.id, tx);
    });
  }

  async rejectProposition(
    input: RejectPropositionControlInput,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      const audits = await this.audits.listByEntity(
        INTERNAL_AUDIT_ENTITY_TYPES.proposition,
        proposition.id,
        tx,
      );
      const submission = buildPropositionSubmissionSnapshot(proposition, audits);
      this.assertSubmittedDraftReadyForReview(
        proposition,
        submission.status,
        "reject",
      );

      assertPropositionTransition(proposition.status, "archived", "reject");
      const archivedAt = toDate(input.rejectedAt);
      const rejected = await this.propositions.updateStatus(
        proposition.id,
        "archived",
        {
          archivedAt,
          updatedByUserId: input.actorUserId,
        },
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.proposition,
          entityId: rejected.id,
          action: PROPOSITION_AUDIT_ACTIONS.rejected,
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            previousStatus: proposition.status,
            archivedAt: archivedAt.toISOString(),
          },
        },
        tx,
      );

      return this.buildDetailView(rejected.id, tx);
    });
  }

  async emergencyFreeze(
    input: EmergencyFreezePropositionControlInput,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const frozen = await this.propositionState.freeze(
        {
          propositionId: input.propositionId,
          frozenAt: input.frozenAt,
          updatedByUserId: input.actorUserId,
        },
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.proposition,
          entityId: frozen.id,
          action: "proposition_emergency_frozen",
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            frozenAt: toDate(input.frozenAt).toISOString(),
            propositionStatus: frozen.status,
          },
        },
        tx,
      );

      return this.buildDetailView(frozen.id, tx);
    });
  }

  async getPropositionDetail(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.buildDetailView(propositionId, tx),
    );
  }

  async listValidationRehearsalCheckpoints(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<PropositionValidationRehearsalCheckpointViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.getRequiredProposition(propositionId, tx);

      return this.validationRehearsalCheckpoints.listCheckpointsForProposition(
        propositionId,
        tx,
      );
    });
  }

  async exportPropositionAudit(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionDetailViewModel & { exportedAt: string }> {
    return withArenaTransaction(this.prisma, db, async (tx) => ({
      ...(await this.buildDetailView(propositionId, tx)),
      exportedAt: new Date().toISOString(),
    }));
  }

  async exportPropositionEvidenceBundle(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionEvidenceBundleViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const nowIso = new Date().toISOString();
      const [propositionExport, runtimeContract, validationChainHealth] =
        await Promise.all([
          this.exportPropositionAudit(propositionId, tx),
          this.monitoring.getRuntimeContract(),
          this.monitoring.getValidationChainHealth(nowIso, tx),
        ]);

      return {
        propositionId,
        exportedAt: nowIso,
        propositionExport,
        runtimeContract,
        validationChainHealth,
      };
    });
  }

  private async buildDetailView(
    propositionId: string,
    db: ArenaDbClient,
  ): Promise<InternalPropositionDetailViewModel> {
    const proposition = await this.getRequiredProposition(propositionId, db);
    const counterSnapshot = await this.counters.rebuildCounterForProposition(
      proposition.id,
      db,
    );
    const [market, closureReadiness, tasks, reviews, rewardEntries, auditEvents] =
      await Promise.all([
        this.markets.findByPropositionId(proposition.id, db),
        this.freezeReveal.evaluateClosureReadiness(
          {
            propositionId: proposition.id,
            now: new Date().toISOString(),
          },
          db,
        ),
        this.dispatchTasks.listByProposition(proposition.id, db),
        this.reviews.listByPropositionId(proposition.id, db),
        this.rewards.list({ propositionId: proposition.id }, db),
        this.audits.listByEntity(INTERNAL_AUDIT_ENTITY_TYPES.proposition, proposition.id, db),
      ]);
    const rewardAuditEvents = await this.audits.listByEntityIds(
      INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
      rewardEntries.map((entry) => entry.id),
      db,
    );
    const submission = buildPropositionSubmissionSnapshot(proposition, auditEvents);
    const validationLifecycle = buildValidationLifecycleSnapshot(
      proposition,
      market,
    );
    const chainPropositionId =
      validationLifecycle.chainPropositionId ??
      this.validationChainIds.buildChainPropositionId(proposition.id);
    const chainMarketId = market
      ? (validationLifecycle.chainMarketId ??
        this.validationChainIds.buildChainMarketId(market.id))
      : null;
    const validationLifecycleRecoveryPromise =
      this.monitoring.getValidationLifecycleRecoveryState({
        proposition,
        validationLifecycle,
      });
    const [
      validationChainMarketAuditEvents,
      validationChainPropositionAuditEvents,
      validationChainCommandAuditEvents,
      validationChainChainMarketAuditEvents,
      validationChainBacklogAuditEvents,
      validationChainEventIds,
      bets,
      runtimeReadiness,
    ] = await Promise.all([
      market
        ? this.audits.listByEntity("validation_market", market.id, db)
        : Promise.resolve([]),
      this.audits.listByEntity("validation_proposition", proposition.id, db),
      this.audits.listByEntity("validation_chain_command", proposition.id, db),
      market?.chainMarketId
        ? this.audits.listByEntity(
            "validation_chain_market",
            market.chainMarketId,
            db,
          )
        : Promise.resolve([]),
      market
        ? this.audits.listByEntity(
            "validation_chain_stream",
            VALIDATION_CHAIN_BATCH_RECONCILIATION_ENTITY_ID,
            db,
          )
        : Promise.resolve([]),
      this.validationChainEvents.listIdsByChainReferences(
        {
          propositionChainId: chainPropositionId,
          marketChainId: chainMarketId,
        },
        db,
      ),
      market ? this.bets.listByMarketId(market.id, db) : Promise.resolve([]),
      this.monitoring.getValidationChainRuntimeReadiness(),
    ]);
    const validationChainEventAuditEvents = await this.audits.listByEntityIds(
      "validation_chain_event",
      validationChainEventIds,
      db,
    );
    const validationChainEvents = await this.validationChainEvents.listByChainReferences(
      {
        propositionChainId: chainPropositionId,
        marketChainId: chainMarketId,
      },
      db,
    );
    const validationLifecycleRecovery =
      await validationLifecycleRecoveryPromise;
    const rehearsalCheckpoints =
      await this.validationRehearsalCheckpoints.listCheckpointsForProposition(
        proposition.id,
        db,
      );
    const driftAuditEvents = sortAuditEventsDesc([
      ...validationChainMarketAuditEvents.filter(
        (event) => event.action === VALIDATION_LIFECYCLE_DRIFT_AUDIT_ACTION,
      ),
      ...validationChainPropositionAuditEvents.filter(
        (event) => event.action === VALIDATION_LIFECYCLE_DRIFT_AUDIT_ACTION,
      ),
    ]);
    const recoveryAuditEvents = sortAuditEventsDesc(
      dedupeAuditEventsById([
        ...validationChainMarketAuditEvents.filter(
          (event) =>
            VALIDATION_CHAIN_COMMAND_RECOVERY_AUDIT_ACTIONS.has(event.action) ||
            VALIDATION_CHAIN_RECOVERY_FOLLOW_THROUGH_AUDIT_ACTIONS.has(
              event.action,
            ),
        ),
        ...validationChainChainMarketAuditEvents.filter((event) =>
          VALIDATION_CHAIN_RECOVERY_FOLLOW_THROUGH_AUDIT_ACTIONS.has(event.action),
        ),
        ...validationChainBacklogAuditEvents.filter((event) =>
          this.isRelevantBacklogRecoveryAudit({
            event,
            propositionId: proposition.id,
            marketId: market?.id ?? null,
            betIds: bets.map((bet) => bet.id),
          }),
        ),
      ]),
    );
    const validationRehearsal = this.buildValidationRehearsalView({
      proposition,
      validationLifecycle,
      bets,
      validationChainEvents,
      rehearsalCheckpoints,
      runtimeReadiness,
      marketAuditEvents: validationChainMarketAuditEvents,
      commandAuditEvents: validationChainCommandAuditEvents,
      eventAuditEvents: validationChainEventAuditEvents,
      recoveryAuditEvents,
    });
    const validationLifecycleView = {
      ...validationLifecycle,
      onChainState: validationLifecycleRecovery.onChainState,
      operatorGuidance: validationLifecycleRecovery.operatorGuidance,
    };
    const validationChainActivity = {
      timeline: sortAuditEventsDesc(
        dedupeAuditEventsById([
          ...validationChainMarketAuditEvents,
          ...validationChainChainMarketAuditEvents,
          ...validationChainPropositionAuditEvents,
          ...validationChainCommandAuditEvents,
          ...validationChainEventAuditEvents,
          ...driftAuditEvents,
          ...recoveryAuditEvents,
        ]).filter((event) => !this.isValidationChainTimelineNoise(event)),
      ),
      marketAuditEvents: sortAuditEventsDesc(validationChainMarketAuditEvents),
      commandAuditEvents: sortAuditEventsDesc(validationChainCommandAuditEvents),
      eventAuditEvents: sortAuditEventsDesc(validationChainEventAuditEvents),
      driftAuditEvents,
      recoveryAuditEvents,
    };
    const validationOperatorSummary = this.buildValidationOperatorSummary({
      validationLifecycle: validationLifecycleView,
      validationChainActivity,
    });

    return {
      proposition: {
        id: proposition.id,
        title: proposition.title,
        description: proposition.description,
        category: proposition.category,
        status: proposition.status,
        marketEnabled: proposition.marketEnabled,
        minEffectiveSample: proposition.minEffectiveSample,
        minDurationSeconds: proposition.minDurationSeconds,
        maxDurationSeconds: proposition.maxDurationSeconds,
        rewardBudget: proposition.rewardBudget,
        baseResponseReward: proposition.baseResponseReward,
        createdByUserId: proposition.createdByUserId,
        updatedByUserId: proposition.updatedByUserId,
        createdAt: proposition.createdAt.toISOString(),
        publishedAt: toIso(proposition.publishedAt),
        liveAt: toIso(proposition.liveAt),
        frozenAt: toIso(proposition.frozenAt),
        revealStartedAt: toIso(proposition.revealStartedAt),
        resultComputedAt: toIso(proposition.resultComputedAt),
        settledAt: toIso(proposition.settledAt),
        closedAt: toIso(proposition.closedAt),
        archivedAt: toIso(proposition.archivedAt),
      },
      submission: {
        status: submission.status,
        submittedAt: submission.submittedAt,
        submittedByUserId: submission.submittedByUserId,
        submissionReason: submission.submissionReason,
        submissionNote: submission.submissionNote,
      },
      market: market
        ? {
            id: market.id,
            status: market.status,
            liveAt: toIso(market.liveAt),
            frozenAt: toIso(market.frozenAt),
            settlingAt: toIso(market.settlingAt),
            settledAt: toIso(market.settledAt),
            chainMarketId: validationLifecycle.chainMarketId,
            chainPropositionId: validationLifecycle.chainPropositionId,
            chainStatus: validationLifecycle.chainStatus,
            chainOpenedAt: validationLifecycle.chainOpenedAt,
            chainFrozenAt: validationLifecycle.chainFrozenAt,
            chainResolvedAt: validationLifecycle.chainResolvedAt,
            chainCancelledAt: validationLifecycle.chainCancelledAt,
            chainResultKind: validationLifecycle.chainResultKind,
            chainWinningOption: validationLifecycle.chainWinningOption,
            chainVoidReason: validationLifecycle.chainVoidReason,
            resolutionTxHash: validationLifecycle.resolutionTxHash,
            cancelTxHash: validationLifecycle.cancelTxHash,
            chainSyncedAt: validationLifecycle.chainSyncedAt,
            currentPublicProgress: market.currentPublicProgress,
            lastPublicResult: market.lastPublicResult,
          }
        : null,
      validationLifecycle: validationLifecycleView,
      validationChainActivity,
      validationOperatorSummary,
      validationRehearsal,
      validationRehearsalCheckpoints: rehearsalCheckpoints,
      sampleCounter: counterSnapshot,
      closureReadiness,
      dispatchSummary: this.buildDispatchSummary(tasks),
      reviewSummary: this.buildReviewSummary(reviews),
      rewardSummary: this.buildRewardSummary(rewardEntries),
      revealSettlement: {
        propositionStatus: proposition.status,
        resultKind: proposition.resultKind,
        winningOption: proposition.winningOption,
        voidReason: proposition.voidReason,
        frozenAt: toIso(proposition.frozenAt),
        revealStartedAt: toIso(proposition.revealStartedAt),
        resultComputedAt: toIso(proposition.resultComputedAt),
        settledAt: toIso(proposition.settledAt),
        marketStatus: market?.status ?? null,
        currentPublicProgress: market?.currentPublicProgress ?? null,
        lastPublicResult: market?.lastPublicResult ?? null,
      },
      auditEvents,
      rewardAuditEvents,
    };
  }

  private isValidationChainTimelineNoise(event: {
    entityType: string;
    action: string;
  }): boolean {
    return (
      event.entityType === "validation_chain_command" &&
      VALIDATION_CHAIN_TIMELINE_NOISE_ACTIONS.has(event.action)
    );
  }

  private buildValidationOperatorSummary(input: {
    validationLifecycle: InternalPropositionDetailViewModel["validationLifecycle"];
    validationChainActivity: InternalPropositionDetailViewModel["validationChainActivity"];
  }): InternalPropositionDetailViewModel["validationOperatorSummary"] {
    const latestRelevantAudit =
      this.getLatestValidationOperatorRelevantAudit(input.validationChainActivity);
    const activeGuidance = input.validationLifecycle.operatorGuidance;

    if (activeGuidance) {
      return {
        status: "action_required",
        requiresActionNow: true,
        summary: activeGuidance.summary,
        plannedCommands: [...activeGuidance.plannedCommands],
        operatorActions: [...activeGuidance.operatorActions],
        latestRelevantAudit:
          input.validationChainActivity.driftAuditEvents[0] ?? latestRelevantAudit,
      };
    }

    return {
      status: "ready",
      requiresActionNow: false,
      summary: this.buildValidationOperatorReadySummary(latestRelevantAudit),
      plannedCommands: [],
      operatorActions: [],
      latestRelevantAudit,
    };
  }

  private getLatestValidationOperatorRelevantAudit(
    activity: InternalPropositionDetailViewModel["validationChainActivity"],
  ): InternalPropositionDetailViewModel["validationOperatorSummary"]["latestRelevantAudit"] {
    return (
      sortAuditEventsDesc([
        ...activity.recoveryAuditEvents,
        ...activity.driftAuditEvents,
        ...activity.commandAuditEvents.filter((event) =>
          VALIDATION_CHAIN_COMMAND_PROBLEM_AUDIT_ACTIONS.has(event.action),
        ),
        ...activity.eventAuditEvents.filter((event) =>
          VALIDATION_CHAIN_EVENT_PROBLEM_AUDIT_ACTIONS.has(event.action),
        ),
      ]).at(0) ?? null
    );
  }

  private buildValidationOperatorReadySummary(
    latestRelevantAudit: InternalPropositionDetailViewModel["validationOperatorSummary"]["latestRelevantAudit"],
  ): string {
    switch (latestRelevantAudit?.action) {
      case "validation_chain.bet_reconciliation.performed":
      case "validation_chain.bet_reconciliation.batch.performed":
        return "No active validation lifecycle drift. Latest operator evidence shows reconciliation completed.";
      case "validation_chain.projection_replay.performed":
        return "No active validation lifecycle drift. Latest operator evidence shows projection replay completed.";
      case "validation_chain.command_recovery.already_pending":
        return "No active validation lifecycle drift. Earlier recovery queue reuse remains in audit history, but no operator action is required right now.";
      case "validation_chain.command_recovery.partial_failure":
      case "validation_chain.command_recovery.enqueue_failed":
        return "No active validation lifecycle drift. Earlier recovery submission failures remain in audit history, but no operator action is required right now.";
      case "validation_chain.alert.lifecycle_drift":
        return "No active validation lifecycle drift. Earlier drift evidence remains available in audit history.";
      case "validation_chain.alert.command_terminal":
      case "validation_chain.alert.command_retry_exhausted":
        return "No active validation lifecycle drift. Earlier command-terminal evidence remains available in audit history.";
      case "validation_chain.project.failed":
      case "validation_chain.alert.projector_entity_missing":
        return "No active validation lifecycle drift. Earlier projector-failure evidence remains available in audit history.";
      default:
        return "No active validation lifecycle drift. No operator recovery is required right now.";
    }
  }

  private buildDispatchSummary(tasks: DispatchTask[]): PropositionDispatchSummaryViewModel {
    const lastAssignedAt = tasks.at(-1)?.assignedAt ?? null;
    const submittedTasks = tasks.filter((task) => task.submittedAt !== null);
    const lastSubmittedAt =
      submittedTasks.length > 0
        ? submittedTasks.sort(
            (left, right) =>
              (left.submittedAt?.getTime() ?? 0) - (right.submittedAt?.getTime() ?? 0),
          ).at(-1)?.submittedAt ?? null
        : null;

    return {
      totalTasks: tasks.length,
      assignedCount: tasks.filter((task) => task.status === "assigned").length,
      startedCount: tasks.filter((task) => task.status === "started").length,
      submittedCount: tasks.filter((task) => task.status === "submitted").length,
      skippedCount: tasks.filter((task) => task.status === "skipped").length,
      expiredCount: tasks.filter((task) => task.status === "expired").length,
      cancelledCount: tasks.filter((task) => task.status === "cancelled").length,
      lastAssignedAt: toIso(lastAssignedAt),
      lastSubmittedAt: toIso(lastSubmittedAt),
      uniqueAssignedUsers: new Set(tasks.map((task) => task.userId)).size,
    };
  }

  private buildReviewSummary(reviews: ResponseReview[]): PropositionReviewSummaryViewModel {
    const finalized = reviews.filter((review) => review.status !== "pending_review");
    const invalidCount = finalized.filter((review) => review.status === "invalid").length;
    const fraudSuspectedCount = finalized.filter(
      (review) => review.status === "fraud_suspected",
    ).length;
    const flaggedCount = finalized.filter((review) => review.flags.length > 0).length;

    return {
      totalReviews: reviews.length,
      pendingCount: reviews.filter((review) => review.status === "pending_review").length,
      finalizedCount: finalized.length,
      validCount: finalized.filter((review) => review.status === "valid").length,
      partialValidCount: finalized.filter((review) => review.status === "partial_valid").length,
      invalidCount,
      fraudSuspectedCount,
      flaggedCount,
      invalidRate: finalized.length === 0 ? 0 : invalidCount / finalized.length,
      anomalyRate: finalized.length === 0 ? 0 : flaggedCount / finalized.length,
      topFlags: buildTopFlags(finalized),
    };
  }

  private buildRewardSummary(entries: RewardLedger[]): PropositionRewardSummaryViewModel {
    return {
      totalEntries: entries.length,
      pendingCount: entries.filter((entry) => entry.status === "pending").length,
      finalizedCount: entries.filter((entry) => entry.status === "finalized").length,
      voidedCount: entries.filter((entry) => entry.status === "voided").length,
      reversedCount: entries.filter((entry) => entry.status === "reversed").length,
      totalPendingAmount: sumAmountStrings(entries.map((entry) => entry.pendingAmount)),
      totalFinalAmount: sumAmountStrings(entries.map((entry) => entry.finalAmount)),
      rewardEntries: entries.map((entry) => ({
        ledgerId: entry.id,
        responseId: entry.responseId,
        userId: entry.userId,
        status: entry.status,
        reviewStatus: entry.reviewStatus,
        pendingAmount: entry.pendingAmount,
        finalAmount: entry.finalAmount,
        ledgerVersion: entry.ledgerVersion,
        reasonCode: entry.reasonCode,
        reversalOfLedgerId: entry.reversalOfLedgerId,
        createdAt: entry.createdAt.toISOString(),
        finalizedAt: toIso(entry.finalizedAt),
        voidedAt: toIso(entry.voidedAt),
        reversedAt: toIso(entry.reversedAt),
      })),
    };
  }

  private buildValidationRehearsalView(input: {
    proposition: Proposition;
    validationLifecycle: ReturnType<typeof buildValidationLifecycleSnapshot>;
    bets: Bet[];
    validationChainEvents: ValidationChainEvent[];
    rehearsalCheckpoints: PropositionValidationRehearsalCheckpointViewModel[];
    runtimeReadiness: Awaited<
      ReturnType<InternalMonitoringService["getValidationChainRuntimeReadiness"]>
    >;
    marketAuditEvents: Array<{ action: string; metadata: unknown; createdAt: string; id: string }>;
    commandAuditEvents: Array<{ action: string; metadata: unknown; createdAt: string; id: string }>;
    eventAuditEvents: Array<{ action: string; metadata: unknown; createdAt: string; id: string }>;
    recoveryAuditEvents: Array<{
      action: string;
      metadata: unknown;
      createdAt: string;
      id: string;
    }>;
  }): PropositionValidationRehearsalViewModel {
    const checkpointByStepId =
      new Map<PropositionValidationRehearsalStepId, PropositionValidationRehearsalCheckpointViewModel>();
    for (const checkpoint of input.rehearsalCheckpoints) {
      if (!checkpointByStepId.has(checkpoint.stepId)) {
        checkpointByStepId.set(checkpoint.stepId, checkpoint);
      }
    }
    const chainOpened =
      input.validationLifecycle.chainStatus !== null &&
      input.validationLifecycle.chainStatus !== "pre_live" &&
      input.validationLifecycle.chainOpenedAt !== null;
    const betPlacedEvent = input.validationChainEvents.find(
      (event) => event.eventName === "BetPlaced",
    );
    const syncedBet = input.bets.find((bet) => bet.chainSyncedAt !== null);
    const commandTerminal = input.commandAuditEvents
      .filter(
        (event) =>
          event.action === "validation_chain.alert.command_terminal" ||
          event.action === "validation_chain.alert.command_retry_exhausted",
      )
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .at(0);
    const projectorFailure = input.eventAuditEvents
      .filter(
        (event) =>
          event.action === "validation_chain.project.failed" ||
          event.action === "validation_chain.alert.projector_entity_missing",
      )
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .at(0);
    const marketCreatedAudit = input.marketAuditEvents.find((event) =>
      event.action.startsWith("validation_chain.create_market."),
    );
    const latestCommandRecoveryAudit = input.recoveryAuditEvents
      .filter((event) =>
        VALIDATION_CHAIN_COMMAND_RECOVERY_AUDIT_ACTIONS.has(event.action),
      )
      .at(0);
    const latestBetRecoveryAudit = input.recoveryAuditEvents
      .filter(
        (event) =>
          event.action === "validation_chain.bet_reconciliation.performed" ||
          event.action === "validation_chain.bet_reconciliation.batch.performed",
      )
      .at(0);
    const latestProjectionReplayAudit = input.recoveryAuditEvents.find(
      (event) => event.action === "validation_chain.projection_replay.performed",
    );
    const hasTerminalBetProjection =
      input.validationLifecycle.chainResolvedAt !== null &&
      input.bets.some(
        (bet) => bet.status === "settled" && bet.settlementOutcome !== null,
      );

    const preflightBlockingReasons: string[] = [];
    if (!input.proposition.marketEnabled) {
      preflightBlockingReasons.push("marketEnabled must be true");
    }
    if (input.proposition.structure !== "binary") {
      preflightBlockingReasons.push("proposition structure must stay binary for MVP rehearsal");
    }
    if (input.proposition.rollingMode !== "non_rolling") {
      preflightBlockingReasons.push("rollingMode must stay non_rolling for MVP rehearsal");
    }

    const publishBlockingReasons: string[] = [];
    if (preflightBlockingReasons.length === 0) {
      if (input.validationLifecycle.chainMarketId === null) {
        publishBlockingReasons.push("chainMarketId has not been assigned");
      }
      if (!chainOpened) {
        publishBlockingReasons.push("chain market has not opened yet");
      }
      if (!chainOpened && commandTerminal) {
        const terminalCommand =
          this.getStringMetadataValue(commandTerminal.metadata, "command") ?? "unknown";
        publishBlockingReasons.push(
          `latest command terminal audit: ${terminalCommand}`,
        );
      }
      if (!chainOpened && latestCommandRecoveryAudit) {
        publishBlockingReasons.push(
          `latest recovery audit: ${latestCommandRecoveryAudit.action}`,
        );
      }
    }

    const betSyncBlockingReasons: string[] = [];
    if (publishBlockingReasons.length === 0) {
      if (input.bets.length === 0) {
        betSyncBlockingReasons.push("no local validation bet has been persisted");
      }
      if (!syncedBet && !betPlacedEvent) {
        betSyncBlockingReasons.push("no BetPlaced event has been persisted");
      }
      if (!syncedBet) {
        betSyncBlockingReasons.push("no local validation bet has been projected from chain events");
      }
      if (betSyncBlockingReasons.length > 0 && latestBetRecoveryAudit) {
        betSyncBlockingReasons.push(
          `latest recovery audit: ${latestBetRecoveryAudit.action}`,
        );
      }
    }

    const freezeResolveBlockingReasons: string[] = [];
    if (betSyncBlockingReasons.length === 0) {
      if (input.proposition.frozenAt === null) {
        freezeResolveBlockingReasons.push("proposition has not frozen for reveal");
      }
      if (input.proposition.resultComputedAt === null || input.proposition.resultKind === null) {
        freezeResolveBlockingReasons.push("official result has not been computed");
      }
      if (input.validationLifecycle.chainFrozenAt === null) {
        freezeResolveBlockingReasons.push("chain market has not been frozen");
      }
      if (input.validationLifecycle.chainResolvedAt === null) {
        freezeResolveBlockingReasons.push("chain market has not been resolved");
      }
      if (freezeResolveBlockingReasons.length > 0 && latestCommandRecoveryAudit) {
        freezeResolveBlockingReasons.push(
          `latest recovery audit: ${latestCommandRecoveryAudit.action}`,
        );
      }
    }

    const projectionSettlementBlockingReasons: string[] = [];
    if (freezeResolveBlockingReasons.length === 0) {
      if (!hasTerminalBetProjection) {
        projectionSettlementBlockingReasons.push(
          "resolved bet settlement projection is not yet visible locally",
        );
      }
      if (input.proposition.status !== "settled" || input.proposition.settledAt === null) {
        projectionSettlementBlockingReasons.push("proposition has not completed local settlement");
      }
      if (
        projectionSettlementBlockingReasons.length > 0 &&
        projectorFailure
      ) {
        projectionSettlementBlockingReasons.push(
          `latest projector failure audit: ${projectorFailure.action}`,
        );
      }
      if (
        projectionSettlementBlockingReasons.length > 0 &&
        latestProjectionReplayAudit
      ) {
        projectionSettlementBlockingReasons.push(
          `latest recovery audit: ${latestProjectionReplayAudit.action}`,
        );
      }
    }

    const stepDefinitions: Array<{
      id: PropositionValidationRehearsalStepId;
      summary: string;
      commands: string[];
      evidence: string[];
      blockingReasons: string[];
      manualCheckpoint: PropositionValidationRehearsalCheckpointViewModel | null;
    }> = [
      {
        id: "preflight",
        summary:
          "Confirm this proposition still matches the MVP validation rehearsal shape before using it for environment-backed execution.",
        commands: [
          VALIDATION_REHEARSAL_RUNTIME_CONTRACT_ROUTE,
          `GET /arena/internal/propositions/${input.proposition.id}`,
          `GET /arena/internal/propositions/${input.proposition.id}/rehearsal-checkpoints`,
        ],
        evidence: [
          `marketEnabled=${String(input.proposition.marketEnabled)}`,
          `structure=${input.proposition.structure}`,
          `rollingMode=${input.proposition.rollingMode}`,
        ],
        blockingReasons: preflightBlockingReasons,
        manualCheckpoint: checkpointByStepId.get("preflight") ?? null,
      },
      {
        id: "publish_and_open",
        summary:
          "Publish the proposition and confirm the validation market is created and opened on chain.",
        commands: [
          `GET /arena/internal/propositions/${input.proposition.id}`,
          `POST /arena/internal/validation-chain/propositions/${input.proposition.id}/recover-command`,
          VALIDATION_REHEARSAL_CHAIN_MONITORING_ROUTE,
        ],
        evidence: [
          input.validationLifecycle.chainMarketId
            ? `chainMarketId=${input.validationLifecycle.chainMarketId}`
            : "chainMarketId=missing",
          input.validationLifecycle.chainOpenedAt
            ? `chainOpenedAt=${input.validationLifecycle.chainOpenedAt}`
            : "chainOpenedAt=missing",
          marketCreatedAudit
            ? `marketAudit=${marketCreatedAudit.action}`
            : "marketAudit=missing",
        ],
        blockingReasons: publishBlockingReasons,
        manualCheckpoint: checkpointByStepId.get("publish_and_open") ?? null,
      },
      {
        id: "local_bet_and_sync",
        summary:
          "Persist one local validation bet, observe the matching BetPlaced chain event, and confirm sync projects that write back locally.",
        commands: [
          "Validation contract placeBet(chainMarketId, option)",
          "POST /arena/internal/validation-chain/sync",
          input.validationLifecycle.marketId
            ? `POST /arena/internal/validation-chain/markets/${input.validationLifecycle.marketId}/bets/:userId/reconcile`
            : "POST /arena/internal/validation-chain/markets/:marketId/bets/:userId/reconcile",
          "POST /arena/internal/validation-chain/backlog/reconcile",
        ],
        evidence: [
          `localBetCount=${input.bets.length}`,
          betPlacedEvent
            ? `chainEvent=BetPlaced:${betPlacedEvent.transactionHash}`
            : "chainEvent=BetPlaced:missing",
          syncedBet
            ? `syncedBet=${syncedBet.userId}:${toIso(syncedBet.chainSyncedAt) ?? "missing"}`
            : "syncedBet=missing",
          syncedBet ? "projectionEvidence=bet.chainSyncedAt" : "projectionEvidence=missing",
        ],
        blockingReasons: betSyncBlockingReasons,
        manualCheckpoint: checkpointByStepId.get("local_bet_and_sync") ?? null,
      },
      {
        id: "freeze_and_resolve",
        summary:
          "Advance the proposition through freeze and official result resolution, then confirm the chain market reaches frozen and resolved state.",
        commands: [
          `GET /arena/internal/propositions/${input.proposition.id}`,
          `POST /arena/internal/validation-chain/propositions/${input.proposition.id}/recover-command`,
          VALIDATION_REHEARSAL_DRIFT_ROUTE,
        ],
        evidence: [
          input.proposition.frozenAt
            ? `frozenAt=${toIso(input.proposition.frozenAt)}`
            : "frozenAt=missing",
          input.proposition.resultComputedAt
            ? `resultComputedAt=${toIso(input.proposition.resultComputedAt)}`
            : "resultComputedAt=missing",
          input.validationLifecycle.chainFrozenAt
            ? `chainFrozenAt=${input.validationLifecycle.chainFrozenAt}`
            : "chainFrozenAt=missing",
          input.validationLifecycle.chainResolvedAt
            ? `chainResolvedAt=${input.validationLifecycle.chainResolvedAt}`
            : "chainResolvedAt=missing",
        ],
        blockingReasons: freezeResolveBlockingReasons,
        manualCheckpoint: checkpointByStepId.get("freeze_and_resolve") ?? null,
      },
      {
        id: "projection_and_settlement",
        summary:
          "Confirm projection and local settlement converge on the resolved outcome without projector failures.",
        commands: [
          "POST /arena/internal/validation-chain/sync",
          input.validationLifecycle.marketId
            ? `POST /arena/internal/validation-chain/markets/${input.validationLifecycle.marketId}/replay-projection`
            : "POST /arena/internal/validation-chain/markets/:marketId/replay-projection",
          `GET /arena/internal/propositions/${input.proposition.id}`,
        ],
        evidence: [
          input.proposition.settledAt
            ? `propositionSettledAt=${toIso(input.proposition.settledAt)}`
            : "propositionSettledAt=missing",
          input.bets
            .filter((bet) => bet.status === "settled" && bet.settlementOutcome !== null)
            .map(
              (bet) =>
                `bet:${bet.userId}:settlementOutcome=${bet.settlementOutcome}:chainSyncedAt=${toIso(bet.chainSyncedAt) ?? "missing"}`,
            )
            .join(", ") || "settledBets=missing",
          projectorFailure
            ? `projectorFailure=${projectorFailure.action}`
            : "projectorFailure=none",
        ],
        blockingReasons: projectionSettlementBlockingReasons,
        manualCheckpoint: checkpointByStepId.get("projection_and_settlement") ?? null,
      },
    ];
    const blockedStepIndex = stepDefinitions.findIndex(
      (step) => step.blockingReasons.length > 0,
    );
    const steps = stepDefinitions.map((step, index) =>
      this.buildValidationRehearsalStep({
        ...step,
        status:
          blockedStepIndex === -1
            ? "complete"
            : index < blockedStepIndex
              ? "complete"
              : index === blockedStepIndex
                ? "blocked"
                : "pending",
      }),
    );

    const blockingStep = steps.find((step) => step.status === "blocked");
    const pendingStep = steps.find((step) => step.status === "pending");
    const currentStep = blockingStep ?? pendingStep ?? null;
    const completedStepCount = steps.filter((step) => step.status === "complete").length;
    const latestCheckpoint = input.rehearsalCheckpoints.at(0) ?? null;

    return {
      status: blockingStep ? "blocked" : "ready",
      targetOutcome: VALIDATION_REHEARSAL_TARGET_OUTCOME,
      runbookPath: VALIDATION_REHEARSAL_RUNBOOK_PATH,
      blockingDependencies: blockingStep ? [blockingStep.id] : [],
      summary: {
        completedStepCount,
        remainingStepCount: Math.max(0, steps.length - completedStepCount),
        currentStepId: currentStep?.id ?? null,
        currentStepStatus: currentStep?.status ?? null,
        nextCommands: currentStep?.commands ?? [],
        blockingReasons: currentStep?.status === "blocked"
          ? currentStep.blockingReasons
          : [],
        latestCheckpointAt: latestCheckpoint?.recordedAt ?? null,
        latestCheckpointStepId: latestCheckpoint?.stepId ?? null,
        latestCheckpointStatus: latestCheckpoint?.status ?? null,
      },
      environmentReadiness: {
        status: input.runtimeReadiness.status,
        checkedAt: input.runtimeReadiness.checkedAt,
        validationEnvironment: input.runtimeReadiness.validationEnvironment,
        chainId: input.runtimeReadiness.chainId,
        runbookPath: input.runtimeReadiness.runbookPath,
        blockingDependencies: input.runtimeReadiness.dependencies
          .filter((dependency) => dependency.status !== "up")
          .map((dependency) => dependency.name),
        preflightCommands: input.runtimeReadiness.preflightCommands,
        operatorActions: input.runtimeReadiness.operatorActions,
      },
      steps,
    };
  }

  private buildValidationRehearsalStep(input: {
    id: PropositionValidationRehearsalStepId;
    status: PropositionValidationRehearsalStepStatus;
    summary: string;
    commands: string[];
    evidence: string[];
    blockingReasons: string[];
    manualCheckpoint: PropositionValidationRehearsalCheckpointViewModel | null;
  }): PropositionValidationRehearsalViewModel["steps"][number] {
    return {
      id: input.id,
      status: input.status,
      summary: input.summary,
      commands: input.commands,
      evidence: input.manualCheckpoint
        ? [
            ...input.evidence,
            `manualCheckpoint.status=${input.manualCheckpoint.status}`,
            `manualCheckpoint.recordedAt=${input.manualCheckpoint.recordedAt}`,
            ...(input.manualCheckpoint.txHash
              ? [`manualCheckpoint.txHash=${input.manualCheckpoint.txHash}`]
              : []),
          ]
        : input.evidence,
      blockingReasons: input.status === "blocked" ? input.blockingReasons : [],
      manualCheckpoint: input.manualCheckpoint,
    };
  }

  private getStringMetadataValue(
    metadata: unknown,
    key: string,
  ): string | null {
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
  }

  private getStringArrayMetadataValue(
    metadata: unknown,
    key: string,
  ): string[] {
    if (!metadata || typeof metadata !== "object") {
      return [];
    }

    const value = (metadata as Record<string, unknown>)[key];
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === "string");
  }

  private isRelevantBacklogRecoveryAudit(input: {
    event: { action: string; metadata: unknown };
    propositionId: string;
    marketId: string | null;
    betIds: string[];
  }): boolean {
    if (input.event.action !== "validation_chain.bet_reconciliation.batch.performed") {
      return false;
    }

    const propositionIds = this.getStringArrayMetadataValue(
      input.event.metadata,
      "propositionIds",
    );
    if (propositionIds.includes(input.propositionId)) {
      return true;
    }

    if (input.marketId) {
      const marketIds = this.getStringArrayMetadataValue(
        input.event.metadata,
        "marketIds",
      );
      if (marketIds.includes(input.marketId)) {
        return true;
      }
    }

    const eventBetIds = this.getStringArrayMetadataValue(
      input.event.metadata,
      "betIds",
    );
    return input.betIds.some((betId) => eventBetIds.includes(betId));
  }

  private async getRequiredProposition(
    propositionId: string,
    db: ArenaDbClient,
  ): Promise<Proposition> {
    const proposition = await this.propositions.findById(propositionId, db);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${propositionId} was not found`,
      );
    }

    return proposition;
  }

  private assertSubmittedDraftReadyForReview(
    proposition: Proposition,
    submissionStatus: ReturnType<typeof buildPropositionSubmissionSnapshot>["status"],
    action: "approve" | "reject",
  ): void {
    if (proposition.status !== "draft") {
      if (action === "reject") {
        throw new ArenaValidationError(
          "proposition.reject_not_allowed",
          "Only draft or scheduled propositions can be rejected",
        );
      }

      throw new ArenaValidationError(
        `proposition.${action}_not_allowed`,
        `Only submitted draft propositions can be ${action === "approve" ? "approved" : "rejected"}`,
      );
    }

    if (submissionStatus !== "submitted") {
      throw new ArenaValidationError(
        `proposition.${action}_requires_submission`,
        `Only draft propositions that have been submitted for review can be ${action === "approve" ? "approved" : "rejected"}`,
      );
    }
  }
}
