import { buildValidationMarketViewModel, buildMarketPublicSnapshot } from "../../src/arena/validation/snapshot-builder.js";
import { MarketEngine } from "../../src/arena/validation/market-engine.js";
import { SettlementEngine } from "../../src/arena/validation/settlement-engine.js";
import type {
  EffectiveSampleCounterReadPort,
  MarketRepositoryPort,
  PositionBetRepositoryPort,
} from "../../src/arena/validation/ports.js";
import type {
  EffectiveSampleCounter,
  Market,
  PositionBet,
  Proposition,
} from "../../src/arena/entities.js";
import {
  InMemoryEffectiveSampleCounterRepository,
  InMemoryPropositionStore,
  SequenceIdGenerator,
  buildLiveProposition,
} from "../adjudication/memory-harness.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class InMemoryMarketRepository implements MarketRepositoryPort {
  private readonly markets = new Map<string, Market>();

  async create(market: Market): Promise<Market> {
    this.markets.set(market.id, clone(market));
    return clone(market);
  }

  async update(market: Market): Promise<Market> {
    this.markets.set(market.id, clone(market));
    return clone(market);
  }

  async getById(marketId: string): Promise<Market | null> {
    const market = this.markets.get(marketId);
    return market ? clone(market) : null;
  }

  async findByPropositionId(propositionId: string): Promise<Market | null> {
    const market = Array.from(this.markets.values()).find(
      (item) => item.propositionId === propositionId,
    );
    return market ? clone(market) : null;
  }

  async list(): Promise<Market[]> {
    return Array.from(this.markets.values()).map((market) => clone(market));
  }
}

export class InMemoryPositionBetRepository implements PositionBetRepositoryPort {
  private readonly positions = new Map<string, PositionBet>();

  async create(position: PositionBet): Promise<PositionBet> {
    this.positions.set(position.id, clone(position));
    return clone(position);
  }

  async update(position: PositionBet): Promise<PositionBet> {
    this.positions.set(position.id, clone(position));
    return clone(position);
  }

  async findByMarketAndUser(
    marketId: string,
    userId: string,
  ): Promise<PositionBet | null> {
    const position = Array.from(this.positions.values()).find(
      (item) => item.marketId === marketId && item.userId === userId,
    );
    return position ? clone(position) : null;
  }

  async listByMarket(marketId: string): Promise<PositionBet[]> {
    return Array.from(this.positions.values())
      .filter((position) => position.marketId === marketId)
      .map((position) => clone(position));
  }
}

export const createValidationHarness = (proposition?: Proposition) => {
  const ids = new SequenceIdGenerator();
  const propositionStore = new InMemoryPropositionStore();
  const counterRepository = new InMemoryEffectiveSampleCounterRepository();
  const marketRepository = new InMemoryMarketRepository();
  const positionRepository = new InMemoryPositionBetRepository();

  if (proposition) {
    propositionStore.set(proposition);
  }

  return {
    ids,
    propositionStore,
    counterRepository,
    marketRepository,
    positionRepository,
    marketEngine: new MarketEngine({
      ids,
      propositionRead: propositionStore,
      markets: marketRepository,
      positions: positionRepository,
    }),
    settlementEngine: new SettlementEngine({
      propositionRead: propositionStore,
      markets: marketRepository,
      positions: positionRepository,
    }),
  };
};

export const setCounter = async (
  counterRepository: EffectiveSampleCounterReadPort & {
    upsert(counter: EffectiveSampleCounter): Promise<EffectiveSampleCounter>;
  },
  propositionId: string,
  overrides: Partial<EffectiveSampleCounter> = {},
): Promise<EffectiveSampleCounter> =>
  counterRepository.upsert({
    id: "counter-1",
    propositionId,
    totalResponses: 0,
    reviewedResponses: 0,
    validCount: 0,
    partialValidCount: 0,
    invalidCount: 0,
    updatedAt: "2026-04-16T00:00:00.000Z",
    ...overrides,
  });

export {
  buildLiveProposition,
  buildMarketPublicSnapshot,
  buildValidationMarketViewModel,
};
