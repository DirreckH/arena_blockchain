import type {
  AdjudicationTaskViewModel,
  RespondentTaskViewModel,
} from "../dto.js";
import type {
  BuildAdjudicationTaskViewModelInput,
  BuildRespondentTaskViewModelInput,
} from "./ports.js";

const addSeconds = (iso: string, seconds: number): string =>
  new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

const minIso = (left: string, right: string): string =>
  new Date(left).getTime() <= new Date(right).getTime() ? left : right;

const secondsRemaining = (deadline: string, now: string): number =>
  Math.max(
    0,
    Math.floor((new Date(deadline).getTime() - new Date(now).getTime()) / 1000),
  );

export const buildAdjudicationTaskViewModel = (
  input: BuildAdjudicationTaskViewModelInput,
): AdjudicationTaskViewModel => {
  const propositionDeadline = input.proposition.liveAt
    ? addSeconds(input.proposition.liveAt, input.proposition.maxDurationSeconds)
    : input.task.expiresAt;

  const effectiveDeadline = minIso(input.task.expiresAt, propositionDeadline);

  return {
    taskId: input.task.id,
    propositionId: input.proposition.id,
    title: input.proposition.title,
    description: input.proposition.description,
    options: input.proposition.options,
    propositionStatus: input.proposition.status,
    taskStatus: input.task.status,
    hasSubmitted:
      input.task.status === "submitted" || input.task.submittedAt !== null,
    timeRemainingSeconds: secondsRemaining(effectiveDeadline, input.now),
    latestResponseStatus: input.latestReview?.status ?? null,
    rewardStatus: input.rewardLedger?.status ?? null,
    rewardPendingAmount: input.rewardLedger?.pendingAmount ?? null,
    rewardFinalAmount: input.rewardLedger?.finalAmount ?? null,
    publicProgress: input.publicProgress,
  };
};

export const buildRespondentTaskViewModel = (
  input: BuildRespondentTaskViewModelInput,
): RespondentTaskViewModel => ({
  taskId: input.task.id,
  propositionId: input.proposition.id,
  title: input.proposition.title,
  description: input.proposition.description,
  options: input.proposition.options,
  propositionStatus: input.proposition.status,
  taskStatus: input.task.status,
  assignedAt: input.task.assignedAt,
  startedAt: input.task.startedAt,
  expiresAt: input.task.expiresAt,
  submittedAt: input.task.submittedAt,
  hasSubmitted:
    input.task.status === "submitted" || input.task.submittedAt !== null,
});
