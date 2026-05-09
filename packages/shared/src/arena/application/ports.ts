import type {
  PublicCategoryDirectoryViewModel,
  PublicDiscoverPageViewModel,
  PublicDiscoveryRankingKind,
  PublicDiscoveryRankingViewModel,
  PublicLatestTopicsViewModel,
  PlacePositionBetInput,
  RecordRewardSubmissionInput,
  SubmitResponseInput,
} from "../dto.js";
import type { PositionBet, RewardLedger } from "../entities.js";
import type {
  DispatchTaskRepositoryPort,
  PropositionReadPort,
  ResponseRepositoryPort,
  ResponseReviewRepositoryPort,
  RewardLedgerReadPort,
  SubmitResponseResult,
} from "../adjudication/ports.js";
import type {
  EffectiveSampleCounterReadPort,
  MarketRepositoryPort,
  PositionBetRepositoryPort,
} from "../validation/ports.js";

export interface ApplicationClockPort {
  now(): string;
}

export interface ResponseSubmissionPort {
  submit(input: SubmitResponseInput): Promise<SubmitResponseResult>;
}

export interface RewardSubmissionPort extends RewardLedgerReadPort {
  recordSubmission(
    input: RecordRewardSubmissionInput,
  ): Promise<RewardLedger>;
}

export interface MarketPlacementPort {
  placeBet(input: PlacePositionBetInput): Promise<PositionBet>;
}

export interface AdjudicationSurfaceDependencies {
  clock: ApplicationClockPort;
  propositions: PropositionReadPort;
  counters: EffectiveSampleCounterReadPort;
  tasks: DispatchTaskRepositoryPort;
  responses: ResponseRepositoryPort;
  reviews: ResponseReviewRepositoryPort;
  rewards: RewardSubmissionPort;
  responseCommands: ResponseSubmissionPort;
}

export interface ValidationSurfaceDependencies {
  clock: ApplicationClockPort;
  propositions: PropositionReadPort;
  counters: EffectiveSampleCounterReadPort;
  markets: MarketRepositoryPort;
  positions: PositionBetRepositoryPort;
  marketCommands: MarketPlacementPort;
}

export interface ResultSurfaceDependencies {
  propositions: PropositionReadPort;
  counters: EffectiveSampleCounterReadPort;
  rewards: RewardLedgerReadPort;
  markets: MarketRepositoryPort;
  positions: PositionBetRepositoryPort;
}

export interface PublicDiscoverySurfaceDependencies {
  clock: ApplicationClockPort;
  validation: {
    listMarkets(): Promise<
      Array<{
        marketId: string;
        propositionId: string;
        title: string;
        category: string;
        marketStatus: string;
        timeProgressPercent: number;
        publicProgress: {
          progress: {
            currentEffectiveSample: number;
            progressPercent: number;
          };
          publicState: {
            phase: string;
          };
        };
      }>
    >;
  };
  catalogs: {
    getHome(): Promise<PublicDiscoverPageViewModel>;
    getRanking(
      kind: PublicDiscoveryRankingKind,
    ): Promise<PublicDiscoveryRankingViewModel>;
    getLatestTopics(): Promise<PublicLatestTopicsViewModel>;
    getCategoryDirectory(
      pathname: string,
    ): Promise<PublicCategoryDirectoryViewModel | null>;
  };
}
