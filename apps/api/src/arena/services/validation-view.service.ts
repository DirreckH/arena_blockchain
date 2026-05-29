import { Injectable } from "@nestjs/common";
import type { ValidationMarketViewModel } from "@arena/shared";
import { buildValidationMarketViewModel } from "@arena/shared";

import { AppConfigService } from "../../config/app-config.service";
import { ArenaNotFoundError } from "../arena.errors";
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

@Injectable()
export class ValidationViewService {
  constructor(
    private readonly config: AppConfigService,
    private readonly propositions: PropositionRepository,
    private readonly counters: EffectiveSampleCounterRepository,
    private readonly markets: MarketRepository,
    private readonly bets: BetRepository,
  ) {}

  async listMarkets(userId?: string): Promise<ValidationMarketViewModel[]> {
    const markets = await this.markets.list();
    return Promise.all(
      markets.map((market) => this.getMarket(market.id, userId)),
    );
  }

  async searchMarkets(
    query: string | undefined,
    userId?: string,
  ): Promise<ValidationMarketViewModel[]> {
    const normalizedQuery = query?.trim().toLowerCase() ?? "";
    const allMarkets = await this.listMarkets(userId);

    if (normalizedQuery.length === 0) {
      return allMarkets;
    }

    return allMarkets.filter((market) => {
      const haystack = [
        market.title,
        market.category,
        ...market.options,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }

  async getMarket(
    marketId: string,
    userId?: string,
  ): Promise<ValidationMarketViewModel> {
    const market = await this.markets.findById(marketId);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market ${marketId} was not found`,
      );
    }

    const proposition = await this.propositions.findById(market.propositionId);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${market.propositionId} was not found`,
      );
    }

    const counter = await this.counters.findByPropositionId(proposition.id);
    const currentUserPosition = userId
      ? await this.bets.findByMarketAndUser(market.id, userId)
      : null;

    return buildValidationMarketViewModel({
      proposition: toSharedProposition(proposition),
      market: toSharedMarket(market),
      counter: toSharedCounter(counter),
      currentUserPosition: toSharedPositionBet(currentUserPosition),
      now: new Date().toISOString(),
      chainId: this.config.chainId,
      contractAddress: this.config.validationContractAddress,
    });
  }
}
