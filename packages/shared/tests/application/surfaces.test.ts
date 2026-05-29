import assert from "node:assert/strict";
import test from "node:test";

import { PositionAlreadyExistsError } from "../../src/arena/validation/errors.js";
import { ResultSummaryNotAvailableError } from "../../src/arena/application/errors.js";
import {
  buildDispatchCandidate,
  buildLiveProposition,
  createApplicationHarness,
  createRewardLedger,
  createSettledMarket,
  createSettledPosition,
  setCounter,
} from "./memory-harness.js";

const TEST_CHAIN_ID = 31337;

test("adjudication surface lists only the user's tasks and blocks non-owner task reads", async () => {
  const proposition = buildLiveProposition();
  const harness = createApplicationHarness(proposition);

  const userOneTask = await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-1" }),
    proposition,
    "2026-04-16T00:00:10.000Z",
  );
  await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-2" }),
    proposition,
    "2026-04-16T00:00:20.000Z",
  );

  const views = await harness.adjudicationSurface.listTasksForUser("user-1");
  assert.equal(views.length, 1);
  assert.equal(views[0].taskId, userOneTask.id);
  assert.equal(views[0].publicProgress.propositionId, proposition.id);
  assert.equal("marketStatus" in views[0], false);
  assert.equal("odds" in views[0], false);

  const ownerView = await harness.adjudicationSurface.getTaskForUser(
    userOneTask.id,
    "user-1",
  );
  const otherUserView = await harness.adjudicationSurface.getTaskForUser(
    userOneTask.id,
    "user-2",
  );

  assert.equal(ownerView?.taskId, userOneTask.id);
  assert.equal(otherUserView, null);
});

test("submitResponseForUser returns refreshed task view and records pending reward ledger without duplicates", async () => {
  const proposition = buildLiveProposition({
    rewardBudget: "10",
    baseResponseReward: "5",
  });
  const harness = createApplicationHarness(proposition);
  const task = await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-1" }),
    proposition,
    "2026-04-16T00:00:10.000Z",
  );

  const first = await harness.adjudicationSurface.submitResponseForUser({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "user-1",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-16T00:00:20.000Z",
    clientSubmittedAt: "2026-04-16T00:00:35.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:00:35.000Z",
  });

  assert.equal(first.duplicateRetry, false);
  assert.equal(first.reviewRequested, true);
  assert.equal(first.taskView.rewardStatus, "pending");
  assert.equal(first.taskView.rewardPendingAmount, "5");
  assert.equal(harness.rewardLedgerRepository.snapshot().length, 1);

  const duplicate = await harness.adjudicationSurface.submitResponseForUser({
    propositionId: proposition.id,
    taskId: task.id,
    userId: "user-1",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-16T00:00:20.000Z",
    clientSubmittedAt: "2026-04-16T00:00:35.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:00:35.000Z",
  });

  assert.equal(duplicate.duplicateRetry, true);
  assert.equal(harness.rewardLedgerRepository.snapshot().length, 1);
});

test("validation surface returns progress-only market views and placeBetForUser returns the user's receipt", async () => {
  const proposition = buildLiveProposition({
    minBetAmount: "100",
    minEffectiveSample: 4,
    liveAt: "2026-04-16T00:00:00.000Z",
    maxDurationSeconds: 400,
  });
  const harness = createApplicationHarness(
    proposition,
    "2026-04-16T00:03:20.000Z",
  );
  await harness.marketEngine.ensureForProposition(proposition.id);
  const market = await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: proposition.liveAt!,
  });
  await setCounter(harness.counterRepository, proposition.id, {
    validCount: 1,
    partialValidCount: 1,
  });

  const listViews = await harness.validationSurface.listMarkets();
  assert.equal(listViews.length, 1);
  assert.equal(listViews[0].marketId, market.id);
  assert.equal(listViews[0].minBetAmount, "100");
  assert.equal(listViews[0].publicProgress.progress.progressPercent, 50);
  assert.equal("totalPool" in listViews[0], false);
  assert.equal("odds" in listViews[0], false);
  assert.equal("winningOption" in listViews[0], false);

  const prepared = await harness.validationSurface.prepareBetForUser({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "user-1",
    chainId: TEST_CHAIN_ID,
    selectedOption: 0,
    stakeAmount: "150",
    placedAt: "2026-04-16T00:03:30.000Z",
  });

  assert.equal(prepared.marketView.marketId, market.id);
  assert.equal(prepared.execution.mode, "wallet_direct_contract_write");
  assert.equal(prepared.execution.stage, "session_validated");
  assert.equal(prepared.execution.chainId, TEST_CHAIN_ID);
  assert.equal(prepared.transaction.chainId, TEST_CHAIN_ID);
  assert.equal(prepared.transaction.selectedOption, 0);
  assert.equal(prepared.transaction.stakeAmount, "150");
  assert.equal(typeof prepared.transaction.to, "string");
  assert.equal(typeof prepared.transaction.data, "string");

  const placed = await harness.validationSurface.placeBetForUser({
    propositionId: proposition.id,
    marketId: market.id,
    userId: "user-1",
    chainId: TEST_CHAIN_ID,
    selectedOption: 0,
    stakeAmount: "150",
    placedAt: "2026-04-16T00:03:30.000Z",
  });

  assert.equal(placed.marketView.currentUserPosition?.stakeAmount, "150");
  assert.equal(placed.marketView.minBetAmount, "100");
  assert.equal(placed.marketView.currentUserPosition?.grossPayout, null);
  assert.equal(placed.positionId.length > 0, true);
  assert.equal(placed.execution.mode, "wallet_authenticated_account_write");
  assert.equal(placed.execution.stage, "position_recorded");
  assert.equal(placed.execution.chainId, TEST_CHAIN_ID);
  assert.equal(placed.execution.txHash, null);

  const singleMarket = await harness.validationSurface.getMarket(market.id, "user-1");
  assert.equal(singleMarket?.currentUserPosition?.stakeAmount, "150");
  assert.equal(singleMarket?.currentUserPosition?.grossPayout, null);

  await assert.rejects(
    () =>
      harness.validationSurface.placeBetForUser({
        propositionId: proposition.id,
        marketId: market.id,
        userId: "user-1",
        chainId: TEST_CHAIN_ID,
        selectedOption: 1,
        stakeAmount: "150",
        placedAt: "2026-04-16T00:03:40.000Z",
      }),
    (error: unknown) => error instanceof PositionAlreadyExistsError,
  );
});

test("result surface rejects live propositions and returns settled summaries with reward and settlement status", async () => {
  const liveProposition = buildLiveProposition();
  const liveHarness = createApplicationHarness(liveProposition);

  await assert.rejects(
    () => liveHarness.resultSurface.getResultSummary(liveProposition.id, "user-1"),
    (error: unknown) => error instanceof ResultSummaryNotAvailableError,
  );

  const settledStatuses = ["settled", "closed", "archived"] as const;
  for (const status of settledStatuses) {
    const proposition = buildLiveProposition({
      id: `proposition-${status}`,
      status,
      resultKind: "resolved",
      winningOption: 0,
      voidReason: null,
      settledAt: "2026-04-16T00:10:00.000Z",
      closedAt: status === "closed" ? "2026-04-16T00:11:00.000Z" : null,
      archivedAt: status === "archived" ? "2026-04-16T00:12:00.000Z" : null,
    });
    const harness = createApplicationHarness(proposition);
    await harness.marketRepository.create(createSettledMarket(proposition));
    await harness.positionRepository.create(
      createSettledPosition(proposition, "market-1"),
    );
    await harness.rewardLedgerRepository.create(createRewardLedger(proposition));

    const summary = await harness.resultSurface.getResultSummary(
      proposition.id,
      "user-1",
    );

    assert.equal(summary.propositionId, proposition.id);
    assert.equal(summary.currentUserRewardStatus, "finalized");
    assert.equal(summary.currentUserSettlementOutcome, "won");
    assert.equal(summary.winningOption, 0);
  }
});

test("application surfaces use the shared clock for timeRemainingSeconds and timeProgress", async () => {
  const proposition = buildLiveProposition({
    liveAt: "2026-04-16T00:00:00.000Z",
    maxDurationSeconds: 400,
  });
  const harness = createApplicationHarness(
    proposition,
    "2026-04-16T00:01:40.000Z",
  );
  const task = await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-1" }),
    proposition,
    "2026-04-16T00:00:10.000Z",
  );
  await harness.marketEngine.ensureForProposition(proposition.id);
  const market = await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: proposition.liveAt!,
  });
  await setCounter(harness.counterRepository, proposition.id, {
    validCount: 1,
    partialValidCount: 0,
  });

  const firstTaskView = await harness.adjudicationSurface.getTaskForUser(
    task.id,
    "user-1",
  );
  const firstMarketView = await harness.validationSurface.getMarket(market.id);

  harness.clock.set("2026-04-16T00:03:20.000Z");

  const secondTaskView = await harness.adjudicationSurface.getTaskForUser(
    task.id,
    "user-1",
  );
  const secondMarketView = await harness.validationSurface.getMarket(market.id);

  assert.ok(
    (firstTaskView?.timeRemainingSeconds ?? 0) >
      (secondTaskView?.timeRemainingSeconds ?? 0),
  );
  assert.ok(
    (firstMarketView?.timeProgressPercent ?? 0) <
      (secondMarketView?.timeProgressPercent ?? 0),
  );
});
