import { Injectable } from "@nestjs/common";
import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import type {
  InternalRewardAuditDetailViewModel,
  InternalRewardAuditListItemViewModel,
  InternalRewardAuditListPageViewModel,
  RewardAuditListFilters,
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
import { InternalAuditService } from "./internal-audit.service";
import { RewardLedgerService } from "./reward-ledger.service";

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

@Injectable()
export class InternalRewardAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly ledgers: RewardLedgerRepository,
    private readonly rewards: RewardLedgerService,
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
      const propositionTitleById = new Map(
        propositions.map((proposition) => [proposition.id, proposition.title]),
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
          ].some((value) => value.toLowerCase().includes(search));
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

  private async buildDetailView(
    ledgerId: string,
    db: ArenaDbClient,
  ): Promise<InternalRewardAuditDetailViewModel> {
    const ledger = await this.getRequiredLedger(ledgerId, db);
    const chain = await this.ledgers.findByResponseId(ledger.responseId, db);
    const [proposition, response, review, auditEvents] = await Promise.all([
      this.propositions.findById(ledger.propositionId, db),
      this.responses.findById(ledger.responseId, db),
      this.reviews.findByResponseId(ledger.responseId, db),
      this.audits.listByEntityIds(
        INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
        chain.map((entry) => entry.id),
        db,
      ),
    ]);

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
      chain: chain.map((entry) => ({
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
      })),
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
