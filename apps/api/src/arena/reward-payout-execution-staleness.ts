export const REWARD_PAYOUT_EXECUTION_STALE_AFTER_MS = 15 * 60 * 1000;

export type RewardPayoutExecutionStaleKind =
  | "without_tx_hash"
  | "awaiting_confirmation";

export interface RewardPayoutExecutionStalenessSnapshot {
  status: string | null;
  method: string | null;
  executionStartedAt: Date | string | null;
  completedAt: Date | string | null;
  executionTxHash?: string | null;
}

function toTimestamp(value: Date | string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp =
    value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getRewardPayoutExecutionStaleKind(
  input: RewardPayoutExecutionStalenessSnapshot,
  now: Date | string | number = Date.now(),
): RewardPayoutExecutionStaleKind | null {
  if (
    input.status !== "executing" ||
    input.method !== "wallet_transfer" ||
    input.completedAt !== null
  ) {
    return null;
  }

  const startedAt = toTimestamp(input.executionStartedAt);
  if (startedAt === null) {
    return null;
  }

  const nowTimestamp =
    now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(nowTimestamp)) {
    return null;
  }

  if (nowTimestamp - startedAt < REWARD_PAYOUT_EXECUTION_STALE_AFTER_MS) {
    return null;
  }

  const hasExecutionTxHash =
    typeof input.executionTxHash === "string" &&
    input.executionTxHash.trim().length > 0;

  return hasExecutionTxHash ? "awaiting_confirmation" : "without_tx_hash";
}

export function isRewardPayoutExecutionStale(
  input: RewardPayoutExecutionStalenessSnapshot,
  now: Date | string | number = Date.now(),
): boolean {
  return getRewardPayoutExecutionStaleKind(input, now) !== null;
}
