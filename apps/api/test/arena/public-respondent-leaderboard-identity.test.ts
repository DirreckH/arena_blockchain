import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import { PublicRespondentLeaderboardService } from "../../src/arena/services/public-respondent-leaderboard.service";
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

function createLeaderboardService(harness: ReturnType<typeof createArenaHarness>) {
  return new PublicRespondentLeaderboardService(
    harness.propositionRepository as any,
    harness.dispatchTaskRepository as any,
    harness.responseRepository as any,
    harness.responseReviewRepository as any,
    harness.userReputationRepository as any,
    harness.userTagRepository as any,
    harness.accountPreferencesService as any,
    harness.systemKeyValueRepository as any,
    harness.userRepository as any,
  );
}

test(
  "public respondent leaderboard skips independently keyed public users who still have no wallet binding",
  async () => {
    const harness = createArenaHarness();
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
      minEffectiveSample: 2,
      title: "Leaderboard identity boundary proposition",
      category: "politics",
    });

    const userId = "leaderboard_unbound_user";
    await createReviewedResponseForProposition(harness, {
      propositionId: proposition.id,
      userId,
      minuteOffset: 610,
      reviewStatus: "valid",
    });

    const defaults = await harness.accountPreferencesService.getAccountPreferencesForUser(
      userId,
    );
    await harness.accountPreferencesService.updateAccountPreferencesForUser(
      userId,
      {
        ...defaults,
        profile: {
          ...defaults.profile,
          profileVisibility: "public",
        },
        privacy: {
          ...defaults.privacy,
          allowActivityIndexing: true,
        },
      },
    );

    const leaderboard = await createLeaderboardService(harness).getLeaderboard();
    const politicsCategory = leaderboard.categories.find(
      (category) => category.id === "public-policy",
    );

    assert.ok(politicsCategory);
    assert.equal(politicsCategory!.rows.length, 0);
  },
);

test(
  "public respondent leaderboard keeps legacy wallet-shaped users publicly indexable",
  async () => {
    const harness = createArenaHarness();
    const proposition = await createLiveProposition(harness, {
      marketEnabled: true,
      minEffectiveSample: 2,
      title: "Leaderboard legacy wallet proposition",
      category: "politics",
    });

    const legacyWalletUser = "0xcccccccccccccccccccccccccccccccccccccccc";
    await createReviewedResponseForProposition(harness, {
      propositionId: proposition.id,
      userId: legacyWalletUser,
      minuteOffset: 620,
      reviewStatus: "valid",
    });

    const defaults =
      await harness.accountPreferencesService.getAccountPreferencesForUser(
        legacyWalletUser,
      );
    await harness.accountPreferencesService.updateAccountPreferencesForUser(
      legacyWalletUser,
      {
        ...defaults,
        profile: {
          ...defaults.profile,
          profileVisibility: "public",
        },
        privacy: {
          ...defaults.privacy,
          allowActivityIndexing: true,
        },
      },
    );

    const leaderboard = await createLeaderboardService(harness).getLeaderboard();
    const politicsCategory = leaderboard.categories.find(
      (category) => category.id === "public-policy",
    );

    assert.ok(politicsCategory);
    assert.equal(politicsCategory!.rows.length, 1);
    assert.equal(politicsCategory!.rows[0]?.walletShort, "0xcccc…cccc");
    assert.equal(politicsCategory!.rows[0]?.handle, "respondent-cccc");
  },
);
