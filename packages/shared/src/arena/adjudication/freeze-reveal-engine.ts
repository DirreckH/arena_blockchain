import type {
  ClosureReadinessSnapshot,
  EffectiveSampleCounterSnapshot,
} from "../dto";
import type { Proposition } from "../entities";

const addSeconds = (iso: string, seconds: number): string =>
  new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

const hasReachedAtOrAfter = (now: string, target: string | null): boolean =>
  target !== null && new Date(now).getTime() >= new Date(target).getTime();

export interface EvaluateFreezeRevealReadinessInput {
  proposition: Proposition;
  counterSnapshot: EffectiveSampleCounterSnapshot;
  now: string;
}

export const evaluateFreezeRevealReadiness = (
  input: EvaluateFreezeRevealReadinessInput,
): ClosureReadinessSnapshot => {
  const liveAt = input.proposition.liveAt;
  const minFreezeAt =
    liveAt === null
      ? null
      : addSeconds(liveAt, input.proposition.minDurationSeconds);
  const maxFreezeAt =
    liveAt === null
      ? null
      : addSeconds(liveAt, input.proposition.maxDurationSeconds);

  const minDurationReached = hasReachedAtOrAfter(input.now, minFreezeAt);
  const maxDurationReached = hasReachedAtOrAfter(input.now, maxFreezeAt);
  const hasReachedMinEffectiveSample =
    input.counterSnapshot.hasReachedMinEffectiveSample;

  let isReadyToFreeze = false;
  let triggerReason: ClosureReadinessSnapshot["triggerReason"] = "not_ready";

  if (input.proposition.status === "live") {
    if (minDurationReached && hasReachedMinEffectiveSample) {
      isReadyToFreeze = true;
      triggerReason = "min_duration_and_sample_reached";
    } else if (maxDurationReached) {
      isReadyToFreeze = true;
      triggerReason = "max_duration_reached";
    }
  }

  return {
    propositionId: input.proposition.id,
    propositionStatus: input.proposition.status,
    counterSnapshot: input.counterSnapshot,
    liveAt,
    minFreezeAt,
    maxFreezeAt,
    minDurationReached,
    maxDurationReached,
    hasReachedMinEffectiveSample,
    isReadyToFreeze,
    triggerReason,
  };
};
