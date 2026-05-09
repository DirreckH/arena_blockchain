import type {
  AdjudicationSurfaceContract,
} from "../service-contracts.js";
import type {
  AdjudicationTaskViewModel,
  RecordRewardSubmissionInput,
  SubmitAdjudicationResponseResult,
  SubmitResponseInput,
} from "../dto.js";
import { buildAdjudicationTaskViewModel } from "../adjudication/view-builders.js";
import { buildPublicProgressViewModel } from "./public-progress.js";
import {
  DispatchTaskNotFoundError,
  PropositionNotFoundError,
} from "../adjudication/errors.js";
import type {
  RewardLedgerAdjudicationSnapshot,
} from "../adjudication/ports.js";
import type {
  AdjudicationSurfaceDependencies,
} from "./ports.js";
import { TaskViewNotAccessibleError } from "./errors.js";

const sortTasksByAssignedAtDesc = <T extends { assignedAt: string }>(
  tasks: T[],
): T[] =>
  [...tasks].sort(
    (left, right) =>
      new Date(right.assignedAt).getTime() - new Date(left.assignedAt).getTime(),
  );

const toRewardSnapshot = (
  rewardLedger:
    | {
        status: RewardLedgerAdjudicationSnapshot["status"];
        pendingAmount: string;
        finalAmount: string | null;
      }
    | null
    | undefined,
): RewardLedgerAdjudicationSnapshot | null =>
  rewardLedger
    ? {
        status: rewardLedger.status,
        pendingAmount: rewardLedger.pendingAmount,
        finalAmount: rewardLedger.finalAmount,
      }
    : null;

export class AdjudicationSurface implements AdjudicationSurfaceContract {
  constructor(private readonly deps: AdjudicationSurfaceDependencies) {}

  async listTasksForUser(userId: string): Promise<AdjudicationTaskViewModel[]> {
    const now = this.deps.clock.now();
    const tasks = await this.deps.tasks.listByUser(userId);
    const views = await Promise.all(
      sortTasksByAssignedAtDesc(tasks).map((task) =>
        this.buildTaskViewForUser(task.id, userId, now),
      ),
    );

    return views;
  }

  async getTaskForUser(
    taskId: string,
    userId: string,
  ): Promise<AdjudicationTaskViewModel | null> {
    const task = await this.deps.tasks.getById(taskId);
    if (!task || task.userId !== userId) {
      return null;
    }

    return this.buildTaskViewForUser(taskId, userId, this.deps.clock.now());
  }

  async submitResponseForUser(
    input: SubmitResponseInput,
  ): Promise<SubmitAdjudicationResponseResult> {
    const submission = await this.deps.responseCommands.submit(input);

    if (!submission.duplicateRetry) {
      const rewardCommand: RecordRewardSubmissionInput = {
        propositionId: input.propositionId,
        userId: input.userId,
        responseId: submission.response.id,
        recordedAt: this.deps.clock.now(),
      };
      await this.deps.rewards.recordSubmission(rewardCommand);
    }

    const taskView = await this.getTaskForUser(submission.task.id, input.userId);
    if (!taskView) {
      throw new TaskViewNotAccessibleError(submission.task.id, input.userId);
    }

    return {
      taskView,
      responseId: submission.response.id,
      duplicateRetry: submission.duplicateRetry,
      reviewRequested: submission.reviewRequested,
      counterRebuildRequired: submission.counterRebuildRequired,
    };
  }

  private async buildTaskViewForUser(
    taskId: string,
    userId: string,
    now: string,
  ): Promise<AdjudicationTaskViewModel> {
    const task = await this.deps.tasks.getById(taskId);
    if (!task) {
      throw new DispatchTaskNotFoundError(taskId);
    }

    if (task.userId !== userId) {
      throw new TaskViewNotAccessibleError(taskId, userId);
    }

    const proposition = await this.deps.propositions.getById(task.propositionId);
    if (!proposition) {
      throw new PropositionNotFoundError(task.propositionId);
    }

    const latestResponse = await this.deps.responses.findLatestByPropositionAndUser(
      proposition.id,
      userId,
    );
    const latestReview = latestResponse
      ? await this.deps.reviews.getByResponseId(latestResponse.id)
      : null;
    const rewardLedger = await this.deps.rewards.getByPropositionAndUser(
      proposition.id,
      userId,
    );
    const counter = await this.deps.counters.getByPropositionId(proposition.id);

    return buildAdjudicationTaskViewModel({
      proposition,
      task,
      latestReview,
      rewardLedger: toRewardSnapshot(rewardLedger),
      publicProgress: buildPublicProgressViewModel({
        proposition,
        reviewedCount: counter?.reviewedResponses ?? 0,
        effectiveSampleCount:
          (counter?.validCount ?? 0) + (counter?.partialValidCount ?? 0),
        now,
      }),
      now,
    });
  }
}
