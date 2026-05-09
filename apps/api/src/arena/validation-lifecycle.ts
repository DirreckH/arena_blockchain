import type {
  Market,
  MarketStatus,
  Proposition,
  PropositionStatus,
  ValidationChainMarketStatus,
  ValidationChainResultKind,
  ValidationChainVoidReason,
} from "@prisma/client";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

export type ValidationLifecycleDriftReason =
  | "market_missing"
  | "chain_market_not_created"
  | "chain_market_not_opened"
  | "chain_market_not_frozen"
  | "chain_market_not_resolved";

export interface ValidationLifecycleSnapshotViewModel {
  propositionStatus: PropositionStatus;
  marketEnabled: boolean;
  marketId: string | null;
  marketStatus: MarketStatus | null;
  chainMarketId: string | null;
  chainPropositionId: string | null;
  chainStatus: ValidationChainMarketStatus | null;
  chainOpenedAt: string | null;
  chainFrozenAt: string | null;
  chainResolvedAt: string | null;
  chainCancelledAt: string | null;
  chainResultKind: ValidationChainResultKind | null;
  chainWinningOption: number | null;
  chainVoidReason: ValidationChainVoidReason | null;
  resolutionTxHash: string | null;
  cancelTxHash: string | null;
  chainSyncedAt: string | null;
  driftReason: ValidationLifecycleDriftReason | null;
}

export const getValidationLifecycleDriftReason = (
  propositionStatus: PropositionStatus,
  market: Pick<Market, "status" | "chainStatus" | "chainMarketId"> | null,
): ValidationLifecycleDriftReason | null => {
  if (["scheduled", "closed", "archived"].includes(propositionStatus)) {
    return null;
  }

  if (!market) {
    return propositionStatus === "live" ||
      propositionStatus === "frozen" ||
      propositionStatus === "revealing" ||
      propositionStatus === "settled"
      ? "market_missing"
      : null;
  }

  if (propositionStatus === "live") {
    if (!market.chainMarketId || market.chainStatus === null) {
      return "chain_market_not_created";
    }

    if (market.chainStatus === "pre_live") {
      return "chain_market_not_opened";
    }
  }

  if (
    (propositionStatus === "frozen" || propositionStatus === "revealing") &&
    market.chainStatus !== "frozen" &&
    market.chainStatus !== "resolved" &&
    market.chainStatus !== "cancelled"
  ) {
    return "chain_market_not_frozen";
  }

  if (propositionStatus === "settled" && market.chainStatus !== "resolved") {
    return "chain_market_not_resolved";
  }

  return null;
};

export const buildValidationLifecycleSnapshot = (
  proposition: Pick<Proposition, "status" | "marketEnabled">,
  market: Market | null,
): ValidationLifecycleSnapshotViewModel => ({
  propositionStatus: proposition.status,
  marketEnabled: proposition.marketEnabled,
  marketId: market?.id ?? null,
  marketStatus: market?.status ?? null,
  chainMarketId: market?.chainMarketId ?? null,
  chainPropositionId: market?.chainPropositionId ?? null,
  chainStatus: market?.chainStatus ?? null,
  chainOpenedAt: toIso(market?.chainOpenedAt ?? null),
  chainFrozenAt: toIso(market?.chainFrozenAt ?? null),
  chainResolvedAt: toIso(market?.chainResolvedAt ?? null),
  chainCancelledAt: toIso(market?.chainCancelledAt ?? null),
  chainResultKind: market?.chainResultKind ?? null,
  chainWinningOption: market?.chainWinningOption ?? null,
  chainVoidReason: market?.chainVoidReason ?? null,
  resolutionTxHash: market?.resolutionTxHash ?? null,
  cancelTxHash: market?.cancelTxHash ?? null,
  chainSyncedAt: toIso(market?.chainSyncedAt ?? null),
  driftReason: getValidationLifecycleDriftReason(
    proposition.status,
    market,
  ),
});
