import type {
  CurrentUserPositionViewModel,
  MarketPublicSnapshot,
  ValidationMarketViewModel,
} from "../dto.js";
import type {
  EffectiveSampleCounter,
  Market,
  PositionBet,
  Proposition,
} from "../entities.js";
import type { PropositionReadPort } from "../adjudication/ports.js";

export type { PropositionReadPort } from "../adjudication/ports.js";

export interface MarketRepositoryPort {
  create(market: Market): Promise<Market>;
  update(market: Market): Promise<Market>;
  getById(marketId: string): Promise<Market | null>;
  findByPropositionId(propositionId: string): Promise<Market | null>;
  list(): Promise<Market[]>;
}

export interface PositionBetRepositoryPort {
  create(position: PositionBet): Promise<PositionBet>;
  update(position: PositionBet): Promise<PositionBet>;
  findByMarketAndUser(
    marketId: string,
    userId: string,
  ): Promise<PositionBet | null>;
  listByMarket(marketId: string): Promise<PositionBet[]>;
  listByUser?(userId: string): Promise<PositionBet[]>;
}

export interface EffectiveSampleCounterReadPort {
  getByPropositionId(
    propositionId: string,
  ): Promise<EffectiveSampleCounter | null>;
}

export interface ValidationIdGeneratorPort {
  next(namespace: string): string;
}

export interface MarketEngineDependencies {
  ids: ValidationIdGeneratorPort;
  propositionRead: PropositionReadPort;
  markets: MarketRepositoryPort;
  positions: PositionBetRepositoryPort;
}

export interface SnapshotBuilderInput {
  proposition: Proposition;
  market: Market;
  counter: EffectiveSampleCounter | null;
  currentUserPosition: PositionBet | null;
  now: string;
}

export interface SettlementEngineDependencies {
  propositionRead: PropositionReadPort;
  markets: MarketRepositoryPort;
  positions: PositionBetRepositoryPort;
}

export interface SettlementComputation {
  positions: PositionBet[];
  totalPool: string;
  winningPool: string;
  platformFeeAmount: string;
  distributablePool: string;
  roundingRemainder: string;
}

export interface BuildValidationMarketViewInput {
  proposition: Proposition;
  market: Market;
  counter: EffectiveSampleCounter | null;
  currentUserPosition: PositionBet | null;
  now: string;
  chainId?: number;
  contractAddress?: string;
}

export interface SanitizedCurrentUserPosition
  extends CurrentUserPositionViewModel {}

export interface ValidationMarketViewBuildResult
  extends ValidationMarketViewModel {}
