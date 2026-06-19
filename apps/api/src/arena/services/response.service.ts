import { Injectable } from "@nestjs/common";
import type { Response } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  GetUserResponseForTaskInput,
  SubmitResponseInput,
} from "../arena.types";
import {
  isUniqueConstraintError,
  withArenaTransaction,
} from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import {
  assertBinaryOption,
  assertBinaryOptions,
  buildResponsePayload,
  toDate,
} from "../arena.utils";
import { DispatchTaskService } from "./dispatch-task.service";
import { ResponseReviewService } from "./response-review.service";
import { RewardLedgerService } from "./reward-ledger.service";
import { ArenaUserIdentityService } from "./arena-user-identity.service";

@Injectable()
export class ResponseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly propositions: PropositionRepository,
    private readonly tasks: DispatchTaskRepository,
    private readonly responses: ResponseRepository,
    private readonly dispatchTasks: DispatchTaskService,
    private readonly reviews: ResponseReviewService,
    private readonly rewards: RewardLedgerService,
    private readonly userIdentity: ArenaUserIdentityService,
  ) {}

  async submitResponse(
    input: SubmitResponseInput,
    db?: ArenaDbClient,
  ): Promise<Response> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(input.userId, undefined, tx);
      const proposition = await this.propositions.findById(
        input.propositionId,
        tx,
      );
      if (!proposition) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          `Proposition ${input.propositionId} was not found`,
        );
      }

      if (proposition.status !== "live") {
        throw new ArenaValidationError(
          "response.proposition_not_live",
          "Responses can only be submitted while the proposition is live",
        );
      }

      assertBinaryOptions(proposition.options);
      assertBinaryOption(input.selectedOption, "selectedOption");
      assertBinaryOption(input.confirmationOption, "confirmationOption");

      if (input.selectedOption >= proposition.options.length) {
        throw new ArenaValidationError(
          "response.invalid_option",
          "Selected option is outside the proposition option range",
        );
      }

      const task = await this.tasks.findById(input.taskId, tx);
      if (!task) {
        throw new ArenaNotFoundError(
          "dispatch_task.not_found",
          `Dispatch task ${input.taskId} was not found`,
        );
      }

      if (task.propositionId !== input.propositionId || task.userId !== input.userId) {
        throw new ArenaValidationError(
          "response.task_mismatch",
          "The task does not belong to the specified proposition and user",
        );
      }

      const latestByTask = await this.responses.findLatestByTaskId(input.taskId, tx);
      if (latestByTask) {
        throw new ArenaConflictError(
          "response.duplicate_task_submission",
          "This task already has a submitted response",
        );
      }

      const latestByPropositionAndUser =
        await this.responses.findLatestByPropositionAndUser(
          input.propositionId,
          input.userId,
          tx,
        );
      if (latestByPropositionAndUser) {
        throw new ArenaConflictError(
          "response.duplicate_proposition_submission",
          "The user has already submitted a response for this proposition",
        );
      }

      if (!["assigned", "started"].includes(task.status)) {
        throw new ArenaValidationError(
          "response.task_not_submittable",
          "Responses can only be submitted from an assigned or started task",
        );
      }

      const submittedAt = toDate(input.submittedAt);
      if (submittedAt >= task.expiresAt) {
        throw new ArenaValidationError(
          "response.submit_after_expiry",
          "Responses cannot be submitted after task expiry",
        );
      }

      try {
        const response = await this.responses.createVersion(
          {
            id: input.id ?? this.ids.next("response"),
            propositionId: input.propositionId,
            taskId: input.taskId,
            userId: input.userId,
            responsePayload: buildResponsePayload(
              input.responsePayload,
              input.selectedOption,
              input.confirmationOption,
            ),
            responseVersion: 1,
            isLatest: true,
            selectedOption: input.selectedOption,
            confirmationOption: input.confirmationOption,
            clientStartedAt: toDate(input.clientStartedAt),
            clientSubmittedAt: toDate(input.clientSubmittedAt),
            understandingAck: input.understandingAck,
            submittedAt,
          },
          tx,
        );

        await this.reviews.markPendingReview(response.id, tx);
        await this.rewards.createPendingRewardForResponse(
          {
            propositionId: input.propositionId,
            responseId: response.id,
            userId: input.userId,
            createdAt: input.submittedAt,
          },
          tx,
        );

        await this.dispatchTasks.submitTask(
          {
            taskId: input.taskId,
            userId: input.userId,
            submittedAt,
          },
          tx,
        );

        return response;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ArenaConflictError(
            "response.version_conflict",
            "A newer response version was created concurrently for this task or user",
          );
        }

        throw error;
      }
    });
  }

  async replaceLatestVersion(
    input: SubmitResponseInput,
    db?: ArenaDbClient,
  ): Promise<Response> {
    // Legacy alias retained for compatibility. MVP runtime uses submitResponse() and does not support revisions.
    return this.submitResponse(input, db);
  }

  async getLatestResponse(
    taskId: string,
    db?: ArenaDbClient,
  ): Promise<Response | null> {
    return this.responses.findLatestByTaskId(taskId, db);
  }

  async getUserResponseForTask(
    input: GetUserResponseForTaskInput,
    db?: ArenaDbClient,
  ): Promise<Response | null> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const task = await this.tasks.findById(input.taskId, tx);
      if (!task) {
        throw new ArenaNotFoundError(
          "dispatch_task.not_found",
          `Dispatch task ${input.taskId} was not found`,
        );
      }

      if (task.userId !== input.userId) {
        throw new ArenaValidationError(
          "dispatch_task.owner_mismatch",
          "The task does not belong to the current user",
        );
      }

      return this.responses.findLatestByTaskId(input.taskId, tx);
    });
  }
}
