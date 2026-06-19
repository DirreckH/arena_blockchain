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

test("internal reward audit list filters by payout status for operator action queues", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout status filter proposition",
  });

  await harness.userIdentityService.ensureUserExists("reward_requested_user", {
    walletAddress: "0x00000000000000000000000000000000000000c1",
  });
  await harness.userIdentityService.ensureUserExists("reward_failed_user", {
    walletAddress: "0x00000000000000000000000000000000000000c2",
  });

  const requestedResponse = await createReviewedResponse(harness, {
    propositionId: proposition.id,
    userId: "reward_requested_user",
    minuteOffset: 0,
  });
  const failedResponse = await createReviewedResponse(harness, {
    propositionId: proposition.id,
    userId: "reward_failed_user",
    minuteOffset: 1,
  });

  const requestedLedger =
    await harness.rewardLedgerRepository.findLatestByResponseId(
      requestedResponse.id,
    );
  const failedLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
    failedResponse.id,
  );
  assert.ok(requestedLedger);
  assert.ok(failedLedger);

  const failedPayout = await harness.rewardPayoutRepository.findByLedgerId(
    failedLedger.id,
  );
  assert.ok(failedPayout);

  await harness.rewardPayoutService.approvePayout({
    payoutId: failedPayout.id,
    actorUserId: "ops_reward_filter",
    approvedAt: arenaTime(5),
  });
  await harness.rewardPayoutService.failPayout({
    payoutId: failedPayout.id,
    failedAt: arenaTime(6),
    errorCode: "rpc_timeout",
    errorMessage: "RPC timeout while broadcasting payout",
  });

  const failedPage = await harness.internalRewardAuditService.listRewards({
    payoutStatus: "failed",
  });

  assert.equal(failedPage.totalCount, 1);
  assert.equal(failedPage.items.length, 1);
  assert.equal(failedPage.items[0]?.ledgerId, failedLedger.id);
  assert.equal(failedPage.items[0]?.payoutStatus, "failed");

  const requestedPage = await harness.internalRewardAuditService.listRewards({
    payoutStatus: "requested",
  });

  assert.equal(requestedPage.totalCount, 1);
  assert.equal(requestedPage.items.length, 1);
  assert.equal(requestedPage.items[0]?.ledgerId, requestedLedger.id);
  assert.equal(requestedPage.items[0]?.payoutStatus, "requested");
});

test("internal reward audit list isolates finalized ledgers that are still missing payout records", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    title: "Reward missing payout queue proposition",
  });

  const responseMissing = await createReviewedResponse(harness, {
    propositionId: proposition.id,
    userId: "reward_missing_payout_queue_user",
    minuteOffset: 0,
  });

  await harness.userRepository.create({
    id: "reward_requested_queue_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000d2",
    normalizedPrimaryWalletAddress: "0x00000000000000000000000000000000000000d2",
    status: "active",
  } as never);
  const responseRequested = await createReviewedResponse(harness, {
    propositionId: proposition.id,
    userId: "reward_requested_queue_user",
    minuteOffset: 1,
  });

  const missingLedger =
    await harness.rewardLedgerRepository.findLatestByResponseId(
      responseMissing.id,
    );
  const requestedLedger =
    await harness.rewardLedgerRepository.findLatestByResponseId(
      responseRequested.id,
    );
  assert.ok(missingLedger);
  assert.ok(requestedLedger);

  const missingPayout = await harness.rewardPayoutRepository.findByLedgerId(
    missingLedger.id,
  );
  const requestedPayout = await harness.rewardPayoutRepository.findByLedgerId(
    requestedLedger.id,
  );
  assert.equal(missingPayout, null);
  assert.ok(requestedPayout);

  const page = await harness.internalRewardAuditService.listRewards({
    status: "finalized",
    missingPayoutOnly: true,
  });

  assert.equal(page.totalCount, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.ledgerId, missingLedger.id);
  assert.equal(page.items[0]?.payoutId, null);
  assert.equal(page.items[0]?.payoutStatus, null);
});

test("internal reward audit list isolates stale executing payouts that need operator recovery", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-04-18T10:30:00.000Z");

  try {
    const harness = createArenaHarness();
    const proposition = await createLiveProposition(harness, {
      title: "Reward stale execution queue proposition",
    });

    await harness.userRepository.create({
      id: "reward_stale_execution_user",
      primaryWalletAddress: "0x00000000000000000000000000000000000000f1",
      normalizedPrimaryWalletAddress: "0x00000000000000000000000000000000000000f1",
      status: "active",
    } as never);
    await harness.userRepository.create({
      id: "reward_fresh_execution_user",
      primaryWalletAddress: "0x00000000000000000000000000000000000000f2",
      normalizedPrimaryWalletAddress: "0x00000000000000000000000000000000000000f2",
      status: "active",
    } as never);

    const staleResponse = await createReviewedResponse(harness, {
      propositionId: proposition.id,
      userId: "reward_stale_execution_user",
      minuteOffset: 0,
    });
    const freshResponse = await createReviewedResponse(harness, {
      propositionId: proposition.id,
      userId: "reward_fresh_execution_user",
      minuteOffset: 1,
    });

    const staleLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
      staleResponse.id,
    );
    const freshLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
      freshResponse.id,
    );
    assert.ok(staleLedger);
    assert.ok(freshLedger);

    const stalePayout = await harness.rewardPayoutRepository.findByLedgerId(
      staleLedger.id,
    );
    const freshPayout = await harness.rewardPayoutRepository.findByLedgerId(
      freshLedger.id,
    );
    assert.ok(stalePayout);
    assert.ok(freshPayout);

    await harness.rewardPayoutService.approvePayout({
      payoutId: stalePayout.id,
      actorUserId: "ops_reward_stale",
      approvedAt: arenaTime(2),
    });
    await harness.rewardPayoutService.startExecution({
      payoutId: stalePayout.id,
      startedAt: arenaTime(3),
    });

    await harness.rewardPayoutService.approvePayout({
      payoutId: freshPayout.id,
      actorUserId: "ops_reward_stale",
      approvedAt: arenaTime(20),
    });
    await harness.rewardPayoutService.startExecution({
      payoutId: freshPayout.id,
      startedAt: arenaTime(21),
    });

    const stalePage = await harness.internalRewardAuditService.listRewards({
      staleExecutionOnly: true,
    });

    assert.equal(stalePage.totalCount, 1);
    assert.equal(stalePage.items.length, 1);
    assert.equal(stalePage.items[0]?.ledgerId, staleLedger.id);
    assert.equal(stalePage.items[0]?.payoutStatus, "executing");
    assert.equal(
      stalePage.items[0]?.payoutExecutionStartedAt,
      arenaTime(3),
    );
  } finally {
    Date.now = originalNow;
  }
});

test("internal reward audit list derives actionable payout recovery queues", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    title: "Reward action queue proposition",
  });

  const responseMissing = await createReviewedResponse(harness, {
    propositionId: proposition.id,
    userId: "reward_action_missing_user",
    minuteOffset: 0,
  });

  await harness.userRepository.create({
    id: "reward_action_requested_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000e1",
    normalizedPrimaryWalletAddress: "0x00000000000000000000000000000000000000e1",
    status: "active",
  } as never);
  const responseRequested = await createReviewedResponse(harness, {
    propositionId: proposition.id,
    userId: "reward_action_requested_user",
    minuteOffset: 1,
  });

  await harness.userRepository.create({
    id: "reward_action_failed_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000e2",
    normalizedPrimaryWalletAddress: "0x00000000000000000000000000000000000000e2",
    status: "active",
  } as never);
  const responseFailed = await createReviewedResponse(harness, {
    propositionId: proposition.id,
    userId: "reward_action_failed_user",
    minuteOffset: 2,
  });

  await harness.userRepository.create({
    id: "reward_action_executing_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000e3",
    normalizedPrimaryWalletAddress: "0x00000000000000000000000000000000000000e3",
    status: "active",
  } as never);
  const responseExecuting = await createReviewedResponse(harness, {
    propositionId: proposition.id,
    userId: "reward_action_executing_user",
    minuteOffset: 3,
  });
  await harness.userRepository.create({
    id: "reward_action_confirm_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000e4",
    normalizedPrimaryWalletAddress: "0x00000000000000000000000000000000000000e4",
    status: "active",
  } as never);
  const responseConfirm = await createReviewedResponse(harness, {
    propositionId: proposition.id,
    userId: "reward_action_confirm_user",
    minuteOffset: 4,
  });

  const missingLedger =
    await harness.rewardLedgerRepository.findLatestByResponseId(
      responseMissing.id,
    );
  const requestedLedger =
    await harness.rewardLedgerRepository.findLatestByResponseId(
      responseRequested.id,
    );
  const failedLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
    responseFailed.id,
  );
  const executingLedger =
    await harness.rewardLedgerRepository.findLatestByResponseId(
      responseExecuting.id,
    );
  const confirmLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
    responseConfirm.id,
  );
  assert.ok(missingLedger);
  assert.ok(requestedLedger);
  assert.ok(failedLedger);
  assert.ok(executingLedger);
  assert.ok(confirmLedger);

  const failedPayout = await harness.rewardPayoutRepository.findByLedgerId(
    failedLedger.id,
  );
  const executingPayout = await harness.rewardPayoutRepository.findByLedgerId(
    executingLedger.id,
  );
  const confirmPayout = await harness.rewardPayoutRepository.findByLedgerId(
    confirmLedger.id,
  );
  assert.ok(failedPayout);
  assert.ok(executingPayout);
  assert.ok(confirmPayout);

  await harness.rewardPayoutService.approvePayout({
    payoutId: failedPayout.id,
    actorUserId: "ops_reward_queue",
    approvedAt: arenaTime(6),
  });
  await harness.rewardPayoutService.failPayout({
    payoutId: failedPayout.id,
    failedAt: arenaTime(7),
    errorCode: "rpc_timeout",
    errorMessage: "RPC timeout during payout broadcast",
  });

  await harness.rewardPayoutService.approvePayout({
    payoutId: executingPayout.id,
    actorUserId: "ops_reward_queue",
    approvedAt: arenaTime(8),
  });
  await harness.rewardPayoutService.startExecution({
    payoutId: executingPayout.id,
    startedAt: arenaTime(9),
  });
  await harness.rewardPayoutService.approvePayout({
    payoutId: confirmPayout.id,
    actorUserId: "ops_reward_queue",
    approvedAt: arenaTime(10),
  });
  await harness.rewardPayoutService.executePayout({
    payoutId: confirmPayout.id,
    startedAt: arenaTime(11),
  });

  const missingQueue = await harness.internalRewardAuditService.listRewards({
    actionQueue: "missing_payout",
  });
  assert.equal(missingQueue.totalCount, 1);
  assert.equal(missingQueue.items[0]?.ledgerId, missingLedger.id);

  const approvalQueue = await harness.internalRewardAuditService.listRewards({
    actionQueue: "approval",
  });
  assert.equal(approvalQueue.totalCount, 1);
  assert.equal(approvalQueue.items[0]?.ledgerId, requestedLedger.id);
  assert.equal(approvalQueue.items[0]?.payoutStatus, "requested");

  const retryQueue = await harness.internalRewardAuditService.listRewards({
    actionQueue: "retry",
  });
  assert.equal(retryQueue.totalCount, 1);
  assert.equal(retryQueue.items[0]?.ledgerId, failedLedger.id);
  assert.equal(retryQueue.items[0]?.payoutStatus, "failed");

  const confirmQueue = await harness.internalRewardAuditService.listRewards({
    actionQueue: "execution_confirm",
  });
  assert.equal(confirmQueue.totalCount, 1);
  assert.equal(confirmQueue.items[0]?.ledgerId, confirmLedger.id);
  assert.equal(confirmQueue.items[0]?.payoutStatus, "executing");
  assert.equal(typeof confirmQueue.items[0]?.payoutExecutionTxHash, "string");

  const recoverQueue = await harness.internalRewardAuditService.listRewards({
    actionQueue: "execution_recover",
  });
  assert.equal(recoverQueue.totalCount, 1);
  assert.equal(recoverQueue.items[0]?.ledgerId, executingLedger.id);
  assert.equal(recoverQueue.items[0]?.payoutStatus, "executing");
  assert.equal(recoverQueue.items[0]?.payoutExecutionTxHash, null);
});
