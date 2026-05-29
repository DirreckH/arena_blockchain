import type {
  CurrentUserPositionViewModel,
  MarketPublicSnapshot,
  ValidationExecutionReadinessViewModel,
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

const buildExecutionReadiness = (
  input: BuildValidationMarketViewInput,
): ValidationExecutionReadinessViewModel | undefined => {
  const chainId = Number((input as { chainId?: number }).chainId ?? 0);
  const contractAddress =
    typeof (input as { contractAddress?: string }).contractAddress === "string"
      ? ((input as { contractAddress?: string }).contractAddress as string)
      : "";
  const chainMarketId = input.market.chainMarketId ?? null;
  const chainStatus = input.market.chainStatus ?? null;

  if (chainId <= 0 || contractAddress.length === 0) {
    return undefined;
  }

  if (input.proposition.status !== "live" || input.market.status !== "live") {
    return {
      ready: false,
      reasonCode: "market_not_live",
      detail: "Arena only allows validation bets while the proposition and market are live.",
      chainId,
      contractAddress,
      chainMarketId,
      chainStatus,
    };
  }

  if (!chainMarketId) {
    return {
      ready: false,
      reasonCode: "chain_market_missing",
      detail: "The validation market has not been prepared on chain yet.",
      chainId,
      contractAddress,
      chainMarketId,
      chainStatus,
    };
  }

  if (chainStatus !== "live") {
    return {
      ready: false,
      reasonCode: "chain_market_not_live",
      detail: "The validation market is not open for on-chain betting yet.",
      chainId,
      contractAddress,
      chainMarketId,
      chainStatus,
    };
  }

  return {
    ready: true,
    reasonCode: "ready",
    detail: "The validation market is ready for a wallet-submitted on-chain bet.",
    chainId,
    contractAddress,
    chainMarketId,
    chainStatus,
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
  const executionReadiness = buildExecutionReadiness(input);

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
    canBet: executionReadiness?.ready ?? snapshot.canBet,
    publicProgress: snapshot.publicProgress,
    currentUserPosition: sanitizeCurrentUserPosition(
      input.currentUserPosition,
      input.market.status,
    ),
    executionReadiness,
  };
};
