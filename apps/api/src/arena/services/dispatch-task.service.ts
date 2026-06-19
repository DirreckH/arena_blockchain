import { Injectable } from "@nestjs/common";
import type { DispatchTask } from "@prisma/client";
import { ARENA_ADJUDICATION_DEFAULTS } from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  AssignDispatchTaskInput,
  ExpireDispatchTaskInput,
  SkipDispatchTaskInput,
  StartDispatchTaskInput,
  SubmitDispatchTaskInput,
} from "../arena.types";
import {
  isUniqueConstraintError,
  withArenaTransaction,
} from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { assertDispatchTaskTransition } from "../state-machines/dispatch-task-state.machine";
import { toDate } from "../arena.utils";
import { ArenaUserIdentityService } from "./arena-user-identity.service";
import { ReputationService } from "./reputation.service";
import { TagService } from "./tag.service";

const addSeconds = (value: Date, seconds: number): Date =>
  new Date(value.getTime() + seconds * 1000);

@Injectable()
export class DispatchTaskService {
  // Low-level task lifecycle primitive. Runtime callers should prefer
  // DispatchEngineService for assignment and respondent-facing task flow.
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly propositions: PropositionRepository,
    private readonly tasks: DispatchTaskRepository,
    private readonly userIdentity: ArenaUserIdentityService,
    private readonly reputation: ReputationService,
    private readonly tags: TagService,
  ) {}

  async assignTask(
    input: AssignDispatchTaskInput,
    db?: ArenaDbClient,
  ): Promise<DispatchTask> {
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
          "dispatch_task.proposition_not_live",
          "Tasks can only be assigned while the proposition is live",
        );
      }

      const assignedAt = toDate(input.assignedAt);
      const expiresAt = toDate(input.expiresAt);
      if (expiresAt <= assignedAt) {
        throw new ArenaValidationError(
          "dispatch_task.invalid_expiry",
          "Task expiry must be after assignment time",
        );
      }

      const existing = await this.tasks.findActiveByPropositionAndUser(
        input.propositionId,
        input.userId,
        tx,
      );
      if (existing) {
        throw new ArenaConflictError(
          "dispatch_task.active_duplicate",
          "The user already has an active task for this proposition",
        );
      }

      try {
        return await this.tasks.create(
          {
            id: input.id ?? this.ids.next("task"),
            propositionId: input.propositionId,
            userId: input.userId,
            status: "assigned",
            assignedAt,
            expiresAt,
          },
          tx,
        );
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ArenaConflictError(
            "dispatch_task.active_duplicate",
            "The user already has an active task for this proposition",
          );
        }

        throw error;
      }
    });
  }

  async startTask(
    input: StartDispatchTaskInput,
    db?: ArenaDbClient,
  ): Promise<DispatchTask> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const task = await this.getRequiredTask(input.taskId, tx);
      this.assertTaskOwner(task, input.userId);

      const proposition = await this.propositions.findById(task.propositionId, tx);
      if (!proposition) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          `Proposition ${task.propositionId} was not found`,
        );
      }

      if (proposition.status !== "live") {
        throw new ArenaValidationError(
          "dispatch_task.proposition_not_live",
          "Tasks can only be started while the proposition is live",
        );
      }

      const startedAt = toDate(input.startedAt);
      if (startedAt >= task.expiresAt) {
        throw new ArenaValidationError(
          "dispatch_task.start_after_expiry",
          "Cannot start a task after it has expired",
        );
      }

      assertDispatchTaskTransition(task.status, "started", "startTask");

      return this.tasks.updateStatus(
        input.taskId,
        "started",
        {
          startedAt,
        },
        tx,
      );
    });
  }

  async submitTask(
    input: SubmitDispatchTaskInput,
    db?: ArenaDbClient,
  ): Promise<DispatchTask> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const task = await this.getRequiredTask(input.taskId, tx);
      this.assertTaskOwner(task, input.userId);

      const submittedAt = toDate(input.submittedAt);
      if (submittedAt >= task.expiresAt) {
        throw new ArenaValidationError(
          "dispatch_task.submit_after_expiry",
          "Cannot submit a task after it has expired",
        );
      }

      assertDispatchTaskTransition(task.status, "submitted", "submitTask");

      const updatedTask = await this.tasks.updateStatus(
        input.taskId,
        "submitted",
        {
          submittedAt,
        },
        tx,
      );

      await this.reputation.refreshForUser(task.userId, input.submittedAt, tx);
      await this.tags.refreshForUser(task.userId, input.submittedAt, tx);

      return updatedTask;
    });
  }

  async skipTask(
    input: SkipDispatchTaskInput,
    db?: ArenaDbClient,
  ): Promise<DispatchTask> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const task = await this.getRequiredTask(input.taskId, tx);
      this.assertTaskOwner(task, input.userId);

      assertDispatchTaskTransition(task.status, "skipped", "skipTask");

      const updatedTask = await this.tasks.updateStatus(
        input.taskId,
        "skipped",
        {
          skipReason: input.skipReason,
          cooldownUntil: addSeconds(
            toDate(input.skippedAt),
            ARENA_ADJUDICATION_DEFAULTS.cooldownSeconds,
          ),
        },
        tx,
      );

      await this.reputation.refreshForUser(task.userId, input.skippedAt, tx);
      await this.tags.refreshForUser(task.userId, input.skippedAt, tx);

      return updatedTask;
    });
  }

  async expireTask(
    input: ExpireDispatchTaskInput,
    db?: ArenaDbClient,
  ): Promise<DispatchTask> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const task = await this.getRequiredTask(input.taskId, tx);

      const expiredAt = toDate(input.expiredAt);
      if (expiredAt < task.expiresAt) {
        throw new ArenaValidationError(
          "dispatch_task.expire_before_deadline",
          "Task cannot expire before its configured expiry time",
        );
      }

      assertDispatchTaskTransition(task.status, "expired", "expireTask");

      const updatedTask = await this.tasks.updateStatus(
        input.taskId,
        "expired",
        {
          expiryReason: input.expiryReason,
          cooldownUntil: addSeconds(
            expiredAt,
            ARENA_ADJUDICATION_DEFAULTS.cooldownSeconds,
          ),
        },
        tx,
      );

      await this.reputation.refreshForUser(task.userId, input.expiredAt, tx);
      await this.tags.refreshForUser(task.userId, input.expiredAt, tx);

      return updatedTask;
    });
  }

  private async getRequiredTask(
    taskId: string,
    db: ArenaDbClient,
  ): Promise<DispatchTask> {
    const task = await this.tasks.findById(taskId, db);
    if (!task) {
      throw new ArenaNotFoundError(
        "dispatch_task.not_found",
        `Dispatch task ${taskId} was not found`,
      );
    }

    return task;
  }

  private assertTaskOwner(task: DispatchTask, userId: string): void {
    if (task.userId !== userId) {
      throw new ArenaValidationError(
        "dispatch_task.owner_mismatch",
        "The task does not belong to the current user",
      );
    }
  }
}
