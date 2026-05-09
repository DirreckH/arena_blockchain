export class ArenaValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class MarketNotFoundError extends ArenaValidationError {
  constructor(marketId: string) {
    super("MARKET_NOT_FOUND", `Market ${marketId} was not found.`);
  }
}

export class MarketNotEnabledError extends ArenaValidationError {
  constructor(propositionId: string) {
    super(
      "MARKET_NOT_ENABLED",
      `Proposition ${propositionId} does not have validation enabled.`,
    );
  }
}

export class MarketNotLiveError extends ArenaValidationError {
  constructor(marketId: string) {
    super("MARKET_NOT_LIVE", `Market ${marketId} is not in live status.`);
  }
}

export class InvalidMarketTransitionError extends ArenaValidationError {
  constructor(marketId: string, currentStatus: string, targetStatus: string) {
    super(
      "INVALID_MARKET_TRANSITION",
      `Market ${marketId} cannot transition from ${currentStatus} to ${targetStatus}.`,
    );
  }
}

export class MarketAlreadyExistsForPropositionError extends ArenaValidationError {
  constructor(propositionId: string) {
    super(
      "MARKET_ALREADY_EXISTS_FOR_PROPOSITION",
      `Market already exists for proposition ${propositionId}.`,
    );
  }
}

export class PositionAlreadyExistsError extends ArenaValidationError {
  constructor(marketId: string, userId: string) {
    super(
      "POSITION_ALREADY_EXISTS",
      `User ${userId} already has a position in market ${marketId}.`,
    );
  }
}

export class BetBelowMinimumError extends ArenaValidationError {
  constructor(stakeAmount: string, minimumAmount: string) {
    super(
      "BET_BELOW_MINIMUM",
      `Stake ${stakeAmount} is below minimum bet amount ${minimumAmount}.`,
    );
  }
}

export class MarketFrozenForRevealError extends ArenaValidationError {
  constructor(marketId: string) {
    super(
      "MARKET_FROZEN_FOR_REVEAL",
      `Market ${marketId} is frozen for reveal and cannot accept bets.`,
    );
  }
}

export class SettlementInputMismatchError extends ArenaValidationError {
  constructor(message: string) {
    super("SETTLEMENT_INPUT_MISMATCH", message);
  }
}

export class SettlementAlreadyFinalizedError extends ArenaValidationError {
  constructor(marketId: string) {
    super(
      "SETTLEMENT_ALREADY_FINALIZED",
      `Market ${marketId} has already been settled.`,
    );
  }
}

export class InvalidBaseUnitAmountError extends ArenaValidationError {
  constructor(value: string, field: string) {
    super(
      "INVALID_BASE_UNIT_AMOUNT",
      `Field ${field} received a non-integer base-unit amount: ${value}.`,
    );
  }
}
