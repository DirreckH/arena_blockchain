import type {
  EffectiveSampleCounterSnapshot,
} from "../dto";
import type { EffectiveSampleCounter, ResponseReview } from "../entities";
import type { SampleCounterEngineDependencies } from "./ports";

const isFinalizedReview = (review: ResponseReview | null): boolean =>
  review !== null && review.status !== "pending_review" && review.reviewedAt !== null;

export interface EffectiveSampleCounterCounts {
  totalResponses: number;
  reviewedResponses: number;
  validCount: number;
  partialValidCount: number;
  invalidCount: number;
  effectiveSampleCount: number;
}

export const buildEffectiveSampleCounterCounts = (input: {
  latestResponses: { id: string }[];
  reviews: ResponseReview[];
}): EffectiveSampleCounterCounts => {
  const reviewsByResponseId = new Map(
    input.reviews.map((review) => [review.responseId, review] as const),
  );

  let reviewedResponses = 0;
  let validCount = 0;
  let partialValidCount = 0;
  let invalidCount = 0;

  for (const response of input.latestResponses) {
    const review = reviewsByResponseId.get(response.id) ?? null;
    if (!isFinalizedReview(review)) {
      continue;
    }

    reviewedResponses += 1;

    if (review.status === "valid") {
      validCount += 1;
    } else if (review.status === "partial_valid") {
      partialValidCount += 1;
    } else if (
      review.status === "invalid" ||
      review.status === "fraud_suspected"
    ) {
      invalidCount += 1;
    }
  }

  return {
    totalResponses: input.latestResponses.length,
    reviewedResponses,
    validCount,
    partialValidCount,
    invalidCount,
    effectiveSampleCount: validCount + partialValidCount,
  };
};

export const buildEffectiveSampleCounterSnapshot = (input: {
  propositionId: string;
  minEffectiveSample: number;
  counter: Pick<
    EffectiveSampleCounter,
    | "totalResponses"
    | "reviewedResponses"
    | "validCount"
    | "partialValidCount"
    | "invalidCount"
    | "updatedAt"
  >;
}): EffectiveSampleCounterSnapshot => {
  const effectiveSampleCount =
    input.counter.validCount + input.counter.partialValidCount;
  const currentProgress =
    input.minEffectiveSample <= 0
      ? 1
      : Math.min(1, effectiveSampleCount / input.minEffectiveSample);

  return {
    propositionId: input.propositionId,
    totalResponses: input.counter.totalResponses,
    reviewedResponses: input.counter.reviewedResponses,
    validCount: input.counter.validCount,
    partialValidCount: input.counter.partialValidCount,
    invalidCount: input.counter.invalidCount,
    effectiveSampleCount,
    currentProgress,
    hasReachedMinEffectiveSample:
      effectiveSampleCount >= input.minEffectiveSample,
    updatedAt: input.counter.updatedAt,
  };
};

export class SampleCounterEngine {
  constructor(private readonly deps: SampleCounterEngineDependencies) {}

  async rebuildForProposition(
    propositionId: string,
    updatedAt: string = new Date().toISOString(),
  ): Promise<EffectiveSampleCounter> {
    const latestResponses = await this.deps.responses.listLatestByProposition(
      propositionId,
    );
    const reviews = await this.deps.reviews.listByProposition(propositionId);
    const counts = buildEffectiveSampleCounterCounts({
      latestResponses,
      reviews,
    });

    const existingCounter = await this.deps.counters.getByPropositionId(propositionId);
    const counter: EffectiveSampleCounter = existingCounter
      ? {
          ...existingCounter,
          totalResponses: counts.totalResponses,
          reviewedResponses: counts.reviewedResponses,
          validCount: counts.validCount,
          partialValidCount: counts.partialValidCount,
          invalidCount: counts.invalidCount,
          updatedAt,
        }
      : {
          id: this.deps.ids.next("effective-sample-counter"),
          propositionId,
          totalResponses: counts.totalResponses,
          reviewedResponses: counts.reviewedResponses,
          validCount: counts.validCount,
          partialValidCount: counts.partialValidCount,
          invalidCount: counts.invalidCount,
          updatedAt,
        };

    return this.deps.counters.upsert(counter);
  }
}
