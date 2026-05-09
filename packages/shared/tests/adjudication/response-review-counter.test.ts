import assert from "node:assert/strict";
import test from "node:test";

import { LateSubmissionError } from "../../src/arena/adjudication/errors.js";
import { buildLiveProposition, buildDispatchCandidate, createAdjudicationHarness } from "./memory-harness.js";

test("response engine creates v1, revision and duplicate retry without new version", async () => {
  const proposition = buildLiveProposition();
  const harness = createAdjudicationHarness(proposition);
  const task = await harness.dispatchEngine.assign(
    buildDispatchCandidate(),
    proposition,
    "2026-04-16T00:10:00.000Z",
  );

  const first = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: task.id,
    userId: task.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-16T00:10:05.000Z",
    clientSubmittedAt: "2026-04-16T00:10:20.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:10:20.000Z",
  });

  assert.equal(first.task.status, "submitted");
  assert.equal(first.response.responseVersion, 1);
  assert.equal(first.reviewRequested, true);
  assert.equal(first.counterRebuildRequired, true);

  const revision = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: task.id,
    userId: task.userId,
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-16T00:11:05.000Z",
    clientSubmittedAt: "2026-04-16T00:11:15.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:11:15.000Z",
  });

  assert.equal(revision.response.responseVersion, 2);
  assert.equal(revision.response.isLatest, true);
  assert.equal(harness.responseRepository.snapshot().filter((item) => item.isLatest).length, 1);
  assert.equal(
    harness.responseRepository
      .snapshot()
      .find((item) => item.responseVersion === 1)?.isLatest,
    false,
  );

  const duplicate = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: task.id,
    userId: task.userId,
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-16T00:11:05.000Z",
    clientSubmittedAt: "2026-04-16T00:11:15.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:11:15.000Z",
  });

  assert.equal(duplicate.duplicateRetry, true);
  assert.equal(harness.responseRepository.snapshot().length, 2);
});

test("response engine rejects late submissions", async () => {
  const proposition = buildLiveProposition();
  const harness = createAdjudicationHarness(proposition);
  const task = await harness.dispatchEngine.assign(
    buildDispatchCandidate(),
    proposition,
    "2026-04-16T00:10:00.000Z",
  );

  await assert.rejects(
    () =>
      harness.responseEngine.submit({
        propositionId: proposition.id,
        taskId: task.id,
        userId: task.userId,
        selectedOption: 0,
        confirmationOption: 0,
        clientStartedAt: "2026-04-17T00:10:00.000Z",
        clientSubmittedAt: "2026-04-17T00:10:10.000Z",
        understandingAck: true,
        submittedAt: task.expiresAt,
      }),
    (error: unknown) => error instanceof LateSubmissionError,
  );
});

test("review engine finalizes invalid, partial_valid and counter latest-only semantics", async () => {
  const proposition = buildLiveProposition({ minEffectiveSample: 1 });
  const harness = createAdjudicationHarness(proposition);
  const task = await harness.dispatchEngine.assign(
    buildDispatchCandidate(),
    proposition,
    "2026-04-16T00:10:00.000Z",
  );

  const first = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: task.id,
    userId: task.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: "2026-04-16T00:10:01.000Z",
    clientSubmittedAt: "2026-04-16T00:10:20.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:10:20.000Z",
  });

  const firstReview = await harness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: first.response.id,
    reviewedAt: "2026-04-16T00:10:30.000Z",
  });
  assert.equal(firstReview.review.status, "valid");

  let counter = await harness.counterEngine.rebuildForProposition(
    proposition.id,
    "2026-04-16T00:10:40.000Z",
  );
  assert.equal(counter.validCount, 1);
  assert.equal(counter.partialValidCount, 0);
  assert.equal(counter.invalidCount, 0);

  const invalidRevision = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: task.id,
    userId: task.userId,
    selectedOption: 1,
    confirmationOption: 0,
    clientStartedAt: "2026-04-16T00:11:00.000Z",
    clientSubmittedAt: "2026-04-16T00:11:10.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:11:10.000Z",
  });

  const invalidReview = await harness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: invalidRevision.response.id,
    reviewedAt: "2026-04-16T00:11:20.000Z",
  });
  assert.equal(invalidReview.review.status, "invalid");

  counter = await harness.counterEngine.rebuildForProposition(
    proposition.id,
    "2026-04-16T00:11:30.000Z",
  );
  assert.equal(counter.validCount, 0);
  assert.equal(counter.partialValidCount, 0);
  assert.equal(counter.invalidCount, 1);

  const taskTwo = await harness.dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-2" }),
    proposition,
    "2026-04-16T00:12:00.000Z",
  );
  const fastSubmit = await harness.responseEngine.submit({
    propositionId: proposition.id,
    taskId: taskTwo.id,
    userId: taskTwo.userId,
    selectedOption: 1,
    confirmationOption: 1,
    clientStartedAt: "2026-04-16T00:12:01.000Z",
    clientSubmittedAt: "2026-04-16T00:12:05.000Z",
    understandingAck: true,
    submittedAt: "2026-04-16T00:12:05.000Z",
  });
  const fastReview = await harness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: fastSubmit.response.id,
    reviewedAt: "2026-04-16T00:12:10.000Z",
  });
  assert.equal(fastReview.review.status, "partial_valid");

  counter = await harness.counterEngine.rebuildForProposition(
    proposition.id,
    "2026-04-16T00:12:15.000Z",
  );
  assert.equal(counter.validCount, 0);
  assert.equal(counter.partialValidCount, 1);
  assert.equal(counter.invalidCount, 1);
});

test("review engine downgrades 3+ flips to partial_valid", async () => {
  const proposition = buildLiveProposition({ minEffectiveSample: 1 });
  const harness = createAdjudicationHarness(proposition);
  const task = await harness.dispatchEngine.assign(
    buildDispatchCandidate(),
    proposition,
    "2026-04-16T00:10:00.000Z",
  );

  const versions = [
    { selectedOption: 0, submittedAt: "2026-04-16T00:10:20.000Z" },
    { selectedOption: 1, submittedAt: "2026-04-16T00:11:20.000Z" },
    { selectedOption: 0, submittedAt: "2026-04-16T00:12:20.000Z" },
    { selectedOption: 1, submittedAt: "2026-04-16T00:13:20.000Z" },
  ];

  let latestResponseId = "";
  for (const version of versions) {
    const result = await harness.responseEngine.submit({
      propositionId: proposition.id,
      taskId: task.id,
      userId: task.userId,
      selectedOption: version.selectedOption as 0 | 1,
      confirmationOption: version.selectedOption as 0 | 1,
      clientStartedAt: version.submittedAt,
      clientSubmittedAt: new Date(
        new Date(version.submittedAt).getTime() + 5000,
      ).toISOString(),
      understandingAck: true,
      submittedAt: new Date(
        new Date(version.submittedAt).getTime() + 5000,
      ).toISOString(),
    });
    latestResponseId = result.response.id;
  }

  const review = await harness.reviewEngine.finalize({
    propositionId: proposition.id,
    responseId: latestResponseId,
    reviewedAt: "2026-04-16T00:14:00.000Z",
  });

  assert.equal(review.review.status, "partial_valid");
  assert.ok(review.review.flags.includes("contradictory_revisions"));
});
