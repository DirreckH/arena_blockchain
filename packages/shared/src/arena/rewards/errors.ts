export class ArenaRewardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class RewardLedgerNotFoundError extends ArenaRewardError {
  constructor(ledgerId: string) {
    super("REWARD_LEDGER_NOT_FOUND", `Reward ledger ${ledgerId} was not found.`);
  }
}

export class RewardLedgerSourceMismatchError extends ArenaRewardError {
  constructor(ledgerId: string, sourceType: string) {
    super(
      "REWARD_LEDGER_SOURCE_MISMATCH",
      `Reward ledger ${ledgerId} uses source type ${sourceType}, but only response reward ledgers are supported in the MVP runtime.`,
    );
  }
}

export class RewardLedgerAlreadyPaidError extends ArenaRewardError {
  constructor(ledgerId: string) {
    super(
      "REWARD_LEDGER_ALREADY_PAID",
      `Reward ledger ${ledgerId} has already been paid and can no longer be rebound or re-finalized.`,
    );
  }
}

export class RewardLedgerNotPayableError extends ArenaRewardError {
  constructor(ledgerId: string, status: string) {
    super(
      "REWARD_LEDGER_NOT_PAYABLE",
      `Reward ledger ${ledgerId} cannot be paid while in status ${status}.`,
    );
  }
}

export class RewardFinalizationInputMismatchError extends ArenaRewardError {
  constructor(message: string) {
    super("REWARD_FINALIZATION_INPUT_MISMATCH", message);
  }
}

export class InvalidRewardAmountError extends ArenaRewardError {
  constructor(value: string, field: string) {
    super(
      "INVALID_REWARD_AMOUNT",
      `Reward amount field ${field} must be a non-negative integer string, received ${value}.`,
    );
  }
}

export class RewardBudgetInsufficientError extends ArenaRewardError {
  constructor(
    propositionId: string,
    rewardBudget: string,
    requiredBudget: string,
  ) {
    super(
      "REWARD_BUDGET_INSUFFICIENT",
      `Proposition ${propositionId} reward budget ${rewardBudget} is below the required minimum ${requiredBudget}.`,
    );
  }
}
