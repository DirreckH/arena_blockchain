import type { PublicProgressViewModel } from "../dto.js";
import type { Proposition } from "../entities.js";

const addSeconds = (iso: string, seconds: number): string =>
  new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundPercent = (value: number): number =>
  Math.round(clamp(value, 0, 1) * 100);

const resolvePhase = (
  status: Proposition["status"],
): PublicProgressViewModel["publicState"]["phase"] => {
  switch (status) {
    case "draft":
    case "scheduled":
      return "scheduled";
    case "live":
      return "live";
    case "frozen":
      return "frozen";
    case "revealing":
      return "revealing";
    case "settled":
    case "closed":
    case "archived":
      return "settled";
  }
};

const resolvePublishedAt = (proposition: Proposition): string | null =>
  proposition.resultComputedAt ??
  proposition.settledAt ??
  proposition.closedAt ??
  proposition.archivedAt;

export interface BuildPublicProgressViewModelInput {
  proposition: Proposition;
  effectiveSampleCount: number;
  reviewedCount: number;
  now: string;
}

export const buildPublicProgressViewModel = (
  input: BuildPublicProgressViewModelInput,
): PublicProgressViewModel => {
  const startedAt = input.proposition.liveAt;
  const minDurationEndsAt = startedAt
    ? addSeconds(startedAt, input.proposition.minDurationSeconds)
    : null;
  const deadlineAt = startedAt
    ? addSeconds(startedAt, input.proposition.maxDurationSeconds)
    : null;
  const reachedMinDuration = minDurationEndsAt
    ? new Date(input.now).getTime() >= new Date(minDurationEndsAt).getTime()
    : false;
  const progressPercent =
    input.proposition.minEffectiveSample <= 0
      ? 100
      : roundPercent(
          input.effectiveSampleCount / input.proposition.minEffectiveSample,
        );
  const publishedAt = resolvePublishedAt(input.proposition);
  const lastPublishedResult =
    publishedAt !== null &&
    ["settled", "closed", "archived"].includes(input.proposition.status) &&
    input.proposition.resultKind !== null &&
    (input.proposition.resultKind === "void" ||
      input.proposition.winningOption !== null)
      ? {
          resultKind: input.proposition.resultKind,
          winningOption: input.proposition.winningOption,
          voidReason: input.proposition.voidReason,
          publishedAt,
        }
      : null;

  return {
    propositionId: input.proposition.id,
    title: input.proposition.title,
    status: input.proposition.status,
    marketEnabled: input.proposition.marketEnabled,
    progress: {
      totalRequired: input.proposition.minEffectiveSample,
      currentEffectiveSample: input.effectiveSampleCount,
      reviewedCount: input.reviewedCount,
      progressPercent,
    },
    timing: {
      startedAt,
      minDurationSeconds: input.proposition.minDurationSeconds,
      maxDurationSeconds: input.proposition.maxDurationSeconds,
      minDurationEndsAt,
      deadlineAt,
      frozenAt: input.proposition.frozenAt,
      revealStartedAt: input.proposition.revealStartedAt,
      settledAt:
        input.proposition.settledAt ??
        input.proposition.closedAt ??
        input.proposition.archivedAt,
    },
    publicState: {
      phase: resolvePhase(input.proposition.status),
      reachedSampleThreshold:
        input.effectiveSampleCount >= input.proposition.minEffectiveSample,
      reachedMinDuration,
    },
    lastPublishedResult,
  };
};
