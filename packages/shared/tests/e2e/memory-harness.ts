import { buildAdjudicationAggregate } from "../../src/arena/adjudication/aggregate-engine.js";
import type { AdjudicationAggregate } from "../../src/arena/adjudication/ports.js";
import type {
  BinaryOption,
  PropositionStatus,
  PropositionVoidReason,
  ResponseReviewStatus,
} from "../../src/arena/enums.js";
import type {
  EffectiveSampleCounter,
  PositionBet,
  Proposition,
  Response,
} from "../../src/arena/entities.js";
import { createApplicationHarness } from "../application/memory-harness.js";
import {
  buildDispatchCandidate,
  buildLiveProposition,
} from "../adjudication/memory-harness.js";

const TEST_CHAIN_ID = 31337;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const mergeAndSetProposition = async (
  harness: ReturnType<typeof createApplicationHarness>,
  propositionId: string,
  overrides: Partial<Proposition>,
): Promise<Proposition> => {
  const current = await harness.propositionStore.getById(propositionId);
  if (!current) {
    throw new Error(`Missing proposition ${propositionId} in e2e harness.`);
  }

  return harness.propositionStore.set({
    ...current,
    ...overrides,
  });
};

export const createE2EHarness = (
  proposition?: Proposition,
  now = "2026-04-16T00:05:00.000Z",
) => {
  const app = createApplicationHarness(proposition, now);

  const assignTask = async (
    userId: string,
    assignedAt: string,
  ) => {
    const currentProposition = await app.propositionStore.getById(
      proposition?.id ?? "proposition-1",
    );
    if (!currentProposition) {
      throw new Error("Missing live proposition for dispatch assignment.");
    }

    return app.dispatchEngine.assign(
      buildDispatchCandidate({ userId }),
      currentProposition,
      assignedAt,
    );
  };

  const submitResponse = async (
    userId: string,
    taskId: string,
    submittedAt: string,
    selectedOption: BinaryOption,
    confirmationOption: BinaryOption = selectedOption,
    clientStartedAt = new Date(
      new Date(submittedAt).getTime() - 15000,
    ).toISOString(),
    understandingAck = true,
  ) =>
    app.adjudicationSurface.submitResponseForUser({
      propositionId: proposition?.id ?? "proposition-1",
      taskId,
      userId,
      selectedOption,
      confirmationOption,
      clientStartedAt,
      clientSubmittedAt: submittedAt,
      understandingAck,
      submittedAt,
    });

  const finalizeReview = async (
    propositionId: string,
    responseId: string,
    reviewedAt: string,
  ) => app.reviewEngine.finalize({ propositionId, responseId, reviewedAt });

  const rebuildCounter = async (
    propositionId: string,
    updatedAt: string,
  ): Promise<EffectiveSampleCounter> =>
    app.counterEngine.rebuildForProposition(propositionId, updatedAt);

  const buildAggregate = async (
    propositionId: string,
  ): Promise<AdjudicationAggregate> => {
    const propositionRecord = await app.propositionStore.getById(propositionId);
    if (!propositionRecord) {
      throw new Error(`Missing proposition ${propositionId}`);
    }

    const latestResponses = await app.responseRepository.listLatestByProposition(
      propositionId,
    );
    const reviews = await app.reviewRepository.listByProposition(propositionId);
    const counter = await app.counterRepository.getByPropositionId(propositionId);

    return buildAdjudicationAggregate({
      proposition: propositionRecord,
      latestResponses,
      reviews,
      counter,
    });
  };

  const freezeProposition = async (
    propositionId: string,
    frozenAt: string,
  ): Promise<Proposition> =>
    mergeAndSetProposition(harness, propositionId, {
      status: "frozen",
      frozenAt,
      updatedAt: frozenAt,
    });

  const startReveal = async (
    propositionId: string,
    revealStartedAt: string,
  ): Promise<Proposition> =>
    mergeAndSetProposition(harness, propositionId, {
      status: "revealing",
      revealStartedAt,
      updatedAt: revealStartedAt,
    });

  const recordOfficialResult = async (
    propositionId: string,
    aggregate: AdjudicationAggregate,
    resultComputedAt: string,
  ): Promise<Proposition> =>
    mergeAndSetProposition(harness, propositionId, {
      resultKind: aggregate.resultKind,
      winningOption: aggregate.winningOption,
      voidReason: aggregate.voidReason,
      resultComputedAt,
      updatedAt: resultComputedAt,
    });

  const settleProposition = async (
    propositionId: string,
    settledAt: string,
    status: PropositionStatus = "settled",
  ): Promise<Proposition> =>
    mergeAndSetProposition(harness, propositionId, {
      status,
      settledAt,
      updatedAt: settledAt,
      closedAt: status === "closed" ? settledAt : null,
      archivedAt: status === "archived" ? settledAt : null,
    });

  const closeProposition = async (
    propositionId: string,
    closedAt: string,
  ): Promise<Proposition> =>
    mergeAndSetProposition(harness, propositionId, {
      status: "closed",
      closedAt,
      updatedAt: closedAt,
    });

  const archiveProposition = async (
    propositionId: string,
    archivedAt: string,
  ): Promise<Proposition> =>
    mergeAndSetProposition(harness, propositionId, {
      status: "archived",
      archivedAt,
      updatedAt: archivedAt,
    });

  const finalizeRewardForLatest = async (
    propositionId: string,
    response: Response,
    reviewStatus: ResponseReviewStatus,
    resolvedAt: string,
    isLatest = true,
  ) =>
    app.rewardEngine.resolveFromReview({
      propositionId,
      responseId: response.id,
      reviewStatus,
      isLatest,
      resolvedAt,
    });

  const placeBet = async (
    propositionId: string,
    marketId: string,
    userId: string,
    selectedOption: BinaryOption,
    stakeAmount: string,
    placedAt: string,
  ) =>
    app.validationSurface.placeBetForUser({
      propositionId,
      marketId,
      userId,
      chainId: TEST_CHAIN_ID,
      selectedOption,
      stakeAmount,
      placedAt,
    });

  const listResponsesByUser = async (
    propositionId: string,
    userId: string,
  ): Promise<Response[]> =>
    app.responseRepository.listByPropositionAndUser(propositionId, userId);

  const getLatestResponse = async (
    propositionId: string,
    userId: string,
  ): Promise<Response | null> =>
    app.responseRepository.findLatestByPropositionAndUser(propositionId, userId);

  const getRewardLedger = async (propositionId: string, userId: string) =>
    app.rewardEngine.getByPropositionAndUser(propositionId, userId);

  const getPositions = async (marketId: string): Promise<PositionBet[]> =>
    app.positionRepository.listByMarket(marketId);

  const harness = {
    ...app,
    assignTask,
    submitResponse,
    finalizeReview,
    rebuildCounter,
    buildAggregate,
    freezeProposition,
    startReveal,
    recordOfficialResult,
    settleProposition,
    closeProposition,
    archiveProposition,
    finalizeRewardForLatest,
    placeBet,
    listResponsesByUser,
    getLatestResponse,
    getRewardLedger,
    getPositions,
    mergeAndSetProposition: (propositionId: string, overrides: Partial<Proposition>) =>
      mergeAndSetProposition(harness, propositionId, overrides),
  };

  return harness;
};

export const buildResolvedProposition = (
  overrides: Partial<Proposition> = {},
): Proposition =>
  buildLiveProposition({
    minEffectiveSample: 2,
    rewardBudget: "20",
    baseResponseReward: "5",
    minBetAmount: "10",
    ...overrides,
  });

export const settledVoidSummary = (
  proposition: Proposition,
  voidReason: PropositionVoidReason,
  settledAt: string,
): Proposition => ({
  ...clone(proposition),
  status: "settled",
  resultKind: "void",
  winningOption: null,
  voidReason,
  settledAt,
  updatedAt: settledAt,
});
