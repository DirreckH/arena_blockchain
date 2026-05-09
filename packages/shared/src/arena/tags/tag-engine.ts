import type { UserReputation } from "../entities.js";
import type { PropositionCategory } from "../enums.js";
import {
  RESPONDENT_TAG_DEFAULTS,
  RESPONDENT_INTEREST_TAG_BY_CATEGORY,
  RESPONDENT_TAG_RULE_VERSION,
} from "./constants.js";

export interface InterestCategoryParticipation {
  category: PropositionCategory;
  responseCount: number;
  share: number;
}

export interface RespondentTagComputationInput {
  reputation: UserReputation | null;
  categoryParticipation: InterestCategoryParticipation[];
  totalCategorizedResponses: number;
}

export interface ComputedUserTag {
  tagKey: string;
  tagType: "quality_reputation" | "interest";
  tagValue: string;
  confidenceScore: number;
  sourceType: "reputation" | "participation";
  ruleVersion: string;
  metadata: unknown;
}

const clampScore = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

export class RespondentTagEngine {
  compute(input: RespondentTagComputationInput): ComputedUserTag[] {
    return [
      ...this.buildQualityTags(input.reputation),
      ...this.buildInterestTags(
        input.categoryParticipation,
        input.totalCategorizedResponses,
      ),
    ];
  }

  private buildQualityTags(
    reputation: UserReputation | null,
  ): ComputedUserTag[] {
    if (!reputation) {
      return [];
    }

    const tags: ComputedUserTag[] = [];
    const metrics = reputation.metrics;
    const reviewed = metrics.reviewedResponseCount;

    if (
      metrics.closedTaskCount >= RESPONDENT_TAG_DEFAULTS.minimumQualitySample &&
      metrics.completionRate >= 0.8
    ) {
      tags.push({
        tagKey: "high_completion",
        tagType: "quality_reputation",
        tagValue: RESPONDENT_TAG_DEFAULTS.tagValue,
        confidenceScore: clampScore(metrics.completionRate * 100),
        sourceType: "reputation",
        ruleVersion: RESPONDENT_TAG_RULE_VERSION,
        metadata: {
          completionRate: metrics.completionRate,
          closedTaskCount: metrics.closedTaskCount,
        },
      });
    }

    if (
      reviewed >= RESPONDENT_TAG_DEFAULTS.minimumHighQualitySample &&
      metrics.validRate >= 0.75 &&
      metrics.invalidRate <= 0.15
    ) {
      tags.push({
        tagKey: "high_quality",
        tagType: "quality_reputation",
        tagValue: RESPONDENT_TAG_DEFAULTS.tagValue,
        confidenceScore: clampScore(
          metrics.validRate * 70 + (1 - metrics.invalidRate) * 30,
        ),
        sourceType: "reputation",
        ruleVersion: RESPONDENT_TAG_RULE_VERSION,
        metadata: {
          reputationScore: reputation.reputationScore,
          validRate: metrics.validRate,
          invalidRate: metrics.invalidRate,
          reviewedResponseCount: reviewed,
        },
      });
    }

    if (
      reviewed >= RESPONDENT_TAG_DEFAULTS.minimumHighQualitySample &&
      metrics.anomalyRate <= 0.15 &&
      metrics.fraudFlagCount === 0
    ) {
      tags.push({
        tagKey: "low_anomaly",
        tagType: "quality_reputation",
        tagValue: RESPONDENT_TAG_DEFAULTS.tagValue,
        confidenceScore: clampScore((1 - metrics.anomalyRate) * 100),
        sourceType: "reputation",
        ruleVersion: RESPONDENT_TAG_RULE_VERSION,
        metadata: {
          anomalyRate: metrics.anomalyRate,
          fraudFlagCount: metrics.fraudFlagCount,
          reviewedResponseCount: reviewed,
        },
      });
    }

    if (
      reviewed >= RESPONDENT_TAG_DEFAULTS.minimumStableSample &&
      metrics.completionRate >= 0.75 &&
      metrics.validRate >= 0.7 &&
      metrics.anomalyRate <= 0.1 &&
      reputation.reputationLevel !== "risky"
    ) {
      tags.push({
        tagKey: "stable_responder",
        tagType: "quality_reputation",
        tagValue: RESPONDENT_TAG_DEFAULTS.tagValue,
        confidenceScore: clampScore(
          metrics.completionRate * 30 +
            metrics.validRate * 40 +
            (1 - metrics.anomalyRate) * 30,
        ),
        sourceType: "reputation",
        ruleVersion: RESPONDENT_TAG_RULE_VERSION,
        metadata: {
          completionRate: metrics.completionRate,
          validRate: metrics.validRate,
          anomalyRate: metrics.anomalyRate,
          reviewedResponseCount: reviewed,
          reputationLevel: reputation.reputationLevel,
        },
      });
    }

    if (
      metrics.fraudFlagCount > 0 ||
      (reviewed >= RESPONDENT_TAG_DEFAULTS.minimumQualitySample &&
        (reputation.reputationLevel === "risky" ||
          metrics.invalidRate >= 0.4 ||
          metrics.anomalyRate >= 0.35))
    ) {
      tags.push({
        tagKey: "risky_responder",
        tagType: "quality_reputation",
        tagValue: RESPONDENT_TAG_DEFAULTS.tagValue,
        confidenceScore: clampScore(
          Math.max(
            metrics.invalidRate * 100,
            metrics.anomalyRate * 100,
            metrics.fraudFlagCount > 0 ? 100 : 0,
          ),
        ),
        sourceType: "reputation",
        ruleVersion: RESPONDENT_TAG_RULE_VERSION,
        metadata: {
          invalidRate: metrics.invalidRate,
          anomalyRate: metrics.anomalyRate,
          fraudFlagCount: metrics.fraudFlagCount,
          reputationLevel: reputation.reputationLevel,
          reviewedResponseCount: reviewed,
        },
      });
    }

    return tags;
  }

  private buildInterestTags(
    categoryParticipation: InterestCategoryParticipation[],
    totalCategorizedResponses: number,
  ): ComputedUserTag[] {
    if (
      totalCategorizedResponses <
      RESPONDENT_TAG_DEFAULTS.minimumInterestResponses
    ) {
      return [];
    }

    return categoryParticipation
      .filter(
        (item) =>
          item.category !== "general" &&
          item.responseCount >=
            RESPONDENT_TAG_DEFAULTS.minimumInterestCategoryCount &&
          item.share >= RESPONDENT_TAG_DEFAULTS.minimumInterestShare,
      )
      .sort((left, right) => {
        if (right.responseCount !== left.responseCount) {
          return right.responseCount - left.responseCount;
        }

        return right.share - left.share;
      })
      .slice(0, RESPONDENT_TAG_DEFAULTS.maximumInterestTags)
      .map((item) => ({
        tagKey: RESPONDENT_INTEREST_TAG_BY_CATEGORY[item.category],
        tagType: "interest" as const,
        tagValue: RESPONDENT_TAG_DEFAULTS.tagValue,
        confidenceScore: clampScore(
          item.share * 70 +
            Math.min(
              item.responseCount /
                (RESPONDENT_TAG_DEFAULTS.minimumInterestCategoryCount + 3),
              1,
            ) *
              30,
        ),
        sourceType: "participation" as const,
        ruleVersion: RESPONDENT_TAG_RULE_VERSION,
        metadata: {
          category: item.category,
          responseCount: item.responseCount,
          totalCategorizedResponses,
          share: item.share,
        },
      }))
      .filter((item) => Boolean(item.tagKey));
  }
}
