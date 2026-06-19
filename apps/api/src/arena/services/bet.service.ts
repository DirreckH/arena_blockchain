import { Injectable } from "@nestjs/common";
import type { Bet } from "@prisma/client";

import { AppConfigService } from "../../config/app-config.service";
import { PrismaService } from "../../database/prisma.service";
import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type { PlaceBetInput, SettleBetOutcomeInput } from "../arena.types";
import {
  isUniqueConstraintError,
  withArenaTransaction,
} from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { BetRepository } from "../repositories/bet.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import {
  assertBetLifecycleTransition,
  resolveBetLifecycleStage,
} from "../state-machines/bet-state.machine";
import {
  assertBinaryOption,
  assertNonNegativeIntegerString,
  toDate,
} from "../arena.utils";
import { ArenaUserIdentityService } from "./arena-user-identity.service";

@Injectable()
export class BetService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly bets: BetRepository,
    private readonly userIdentity: ArenaUserIdentityService,
  ) {}

  async placeBet(
    input: PlaceBetInput,
    db?: ArenaDbClient,
  ): Promise<Bet> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(input.userId, undefined, tx);
      assertBinaryOption(input.selectedOption, "selectedOption");
      assertNonNegativeIntegerString(input.stakeAmount, "stakeAmount");

      const targetChainId = input.chainId ?? this.config.chainId;
      if (targetChainId !== this.config.chainId) {
        throw new ArenaValidationError(
          "bet.chain_id_mismatch",
          "Bets can only be recorded for the configured validation chain",
        );
      }

      const proposition = await this.propositions.findById(input.propositionId, tx);
      if (!proposition) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          `Proposition ${input.propositionId} was not found`,
        );
      }

      const market = await this.markets.findById(input.marketId, tx);
      if (!market) {
        throw new ArenaNotFoundError(
          "market.not_found",
          `Market ${input.marketId} was not found`,
        );
      }

      if (market.propositionId !== proposition.id || input.propositionId !== market.propositionId) {
        throw new ArenaValidationError(
          "bet.market_mismatch",
          "The bet market does not belong to the specified proposition",
        );
      }

      if (proposition.status !== "live" || market.status !== "live") {
        throw new ArenaValidationError(
          "bet.market_not_live",
          "Bets can only be placed while the market and proposition are live",
        );
      }

      assertNonNegativeIntegerString(proposition.minBetAmount, "minBetAmount");
      if (BigInt(input.stakeAmount) < BigInt(proposition.minBetAmount)) {
        throw new ArenaValidationError(
          "bet.below_minimum",
          "Bet amount is below the proposition minimum",
        );
      }

      const existing = await this.bets.findByMarketAndUser(
        input.marketId,
        input.userId,
        tx,
      );
      if (existing) {
        throw new ArenaConflictError(
          "bet.duplicate_position",
          "The user already has a bet for this market",
        );
      }

      try {
        return await this.bets.create(
          {
            id: input.id ?? this.ids.next("bet"),
            marketId: input.marketId,
            propositionId: market.propositionId,
            userId: input.userId,
            selectedOption: input.selectedOption,
            stakeAmount: input.stakeAmount,
            placedAt: toDate(input.placedAt),
          },
          tx,
        );
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ArenaConflictError(
            "bet.duplicate_position",
            "The user already has a bet for this market",
          );
        }

        throw error;
      }
    });
  }

  async lockBet(
    betId: string,
    db?: ArenaDbClient,
  ): Promise<Bet> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const bet = await this.getRequiredBet(betId, tx);
      const market = await this.getRequiredMarket(bet.marketId, tx);

      const currentStage = resolveBetLifecycleStage(
        bet.status,
        bet.settlementOutcome,
        market.status,
      );

      assertBetLifecycleTransition(currentStage, "locked");

      return bet;
    });
  }

  async settleBetAsWin(
    input: SettleBetOutcomeInput,
    db?: ArenaDbClient,
  ): Promise<Bet> {
    return this.settleBet(input, "won", db);
  }

  async settleBetAsLose(
    input: SettleBetOutcomeInput,
    db?: ArenaDbClient,
  ): Promise<Bet> {
    return this.settleBet(input, "lost", db);
  }

  async refundBet(
    input: SettleBetOutcomeInput,
    db?: ArenaDbClient,
  ): Promise<Bet> {
    return this.settleBet(input, "refund", db);
  }

  private async settleBet(
    input: SettleBetOutcomeInput,
    outcome: SettleBetOutcomeInput["outcome"],
    db?: ArenaDbClient,
  ): Promise<Bet> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const bet = await this.getRequiredBet(input.betId, tx);
      const market = await this.getRequiredMarket(bet.marketId, tx);

      if (!["settling", "settled"].includes(market.status)) {
        throw new ArenaValidationError(
          "bet.market_not_settling",
          "Bets can only be settled after the market starts settling",
        );
      }

      const currentStage = resolveBetLifecycleStage(
        bet.status,
        bet.settlementOutcome,
        market.status,
      );
      const nextStage =
        outcome === "won"
          ? "won"
          : outcome === "lost"
            ? "lost"
            : "refunded";

      assertBetLifecycleTransition(currentStage, nextStage);

      return this.bets.update(
        bet.id,
        {
          status: "settled",
          settledAt: toDate(input.settledAt),
          settlementOutcome: outcome,
          grossPayout: input.grossPayout,
          pnl: input.pnl,
          refundAmount: input.refundAmount,
        },
        tx,
      );
    });
  }

  private async getRequiredBet(
    betId: string,
    db: ArenaDbClient,
  ): Promise<Bet> {
    const bet = await this.bets.findById(betId, db);
    if (!bet) {
      throw new ArenaNotFoundError(
        "bet.not_found",
        `Bet ${betId} was not found`,
      );
    }

    return bet;
  }

  private async getRequiredMarket(
    marketId: string,
    db: ArenaDbClient,
  ) {
    const market = await this.markets.findById(marketId, db);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market ${marketId} was not found`,
      );
    }

    return market;
  }
}
