import assert from "node:assert/strict";
import test from "node:test";

import { buildAdjudicationAggregate } from "../../src/arena/adjudication/aggregate-engine.js";
import {
  buildAdjudicationTaskViewModel,
  buildRespondentTaskViewModel,
} from "../../src/arena/adjudication/view-builders.js";
import { buildPublicProgressViewModel } from "../../src/arena/application/public-progress.js";
import { buildLiveProposition } from "./memory-harness.js";
import type {
  DispatchTask,
  EffectiveSampleCounter,
  Response,
  ResponseReview,
} from "../../src/arena/entities.js";

const buildTask = (overrides: Partial<DispatchTask> = {}): DispatchTask => ({
  id: "task-1",
  propositionId: "proposition-1",
  userId: "user-1",
  status: "submitted",
  assignedAt: "2026-04-16T00:00:00.000Z",
  startedAt: "2026-04-16T00:01:00.000Z",
  submittedAt: "2026-04-16T00:02:00.000Z",
  expiresAt: "2026-04-16T01:00:00.000Z",
  skipReason: null,
  expiryReason: null,
  cooldownUntil: null,
  ...overrides,
});

const buildResponse = (
  id: string,
  userId: string,
  selectedOption: 0 | 1,
): Response => ({
  id,
  propositionId: "proposition-1",
  taskId: `task-${userId}`,
  userId,
  responseVersion: 1,
  isLatest: true,
  selectedOption,
  confirmationOption: selectedOption,
  clientStartedAt: "2026-04-16T00:10:00.000Z",
  clientSubmittedAt: "2026-04-16T00:10:20.000Z",
  understandingAck: true,
  submittedAt: "2026-04-16T00:10:20.000Z",
});

const buildReview = (
  responseId: string,
  status: "valid" | "partial_valid" | "invalid",
): ResponseReview => ({
  id: `review-${responseId}`,
  responseId,
  status,
  qualityScore: status === "valid" ? 100 : status === "partial_valid" ? 60 : 0,
  flags: [],
  reasonCodes: [],
  reviewedByUserId: null,
  reviewedAt: "2026-04-16T00:11:00.000Z",
});

test("aggregate resolves winner, tie and insufficient sample", () => {
  const proposition = buildLiveProposition({ minEffectiveSample: 2 });
  const responses = [
    buildResponse("r1", "user-1", 0),
    buildResponse("r2", "user-2", 0),
    buildResponse("r3", "user-3", 1),
  ];
  const reviews = [
    buildReview("r1", "valid"),
    buildReview("r2", "partial_valid"),
    buildReview("r3", "valid"),
  ];
  const counter: EffectiveSampleCounter = {
    id: "counter-1",
    propositionId: proposition.id,
    totalResponses: 3,
    reviewedResponses: 3,
    validCount: 2,
    partialValidCount: 1,
    invalidCount: 0,
    updatedAt: "2026-04-16T00:12:00.000Z",
  };

  const resolved = buildAdjudicationAggregate({
    proposition,
    latestResponses: responses,
    reviews,
    counter,
  });
  assert.equal(resolved.resultKind, "resolved");
  assert.equal(resolved.winningOption, 0);

  const tied = buildAdjudicationAggregate({
    proposition,
    latestResponses: [responses[0], responses[2]],
    reviews: [buildReview("r1", "valid"), buildReview("r3", "valid")],
    counter: {
      ...counter,
      validCount: 2,
      partialValidCount: 0,
    },
  });
  assert.equal(tied.resultKind, "void");
  assert.equal(tied.voidReason, "tie");

  const insufficient = buildAdjudicationAggregate({
    proposition,
    latestResponses: responses.slice(0, 1),
    reviews: [buildReview("r1", "valid")],
    counter: {
      ...counter,
      validCount: 1,
      partialValidCount: 0,
    },
  });
  assert.equal(insufficient.resultKind, "void");
  assert.equal(insufficient.voidReason, "insufficient_sample");
});

test("adjudication task view model keeps only adjudication fields", () => {
  const proposition = buildLiveProposition();
  const task = buildTask();

  const view = buildAdjudicationTaskViewModel({
    proposition,
    task,
    latestReview: buildReview("r1", "valid"),
    rewardLedger: {
      status: "finalized",
      pendingAmount: "5",
      finalAmount: "5",
    },
    publicProgress: buildPublicProgressViewModel({
      proposition,
      reviewedCount: 3,
      effectiveSampleCount: 2,
      now: "2026-04-16T00:30:00.000Z",
    }),
    now: "2026-04-16T00:30:00.000Z",
  });

  assert.equal(view.taskId, task.id);
  assert.equal(view.hasSubmitted, true);
  assert.equal(view.assignedAt, task.assignedAt);
  assert.equal(view.startedAt, task.startedAt);
  assert.equal(view.submittedAt, task.submittedAt);
  assert.equal(view.expiresAt, task.expiresAt);
  assert.equal(view.skipReason, null);
  assert.equal(view.expiryReason, null);
  assert.equal(view.cooldownUntil, null);
  assert.equal(view.latestResponseStatus, "valid");
  assert.equal(view.publicProgress.progress.currentEffectiveSample, 2);
  assert.equal("marketStatus" in view, false);
  assert.equal("odds" in view, false);
  assert.equal("optionPools" in view, false);
  assert.equal("currentUserPosition" in view, false);
  assert.equal("executionReadiness" in view, false);
  assert.equal("marketBias" in view, false);
  assert.equal("reviewOutcomeByOption" in view, false);
});

test("respondent task view model exposes only task intake fields", () => {
  const proposition = buildLiveProposition({
    marketEnabled: true,
  });
  const task = buildTask({
    status: "assigned",
    submittedAt: null,
  });

  const view = buildRespondentTaskViewModel({
    proposition,
    task,
  });

  assert.equal(view.taskId, task.id);
  assert.equal(view.taskStatus, "assigned");
  assert.equal(view.hasSubmitted, false);
  assert.equal("marketStatus" in view, false);
  assert.equal("latestResponseStatus" in view, false);
  assert.equal("rewardStatus" in view, false);
});

test("adjudication task view model keeps lifecycle metadata across started, skipped, and expired tasks", () => {
  const proposition = buildLiveProposition();
  const baseInput = {
    proposition,
    latestReview: null,
    rewardLedger: null,
    publicProgress: buildPublicProgressViewModel({
      proposition,
      reviewedCount: 0,
      effectiveSampleCount: 0,
      now: "2026-04-16T00:30:00.000Z",
    }),
    now: "2026-04-16T00:30:00.000Z",
  } as const;

  const started = buildAdjudicationTaskViewModel({
    ...baseInput,
    task: buildTask({
      status: "started",
      submittedAt: null,
      startedAt: "2026-04-16T00:05:00.000Z",
    }),
  });
  assert.equal(started.taskStatus, "started");
  assert.equal(started.startedAt, "2026-04-16T00:05:00.000Z");
  assert.equal(started.submittedAt, null);

  const skipped = buildAdjudicationTaskViewModel({
    ...baseInput,
    task: buildTask({
      status: "skipped",
      submittedAt: null,
      skipReason: "user_declined",
      cooldownUntil: "2026-04-16T12:10:00.000Z",
    }),
  });
  assert.equal(skipped.taskStatus, "skipped");
  assert.equal(skipped.skipReason, "user_declined");
  assert.equal(skipped.cooldownUntil, "2026-04-16T12:10:00.000Z");

  const expired = buildAdjudicationTaskViewModel({
    ...baseInput,
    task: buildTask({
      status: "expired",
      submittedAt: null,
      expiryReason: "ttl_elapsed",
      cooldownUntil: "2026-04-16T12:20:00.000Z",
    }),
  });
  assert.equal(expired.taskStatus, "expired");
  assert.equal(expired.expiryReason, "ttl_elapsed");
  assert.equal(expired.cooldownUntil, "2026-04-16T12:20:00.000Z");
});
