export const QUALITY_REPUTATION_RULE_VERSION = "quality-reputation-v1";

export const QUALITY_REPUTATION_DEFAULTS = {
  neutralScore: 60,
  minimumTrustedReviews: 8,
  minimumNewReviews: 3,
  smoothingReviewCap: 8,
  trustedScore: 85,
  riskyScore: 50,
  riskyInvalidRate: 0.5,
  riskyFraudRate: 0.25,
  trustedCompletionRate: 0.75,
  trustedInvalidRate: 0.15,
} as const;
