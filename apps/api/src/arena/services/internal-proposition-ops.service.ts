import { Injectable } from "@nestjs/common";
import type { DispatchTask, Proposition, ResponseReview, RewardLedger } from "@prisma/client";
import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import {
  type ApprovePropositionControlInput,
  type EmergencyFreezePropositionControlInput,
  INTERNAL_AUDIT_ENTITY_TYPES,
  type InternalPropositionDetailViewModel,
  type InternalPropositionListFilters,
  type InternalPropositionListItemViewModel,
  type PropositionDispatchSummaryViewModel,
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
import { PropositionEngineService } from "./proposition-engine.service";
import { PropositionStateService } from "./proposition-state.service";
import { assertPropositionTransition } from "../state-machines/proposition-state.machine";
import { ValidationChainIdService } from "../validation-chain/validation-chain-id.service";

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
    private readonly validationChainEvents: ValidationChainEventRepository,
    private readonly counters: EffectiveSampleCounterService,
    private readonly propositionEngine: PropositionEngineService,
    private readonly propositionState: PropositionStateService,
    private readonly freezeReveal: FreezeRevealOrchestratorService,
    private readonly audits: InternalAuditService,
    private readonly validationChainIds: ValidationChainIdService,
  ) {}

  async listPropositions(
    filters: InternalPropositionListFilters,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionListItemViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
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
    });
  }

  async listReviewQueue(
    filters: Omit<InternalPropositionListFilters, "status" | "submissionStatus">,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionListItemViewModel[]> {
    const items = await this.listPropositions(
      {
        ...filters,
        status: "draft",
        submissionStatus: "submitted",
      },
      db,
    );

    return items.sort((left, right) => {
      const leftSubmittedAt = left.submittedAt ? Date.parse(left.submittedAt) : 0;
      const rightSubmittedAt = right.submittedAt ? Date.parse(right.submittedAt) : 0;
      return rightSubmittedAt - leftSubmittedAt || right.createdAt.localeCompare(left.createdAt);
    });
  }

  async approveProposition(
    input: ApprovePropositionControlInput,
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

  async exportPropositionAudit(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<InternalPropositionDetailViewModel & { exportedAt: string }> {
    return withArenaTransaction(this.prisma, db, async (tx) => ({
      ...(await this.buildDetailView(propositionId, tx)),
      exportedAt: new Date().toISOString(),
    }));
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
    const [
      validationChainMarketAuditEvents,
      validationChainCommandAuditEvents,
      validationChainEventIds,
    ] = await Promise.all([
      market
        ? this.audits.listByEntity("validation_market", market.id, db)
        : Promise.resolve([]),
      this.audits.listByEntity("validation_chain_command", proposition.id, db),
      this.validationChainEvents.listIdsByChainReferences(
        {
          propositionChainId: chainPropositionId,
          marketChainId: chainMarketId,
        },
        db,
      ),
    ]);
    const validationChainEventAuditEvents = await this.audits.listByEntityIds(
      "validation_chain_event",
      validationChainEventIds,
      db,
    );

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
      validationLifecycle,
      validationChainActivity: {
        timeline: sortAuditEventsDesc([
          ...validationChainMarketAuditEvents,
          ...validationChainCommandAuditEvents,
          ...validationChainEventAuditEvents,
        ]),
        marketAuditEvents: sortAuditEventsDesc(validationChainMarketAuditEvents),
        commandAuditEvents: sortAuditEventsDesc(validationChainCommandAuditEvents),
        eventAuditEvents: sortAuditEventsDesc(validationChainEventAuditEvents),
      },
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
