import type { DispatchIneligibilityReason } from "./constants.js";

export class ArenaAdjudicationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class PropositionNotFoundError extends ArenaAdjudicationError {
  constructor(propositionId: string) {
    super(
      "PROPOSITION_NOT_FOUND",
      `Proposition ${propositionId} was not found.`,
    );
  }
}

export class PropositionNotLiveError extends ArenaAdjudicationError {
  constructor(propositionId: string) {
    super(
      "PROPOSITION_NOT_LIVE",
      `Proposition ${propositionId} is not in live status.`,
    );
  }
}

export class DispatchIneligibleError extends ArenaAdjudicationError {
  readonly reason: DispatchIneligibilityReason;

  constructor(reason: DispatchIneligibilityReason) {
    super(
      "DISPATCH_INELIGIBLE",
      `Dispatch candidate is not eligible: ${reason}.`,
    );
    this.reason = reason;
  }
}

export class DispatchTaskNotFoundError extends ArenaAdjudicationError {
  constructor(taskId: string) {
    super("DISPATCH_TASK_NOT_FOUND", `Dispatch task ${taskId} was not found.`);
  }
}

export class InvalidDispatchTransitionError extends ArenaAdjudicationError {
  constructor(taskId: string, currentStatus: string, targetStatus: string) {
    super(
      "INVALID_DISPATCH_TRANSITION",
      `Dispatch task ${taskId} cannot transition from ${currentStatus} to ${targetStatus}.`,
    );
  }
}

export class TaskOwnershipMismatchError extends ArenaAdjudicationError {
  constructor(taskId: string, userId: string) {
    super(
      "TASK_OWNERSHIP_MISMATCH",
      `Dispatch task ${taskId} does not belong to user ${userId}.`,
    );
  }
}

export class TaskExpiredError extends ArenaAdjudicationError {
  constructor(taskId: string, expiresAt: string) {
    super(
      "TASK_EXPIRED",
      `Dispatch task ${taskId} expired at ${expiresAt}.`,
    );
  }
}

export class ResponseNotFoundError extends ArenaAdjudicationError {
  constructor(responseId: string) {
    super("RESPONSE_NOT_FOUND", `Response ${responseId} was not found.`);
  }
}

export class ResponseRevisionMismatchError extends ArenaAdjudicationError {
  constructor(taskId: string, latestTaskId: string) {
    super(
      "RESPONSE_REVISION_MISMATCH",
      `Revision task ${taskId} does not match latest response task ${latestTaskId}.`,
    );
  }
}

export class TaskNotSubmittableError extends ArenaAdjudicationError {
  constructor(taskId: string, status: string) {
    super(
      "TASK_NOT_SUBMITTABLE",
      `Dispatch task ${taskId} cannot accept a response while in ${status}.`,
    );
  }
}

export class LateSubmissionError extends ArenaAdjudicationError {
  constructor(taskId: string, submittedAt: string) {
    super(
      "LATE_SUBMISSION",
      `Response for task ${taskId} was submitted too late at ${submittedAt}.`,
    );
  }
}

export class DuplicateLatestRetryError extends ArenaAdjudicationError {
  constructor(propositionId: string, userId: string) {
    super(
      "DUPLICATE_LATEST_RETRY",
      `Latest response for proposition ${propositionId} and user ${userId} already matches the submitted payload.`,
    );
  }
}

export class ResponseReviewNotFoundError extends ArenaAdjudicationError {
  constructor(responseId: string) {
    super(
      "RESPONSE_REVIEW_NOT_FOUND",
      `Response review for response ${responseId} was not found.`,
    );
  }
}

export class ReviewAlreadyFinalizedError extends ArenaAdjudicationError {
  constructor(responseId: string) {
    super(
      "REVIEW_ALREADY_FINALIZED",
      `Response review for response ${responseId} has already been finalized.`,
    );
  }
}
