import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveProposition,
  buildMarketPublicSnapshot,
  buildValidationMarketViewModel,
  createValidationHarness,
  setCounter,
} from "./memory-harness.js";

const TEST_CHAIN_ID = 31337;

test("market public snapshot exposes only progress data and view model hides payouts before settled", async () => {
  const proposition = buildLiveProposition({
    minBetAmount: "100",
    minEffectiveSample: 4,
    liveAt: "2026-04-16T00:00:00.000Z",
    maxDurationSeconds: 400,
  });
  const harness = createValidationHarness(proposition);
  const ensuredMarket = await harness.marketEngine.ensureForProposition(proposition.id);
  const liveMarket = await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: proposition.liveAt!,
  });

  await harness.marketEngine.placeBet({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    userId: "user-1",
    chainId: TEST_CHAIN_ID,
    selectedOption: 0,
    stakeAmount: "150",
    placedAt: "2026-04-16T00:01:00.000Z",
  });

  await setCounter(harness.counterRepository, proposition.id, {
    validCount: 1,
    partialValidCount: 1,
  });

  const currentUserPosition = await harness.positionRepository.findByMarketAndUser(
    liveMarket.id,
    "user-1",
  );
  const counter = await harness.counterRepository.getByPropositionId(proposition.id);
  const snapshot = buildMarketPublicSnapshot({
    proposition,
    market: liveMarket,
    counter,
    currentUserPosition,
    now: "2026-04-16T00:03:20.000Z",
  });

  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "totalPool"), false);
  assert.equal(snapshot.marketStatus, "live");
  assert.equal(snapshot.canBet, true);
  assert.equal(snapshot.publicProgress.progress.progressPercent, 50);
  assert.equal(snapshot.timeProgressPercent, 50);
  assert.equal(snapshot.bettingClosesAt, "2026-04-16T00:06:40.000Z");
  assert.equal("validCount" in snapshot.publicProgress, false);

  const view = buildValidationMarketViewModel({
    proposition,
    market: liveMarket,
    counter,
    currentUserPosition,
    now: "2026-04-16T00:03:20.000Z",
  });

  assert.equal(view.minBetAmount, "100");
  assert.equal(view.currentUserPosition?.stakeAmount, "150");
  assert.equal(view.currentUserPosition?.grossPayout, null);
  assert.equal(view.publicProgress.progress.currentEffectiveSample, 2);
  assert.equal("odds" in view, false);
  assert.equal("totalPool" in view, false);
  assert.equal("latestResponseStatus" in view, false);
  assert.equal("rewardStatus" in view, false);
  assert.equal("rewardPendingAmount" in view, false);
  assert.equal("rewardFinalAmount" in view, false);
  assert.equal("reviewOutcomeByOption" in view, false);
  assert.equal("marketBias" in view, false);
  assert.equal(ensuredMarket.status, "pre_live");
});

test("resolved settlement applies pari-mutuel payouts and reports rounding remainder", async () => {
  const proposition = buildLiveProposition({ minBetAmount: "1" });
  const harness = createValidationHarness(proposition);
  await harness.marketEngine.ensureForProposition(proposition.id);
  const liveMarket = await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: "2026-04-16T00:00:00.000Z",
  });

  await harness.marketEngine.placeBet({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    userId: "winner-a",
    chainId: TEST_CHAIN_ID,
    selectedOption: 0,
    stakeAmount: "1",
    placedAt: "2026-04-16T00:01:00.000Z",
  });
  await harness.marketEngine.placeBet({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    userId: "winner-b",
    chainId: TEST_CHAIN_ID,
    selectedOption: 0,
    stakeAmount: "1",
    placedAt: "2026-04-16T00:01:10.000Z",
  });
  await harness.marketEngine.placeBet({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    userId: "loser-a",
    chainId: TEST_CHAIN_ID,
    selectedOption: 1,
    stakeAmount: "1",
    placedAt: "2026-04-16T00:01:20.000Z",
  });

  harness.propositionStore.set({
    ...proposition,
    status: "frozen",
    frozenAt: "2026-04-16T00:02:00.000Z",
  });
  await harness.marketEngine.freezeForReveal({
    marketId: liveMarket.id,
    frozenAt: "2026-04-16T00:02:00.000Z",
  });
  harness.propositionStore.set({
    ...proposition,
    status: "revealing",
    frozenAt: "2026-04-16T00:02:00.000Z",
    revealStartedAt: "2026-04-16T00:02:10.000Z",
  });

  const result = await harness.settlementEngine.finalize({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    resultKind: "resolved",
    winningOption: 0,
    voidReason: null,
    platformFeeBps: 0,
    settledAt: "2026-04-16T00:03:00.000Z",
  });

  assert.equal(result.market.status, "settled");
  assert.equal(result.totalPool, "3");
  assert.equal(result.winningPool, "2");
  assert.equal(result.platformFeeAmount, "0");
  assert.equal(result.distributablePool, "3");
  assert.equal(result.roundingRemainder, "1");

  const winners = result.positions.filter((position) => position.settlementOutcome === "won");
  const loser = result.positions.find((position) => position.settlementOutcome === "lost");
  assert.equal(winners.length, 2);
  assert.ok(winners.every((position) => position.grossPayout === "1"));
  assert.ok(winners.every((position) => position.pnl === "0"));
  assert.equal(loser?.grossPayout, "0");
  assert.equal(loser?.pnl, "-1");
});

test("resolved settlement applies fee and void settlement refunds everyone", async () => {
  const proposition = buildLiveProposition({ minBetAmount: "1" });
  const harness = createValidationHarness(proposition);
  await harness.marketEngine.ensureForProposition(proposition.id);
  const liveMarket = await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: "2026-04-16T00:00:00.000Z",
  });

  await harness.marketEngine.placeBet({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    userId: "winner-a",
    chainId: TEST_CHAIN_ID,
    selectedOption: 0,
    stakeAmount: "30",
    placedAt: "2026-04-16T00:01:00.000Z",
  });
  await harness.marketEngine.placeBet({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    userId: "winner-b",
    chainId: TEST_CHAIN_ID,
    selectedOption: 0,
    stakeAmount: "20",
    placedAt: "2026-04-16T00:01:10.000Z",
  });
  await harness.marketEngine.placeBet({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    userId: "loser-a",
    chainId: TEST_CHAIN_ID,
    selectedOption: 1,
    stakeAmount: "50",
    placedAt: "2026-04-16T00:01:20.000Z",
  });

  harness.propositionStore.set({
    ...proposition,
    status: "frozen",
    frozenAt: "2026-04-16T00:02:00.000Z",
  });
  await harness.marketEngine.freezeForReveal({
    marketId: liveMarket.id,
    frozenAt: "2026-04-16T00:02:00.000Z",
  });
  harness.propositionStore.set({
    ...proposition,
    status: "revealing",
    frozenAt: "2026-04-16T00:02:00.000Z",
    revealStartedAt: "2026-04-16T00:02:10.000Z",
  });

  const resolved = await harness.settlementEngine.finalize({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    resultKind: "resolved",
    winningOption: 0,
    voidReason: null,
    platformFeeBps: 500,
    settledAt: "2026-04-16T00:03:00.000Z",
  });

  assert.equal(resolved.platformFeeAmount, "5");
  assert.equal(resolved.distributablePool, "95");
  assert.equal(resolved.roundingRemainder, "0");
  assert.deepEqual(
    resolved.positions
      .filter((position) => position.settlementOutcome === "won")
      .map((position) => ({
        userId: position.userId,
        payout: position.grossPayout,
        pnl: position.pnl,
      })),
    [
      { userId: "winner-a", payout: "57", pnl: "27" },
      { userId: "winner-b", payout: "38", pnl: "18" },
    ],
  );

  const voidProposition = buildLiveProposition({
    id: "proposition-void",
    minBetAmount: "1",
  });
  const voidHarness = createValidationHarness(voidProposition);
  await voidHarness.marketEngine.ensureForProposition(voidProposition.id);
  const voidMarket = await voidHarness.marketEngine.openForLive({
    propositionId: voidProposition.id,
    liveAt: "2026-04-16T00:00:00.000Z",
  });
  await voidHarness.marketEngine.placeBet({
    propositionId: voidProposition.id,
    marketId: voidMarket.id,
    userId: "user-1",
    chainId: TEST_CHAIN_ID,
    selectedOption: 0,
    stakeAmount: "12",
    placedAt: "2026-04-16T00:01:00.000Z",
  });
  await voidHarness.marketEngine.placeBet({
    propositionId: voidProposition.id,
    marketId: voidMarket.id,
    userId: "user-2",
    chainId: TEST_CHAIN_ID,
    selectedOption: 1,
    stakeAmount: "8",
    placedAt: "2026-04-16T00:01:10.000Z",
  });

  voidHarness.propositionStore.set({
    ...voidProposition,
    status: "frozen",
    frozenAt: "2026-04-16T00:02:00.000Z",
  });
  await voidHarness.marketEngine.freezeForReveal({
    marketId: voidMarket.id,
    frozenAt: "2026-04-16T00:02:00.000Z",
  });
  voidHarness.propositionStore.set({
    ...voidProposition,
    status: "revealing",
    frozenAt: "2026-04-16T00:02:00.000Z",
    revealStartedAt: "2026-04-16T00:02:10.000Z",
  });

  const voidResult = await voidHarness.settlementEngine.finalize({
    propositionId: voidProposition.id,
    marketId: voidMarket.id,
    resultKind: "void",
    winningOption: null,
    voidReason: "insufficient_sample",
    platformFeeBps: 500,
    settledAt: "2026-04-16T00:03:00.000Z",
  });

  assert.equal(voidResult.market.status, "settled");
  assert.equal(voidResult.platformFeeAmount, "0");
  assert.ok(
    voidResult.positions.every(
      (position) =>
        position.settlementOutcome === "refund" &&
        position.grossPayout === position.stakeAmount &&
        position.pnl === "0" &&
        position.refundAmount === position.stakeAmount,
    ),
  );
});
