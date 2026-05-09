import type {
  UserReputation,
  UserReputationMetrics,
} from "../entities.js";
import type { ReputationLevel } from "../enums.js";
import {
  QUALITY_REPUTATION_DEFAULTS,
  QUALITY_REPUTATION_RULE_VERSION,
} from "./constants.js";

export interface QualityReputationComputationInput {
  userId: string;
  assignedTaskCount: number;
  closedTaskCount: number;
  submittedTaskCount: number;
  reviewedResponseCount: number;
  validCount: number;
  partialValidCount: number;
  invalidCount: number;
  fraudFlagCount: number;
  flaggedReviewCount: number;
  anomalyCount: number;
  computedAt: string;
}

export interface QualityReputationComputationResult
  extends Pick<
    UserReputation,
    "userId" | "reputationScore" | "reputationLevel" | "ruleVersion" | "metrics" | "computedAt"
  > {}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const roundRate = (value: number): number => Math.round(value * 10000) / 10000;

const ratio = (numerator: number, denominator: number): number => {
  if (denominator <= 0) {
    return 0;
  }

  return roundRate(numerator / denominator);
};

const resolveLevel = (
  score: number,
  metrics: UserReputationMetrics,
): ReputationLevel => {
  if (
    metrics.reviewedResponseCount <
    QUALITY_REPUTATION_DEFAULTS.minimumNewReviews
  ) {
    return "new";
  }

  if (
    score >= QUALITY_REPUTATION_DEFAULTS.trustedScore &&
    metrics.reviewedResponseCount >=
      QUALITY_REPUTATION_DEFAULTS.minimumTrustedReviews &&
    metrics.fraudFlagCount === 0 &&
    metrics.invalidRate <= QUALITY_REPUTATION_DEFAULTS.trustedInvalidRate &&
    metrics.completionRate >=
      QUALITY_REPUTATION_DEFAULTS.trustedCompletionRate
  ) {
    return "trusted";
  }

  if (
    score < QUALITY_REPUTATION_DEFAULTS.riskyScore ||
    metrics.invalidRate >= QUALITY_REPUTATION_DEFAULTS.riskyInvalidRate ||
    metrics.fraudRate >= QUALITY_REPUTATION_DEFAULTS.riskyFraudRate
  ) {
    return "risky";
  }

  return "normal";
};

export class QualityReputationEngine {
  compute(
    input: QualityReputationComputationInput,
  ): QualityReputationComputationResult {
    const metrics: UserReputationMetrics = {
      assignedTaskCount: input.assignedTaskCount,
      closedTaskCount: input.closedTaskCount,
      submittedTaskCount: input.submittedTaskCount,
      reviewedResponseCount: input.reviewedResponseCount,
      validCount: input.validCount,
      partialValidCount: input.partialValidCount,
      invalidCount: input.invalidCount,
      fraudFlagCount: input.fraudFlagCount,
      flaggedReviewCount: input.flaggedReviewCount,
      anomalyCount: input.anomalyCount,
      completionRate: ratio(input.submittedTaskCount, input.closedTaskCount),
      validRate: ratio(input.validCount, input.reviewedResponseCount),
      partialValidRate: ratio(
        input.partialValidCount,
        input.reviewedResponseCount,
      ),
      invalidRate: ratio(input.invalidCount, input.reviewedResponseCount),
      fraudRate: ratio(input.fraudFlagCount, input.reviewedResponseCount),
      anomalyRate: ratio(input.anomalyCount, input.reviewedResponseCount),
    };

    const rawScore = clamp(
      QUALITY_REPUTATION_DEFAULTS.neutralScore +
        metrics.completionRate * 10 +
        metrics.validRate * 25 +
        metrics.partialValidRate * 5 -
        metrics.invalidRate * 25 -
        metrics.fraudRate * 30 -
        metrics.anomalyRate * 15,
      0,
      100,
    );

    const sampleWeight = clamp(
      metrics.reviewedResponseCount /
        QUALITY_REPUTATION_DEFAULTS.smoothingReviewCap,
      0,
      1,
    );

    const reputationScore = Math.round(
      QUALITY_REPUTATION_DEFAULTS.neutralScore +
        (rawScore - QUALITY_REPUTATION_DEFAULTS.neutralScore) * sampleWeight,
    );

    return {
      userId: input.userId,
      reputationScore,
      reputationLevel: resolveLevel(reputationScore, metrics),
      ruleVersion: QUALITY_REPUTATION_RULE_VERSION,
      metrics,
      computedAt: input.computedAt,
    };
  }
}
