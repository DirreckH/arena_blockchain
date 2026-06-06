import assert from "node:assert/strict";
import test from "node:test";

import {
  type ArenaHarness,
  createArenaHarness,
} from "./harness";

const propositionDraftInput = {
  category:
    "general" as
      | "general"
      | "sports"
      | "ai"
      | "brand_research"
      | "politics"
      | "entertainment",
  title: "Will option A win?",
  description: "MVP binary proposition",
  options: ["A", "B"] as [string, string],
  minEffectiveSample: 3,
  minBetAmount: "10",
  minDurationSeconds: 60,
  maxDurationSeconds: 3600,
  rewardBudget: "1000",
  baseResponseReward: "20",
  marketEnabled: false,
  createdByUserId: "admin_1",
};

const createLiveProposition = async (
  harness: ArenaHarness,
  overrides: Partial<typeof propositionDraftInput> = {},
) => {
  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    ...overrides,
  });
  const scheduled =
    await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: draft.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "admin_1",
    });

  return harness.propositionEngineService.publishLiveProposition({
    propositionId: scheduled.id,
    liveAt: "2026-04-18T10:05:00.000Z",
    updatedByUserId: "admin_1",
  });
};

const arenaTime = (minuteOffset: number, secondOffset = 0): string =>
  new Date(
    Date.UTC(2026, 3, 18, 10, minuteOffset, secondOffset, 0),
  ).toISOString();

test("dispatch task expiry automation expires only due assigned and started tasks", async () => {
  const harness = createArenaHarness();
  const proposition = await createLiveProposition(harness, {
    title: "Expiry automation proposition",
  });

  const dueAssigned = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "respondent_due_assigned",
    assignedAt: arenaTime(1),
    expiresAt: arenaTime(10),
  });
  const dueStarted = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "respondent_due_started",
    assignedAt: arenaTime(2),
    expiresAt: arenaTime(10),
  });
  await harness.dispatchTaskService.startTask({
    taskId: dueStarted.id,
    userId: "respondent_due_started",
    startedAt: arenaTime(3),
  });
  const futureAssigned = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "respondent_future_assigned",
    assignedAt: arenaTime(4),
    expiresAt: arenaTime(20),
  });
  const submitted = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "respondent_submitted",
    assignedAt: arenaTime(5),
    expiresAt: arenaTime(20),
  });
  await harness.responseService.submitResponse({
    propositionId: proposition.id,
    taskId: submitted.id,
    userId: "respondent_submitted",
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: arenaTime(6),
    clientSubmittedAt: arenaTime(7),
    understandingAck: true,
    submittedAt: arenaTime(7),
  });
  const skipped = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "respondent_skipped",
    assignedAt: arenaTime(5),
    expiresAt: arenaTime(20),
  });
  await harness.dispatchTaskService.skipTask({
    taskId: skipped.id,
    userId: "respondent_skipped",
    skippedAt: arenaTime(8),
    skipReason: "user_declined",
  });
  const alreadyExpired = await harness.dispatchTaskService.assignTask({
    propositionId: proposition.id,
    userId: "respondent_already_expired",
    assignedAt: arenaTime(5),
    expiresAt: arenaTime(9),
  });
  await harness.dispatchTaskService.expireTask({
    taskId: alreadyExpired.id,
    expiredAt: arenaTime(9),
    expiryReason: "ttl_elapsed",
  });

  const result =
    await harness.dispatchTaskExpiryAutomationService.expireDueTasks({
      now: arenaTime(12),
    });

  assert.equal(result.processedCount, 2);
  assert.deepEqual(new Set(result.taskIds), new Set([dueAssigned.id, dueStarted.id]));

  const expiredAssigned = await harness.dispatchTaskRepository.findById(dueAssigned.id);
  const expiredStarted = await harness.dispatchTaskRepository.findById(dueStarted.id);
  const untouchedFuture = await harness.dispatchTaskRepository.findById(futureAssigned.id);
  const untouchedSubmitted = await harness.dispatchTaskRepository.findById(submitted.id);
  const untouchedSkipped = await harness.dispatchTaskRepository.findById(skipped.id);
  const untouchedExpired = await harness.dispatchTaskRepository.findById(alreadyExpired.id);

  assert.equal(expiredAssigned?.status, "expired");
  assert.equal(expiredAssigned?.expiryReason, "ttl_elapsed");
  assert.equal(
    expiredAssigned?.cooldownUntil?.toISOString(),
    new Date(new Date(arenaTime(12)).getTime() + 12 * 60 * 60 * 1000).toISOString(),
  );
  assert.equal(expiredStarted?.status, "expired");
  assert.equal(expiredStarted?.expiryReason, "ttl_elapsed");
  assert.equal(untouchedFuture?.status, "assigned");
  assert.equal(untouchedSubmitted?.status, "submitted");
  assert.equal(untouchedSkipped?.status, "skipped");
  assert.equal(untouchedExpired?.status, "expired");

  const rerun =
    await harness.dispatchTaskExpiryAutomationService.expireDueTasks({
      now: arenaTime(13),
    });
  assert.equal(rerun.processedCount, 0);
});
