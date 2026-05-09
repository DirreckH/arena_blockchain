import assert from "node:assert/strict";
import test from "node:test";

import { DispatchIneligibleError } from "../../src/arena/adjudication/errors.js";
import { buildLiveProposition, buildDispatchCandidate, createAdjudicationHarness } from "./memory-harness.js";

test("dispatch eligibility rejects inactive, constrained, quota and cooldown candidates", async () => {
  const proposition = buildLiveProposition();
  const { dispatchEngine } = createAdjudicationHarness(proposition);

  assert.deepEqual(
    dispatchEngine.evaluateEligibility(
      buildDispatchCandidate({ userStatus: "inactive" }),
      proposition,
    ),
    { eligible: false, reason: "user_not_active" },
  );

  assert.deepEqual(
    dispatchEngine.evaluateEligibility(
      buildDispatchCandidate({ matchesSampleConstraints: false }),
      proposition,
    ),
    { eligible: false, reason: "sample_constraints_mismatch" },
  );

  assert.deepEqual(
    dispatchEngine.evaluateEligibility(
      buildDispatchCandidate({ activeTaskCount: 3 }),
      proposition,
    ),
    { eligible: false, reason: "user_task_quota_reached" },
  );

  assert.deepEqual(
    dispatchEngine.evaluateEligibility(
      buildDispatchCandidate({ isInCooldown: true }),
      proposition,
    ),
    { eligible: false, reason: "dispatch_cooldown" },
  );
});

test("dispatch assign computes min expiry and start/skip/expire transitions", async () => {
  const proposition = buildLiveProposition({
    liveAt: "2026-04-16T00:00:00.000Z",
    maxDurationSeconds: 3600,
  });
  const { dispatchEngine, taskRepository } = createAdjudicationHarness(proposition);

  const assigned = await dispatchEngine.assign(
    buildDispatchCandidate(),
    proposition,
    "2026-04-16T00:10:00.000Z",
  );

  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.expiresAt, "2026-04-16T01:00:00.000Z");

  const started = await dispatchEngine.start({
    taskId: assigned.id,
    userId: assigned.userId,
    startedAt: "2026-04-16T00:12:00.000Z",
  });
  assert.equal(started.status, "started");

  const skipped = await dispatchEngine.skip({
    taskId: started.id,
    userId: started.userId,
    skippedAt: "2026-04-16T00:15:00.000Z",
    skipReason: "not_interested",
  });
  assert.equal(skipped.task.status, "skipped");
  assert.equal(skipped.requeueRecommended, true);
  assert.equal(skipped.task.cooldownUntil, "2026-04-16T12:15:00.000Z");

  const assignedAgain = await dispatchEngine.assign(
    buildDispatchCandidate({ userId: "user-2" }),
    proposition,
    "2026-04-16T00:20:00.000Z",
  );
  const expired = await dispatchEngine.expire({
    taskId: assignedAgain.id,
    expiredAt: "2026-04-16T00:40:00.000Z",
    expiryReason: "ttl_elapsed",
  });
  assert.equal(expired.task.status, "expired");
  assert.equal(expired.requeueRecommended, true);

  assert.equal(taskRepository.snapshot().length, 2);
});

test("dispatch assign throws on ineligible candidate", async () => {
  const proposition = buildLiveProposition();
  const { dispatchEngine } = createAdjudicationHarness(proposition);

  await assert.rejects(
    () =>
      dispatchEngine.assign(
        buildDispatchCandidate({ hasSubmittedTaskForProposition: true }),
        proposition,
        "2026-04-16T00:10:00.000Z",
      ),
    (error: unknown) =>
      error instanceof DispatchIneligibleError &&
      error.reason === "existing_submitted_task",
  );
});
