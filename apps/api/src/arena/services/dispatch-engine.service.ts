import { Injectable } from "@nestjs/common";
import type { DispatchTask, Proposition } from "@prisma/client";
import {
  DispatchSelectionEngine,
  buildRespondentTaskViewModel,
  type DispatchCandidateRankingSnapshot,
  type DispatchSelectionResult,
  type Proposition as SharedProposition,
  type RespondentTaskViewModel,
} from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  CreateDispatchTasksForPropositionInput,
  DispatchSelectionInternalViewModel,
  ExpireDispatchTaskInput,
  PreviewDispatchCandidatesInput,
  SkipDispatchTaskInput,
  StartDispatchTaskInput,
} from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ArenaUserRepository } from "../repositories/arena-user.repository";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { UserReputationRepository } from "../repositories/user-reputation.repository";
import { UserTagRepository } from "../repositories/user-tag.repository";
import type { ArenaDbClient } from "../prisma.types";
import { toDate } from "../arena.utils";
import { DispatchTaskService } from "./dispatch-task.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;
const ACTIVE_TASK_STATUSES = new Set(["assigned", "started"]);
const EXPERIENCED_USER_MIN_REVIEWED_RESPONSES = 3;

@Injectable()
export class DispatchEngineService {
  private readonly selectionEngine = new DispatchSelectionEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly tasks: DispatchTaskRepository,
    private readonly responses: ResponseRepository,
    private readonly users: ArenaUserRepository,
    private readonly reputations: UserReputationRepository,
    private readonly tags: UserTagRepository,
    private readonly dispatchTasks: DispatchTaskService,
  ) {}

  async createDispatchTasksForProposition(
    input: CreateDispatchTasksForPropositionInput,
    db?: ArenaDbClient,
  ): Promise<DispatchTask[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      if (proposition.status !== "live") {
        throw new ArenaValidationError(
          "dispatch_task.proposition_not_live",
          "Tasks can only be assigned while the proposition is live",
        );
      }

      const userIds = this.normalizeUserIds(input.userIds);
      const maxAssignments = this.resolveMaxAssignments(
        input.maxAssignments,
        userIds.length,
      );
      const preview = await this.evaluateSelection(
        proposition,
        userIds,
        input.assignedAt,
        maxAssignments,
        tx,
      );
      const selectedSet = new Set(preview.selectedUserIds);
      const selectedOrder =
        maxAssignments >= userIds.length
          ? userIds.filter((userId) => selectedSet.has(userId))
          : preview.selectedUserIds;
      const created: DispatchTask[] = [];

      for (const userId of selectedOrder) {
        const latestResponse =
          await this.responses.findLatestByPropositionAndUser(
            proposition.id,
            userId,
            tx,
          );
        if (latestResponse) {
          continue;
        }

        try {
          created.push(
            await this.dispatchTasks.assignTask(
              {
                propositionId: proposition.id,
                userId,
                assignedAt: input.assignedAt,
                expiresAt: input.expiresAt,
              },
              tx,
            ),
          );
        } catch (error) {
          if (error instanceof ArenaConflictError) {
            continue;
          }

          throw error;
        }
      }

      return created;
    });
  }

  async previewDispatchCandidates(
    input: PreviewDispatchCandidatesInput,
    db?: ArenaDbClient,
  ): Promise<DispatchSelectionInternalViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      const userIds = this.normalizeUserIds(input.userIds);
      const maxAssignments = this.resolveMaxAssignments(
        input.maxAssignments,
        userIds.length,
      );
      const selection = await this.evaluateSelection(
        proposition,
        userIds,
        input.assignedAt,
        maxAssignments,
        tx,
      );

      return this.toInternalViewModel(proposition, selection);
    });
  }

  async listAssignedTasksForUser(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<RespondentTaskViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const tasks = await this.tasks.listByUser(userId, tx);
      const views = await Promise.all(
        tasks.map(async (task) => {
          const proposition = await this.getRequiredProposition(task.propositionId, tx);
          if (proposition.status !== "live") {
            return null;
          }

          return buildRespondentTaskViewModel({
            proposition: this.toSharedProposition(proposition),
            task: {
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
            },
          });
        }),
      );

      return views.filter((view): view is RespondentTaskViewModel => view !== null);
    });
  }

  async startTask(
    input: StartDispatchTaskInput,
    db?: ArenaDbClient,
  ): Promise<DispatchTask> {
    return this.dispatchTasks.startTask(input, db);
  }

  async skipTask(
    input: SkipDispatchTaskInput,
    db?: ArenaDbClient,
  ): Promise<DispatchTask> {
    return this.dispatchTasks.skipTask(input, db);
  }

  async expireTask(
    input: ExpireDispatchTaskInput,
    db?: ArenaDbClient,
  ): Promise<DispatchTask> {
    return this.dispatchTasks.expireTask(input, db);
  }

  private async getRequiredProposition(
    propositionId: string,
    db: ArenaDbClient,
  ): Promise<Proposition> {
    const proposition = await this.propositions.findById(propositionId, db);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${propositionId} was not found`,
      );
    }

    return proposition;
  }

  private normalizeUserIds(userIds: string[]): string[] {
    const normalized = Array.from(
      new Set(userIds.map((userId) => userId.trim()).filter(Boolean)),
    );

    if (normalized.length === 0) {
      throw new ArenaValidationError(
        "dispatch_task.empty_recipient_list",
        "At least one userId must be provided for dispatch",
      );
    }

    return normalized;
  }

  private resolveMaxAssignments(
    maxAssignments: number | undefined,
    candidateCount: number,
  ): number {
    if (maxAssignments === undefined) {
      return candidateCount;
    }

    if (!Number.isInteger(maxAssignments) || maxAssignments <= 0) {
      throw new ArenaValidationError(
        "dispatch_task.invalid_max_assignments",
        "maxAssignments must be a positive integer when provided",
      );
    }

    return Math.min(maxAssignments, candidateCount);
  }

  private async evaluateSelection(
    proposition: Proposition,
    userIds: string[],
    assignedAt: string | Date,
    maxAssignments: number,
    db: ArenaDbClient,
  ): Promise<DispatchSelectionResult> {
    const assignedAtDate = toDate(assignedAt);
    const candidates = await Promise.all(
      userIds.map((userId) =>
        this.buildCandidateRankingSnapshot(
          proposition,
          userId,
          assignedAtDate,
          db,
        ),
      ),
    );

    return this.selectionEngine.select({
      proposition: this.toSharedProposition(proposition),
      candidates,
      maxAssignments,
    });
  }

  private async buildCandidateRankingSnapshot(
    proposition: Proposition,
    userId: string,
    assignedAt: Date,
    db: ArenaDbClient,
  ): Promise<DispatchCandidateRankingSnapshot> {
    const [tasks, reputation, tags, user] = await Promise.all([
      this.tasks.listByUser(userId, db),
      this.reputations.findByUserId(userId, db),
      this.tags.listCurrentByUser(userId, db),
      this.users.findById(userId, db),
    ]);
    const metrics = (reputation?.metricsJson ?? null) as
      | {
          reviewedResponseCount?: number;
          invalidRate?: number;
          anomalyRate?: number;
          fraudFlagCount?: number;
        }
      | null;
    const activeTagKeys = tags.map((tag) => tag.tagKey);
    const reviewedResponseCount = metrics?.reviewedResponseCount ?? 0;

    return {
      userId,
      userStatus: "active",
      matchesSampleConstraints: this.matchesSampleConstraints(
        proposition.sampleConstraints,
        {
          activeTagKeys,
          reviewedResponseCount,
          hasPrimaryWalletAddress:
            typeof user?.primaryWalletAddress === "string" &&
            user.primaryWalletAddress.trim().length > 0,
        },
      ),
      activeTaskCount: tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status))
        .length,
      hasActiveTaskForProposition: tasks.some(
        (task) =>
          task.propositionId === proposition.id &&
          ACTIVE_TASK_STATUSES.has(task.status),
      ),
      hasSubmittedTaskForProposition: tasks.some(
        (task) =>
          task.propositionId === proposition.id && task.status === "submitted",
      ),
      isInCooldown: tasks.some(
        (task) =>
          task.cooldownUntil !== null &&
          task.cooldownUntil.getTime() > assignedAt.getTime(),
      ),
      reputationLevel: reputation?.reputationLevel ?? null,
      reputationScore: reputation?.reputationScore ?? null,
      reviewedResponseCount,
      invalidRate: metrics?.invalidRate ?? 0,
      anomalyRate: metrics?.anomalyRate ?? 0,
      fraudFlagCount: metrics?.fraudFlagCount ?? 0,
      activeTagKeys,
    };
  }

  private matchesSampleConstraints(
    sampleConstraints: readonly string[],
    candidate: {
      activeTagKeys: readonly string[];
      reviewedResponseCount: number;
      hasPrimaryWalletAddress: boolean;
    },
  ): boolean {
    if (sampleConstraints.length === 0) {
      return true;
    }

    const tagKeys = new Set(candidate.activeTagKeys);

    return sampleConstraints.every((constraint) => {
      switch (constraint) {
        case "wallet_signed":
          return candidate.hasPrimaryWalletAddress;
        case "experienced_user":
          return (
            candidate.reviewedResponseCount >=
            EXPERIENCED_USER_MIN_REVIEWED_RESPONSES
          );
        default:
          return tagKeys.has(constraint);
      }
    });
  }

  private toInternalViewModel(
    proposition: Proposition,
    selection: DispatchSelectionResult,
  ): DispatchSelectionInternalViewModel {
    return {
      propositionId: proposition.id,
      propositionCategory: proposition.category,
      ruleVersion: selection.ruleVersion,
      maxAssignments: selection.maxAssignments,
      generalReserveCount: selection.generalReserveCount,
      selectedUserIds: [...selection.selectedUserIds],
      candidates: selection.candidates.map((candidate) => ({
        userId: candidate.userId,
        eligible: candidate.eligible,
        selected: candidate.selected,
        blockReason: candidate.blockReason,
        priorityBucket: candidate.priorityBucket,
        baseScore: candidate.baseScore,
        qualityAdjustment: candidate.qualityAdjustment,
        interestAdjustment: candidate.interestAdjustment,
        finalScore: candidate.finalScore,
        matchedInterestTag: candidate.matchedInterestTag,
        reasons: [...candidate.reasons],
      })),
    };
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
}
