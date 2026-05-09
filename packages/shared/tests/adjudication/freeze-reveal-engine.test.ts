import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFreezeRevealReadiness } from "../../src/arena/adjudication/freeze-reveal-engine.js";
import { buildLiveProposition } from "./memory-harness.js";

const buildCounterSnapshot = (overrides: Record<string, unknown> = {}) => ({
  propositionId: "proposition-1",
  totalResponses: 2,
  reviewedResponses: 2,
  validCount: 2,
  partialValidCount: 0,
  invalidCount: 0,
  effectiveSampleCount: 2,
  currentProgress: 1,
  hasReachedMinEffectiveSample: true,
  updatedAt: "2026-04-16T00:10:00.000Z",
  ...overrides,
});

test("freeze reveal readiness stays not_ready before minDuration and maxDuration", () => {
  const readiness = evaluateFreezeRevealReadiness({
    proposition: buildLiveProposition({
      liveAt: "2026-04-16T00:00:00.000Z",
      minDurationSeconds: 120,
      maxDurationSeconds: 600,
    }),
    counterSnapshot: buildCounterSnapshot(),
    now: "2026-04-16T00:01:00.000Z",
  });

  assert.equal(readiness.minDurationReached, false);
  assert.equal(readiness.maxDurationReached, false);
  assert.equal(readiness.isReadyToFreeze, false);
  assert.equal(readiness.triggerReason, "not_ready");
});

test("freeze reveal readiness becomes ready when minDuration and min sample are both reached", () => {
  const readiness = evaluateFreezeRevealReadiness({
    proposition: buildLiveProposition({
      liveAt: "2026-04-16T00:00:00.000Z",
      minDurationSeconds: 120,
      maxDurationSeconds: 600,
    }),
    counterSnapshot: buildCounterSnapshot({
      effectiveSampleCount: 3,
      currentProgress: 1,
      hasReachedMinEffectiveSample: true,
    }),
    now: "2026-04-16T00:02:00.000Z",
  });

  assert.equal(readiness.minDurationReached, true);
  assert.equal(readiness.maxDurationReached, false);
  assert.equal(readiness.hasReachedMinEffectiveSample, true);
  assert.equal(readiness.isReadyToFreeze, true);
  assert.equal(readiness.triggerReason, "min_duration_and_sample_reached");
});

test("freeze reveal readiness becomes ready at maxDuration even without enough sample", () => {
  const readiness = evaluateFreezeRevealReadiness({
    proposition: buildLiveProposition({
      liveAt: "2026-04-16T00:00:00.000Z",
      minDurationSeconds: 120,
      maxDurationSeconds: 600,
      minEffectiveSample: 3,
    }),
    counterSnapshot: buildCounterSnapshot({
      effectiveSampleCount: 1,
      currentProgress: 1 / 3,
      hasReachedMinEffectiveSample: false,
      validCount: 1,
      reviewedResponses: 1,
      totalResponses: 1,
    }),
    now: "2026-04-16T00:10:00.000Z",
  });

  assert.equal(readiness.minDurationReached, true);
  assert.equal(readiness.maxDurationReached, true);
  assert.equal(readiness.hasReachedMinEffectiveSample, false);
  assert.equal(readiness.isReadyToFreeze, true);
  assert.equal(readiness.triggerReason, "max_duration_reached");
});
