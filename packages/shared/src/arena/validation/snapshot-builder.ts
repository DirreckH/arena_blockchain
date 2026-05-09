import type {
  CurrentUserPositionViewModel,
  MarketPublicSnapshot,
  ValidationMarketViewModel,
} from "../dto.js";
import { buildPublicProgressViewModel } from "../application/public-progress.js";
import type { PositionBet } from "../entities.js";
import type {
  BuildValidationMarketViewInput,
  SnapshotBuilderInput,
} from "./ports.js";

const addSeconds = (iso: string, seconds: number): string =>
  new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const getBettingClosesAt = (liveAt: string | null, maxDurationSeconds: number): string =>
  liveAt ? addSeconds(liveAt, maxDurationSeconds) : new Date(0).toISOString();

const computeTimeProgressPercent = (
  liveAt: string | null,
  maxDurationSeconds: number,
  now: string,
): number => {
  if (!liveAt) {
    return 0;
  }

  const start = new Date(liveAt).getTime();
  const end = start + maxDurationSeconds * 1000;
  const current = new Date(now).getTime();
  if (end <= start) {
    return 100;
  }

  return Math.round(clamp((current - start) / (end - start), 0, 1) * 100);
};

const sanitizeCurrentUserPosition = (
  position: PositionBet | null,
  marketStatus: ValidationMarketViewModel["marketStatus"],
): CurrentUserPositionViewModel | null => {
  if (!position) {
    return null;
  }

  if (marketStatus !== "settled") {
    return {
      selectedOption: position.selectedOption,
      stakeAmount: position.stakeAmount,
      placedAt: position.placedAt,
      settlementOutcome: null,
      grossPayout: null,
      pnl: null,
      refundAmount: null,
    };
  }

  return {
    selectedOption: position.selectedOption,
    stakeAmount: position.stakeAmount,
    placedAt: position.placedAt,
    settlementOutcome: position.settlementOutcome,
    grossPayout: position.grossPayout,
    pnl: position.pnl,
    refundAmount: position.refundAmount,
  };
};

export const buildMarketPublicSnapshot = (
  input: SnapshotBuilderInput,
): MarketPublicSnapshot => {
  const validCount = input.counter?.validCount ?? 0;
  const partialValidCount = input.counter?.partialValidCount ?? 0;
  const effectiveSampleCount = validCount + partialValidCount;
  const bettingClosesAt = getBettingClosesAt(
    input.proposition.liveAt,
    input.proposition.maxDurationSeconds,
  );

  return {
    marketStatus: input.market.status,
    timeProgressPercent: computeTimeProgressPercent(
      input.proposition.liveAt,
      input.proposition.maxDurationSeconds,
      input.now,
    ),
    canBet:
      input.proposition.status === "live" && input.market.status === "live",
    bettingClosesAt,
    publicProgress: buildPublicProgressViewModel({
      proposition: input.proposition,
      reviewedCount: input.counter?.reviewedResponses ?? 0,
      effectiveSampleCount,
      now: input.now,
    }),
  };
};

export const buildValidationMarketViewModel = (
  input: BuildValidationMarketViewInput,
): ValidationMarketViewModel => {
  const snapshot = buildMarketPublicSnapshot(input);

  return {
    marketId: input.market.id,
    propositionId: input.proposition.id,
    title: input.proposition.title,
    category: input.proposition.category,
    options: input.proposition.options,
    minBetAmount: input.proposition.minBetAmount,
    marketStatus: snapshot.marketStatus,
    timeProgressPercent: snapshot.timeProgressPercent,
    bettingClosesAt: snapshot.bettingClosesAt,
    canBet: snapshot.canBet,
    publicProgress: snapshot.publicProgress,
    currentUserPosition: sanitizeCurrentUserPosition(
      input.currentUserPosition,
      input.market.status,
    ),
  };
};
