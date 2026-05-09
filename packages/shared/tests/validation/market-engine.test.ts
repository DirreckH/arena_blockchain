import assert from "node:assert/strict";
import test from "node:test";

import {
  BetBelowMinimumError,
  InvalidMarketTransitionError,
  MarketFrozenForRevealError,
  MarketNotLiveError,
  PositionAlreadyExistsError,
} from "../../src/arena/validation/errors.js";
import { buildLiveProposition, createValidationHarness } from "./memory-harness.js";

const TEST_CHAIN_ID = 31337;

test("ensureForProposition creates one pre_live market and is idempotent", async () => {
  const proposition = buildLiveProposition({ minBetAmount: "100" });
  const { marketEngine, marketRepository } = createValidationHarness(proposition);

  const first = await marketEngine.ensureForProposition(proposition.id);
  const second = await marketEngine.ensureForProposition(proposition.id);

  assert.equal(first.status, "pre_live");
  assert.equal(first.id, second.id);
  assert.equal((await marketRepository.list()).length, 1);
});

test("openForLive and freezeForReveal enforce lifecycle alignment", async () => {
  const proposition = buildLiveProposition({ minBetAmount: "100" });
  const harness = createValidationHarness(proposition);
  const market = await harness.marketEngine.ensureForProposition(proposition.id);

  const liveMarket = await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: "2026-04-16T00:05:00.000Z",
  });
  assert.equal(liveMarket.status, "live");
  assert.equal(liveMarket.liveAt, "2026-04-16T00:05:00.000Z");

  harness.propositionStore.set({
    ...proposition,
    status: "frozen",
    frozenAt: "2026-04-16T00:30:00.000Z",
  });

  const frozenMarket = await harness.marketEngine.freezeForReveal({
    marketId: market.id,
    frozenAt: "2026-04-16T00:30:00.000Z",
  });
  assert.equal(frozenMarket.status, "frozen_for_reveal");

  await assert.rejects(
    () =>
      harness.marketEngine.freezeForReveal({
        marketId: market.id,
        frozenAt: "2026-04-16T00:31:00.000Z",
      }),
    (error: unknown) => error instanceof InvalidMarketTransitionError,
  );
});

test("placeBet accepts one position and blocks repeats, low bets and non-live markets", async () => {
  const proposition = buildLiveProposition({ minBetAmount: "100" });
  const harness = createValidationHarness(proposition);

  await harness.marketEngine.ensureForProposition(proposition.id);
  const liveMarket = await harness.marketEngine.openForLive({
    propositionId: proposition.id,
    liveAt: "2026-04-16T00:05:00.000Z",
  });

  const first = await harness.marketEngine.placeBet({
    propositionId: proposition.id,
    marketId: liveMarket.id,
    userId: "user-1",
    chainId: TEST_CHAIN_ID,
    selectedOption: 0,
    stakeAmount: "150",
    placedAt: "2026-04-16T00:10:00.000Z",
  });
  assert.equal(first.stakeAmount, "150");

  await assert.rejects(
    () =>
      harness.marketEngine.placeBet({
        propositionId: proposition.id,
        marketId: liveMarket.id,
        userId: "user-1",
        chainId: TEST_CHAIN_ID,
        selectedOption: 1,
        stakeAmount: "200",
        placedAt: "2026-04-16T00:11:00.000Z",
      }),
    (error: unknown) => error instanceof PositionAlreadyExistsError,
  );

  await assert.rejects(
    () =>
      harness.marketEngine.placeBet({
        propositionId: proposition.id,
        marketId: liveMarket.id,
        userId: "user-2",
        chainId: TEST_CHAIN_ID,
        selectedOption: 1,
        stakeAmount: "99",
        placedAt: "2026-04-16T00:12:00.000Z",
      }),
    (error: unknown) => error instanceof BetBelowMinimumError,
  );

  harness.propositionStore.set({
    ...proposition,
    status: "frozen",
    frozenAt: "2026-04-16T00:20:00.000Z",
  });

  await assert.rejects(
    () =>
      harness.marketEngine.placeBet({
        propositionId: proposition.id,
        marketId: liveMarket.id,
        userId: "user-3",
        chainId: TEST_CHAIN_ID,
        selectedOption: 0,
        stakeAmount: "120",
        placedAt: "2026-04-16T00:21:00.000Z",
      }),
    (error: unknown) => error instanceof MarketFrozenForRevealError,
  );

  harness.propositionStore.set({
    ...proposition,
    status: "live",
    revealStartedAt: null,
  });
  await harness.marketRepository.update({
    ...liveMarket,
    status: "pre_live",
  });

  await assert.rejects(
    () =>
      harness.marketEngine.placeBet({
        propositionId: proposition.id,
        marketId: liveMarket.id,
        userId: "user-4",
        chainId: TEST_CHAIN_ID,
        selectedOption: 1,
        stakeAmount: "120",
        placedAt: "2026-04-16T00:22:00.000Z",
      }),
    (error: unknown) => error instanceof MarketNotLiveError,
  );
});
