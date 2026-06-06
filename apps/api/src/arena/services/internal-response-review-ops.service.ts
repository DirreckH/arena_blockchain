import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import { ArenaNotFoundError } from "../arena.errors";
import type {
  InternalResponseReviewDetailViewModel,
  InternalResponseReviewQueueFilters,
  InternalResponseReviewQueueItemViewModel,
  InternalResponseReviewQueuePageViewModel,
} from "../internal-ops.types";
import type { ArenaDbClient } from "../prisma.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { ResponseReviewService } from "./response-review.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

const DEFAULT_OPS_PAGE_LIMIT = 25;
const MAX_OPS_PAGE_LIMIT = 100;

const normalizeSearch = (value?: string): string | null => {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
};

const clampLimit = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_OPS_PAGE_LIMIT;
  }
  return Math.min(MAX_OPS_PAGE_LIMIT, Math.max(1, Math.trunc(value ?? DEFAULT_OPS_PAGE_LIMIT)));
};

const clampOffset = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value ?? 0));
};

const compareStrings = (
  left: string,
  right: string,
  direction: "asc" | "desc",
): number => {
  const normalized = left.localeCompare(right);
  return direction === "asc" ? normalized : -normalized;
};

const compareNullableDates = (
  left: string | null,
  right: string | null,
  direction: "asc" | "desc",
): number => {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  const diff = leftTime - rightTime;
  return direction === "asc" ? diff : -diff;
};

@Injectable()
export class InternalResponseReviewOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly tasks: DispatchTaskRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewService,
  ) {}

  async listResponses(
    filters: InternalResponseReviewQueueFilters,
    db?: ArenaDbClient,
  ): Promise<InternalResponseReviewQueuePageViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const responses = await this.responses.listLatest(
        {
          propositionId: filters.propositionId,
        },
        tx,
      );
      const propositions = await this.propositions.listByIds(
        [...new Set(responses.map((response) => response.propositionId))],
        tx,
      );
      const propositionTitleById = new Map(
        propositions.map((proposition) => [proposition.id, proposition.title]),
      );

      const queue = await Promise.all(
        responses.map(async (response) => ({
          response,
          propositionTitle:
            propositionTitleById.get(response.propositionId) ??
            response.propositionId,
          workflow: await this.reviews.getReviewWorkflowState(response.id, tx),
        })),
      );
      const search = normalizeSearch(filters.search);
      const direction = filters.sortDirection ?? "desc";
      const limit = clampLimit(filters.limit);
      const offset = clampOffset(filters.offset);

      const items = queue
        .filter(
          ({ workflow }) =>
            !filters.reviewStatus || workflow.reviewStatus === filters.reviewStatus,
        )
        .filter(
          ({ workflow }) =>
            !filters.workflowState ||
            workflow.workflowState === filters.workflowState,
        )
        .filter(
          ({ workflow }) =>
            !filters.claimedByUserId ||
            workflow.claimedByUserId === filters.claimedByUserId,
        )
        .filter(
          ({ workflow }) => !filters.claimStaleOnly || workflow.isClaimStale,
        )
        .filter(({ response, propositionTitle, workflow }) => {
          if (!search) {
            return true;
          }

          return [
            response.id,
            response.propositionId,
            propositionTitle,
            response.userId,
            workflow.reviewStatus,
            workflow.workflowState,
            JSON.stringify(response.responsePayload ?? {}),
          ].some((value) => value.toLowerCase().includes(search));
        })
        .map(({ response, propositionTitle, workflow }) =>
          this.buildQueueItemViewModel(response, propositionTitle, workflow),
        )
        .sort((left, right) =>
          this.compareQueueItems(
            left,
            right,
            filters.sortBy ?? "submittedAt",
            direction,
          ),
        );

      return {
        items: items.slice(offset, offset + limit),
        totalCount: items.length,
        limit,
        offset,
      };
    });
  }

  async getResponseDetail(
    responseId: string,
    db?: ArenaDbClient,
  ): Promise<InternalResponseReviewDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const response = await this.responses.findById(responseId, tx);

      if (!response) {
        throw new ArenaNotFoundError(
          "response.not_found",
          `Response ${responseId} was not found`,
        );
      }

      const [proposition, task, workflow, review] = await Promise.all([
        this.propositions.findById(response.propositionId, tx),
        this.tasks.findById(response.taskId, tx),
        this.reviews.getReviewWorkflowState(response.id, tx),
        this.reviews.getReviewForResponse(response.id, tx),
      ]);
      if (!proposition) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          `Proposition ${response.propositionId} was not found`,
        );
      }
      if (!task) {
        throw new ArenaNotFoundError(
          "dispatch_task.not_found",
          `Dispatch task ${response.taskId} was not found`,
        );
      }

      return {
        response: {
          id: response.id,
          propositionId: response.propositionId,
          taskId: response.taskId,
          userId: response.userId,
          responseVersion: response.responseVersion,
          isLatest: response.isLatest,
          selectedOption: response.selectedOption,
          confirmationOption: response.confirmationOption,
          responsePayload: response.responsePayload,
          understandingAck: response.understandingAck,
          clientStartedAt: response.clientStartedAt.toISOString(),
          clientSubmittedAt: response.clientSubmittedAt.toISOString(),
          submittedAt: response.submittedAt.toISOString(),
        },
        proposition: {
          id: proposition.id,
          title: proposition.title,
          category: proposition.category,
          status: proposition.status,
        },
        task: {
          id: task.id,
          status: task.status,
          assignedAt: task.assignedAt.toISOString(),
          startedAt: toIso(task.startedAt),
          submittedAt: toIso(task.submittedAt),
          expiresAt: task.expiresAt.toISOString(),
        },
        workflow: {
          responseId: workflow.responseId,
          reviewStatus: workflow.reviewStatus,
          workflowState: workflow.workflowState,
          claimedByUserId: workflow.claimedByUserId,
          claimedAt: workflow.claimedAt,
          releasedByUserId: workflow.releasedByUserId,
          releasedAt: workflow.releasedAt,
          expiredAt: workflow.expiredAt,
          reviewedByUserId: workflow.reviewedByUserId,
          reviewedAt: workflow.reviewedAt,
          finalizedReviewStatus: workflow.finalizedReviewStatus,
          claimStaleAfterSeconds: workflow.claimStaleAfterSeconds,
          isClaimStale: workflow.isClaimStale,
        },
        currentReview: review
          ? {
              status: review.status,
              qualityScore: review.qualityScore,
              flags: [...review.flags],
              reasonCodes: [...review.reasonCodes],
              reviewedByUserId: review.reviewedByUserId,
              reviewedAt: toIso(review.reviewedAt),
            }
          : null,
      };
    });
  }

  private buildQueueItemViewModel(
    response: Awaited<ReturnType<ResponseRepository["findById"]>> extends infer TResult
      ? NonNullable<TResult>
      : never,
    propositionTitle: string,
    workflow: Awaited<
      ReturnType<ResponseReviewService["getReviewWorkflowState"]>
    >,
  ): InternalResponseReviewQueueItemViewModel {
    return {
      responseId: response.id,
      propositionId: response.propositionId,
      propositionTitle,
      userId: response.userId,
      submittedAt: response.submittedAt.toISOString(),
      reviewStatus: workflow.reviewStatus,
      workflowState: workflow.workflowState,
      claimedByUserId: workflow.claimedByUserId,
      claimedAt: workflow.claimedAt,
      isClaimStale: workflow.isClaimStale,
      claimStaleAfterSeconds: workflow.claimStaleAfterSeconds,
    };
  }

  private compareQueueItems(
    left: InternalResponseReviewQueueItemViewModel,
    right: InternalResponseReviewQueueItemViewModel,
    sortBy: NonNullable<InternalResponseReviewQueueFilters["sortBy"]>,
    direction: NonNullable<InternalResponseReviewQueueFilters["sortDirection"]>,
  ): number {
    switch (sortBy) {
      case "claimedAt":
        return (
          compareNullableDates(left.claimedAt, right.claimedAt, direction) ||
          compareNullableDates(left.submittedAt, right.submittedAt, direction)
        );
      case "propositionTitle":
        return (
          compareStrings(left.propositionTitle, right.propositionTitle, direction) ||
          compareNullableDates(left.submittedAt, right.submittedAt, "desc")
        );
      case "userId":
        return (
          compareStrings(left.userId, right.userId, direction) ||
          compareNullableDates(left.submittedAt, right.submittedAt, "desc")
        );
      case "workflowState":
        return (
          compareStrings(left.workflowState, right.workflowState, direction) ||
          compareNullableDates(left.submittedAt, right.submittedAt, "desc")
        );
      case "submittedAt":
      default:
        return (
          compareNullableDates(left.submittedAt, right.submittedAt, direction) ||
          compareStrings(left.responseId, right.responseId, direction)
        );
    }
  }
}
