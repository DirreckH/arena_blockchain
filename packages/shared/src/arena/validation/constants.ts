export const BPS_DENOMINATOR = 10_000n;

export const VALIDATION_SINGLE_POSITION_POLICY = {
  onePositionPerUser: true,
  allowAddToPosition: false,
  allowSwitchSide: false,
  allowPartialClose: false,
  allowEarlyCashout: false,
} as const;

export const MARKET_PUBLIC_SNAPSHOT_FIELDS = [
  "market_status",
  "time_progress",
  "effective_sample_progress",
  "can_bet",
  "betting_closes_at",
] as const;

export const MARKET_PRE_REVEAL_HIDDEN_FIELDS = [
  "option_pools",
  "total_pool",
  "per_side_ratio",
  "leading_side",
  "odds",
  "reward_estimate",
  "adjudication_live_direction",
] as const;
