import { Injectable } from "@nestjs/common";
import type { AdjudicationTaskViewModel } from "@arena/shared";
import { buildAdjudicationTaskViewModel, buildPublicProgressViewModel } from "@arena/shared";

import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import { toSharedDispatchTask, toSharedProposition, toSharedReview } from "../arena-view.mapper";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { EffectiveSampleCounterRepository } from "../repositories/effective-sample-counter.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { RewardLedgerRepository } from "../repositories/reward-ledger.repository";

@Injectable()
export class AdjudicationViewService {
  constructor(
    private readonly propositions: PropositionRepository,
    private readonly tasks: DispatchTaskRepository,
    private readonly counters: EffectiveSampleCounterRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly rewards: RewardLedgerRepository,
  ) {}

  async listTasksForUser(userId: string): Promise<AdjudicationTaskViewModel[]> {
    const tasks = await this.tasks.listByUser(userId);
    return Promise.all(tasks.map((task) => this.getTaskForUser(task.id, userId)));
  }

  async getTaskForUser(
    taskId: string,
    userId: string,
  ): Promise<AdjudicationTaskViewModel> {
    const task = await this.tasks.findById(taskId);
    if (!task) {
      throw new ArenaNotFoundError(
        "dispatch_task.not_found",
        `Dispatch task ${taskId} was not found`,
      );
    }

    if (task.userId !== userId) {
      throw new ArenaValidationError(
        "dispatch_task.owner_mismatch",
        "The task does not belong to the current user",
      );
    }

    const proposition = await this.propositions.findById(task.propositionId);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${task.propositionId} was not found`,
      );
    }

    const latestResponse = await this.responses.findLatestByPropositionAndUser(
      proposition.id,
      userId,
    );
    const latestReview = latestResponse
      ? await this.reviews.findByResponseId(latestResponse.id)
      : null;
    const rewardLedger = await this.rewards.findByPropositionAndUser(
      proposition.id,
      userId,
    );
    const counter = await this.counters.findByPropositionId(proposition.id);
    const sharedProposition = toSharedProposition(proposition);

    return buildAdjudicationTaskViewModel({
      proposition: sharedProposition,
      task: toSharedDispatchTask(task),
      latestReview: toSharedReview(latestReview),
      rewardLedger: rewardLedger
        ? {
            status: rewardLedger.status,
            pendingAmount: rewardLedger.pendingAmount,
            finalAmount: rewardLedger.finalAmount,
          }
        : null,
      publicProgress: buildPublicProgressViewModel({
        proposition: sharedProposition,
        reviewedCount: counter?.reviewedResponses ?? 0,
        effectiveSampleCount:
          (counter?.validCount ?? 0) + (counter?.partialValidCount ?? 0),
        now: new Date().toISOString(),
      }),
      now: new Date().toISOString(),
    });
  }
}
