import assert from "node:assert/strict";
import test from "node:test";

import { QualityEngine } from "../../src/arena/adjudication/quality-engine.js";
import { buildLiveProposition } from "./memory-harness.js";
import type { DispatchTask, Response } from "../../src/arena/entities.js";

const buildTask = (overrides: Partial<DispatchTask> = {}): DispatchTask => ({
  id: "task-1",
  propositionId: "proposition-1",
  userId: "user-1",
  status: "submitted",
  assignedAt: "2026-04-16T00:00:00.000Z",
  startedAt: "2026-04-16T00:00:05.000Z",
  submittedAt: "2026-04-16T00:00:20.000Z",
  expiresAt: "2026-04-16T01:00:00.000Z",
  skipReason: null,
  expiryReason: null,
  cooldownUntil: null,
  ...overrides,
});

const buildResponse = (overrides: Partial<Response> = {}): Response => ({
  id: "response-1",
  propositionId: "proposition-1",
  taskId: "task-1",
  userId: "user-1",
  responseVersion: 1,
  isLatest: true,
  selectedOption: 0,
  confirmationOption: 0,
  clientStartedAt: "2026-04-16T00:00:10.000Z",
  clientSubmittedAt: "2026-04-16T00:00:20.000Z",
  understandingAck: true,
  submittedAt: "2026-04-16T00:00:20.000Z",
  ...overrides,
});

test("quality engine marks structurally sound responses as valid", () => {
  const engine = new QualityEngine();
  const result = engine.evaluatePendingResponse({
    proposition: buildLiveProposition(),
    task: buildTask(),
    response: buildResponse(),
  });

  assert.equal(result.validityStatus, "valid");
  assert.equal(result.qualityScore, 100);
  assert.deepEqual(result.flags, []);
  assert.deepEqual(result.reasonCodes, ["passes_quality_checks"]);
  assert.equal(result.minimumDurationSeconds, 8);
  assert.equal(result.observedDurationSeconds, 10);
});

test("quality engine downgrades confirmation mismatch and suspicious latency to partial_valid", () => {
  const engine = new QualityEngine();
  const result = engine.evaluatePendingResponse({
    proposition: buildLiveProposition(),
    task: buildTask(),
    response: buildResponse({
      confirmationOption: 1,
      clientStartedAt: "2026-04-16T00:00:18.000Z",
      clientSubmittedAt: "2026-04-16T00:00:20.000Z",
    }),
  });

  assert.equal(result.validityStatus, "partial_valid");
  assert.equal(result.qualityScore, 60);
  assert.ok(result.flags.includes("confirmation_mismatch"));
  assert.ok(result.flags.includes("suspicious_latency"));
  assert.ok(result.reasonCodes.includes("confirmation_mismatch"));
  assert.ok(result.reasonCodes.includes("time_too_short"));
});

test("quality engine marks broken task or proposition linkage as invalid", () => {
  const engine = new QualityEngine();
  const result = engine.evaluatePendingResponse({
    proposition: buildLiveProposition(),
    task: buildTask({ userId: "user-2" }),
    response: buildResponse(),
  });

  assert.equal(result.validityStatus, "invalid");
  assert.equal(result.qualityScore, 0);
  assert.deepEqual(result.flags, ["integrity_violation"]);
  assert.deepEqual(result.reasonCodes, ["integrity_violation"]);
});
