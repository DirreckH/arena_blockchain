import { AdjudicationSurface } from "../../src/arena/application/adjudication-surface.js";
import { ResultSurface } from "../../src/arena/application/result-surface.js";
import { ValidationSurface } from "../../src/arena/application/validation-surface.js";
import type { ApplicationClockPort } from "../../src/arena/application/ports.js";
import { DispatchEngine } from "../../src/arena/adjudication/dispatch-engine.js";
import { ResponseEngine } from "../../src/arena/adjudication/response-engine.js";
import { ReviewEngine } from "../../src/arena/adjudication/review-engine.js";
import { SampleCounterEngine } from "../../src/arena/adjudication/sample-counter-engine.js";
import { RewardEngine } from "../../src/arena/rewards/reward-engine.js";
import { MarketEngine } from "../../src/arena/validation/market-engine.js";
import { SettlementEngine } from "../../src/arena/validation/settlement-engine.js";
import type {
  EffectiveSampleCounter,
  Market,
  PositionBet,
  Proposition,
  RewardLedger,
} from "../../src/arena/entities.js";
import {
  InMemoryDispatchTaskRepository,
  InMemoryEffectiveSampleCounterRepository,
  InMemoryPropositionStore,
  InMemoryResponseRepository,
  InMemoryResponseReviewRepository,
  SequenceIdGenerator,
  buildDispatchCandidate,
  buildLiveProposition,
} from "../adjudication/memory-harness.js";
import {
  InMemoryRewardLedgerRepository,
} from "../rewards/memory-harness.js";
import {
  InMemoryMarketRepository,
  InMemoryPositionBetRepository,
} from "../validation/memory-harness.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class FixedClock implements ApplicationClockPort {
  constructor(private currentIso: string) {}

  now(): string {
    return this.currentIso;
  }

  set(iso: string): void {
    this.currentIso = iso;
  }
}

export const createApplicationHarness = (
  proposition?: Proposition,
  now = "2026-04-16T00:05:00.000Z",
) => {
  const ids = new SequenceIdGenerator();
  const clock = new FixedClock(now);
  const propositionStore = new InMemoryPropositionStore();
  const taskRepository = new InMemoryDispatchTaskRepository();
  const responseRepository = new InMemoryResponseRepository();
  const reviewRepository = new InMemoryResponseReviewRepository(responseRepository);
  const counterRepository = new InMemoryEffectiveSampleCounterRepository();
  const rewardLedgerRepository = new InMemoryRewardLedgerRepository();
  const marketRepository = new InMemoryMarketRepository();
  const positionRepository = new InMemoryPositionBetRepository();

  if (proposition) {
    propositionStore.set(proposition);
  }

  const dispatchEngine = new DispatchEngine({
    ids,
    propositionRead: propositionStore,
    tasks: taskRepository,
  });
  const responseEngine = new ResponseEngine({
    ids,
    propositionRead: propositionStore,
    tasks: taskRepository,
    responses: responseRepository,
    reviews: reviewRepository,
  });
  const reviewEngine = new ReviewEngine({
    propositionRead: propositionStore,
    tasks: taskRepository,
    responses: responseRepository,
    reviews: reviewRepository,
  });
  const counterEngine = new SampleCounterEngine({
    ids,
    responses: responseRepository,
    reviews: reviewRepository,
    counters: counterRepository,
  });
  const rewardEngine = new RewardEngine({
    ids,
    propositionRead: propositionStore,
    responses: responseRepository,
    ledgers: rewardLedgerRepository,
  });
  const marketEngine = new MarketEngine({
    ids,
    propositionRead: propositionStore,
    markets: marketRepository,
    positions: positionRepository,
  });
  const settlementEngine = new SettlementEngine({
    propositionRead: propositionStore,
    markets: marketRepository,
    positions: positionRepository,
  });

  return {
    ids,
    clock,
    propositionStore,
    taskRepository,
    responseRepository,
    reviewRepository,
    counterRepository,
    rewardLedgerRepository,
    marketRepository,
    positionRepository,
    dispatchEngine,
    responseEngine,
    reviewEngine,
    counterEngine,
    rewardEngine,
    marketEngine,
    settlementEngine,
    adjudicationSurface: new AdjudicationSurface({
      clock,
      propositions: propositionStore,
      counters: counterRepository,
      tasks: taskRepository,
      responses: responseRepository,
      reviews: reviewRepository,
      rewards: rewardEngine,
      responseCommands: responseEngine,
    }),
    validationSurface: new ValidationSurface({
      clock,
      propositions: propositionStore,
      counters: counterRepository,
      markets: marketRepository,
      positions: positionRepository,
      marketCommands: marketEngine,
    }),
    resultSurface: new ResultSurface({
      propositions: propositionStore,
      counters: counterRepository,
      rewards: rewardEngine,
      markets: marketRepository,
      positions: positionRepository,
    }),
  };
};

export const setCounter = async (
  counterRepository: InMemoryEffectiveSampleCounterRepository,
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

export const createSettledMarket = (
  proposition: Proposition,
  overrides: Partial<Market> = {},
): Market => ({
  id: "market-1",
  propositionId: proposition.id,
  settlementTarget: "final",
  status: "settled",
  currentPublicProgress: null,
  lastPublicResult: null,
  liveAt: proposition.liveAt,
  frozenAt: proposition.frozenAt,
  settlingAt: proposition.settledAt,
  settledAt: proposition.settledAt,
  ...overrides,
});

export const createSettledPosition = (
  proposition: Proposition,
  marketId: string,
  overrides: Partial<PositionBet> = {},
): PositionBet => ({
  id: "position-1",
  marketId,
  propositionId: proposition.id,
  userId: "user-1",
  selectedOption: 0,
  stakeAmount: "150",
  placedAt: "2026-04-16T00:01:00.000Z",
  settlementOutcome: "won",
  grossPayout: "250",
  pnl: "100",
  refundAmount: "0",
  settledAt: proposition.settledAt,
  ...overrides,
});

export const createRewardLedger = (
  proposition: Proposition,
  overrides: Partial<RewardLedger> = {},
): RewardLedger => ({
  id: "reward-ledger-1",
  userId: "user-1",
  propositionId: proposition.id,
  responseId: "response-1",
  sourceType: "response",
  sourceId: "response-1",
  ledgerVersion: 1,
  pendingAmount: proposition.baseResponseReward,
  finalAmount: proposition.baseResponseReward,
  status: "finalized",
  reviewStatus: "valid",
  createdAt: "2026-04-16T00:00:30.000Z",
  finalizedAt: "2026-04-16T00:01:00.000Z",
  voidedAt: null,
  reversedAt: null,
  reversalOfLedgerId: null,
  reasonCode: "review_valid",
  ...overrides,
});

export {
  buildDispatchCandidate,
  buildLiveProposition,
  clone,
};
