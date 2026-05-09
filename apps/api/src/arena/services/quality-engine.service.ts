import { Injectable } from "@nestjs/common";
import { QualityEngine } from "../../../../../packages/shared/src/arena/adjudication/quality-engine";
import type {
  DispatchTask as SharedDispatchTask,
  Proposition as SharedProposition,
  Response as SharedResponse,
} from "../../../../../packages/shared/src/arena/entities";
import type {
  DispatchTask,
  Proposition,
  Response,
  ResponseReview,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import { ArenaNotFoundError } from "../arena.errors";
import type { ReviewPendingResponseInput } from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import type { ArenaDbClient } from "../prisma.types";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { ResponseReviewService } from "./response-review.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class QualityEngineService {
  private readonly quality = new QualityEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly tasks: DispatchTaskRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewService,
  ) {}

  async reviewPendingResponse(
    input: ReviewPendingResponseInput,
    db?: ArenaDbClient,
  ): Promise<ResponseReview> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const response = await this.responses.findById(input.responseId, tx);
      if (!response) {
        throw new ArenaNotFoundError(
          "response.not_found",
          `Response ${input.responseId} was not found`,
        );
      }

      const proposition = await this.propositions.findById(
        response.propositionId,
        tx,
      );
      const task = await this.tasks.findById(response.taskId, tx);

      const evaluation = this.quality.evaluatePendingResponse({
        proposition: proposition ? this.toSharedProposition(proposition) : null,
        task: task ? this.toSharedTask(task) : null,
        response: this.toSharedResponse(response),
      });

      return this.reviews.finalizeReviewResult(
        {
          responseId: response.id,
          status: evaluation.validityStatus,
          qualityScore: evaluation.qualityScore,
          flags: [...evaluation.flags],
          reasonCodes: [...evaluation.reasonCodes],
          reviewedAt: input.reviewedAt,
          reviewedByUserId: input.reviewedByUserId,
        },
        tx,
      );
    });
  }

  async getReviewForResponse(
    responseId: string,
    db?: ArenaDbClient,
  ): Promise<ResponseReview | null> {
    return this.reviews.getReviewForResponse(responseId, db);
  }

  async listPendingReviewsByProposition(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<ResponseReview[]> {
    return this.reviews.listPendingReviewsByProposition(propositionId, db);
  }

  private toSharedProposition(proposition: Proposition): SharedProposition {
    return {
      id: proposition.id,
      chainPkId:
        proposition.chainPkId === null ? null : Number(proposition.chainPkId),
      type: proposition.type,
        structure: proposition.structure,
        rollingMode: proposition.rollingMode as "non_rolling",
        marketEnabled: proposition.marketEnabled,
        settlementTarget: proposition.settlementTarget,
        category: proposition.category,
        title: proposition.title,
        description: proposition.description,
      options: proposition.options as [string, string],
      sampleConstraints: [...proposition.sampleConstraints],
      minEffectiveSample: proposition.minEffectiveSample,
      minBetAmount: proposition.minBetAmount,
      minDurationSeconds: proposition.minDurationSeconds,
      maxDurationSeconds: proposition.maxDurationSeconds,
      rewardBudget: proposition.rewardBudget,
      baseResponseReward: proposition.baseResponseReward,
      status: proposition.status,
      resultKind: proposition.resultKind,
      winningOption: proposition.winningOption as 0 | 1 | null,
      voidReason: proposition.voidReason,
      publishedAt: toIso(proposition.publishedAt),
      liveAt: toIso(proposition.liveAt),
      frozenAt: toIso(proposition.frozenAt),
      revealStartedAt: toIso(proposition.revealStartedAt),
      resultComputedAt: toIso(proposition.resultComputedAt),
      settledAt: toIso(proposition.settledAt),
      closedAt: toIso(proposition.closedAt),
      archivedAt: toIso(proposition.archivedAt),
      createdByUserId: proposition.createdByUserId,
      createdAt: proposition.createdAt.toISOString(),
      updatedAt: proposition.updatedAt.toISOString(),
    };
  }

  private toSharedTask(task: DispatchTask): SharedDispatchTask {
    return {
      id: task.id,
      propositionId: task.propositionId,
      userId: task.userId,
      status: task.status,
      assignedAt: task.assignedAt.toISOString(),
      startedAt: toIso(task.startedAt),
      submittedAt: toIso(task.submittedAt),
      expiresAt: task.expiresAt.toISOString(),
      skipReason: task.skipReason,
      expiryReason: task.expiryReason,
      cooldownUntil: toIso(task.cooldownUntil),
    };
  }

  private toSharedResponse(response: Response): SharedResponse {
    return {
      id: response.id,
      propositionId: response.propositionId,
      taskId: response.taskId,
      userId: response.userId,
      responseVersion: response.responseVersion,
      isLatest: response.isLatest,
      selectedOption: response.selectedOption as 0 | 1,
      confirmationOption: response.confirmationOption as 0 | 1,
      clientStartedAt: response.clientStartedAt.toISOString(),
      clientSubmittedAt: response.clientSubmittedAt.toISOString(),
      understandingAck: response.understandingAck,
      submittedAt: response.submittedAt.toISOString(),
    };
  }
}
