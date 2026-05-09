import assert from "node:assert/strict";
import test from "node:test";

import { ResultSummaryNotAvailableError } from "../../src/arena/application/errors.js";
import { buildLiveProposition } from "../adjudication/memory-harness.js";
import {
  buildResolvedProposition,
  createE2EHarness,
} from "./memory-harness.js";

test("happy path resolved end-to-end wires adjudication, settlement, rewards and result summary together", async () => {
  const proposition = buildResolvedProposition({
    id: "proposition-happy",
    minEffectiveSample: 3,
    rewardBudget: "30",
    baseResponseReward: "5",
    minBetAmount: "10",
  });
  const harness = createE2EHarness(proposition, "2026-04-16T00:00:05.000Z");

  const market = await harness.marketEngine.ensureForProposition(proposition.id);
  await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: proposition.liveAt!,
  });

  const task1 = await harness.assignTask("user-1", "2026-04-16T00:00:10.000Z");
  const task2 = await harness.assignTask("user-2", "2026-04-16T00:00:20.000Z");
  const task3 = await harness.assignTask("user-3", "2026-04-16T00:00:30.000Z");

  const submit1 = await harness.submitResponse(
    "user-1",
    task1.id,
    "2026-04-16T00:00:40.000Z",
    0,
  );
  const submit2 = await harness.submitResponse(
    "user-2",
    task2.id,
    "2026-04-16T00:00:50.000Z",
    0,
  );
  const submit3 = await harness.submitResponse(
    "user-3",
    task3.id,
    "2026-04-16T00:01:00.000Z",
    1,
  );

  const response1 = await harness.responseRepository.getById(submit1.responseId);
  const response2 = await harness.responseRepository.getById(submit2.responseId);
  const response3 = await harness.responseRepository.getById(submit3.responseId);
  assert.ok(response1 && response2 && response3);

  const review1 = await harness.finalizeReview(
    proposition.id,
    response1.id,
    "2026-04-16T00:01:10.000Z",
  );
  const review2 = await harness.finalizeReview(
    proposition.id,
    response2.id,
    "2026-04-16T00:01:20.000Z",
  );
  const review3 = await harness.finalizeReview(
    proposition.id,
    response3.id,
    "2026-04-16T00:01:30.000Z",
  );
  assert.equal(review1.review.status, "valid");
  assert.equal(review2.review.status, "valid");
  assert.equal(review3.review.status, "valid");

  const counter = await harness.rebuildCounter(
    proposition.id,
    "2026-04-16T00:01:35.000Z",
  );
  assert.equal(counter.validCount, 3);

  await harness.placeBet(
    proposition.id,
    market.id,
    "user-1",
    0,
    "20",
    "2026-04-16T00:01:40.000Z",
  );
  await harness.placeBet(
    proposition.id,
    market.id,
    "user-4",
    1,
    "10",
    "2026-04-16T00:01:45.000Z",
  );

  const aggregate = await harness.buildAggregate(proposition.id);
  assert.equal(aggregate.resultKind, "resolved");
  assert.equal(aggregate.winningOption, 0);

  await harness.freezeProposition(
    proposition.id,
    "2026-04-16T00:02:00.000Z",
  );
  await harness.marketEngine.freezeForReveal({
    marketId: market.id,
    frozenAt: "2026-04-16T00:02:00.000Z",
  });
  await harness.startReveal(
    proposition.id,
    "2026-04-16T00:02:10.000Z",
  );
  await harness.recordOfficialResult(
    proposition.id,
    aggregate,
    "2026-04-16T00:02:20.000Z",
  );

  const settlement = await harness.settlementEngine.finalize({
    propositionId: proposition.id,
    marketId: market.id,
    resultKind: aggregate.resultKind,
    winningOption: aggregate.winningOption,
    voidReason: aggregate.voidReason,
    platformFeeBps: 0,
    settledAt: "2026-04-16T00:02:30.000Z",
  });
  await harness.settleProposition(
    proposition.id,
    "2026-04-16T00:02:30.000Z",
    "settled",
  );

  const ledger1 = await harness.finalizeRewardForLatest(
    proposition.id,
    response1,
    review1.review.status,
    "2026-04-16T00:02:40.000Z",
  );
  await harness.finalizeRewardForLatest(
    proposition.id,
    response2,
    review2.review.status,
    "2026-04-16T00:02:41.000Z",
  );
  await harness.finalizeRewardForLatest(
    proposition.id,
    response3,
    review3.review.status,
    "2026-04-16T00:02:42.000Z",
  );
  const summary = await harness.resultSurface.getResultSummary(
    proposition.id,
    "user-1",
  );

  assert.equal(settlement.market.status, "settled");
  assert.equal(
    settlement.positions.find((position) => position.userId === "user-1")
      ?.settlementOutcome,
    "won",
  );
  assert.equal(
    settlement.positions.find((position) => position.userId === "user-4")
      ?.settlementOutcome,
    "lost",
  );
  assert.equal(ledger1.status, "finalized");
  assert.equal(summary.currentUserRewardStatus, "finalized");
  assert.equal(summary.currentUserSettlementOutcome, "won");
});

test("insufficient sample void end-to-end refunds market while keeping reward independent", async () => {
  const proposition = buildResolvedProposition({
    id: "proposition-insufficient",
    minEffectiveSample: 2,
    rewardBudget: "10",
    baseResponseReward: "5",
  });
  const harness = createE2EHarness(proposition, "2026-04-16T00:00:05.000Z");

  const market = await harness.marketEngine.ensureForProposition(proposition.id);
  await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: proposition.liveAt!,
  });

  const task = await harness.assignTask("user-1", "2026-04-16T00:00:10.000Z");
  const submit = await harness.submitResponse(
    "user-1",
    task.id,
    "2026-04-16T00:00:30.000Z",
    0,
  );
  const response = await harness.responseRepository.getById(submit.responseId);
  assert.ok(response);
  const review = await harness.finalizeReview(
    proposition.id,
    response.id,
    "2026-04-16T00:00:40.000Z",
  );
  await harness.rebuildCounter(proposition.id, "2026-04-16T00:00:41.000Z");

  await harness.placeBet(
    proposition.id,
    market.id,
    "user-1",
    0,
    "20",
    "2026-04-16T00:00:50.000Z",
  );
  await harness.placeBet(
    proposition.id,
    market.id,
    "user-2",
    1,
    "20",
    "2026-04-16T00:00:55.000Z",
  );

  const aggregate = await harness.buildAggregate(proposition.id);
  assert.equal(aggregate.resultKind, "void");
  assert.equal(aggregate.voidReason, "insufficient_sample");

  await harness.freezeProposition(
    proposition.id,
    "2026-04-16T00:01:00.000Z",
  );
  await harness.marketEngine.freezeForReveal({
    marketId: market.id,
    frozenAt: "2026-04-16T00:01:00.000Z",
  });
  await harness.startReveal(
    proposition.id,
    "2026-04-16T00:01:10.000Z",
  );
  await harness.recordOfficialResult(
    proposition.id,
    aggregate,
    "2026-04-16T00:01:15.000Z",
  );

  const settlement = await harness.settlementEngine.finalize({
    propositionId: proposition.id,
    marketId: market.id,
    resultKind: aggregate.resultKind,
    winningOption: aggregate.winningOption,
    voidReason: aggregate.voidReason,
    platformFeeBps: 0,
    settledAt: "2026-04-16T00:01:20.000Z",
  });
  await harness.settleProposition(
    proposition.id,
    "2026-04-16T00:01:20.000Z",
    "settled",
  );

  const rewardLedger = await harness.finalizeRewardForLatest(
    proposition.id,
    response,
    review.review.status,
    "2026-04-16T00:01:30.000Z",
  );
  const summary = await harness.resultSurface.getResultSummary(
    proposition.id,
    "user-1",
  );

  assert.ok(
    settlement.positions.every(
      (position) => position.settlementOutcome === "refund" && position.pnl === "0",
    ),
  );
  assert.equal(rewardLedger.status, "finalized");
  assert.equal(summary.voidReason, "insufficient_sample");
  assert.equal(summary.currentUserRewardStatus, "finalized");
  assert.equal(summary.currentUserSettlementOutcome, "refund");
});

test("tie void end-to-end refunds market and keeps result surface readable", async () => {
  const proposition = buildResolvedProposition({
    id: "proposition-tie",
    minEffectiveSample: 2,
  });
  const harness = createE2EHarness(proposition, "2026-04-16T00:00:05.000Z");

  const market = await harness.marketEngine.ensureForProposition(proposition.id);
  await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: proposition.liveAt!,
  });

  const task1 = await harness.assignTask("user-1", "2026-04-16T00:00:10.000Z");
  const task2 = await harness.assignTask("user-2", "2026-04-16T00:00:15.000Z");
  const submit1 = await harness.submitResponse(
    "user-1",
    task1.id,
    "2026-04-16T00:00:30.000Z",
    0,
  );
  const submit2 = await harness.submitResponse(
    "user-2",
    task2.id,
    "2026-04-16T00:00:35.000Z",
    1,
  );
  const response1 = await harness.responseRepository.getById(submit1.responseId);
  const response2 = await harness.responseRepository.getById(submit2.responseId);
  assert.ok(response1 && response2);

  const review1 = await harness.finalizeReview(
    proposition.id,
    response1.id,
    "2026-04-16T00:00:45.000Z",
  );
  const review2 = await harness.finalizeReview(
    proposition.id,
    response2.id,
    "2026-04-16T00:00:46.000Z",
  );
  await harness.rebuildCounter(proposition.id, "2026-04-16T00:00:47.000Z");

  await harness.placeBet(
    proposition.id,
    market.id,
    "user-1",
    0,
    "10",
    "2026-04-16T00:00:50.000Z",
  );
  await harness.placeBet(
    proposition.id,
    market.id,
    "user-3",
    1,
    "10",
    "2026-04-16T00:00:55.000Z",
  );

  const aggregate = await harness.buildAggregate(proposition.id);
  assert.equal(aggregate.resultKind, "void");
  assert.equal(aggregate.voidReason, "tie");

  await harness.freezeProposition(
    proposition.id,
    "2026-04-16T00:01:00.000Z",
  );
  await harness.marketEngine.freezeForReveal({
    marketId: market.id,
    frozenAt: "2026-04-16T00:01:00.000Z",
  });
  await harness.startReveal(
    proposition.id,
    "2026-04-16T00:01:10.000Z",
  );
  await harness.recordOfficialResult(
    proposition.id,
    aggregate,
    "2026-04-16T00:01:15.000Z",
  );
  const settlement = await harness.settlementEngine.finalize({
    propositionId: proposition.id,
    marketId: market.id,
    resultKind: aggregate.resultKind,
    winningOption: aggregate.winningOption,
    voidReason: aggregate.voidReason,
    platformFeeBps: 0,
    settledAt: "2026-04-16T00:01:20.000Z",
  });
  await harness.settleProposition(
    proposition.id,
    "2026-04-16T00:01:20.000Z",
    "settled",
  );

  await harness.finalizeRewardForLatest(
    proposition.id,
    response1,
    review1.review.status,
    "2026-04-16T00:01:25.000Z",
  );
  const reward2 = await harness.finalizeRewardForLatest(
    proposition.id,
    response2,
    review2.review.status,
    "2026-04-16T00:01:26.000Z",
  );
  const summary = await harness.resultSurface.getResultSummary(
    proposition.id,
    "user-1",
  );

  assert.ok(
    settlement.positions.every(
      (position) => position.settlementOutcome === "refund",
    ),
  );
  assert.equal(reward2.status, "finalized");
  assert.equal(summary.voidReason, "tie");
  assert.equal(summary.currentUserSettlementOutcome, "refund");
});

test("revision duplicate retry latest-only end-to-end keeps only the newest reviewed response and reward binding", async () => {
  const proposition = buildResolvedProposition({
    id: "proposition-revision",
    minEffectiveSample: 2,
  });
  const harness = createE2EHarness(proposition, "2026-04-16T00:00:05.000Z");

  const market = await harness.marketEngine.ensureForProposition(proposition.id);
  await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: proposition.liveAt!,
  });

  const task1 = await harness.assignTask("user-1", "2026-04-16T00:00:10.000Z");
  const task2 = await harness.assignTask("user-2", "2026-04-16T00:00:15.000Z");

  const first = await harness.submitResponse(
    "user-1",
    task1.id,
    "2026-04-16T00:00:30.000Z",
    0,
  );
  const firstResponse = await harness.responseRepository.getById(first.responseId);
  assert.ok(firstResponse);
  const firstReview = await harness.finalizeReview(
    proposition.id,
    firstResponse.id,
    "2026-04-16T00:00:40.000Z",
  );
  await harness.rebuildCounter(proposition.id, "2026-04-16T00:00:41.000Z");
  const initialLedger = await harness.finalizeRewardForLatest(
    proposition.id,
    firstResponse,
    firstReview.review.status,
    "2026-04-16T00:00:42.000Z",
  );
  assert.equal(initialLedger.status, "finalized");

  const revision = await harness.submitResponse(
    "user-1",
    task1.id,
    "2026-04-16T00:01:00.000Z",
    1,
  );
  const revisionDuplicate = await harness.submitResponse(
    "user-1",
    task1.id,
    "2026-04-16T00:01:00.000Z",
    1,
  );
  assert.equal(revisionDuplicate.duplicateRetry, true);

  const allUserOneResponses = await harness.listResponsesByUser(
    proposition.id,
    "user-1",
  );
  assert.equal(allUserOneResponses.length, 2);
  assert.equal(
    allUserOneResponses.find((response) => response.responseVersion === 1)?.isLatest,
    false,
  );
  assert.equal(
    allUserOneResponses.find((response) => response.responseVersion === 2)?.isLatest,
    true,
  );

  const counterAfterRevisionSubmit = await harness.rebuildCounter(
    proposition.id,
    "2026-04-16T00:01:05.000Z",
  );
  assert.equal(counterAfterRevisionSubmit.validCount, 0);
  assert.equal(counterAfterRevisionSubmit.partialValidCount, 0);
  assert.equal(counterAfterRevisionSubmit.invalidCount, 0);

  const revisedResponse = await harness.responseRepository.getById(
    revision.responseId,
  );
  assert.ok(revisedResponse);
  const revisedReview = await harness.finalizeReview(
    proposition.id,
    revisedResponse.id,
    "2026-04-16T00:01:10.000Z",
  );
  await harness.finalizeRewardForLatest(
    proposition.id,
    firstResponse,
    "valid",
    "2026-04-16T00:01:11.000Z",
    false,
  );

  const userTwoSubmit = await harness.submitResponse(
    "user-2",
    task2.id,
    "2026-04-16T00:01:15.000Z",
    1,
  );
  const userTwoResponse = await harness.responseRepository.getById(
    userTwoSubmit.responseId,
  );
  assert.ok(userTwoResponse);
  const userTwoReview = await harness.finalizeReview(
    proposition.id,
    userTwoResponse.id,
    "2026-04-16T00:01:20.000Z",
  );

  const finalCounter = await harness.rebuildCounter(
    proposition.id,
    "2026-04-16T00:01:25.000Z",
  );
  assert.equal(finalCounter.validCount, 2);

  await harness.placeBet(
    proposition.id,
    market.id,
    "user-1",
    1,
    "12",
    "2026-04-16T00:01:26.000Z",
  );
  await harness.placeBet(
    proposition.id,
    market.id,
    "user-3",
    0,
    "10",
    "2026-04-16T00:01:27.000Z",
  );

  const aggregate = await harness.buildAggregate(proposition.id);
  assert.equal(aggregate.resultKind, "resolved");
  assert.equal(aggregate.winningOption, 1);

  await harness.freezeProposition(
    proposition.id,
    "2026-04-16T00:01:30.000Z",
  );
  await harness.marketEngine.freezeForReveal({
    marketId: market.id,
    frozenAt: "2026-04-16T00:01:30.000Z",
  });
  await harness.startReveal(
    proposition.id,
    "2026-04-16T00:01:35.000Z",
  );
  await harness.recordOfficialResult(
    proposition.id,
    aggregate,
    "2026-04-16T00:01:40.000Z",
  );

  const settlement = await harness.settlementEngine.finalize({
    propositionId: proposition.id,
    marketId: market.id,
    resultKind: aggregate.resultKind,
    winningOption: aggregate.winningOption,
    voidReason: aggregate.voidReason,
    platformFeeBps: 0,
    settledAt: "2026-04-16T00:01:45.000Z",
  });
  await harness.settleProposition(
    proposition.id,
    "2026-04-16T00:01:45.000Z",
    "settled",
  );

  const latestLedger = await harness.finalizeRewardForLatest(
    proposition.id,
    revisedResponse,
    revisedReview.review.status,
    "2026-04-16T00:01:46.000Z",
  );
  await harness.finalizeRewardForLatest(
    proposition.id,
    userTwoResponse,
    userTwoReview.review.status,
    "2026-04-16T00:01:47.000Z",
  );
  const currentLedger = await harness.getRewardLedger(proposition.id, "user-1");
  const summary = await harness.resultSurface.getResultSummary(
    proposition.id,
    "user-1",
  );

  assert.equal(revisionDuplicate.responseId, revision.responseId);
  assert.equal(currentLedger?.responseId, revisedResponse.id);
  assert.equal(harness.rewardLedgerRepository.snapshot().length, 3);
  assert.equal(settlement.positions.find((p) => p.userId === "user-1")?.settlementOutcome, "won");
  assert.equal(latestLedger.status, "finalized");
  assert.equal(summary.currentUserRewardStatus, "finalized");
  assert.equal(summary.currentUserSettlementOutcome, "won");
});

test("result surface is only readable after settlement-class statuses", async () => {
  const liveProposition = buildLiveProposition({ id: "proposition-live-check" });
  const liveHarness = createE2EHarness(liveProposition);

  await assert.rejects(
    () => liveHarness.resultSurface.getResultSummary(liveProposition.id),
    (error: unknown) => error instanceof ResultSummaryNotAvailableError,
  );

  const closedHarness = createE2EHarness(
    buildResolvedProposition({
      id: "proposition-closed-check",
      status: "closed",
      resultKind: "resolved",
      winningOption: 0,
      settledAt: "2026-04-16T00:10:00.000Z",
      closedAt: "2026-04-16T00:11:00.000Z",
    }),
  );

  const summary = await closedHarness.resultSurface.getResultSummary(
    "proposition-closed-check",
  );
  assert.equal(summary.propositionId, "proposition-closed-check");
});
