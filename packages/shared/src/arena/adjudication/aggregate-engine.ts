import type { AdjudicationAggregate, BuildAggregateInput } from "./ports.js";
import type { ResponseReview } from "../entities.js";

const isCountableReview = (review: ResponseReview | null): boolean =>
  review !== null &&
  review.reviewedAt !== null &&
  (review.status === "valid" || review.status === "partial_valid");

export const buildAdjudicationAggregate = (
  input: BuildAggregateInput,
): AdjudicationAggregate => {
  const reviewsByResponseId = new Map(
    input.reviews.map((review) => [review.responseId, review] as const),
  );

  let option0Votes = 0;
  let option1Votes = 0;

  for (const response of input.latestResponses) {
    const review = reviewsByResponseId.get(response.id) ?? null;
    if (!response.isLatest || !isCountableReview(review)) {
      continue;
    }

    if (response.selectedOption === 0) {
      option0Votes += 1;
    } else {
      option1Votes += 1;
    }
  }

  const validCount = input.counter?.validCount ?? 0;
  const partialValidCount = input.counter?.partialValidCount ?? 0;
  const effectiveSampleCount = validCount + partialValidCount;

  if (effectiveSampleCount < input.proposition.minEffectiveSample) {
    return {
      propositionId: input.proposition.id,
      effectiveSampleCount,
      validCount,
      partialValidCount,
      option0Votes,
      option1Votes,
      winningOption: null,
      resultKind: "void",
      voidReason: "insufficient_sample",
    };
  }

  if (option0Votes === option1Votes) {
    return {
      propositionId: input.proposition.id,
      effectiveSampleCount,
      validCount,
      partialValidCount,
      option0Votes,
      option1Votes,
      winningOption: null,
      resultKind: "void",
      voidReason: "tie",
    };
  }

  return {
    propositionId: input.proposition.id,
    effectiveSampleCount,
    validCount,
    partialValidCount,
    option0Votes,
    option1Votes,
    winningOption: option0Votes > option1Votes ? 0 : 1,
    resultKind: "resolved",
    voidReason: null,
  };
};
