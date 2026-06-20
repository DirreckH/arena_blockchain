import assert from "node:assert/strict";
import test from "node:test";

import { RespondentTagEngine } from "../../src/arena/tags/tag-engine.js";

const engine = new RespondentTagEngine();

const buildReputation = (
  overrides: Partial<Parameters<typeof engine.compute>[0]["reputation"] extends infer T ? NonNullable<T> : never> = {},
) => ({
  id: "reputation-1",
  userId: "respondent-1",
  reputationScore: 86,
  reputationLevel: "trusted" as const,
  ruleVersion: "quality-reputation-v1",
  metrics: {
    assignedTaskCount: 8,
    closedTaskCount: 8,
    submittedTaskCount: 8,
    reviewedResponseCount: 8,
    validCount: 7,
    partialValidCount: 1,
    invalidCount: 0,
    fraudFlagCount: 0,
    flaggedReviewCount: 0,
    anomalyCount: 0,
    completionRate: 1,
    validRate: 0.875,
    partialValidRate: 0.125,
    invalidRate: 0,
    fraudRate: 0,
    anomalyRate: 0,
  },
  computedAt: "2026-04-23T10:00:00.000Z",
  createdAt: "2026-04-23T10:00:00.000Z",
  updatedAt: "2026-04-23T10:00:00.000Z",
  ...overrides,
});

test("tag engine maps strong reputation metrics into explainable quality tags", () => {
  const tags = engine.compute({
    reputation: buildReputation(),
    categoryParticipation: [],
    totalCategorizedResponses: 0,
  });
  const tagKeys = tags
    .filter((tag) => tag.tagType === "quality_reputation")
    .map((tag) => tag.tagKey)
    .sort();

  assert.deepEqual(tagKeys, [
    "high_completion",
    "high_quality",
    "low_anomaly",
    "stable_responder",
  ]);
});

test("tag engine keeps low-sample respondents conservative", () => {
  const tags = engine.compute({
    reputation: buildReputation({
      reputationLevel: "new",
      metrics: {
        assignedTaskCount: 1,
        closedTaskCount: 1,
        submittedTaskCount: 1,
        reviewedResponseCount: 1,
        validCount: 1,
        partialValidCount: 0,
        invalidCount: 0,
        fraudFlagCount: 0,
        flaggedReviewCount: 0,
        anomalyCount: 0,
        completionRate: 1,
        validRate: 1,
        partialValidRate: 0,
        invalidRate: 0,
        fraudRate: 0,
        anomalyRate: 0,
      },
    }),
    categoryParticipation: [
      { category: "ai", responseCount: 1, share: 1 },
    ],
    totalCategorizedResponses: 1,
  });

  assert.deepEqual(tags, []);
});

test("tag engine generates top interest tags from stable participation categories", () => {
  const tags = engine.compute({
    reputation: null,
    categoryParticipation: [
      { category: "general", responseCount: 2, share: 0.2 },
      { category: "ai", responseCount: 4, share: 0.4 },
      { category: "sports", responseCount: 4, share: 0.4 },
      { category: "brand_research", responseCount: 2, share: 0.2 },
    ],
    totalCategorizedResponses: 10,
  });
  const interestKeys = tags.map((tag) => tag.tagKey);

  assert.deepEqual(interestKeys, [
    "interested_in_ai",
    "interested_in_sports",
  ]);
  assert.equal(interestKeys.includes("interested_in_brand_research"), false);
});

test("tag engine maps dao participation into the dao interest tag", () => {
  const tags = engine.compute({
    reputation: null,
    categoryParticipation: [
      { category: "dao", responseCount: 5, share: 0.5 },
      { category: "ai", responseCount: 3, share: 0.3 },
      { category: "sports", responseCount: 2, share: 0.2 },
    ],
    totalCategorizedResponses: 10,
  });

  assert.deepEqual(
    tags.map((tag) => tag.tagKey),
    ["interested_in_dao"],
  );
});
