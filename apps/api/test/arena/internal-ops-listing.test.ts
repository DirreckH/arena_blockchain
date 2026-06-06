import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import {
  type ArenaHarness,
  createArenaHarness,
} from "./harness";

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
  harness: ArenaHarness,
  overrides: Partial<typeof propositionDraftInput> = {},
) {
  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    ...overrides,
  });
  const scheduled =
    await harness.propositionEngineService.approveOrScheduleProposition({
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

async function createSubmittedResponse(
  harness: ArenaHarness,
  input: {
    propositionId: string;
    userId: string;
    minuteOffset: number;
    selectedOption?: 0 | 1;
  },
) {
  const task = await harness.dispatchTaskService.assignTask({
    propositionId: input.propositionId,
    userId: input.userId,
    assignedAt: arenaTime(input.minuteOffset),
    expiresAt: arenaTime(input.minuteOffset + 10),
  });

  return harness.responseService.submitResponse({
    propositionId: input.propositionId,
    taskId: task.id,
    userId: input.userId,
    responsePayload: {
      confidence: 0.8,
      rationale: `Response from ${input.userId}`,
    },
    selectedOption: input.selectedOption ?? 0,
    confirmationOption: input.selectedOption ?? 0,
    understandingAck: true,
    clientStartedAt: arenaTime(input.minuteOffset, 5),
    clientSubmittedAt: arenaTime(input.minuteOffset, 15),
    submittedAt: arenaTime(input.minuteOffset, 20),
  });
}

async function createReviewedResponse(
  harness: ArenaHarness,
  input: {
    propositionId: string;
    userId: string;
    minuteOffset: number;
  },
) {
  const response = await createSubmittedResponse(harness, input);
  await harness.responseReviewService.finalizeReviewResult({
    responseId: response.id,
    status: "valid",
    reviewedAt: arenaTime(input.minuteOffset, 30),
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    flags: [],
    reasonCodes: ["passes_quality_review"],
  });
  return response;
}

test("internal proposition ops list supports search sorting and pagination", async () => {
  const harness = createArenaHarness();

  await createLiveProposition(harness, {
    title: "Climate alpha proposition",
    category: "ai",
  });
  await createLiveProposition(harness, {
    title: "Climate beta proposition",
    category: "sports",
  });
  await createLiveProposition(harness, {
    title: "Sports only proposition",
    category: "sports",
  });

  const page = await harness.internalPropositionOpsService.listPropositions({
    search: "climate",
    sortBy: "title",
    sortDirection: "asc",
    limit: 1,
    offset: 1,
  });

  assert.equal(page.totalCount, 2);
  assert.equal(page.limit, 1);
  assert.equal(page.offset, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.title, "Climate beta proposition");
});

test("internal response review ops list supports search sorting and pagination", async () => {
  const harness = createArenaHarness();
  const alpha = await createLiveProposition(harness, {
    title: "Alpha proposition",
  });
  const beta = await createLiveProposition(harness, {
    title: "Beta proposition",
  });

  await createSubmittedResponse(harness, {
    propositionId: alpha.id,
    userId: "alpha_user",
    minuteOffset: 0,
  });
  const betaResponse = await createSubmittedResponse(harness, {
    propositionId: beta.id,
    userId: "beta_user",
    minuteOffset: 1,
  });

  const page = await harness.internalResponseReviewOpsService.listResponses({
    search: "proposition",
    sortBy: "submittedAt",
    sortDirection: "asc",
    limit: 1,
    offset: 1,
  });

  assert.equal(page.totalCount, 2);
  assert.equal(page.limit, 1);
  assert.equal(page.offset, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.responseId, betaResponse.id);
  assert.equal(page.items[0]?.propositionTitle, "Beta proposition");
});

test("internal reward audit list supports search sorting and pagination", async () => {
  const harness = createArenaHarness();
  const alpha = await createLiveProposition(harness, {
    title: "Reward alpha proposition",
  });
  const beta = await createLiveProposition(harness, {
    title: "Reward beta proposition",
  });

  await createReviewedResponse(harness, {
    propositionId: alpha.id,
    userId: "reward_alpha_user",
    minuteOffset: 0,
  });
  await createReviewedResponse(harness, {
    propositionId: beta.id,
    userId: "reward_beta_user",
    minuteOffset: 1,
  });

  const page = await harness.internalRewardAuditService.listRewards({
    search: "reward",
    sortBy: "createdAt",
    sortDirection: "asc",
    limit: 1,
    offset: 1,
  });

  assert.equal(page.totalCount, 2);
  assert.equal(page.limit, 1);
  assert.equal(page.offset, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.propositionTitle, "Reward beta proposition");
  assert.equal(page.items[0]?.userId, "reward_beta_user");
});
