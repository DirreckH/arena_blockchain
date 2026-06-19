import { Injectable } from "@nestjs/common";
import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import type {
  ApproveRewardPayoutControlInput,
  ConfirmRewardPayoutExecutionControlInput,
  CompleteRewardPayoutControlInput,
  EnsureRewardPayoutControlInput,
  FailRewardPayoutControlInput,
  InternalRewardAuditDetailViewModel,
  InternalRewardAuditListItemViewModel,
  InternalRewardAuditListPageViewModel,
  RewardAuditListFilters,
  StartRewardPayoutExecutionControlInput,
} from "../internal-ops.types";
import { INTERNAL_AUDIT_ENTITY_TYPES } from "../internal-ops.types";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { toDate } from "../arena.utils";
import { PrismaService } from "../../database/prisma.service";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { RewardLedgerRepository } from "../repositories/reward-ledger.repository";
import { RewardPayoutRepository } from "../repositories/reward-payout.repository";
import { InternalAuditService } from "./internal-audit.service";
import { RewardLedgerService } from "./reward-ledger.service";
import { RewardPayoutService } from "./reward-payout.service";
import { isRewardPayoutExecutionStale as isRewardPayoutExecutionStaleSnapshot } from "../reward-payout-execution-staleness";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

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

const isRewardPayoutExecutionStale = (
  item: Pick<
    InternalRewardAuditListItemViewModel,
    | "payoutStatus"
    | "payoutMethod"
    | "payoutExecutionStartedAt"
    | "payoutCompletedAt"
    | "payoutExecutionTxHash"
  >,
): boolean => {
  return isRewardPayoutExecutionStaleSnapshot({
    status: item.payoutStatus,
    method: item.payoutMethod,
    executionStartedAt: item.payoutExecutionStartedAt,
    completedAt: item.payoutCompletedAt,
    executionTxHash: item.payoutExecutionTxHash,
  });
};

@Injectable()
export class InternalRewardAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly ledgers: RewardLedgerRepository,
    private readonly payoutRepository: RewardPayoutRepository,
    private readonly rewards: RewardLedgerService,
    private readonly payoutService: RewardPayoutService,
    private readonly audits: InternalAuditService,
  ) {}

  async listRewards(
    filters: RewardAuditListFilters,
    db?: ArenaDbClient,
  ): Promise<InternalRewardAuditListPageViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const ledgers = await this.ledgers.list(
        {
          propositionId: filters.propositionId,
          userId: filters.userId,
          responseId: filters.responseId,
          status: filters.status,
          sourceType: filters.sourceType,
        },
        tx,
      );
      const propositions = await this.propositions.listByIds(
        [...new Set(ledgers.map((ledger) => ledger.propositionId))],
        tx,
      );
      const payouts = await this.payoutRepository.list(
        {
          userId: filters.userId,
          status: filters.payoutStatus,
        },
        tx,
      );
      const propositionTitleById = new Map(
        propositions.map((proposition) => [proposition.id, proposition.title]),
      );
      const payoutByLedgerId = new Map(
        payouts.map((payout) => [payout.ledgerId, payout]),
      );

      const search = normalizeSearch(filters.search);
      const direction = filters.sortDirection ?? "desc";
      const limit = clampLimit(filters.limit);
      const offset = clampOffset(filters.offset);

      const items = ledgers
        .map((ledger) => {
          const propositionTitle =
            propositionTitleById.get(ledger.propositionId);
          if (!propositionTitle) {
            throw new ArenaNotFoundError(
              "proposition.not_found",
              `Proposition ${ledger.propositionId} was not found`,
            );
          }
          const payout = payoutByLedgerId.get(ledger.id) ?? null;

          return {
            ledgerId: ledger.id,
            propositionId: ledger.propositionId,
            propositionTitle,
            responseId: ledger.responseId,
            userId: ledger.userId,
            sourceType: ledger.sourceType,
            status: ledger.status,
            reviewStatus: ledger.reviewStatus,
            pendingAmount: ledger.pendingAmount,
            finalAmount: ledger.finalAmount,
            ledgerVersion: ledger.ledgerVersion,
            reasonCode: ledger.reasonCode,
            reversalOfLedgerId: ledger.reversalOfLedgerId,
            createdAt: ledger.createdAt.toISOString(),
            finalizedAt: toIso(ledger.finalizedAt),
            voidedAt: toIso(ledger.voidedAt),
            reversedAt: toIso(ledger.reversedAt),
            payoutId: payout?.id ?? null,
            payoutStatus: payout?.status ?? null,
            payoutMethod: payout?.method ?? null,
            payoutAmount: payout?.amount ?? null,
            payoutAssetSymbol: payout?.assetSymbol ?? null,
            payoutDestinationAddress: payout?.destinationAddress ?? null,
            payoutRequestedAt: toIso(payout?.requestedAt ?? null),
            payoutApprovedAt: toIso(payout?.approvedAt ?? null),
            payoutExecutionStartedAt: toIso(payout?.executionStartedAt ?? null),
            payoutCompletedAt: toIso(payout?.completedAt ?? null),
            payoutFailedAt: toIso(payout?.failedAt ?? null),
            payoutCancelledAt: toIso(payout?.cancelledAt ?? null),
            payoutExecutionTxHash: payout?.executionTxHash ?? null,
            payoutRetryCount: payout?.retryCount ?? 0,
            payoutLastErrorCode: payout?.lastErrorCode ?? null,
            payoutLastErrorMessage: payout?.lastErrorMessage ?? null,
          };
        })
        .filter((item) => {
          if (!search) {
            return true;
          }

          return [
            item.ledgerId,
            item.propositionId,
            item.propositionTitle,
            item.responseId,
            item.userId,
            item.status,
            item.reviewStatus ?? "",
            item.payoutStatus ?? "",
          ].some((value) => value.toLowerCase().includes(search));
        })
        .filter((item) => {
          if (!filters.payoutStatus) {
            return true;
          }

          return item.payoutStatus === filters.payoutStatus;
        })
        .filter((item) => {
          if (!filters.missingPayoutOnly) {
            return true;
          }

          return item.payoutId === null;
        })
        .filter((item) => {
          if (!filters.staleExecutionOnly) {
            return true;
          }

          return isRewardPayoutExecutionStale(item);
        })
        .filter((item) => {
          if (!filters.actionQueue) {
            return true;
          }

          switch (filters.actionQueue) {
            case "missing_payout":
              return item.status === "finalized" && item.payoutId === null;
            case "approval":
              return item.payoutStatus === "requested";
            case "execution_start":
              return item.payoutStatus === "approved";
            case "execution_confirm":
              return (
                item.payoutStatus === "executing" &&
                (item.payoutMethod !== "wallet_transfer" ||
                  item.payoutExecutionTxHash !== null)
              );
            case "execution_recover":
              return (
                item.payoutStatus === "executing" &&
                item.payoutMethod === "wallet_transfer" &&
                item.payoutExecutionTxHash === null
              );
            case "retry":
              return item.payoutStatus === "failed";
            default:
              return true;
          }
        })
        .sort((left, right) =>
          this.compareRewardItems(
            left,
            right,
            filters.sortBy ?? "createdAt",
            direction,
          ),
        );

      return {
        items: items.slice(offset, offset + limit),
        totalCount: items.length,
        limit,
        offset,
      };
    });
  }

  async getRewardDetail(
    ledgerId: string,
    db?: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) =>
      this.buildDetailView(ledgerId, tx),
    );
  }

  async retriggerReviewResolution(
    input: {
      ledgerId: string;
      actorUserId: string;
      reason: string;
      note?: string;
      resolvedAt: string;
    },
    db?: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const ledger = await this.getRequiredLedger(input.ledgerId, tx);
      const response = await this.responses.findById(ledger.responseId, tx);
      if (!response) {
        throw new ArenaNotFoundError(
          "response.not_found",
          `Response ${ledger.responseId} was not found`,
        );
      }

      const review = await this.reviews.findByResponseId(response.id, tx);
      if (!review || review.status === "pending_review") {
        throw new ArenaValidationError(
          "reward_ledger.review_not_finalized",
          "Reward correction can only be retriggered after a finalized review exists",
        );
      }

      const nextLedger = await this.rewards.resolveFromReview(
        {
          propositionId: ledger.propositionId,
          responseId: response.id,
          reviewStatus: review.status,
          resolvedAt: input.resolvedAt,
          isLatest: response.isLatest,
          reasonCodes: review.reasonCodes,
        },
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
          entityId: ledger.id,
          action: "reward_review_resolution_retriggered",
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            responseId: response.id,
            reviewStatus: review.status,
            sourceLedgerId: ledger.id,
            resultLedgerId: nextLedger.id,
            resolvedAt: toDate(input.resolvedAt).toISOString(),
          },
        },
        tx,
      );

      return this.buildDetailView(nextLedger.id, tx);
    });
  }

  async approveRewardPayout(
    input: ApproveRewardPayoutControlInput,
    db?: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const ledger = await this.getRequiredLedger(input.ledgerId, tx);
      const payout = await this.getRequiredPayoutForLedger(ledger.id, tx);
      const approved = await this.payoutService.approvePayout(
        {
          payoutId: payout.id,
          actorUserId: input.actorUserId,
          approvedAt: input.approvedAt,
        },
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
          entityId: ledger.id,
          action: "reward_payout_approved",
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            payoutId: approved.id,
            payoutStatus: approved.status,
            approvedAt: toDate(input.approvedAt).toISOString(),
          },
          createdAt: toDate(input.approvedAt),
        },
        tx,
      );

      return this.buildDetailView(ledger.id, tx);
    });
  }

  async ensureRewardPayout(
    input: EnsureRewardPayoutControlInput,
    db?: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const ledger = await this.getRequiredLedger(input.ledgerId, tx);
      const payout = await this.payoutService.ensurePayoutForLedger(
        ledger.id,
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
          entityId: ledger.id,
          action: "reward_payout_ensured",
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            payoutId: payout.id,
            payoutStatus: payout.status,
            ensuredAt: toDate(input.ensuredAt).toISOString(),
            destinationAddress: payout.destinationAddress,
            amount: payout.amount,
          },
          createdAt: toDate(input.ensuredAt),
        },
        tx,
      );

      return this.buildDetailView(ledger.id, tx);
    });
  }

  async startRewardPayoutExecution(
    input: StartRewardPayoutExecutionControlInput,
    db?: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    const readDb = db ?? (this.prisma as unknown as ArenaDbClient);
    const ledger = await this.getRequiredLedger(input.ledgerId, readDb);
    const payout = await this.getRequiredPayoutForLedger(ledger.id, readDb);
    const executed = await this.payoutService.executePayout({
      payoutId: payout.id,
      startedAt: input.startedAt,
    });

    if (executed.status === "failed") {
      await this.audits.record({
        entityType: INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
        entityId: ledger.id,
        action: "reward_payout_failed",
        actorUserId: input.actorUserId,
        reason: input.reason,
        note: input.note,
        metadata: {
          payoutId: executed.id,
          payoutStatus: executed.status,
          failedAt: toDate(input.startedAt).toISOString(),
          errorCode: executed.lastErrorCode,
          errorMessage: executed.lastErrorMessage,
          retryCount: executed.retryCount,
        },
        createdAt: toDate(input.startedAt),
      });

      return this.getRewardDetail(ledger.id, db);
    }

    await this.audits.record({
      entityType: INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
      entityId: ledger.id,
      action: "reward_payout_execution_started",
      actorUserId: input.actorUserId,
      reason: input.reason,
      note: input.note,
      metadata: {
        payoutId: executed.id,
        payoutStatus: executed.status,
        startedAt: toDate(input.startedAt).toISOString(),
        retryCount: executed.retryCount,
        executionTxHash: executed.executionTxHash,
        externalReference: executed.externalReference,
      },
      createdAt: toDate(input.startedAt),
    });

    return this.getRewardDetail(ledger.id, db);
  }

  async completeRewardPayout(
    input: CompleteRewardPayoutControlInput,
    db?: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const ledger = await this.getRequiredLedger(input.ledgerId, tx);
      const payout = await this.getRequiredPayoutForLedger(ledger.id, tx);
      const completed = await this.payoutService.completePayout(
        {
          payoutId: payout.id,
          completedAt: input.completedAt,
          executionTxHash: input.executionTxHash,
          externalReference: input.externalReference,
        },
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
          entityId: ledger.id,
          action: "reward_payout_completed",
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            payoutId: completed.id,
            payoutStatus: completed.status,
            completedAt: toDate(input.completedAt).toISOString(),
            executionTxHash: completed.executionTxHash,
            externalReference: completed.externalReference,
            retryCount: completed.retryCount,
          },
          createdAt: toDate(input.completedAt),
        },
        tx,
      );

      return this.buildDetailView(ledger.id, tx);
    });
  }

  async confirmRewardPayoutExecution(
    input: ConfirmRewardPayoutExecutionControlInput,
    db?: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const ledger = await this.getRequiredLedger(input.ledgerId, tx);
      const payout = await this.getRequiredPayoutForLedger(ledger.id, tx);
      const completed = await this.payoutService.completePayout(
        {
          payoutId: payout.id,
          completedAt: input.confirmedAt,
          externalReference: input.externalReference,
        },
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
          entityId: ledger.id,
          action: "reward_payout_completed",
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            payoutId: completed.id,
            payoutStatus: completed.status,
            completedAt: toDate(input.confirmedAt).toISOString(),
            executionTxHash: completed.executionTxHash,
            externalReference: completed.externalReference,
            retryCount: completed.retryCount,
            confirmationMode: "recorded_execution_tx_hash",
          },
          createdAt: toDate(input.confirmedAt),
        },
        tx,
      );

      return this.buildDetailView(ledger.id, tx);
    });
  }

  async failRewardPayout(
    input: FailRewardPayoutControlInput,
    db?: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const ledger = await this.getRequiredLedger(input.ledgerId, tx);
      const payout = await this.getRequiredPayoutForLedger(ledger.id, tx);
      const failed = await this.payoutService.failPayout(
        {
          payoutId: payout.id,
          failedAt: input.failedAt,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
        },
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
          entityId: ledger.id,
          action: "reward_payout_failed",
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            payoutId: failed.id,
            payoutStatus: failed.status,
            failedAt: toDate(input.failedAt).toISOString(),
            errorCode: failed.lastErrorCode,
            errorMessage: failed.lastErrorMessage,
            retryCount: failed.retryCount,
          },
          createdAt: toDate(input.failedAt),
        },
        tx,
      );

      return this.buildDetailView(ledger.id, tx);
    });
  }

  private async buildDetailView(
    ledgerId: string,
    db: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    const ledger = await this.getRequiredLedger(ledgerId, db);
    const chain = await this.ledgers.findByResponseId(ledger.responseId, db);
    const [proposition, response, review, auditEvents, payout] = await Promise.all([
      this.propositions.findById(ledger.propositionId, db),
      this.responses.findById(ledger.responseId, db),
      this.reviews.findByResponseId(ledger.responseId, db),
      this.audits.listByEntityIds(
        INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
        chain.map((entry) => entry.id),
        db,
      ),
      this.payoutService.getByLedgerId(ledger.id, db),
    ]);
    const chainPayouts = await this.payoutRepository.list(
      {
        userId: ledger.userId,
        status: undefined,
      },
      db,
    );
    const chainPayoutByLedgerId = new Map(
      chainPayouts.map((entry) => [entry.ledgerId, entry]),
    );

    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${ledger.propositionId} was not found`,
      );
    }
    if (!response) {
      throw new ArenaNotFoundError(
        "response.not_found",
        `Response ${ledger.responseId} was not found`,
      );
    }

    return {
      ledgerId: ledger.id,
      proposition: {
        id: proposition.id,
        title: proposition.title,
        status: proposition.status,
      },
      response: {
        id: response.id,
        userId: response.userId,
        isLatest: response.isLatest,
        submittedAt: response.submittedAt.toISOString(),
      },
      currentReview: review
        ? {
            status: review.status,
            qualityScore: review.qualityScore,
            flags: [...review.flags],
            reasonCodes: [...review.reasonCodes],
            reviewedByUserId: review.reviewedByUserId,
            reviewedAt: toIso(review.reviewedAt),
          }
        : null,
      payout: payout
        ? {
            payoutId: payout.id,
            status: payout.status,
            method: payout.method,
            amount: payout.amount,
            assetSymbol: payout.assetSymbol,
            destinationAddress: payout.destinationAddress,
            requestedAt: payout.requestedAt.toISOString(),
            approvedAt: toIso(payout.approvedAt),
            approvedByUserId: payout.approvedByUserId,
            executionStartedAt: toIso(payout.executionStartedAt),
            completedAt: toIso(payout.completedAt),
            failedAt: toIso(payout.failedAt),
            cancelledAt: toIso(payout.cancelledAt),
            executionTxHash: payout.executionTxHash,
            externalReference: payout.externalReference,
            retryCount: payout.retryCount,
            lastErrorCode: payout.lastErrorCode,
            lastErrorMessage: payout.lastErrorMessage,
          }
        : null,
      chain: chain.map((entry) => {
        const chainPayout = chainPayoutByLedgerId.get(entry.id) ?? null;
        return {
          ledgerId: entry.id,
          propositionId: entry.propositionId,
          propositionTitle: proposition.title,
          responseId: entry.responseId,
          userId: entry.userId,
          sourceType: entry.sourceType,
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
          payoutId: chainPayout?.id ?? null,
          payoutStatus: chainPayout?.status ?? null,
          payoutMethod: chainPayout?.method ?? null,
          payoutAmount: chainPayout?.amount ?? null,
          payoutAssetSymbol: chainPayout?.assetSymbol ?? null,
          payoutDestinationAddress: chainPayout?.destinationAddress ?? null,
          payoutRequestedAt: toIso(chainPayout?.requestedAt ?? null),
          payoutApprovedAt: toIso(chainPayout?.approvedAt ?? null),
          payoutExecutionStartedAt: toIso(chainPayout?.executionStartedAt ?? null),
          payoutCompletedAt: toIso(chainPayout?.completedAt ?? null),
          payoutFailedAt: toIso(chainPayout?.failedAt ?? null),
          payoutCancelledAt: toIso(chainPayout?.cancelledAt ?? null),
          payoutExecutionTxHash: chainPayout?.executionTxHash ?? null,
          payoutRetryCount: chainPayout?.retryCount ?? 0,
          payoutLastErrorCode: chainPayout?.lastErrorCode ?? null,
          payoutLastErrorMessage: chainPayout?.lastErrorMessage ?? null,
        };
      }),
      auditEvents,
    };
  }

  private async getRequiredLedger(
    ledgerId: string,
    db: ArenaDbClient,
  ) {
    const ledger = await this.ledgers.findById(ledgerId, db);
    if (!ledger) {
      throw new ArenaNotFoundError(
        "reward_ledger.not_found",
        `Reward ledger ${ledgerId} was not found`,
      );
    }

    return ledger;
  }

  private async getRequiredPayoutForLedger(
    ledgerId: string,
    db: ArenaDbClient,
  ) {
    const payout = await this.payoutService.getByLedgerId(ledgerId, db);
    if (!payout) {
      throw new ArenaNotFoundError(
        "reward_payout.not_found",
        `Reward payout for ledger ${ledgerId} was not found`,
      );
    }

    return payout;
  }

  private compareRewardItems(
    left: InternalRewardAuditListItemViewModel,
    right: InternalRewardAuditListItemViewModel,
    sortBy: NonNullable<RewardAuditListFilters["sortBy"]>,
    direction: NonNullable<RewardAuditListFilters["sortDirection"]>,
  ): number {
    switch (sortBy) {
      case "finalizedAt":
        return (
          compareNullableDates(left.finalizedAt, right.finalizedAt, direction) ||
          compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "propositionTitle":
        return (
          compareStrings(left.propositionTitle, right.propositionTitle, direction) ||
          compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "userId":
        return (
          compareStrings(left.userId, right.userId, direction) ||
          compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "amount":
        return (
          compareNumbers(
            Number(left.finalAmount ?? left.pendingAmount),
            Number(right.finalAmount ?? right.pendingAmount),
            direction,
          ) || compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "ledgerVersion":
        return (
          compareNumbers(left.ledgerVersion, right.ledgerVersion, direction) ||
          compareNullableDates(left.createdAt, right.createdAt, "desc")
        );
      case "createdAt":
      default:
        return (
          compareNullableDates(left.createdAt, right.createdAt, direction) ||
          compareNumbers(left.ledgerVersion, right.ledgerVersion, "desc")
        );
    }
  }
}
