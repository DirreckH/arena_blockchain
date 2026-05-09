import type {
  RespondentAccountActivityItemViewModel,
  RespondentResultOverviewAnalyticsViewModel,
  RespondentResultOverviewViewModel,
  RespondentOpenPositionCategoryExposureViewModel,
  RespondentOpenPositionListItemViewModel,
  RespondentResultListItemViewModel,
  RespondentResultListViewModel,
  RespondentResultOverviewPnlExtremeViewModel,
  ResultSummaryViewModel,
} from "../dto.js";
import type { ResultSurfaceContract } from "../service-contracts.js";
import { PropositionNotFoundError } from "../adjudication/errors.js";
import type {
  PropositionCategory,
  PositionSettlementOutcome,
  PropositionStatus,
} from "../enums.js";
import type { ResultSurfaceDependencies } from "./ports.js";
import { ResultSummaryNotAvailableError } from "./errors.js";
import { buildValidationMarketViewModel } from "../validation/snapshot-builder.js";

const SETTLED_VISIBILITY_STATUSES = new Set<PropositionStatus>([
  "settled",
  "closed",
  "archived",
]);

const resolveSettledAt = (
  propositionId: string,
  status: PropositionStatus,
  timestamps: Array<string | null>,
): string => {
  const timestamp = timestamps.find((value) => value !== null);
  if (!timestamp) {
    throw new ResultSummaryNotAvailableError(propositionId, status);
  }

  return timestamp;
};

const sumAmountStrings = (values: Array<string | null | undefined>): string => {
  const total = values.reduce((sum, value) => sum + BigInt(value ?? "0"), 0n);
  return `${total.toString()}.00`;
};

const normalizeAmountString = (value: string | null | undefined): string => {
  if (!value) {
    return "0";
  }

  const [whole] = value.split(".");
  return whole || "0";
};

const toAmountBigInt = (value: string | null | undefined): bigint =>
  BigInt(normalizeAmountString(value));

const toPercent = (part: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }

  return Math.round((part / total) * 100);
};

export class ResultSurface implements ResultSurfaceContract {
  constructor(private readonly deps: ResultSurfaceDependencies) {}

  async getResultSummary(
    propositionId: string,
    userId?: string,
  ): Promise<ResultSummaryViewModel> {
    const proposition = await this.deps.propositions.getById(propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(propositionId);
    }

    if (!SETTLED_VISIBILITY_STATUSES.has(proposition.status)) {
      throw new ResultSummaryNotAvailableError(
        proposition.id,
        proposition.status,
      );
    }

    const rewardLedger = userId
      ? await this.deps.rewards.getByPropositionAndUser(proposition.id, userId)
      : null;
    const market = await this.deps.markets.findByPropositionId(proposition.id);
    const currentUserPosition =
      userId && market
        ? await this.deps.positions.findByMarketAndUser(market.id, userId)
        : null;

    return {
      propositionId: proposition.id,
      resultKind: proposition.resultKind ?? "void",
      winningOption: proposition.winningOption,
      voidReason: proposition.voidReason,
      settledAt: resolveSettledAt(proposition.id, proposition.status, [
        proposition.settledAt,
        proposition.closedAt,
        proposition.archivedAt,
      ]),
      currentUserRewardStatus: rewardLedger?.status ?? null,
      currentUserSettlementOutcome:
        currentUserPosition?.settlementOutcome ?? null,
    };
  }

  async listResultsForUser(userId: string): Promise<RespondentResultListViewModel> {
    const [rewardLedgerHistory, userPositions] = await Promise.all([
      this.deps.rewards.listByUser(userId),
      this.listPositionsForUser(userId),
    ]);
    const rewardPropositionIds = [...new Set(
      rewardLedgerHistory.map((ledger) => ledger.propositionId),
    )];
    const rewardLedgers = (
      await Promise.all(
        rewardPropositionIds.map((propositionId) =>
          this.deps.rewards.getByPropositionAndUser(propositionId, userId),
        ),
      )
    ).filter((ledger) => ledger !== null);

    const entriesByPropositionId = new Map<string, RespondentResultListItemViewModel>();

    for (const ledger of rewardLedgers) {
      const proposition = await this.deps.propositions.getById(ledger.propositionId);
      if (!proposition) {
        throw new PropositionNotFoundError(ledger.propositionId);
      }

      if (!SETTLED_VISIBILITY_STATUSES.has(proposition.status)) {
        continue;
      }

      const market = await this.deps.markets.findByPropositionId(proposition.id);
      const current = entriesByPropositionId.get(proposition.id);

      entriesByPropositionId.set(proposition.id, {
        propositionId: proposition.id,
        propositionTitle: proposition.title,
        category: proposition.category,
        marketId: market?.id ?? null,
        resultKind: proposition.resultKind ?? "void",
        winningOption: proposition.winningOption,
        voidReason: proposition.voidReason,
        settledAt: resolveSettledAt(proposition.id, proposition.status, [
          proposition.settledAt,
          proposition.closedAt,
          proposition.archivedAt,
        ]),
        currentUserRewardStatus: ledger.status,
        currentUserRewardAmount:
          ledger.status === "finalized"
            ? (ledger.finalAmount ?? ledger.pendingAmount)
            : ledger.pendingAmount,
        currentUserSettlementOutcome:
          current?.currentUserSettlementOutcome ?? null,
        currentUserStakeAmount: current?.currentUserStakeAmount ?? null,
        currentUserGrossPayout: current?.currentUserGrossPayout ?? null,
        currentUserPnl: current?.currentUserPnl ?? null,
        currentUserRefundAmount: current?.currentUserRefundAmount ?? null,
      });
    }

    for (const position of userPositions) {
      const proposition = await this.deps.propositions.getById(position.propositionId);
      if (!proposition) {
        throw new PropositionNotFoundError(position.propositionId);
      }

      if (!SETTLED_VISIBILITY_STATUSES.has(proposition.status)) {
        continue;
      }

      const market = await this.deps.markets.findByPropositionId(proposition.id);
      const current = entriesByPropositionId.get(proposition.id);

      entriesByPropositionId.set(proposition.id, {
        propositionId: proposition.id,
        propositionTitle: proposition.title,
        category: proposition.category,
        marketId: market?.id ?? position.marketId,
        resultKind: proposition.resultKind ?? "void",
        winningOption: proposition.winningOption,
        voidReason: proposition.voidReason,
        settledAt: resolveSettledAt(proposition.id, proposition.status, [
          proposition.settledAt,
          proposition.closedAt,
          proposition.archivedAt,
        ]),
        currentUserRewardStatus: current?.currentUserRewardStatus ?? null,
        currentUserRewardAmount: current?.currentUserRewardAmount ?? null,
        currentUserSettlementOutcome:
          (position.settlementOutcome as PositionSettlementOutcome | null) ?? null,
        currentUserStakeAmount: position.stakeAmount,
        currentUserGrossPayout: position.grossPayout,
        currentUserPnl: position.pnl,
        currentUserRefundAmount: position.refundAmount,
      });
    }

    const items = [...entriesByPropositionId.values()].sort((left, right) =>
      right.settledAt.localeCompare(left.settledAt),
    );

    return {
      userId,
      totals: {
        settledCount: items.length,
        resolvedCount: items.filter((item) => item.resultKind === "resolved").length,
        voidCount: items.filter((item) => item.resultKind === "void").length,
        wonCount: items.filter((item) => item.currentUserSettlementOutcome === "won").length,
        lostCount: items.filter((item) => item.currentUserSettlementOutcome === "lost").length,
        refundCount: items.filter((item) => item.currentUserSettlementOutcome === "refund").length,
        finalizedRewardAmount: sumAmountStrings(
          items
            .filter((item) => item.currentUserRewardStatus === "finalized")
            .map((item) => item.currentUserRewardAmount),
        ),
        pendingRewardAmount: sumAmountStrings(
          items
            .filter((item) => item.currentUserRewardStatus === "pending")
            .map((item) => item.currentUserRewardAmount),
        ),
        totalStakeAmount: sumAmountStrings(items.map((item) => item.currentUserStakeAmount)),
        totalGrossPayout: sumAmountStrings(
          items.map((item) => item.currentUserGrossPayout),
        ),
        totalPnl: sumAmountStrings(items.map((item) => item.currentUserPnl)),
        totalRefundAmount: sumAmountStrings(
          items.map((item) => item.currentUserRefundAmount),
        ),
      },
      items,
    };
  }

  async getResultOverviewForUser(
    userId: string,
  ): Promise<RespondentResultOverviewViewModel> {
    const [settledResults, userPositions] = await Promise.all([
      this.listResultsForUser(userId),
      this.listPositionsForUser(userId),
    ]);

    const openPositions = (
      await Promise.all(
        userPositions.map(async (position) => {
          const proposition = await this.deps.propositions.getById(
            position.propositionId,
          );
          if (!proposition) {
            throw new PropositionNotFoundError(position.propositionId);
          }

          const market = await this.deps.markets.getById(position.marketId);
          if (!market) {
            return null;
          }

          if (market.status === "settled" || proposition.status === "settled") {
            return null;
          }

          const counter = await this.deps.counters.getByPropositionId(
            proposition.id,
          );
          const marketView = buildValidationMarketViewModel({
            proposition,
            market,
            counter,
            currentUserPosition: position,
            now: new Date().toISOString(),
          });

          return {
            propositionId: proposition.id,
            propositionTitle: proposition.title,
            category: proposition.category,
            marketId: market.id,
            marketStatus: market.status,
            selectedOption: position.selectedOption,
            selectedOptionLabel:
              proposition.options[position.selectedOption] ??
              `Option ${position.selectedOption + 1}`,
            stakeAmount: position.stakeAmount,
            placedAt: position.placedAt,
            currentPublicPhase: marketView.publicProgress.publicState.phase,
            publicResult: marketView.publicProgress.lastPublishedResult,
          } satisfies RespondentOpenPositionListItemViewModel;
        }),
      )
    ).filter((item) => item !== null);

    const categoryExposureByCategory = new Map<
      PropositionCategory,
      { positionCount: number; totalStakeAmount: bigint }
    >();

    for (const position of openPositions) {
      const current = categoryExposureByCategory.get(position.category) ?? {
        positionCount: 0,
        totalStakeAmount: 0n,
      };
      current.positionCount += 1;
      current.totalStakeAmount += BigInt(position.stakeAmount);
      categoryExposureByCategory.set(position.category, current);
    }

    const categoryExposure = [...categoryExposureByCategory.entries()]
      .map(([category, exposure]) => ({
        category,
        positionCount: exposure.positionCount,
        totalStakeAmount: `${exposure.totalStakeAmount.toString()}.00`,
      }) satisfies RespondentOpenPositionCategoryExposureViewModel)
      .sort((left, right) =>
        Number.parseFloat(right.totalStakeAmount) -
        Number.parseFloat(left.totalStakeAmount),
      );

    const recentActivity = this.buildRecentActivity(
      settledResults.items,
      openPositions,
    );
    const largestExposure = categoryExposure[0]
      ? {
          category: categoryExposure[0].category,
          positionCount: categoryExposure[0].positionCount,
          totalStakeAmount: categoryExposure[0].totalStakeAmount,
          sharePercent: toPercent(
            categoryExposure[0].positionCount,
            openPositions.length,
          ),
        }
      : null;
    const trackedEntryCount =
      settledResults.totals.settledCount + openPositions.length;
    const settledPnlItems = settledResults.items.filter(
      (item) => item.currentUserPnl !== null,
    );
    const positiveSettledPnlItems = settledPnlItems.filter(
      (item) => toAmountBigInt(item.currentUserPnl) > 0n,
    );
    const negativeSettledPnlItems = settledPnlItems.filter(
      (item) => toAmountBigInt(item.currentUserPnl) < 0n,
    );
    const flatSettledPnlItems = settledPnlItems.filter(
      (item) => toAmountBigInt(item.currentUserPnl) === 0n,
    );
    const bestSettledPnl = this.resolvePnlExtreme(
      settledPnlItems,
      "best",
    );
    const worstSettledPnl = this.resolvePnlExtreme(
      settledPnlItems,
      "worst",
    );
    const analytics = this.buildAnalytics({
      settledResults,
      openPositions,
      settledPnlItems,
      positiveSettledPnlItems,
      negativeSettledPnlItems,
      flatSettledPnlItems,
    });

    return {
      userId,
      settledResults,
      openPositions: {
        totalCount: openPositions.length,
        totalStakeAmount: sumAmountStrings(
          openPositions.map((position) => position.stakeAmount),
        ),
        items: openPositions.sort((left, right) =>
          right.placedAt.localeCompare(left.placedAt),
        ),
        categoryExposure,
      },
      recentActivity,
      summary: {
        trackedEntryCount,
        settledSharePercent: toPercent(
          settledResults.totals.settledCount,
          trackedEntryCount,
        ),
        openPositionSharePercent: toPercent(
          openPositions.length,
          trackedEntryCount,
        ),
        latestActivityAt: recentActivity[0]?.occurredAt ?? null,
        latestActivityTitle: recentActivity[0]?.propositionTitle ?? null,
        largestExposure,
      },
      performance: {
        trackedSettledPnlCount: settledPnlItems.length,
        positiveSettledPnlCount: positiveSettledPnlItems.length,
        negativeSettledPnlCount: negativeSettledPnlItems.length,
        flatSettledPnlCount: flatSettledPnlItems.length,
        positiveSettledPnlRate: toPercent(
          positiveSettledPnlItems.length,
          settledPnlItems.length,
        ),
        averageSettledPnlAmount:
          settledPnlItems.length === 0
            ? "0.00"
            : `${(
                settledPnlItems.reduce(
                  (sum, item) => sum + toAmountBigInt(item.currentUserPnl),
                  0n,
                ) / BigInt(settledPnlItems.length)
              ).toString()}.00`,
        bestSettledPnl,
        worstSettledPnl,
      },
      analytics,
    };
  }

  private async listPositionsForUser(userId: string) {
    if (this.deps.positions.listByUser) {
      return this.deps.positions.listByUser(userId);
    }

    const markets = await this.deps.markets.list();
    const positions = await Promise.all(
      markets.map((market) =>
        this.deps.positions.findByMarketAndUser(market.id, userId),
      ),
    );

    return positions.filter((position) => position !== null);
  }

  private buildRecentActivity(
    settledResults: RespondentResultListItemViewModel[],
    openPositions: RespondentOpenPositionListItemViewModel[],
  ): RespondentAccountActivityItemViewModel[] {
    const settledActivities = settledResults.map((item) => ({
      activityType: "result_settled",
      propositionId: item.propositionId,
      propositionTitle: item.propositionTitle,
      category: item.category,
      occurredAt: item.settledAt,
      amount: item.currentUserPnl,
      direction:
        item.currentUserPnl && item.currentUserPnl.startsWith("-")
          ? "negative"
          : item.currentUserPnl && item.currentUserPnl !== "0"
            ? "positive"
            : "neutral",
      detail:
        item.currentUserSettlementOutcome === "won"
          ? "Position settled as win"
          : item.currentUserSettlementOutcome === "lost"
            ? "Position settled as loss"
            : item.currentUserSettlementOutcome === "refund"
              ? "Position refunded"
              : "Settlement recorded",
    } satisfies RespondentAccountActivityItemViewModel));

    const rewardActivities = settledResults
      .filter((item) => item.currentUserRewardStatus !== null)
      .map((item) => ({
        activityType:
          item.currentUserRewardStatus === "pending"
            ? "reward_pending"
            : "reward_finalized",
        propositionId: item.propositionId,
        propositionTitle: item.propositionTitle,
        category: item.category,
        occurredAt: item.settledAt,
        amount: item.currentUserRewardAmount,
        direction:
          item.currentUserRewardAmount && item.currentUserRewardAmount !== "0"
            ? "positive"
            : "neutral",
        detail:
          item.currentUserRewardStatus === "pending"
            ? "Reward pending review resolution"
            : "Reward finalized",
      } satisfies RespondentAccountActivityItemViewModel));

    const openPositionActivities = openPositions.map((item) => ({
      activityType: "position_opened",
      propositionId: item.propositionId,
      propositionTitle: item.propositionTitle,
      category: item.category,
      occurredAt: item.placedAt,
      amount: item.stakeAmount,
      direction: "neutral",
      detail: `Open position on ${item.selectedOptionLabel}`,
    } satisfies RespondentAccountActivityItemViewModel));

    return [...settledActivities, ...rewardActivities, ...openPositionActivities]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 12);
  }

  private resolvePnlExtreme(
    items: RespondentResultListItemViewModel[],
    mode: "best" | "worst",
  ): RespondentResultOverviewPnlExtremeViewModel | null {
    if (items.length === 0) {
      return null;
    }

    const selected = items.reduce((current, item) => {
      if (!current) {
        return item;
      }

      const currentAmount = toAmountBigInt(current.currentUserPnl);
      const nextAmount = toAmountBigInt(item.currentUserPnl);
      return mode === "best"
        ? nextAmount > currentAmount
          ? item
          : current
        : nextAmount < currentAmount
          ? item
          : current;
    }, items[0] ?? null);

    if (!selected || selected.currentUserPnl === null) {
      return null;
    }

    return {
      propositionId: selected.propositionId,
      propositionTitle: selected.propositionTitle,
      settledAt: selected.settledAt,
      amount: `${selected.currentUserPnl}.00`,
    };
  }

  private buildAnalytics(input: {
    settledResults: RespondentResultListViewModel;
    openPositions: RespondentOpenPositionListItemViewModel[];
    settledPnlItems: RespondentResultListItemViewModel[];
    positiveSettledPnlItems: RespondentResultListItemViewModel[];
    negativeSettledPnlItems: RespondentResultListItemViewModel[];
    flatSettledPnlItems: RespondentResultListItemViewModel[];
  }): RespondentResultOverviewAnalyticsViewModel {
    const settledGrossPayoutAmountBigInt = toAmountBigInt(
      input.settledResults.totals.totalGrossPayout,
    );
    const openStakeTrackedAmountBigInt = input.openPositions.reduce(
      (sum, position) => sum + toAmountBigInt(position.stakeAmount),
      0n,
    );
    const rewardAmountBigInt =
      toAmountBigInt(input.settledResults.totals.finalizedRewardAmount) +
      toAmountBigInt(input.settledResults.totals.pendingRewardAmount);
    const trackedAmountBigInt =
      settledGrossPayoutAmountBigInt +
      openStakeTrackedAmountBigInt +
      rewardAmountBigInt;
    const longCount = input.openPositions.filter(
      (position) => position.selectedOption === 0,
    ).length;
    const shortCount = input.openPositions.length - longCount;
    const scheduledCount = input.openPositions.filter(
      (position) => position.currentPublicPhase === "scheduled",
    ).length;
    const liveCount = input.openPositions.filter(
      (position) => position.currentPublicPhase === "live",
    ).length;
    const frozenCount = input.openPositions.filter(
      (position) => position.currentPublicPhase === "frozen",
    ).length;
    const revealingCount = input.openPositions.filter(
      (position) => position.currentPublicPhase === "revealing",
    ).length;

    return {
      assetBreakdown: {
        trackedAmount: `${trackedAmountBigInt.toString()}.00`,
        settledGrossPayoutAmount: `${settledGrossPayoutAmountBigInt.toString()}.00`,
        openStakeAmount: `${openStakeTrackedAmountBigInt.toString()}.00`,
        rewardAmount: `${rewardAmountBigInt.toString()}.00`,
        finalizedRewardAmount: input.settledResults.totals.finalizedRewardAmount,
        pendingRewardAmount: input.settledResults.totals.pendingRewardAmount,
        settledGrossPayoutSharePercent: toPercent(
          Number(settledGrossPayoutAmountBigInt),
          Number(trackedAmountBigInt),
        ),
        openStakeSharePercent: toPercent(
          Number(openStakeTrackedAmountBigInt),
          Number(trackedAmountBigInt),
        ),
        rewardSharePercent: toPercent(
          Number(rewardAmountBigInt),
          Number(trackedAmountBigInt),
        ),
      },
      positionStructure: {
        totalCount: input.openPositions.length,
        longCount,
        shortCount,
        scheduledCount,
        liveCount,
        frozenCount,
        revealingCount,
        longSharePercent: toPercent(longCount, input.openPositions.length),
        shortSharePercent: toPercent(shortCount, input.openPositions.length),
        scheduledSharePercent: toPercent(
          scheduledCount,
          input.openPositions.length,
        ),
        liveSharePercent: toPercent(liveCount, input.openPositions.length),
        frozenSharePercent: toPercent(frozenCount, input.openPositions.length),
        revealingSharePercent: toPercent(
          revealingCount,
          input.openPositions.length,
        ),
      },
      settlementDistribution: {
        trackedSettledPnlCount: input.settledPnlItems.length,
        positiveCount: input.positiveSettledPnlItems.length,
        negativeCount: input.negativeSettledPnlItems.length,
        flatCount: input.flatSettledPnlItems.length,
        positiveSharePercent: toPercent(
          input.positiveSettledPnlItems.length,
          input.settledPnlItems.length,
        ),
        negativeSharePercent: toPercent(
          input.negativeSettledPnlItems.length,
          input.settledPnlItems.length,
        ),
        flatSharePercent: toPercent(
          input.flatSettledPnlItems.length,
          input.settledPnlItems.length,
        ),
      },
    };
  }
}
