import assert from "node:assert/strict";
import test from "node:test";

import {
  ARENA_EXECUTABLE_SAMPLE_CONSTRAINTS,
  PropositionPolicyError,
  assertReadyForLivePublication,
  assertSupportedMvpPropositionDraftInput,
  buildPropositionRuntimeSnapshot,
} from "../../src/arena/proposition/index.js";
import { buildLiveProposition } from "../adjudication/memory-harness.js";
import { createSettledMarket } from "../application/memory-harness.js";

test("mvp proposition draft policy accepts binary non_rolling single-question input", () => {
  assert.doesNotThrow(() =>
    assertSupportedMvpPropositionDraftInput({
      title: "Will A happen?",
      description: "Binary consensus proposition",
      options: ["A", "B"],
      minEffectiveSample: 3,
      minBetAmount: "10",
      minDurationSeconds: 60,
      maxDurationSeconds: 3600,
      rewardBudget: "100",
      baseResponseReward: "5",
      marketEnabled: true,
    }),
  );
});

test("mvp proposition draft policy rejects rolling and survey extensions", () => {
  assert.throws(
    () =>
      assertSupportedMvpPropositionDraftInput({
        title: "Will A happen?",
        description: "Binary consensus proposition",
        options: ["A", "B"],
        minEffectiveSample: 3,
        minBetAmount: "10",
        minDurationSeconds: 60,
        maxDurationSeconds: 3600,
        rewardBudget: "100",
        baseResponseReward: "5",
        marketEnabled: true,
        rollingMode: "rolling",
      }),
    (error: unknown) =>
      error instanceof PropositionPolicyError &&
      error.code === "proposition.unsupported_rolling_mode",
  );

  assert.throws(
    () =>
      assertSupportedMvpPropositionDraftInput({
        title: "Will A happen?",
        description: "Binary consensus proposition",
        options: ["A", "B"],
        minEffectiveSample: 3,
        minBetAmount: "10",
        minDurationSeconds: 60,
        maxDurationSeconds: 3600,
        rewardBudget: "100",
        baseResponseReward: "5",
        marketEnabled: true,
        questions: [{ id: "q1" }],
      }),
    (error: unknown) =>
      error instanceof PropositionPolicyError &&
      error.code === "proposition.unsupported_multi_question",
  );
});

test("mvp proposition draft policy accepts supported executable sample constraints only", () => {
  assert.doesNotThrow(() =>
    assertSupportedMvpPropositionDraftInput({
      title: "Will A happen?",
      description: "Binary consensus proposition",
      options: ["A", "B"],
      sampleConstraints: [
        "experienced_user",
        "wallet_signed",
        ARENA_EXECUTABLE_SAMPLE_CONSTRAINTS[0],
      ],
      minEffectiveSample: 3,
      minBetAmount: "10",
      minDurationSeconds: 60,
      maxDurationSeconds: 3600,
      rewardBudget: "100",
      baseResponseReward: "5",
      marketEnabled: true,
    }),
  );

  assert.throws(
    () =>
      assertSupportedMvpPropositionDraftInput({
        title: "Will A happen?",
        description: "Binary consensus proposition",
        options: ["A", "B"],
        sampleConstraints: ["verified_human"],
        minEffectiveSample: 3,
        minBetAmount: "10",
        minDurationSeconds: 60,
        maxDurationSeconds: 3600,
        rewardBudget: "100",
        baseResponseReward: "5",
        marketEnabled: true,
      }),
    (error: unknown) =>
      error instanceof PropositionPolicyError &&
      error.code === "proposition.unsupported_sample_constraint",
  );
});

test("runtime snapshot keeps a stable MVP structure", () => {
  const proposition = buildLiveProposition({
    marketEnabled: true,
  });
  const market = createSettledMarket(proposition, {
    id: "market-runtime",
    status: "live",
    settledAt: null,
    settlingAt: null,
  });

  const snapshot = buildPropositionRuntimeSnapshot({
    proposition,
    market,
  });

  assert.deepEqual(snapshot, {
    propositionId: proposition.id,
    type: "consensus",
    structure: "binary",
    rollingMode: "non_rolling",
    settlementTarget: "final",
    category: "general",
    title: proposition.title,
    description: proposition.description,
    options: proposition.options,
    marketEnabled: true,
    status: "live",
    timeRules: {
      publishedAt: proposition.publishedAt,
      liveAt: proposition.liveAt,
      minDurationSeconds: proposition.minDurationSeconds,
      maxDurationSeconds: proposition.maxDurationSeconds,
    },
    sampleRules: {
      minEffectiveSample: proposition.minEffectiveSample,
      sampleConstraints: proposition.sampleConstraints,
    },
    rewardPolicy: {
      rewardBudget: proposition.rewardBudget,
      baseResponseReward: proposition.baseResponseReward,
    },
    validationRuntime: {
      enabled: true,
      marketId: "market-runtime",
      marketStatus: "live",
    },
  });
});

test("live readiness requires market-disabled propositions to stay market-free", () => {
  const proposition = buildLiveProposition({
    status: "scheduled",
    marketEnabled: false,
    liveAt: null,
  });
  const market = createSettledMarket(proposition, {
    settledAt: null,
    settlingAt: null,
    status: "pre_live",
  });

  assert.throws(
    () =>
      assertReadyForLivePublication(
        proposition,
        "2026-04-16T00:10:00.000Z",
        market,
      ),
    (error: unknown) =>
      error instanceof PropositionPolicyError &&
      error.code === "proposition.market_disabled_conflict",
  );
});
