import type { DispatchTask, Proposition, Response } from "../entities";
import type { ResponseReviewStatus } from "../enums";
import {
  ARENA_ADJUDICATION_DEFAULTS,
  type QualityReasonCode,
  type ReviewFlag,
} from "./constants";

export interface PendingReviewQualityContext {
  proposition: Proposition | null;
  task: DispatchTask | null;
  response: Response;
}

export interface PendingReviewQualityResult {
  validityStatus: Exclude<
    ResponseReviewStatus,
    "pending_review" | "fraud_suspected"
  >;
  qualityScore: number;
  flags: ReviewFlag[];
  reasonCodes: QualityReasonCode[];
  minimumDurationSeconds: number;
  observedDurationSeconds: number | null;
}

const parseTimestamp = (value: string): number | null => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isBinaryOption = (value: number): value is 0 | 1 => value === 0 || value === 1;

export const resolveMinimumResponseDurationSeconds = (
  _proposition: Proposition | null,
): number => ARENA_ADJUDICATION_DEFAULTS.minimumResponseDurationSeconds;

export class QualityEngine {
  evaluatePendingResponse(
    context: PendingReviewQualityContext,
  ): PendingReviewQualityResult {
    const minimumDurationSeconds = resolveMinimumResponseDurationSeconds(
      context.proposition,
    );
    const observedDurationSeconds = this.getObservedDurationSeconds(context.response);

    if (this.hasIntegrityViolation(context)) {
      return {
        validityStatus: "invalid",
        qualityScore: ARENA_ADJUDICATION_DEFAULTS.invalidQualityScore,
        flags: ["integrity_violation"],
        reasonCodes: ["integrity_violation"],
        minimumDurationSeconds,
        observedDurationSeconds,
      };
    }

    const flags = new Set<ReviewFlag>();
    const reasonCodes = new Set<QualityReasonCode>();

    if (
      observedDurationSeconds !== null &&
      observedDurationSeconds < minimumDurationSeconds
    ) {
      flags.add("suspicious_latency");
      reasonCodes.add("time_too_short");
    }

    if (
      context.response.confirmationOption !== context.response.selectedOption
    ) {
      flags.add("confirmation_mismatch");
      reasonCodes.add("confirmation_mismatch");
    }

    if (flags.size > 0) {
      return {
        validityStatus: "partial_valid",
        qualityScore: ARENA_ADJUDICATION_DEFAULTS.partialValidQualityScore,
        flags: Array.from(flags),
        reasonCodes: Array.from(reasonCodes),
        minimumDurationSeconds,
        observedDurationSeconds,
      };
    }

    return {
      validityStatus: "valid",
      qualityScore: ARENA_ADJUDICATION_DEFAULTS.validQualityScore,
      flags: [],
      reasonCodes: ["passes_quality_checks"],
      minimumDurationSeconds,
      observedDurationSeconds,
    };
  }

  private getObservedDurationSeconds(response: Response): number | null {
    const startedAt = parseTimestamp(response.clientStartedAt);
    const submittedAt = parseTimestamp(response.clientSubmittedAt);
    if (startedAt === null || submittedAt === null || submittedAt < startedAt) {
      return null;
    }

    return (submittedAt - startedAt) / 1000;
  }

  private hasIntegrityViolation(context: PendingReviewQualityContext): boolean {
    const { proposition, task, response } = context;
    if (!proposition || !task) {
      return true;
    }

    if (proposition.id !== response.propositionId) {
      return true;
    }

    if (proposition.structure !== "binary" || proposition.rollingMode !== "non_rolling") {
      return true;
    }

    if (proposition.options.length !== 2) {
      return true;
    }

    if (task.id !== response.taskId) {
      return true;
    }

    if (task.propositionId !== response.propositionId || task.userId !== response.userId) {
      return true;
    }

    if (task.status !== "submitted" || task.submittedAt === null) {
      return true;
    }

    if (!response.isLatest || response.responseVersion < 1) {
      return true;
    }

    if (
      !isBinaryOption(response.selectedOption) ||
      !isBinaryOption(response.confirmationOption)
    ) {
      return true;
    }

    if (
      response.selectedOption >= proposition.options.length ||
      response.confirmationOption >= proposition.options.length
    ) {
      return true;
    }

    const clientStartedAt = parseTimestamp(response.clientStartedAt);
    const clientSubmittedAt = parseTimestamp(response.clientSubmittedAt);
    const submittedAt = parseTimestamp(response.submittedAt);
    const taskAssignedAt = parseTimestamp(task.assignedAt);
    const taskStartedAt = task.startedAt ? parseTimestamp(task.startedAt) : null;
    const taskExpiresAt = parseTimestamp(task.expiresAt);

    if (
      clientStartedAt === null ||
      clientSubmittedAt === null ||
      submittedAt === null ||
      taskAssignedAt === null ||
      taskExpiresAt === null
    ) {
      return true;
    }

    if (clientSubmittedAt < clientStartedAt) {
      return true;
    }

    if (submittedAt < clientSubmittedAt || submittedAt < taskAssignedAt) {
      return true;
    }

    if (taskStartedAt !== null && taskStartedAt > submittedAt) {
      return true;
    }

    if (submittedAt >= taskExpiresAt) {
      return true;
    }

    return false;
  }
}
