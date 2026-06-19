import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import { ArenaInternalRewardsController } from "../../src/arena/internal-rewards.controller";
import { ArenaRespondentRewardsController } from "../../src/arena/respondent-rewards.controller";
import { RewardViewService } from "../../src/arena/services/reward-view.service";
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
    Date.parse("2026-04-18T10:06:00.000Z") +
      minuteOffset * 60_000 +
      secondOffset * 1000,
  ).toISOString();

const defaultReasonCodesByStatus = {
  valid: ["passes_quality_review"],
  partial_valid: ["attention_mismatch"],
  invalid: ["integrity_violation"],
  fraud_suspected: ["fraud_signal_detected"],
} as const;

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
    reviewStatus: "valid" | "partial_valid" | "invalid" | "fraud_suspected";
    flags?: string[];
    reasonCodes?: string[];
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
    taskId: task!.id,
    userId: input.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: arenaTime(input.minuteOffset, 10),
    clientSubmittedAt: arenaTime(input.minuteOffset, 20),
    understandingAck: true,
    submittedAt: arenaTime(input.minuteOffset, 20),
  });

  await harness.responseReviewService.finalizeReviewResult({
    responseId: response.id,
    status: input.reviewStatus,
    reviewedAt: arenaTime(input.minuteOffset, 30),
    reviewedByUserId: "reviewer_1",
    qualityScore:
      input.reviewStatus === "valid"
        ? 100
        : input.reviewStatus === "partial_valid"
          ? 60
          : 0,
    flags: [...(input.flags ?? [])],
    reasonCodes: [
      ...(input.reasonCodes ?? defaultReasonCodesByStatus[input.reviewStatus]),
    ],
  });

  return response;
}

test("finalized reward auto-creates payout bound to the user's primary wallet", async () => {
  const harness = createArenaHarness();
  await harness.userRepository.create({
    id: "reward_wallet_user",
    primaryWalletAddress: "0xRewardWallet000000000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardwallet000000000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness);

  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_wallet_user",
    minuteOffset: 1,
    reviewStatus: "valid",
  });

  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);
  assert.equal(ledger?.status, "finalized");

  const payout = await harness.rewardPayoutRepository.findByLedgerId(ledger!.id);
  assert.ok(payout);
  assert.equal(payout?.status, "requested");
  assert.equal(payout?.method, "wallet_transfer");
  assert.equal(payout?.amount, "20");
  assert.equal(
    payout?.destinationAddress,
    "0xRewardWallet000000000000000000000000000001",
  );
});

test("finalized zero-amount rewards do not auto-create payout records", async () => {
  const harness = createArenaHarness();
  await harness.userRepository.create({
    id: "reward_zero_user",
    primaryWalletAddress: "0x00000000000000000000000000000000000000a0",
    normalizedPrimaryWalletAddress:
      "0x00000000000000000000000000000000000000a0",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    rewardBudget: "0",
    baseResponseReward: "0",
  });

  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_zero_user",
    minuteOffset: 1,
    reviewStatus: "valid",
  });

  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);
  assert.equal(ledger?.status, "finalized");
  assert.equal(ledger?.finalAmount, "0");

  const payout = await harness.rewardPayoutRepository.findByLedgerId(ledger!.id);
  assert.equal(payout, null);
});

test("finalized reward without a bound wallet keeps the ledger finalized and auto-creates payout after wallet binding", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);

  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_wallet_later_user",
    minuteOffset: 1,
    reviewStatus: "valid",
  });

  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);
  assert.equal(ledger?.status, "finalized");

  const payoutBeforeWallet = await harness.rewardPayoutRepository.findByLedgerId(
    ledger!.id,
  );
  assert.equal(payoutBeforeWallet, null);

  await harness.userIdentityService.ensureUserExists("reward_wallet_later_user", {
    walletAddress: "0x00000000000000000000000000000000000000b0",
  });

  const payout = await harness.rewardPayoutRepository.findByLedgerId(ledger!.id);
  assert.ok(payout);
  assert.equal(payout.status, "requested");
  assert.equal(
    payout.destinationAddress,
    "0x00000000000000000000000000000000000000b0",
  );
});

test("internal reward payout ensure control creates a missing payout after wallet binding", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness);
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_manual_backfill_user",
    minuteOffset: 1,
    reviewStatus: "valid",
  });

  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);
  assert.equal(ledger?.status, "finalized");

  const payoutBeforeWallet = await harness.rewardPayoutRepository.findByLedgerId(
    ledger!.id,
  );
  assert.equal(payoutBeforeWallet, null);

  await harness.userIdentityService.ensureUserExists("reward_manual_backfill_user", {
    walletAddress: "0x00000000000000000000000000000000000000c3",
  });

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService as any,
  );

  const detail = await controller.ensurePayout(
    ledger!.id,
    {
      ensuredAt: arenaTime(4),
      reason: "manual_missing_payout_recovery",
      note: "operator rebuilt missing payout after wallet binding",
    },
    {
      user: { sub: "ops_reward_backfill" },
    } as any,
  );

  assert.equal(detail.payout?.status, "requested");
  assert.equal(detail.payout?.amount, "20");
  assert.equal(
    detail.payout?.destinationAddress,
    "0x00000000000000000000000000000000000000c3",
  );
  assert.equal(detail.auditEvents[0]?.action, "reward_payout_ensured");
  assert.equal(detail.auditEvents[0]?.actorUserId, "ops_reward_backfill");
  assert.equal(
    detail.auditEvents[0]?.reason,
    "manual_missing_payout_recovery",
  );
});

test("review correction cancels unfinished payout for the reversed finalized ledger", async () => {
  const harness = createArenaHarness();
  await harness.userRepository.create({
    id: "reward_correction_user",
    primaryWalletAddress: "0xRewardCorrection00000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardcorrection00000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness);

  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_correction_user",
    minuteOffset: 2,
    reviewStatus: "valid",
  });
  const finalizedLedger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(finalizedLedger);
  const payoutBefore = await harness.rewardPayoutRepository.findByLedgerId(
    finalizedLedger!.id,
  );
  assert.equal(payoutBefore?.status, "requested");

  await harness.responseReviewService.finalizeReviewResult({
    responseId: response.id,
    status: "invalid",
    reviewedAt: arenaTime(3, 30),
    reviewedByUserId: "reviewer_2",
    qualityScore: 0,
    flags: ["manual_correction_signal"],
    reasonCodes: ["integrity_violation"],
  });

  const history = await harness.rewardLedgerRepository.findByResponseId(response.id);
  assert.equal(history.length, 2);
  assert.equal(history[0]?.status, "reversed");
  assert.equal(history[1]?.status, "voided");

  const reversedPayout = await harness.rewardPayoutRepository.findByLedgerId(
    history[0]!.id,
  );
  assert.equal(reversedPayout?.status, "cancelled");
  assert.equal(reversedPayout?.lastErrorCode, "invalid_review");

  const replacementPayout = await harness.rewardPayoutRepository.findByLedgerId(
    history[1]!.id,
  );
  assert.equal(replacementPayout, null);
});

test("respondent and internal reward views expose payout lifecycle fields", async () => {
  const harness = createArenaHarness();
  await harness.userRepository.create({
    id: "reward_view_user",
    primaryWalletAddress: "0xRewardView00000000000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardview00000000000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout read model proposition",
  });

  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_view_user",
    minuteOffset: 4,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const respondentController = new ArenaRespondentRewardsController(
    new RewardViewService(
      harness.propositionRepository as any,
      harness.rewardLedgerService as any,
      harness.rewardPayoutService as any,
    ),
  );
  const respondentRewards = await respondentController.listRewards({
    user: { sub: "reward_view_user" },
  } as never);

  assert.equal(respondentRewards.length, 1);
  assert.equal(respondentRewards[0]?.payoutStatus, "requested");
  assert.equal(respondentRewards[0]?.payoutMethod, "wallet_transfer");
  assert.equal(respondentRewards[0]?.payoutAmount, "20");
  assert.equal(
    respondentRewards[0]?.payoutDestinationAddress,
    "0xRewardView00000000000000000000000000000001",
  );
  assert.equal(typeof respondentRewards[0]?.payoutRequestedAt, "string");

  const internalController = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const detail = await internalController.getReward(ledger!.id);

  assert.equal(detail.payout?.status, "requested");
  assert.equal(detail.payout?.amount, "20");
  assert.equal(detail.chain[0]?.payoutStatus, "requested");
  assert.equal(
    detail.chain[0]?.payoutDestinationAddress,
    "0xRewardView00000000000000000000000000000001",
  );
});

test("internal reward payout controls advance lifecycle with retry audit trail", async () => {
  const harness = createArenaHarness();
  await harness.userRepository.create({
    id: "reward_ops_user",
    primaryWalletAddress: "0xRewardOps000000000000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardops000000000000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout ops proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_ops_user",
    minuteOffset: 6,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  const approved = await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(6, 40),
      reason: "operator_approved_reward_payout",
      note: "wallet ownership verified",
    } as never,
    operatorRequest,
  );
  assert.equal(approved.payout?.status, "approved");
  assert.equal(approved.payout?.approvedByUserId, "ops_admin_1");

  const executing = await controller.startPayoutExecution(
    ledger!.id,
    {
      startedAt: arenaTime(6, 50),
      reason: "wallet_transfer_broadcast_started",
      note: "queued in payout batch",
    } as never,
    operatorRequest,
  );
  assert.equal(executing.payout?.status, "executing");
  assert.equal(executing.payout?.retryCount, 0);
  assert.equal(
    executing.payout?.executionTxHash,
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );

  const failed = await controller.failPayout(
    ledger!.id,
    {
      failedAt: arenaTime(7, 0),
      reason: "wallet_transfer_failed",
      note: "rpc timeout during submission",
      errorCode: "rpc_timeout",
      errorMessage: "RPC timed out while broadcasting transfer",
    } as never,
    operatorRequest,
  );
  assert.equal(failed.payout?.status, "failed");
  assert.equal(failed.payout?.lastErrorCode, "rpc_timeout");

  const retryApproved = await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(7, 10),
      reason: "operator_retry_approved",
      note: "manual retry authorized",
    } as never,
    operatorRequest,
  );
  assert.equal(retryApproved.payout?.status, "approved");

  const retryExecuting = await controller.startPayoutExecution(
    ledger!.id,
    {
      startedAt: arenaTime(7, 20),
      reason: "wallet_transfer_retry_started",
      note: "broadcasting retry run",
    } as never,
    operatorRequest,
  );
  assert.equal(retryExecuting.payout?.status, "executing");
  assert.equal(retryExecuting.payout?.retryCount, 1);
  assert.equal(
    retryExecuting.payout?.executionTxHash,
    "0x0000000000000000000000000000000000000000000000000000000000000002",
  );

  const completed = await controller.completePayout(
    ledger!.id,
    {
      completedAt: arenaTime(7, 30),
      reason: "wallet_transfer_confirmed",
      note: "confirmed on target chain",
      executionTxHash:
        "0x00000000000000000000000000000000000000000000000000000000000000a1",
      externalReference: "ops_batch_001",
    } as never,
    operatorRequest,
  );
  assert.equal(completed.payout?.status, "completed");
  assert.equal(
    completed.payout?.executionTxHash,
    "0x00000000000000000000000000000000000000000000000000000000000000a1",
  );
  assert.equal(completed.payout?.externalReference, "ops_batch_001");
  assert.equal(completed.payout?.retryCount, 1);

  assert.deepEqual(
    completed.auditEvents.slice(0, 6).map((event) => event.action),
    [
      "reward_payout_completed",
      "reward_payout_execution_started",
      "reward_payout_approved",
      "reward_payout_failed",
      "reward_payout_execution_started",
      "reward_payout_approved",
    ],
  );
  assert.equal(completed.auditEvents[0]?.actorUserId, "ops_admin_1");
});

test("start payout execution marks the payout failed when the broadcast adapter errors", async () => {
  const harness = createArenaHarness({
    rewardPayoutExecutionPlan: [
      {
        type: "failure",
        code: "reward_payout.execution_rejected",
        message: "ERC20 transfer broadcast rejected by payout signer",
      },
    ],
  });
  await harness.userRepository.create({
    id: "reward_execution_failure_user",
    primaryWalletAddress:
      "0xRewardExecutionFailure000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardexecutionfailure000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout execution failure proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_execution_failure_user",
    minuteOffset: 8,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  const approved = await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(8, 40),
      reason: "operator_approved_reward_payout",
      note: "wallet ownership verified",
    } as never,
    operatorRequest,
  );
  assert.equal(approved.payout?.status, "approved");

  const failed = await controller.startPayoutExecution(
    ledger!.id,
    {
      startedAt: arenaTime(8, 50),
      reason: "wallet_transfer_broadcast_started",
      note: "attempting signed transfer",
    } as never,
    operatorRequest,
  );

  assert.equal(failed.payout?.status, "failed");
  assert.equal(failed.payout?.retryCount, 0);
  assert.equal(
    failed.payout?.lastErrorCode,
    "reward_payout.execution_rejected",
  );
  assert.equal(
    failed.payout?.lastErrorMessage,
    "ERC20 transfer broadcast rejected by payout signer",
  );
  assert.equal(failed.payout?.executionTxHash, null);
  assert.deepEqual(
    failed.auditEvents.slice(0, 2).map((event) => event.action),
    ["reward_payout_failed", "reward_payout_approved"],
  );
});

test("retry execution failure clears stale transaction identifiers from the previous attempt", async () => {
  const harness = createArenaHarness({
    rewardPayoutExecutionPlan: [
      {
        type: "success",
        executionTxHash:
          "0x00000000000000000000000000000000000000000000000000000000000000d1",
        externalReference: "ops_batch_initial",
      },
      {
        type: "failure",
        code: "reward_payout.execution_rejected",
        message: "Retry broadcast rejected by payout signer",
      },
    ],
  });
  await harness.userRepository.create({
    id: "reward_retry_failure_user",
    primaryWalletAddress:
      "0xRewardRetryFailure00000000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardretryfailure00000000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout retry failure proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_retry_failure_user",
    minuteOffset: 9,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(9, 40),
      reason: "operator_approved_reward_payout",
      note: "approved for first attempt",
    } as never,
    operatorRequest,
  );

  const firstExecuting = await controller.startPayoutExecution(
    ledger!.id,
    {
      startedAt: arenaTime(9, 45),
      reason: "wallet_transfer_broadcast_started",
      note: "initial broadcast succeeded",
    } as never,
    operatorRequest,
  );
  assert.equal(firstExecuting.payout?.status, "executing");
  assert.equal(
    firstExecuting.payout?.executionTxHash,
    "0x00000000000000000000000000000000000000000000000000000000000000d1",
  );
  assert.equal(firstExecuting.payout?.externalReference, "ops_batch_initial");

  await controller.failPayout(
    ledger!.id,
    {
      failedAt: arenaTime(9, 50),
      reason: "wallet_transfer_failed",
      note: "manual failure after on-chain follow-up stalled",
      errorCode: "tx_stalled",
      errorMessage: "Initial payout transaction stalled before confirmation",
    } as never,
    operatorRequest,
  );

  await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(9, 55),
      reason: "operator_retry_approved",
      note: "retry approved after operator review",
    } as never,
    operatorRequest,
  );

  const retryFailed = await controller.startPayoutExecution(
    ledger!.id,
    {
      startedAt: arenaTime(10, 0),
      reason: "wallet_transfer_retry_started",
      note: "retry broadcast rejected immediately",
    } as never,
    operatorRequest,
  );

  assert.equal(retryFailed.payout?.status, "failed");
  assert.equal(retryFailed.payout?.retryCount, 1);
  assert.equal(retryFailed.payout?.lastErrorCode, "reward_payout.execution_rejected");
  assert.equal(retryFailed.payout?.lastErrorMessage, "Retry broadcast rejected by payout signer");
  assert.equal(retryFailed.payout?.executionTxHash, null);
  assert.equal(retryFailed.payout?.externalReference, null);
});

test("manual wallet payout completion is rejected when no execution transaction hash exists", async () => {
  const harness = createArenaHarness();
  await harness.userRepository.create({
    id: "reward_missing_tx_user",
    primaryWalletAddress: "0xRewardMissingTx0000000000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardmissingtx0000000000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout tx hash requirement proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_missing_tx_user",
    minuteOffset: 10,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  const approved = await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(10, 40),
      reason: "operator_approved_reward_payout",
      note: "ready for manual settlement",
    } as never,
    operatorRequest,
  );
  assert.equal(approved.payout?.status, "approved");

  await assert.rejects(
    () =>
      controller.completePayout(
        ledger!.id,
        {
          completedAt: arenaTime(10, 50),
          reason: "wallet_transfer_confirmed",
          note: "missing execution proof",
        } as never,
        operatorRequest,
      ),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "reward_payout.execution_tx_hash_required",
      );
      return true;
    },
  );
});

test("wallet payout completion rejects requested payouts before chain verification runs", async () => {
  const harness = createArenaHarness({
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
    id: "reward_requested_completion_user",
    primaryWalletAddress:
      "0xRewardRequestedComplete00000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardrequestedcomplete00000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout requested completion guard proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_requested_completion_user",
    minuteOffset: 10,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  await assert.rejects(
    () =>
      controller.completePayout(
        ledger!.id,
        {
          completedAt: arenaTime(10, 45),
          reason: "wallet_transfer_confirmed",
          note: "completion attempted before approval",
          executionTxHash:
            "0x00000000000000000000000000000000000000000000000000000000000000b1",
        } as never,
        operatorRequest,
      ),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "reward_payout.invalid_completion_state",
      );
      return true;
    },
  );

  const payout = await harness.rewardPayoutRepository.findByLedgerId(ledger!.id);
  assert.equal(payout?.status, "requested");
  assert.equal(payout?.executionTxHash, null);
});

test("wallet payout completion is rejected when chain confirmation proof is still missing", async () => {
  const harness = createArenaHarness({
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
    id: "reward_unconfirmed_tx_user",
    primaryWalletAddress:
      "0xRewardUnconfirmed0000000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardunconfirmed0000000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout unconfirmed transaction proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_unconfirmed_tx_user",
    minuteOffset: 11,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(11, 40),
      reason: "operator_approved_reward_payout",
      note: "ready for payout execution",
    } as never,
    operatorRequest,
  );

  const executing = await controller.startPayoutExecution(
    ledger!.id,
    {
      startedAt: arenaTime(11, 45),
      reason: "wallet_transfer_broadcast_started",
      note: "broadcasted to chain",
    } as never,
    operatorRequest,
  );
  assert.equal(executing.payout?.status, "executing");

  await assert.rejects(
    () =>
      controller.completePayout(
        ledger!.id,
        {
          completedAt: arenaTime(11, 55),
          reason: "wallet_transfer_confirmed",
          note: "receipt still pending confirmations",
        } as never,
        operatorRequest,
      ),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "reward_payout.transaction_not_confirmed",
      );
      return true;
    },
  );
});

test("wallet payout completion re-checks payout state after verification before marking completed", async () => {
  const harness = createArenaHarness({
    rewardPayoutVerificationPlan: [{ type: "success" }],
  });
  await harness.userRepository.create({
    id: "reward_completion_recheck_user",
    primaryWalletAddress:
      "0xRewardCompletionRecheck000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardcompletionrecheck000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout completion recheck proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_completion_recheck_user",
    minuteOffset: 12,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(12, 40),
      reason: "operator_approved_reward_payout",
      note: "approved for manual confirmation",
    } as never,
    operatorRequest,
  );

  const payout = await harness.rewardPayoutRepository.findByLedgerId(ledger!.id);
  assert.ok(payout);
  const rewardPayoutService = harness.rewardPayoutService as any;
  const originalGetRequiredPayout =
    rewardPayoutService.getRequiredPayout.bind(rewardPayoutService);
  let completionReadCount = 0;
  rewardPayoutService.getRequiredPayout = async (
    payoutId: string,
    db: unknown,
  ) => {
    const currentPayout = await originalGetRequiredPayout(payoutId, db);
    completionReadCount += 1;
    if (completionReadCount >= 2) {
      return {
        ...currentPayout,
        status: "cancelled",
        cancelledAt: new Date(arenaTime(12, 50)),
        lastErrorCode: "operator_cancelled_mid_confirmation",
        lastErrorMessage:
          "Operator cancelled payout after verification but before completion persisted",
      };
    }

    return currentPayout;
  };

  await assert.rejects(
    () =>
      controller.completePayout(
        ledger!.id,
        {
          completedAt: arenaTime(12, 55),
          reason: "wallet_transfer_confirmed",
          note: "verification passed but state changed before completion write",
          executionTxHash:
            "0x00000000000000000000000000000000000000000000000000000000000000c1",
        } as never,
        operatorRequest,
      ),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "reward_payout.invalid_completion_state",
      );
      return true;
    },
  );

  const payoutAfter = await harness.rewardPayoutRepository.findByLedgerId(
    ledger!.id,
  );
  assert.equal(payoutAfter?.status, "approved");
  assert.equal(payoutAfter?.lastErrorCode, null);
  assert.equal(payoutAfter?.completedAt, null);
});

test("wallet payout completion succeeds after chain confirmation proof is verified", async () => {
  const harness = createArenaHarness({
    rewardPayoutVerificationPlan: [{ type: "success" }],
  });
  await harness.userRepository.create({
    id: "reward_confirmed_tx_user",
    primaryWalletAddress:
      "0xRewardConfirmed000000000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardconfirmed000000000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout confirmed transaction proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_confirmed_tx_user",
    minuteOffset: 12,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(12, 40),
      reason: "operator_approved_reward_payout",
      note: "wallet verified",
    } as never,
    operatorRequest,
  );

  const executing = await controller.startPayoutExecution(
    ledger!.id,
    {
      startedAt: arenaTime(12, 45),
      reason: "wallet_transfer_broadcast_started",
      note: "broadcasted to chain",
    } as never,
    operatorRequest,
  );
  assert.equal(executing.payout?.status, "executing");

  const completed = await controller.completePayout(
    ledger!.id,
    {
      completedAt: arenaTime(12, 55),
      reason: "wallet_transfer_confirmed",
      note: "confirmed on chain",
    } as never,
    operatorRequest,
  );

  assert.equal(completed.payout?.status, "completed");
  assert.equal(
    completed.payout?.executionTxHash,
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );
});

test("confirm payout execution completes an executing wallet payout from its recorded transaction hash", async () => {
  const harness = createArenaHarness({
    rewardPayoutVerificationPlan: [{ type: "success" }],
  });
  await harness.userRepository.create({
    id: "reward_confirm_via_recorded_tx_user",
    primaryWalletAddress:
      "0xRewardConfirmRecorded000000000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardconfirmrecorded000000000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout confirm by recorded transaction proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_confirm_via_recorded_tx_user",
    minuteOffset: 13,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(13, 40),
      reason: "operator_approved_reward_payout",
      note: "approved for execution",
    } as never,
    operatorRequest,
  );

  const executing = await controller.startPayoutExecution(
    ledger!.id,
    {
      startedAt: arenaTime(13, 45),
      reason: "wallet_transfer_broadcast_started",
      note: "submitted to chain",
    } as never,
    operatorRequest,
  );
  assert.equal(executing.payout?.status, "executing");
  assert.equal(
    executing.payout?.executionTxHash,
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );

  const completed = await controller.confirmPayoutExecution(
    ledger!.id,
    {
      confirmedAt: arenaTime(13, 55),
      reason: "wallet_transfer_chain_confirmed",
      note: "confirmed from recorded payout tx",
      externalReference: "ops_confirm_001",
    } as never,
    operatorRequest,
  );

  assert.equal(completed.payout?.status, "completed");
  assert.equal(
    completed.payout?.executionTxHash,
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );
  assert.equal(completed.payout?.externalReference, "ops_confirm_001");
  assert.equal(completed.auditEvents[0]?.action, "reward_payout_completed");
});

test("confirm payout execution is rejected when the payout never recorded an execution transaction hash", async () => {
  const harness = createArenaHarness();
  await harness.userRepository.create({
    id: "reward_confirm_missing_recorded_tx_user",
    primaryWalletAddress:
      "0xRewardConfirmMissingRecorded00000000000000000001",
    normalizedPrimaryWalletAddress:
      "0xrewardconfirmmissingrecorded00000000000000000001",
    status: "active",
  } as never);
  const proposition = await createLiveProposition(harness, {
    title: "Reward payout confirm missing recorded tx proposition",
  });
  const response = await createReviewedResponseForProposition(harness, {
    propositionId: proposition.id,
    userId: "reward_confirm_missing_recorded_tx_user",
    minuteOffset: 14,
    reviewStatus: "valid",
  });
  const ledger = await harness.rewardLedgerRepository.findLatestByResponseId(
    response.id,
  );
  assert.ok(ledger);

  const controller = new ArenaInternalRewardsController(
    harness.internalRewardAuditService,
  );
  const operatorRequest = {
    user: { sub: "ops_admin_1" },
  } as never;

  await controller.approvePayout(
    ledger!.id,
    {
      approvedAt: arenaTime(14, 40),
      reason: "operator_approved_reward_payout",
      note: "manual payout path",
    } as never,
    operatorRequest,
  );

  await assert.rejects(
    () =>
      controller.confirmPayoutExecution(
        ledger!.id,
        {
          confirmedAt: arenaTime(14, 50),
          reason: "wallet_transfer_chain_confirmed",
          note: "no recorded tx exists",
        } as never,
        operatorRequest,
      ),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "reward_payout.execution_tx_hash_required",
      );
      return true;
    },
  );
});
