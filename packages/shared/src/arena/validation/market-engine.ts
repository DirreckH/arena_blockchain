import type {
  FreezeMarketForRevealInput,
  OpenMarketForLiveInput,
  PlacePositionBetInput,
} from "../dto.js";
import type { Market, PositionBet } from "../entities.js";
import { PropositionNotFoundError, PropositionNotLiveError } from "../adjudication/errors.js";
import {
  BetBelowMinimumError,
  InvalidBaseUnitAmountError,
  InvalidMarketTransitionError,
  MarketFrozenForRevealError,
  MarketNotEnabledError,
  MarketNotFoundError,
  MarketNotLiveError,
  PositionAlreadyExistsError,
} from "./errors.js";
import type { MarketEngineDependencies } from "./ports.js";

const isNonNegativeIntegerString = (value: string): boolean => /^[0-9]+$/.test(value);

const parseUnsignedAmount = (value: string, field: string): bigint => {
  if (!isNonNegativeIntegerString(value)) {
    throw new InvalidBaseUnitAmountError(value, field);
  }

  return BigInt(value);
};

export class MarketEngine {
  constructor(private readonly deps: MarketEngineDependencies) {}

  async ensureForProposition(propositionId: string): Promise<Market> {
    const proposition = await this.deps.propositionRead.getById(propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(propositionId);
    }

    if (!proposition.marketEnabled) {
      throw new MarketNotEnabledError(propositionId);
    }

    const existingMarket = await this.deps.markets.findByPropositionId(propositionId);
    if (existingMarket) {
      return existingMarket;
    }

    const market: Market = {
      id: this.deps.ids.next("market"),
      propositionId,
      settlementTarget: "final",
      status: "pre_live",
      currentPublicProgress: null,
      lastPublicResult: null,
      liveAt: null,
      frozenAt: null,
      settlingAt: null,
      settledAt: null,
    };

    return this.deps.markets.create(market);
  }

  async openForLive(input: OpenMarketForLiveInput): Promise<Market> {
    const proposition = await this.deps.propositionRead.getById(input.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(input.propositionId);
    }

    if (proposition.status !== "live") {
      throw new PropositionNotLiveError(proposition.id);
    }

    const market = await this.deps.markets.findByPropositionId(input.propositionId);
    if (!market) {
      throw new MarketNotFoundError(input.propositionId);
    }

    if (market.status !== "pre_live") {
      throw new InvalidMarketTransitionError(market.id, market.status, "live");
    }

    return this.deps.markets.update({
      ...market,
      status: "live",
      liveAt: input.liveAt,
    });
  }

  async freezeForReveal(input: FreezeMarketForRevealInput): Promise<Market> {
    const market = await this.deps.markets.getById(input.marketId);
    if (!market) {
      throw new MarketNotFoundError(input.marketId);
    }

    const proposition = await this.deps.propositionRead.getById(market.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(market.propositionId);
    }

    if (proposition.status !== "frozen") {
      throw new InvalidMarketTransitionError(
        market.id,
        market.status,
        "frozen_for_reveal",
      );
    }

    if (market.status !== "live") {
      throw new InvalidMarketTransitionError(
        market.id,
        market.status,
        "frozen_for_reveal",
      );
    }

    return this.deps.markets.update({
      ...market,
      status: "frozen_for_reveal",
      frozenAt: input.frozenAt,
    });
  }

  async placeBet(input: PlacePositionBetInput): Promise<PositionBet> {
    const proposition = await this.deps.propositionRead.getById(input.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(input.propositionId);
    }

    if (
      proposition.status === "frozen" ||
      proposition.status === "revealing" ||
      proposition.revealStartedAt !== null
    ) {
      throw new MarketFrozenForRevealError(input.marketId);
    }

    if (proposition.status !== "live") {
      throw new PropositionNotLiveError(proposition.id);
    }

    const market = await this.deps.markets.getById(input.marketId);
    if (!market) {
      throw new MarketNotFoundError(input.marketId);
    }

    if (market.status === "frozen_for_reveal") {
      throw new MarketFrozenForRevealError(market.id);
    }

    if (market.status !== "live") {
      throw new MarketNotLiveError(market.id);
    }

    const existingPosition = await this.deps.positions.findByMarketAndUser(
      market.id,
      input.userId,
    );
    if (existingPosition) {
      throw new PositionAlreadyExistsError(market.id, input.userId);
    }

    const stakeAmount = parseUnsignedAmount(input.stakeAmount, "stakeAmount");
    const minimumBetAmount = parseUnsignedAmount(
      proposition.minBetAmount,
      "minBetAmount",
    );

    if (stakeAmount < minimumBetAmount) {
      throw new BetBelowMinimumError(input.stakeAmount, proposition.minBetAmount);
    }

    const position: PositionBet = {
      id: this.deps.ids.next("position-bet"),
      marketId: market.id,
      propositionId: proposition.id,
      userId: input.userId,
      selectedOption: input.selectedOption,
      stakeAmount: input.stakeAmount,
      placedAt: input.placedAt,
      settlementOutcome: null,
      grossPayout: null,
      pnl: null,
      refundAmount: null,
      settledAt: null,
    };

    return this.deps.positions.create(position);
  }
}
