import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import { createArenaHarness } from "./harness";

const propositionDraftInput = {
  category:
    "general" as
      | "general"
      | "sports"
      | "ai"
      | "brand_research"
      | "politics"
      | "entertainment",
  title: "Will option A win?",
  description: "MVP binary proposition",
  options: ["A", "B"] as [string, string],
  minEffectiveSample: 3,
  minBetAmount: "10",
  minDurationSeconds: 60,
  maxDurationSeconds: 3600,
  sampleConstraints: [] as string[],
  rewardBudget: "1000",
  baseResponseReward: "20",
  marketEnabled: false,
  createdByUserId: "admin_1",
};

const arenaTime = (minuteOffset: number, secondOffset = 0): string =>
  new Date(
    Date.parse("2026-04-18T10:06:00.000Z") +
      minuteOffset * 60_000 +
      secondOffset * 1000,
  ).toISOString();

async function createLiveProposition(
  harness: ReturnType<typeof createArenaHarness>,
  overrides: Partial<typeof propositionDraftInput> = {},
) {
  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    ...overrides,
  });
  const scheduled = await harness.propositionEngineService.approveOrScheduleProposition({
    propositionId: draft.id,
    publishedAt: "2026-04-18T10:00:00.000Z",
    updatedByUserId: "admin_1",
  });

  return harness.propositionEngineService.publishLiveProposition({
    propositionId: scheduled.id,
    liveAt: "2026-04-18T10:05:00.000Z",
    updatedByUserId: "admin_1",
  });
}

async function createReviewedResponseForProposition(
  harness: ReturnType<typeof createArenaHarness>,
  input: {
    propositionId: string;
    userId: string;
    minuteOffset: number;
    reviewStatus: "valid" | "partial_valid" | "invalid";
  },
) {
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: input.propositionId,
    userIds: [input.userId],
    assignedAt: arenaTime(input.minuteOffset),
    expiresAt: arenaTime(input.minuteOffset + 10),
  });

  const response = await harness.responseService.submitResponse({
    propositionId: input.propositionId,
    taskId: task.id,
    userId: input.userId,
    selectedOption: 0,
    confirmationOption: input.reviewStatus === "partial_valid" ? 1 : 0,
    clientStartedAt: arenaTime(input.minuteOffset, 1),
    clientSubmittedAt: arenaTime(input.minuteOffset, 12),
    submittedAt: arenaTime(input.minuteOffset, 12),
    understandingAck: true,
  });

  if (input.reviewStatus === "valid") {
    await harness.responseReviewService.reviewValid({
      responseId: response.id,
      reviewedAt: arenaTime(input.minuteOffset, 30),
      reviewedByUserId: "reviewer_1",
      qualityScore: 100,
      reasonCodes: ["passes_quality_review"],
    });
    return response;
  }

  if (input.reviewStatus === "partial_valid") {
    await harness.responseReviewService.reviewPartialValid({
      responseId: response.id,
      reviewedAt: arenaTime(input.minuteOffset, 30),
      reviewedByUserId: "reviewer_1",
      qualityScore: 60,
      flags: ["attention_mismatch"],
      reasonCodes: ["attention_mismatch"],
    });
    return response;
  }

  await harness.responseReviewService.reviewInvalid({
    responseId: response.id,
    reviewedAt: arenaTime(input.minuteOffset, 30),
    reviewedByUserId: "reviewer_1",
    qualityScore: 0,
    flags: ["integrity_violation"],
    reasonCodes: ["integrity_violation"],
  });
  return response;
}

async function createSettledDiscussionMarket(
  harness: ReturnType<typeof createArenaHarness>,
) {
  const proposition = await createLiveProposition(harness, {
    title: "Discussion identity proposition",
    marketEnabled: true,
  });
  const market = await harness.marketRepository.findByPropositionId(proposition.id);
  assert.ok(market);

  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_writer_user_1",
    minuteOffset: 301,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_writer_user_2",
    minuteOffset: 302,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "discussion_writer_user_3",
    minuteOffset: 303,
    reviewStatus: "valid",
  });

  await harness.counterService.rebuildCounterForProposition(proposition.id);
  await harness.betService.placeBet({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "discussion_writer_bettor",
    chainId: 1,
    selectedOption: 0,
    stakeAmount: "10",
    placedAt: arenaTime(303, 30),
  });
  await harness.freezeRevealOrchestratorService.finalizeRevealPreparation({
    propositionId: proposition.id,
    now: arenaTime(304),
    updatedByUserId: "admin_1",
  });
  await harness.validationSettlementService.settleValidationMarket({
    propositionId: proposition.id,
    settledAt: arenaTime(305),
  });

  return { proposition, market };
}

test(
  "discussion comments derive public author identity from the bound wallet for independent user ids",
  async () => {
    const harness = createArenaHarness();
    const { proposition, market } = await createSettledDiscussionMarket(harness);

    await harness.userRepository.create({
      id: "discussion_author_a",
      primaryWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      normalizedPrimaryWalletAddress:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "active",
    });

    const thread = await harness.discussionService.createDiscussionComment({
      marketId: market.id,
      propositionId: proposition.id,
      userId: "discussion_author_a",
      body: "settled comment",
      optionIndex: 0,
      createdAt: arenaTime(306),
    });

    assert.equal(thread.comments[0]?.author, "Arena aaaa");
    assert.equal(thread.comments[0]?.handle, "@aaaaaaaaaa");
  },
);

test(
  "discussion comments keep wallet-shaped fallback identity when no user master record exists yet",
  async () => {
    const harness = createArenaHarness();
    const { proposition, market } = await createSettledDiscussionMarket(harness);

    const thread = await harness.discussionService.createDiscussionComment({
      marketId: market.id,
      propositionId: proposition.id,
      userId: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      body: "legacy wallet shaped comment",
      createdAt: arenaTime(307),
    });

    assert.equal(thread.comments[0]?.author, "Arena bbbb");
    assert.equal(thread.comments[0]?.handle, "@bbbbbbbbbb");
  },
);
