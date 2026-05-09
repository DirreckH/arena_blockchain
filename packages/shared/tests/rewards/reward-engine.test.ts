import assert from "node:assert/strict";
import test from "node:test";

import { assertRewardBudgetSufficient } from "../../src/arena/rewards/budget-policy.js";
import { RewardBudgetInsufficientError } from "../../src/arena/rewards/errors.js";
import {
  buildLiveProposition,
  buildResponse,
  createAdjudicationHarness,
  createRewardHarness,
} from "./memory-harness.js";

test("recordSubmission creates a pending reward ledger and duplicate retry stays idempotent", async () => {
  const proposition = buildLiveProposition({
    minEffectiveSample: 2,
    rewardBudget: "10",
    baseResponseReward: "5",
  });
  const harness = createRewardHarness(proposition);
  const response = buildResponse({ propositionId: proposition.id });
  await harness.responseRepository.create(response);

  const ledger = await harness.rewardEngine.recordSubmission({
    propositionId: proposition.id,
    userId: response.userId,
    responseId: response.id,
    recordedAt: "2026-04-16T00:01:00.000Z",
  });

  assert.equal(ledger.pendingAmount, "5");
  assert.equal(ledger.status, "pending");
  assert.equal(ledger.responseId, response.id);
  assert.equal(ledger.ledgerVersion, 1);
  assert.equal(harness.rewardLedgerRepository.snapshot().length, 1);

  const duplicate = await harness.rewardEngine.recordSubmission({
    propositionId: proposition.id,
    userId: response.userId,
    responseId: response.id,
    recordedAt: "2026-04-16T00:01:30.000Z",
  });

  assert.equal(duplicate.id, ledger.id);
  assert.equal(harness.rewardLedgerRepository.snapshot().length, 1);
});

test("rebindToLatestResponse reverses the previous entry and creates a new pending version", async () => {
  const proposition = buildLiveProposition({
    rewardBudget: "10",
    baseResponseReward: "5",
  });
  const harness = createRewardHarness(proposition);

  const firstResponse = buildResponse({ propositionId: proposition.id });
  const latestResponse = buildResponse({
    id: "response-2",
    propositionId: proposition.id,
    responseVersion: 2,
    isLatest: true,
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-16T00:02:05.000Z",
    clientSubmittedAt: "2026-04-16T00:02:20.000Z",
    submittedAt: "2026-04-16T00:02:20.000Z",
  });

  await harness.responseRepository.create(firstResponse);
  const created = await harness.rewardEngine.recordSubmission({
    propositionId: proposition.id,
    userId: firstResponse.userId,
    responseId: firstResponse.id,
    recordedAt: "2026-04-16T00:01:00.000Z",
  });
  await harness.rewardEngine.resolveFromReview({
    propositionId: proposition.id,
    responseId: firstResponse.id,
    reviewStatus: "valid",
    isLatest: true,
    resolvedAt: "2026-04-16T00:01:30.000Z",
  });

  await harness.responseRepository.create({
    ...latestResponse,
    taskId: firstResponse.taskId,
    userId: firstResponse.userId,
  });

  const rebound = await harness.rewardEngine.rebindToLatestResponse({
    propositionId: proposition.id,
    userId: firstResponse.userId,
    responseId: latestResponse.id,
    reboundAt: "2026-04-16T00:02:30.000Z",
  });

  const ledgers = harness.rewardLedgerRepository.snapshot();
  assert.equal(created.id, ledgers[0]?.id);
  assert.equal(ledgers.length, 2);
  assert.equal(ledgers[0]?.status, "reversed");
  assert.equal(ledgers[0]?.reasonCode, "superseded_pending_latest");
  assert.equal(rebound.responseId, latestResponse.id);
  assert.equal(rebound.status, "pending");
  assert.equal(rebound.ledgerVersion, 2);
  assert.equal(rebound.reversalOfLedgerId, ledgers[0]?.id ?? null);
});

test("resolveFromReview finalizes valid and partial responses, voids invalid responses, and stays idempotent on replay", async () => {
  const proposition = buildLiveProposition({
    rewardBudget: "15",
    baseResponseReward: "5",
  });
  const harness = createRewardHarness(proposition);

  const response = buildResponse({ propositionId: proposition.id });
  await harness.responseRepository.create(response);
  await harness.rewardEngine.recordSubmission({
    propositionId: proposition.id,
    userId: response.userId,
    responseId: response.id,
    recordedAt: "2026-04-16T00:01:00.000Z",
  });

  const validLedger = await harness.rewardEngine.resolveFromReview({
    propositionId: proposition.id,
    responseId: response.id,
    reviewStatus: "valid",
    isLatest: true,
    resolvedAt: "2026-04-16T00:01:30.000Z",
  });
  assert.equal(validLedger.status, "finalized");
  assert.equal(validLedger.finalAmount, "5");
  assert.equal(validLedger.reasonCode, "review_valid");

  const replay = await harness.rewardEngine.resolveFromReview({
    propositionId: proposition.id,
    responseId: response.id,
    reviewStatus: "valid",
    isLatest: true,
    resolvedAt: "2026-04-16T00:01:40.000Z",
  });
  assert.equal(replay.id, validLedger.id);
  assert.equal(harness.rewardLedgerRepository.snapshot().length, 1);

  const propositionTwo = buildLiveProposition({
    id: "proposition-2",
    rewardBudget: "10",
    baseResponseReward: "5",
  });
  const harnessTwo = createRewardHarness(propositionTwo);
  const partialResponse = buildResponse({
    id: "response-partial",
    propositionId: propositionTwo.id,
    userId: "user-2",
    taskId: "task-2",
  });
  await harnessTwo.responseRepository.create(partialResponse);
  await harnessTwo.rewardEngine.recordSubmission({
    propositionId: propositionTwo.id,
    userId: partialResponse.userId,
    responseId: partialResponse.id,
    recordedAt: "2026-04-16T00:01:00.000Z",
  });

  const partialLedger = await harnessTwo.rewardEngine.resolveFromReview({
    propositionId: propositionTwo.id,
    responseId: partialResponse.id,
    reviewStatus: "partial_valid",
    isLatest: true,
    resolvedAt: "2026-04-16T00:01:30.000Z",
  });
  assert.equal(partialLedger.status, "finalized");
  assert.equal(partialLedger.finalAmount, "2");
  assert.equal(partialLedger.reasonCode, "review_partial_valid");

  const propositionThree = buildLiveProposition({
    id: "proposition-3",
    rewardBudget: "10",
    baseResponseReward: "5",
  });
  const harnessThree = createRewardHarness(propositionThree);
  const invalidResponse = buildResponse({
    id: "response-invalid",
    propositionId: propositionThree.id,
    userId: "user-3",
    taskId: "task-3",
  });
  await harnessThree.responseRepository.create(invalidResponse);
  await harnessThree.rewardEngine.recordSubmission({
    propositionId: propositionThree.id,
    userId: invalidResponse.userId,
    responseId: invalidResponse.id,
    recordedAt: "2026-04-16T00:01:00.000Z",
  });

  const invalidLedger = await harnessThree.rewardEngine.resolveFromReview({
    propositionId: propositionThree.id,
    responseId: invalidResponse.id,
    reviewStatus: "invalid",
    isLatest: true,
    resolvedAt: "2026-04-16T00:01:30.000Z",
  });
  assert.equal(invalidLedger.status, "voided");
  assert.equal(invalidLedger.finalAmount, "0");
  assert.equal(invalidLedger.reasonCode, "invalid_review");
});

test("review correction reverses the prior resolved ledger and writes a new current entry", async () => {
  const proposition = buildLiveProposition({
    rewardBudget: "10",
    baseResponseReward: "5",
  });
  const harness = createRewardHarness(proposition);
  const response = buildResponse({ propositionId: proposition.id });
  await harness.responseRepository.create(response);

  await harness.rewardEngine.recordSubmission({
    propositionId: proposition.id,
    userId: response.userId,
    responseId: response.id,
    recordedAt: "2026-04-16T00:01:00.000Z",
  });

  const firstDecision = await harness.rewardEngine.resolveFromReview({
    propositionId: proposition.id,
    responseId: response.id,
    reviewStatus: "valid",
    isLatest: true,
    resolvedAt: "2026-04-16T00:01:30.000Z",
  });

  const corrected = await harness.rewardEngine.resolveFromReview({
    propositionId: proposition.id,
    responseId: response.id,
    reviewStatus: "invalid",
    isLatest: true,
    resolvedAt: "2026-04-16T00:02:00.000Z",
  });

  const replay = await harness.rewardEngine.resolveFromReview({
    propositionId: proposition.id,
    responseId: response.id,
    reviewStatus: "invalid",
    isLatest: true,
    resolvedAt: "2026-04-16T00:02:10.000Z",
  });

  const ledgers = harness.rewardLedgerRepository.snapshot();
  assert.equal(ledgers.length, 2);
  assert.equal(ledgers[0]?.id, firstDecision.id);
  assert.equal(ledgers[0]?.status, "reversed");
  assert.equal(ledgers[0]?.reasonCode, "review_corrected");
  assert.equal(corrected.status, "voided");
  assert.equal(corrected.reversalOfLedgerId, firstDecision.id);
  assert.equal(corrected.ledgerVersion, 2);
  assert.equal(replay.id, corrected.id);
});

test("non-latest review resolution is ignored once reward binding has moved to a newer response", async () => {
  const proposition = buildLiveProposition({
    rewardBudget: "10",
    baseResponseReward: "5",
  });
  const harness = createRewardHarness(proposition);

  const firstResponse = buildResponse({ propositionId: proposition.id });
  const latestResponse = buildResponse({
    id: "response-2",
    propositionId: proposition.id,
    taskId: firstResponse.taskId,
    userId: firstResponse.userId,
    responseVersion: 2,
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-16T00:02:05.000Z",
    clientSubmittedAt: "2026-04-16T00:02:20.000Z",
    submittedAt: "2026-04-16T00:02:20.000Z",
  });

  await harness.responseRepository.create(firstResponse);
  await harness.rewardEngine.recordSubmission({
    propositionId: proposition.id,
    userId: firstResponse.userId,
    responseId: firstResponse.id,
    recordedAt: "2026-04-16T00:01:00.000Z",
  });
  await harness.responseRepository.create(latestResponse);
  await harness.rewardEngine.rebindToLatestResponse({
    propositionId: proposition.id,
    userId: firstResponse.userId,
    responseId: latestResponse.id,
    reboundAt: "2026-04-16T00:02:30.000Z",
  });

  const oldFinalization = await harness.rewardEngine.resolveFromReview({
    propositionId: proposition.id,
    responseId: firstResponse.id,
    reviewStatus: "valid",
    isLatest: false,
    resolvedAt: "2026-04-16T00:02:40.000Z",
  });

  assert.equal(oldFinalization.responseId, latestResponse.id);
  assert.equal(oldFinalization.status, "pending");
});

test("budget policy passes when sufficient and throws when insufficient", async () => {
  assert.doesNotThrow(() =>
    assertRewardBudgetSufficient(
      buildLiveProposition({
        minEffectiveSample: 2,
        baseResponseReward: "5",
        rewardBudget: "10",
      }),
    ),
  );

  assert.throws(
    () =>
      assertRewardBudgetSufficient(
        buildLiveProposition({
          minEffectiveSample: 2,
          baseResponseReward: "5",
          rewardBudget: "9",
        }),
      ),
    (error: unknown) => error instanceof RewardBudgetInsufficientError,
  );
});

test("reward chain integrates with adjudication response and review flow without touching validation runtime", async () => {
  const proposition = buildLiveProposition({
    minEffectiveSample: 1,
    rewardBudget: "5",
    baseResponseReward: "5",
  });
  const adjudicationHarness = createAdjudicationHarness(proposition);
  const rewardHarness = createRewardHarness();
  rewardHarness.propositionStore.set(proposition);

  const task = await adjudicationHarness.dispatchEngine.assign(
    {
      userId: "user-1",
      userStatus: "active",
      matchesSampleConstraints: true,
      activeTaskCount: 0,
      hasActiveTaskForProposition: false,
      hasSubmittedTaskForProposition: false,
      isInCooldown: false,
    },
    proposition,
    "2026-04-16T00:00:10.000Z",
  );

  const submission = await adjudicationHarness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: task.id,
    userId: task.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-16T00:00:20.000Z",
    clientSubmittedAt: "2026-04-16T00:00:35.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:00:35.000Z",
  });

  await rewardHarness.responseRepository.create(submission.response);
  await rewardHarness.rewardEngine.recordSubmission({
    propositionId: proposition.id,
    userId: submission.response.userId,
    responseId: submission.response.id,
    recordedAt: "2026-04-16T00:00:36.000Z",
  });

  const review = await adjudicationHarness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: submission.response.id,
    reviewedAt: "2026-04-16T00:00:50.000Z",
  });

  const ledger = await rewardHarness.rewardEngine.resolveFromReview({
    propositionId: proposition.id,
    responseId: submission.response.id,
    reviewStatus: review.review.status,
    isLatest: true,
    resolvedAt: "2026-04-16T00:00:51.000Z",
  });

  assert.equal(ledger.status, "finalized");
  assert.equal(ledger.finalAmount, "5");
});
