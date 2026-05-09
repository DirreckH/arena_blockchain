import assert from "node:assert/strict";
import test from "node:test";

import { QualityReputationEngine } from "../../src/arena/reputation/reputation-engine.js";

const engine = new QualityReputationEngine();

const compute = (
  overrides: Partial<Parameters<typeof engine.compute>[0]> = {},
) =>
  engine.compute({
    userId: "respondent-1",
    assignedTaskCount: 8,
    closedTaskCount: 8,
    submittedTaskCount: 8,
    reviewedResponseCount: 8,
    validCount: 0,
    partialValidCount: 0,
    invalidCount: 0,
    fraudFlagCount: 0,
    flaggedReviewCount: 0,
    anomalyCount: 0,
    computedAt: "2026-04-23T10:00:00.000Z",
    ...overrides,
  });

test("quality reputation score ranks valid above partial_valid above invalid above fraud", () => {
  const valid = compute({ validCount: 8 });
  const partialValid = compute({
    partialValidCount: 8,
    flaggedReviewCount: 8,
    anomalyCount: 8,
  });
  const invalid = compute({ invalidCount: 8 });
  const fraud = compute({
    fraudFlagCount: 8,
    flaggedReviewCount: 8,
    anomalyCount: 8,
  });

  assert.ok(valid.reputationScore > partialValid.reputationScore);
  assert.ok(partialValid.reputationScore > invalid.reputationScore);
  assert.ok(invalid.reputationScore > fraud.reputationScore);
  assert.equal(valid.reputationLevel, "trusted");
  assert.equal(fraud.reputationLevel, "risky");
});

test("low-sample users stay in new and do not become trusted from one good review", () => {
  const lowSample = compute({
    assignedTaskCount: 1,
    closedTaskCount: 1,
    submittedTaskCount: 1,
    reviewedResponseCount: 1,
    validCount: 1,
  });

  assert.equal(lowSample.reputationLevel, "new");
  assert.ok(lowSample.reputationScore >= 60);
  assert.ok(lowSample.reputationScore < 70);
});
