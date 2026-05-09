import type { Proposition } from "../entities.js";
import {
  InvalidRewardAmountError,
  RewardBudgetInsufficientError,
} from "./errors.js";

const NON_NEGATIVE_INTEGER_PATTERN = /^[0-9]+$/;

const parseUnsignedAmount = (value: string, field: string): bigint => {
  if (!NON_NEGATIVE_INTEGER_PATTERN.test(value)) {
    throw new InvalidRewardAmountError(value, field);
  }

  return BigInt(value);
};

export const assertRewardBudgetSufficient = (
  proposition: Pick<
    Proposition,
    "id" | "rewardBudget" | "baseResponseReward" | "minEffectiveSample"
  >,
): void => {
  const rewardBudget = parseUnsignedAmount(
    proposition.rewardBudget,
    "rewardBudget",
  );
  const baseResponseReward = parseUnsignedAmount(
    proposition.baseResponseReward,
    "baseResponseReward",
  );

  const requiredBudget =
    BigInt(Math.max(0, proposition.minEffectiveSample)) * baseResponseReward;

  if (rewardBudget < requiredBudget) {
    throw new RewardBudgetInsufficientError(
      proposition.id,
      proposition.rewardBudget,
      requiredBudget.toString(),
    );
  }
};
