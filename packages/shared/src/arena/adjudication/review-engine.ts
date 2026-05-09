import { ARENA_ADJUDICATION_DEFAULTS } from "./constants.js";
import {
  DispatchTaskNotFoundError,
  PropositionNotFoundError,
  ResponseNotFoundError,
  ResponseReviewNotFoundError,
  ReviewAlreadyFinalizedError,
} from "./errors.js";
import type {
  FinalizeResponseReviewInput,
  ReviewEngineDependencies,
  ReviewEvaluationContext,
  ReviewEvaluationResult,
  ReviewFinalizeResult,
} from "./ports.js";
import type { ReviewFlag } from "./constants.js";
import type { Response, ResponseReview } from "../entities.js";

const isIsoTimestamp = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

const secondsBetween = (start: string, end: string): number =>
  (new Date(end).getTime() - new Date(start).getTime()) / 1000;

const countAnswerFlips = (responses: Response[]): number => {
  const sorted = [...responses].sort(
    (left, right) => left.responseVersion - right.responseVersion,
  );

  let flips = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].selectedOption !== sorted[index].selectedOption) {
      flips += 1;
    }
  }

  return flips;
};

export class ReviewEngine {
  constructor(private readonly deps: ReviewEngineDependencies) {}

  evaluate(context: ReviewEvaluationContext): ReviewEvaluationResult {
    const { proposition, task, response, responseHistory } = context;
    const flags = new Set<ReviewFlag>();

    if (response.confirmationOption !== response.selectedOption) {
      flags.add("confirmation_mismatch");
    }

    if (!response.understandingAck) {
      flags.add("understanding_unacknowledged");
    }

    const validClientTimestamps =
      isIsoTimestamp(response.clientStartedAt) &&
      isIsoTimestamp(response.clientSubmittedAt) &&
      new Date(response.clientStartedAt).getTime() <=
        new Date(response.clientSubmittedAt).getTime();

    if (!validClientTimestamps) {
      flags.add("invalid_timestamp");
    }

    const submittedLateByTask =
      new Date(response.submittedAt).getTime() >= new Date(task.expiresAt).getTime();
    const submittedAfterReveal =
      proposition.revealStartedAt !== null &&
      new Date(response.submittedAt).getTime() >=
        new Date(proposition.revealStartedAt).getTime();

    if (submittedLateByTask || submittedAfterReveal) {
      flags.add("late_submit");
    }

    if (
      flags.has("confirmation_mismatch") ||
      flags.has("understanding_unacknowledged") ||
      flags.has("invalid_timestamp") ||
      flags.has("late_submit")
    ) {
      return {
        status: "invalid",
        qualityScore: ARENA_ADJUDICATION_DEFAULTS.invalidQualityScore,
        flags: Array.from(flags),
      };
    }

    const durationSeconds = secondsBetween(
      response.clientStartedAt,
      response.clientSubmittedAt,
    );
    const isRevision = response.responseVersion > 1;

    if (
      !isRevision &&
      durationSeconds < ARENA_ADJUDICATION_DEFAULTS.fastSubmitThresholdSeconds
    ) {
      flags.add("fast_submit");
    }

    if (
      isRevision &&
      durationSeconds < ARENA_ADJUDICATION_DEFAULTS.fastRevisionThresholdSeconds
    ) {
      flags.add("fast_revision");
    }

    if (countAnswerFlips(responseHistory) >= 3) {
      flags.add("contradictory_revisions");
    }

    if (flags.size > 0) {
      return {
        status: "partial_valid",
        qualityScore: ARENA_ADJUDICATION_DEFAULTS.partialValidQualityScore,
        flags: Array.from(flags),
      };
    }

    return {
      status: "valid",
      qualityScore: ARENA_ADJUDICATION_DEFAULTS.validQualityScore,
      flags: [],
    };
  }

  async finalize(
    input: FinalizeResponseReviewInput,
  ): Promise<ReviewFinalizeResult> {
    const proposition = await this.deps.propositionRead.getById(input.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(input.propositionId);
    }

    const response = await this.deps.responses.getById(input.responseId);
    if (!response) {
      throw new ResponseNotFoundError(input.responseId);
    }

    const task = await this.deps.tasks.getById(response.taskId);
    if (!task) {
      throw new DispatchTaskNotFoundError(response.taskId);
    }

    const existingReview = await this.deps.reviews.getByResponseId(input.responseId);
    if (!existingReview) {
      throw new ResponseReviewNotFoundError(input.responseId);
    }

    if (
      existingReview.status !== "pending_review" ||
      existingReview.reviewedAt !== null
    ) {
      throw new ReviewAlreadyFinalizedError(input.responseId);
    }

    const responseHistory = await this.deps.responses.listByPropositionAndUser(
      proposition.id,
      response.userId,
    );

    const evaluation = this.evaluate({
      proposition,
      task,
      response,
      responseHistory,
    });

    const updatedReview: ResponseReview = {
      ...existingReview,
      status: evaluation.status,
      qualityScore: evaluation.qualityScore,
      flags: evaluation.flags,
      reviewedAt: input.reviewedAt,
    };

    return {
      review: await this.deps.reviews.update(updatedReview),
      counterRebuildRequired: true,
      rewardSyncRequired: true,
    };
  }
}
