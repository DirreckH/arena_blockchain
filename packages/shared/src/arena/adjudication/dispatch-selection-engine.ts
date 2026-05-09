import type { Proposition } from "../entities.js";
import { RESPONDENT_INTEREST_TAG_BY_CATEGORY } from "../tags/constants.js";
import {
  ARENA_ADJUDICATION_DEFAULTS,
  DISPATCH_PRIORITY_BUCKETS,
  DISPATCH_SELECTION_RULE_VERSION,
  type DispatchPriorityBucket,
  type DispatchSelectionBlockReason,
} from "./constants.js";
import type {
  DispatchCandidateRankingSnapshot,
  DispatchCandidateScoreTrace,
  DispatchSelectionInput,
  DispatchSelectionResult,
} from "./ports.js";

interface RankedCandidate {
  userId: string;
  originalIndex: number;
  eligible: boolean;
  selected: boolean;
  blockReason: DispatchSelectionBlockReason | null;
  priorityBucket: DispatchPriorityBucket;
  baseScore: number;
  qualityAdjustment: number;
  interestAdjustment: number;
  finalScore: number | null;
  matchedInterestTag: string | null;
  reasons: string[];
}

const sortRankedCandidates = (
  left: RankedCandidate,
  right: RankedCandidate,
): number => {
  const leftScore = left.finalScore ?? Number.NEGATIVE_INFINITY;
  const rightScore = right.finalScore ?? Number.NEGATIVE_INFINITY;

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return left.originalIndex - right.originalIndex;
};

const toPriorityBucket = (
  finalScore: number | null,
): DispatchPriorityBucket => {
  if (finalScore === null) {
    return DISPATCH_PRIORITY_BUCKETS[3];
  }

  if (finalScore >= 125) {
    return DISPATCH_PRIORITY_BUCKETS[0];
  }

  if (finalScore >= 100) {
    return DISPATCH_PRIORITY_BUCKETS[1];
  }

  return DISPATCH_PRIORITY_BUCKETS[2];
};

export class DispatchSelectionEngine {
  select(input: DispatchSelectionInput): DispatchSelectionResult {
    const ranked = input.candidates.map((candidate, index) =>
      this.rankCandidate(candidate, input.proposition, index),
    );
    const eligible = ranked.filter((candidate) => candidate.eligible);
    const requestedAssignments = Math.max(0, Math.floor(input.maxAssignments));
    const cappedAssignments = Math.min(requestedAssignments, eligible.length);
    const interestMatched = eligible.filter(
      (candidate) => candidate.matchedInterestTag !== null,
    );
    const nonInterest = eligible.filter(
      (candidate) => candidate.matchedInterestTag === null,
    );

    let generalReserveCount = 0;
    let selectedUserIds: string[] = [];

    if (cappedAssignments >= eligible.length) {
      selectedUserIds = eligible
        .slice()
        .sort((left, right) => left.originalIndex - right.originalIndex)
        .map((candidate) => candidate.userId);
    } else if (
      input.proposition.category !== "general" &&
      interestMatched.length > 0 &&
      nonInterest.length > 0 &&
      cappedAssignments > 1
    ) {
      generalReserveCount = Math.min(
        nonInterest.length,
        Math.max(1, Math.ceil(cappedAssignments / 3)),
      );

      const reservedGeneral = nonInterest
        .slice()
        .sort(sortRankedCandidates)
        .slice(0, generalReserveCount);
      const reservedIds = new Set(reservedGeneral.map((candidate) => candidate.userId));
      const remaining = eligible
        .slice()
        .sort(sortRankedCandidates)
        .filter((candidate) => !reservedIds.has(candidate.userId))
        .slice(0, cappedAssignments - reservedGeneral.length);

      selectedUserIds = [...reservedGeneral, ...remaining]
        .slice()
        .sort(sortRankedCandidates)
        .map((candidate) => candidate.userId);
    } else {
      selectedUserIds = eligible
        .slice()
        .sort(sortRankedCandidates)
        .slice(0, cappedAssignments)
        .map((candidate) => candidate.userId);
    }

    const selectedIds = new Set(selectedUserIds);

    return {
      ruleVersion: DISPATCH_SELECTION_RULE_VERSION,
      propositionCategory: input.proposition.category,
      maxAssignments: cappedAssignments,
      generalReserveCount,
      selectedUserIds,
      candidates: ranked
        .map((candidate) => {
          const selected = selectedIds.has(candidate.userId);
          const reasons = [...candidate.reasons];

          if (
            selected &&
            generalReserveCount > 0 &&
            candidate.matchedInterestTag === null
          ) {
            reasons.push("bias_guard_general_reserve");
          }

          if (candidate.eligible && !selected) {
            if (
              generalReserveCount > 0 &&
              candidate.matchedInterestTag !== null &&
              input.proposition.category !== "general"
            ) {
              reasons.push("bias_guard_interest_cap");
            } else {
              reasons.push("not_selected_within_assignment_limit");
            }
          }

          return {
            userId: candidate.userId,
            eligible: candidate.eligible,
            selected,
            blockReason: candidate.blockReason,
            priorityBucket: candidate.priorityBucket,
            baseScore: candidate.baseScore,
            qualityAdjustment: candidate.qualityAdjustment,
            interestAdjustment: candidate.interestAdjustment,
            finalScore: candidate.finalScore,
            matchedInterestTag: candidate.matchedInterestTag,
            reasons,
          } satisfies DispatchCandidateScoreTrace;
        })
        .sort(sortRankedCandidates),
    };
  }

  private rankCandidate(
    candidate: DispatchCandidateRankingSnapshot,
    proposition: Proposition,
    originalIndex: number,
  ): RankedCandidate {
    const baseIneligibility = this.getBaseIneligibility(candidate, proposition);
    if (baseIneligibility) {
      return {
        userId: candidate.userId,
        originalIndex,
        eligible: false,
        selected: false,
        blockReason: baseIneligibility,
        priorityBucket: DISPATCH_PRIORITY_BUCKETS[3],
        baseScore: 100,
        qualityAdjustment: 0,
        interestAdjustment: 0,
        finalScore: null,
        matchedInterestTag: null,
        reasons: [baseIneligibility],
      };
    }

    const explicitHighRisk =
      candidate.fraudFlagCount > 0 ||
      candidate.invalidRate >= 0.5 ||
      candidate.anomalyRate >= 0.4;
    const hasRiskySignal =
      candidate.reputationLevel === "risky" ||
      candidate.activeTagKeys.includes("risky_responder");

    if (hasRiskySignal && explicitHighRisk) {
      return {
        userId: candidate.userId,
        originalIndex,
        eligible: false,
        selected: false,
        blockReason: "risky_reputation_guard",
        priorityBucket: DISPATCH_PRIORITY_BUCKETS[3],
        baseScore: 100,
        qualityAdjustment: 0,
        interestAdjustment: 0,
        finalScore: null,
        matchedInterestTag: null,
        reasons: ["risky_reputation_guard"],
      };
    }

    let qualityAdjustment = 0;
    let interestAdjustment = 0;
    const reasons = ["eligible_base"];

    if (candidate.activeTagKeys.includes("high_quality")) {
      qualityAdjustment += 25;
      reasons.push("boost_high_quality");
    }

    if (candidate.activeTagKeys.includes("stable_responder")) {
      qualityAdjustment += 20;
      reasons.push("boost_stable_responder");
    }

    if (candidate.activeTagKeys.includes("high_completion")) {
      qualityAdjustment += 10;
      reasons.push("boost_high_completion");
    }

    if (candidate.activeTagKeys.includes("low_anomaly")) {
      qualityAdjustment += 5;
      reasons.push("boost_low_anomaly");
    }

    if (candidate.reputationLevel === "trusted") {
      qualityAdjustment += 8;
      reasons.push("boost_trusted_reputation");
    } else if (candidate.reputationLevel === "normal") {
      qualityAdjustment += 4;
      reasons.push("boost_normal_reputation");
    } else if (
      candidate.reputationLevel === "new" ||
      candidate.reviewedResponseCount < 3
    ) {
      reasons.push("retain_low_sample_entry");
    }

    if (
      candidate.activeTagKeys.includes("risky_responder") &&
      !explicitHighRisk
    ) {
      qualityAdjustment -= 20;
      reasons.push("penalize_risky_responder");
    }

    let matchedInterestTag: string | null = null;
    if (proposition.category !== "general") {
      const interestTag =
        RESPONDENT_INTEREST_TAG_BY_CATEGORY[proposition.category];
      if (candidate.activeTagKeys.includes(interestTag)) {
        matchedInterestTag = interestTag;
        interestAdjustment += 12;
        reasons.push(`boost_interest_match:${interestTag}`);
      }
    }

    const finalScore = 100 + qualityAdjustment + interestAdjustment;

    return {
      userId: candidate.userId,
      originalIndex,
      eligible: true,
      selected: false,
      blockReason: null,
      priorityBucket: toPriorityBucket(finalScore),
      baseScore: 100,
      qualityAdjustment,
      interestAdjustment,
      finalScore,
      matchedInterestTag,
      reasons,
    };
  }

  private getBaseIneligibility(
    candidate: DispatchCandidateRankingSnapshot,
    proposition: Proposition,
  ): DispatchSelectionBlockReason | null {
    if (proposition.status !== "live") {
      return "proposition_not_live";
    }

    if (candidate.userStatus !== "active") {
      return "user_not_active";
    }

    if (!candidate.matchesSampleConstraints) {
      return "sample_constraints_mismatch";
    }

    if (
      candidate.activeTaskCount >=
      ARENA_ADJUDICATION_DEFAULTS.maxActiveTasksPerUser
    ) {
      return "user_task_quota_reached";
    }

    if (candidate.hasActiveTaskForProposition) {
      return "existing_active_task";
    }

    if (candidate.hasSubmittedTaskForProposition) {
      return "existing_submitted_task";
    }

    if (candidate.isInCooldown) {
      return "dispatch_cooldown";
    }

    return null;
  }
}
