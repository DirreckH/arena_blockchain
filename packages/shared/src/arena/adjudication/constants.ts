export const ARENA_ADJUDICATION_DEFAULTS = {
  taskTtlSeconds: 24 * 60 * 60,
  cooldownSeconds: 12 * 60 * 60,
  maxActiveTasksPerUser: 3,
  minimumResponseDurationSeconds: 8,
  fastSubmitThresholdSeconds: 8,
  fastRevisionThresholdSeconds: 3,
  validQualityScore: 100,
  partialValidQualityScore: 60,
  invalidQualityScore: 0,
} as const;

export const DISPATCH_INELIGIBILITY_REASONS = [
  "proposition_not_live",
  "user_not_active",
  "sample_constraints_mismatch",
  "user_task_quota_reached",
  "existing_active_task",
  "existing_submitted_task",
  "dispatch_cooldown",
] as const;

export const DISPATCH_SELECTION_BLOCK_REASONS = [
  "risky_reputation_guard",
] as const;

export const DISPATCH_PRIORITY_BUCKETS = [
  "priority",
  "standard",
  "fallback",
  "blocked",
] as const;

export const DISPATCH_SELECTION_RULE_VERSION = "dispatch-tags-v1";

export const REVIEW_FLAGS = [
  "fast_submit",
  "fast_revision",
  "duplicate_retry",
  "contradictory_revisions",
  "invalid_timestamp",
  "late_submit",
  "confirmation_mismatch",
  "understanding_unacknowledged",
  "suspicious_latency",
  "integrity_violation",
] as const;

export const QUALITY_REASON_CODES = [
  "passes_quality_checks",
  "time_too_short",
  "confirmation_mismatch",
  "integrity_violation",
] as const;

export type DispatchIneligibilityReason =
  (typeof DISPATCH_INELIGIBILITY_REASONS)[number];
export type DispatchSelectionBlockReason =
  | DispatchIneligibilityReason
  | (typeof DISPATCH_SELECTION_BLOCK_REASONS)[number];
export type DispatchPriorityBucket =
  (typeof DISPATCH_PRIORITY_BUCKETS)[number];
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];
export type QualityReasonCode = (typeof QUALITY_REASON_CODES)[number];
