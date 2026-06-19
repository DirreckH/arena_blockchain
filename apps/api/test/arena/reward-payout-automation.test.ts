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
  rewardBudget: "1000",
  baseResponseReward: "20",
  marketEnabled: false,
  createdByUserId: "admin_1",
};

const arenaTime = (minuteOffset: number, secondOffset = 0): string =>
  new Date(
    Date.UTC(2026, 3, 18, 10, minuteOffset, secondOffset, 0),
  ).toISOString();

const createLiveProposition = async (
  harness: ReturnType<typeof createArenaHarness>,
  overrides: Partial<typeof propositionDraftInput> = {},
) => {
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
};

async function createReviewedResponseForUser(
  harness: ReturnType<typeof createArenaHarness>,
  input: {
    propositionId: string;
    userId: string;
    minuteOffset: number;
  },
) {
  const task = await harness.dispatchTaskService.assignTask({
    propositionId: input.propositionId,
    userId: input.userId,
    assignedAt: arenaTime(input.minuteOffset),
    expiresAt: arenaTime(input.minuteOffset + 30),
  });

  const response = await harness.responseService.submitResponse({
    propositionId: input.propositionId,
    taskId: task.id,
    userId: input.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: arenaTime(input.minuteOffset + 1),
    clientSubmittedAt: arenaTime(input.minuteOffset + 2),
    understandingAck: true,
    submittedAt: arenaTime(input.minuteOffset + 2),
  });

  await harness.responseReviewService.finalizeReviewResult({
    responseId: response.id,
    status: "valid",
    reviewedAt: arenaTime(input.minuteOffset + 3),
    reviewedByUserId: "reviewer_1",
    qualityScore: 100,
    flags: [],
    reasonCodes: ["passes_quality_review"],
  });

  return response;
}

test("reward payout automation executes approved payouts, confirms recorded executions, and fails stale executions without tx hashes", async () => {
  const harness = createArenaHarness({
    rewardPayoutExecutionPlan: [{ type: "success" }],
    rewardPayoutVerificationPlan: [{ type: "success" }],
  });

  await harness.userRepository.create({
    id: "reward_auto_exec_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000a1",
    normalizedPrimaryWalletAddress:
      "0x00000000000000000000000000000000000000a1",
    status: "active",
  } as never);
  await harness.userRepository.create({
    id: "reward_auto_confirm_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000a2",
    normalizedPrimaryWalletAddress:
      "0x00000000000000000000000000000000000000a2",
    status: "active",
  } as never);
  await harness.userRepository.create({
    id: "reward_auto_stale_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000a3",
    normalizedPrimaryWalletAddress:
      "0x00000000000000000000000000000000000000a3",
    status: "active",
  } as never);

  const proposition = await createLiveProposition(harness, {
    title: "Reward payout automation proposition",
  });

  const approvedResponse = await createReviewedResponseForUser(harness, {
    propositionId: proposition.id,
    userId: "reward_auto_exec_user",
    minuteOffset: 1,
  });
  const confirmResponse = await createReviewedResponseForUser(harness, {
    propositionId: proposition.id,
    userId: "reward_auto_confirm_user",
    minuteOffset: 2,
  });
  const staleResponse = await createReviewedResponseForUser(harness, {
    propositionId: proposition.id,
    userId: "reward_auto_stale_user",
    minuteOffset: 3,
  });

  const approvedLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
    approvedResponse.id,
  );
  const confirmLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
    confirmResponse.id,
  );
  const staleLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
    staleResponse.id,
  );
  assert.ok(approvedLedger);
  assert.ok(confirmLedger);
  assert.ok(staleLedger);

  const approvedPayout = await harness.rewardPayoutRepository.findByLedgerId(
    approvedLedger!.id,
  );
  const confirmPayout = await harness.rewardPayoutRepository.findByLedgerId(
    confirmLedger!.id,
  );
  const stalePayout = await harness.rewardPayoutRepository.findByLedgerId(
    staleLedger!.id,
  );
  assert.ok(approvedPayout);
  assert.ok(confirmPayout);
  assert.ok(stalePayout);

  await harness.rewardPayoutService.approvePayout({
    payoutId: approvedPayout!.id,
    actorUserId: "ops_admin_1",
    approvedAt: arenaTime(10),
  });
  await harness.rewardPayoutService.approvePayout({
    payoutId: confirmPayout!.id,
    actorUserId: "ops_admin_1",
    approvedAt: arenaTime(10, 10),
  });
  await harness.rewardPayoutService.approvePayout({
    payoutId: stalePayout!.id,
    actorUserId: "ops_admin_1",
    approvedAt: arenaTime(10, 20),
  });

  await harness.rewardPayoutService.executePayout({
    payoutId: confirmPayout!.id,
    startedAt: arenaTime(11),
  });
  await harness.rewardPayoutService.startExecution({
    payoutId: stalePayout!.id,
    startedAt: arenaTime(-20),
  });

  const result = await harness.rewardPayoutAutomationService.runDuePayouts({
    now: arenaTime(20),
  });

  assert.equal(result.processedCount, 3);
  assert.deepEqual(
    result.items.map((item) => item.action).sort(),
    ["execution_confirmed", "execution_started", "stale_execution_failed"].sort(),
  );

  const approvedAfter = await harness.rewardPayoutRepository.findByLedgerId(
    approvedLedger!.id,
  );
  const confirmedAfter = await harness.rewardPayoutRepository.findByLedgerId(
    confirmLedger!.id,
  );
  const staleAfter = await harness.rewardPayoutRepository.findByLedgerId(
    staleLedger!.id,
  );

  assert.equal(approvedAfter?.status, "executing");
  assert.ok(approvedAfter?.executionTxHash);
  assert.equal(confirmedAfter?.status, "completed");
  assert.ok(confirmedAfter?.executionTxHash);
  assert.equal(staleAfter?.status, "failed");
  assert.equal(
    staleAfter?.lastErrorCode,
    "reward_payout.execution_stale_without_tx_hash",
  );

  const approvedAuditEvents = await harness.internalAuditService.listByEntity(
    "reward_ledger",
    approvedLedger!.id,
  );
  const confirmAuditEvents = await harness.internalAuditService.listByEntity(
    "reward_ledger",
    confirmLedger!.id,
  );
  const staleAuditEvents = await harness.internalAuditService.listByEntity(
    "reward_ledger",
    staleLedger!.id,
  );

  assert.equal(
    approvedAuditEvents.some(
      (event) =>
        event.action === "reward_payout_execution_started" &&
        event.actorUserId === "system_scheduler" &&
        event.reason === "scheduler_auto_start_reward_payout_execution",
    ),
    true,
  );
  assert.equal(
    confirmAuditEvents.some(
      (event) =>
        event.action === "reward_payout_completed" &&
        event.actorUserId === "system_scheduler" &&
        event.reason === "scheduler_auto_confirm_reward_payout_execution",
    ),
    true,
  );
  assert.equal(
    staleAuditEvents.some(
      (event) =>
        event.action === "reward_payout_failed" &&
        event.actorUserId === "system_scheduler" &&
        event.reason === "scheduler_auto_recover_stale_reward_payout_execution",
    ),
    true,
  );
});

test("reward payout automation leaves executing payouts with recorded tx hashes in place when confirmation proof is still unavailable", async () => {
  const harness = createArenaHarness({
    rewardPayoutExecutionPlan: [{ type: "success" }],
    rewardPayoutVerificationPlan: [
      {
        type: "failure",
        code: "reward_payout.transaction_not_confirmed",
        message:
          "The submitted reward payout transaction has not been confirmed successfully on chain",
      },
    ],
  });

  await harness.userRepository.create({
    id: "reward_auto_pending_confirm_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000b1",
    normalizedPrimaryWalletAddress:
      "0x00000000000000000000000000000000000000b1",
    status: "active",
  } as never);

  const proposition = await createLiveProposition(harness, {
    title: "Reward payout pending confirmation proposition",
  });
  const response = await createReviewedResponseForUser(harness, {
    propositionId: proposition.id,
    userId: "reward_auto_pending_confirm_user",
    minuteOffset: 4,
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const payout = await harness.rewardPayoutRepository.findByLedgerId(ledger!.id);
  assert.ok(payout);

  await harness.rewardPayoutService.approvePayout({
    payoutId: payout!.id,
    actorUserId: "ops_admin_1",
    approvedAt: arenaTime(12),
  });
  await harness.rewardPayoutService.executePayout({
    payoutId: payout!.id,
    startedAt: arenaTime(13),
  });

  const result = await harness.rewardPayoutAutomationService.runDuePayouts({
    now: arenaTime(25),
  });

  assert.equal(result.processedCount, 0);
  const payoutAfter = await harness.rewardPayoutRepository.findByLedgerId(ledger!.id);
  assert.equal(payoutAfter?.status, "executing");
  assert.ok(payoutAfter?.executionTxHash);
});
