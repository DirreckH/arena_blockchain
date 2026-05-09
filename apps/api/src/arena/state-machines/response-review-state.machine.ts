import type { ResponseReviewStatus } from "@prisma/client";

import { ArenaStateTransitionError } from "../arena.errors";

const RESPONSE_REVIEW_TRANSITIONS: Record<
  ResponseReviewStatus,
  readonly ResponseReviewStatus[]
> = {
  pending_review: ["valid", "partial_valid", "invalid", "fraud_suspected"],
  valid: [],
  partial_valid: [],
  invalid: [],
  fraud_suspected: [],
};

export const getAllowedResponseReviewTransitions = (
  status: ResponseReviewStatus,
): readonly ResponseReviewStatus[] => RESPONSE_REVIEW_TRANSITIONS[status];

export const assertResponseReviewTransition = (
  current: ResponseReviewStatus,
  next: ResponseReviewStatus,
  action: string,
): void => {
  if (!getAllowedResponseReviewTransitions(current).includes(next)) {
    throw new ArenaStateTransitionError("ResponseReview", current, next, action);
  }
};
