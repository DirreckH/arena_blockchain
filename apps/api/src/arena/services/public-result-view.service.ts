import { Injectable } from "@nestjs/common";
import {
  buildAdjudicationAggregate,
  type PublicSettledResultItemViewModel,
  type PublicSettledResultsViewModel,
} from "@arena/shared";
import type { Proposition, Response, ResponseReview } from "@prisma/client";

import { toSharedCounter, toSharedProposition, toSharedResponse, toSharedReview } from "../arena-view.mapper";
import { EffectiveSampleCounterRepository } from "../repositories/effective-sample-counter.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";

@Injectable()
export class PublicResultViewService {
  constructor(
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly counters: EffectiveSampleCounterRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
  ) {}

  async listSettledResults(): Promise<PublicSettledResultsViewModel> {
    const propositions = await this.propositions.list({ status: "settled" });
    const sorted = propositions
      .filter((proposition) => proposition.settledAt !== null)
      .sort(
        (left, right) =>
          (right.settledAt?.getTime() ?? 0) - (left.settledAt?.getTime() ?? 0) ||
          right.updatedAt.getTime() - left.updatedAt.getTime(),
      );

    const items = await Promise.all(
      sorted.map(async (proposition) => this.buildSettledResultItem(proposition)),
    );

    return {
      totalCount: items.length,
      items,
    };
  }

  private async buildSettledResultItem(
    proposition: Proposition,
  ): Promise<PublicSettledResultItemViewModel> {
    const [market, counter, latestResponses] = await Promise.all([
      this.markets.findByPropositionId(proposition.id),
      this.counters.findByPropositionId(proposition.id),
      this.responses.listLatestByProposition(proposition.id),
    ]);

    const latestReviews = await this.listLatestReviews(latestResponses);
    const aggregate = buildAdjudicationAggregate({
      proposition: toSharedProposition(proposition),
      latestResponses: latestResponses.map((response) => toSharedResponse(response)!),
      reviews: latestReviews.map((review) => toSharedReview(review)!),
      counter: toSharedCounter(counter),
    });

    const optionVotes =
      proposition.winningOption === 0
        ? aggregate.option0Votes
        : proposition.winningOption === 1
          ? aggregate.option1Votes
          : 0;
    const winMarginPercent =
      proposition.resultKind === "resolved" && aggregate.effectiveSampleCount > 0
        ? Math.round((optionVotes / aggregate.effectiveSampleCount) * 1000) / 10
        : null;

    return {
      propositionId: proposition.id,
      marketId: market?.id ?? null,
      title: proposition.title,
      category: proposition.category,
      winningOptionLabel:
        proposition.winningOption === 0
          ? proposition.options[0] ?? null
          : proposition.winningOption === 1
            ? proposition.options[1] ?? null
            : null,
      resultKind: proposition.resultKind ?? "void",
      winningOption: proposition.winningOption as 0 | 1 | null,
      voidReason: proposition.voidReason,
      validSampleCount: aggregate.effectiveSampleCount,
      winMarginPercent,
      settledAt: proposition.settledAt!.toISOString(),
      settlementTxHash: market?.resolutionTxHash ?? market?.cancelTxHash ?? null,
      onChain: Boolean(market?.resolutionTxHash ?? market?.cancelTxHash),
    };
  }

  private async listLatestReviews(
    latestResponses: Response[],
  ): Promise<ResponseReview[]> {
    const reviews = await Promise.all(
      latestResponses.map((response) => this.reviews.findByResponseId(response.id)),
    );

    return reviews.filter((review): review is ResponseReview => review !== null);
  }
}
