import { Injectable } from "@nestjs/common";
import {
  PropositionNotFoundError,
  type RespondentResultListViewModel,
  ResultSummaryNotAvailableError,
  ResultSurface,
  type ResultSummaryViewModel,
} from "@arena/shared";

import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import {
  toSharedCounter,
  toSharedMarket,
  toSharedPositionBet,
  toSharedProposition,
} from "../arena-view.mapper";
import { BetRepository } from "../repositories/bet.repository";
import { EffectiveSampleCounterRepository } from "../repositories/effective-sample-counter.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { RewardLedgerService } from "./reward-ledger.service";

@Injectable()
export class ResultViewService {
  private readonly surface: ResultSurface;

  constructor(
    private readonly propositions: PropositionRepository,
    private readonly counters: EffectiveSampleCounterRepository,
    private readonly rewards: RewardLedgerService,
    private readonly markets: MarketRepository,
    private readonly bets: BetRepository,
  ) {
    this.surface = new ResultSurface({
      propositions: {
        getById: async (propositionId) => {
          const proposition = await this.propositions.findById(propositionId);
          return proposition ? toSharedProposition(proposition) : null;
        },
      },
      counters: {
        getByPropositionId: async (propositionId) =>
          toSharedCounter(
            await this.counters.findByPropositionId(propositionId),
          ),
      },
      rewards: {
        getByPropositionAndUser: async (propositionId, userId) =>
          this.rewards.getByPropositionAndUser(propositionId, userId),
        listByUser: async (userId) => this.rewards.listByUser(userId),
      },
      markets: {
        create: async () => {
          throw new ArenaValidationError(
            "result_view.market_create_not_supported",
            "Result view adapter does not support market creation",
          );
        },
        update: async () => {
          throw new ArenaValidationError(
            "result_view.market_update_not_supported",
            "Result view adapter does not support market updates",
          );
        },
        getById: async (marketId) => {
          const market = await this.markets.findById(marketId);
          return market ? toSharedMarket(market) : null;
        },
        findByPropositionId: async (propositionId) => {
          const market = await this.markets.findByPropositionId(propositionId);
          return market ? toSharedMarket(market) : null;
        },
        list: async () => {
          return (await this.markets.list()).map((market) => toSharedMarket(market));
        },
      },
      positions: {
        create: async () => {
          throw new ArenaValidationError(
            "result_view.position_create_not_supported",
            "Result view adapter does not support creating positions",
          );
        },
        update: async () => {
          throw new ArenaValidationError(
            "result_view.position_update_not_supported",
            "Result view adapter does not support updating positions",
          );
        },
        findByMarketAndUser: async (marketId, userId) =>
          toSharedPositionBet(
            await this.bets.findByMarketAndUser(marketId, userId),
          ),
        listByUser: async (userId) =>
          (await this.bets.listByUserId(userId)).map((bet) =>
            toSharedPositionBet(bet),
          ).filter((bet) => bet !== null),
        listByMarket: async () => {
          throw new ArenaValidationError(
            "result_view.position_list_not_supported",
            "Result view adapter does not support listing positions",
          );
        },
      },
    });
  }

  async getResultSummary(
    propositionId: string,
    userId: string,
  ): Promise<ResultSummaryViewModel> {
    try {
      return await this.surface.getResultSummary(propositionId, userId);
    } catch (error) {
      if (error instanceof PropositionNotFoundError) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          `Proposition ${propositionId} was not found`,
        );
      }

      if (error instanceof ResultSummaryNotAvailableError) {
        throw new ArenaValidationError(
          "result.summary_not_available",
          error.message,
        );
      }

      throw error;
    }
  }

  async listResultsForUser(
    userId: string,
  ): Promise<RespondentResultListViewModel> {
    try {
      return await this.surface.listResultsForUser(userId);
    } catch (error) {
      if (error instanceof PropositionNotFoundError) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          error.message.replace(/\.$/, ""),
        );
      }

      throw error;
    }
  }

  async getResultOverviewForUser(userId: string) {
    try {
      return await this.surface.getResultOverviewForUser(userId);
    } catch (error) {
      if (error instanceof PropositionNotFoundError) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          error.message.replace(/\.$/, ""),
        );
      }

      throw error;
    }
  }
}
