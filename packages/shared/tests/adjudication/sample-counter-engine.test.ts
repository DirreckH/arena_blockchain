import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEffectiveSampleCounterSnapshot,
  SampleCounterEngine,
} from "../../src/arena/adjudication/sample-counter-engine.js";
import { buildPublicProgressViewModel } from "../../src/arena/application/public-progress.js";
import {
  buildDispatchCandidate,
  buildLiveProposition,
  createAdjudicationHarness,
} from "./memory-harness.js";

test("sample counter engine counts valid, partial, invalid and skips pending reviews", async () => {
  const proposition = buildLiveProposition({ minEffectiveSample: 3 });
  const harness = createAdjudicationHarness(proposition);

  const taskOne = await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-1" }),
    proposition,
    "2026-04-16T00:00:00.000Z",
  );
  const taskTwo = await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-2" }),
    proposition,
    "2026-04-16T00:00:00.000Z",
  );
  const taskThree = await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-3" }),
    proposition,
    "2026-04-16T00:00:00.000Z",
  );
  const taskFour = await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-4" }),
    proposition,
    "2026-04-16T00:00:00.000Z",
  );

  const valid = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: taskOne.id,
    userId: taskOne.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-16T00:00:10.000Z",
    clientSubmittedAt: "2026-04-16T00:00:20.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:00:20.000Z",
  });
  const partial = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: taskTwo.id,
    userId: taskTwo.userId,
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-16T00:00:10.000Z",
    clientSubmittedAt: "2026-04-16T00:00:12.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:00:12.000Z",
  });
  const invalid = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: taskThree.id,
    userId: taskThree.userId,
    selectedOption: 0,
    confirmationOption: 1,
    clientStartedAt: "2026-04-16T00:00:10.000Z",
    clientSubmittedAt: "2026-04-16T00:00:20.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:00:20.000Z",
  });
  await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: taskFour.id,
    userId: taskFour.userId,
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-16T00:00:10.000Z",
    clientSubmittedAt: "2026-04-16T00:00:20.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:00:20.000Z",
  });

  await harness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: valid.response.id,
    reviewedAt: "2026-04-16T00:01:00.000Z",
  });
  await harness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: partial.response.id,
    reviewedAt: "2026-04-16T00:01:00.000Z",
  });
  await harness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: invalid.response.id,
    reviewedAt: "2026-04-16T00:01:00.000Z",
  });

  const counter = await harness.counterEngine.rebuildForProposition(
    proposition.id,
    "2026-04-16T00:02:00.000Z",
  );
  const snapshot = buildEffectiveSampleCounterSnapshot({
    propositionId: proposition.id,
    minEffectiveSample: proposition.minEffectiveSample,
    counter,
  });

  assert.equal(counter.totalResponses, 4);
  assert.equal(counter.reviewedResponses, 3);
  assert.equal(counter.validCount, 1);
  assert.equal(counter.partialValidCount, 1);
  assert.equal(counter.invalidCount, 1);
  assert.equal(snapshot.effectiveSampleCount, 2);
  assert.equal(snapshot.currentProgress, 2 / 3);
  assert.equal(snapshot.hasReachedMinEffectiveSample, false);
});

test("sample counter snapshot is latest-only, capped and public progress stays non-directional", async () => {
  const proposition = buildLiveProposition({ minEffectiveSample: 1 });
  const harness = createAdjudicationHarness(proposition);
  const task = await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-1" }),
    proposition,
    "2026-04-16T00:00:00.000Z",
  );

  const first = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: task.id,
    userId: task.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-16T00:00:10.000Z",
    clientSubmittedAt: "2026-04-16T00:00:20.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:00:20.000Z",
  });
  await harness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: first.response.id,
    reviewedAt: "2026-04-16T00:01:00.000Z",
  });

  const revision = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: task.id,
    userId: task.userId,
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-16T00:01:10.000Z",
    clientSubmittedAt: "2026-04-16T00:01:20.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:01:20.000Z",
  });
  await harness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: revision.response.id,
    reviewedAt: "2026-04-16T00:02:00.000Z",
  });

  const engine = new SampleCounterEngine({
    ids: harness.ids,
    responses: harness.responseRepository,
    reviews: harness.reviewRepository,
    counters: harness.counterRepository,
  });
  const counter = await engine.rebuildForProposition(
    proposition.id,
    "2026-04-16T00:03:00.000Z",
  );
  const snapshot = buildEffectiveSampleCounterSnapshot({
    propositionId: proposition.id,
    minEffectiveSample: proposition.minEffectiveSample,
    counter,
  });
  const publicProgress = buildPublicProgressViewModel({
    proposition,
    reviewedCount: snapshot.reviewedResponses,
    effectiveSampleCount: snapshot.effectiveSampleCount,
    now: "2026-04-16T00:03:00.000Z",
  });

  assert.equal(counter.totalResponses, 1);
  assert.equal(counter.reviewedResponses, 1);
  assert.equal(counter.validCount, 1);
  assert.equal(counter.partialValidCount, 0);
  assert.equal(counter.invalidCount, 0);
  assert.equal(snapshot.currentProgress, 1);
  assert.equal(snapshot.hasReachedMinEffectiveSample, true);
  assert.equal(publicProgress.progress.totalRequired, 1);
  assert.equal(publicProgress.progress.reviewedCount, 1);
  assert.equal(publicProgress.publicState.reachedSampleThreshold, true);
  assert.equal("winningOption" in publicProgress, false);
  assert.equal("option0Votes" in publicProgress, false);
  assert.equal("option1Votes" in publicProgress, false);
  assert.equal("validCount" in publicProgress, false);
  assert.equal("partialValidCount" in publicProgress, false);
  assert.equal("invalidCount" in publicProgress, false);
});

test("public progress reveals results only after settlement visibility starts", () => {
  const proposition = buildLiveProposition({
    status: "settled",
    resultKind: "resolved",
    winningOption: 1,
    resultComputedAt: "2026-04-16T00:03:00.000Z",
    settledAt: "2026-04-16T00:04:00.000Z",
  });

  const publicProgress = buildPublicProgressViewModel({
    proposition,
    reviewedCount: 5,
    effectiveSampleCount: 3,
    now: "2026-04-16T00:05:00.000Z",
  });

  assert.equal(publicProgress.lastPublishedResult?.winningOption, 1);
  assert.equal(
    publicProgress.lastPublishedResult?.publishedAt,
    "2026-04-16T00:03:00.000Z",
  );
});
