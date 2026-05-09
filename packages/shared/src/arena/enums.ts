export const ARENA_PROPOSITION_TYPES = ["consensus"] as const;
export const ARENA_PROPOSITION_STRUCTURES = ["binary"] as const;
export const ARENA_ROLLING_MODES = ["non_rolling"] as const;
export const ARENA_SETTLEMENT_TARGETS = ["final"] as const;
export const PROPOSITION_CATEGORIES = [
  "general",
  "sports",
  "ai",
  "brand_research",
  "politics",
  "entertainment",
] as const;

export const ARENA_BINARY_OPTIONS = [0, 1] as const;

export const PROPOSITION_STATUSES = [
  "draft",
  "scheduled",
  "live",
  "frozen",
  "revealing",
  "settled",
  "closed",
  "archived",
] as const;

export const DISPATCH_TASK_STATUSES = [
  "assigned",
  "started",
  "submitted",
  "skipped",
  "expired",
  "cancelled",
] as const;

export const RESPONSE_REVIEW_STATUSES = [
  "pending_review",
  "valid",
  "partial_valid",
  "invalid",
  "fraud_suspected",
] as const;

export const MARKET_STATUSES = [
  "pre_live",
  "live",
  "frozen_for_reveal",
  "settling",
  "settled",
  "cancelled",
] as const;

export const PROPOSITION_RESULT_KINDS = ["resolved", "void"] as const;
export const PROPOSITION_VOID_REASONS = [
  "insufficient_sample",
  "tie",
] as const;

export const REWARD_LEDGER_SOURCE_TYPES = ["response"] as const;

export const REWARD_LEDGER_STATUSES = [
  "pending",
  "finalized",
  "voided",
  "reversed",
] as const;

export const REWARD_LEDGER_REASON_CODES = [
  "review_valid",
  "review_partial_valid",
  "invalid_review",
  "review_corrected",
  "superseded_pending_latest",
  "late_submit",
  "expired_task_submit",
  "revealing_started_submit",
  "fraud_suspected_review",
] as const;

export const POSITION_SETTLEMENT_OUTCOMES = [
  "won",
  "lost",
  "refund",
] as const;

export const FRONTEND_SURFACES = [
  "neutral",
  "adjudication",
  "validation",
  "ops",
  "result",
] as const;

export const REPUTATION_LEVELS = [
  "new",
  "normal",
  "trusted",
  "risky",
] as const;

export const USER_TAG_TYPES = [
  "quality_reputation",
  "interest",
] as const;

export const USER_TAG_SOURCE_TYPES = [
  "reputation",
  "participation",
] as const;

export const ARENA_CORE_ENTITY_NAMES = [
  "Proposition",
  "DispatchTask",
  "Response",
  "ResponseReview",
  "EffectiveSampleCounter",
  "Market",
  "PositionBet",
  "RewardLedger",
  "UserReputation",
  "UserTag",
] as const;

export type ArenaPropositionType = (typeof ARENA_PROPOSITION_TYPES)[number];
export type ArenaPropositionStructure =
  (typeof ARENA_PROPOSITION_STRUCTURES)[number];
export type ArenaRollingMode = (typeof ARENA_ROLLING_MODES)[number];
export type ArenaSettlementTarget =
  (typeof ARENA_SETTLEMENT_TARGETS)[number];
export type PropositionCategory = (typeof PROPOSITION_CATEGORIES)[number];
export type BinaryOption = (typeof ARENA_BINARY_OPTIONS)[number];
export type PropositionStatus = (typeof PROPOSITION_STATUSES)[number];
export type DispatchTaskStatus = (typeof DISPATCH_TASK_STATUSES)[number];
export type ResponseReviewStatus =
  (typeof RESPONSE_REVIEW_STATUSES)[number];
export type MarketStatus = (typeof MARKET_STATUSES)[number];
export type PropositionResultKind =
  (typeof PROPOSITION_RESULT_KINDS)[number];
export type PropositionVoidReason =
  (typeof PROPOSITION_VOID_REASONS)[number];
export type RewardLedgerSourceType =
  (typeof REWARD_LEDGER_SOURCE_TYPES)[number];
export type RewardLedgerStatus =
  (typeof REWARD_LEDGER_STATUSES)[number];
export type RewardLedgerReasonCode =
  (typeof REWARD_LEDGER_REASON_CODES)[number];
export type PositionSettlementOutcome =
  (typeof POSITION_SETTLEMENT_OUTCOMES)[number];
export type FrontendSurface = (typeof FRONTEND_SURFACES)[number];
export type ReputationLevel = (typeof REPUTATION_LEVELS)[number];
export type UserTagType = (typeof USER_TAG_TYPES)[number];
export type UserTagSourceType = (typeof USER_TAG_SOURCE_TYPES)[number];
export type ArenaCoreEntityName =
  (typeof ARENA_CORE_ENTITY_NAMES)[number];
