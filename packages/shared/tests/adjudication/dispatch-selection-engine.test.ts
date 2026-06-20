import assert from "node:assert/strict";
import test from "node:test";

import { DispatchSelectionEngine } from "../../src/arena/adjudication/dispatch-selection-engine.js";
import { buildDispatchCandidate, buildLiveProposition } from "./memory-harness.js";

const engine = new DispatchSelectionEngine();

const buildRankedCandidate = (
  overrides: Partial<Parameters<typeof engine.select>[0]["candidates"][number]> = {},
) => ({
  ...buildDispatchCandidate(),
  reputationLevel: null,
  reputationScore: null,
  reviewedResponseCount: 0,
  invalidRate: 0,
  anomalyRate: 0,
  fraudFlagCount: 0,
  activeTagKeys: [],
  ...overrides,
});

test("dispatch selection hard-filters explicitly risky respondents", () => {
  const proposition = buildLiveProposition({ category: "general" });
  const selection = engine.select({
    proposition,
    maxAssignments: 2,
    candidates: [
      buildRankedCandidate({
        userId: "risky-user",
        reputationLevel: "risky",
        fraudFlagCount: 1,
        anomalyRate: 0.6,
        activeTagKeys: ["risky_responder"],
      }),
      buildRankedCandidate({ userId: "safe-user" }),
    ],
  });

  assert.deepEqual(selection.selectedUserIds, ["safe-user"]);
  assert.equal(selection.candidates[0]?.userId, "safe-user");
  assert.equal(
    selection.candidates.find((candidate) => candidate.userId === "risky-user")
      ?.blockReason,
    "risky_reputation_guard",
  );
});

test("dispatch selection boosts high-quality stable respondents over baseline candidates", () => {
  const proposition = buildLiveProposition({ category: "general" });
  const selection = engine.select({
    proposition,
    maxAssignments: 1,
    candidates: [
      buildRankedCandidate({ userId: "baseline-user" }),
      buildRankedCandidate({
        userId: "stable-user",
        reputationLevel: "trusted",
        reviewedResponseCount: 9,
        activeTagKeys: [
          "high_quality",
          "stable_responder",
          "high_completion",
          "low_anomaly",
        ],
      }),
    ],
  });

  assert.deepEqual(selection.selectedUserIds, ["stable-user"]);
  assert.equal(
    selection.candidates.find((candidate) => candidate.userId === "stable-user")
      ?.priorityBucket,
    "priority",
  );
});

test("dispatch selection keeps a general-pool reserve when interest matches are abundant", () => {
  const proposition = buildLiveProposition({ category: "ai" });
  const selection = engine.select({
    proposition,
    maxAssignments: 3,
    candidates: [
      buildRankedCandidate({
        userId: "ai-1",
        activeTagKeys: ["interested_in_ai", "high_quality"],
      }),
      buildRankedCandidate({
        userId: "ai-2",
        activeTagKeys: ["interested_in_ai"],
      }),
      buildRankedCandidate({
        userId: "general-1",
        activeTagKeys: [],
      }),
      buildRankedCandidate({
        userId: "general-2",
        activeTagKeys: [],
      }),
    ],
  });

  const selected = new Set(selection.selectedUserIds);

  assert.equal(selection.generalReserveCount, 1);
  assert.equal(selected.has("ai-1"), true);
  assert.equal(
    selection.selectedUserIds.some((userId) => userId.startsWith("general-")),
    true,
  );
});

test("dispatch selection recognizes dao interest tags for dao propositions", () => {
  const proposition = buildLiveProposition({ category: "dao" });
  const selection = engine.select({
    proposition,
    maxAssignments: 1,
    candidates: [
      buildRankedCandidate({
        userId: "dao-user",
        activeTagKeys: ["interested_in_dao"],
      }),
      buildRankedCandidate({
        userId: "general-user",
        activeTagKeys: [],
      }),
    ],
  });

  assert.deepEqual(selection.selectedUserIds, ["dao-user"]);
  assert.equal(
    selection.candidates.find((candidate) => candidate.userId === "dao-user")
      ?.reasons.includes("boost_interest_match:interested_in_dao"),
    true,
  );
});
