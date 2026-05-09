import { Injectable } from "@nestjs/common";
import type { RespondentAccountOverviewViewModel } from "@arena/shared";

import { ResultViewService } from "./result-view.service";
import { RewardViewService } from "./reward-view.service";
import { ReputationService } from "./reputation.service";
import { TagService } from "./tag.service";

const sumAmountStrings = (values: Array<string | null | undefined>): string => {
  const total = values.reduce((sum, value) => sum + BigInt(value ?? "0"), 0n);
  return `${total.toString()}.00`;
};

@Injectable()
export class AccountViewService {
  constructor(
    private readonly rewards: RewardViewService,
    private readonly reputation: ReputationService,
    private readonly tags: TagService,
    private readonly results: ResultViewService,
  ) {}

  async getAccountOverviewForUser(
    userId: string,
  ): Promise<RespondentAccountOverviewViewModel> {
    const [rewards, reputation, tags, resultOverview] = await Promise.all([
      this.rewards.listRewardsForUser(userId),
      this.reputation.getSummaryForUser(userId),
      this.tags.getSummaryForUser(userId),
      this.results.getResultOverviewForUser(userId),
    ]);

    const currentRewards = rewards.filter((reward) => reward.isCurrent);

    return {
      userId,
      rewards,
      rewardSummary: {
        currentCount: currentRewards.length,
        pendingAmount: sumAmountStrings(
          currentRewards
            .filter((reward) => reward.status === "pending")
            .map((reward) => reward.pendingAmount),
        ),
        finalizedAmount: sumAmountStrings(
          currentRewards
            .filter((reward) => reward.status === "finalized")
            .map((reward) => reward.finalAmount),
        ),
      },
      reputation,
      tags,
      resultOverview,
    };
  }
}
