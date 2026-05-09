import { Injectable, Optional } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import {
  type QualityAnomalyMonitoringItemViewModel,
  type SampleShortageMonitoringItemViewModel,
  type ValidationLifecycleDriftMonitoringItemViewModel,
  type ValidationChainMonitoringViewModel,
} from "../internal-ops.types";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { UserReputationRepository } from "../repositories/user-reputation.repository";
import {
  buildValidationLifecycleSnapshot,
  type ValidationLifecycleDriftReason,
} from "../validation-lifecycle";
import { ValidationChainAlertService } from "../validation-chain/validation-chain-alert.service";
import { EffectiveSampleCounterService } from "./effective-sample-counter.service";

const DEFAULT_DEADLINE_WINDOW_MINUTES = 60;

const buildTopFlags = (
  reviews: Array<{ flags: string[] }>,
): Array<{ flag: string; count: number }> => {
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
export class InternalMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly reputations: UserReputationRepository,
    private readonly counters: EffectiveSampleCounterService,
    @Optional()
    private readonly validationChainAlerts?: ValidationChainAlertService,
  ) {}

  async listSampleShortage(
    nowIso = new Date().toISOString(),
    deadlineWithinMinutes = DEFAULT_DEADLINE_WINDOW_MINUTES,
    db?: ArenaDbClient,
  ): Promise<SampleShortageMonitoringItemViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const propositions = await this.propositions.list({ status: "live" }, tx);
      const now = new Date(nowIso);

      const items = await Promise.all(
        propositions.map(async (proposition) => {
          const refreshedCounter = await this.counters.rebuildCounterForProposition(
            proposition.id,
            tx,
          );
          if (refreshedCounter.hasReachedMinEffectiveSample) {
            return null;
          }

          const deadlineAt =
            proposition.liveAt === null
              ? null
              : new Date(
                  proposition.liveAt.getTime() +
                    proposition.maxDurationSeconds * 1000,
                );
          const remainingSeconds =
            deadlineAt === null
              ? null
              : Math.max(0, Math.floor((deadlineAt.getTime() - now.getTime()) / 1000));

          return {
            propositionId: proposition.id,
            title: proposition.title,
            category: proposition.category,
            status: proposition.status,
            liveAt: proposition.liveAt?.toISOString() ?? null,
            deadlineAt: deadlineAt?.toISOString() ?? null,
            remainingSeconds,
            minEffectiveSample: proposition.minEffectiveSample,
            effectiveSampleCount: refreshedCounter.effectiveSampleCount,
            reviewedResponseCount: refreshedCounter.reviewedResponses,
            shortageCount: Math.max(
              0,
              proposition.minEffectiveSample - refreshedCounter.effectiveSampleCount,
            ),
            nearingDeadline:
              remainingSeconds !== null &&
              remainingSeconds <= deadlineWithinMinutes * 60,
          } satisfies SampleShortageMonitoringItemViewModel;
        }),
      );

      return items
        .filter((item): item is SampleShortageMonitoringItemViewModel => item !== null)
        .sort((left, right) => {
          const leftSeconds = left.remainingSeconds ?? Number.MAX_SAFE_INTEGER;
          const rightSeconds = right.remainingSeconds ?? Number.MAX_SAFE_INTEGER;
          return leftSeconds - rightSeconds;
        });
    });
  }

  async listQualityAnomalies(
    db?: ArenaDbClient,
  ): Promise<QualityAnomalyMonitoringItemViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const propositions = await this.propositions.list({}, tx);

      const items = await Promise.all(
        propositions.map(async (proposition) => {
          if (["draft", "scheduled", "archived"].includes(proposition.status)) {
            return null;
          }

          const [responses, reviews] = await Promise.all([
            this.responses.listLatestByProposition(proposition.id, tx),
            this.reviews.listFinalizedByPropositionId(proposition.id, tx),
          ]);

          if (reviews.length === 0) {
            return null;
          }

          const invalidCount = reviews.filter((review) => review.status === "invalid").length;
          const fraudSuspectedCount = reviews.filter(
            (review) => review.status === "fraud_suspected",
          ).length;
          const flaggedCount = reviews.filter((review) => review.flags.length > 0).length;
          const invalidRate = invalidCount / reviews.length;
          const anomalyRate = flaggedCount / reviews.length;
          const respondentIds = Array.from(
            new Set(responses.map((response) => response.userId)),
          );
          const reputations = await Promise.all(
            respondentIds.map((userId) => this.reputations.findByUserId(userId, tx)),
          );
          const riskyRespondentCount = reputations.filter(
            (reputation) => reputation?.reputationLevel === "risky",
          ).length;

          if (
            invalidRate < 0.3 &&
            anomalyRate < 0.3 &&
            fraudSuspectedCount === 0 &&
            riskyRespondentCount === 0
          ) {
            return null;
          }

          return {
            propositionId: proposition.id,
            title: proposition.title,
            category: proposition.category,
            status: proposition.status,
            reviewedResponseCount: reviews.length,
            validCount: reviews.filter((review) => review.status === "valid").length,
            partialValidCount: reviews.filter(
              (review) => review.status === "partial_valid",
            ).length,
            invalidCount,
            fraudSuspectedCount,
            flaggedCount,
            invalidRate,
            anomalyRate,
            riskyRespondentCount,
            topFlags: buildTopFlags(reviews),
          } satisfies QualityAnomalyMonitoringItemViewModel;
        }),
      );

      return items
        .filter((item): item is QualityAnomalyMonitoringItemViewModel => item !== null)
        .sort((left, right) => {
          if (left.anomalyRate !== right.anomalyRate) {
            return right.anomalyRate - left.anomalyRate;
          }

          if (left.invalidRate !== right.invalidRate) {
            return right.invalidRate - left.invalidRate;
          }

          return right.riskyRespondentCount - left.riskyRespondentCount;
        });
    });
  }

  async listValidationLifecycleDrift(
    db?: ArenaDbClient,
  ): Promise<ValidationLifecycleDriftMonitoringItemViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const propositions = await this.propositions.list({}, tx);

      const items = await Promise.all(
        propositions.map(async (proposition) => {
          if (!proposition.marketEnabled) {
            return null;
          }

          const market = await this.markets.findByPropositionId(proposition.id, tx);
          const validationLifecycle = buildValidationLifecycleSnapshot(
            proposition,
            market,
          );

          if (!validationLifecycle.driftReason) {
            return null;
          }

          return {
            propositionId: proposition.id,
            title: proposition.title,
            category: proposition.category,
            propositionStatus: validationLifecycle.propositionStatus,
            marketId: validationLifecycle.marketId,
            marketStatus: validationLifecycle.marketStatus,
            chainMarketId: validationLifecycle.chainMarketId,
            chainStatus: validationLifecycle.chainStatus,
            chainSyncedAt: validationLifecycle.chainSyncedAt,
            publishedAt: proposition.publishedAt?.toISOString() ?? null,
            liveAt: proposition.liveAt?.toISOString() ?? null,
            frozenAt: proposition.frozenAt?.toISOString() ?? null,
            revealStartedAt: proposition.revealStartedAt?.toISOString() ?? null,
            resultComputedAt: proposition.resultComputedAt?.toISOString() ?? null,
            settledAt: proposition.settledAt?.toISOString() ?? null,
            driftReason: validationLifecycle.driftReason,
          } satisfies ValidationLifecycleDriftMonitoringItemViewModel;
        }),
      );

      return items
        .filter(
          (item): item is ValidationLifecycleDriftMonitoringItemViewModel =>
            item !== null,
        )
        .sort((left, right) => {
          const leftRank = this.getDriftSeverityRank(left.driftReason);
          const rightRank = this.getDriftSeverityRank(right.driftReason);
          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }

          const leftTime = this.getLifecycleSortTime(left);
          const rightTime = this.getLifecycleSortTime(right);
          return rightTime - leftTime;
        });
    });
  }

  async getValidationChainHealth(
    nowIso = new Date().toISOString(),
    db?: ArenaDbClient,
  ): Promise<ValidationChainMonitoringViewModel | null> {
    if (!this.validationChainAlerts) {
      return null;
    }

    return this.validationChainAlerts.getHealthSnapshot(nowIso, db);
  }

  private getDriftSeverityRank(reason: ValidationLifecycleDriftReason): number {
    switch (reason) {
      case "market_missing":
        return 0;
      case "chain_market_not_resolved":
        return 1;
      case "chain_market_not_frozen":
        return 2;
      case "chain_market_not_opened":
        return 3;
      case "chain_market_not_created":
        return 4;
      default:
        return 99;
    }
  }

  private getLifecycleSortTime(
    item: ValidationLifecycleDriftMonitoringItemViewModel,
  ): number {
    return Date.parse(
      item.settledAt ??
        item.resultComputedAt ??
        item.revealStartedAt ??
        item.frozenAt ??
        item.liveAt ??
        item.publishedAt ??
        "1970-01-01T00:00:00.000Z",
    );
  }
}
