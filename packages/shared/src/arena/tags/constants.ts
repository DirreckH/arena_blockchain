export const RESPONDENT_TAG_RULE_VERSION = "respondent-tags-v1";

export const RESPONDENT_QUALITY_TAG_KEYS = [
  "high_completion",
  "high_quality",
  "low_anomaly",
  "stable_responder",
  "risky_responder",
] as const;

export const RESPONDENT_INTEREST_TAG_KEYS = [
  "interested_in_sports",
  "interested_in_dao",
  "interested_in_ai",
  "interested_in_brand_research",
  "interested_in_politics",
  "interested_in_entertainment",
] as const;

export const RESPONDENT_INTEREST_TAG_BY_CATEGORY = {
  sports: "interested_in_sports",
  dao: "interested_in_dao",
  ai: "interested_in_ai",
  brand_research: "interested_in_brand_research",
  politics: "interested_in_politics",
  entertainment: "interested_in_entertainment",
} as const;

export const RESPONDENT_TAG_DEFAULTS = {
  tagValue: "active",
  minimumQualitySample: 3,
  minimumHighQualitySample: 5,
  minimumStableSample: 8,
  minimumInterestResponses: 3,
  minimumInterestCategoryCount: 2,
  minimumInterestShare: 0.4,
  maximumInterestTags: 2,
} as const;
