import type {
  MarketSettlementInput,
  SettlementFinalizeResult,
} from "../dto.js";
import type { Market, PositionBet } from "../entities.js";
import { PropositionNotFoundError } from "../adjudication/errors.js";
import { BPS_DENOMINATOR } from "./constants.js";
import {
  InvalidBaseUnitAmountError,
  MarketNotFoundError,
  SettlementAlreadyFinalizedError,
  SettlementInputMismatchError,
} from "./errors.js";
import type { SettlementEngineDependencies } from "./ports.js";

const isNonNegativeIntegerString = (value: string): boolean => /^[0-9]+$/.test(value);

const parseUnsignedAmount = (value: string, field: string): bigint => {
  if (!isNonNegativeIntegerString(value)) {
    throw new InvalidBaseUnitAmountError(value, field);
  }

  return BigInt(value);
};

const toSignedAmountString = (value: bigint): string => value.toString();

const zeroIfNull = (value: string | null): string => value ?? "0";

export class SettlementEngine {
  constructor(private readonly deps: SettlementEngineDependencies) {}

  async finalize(
    input: MarketSettlementInput,
  ): Promise<SettlementFinalizeResult> {
    const proposition = await this.deps.propositionRead.getById(input.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(input.propositionId);
    }

    const market = await this.deps.markets.getById(input.marketId);
    if (!market) {
      throw new MarketNotFoundError(input.marketId);
    }

    if (market.propositionId !== input.propositionId) {
      throw new SettlementInputMismatchError(
        `Market ${market.id} does not belong to proposition ${input.propositionId}.`,
      );
    }

    if (market.status === "settled") {
      throw new SettlementAlreadyFinalizedError(market.id);
    }

    if (market.status !== "frozen_for_reveal") {
      throw new SettlementInputMismatchError(
        `Market ${market.id} must be frozen_for_reveal before settlement.`,
      );
    }

    if (input.resultKind === "resolved" && input.winningOption === null) {
      throw new SettlementInputMismatchError(
        "Resolved settlement requires winningOption.",
      );
    }

    if (input.resultKind === "void" && input.winningOption !== null) {
      throw new SettlementInputMismatchError(
        "Void settlement must not include winningOption.",
      );
    }

    if (
      !Number.isInteger(input.platformFeeBps) ||
      input.platformFeeBps < 0 ||
      input.platformFeeBps > Number(BPS_DENOMINATOR)
    ) {
      throw new SettlementInputMismatchError(
        `platformFeeBps ${input.platformFeeBps} is invalid.`,
      );
    }

    const positions = await this.deps.positions.listByMarket(market.id);
    const settlingMarket: Market = await this.deps.markets.update({
      ...market,
      status: "settling",
      settlingAt: input.settledAt,
    });

    if (input.resultKind === "void") {
      const settledPositions = await Promise.all(
        positions.map(async (position) =>
          this.deps.positions.update({
            ...position,
            settlementOutcome: "refund",
            grossPayout: position.stakeAmount,
            pnl: "0",
            refundAmount: position.stakeAmount,
            settledAt: input.settledAt,
          }),
        ),
      );

      const settledMarket = await this.deps.markets.update({
        ...settlingMarket,
        status: "settled",
        settledAt: input.settledAt,
      });

      const totalPool = settledPositions.reduce(
        (sum, position) => sum + parseUnsignedAmount(position.stakeAmount, "stakeAmount"),
        0n,
      );

      return {
        market: settledMarket,
        positions: settledPositions,
        totalPool: totalPool.toString(),
        winningPool: "0",
        platformFeeAmount: "0",
        distributablePool: totalPool.toString(),
        roundingRemainder: "0",
      };
    }

    const totalPool = positions.reduce(
      (sum, position) => sum + parseUnsignedAmount(position.stakeAmount, "stakeAmount"),
      0n,
    );

    const winningPositions = positions.filter(
      (position) => position.selectedOption === input.winningOption,
    );

    const winningPool = winningPositions.reduce(
      (sum, position) => sum + parseUnsignedAmount(position.stakeAmount, "stakeAmount"),
      0n,
    );

    if (winningPool === 0n) {
      throw new SettlementInputMismatchError(
        "Resolved settlement requires at least one winning position.",
      );
    }

    const platformFeeAmount =
      (totalPool * BigInt(input.platformFeeBps)) / BPS_DENOMINATOR;
    const distributablePool = totalPool - platformFeeAmount;

    let winnerPayoutSum = 0n;
    const settledPositions = await Promise.all(
      positions.map(async (position) => {
        const stakeAmount = parseUnsignedAmount(position.stakeAmount, "stakeAmount");

        if (position.selectedOption === input.winningOption) {
          const grossPayout = (stakeAmount * distributablePool) / winningPool;
          winnerPayoutSum += grossPayout;

          return this.deps.positions.update({
            ...position,
            settlementOutcome: "won",
            grossPayout: grossPayout.toString(),
            pnl: toSignedAmountString(grossPayout - stakeAmount),
            refundAmount: "0",
            settledAt: input.settledAt,
          });
        }

        return this.deps.positions.update({
          ...position,
          settlementOutcome: "lost",
          grossPayout: "0",
          pnl: toSignedAmountString(-stakeAmount),
          refundAmount: "0",
          settledAt: input.settledAt,
        });
      }),
    );

    const settledMarket = await this.deps.markets.update({
      ...settlingMarket,
      status: "settled",
      settledAt: input.settledAt,
    });

    return {
      market: settledMarket,
      positions: settledPositions,
      totalPool: totalPool.toString(),
      winningPool: winningPool.toString(),
      platformFeeAmount: platformFeeAmount.toString(),
      distributablePool: distributablePool.toString(),
      roundingRemainder: (distributablePool - winnerPayoutSum).toString(),
    };
  }
}
