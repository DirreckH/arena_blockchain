import { Injectable } from "@nestjs/common";
import type {
  ResponseReview,
  ResponseReviewStatus,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  ReviewFinalizationInput,
  ReviewResponseInput,
} from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { ResponseRepository } from "../repositories/response.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { assertResponseReviewTransition } from "../state-machines/response-review-state.machine";
import { toDate } from "../arena.utils";
import { RewardLedgerService } from "./reward-ledger.service";
import { ReputationService } from "./reputation.service";
import { TagService } from "./tag.service";

const isSameFinalizedReview = (
  review: ResponseReview,
  input: ReviewFinalizationInput,
  reasonCodes: string[],
): boolean =>
  review.status === input.status &&
  review.qualityScore === (input.qualityScore ?? 0) &&
  JSON.stringify(review.flags) === JSON.stringify([...(input.flags ?? [])]) &&
  JSON.stringify(review.reasonCodes) === JSON.stringify(reasonCodes) &&
  review.reviewedByUserId === (input.reviewedByUserId ?? null) &&
  review.reviewedAt?.toISOString() === toDate(input.reviewedAt).toISOString();

@Injectable()
export class ResponseReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly rewards: RewardLedgerService,
    private readonly reputation: ReputationService,
    private readonly tags: TagService,
  ) {}

  async markPendingReview(
    responseId: string,
    db?: ArenaDbClient,
  ): Promise<ResponseReview> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const response = await this.responses.findById(responseId, tx);
      if (!response) {
        throw new ArenaNotFoundError(
          "response.not_found",
          `Response ${responseId} was not found`,
        );
      }

      const existing = await this.reviews.findByResponseId(responseId, tx);
      if (existing) {
        return existing;
      }

      return this.reviews.create(
        {
          id: this.ids.next("review"),
          responseId,
          status: "pending_review",
        },
        tx,
      );
    });
  }

  async reviewValid(
    input: ReviewResponseInput,
    db?: ArenaDbClient,
  ): Promise<ResponseReview> {
    // Internal/testing adapter. Formal runtime entry is QualityEngineService.reviewPendingResponse().
    return this.finalizeReviewResult({ ...input, status: "valid" }, db);
  }

  async reviewPartialValid(
    input: ReviewResponseInput,
    db?: ArenaDbClient,
  ): Promise<ResponseReview> {
    // Internal/testing adapter. Formal runtime entry is QualityEngineService.reviewPendingResponse().
    return this.finalizeReviewResult({ ...input, status: "partial_valid" }, db);
  }

  async reviewInvalid(
    input: ReviewResponseInput,
    db?: ArenaDbClient,
  ): Promise<ResponseReview> {
    // Internal/testing adapter. Formal runtime entry is QualityEngineService.reviewPendingResponse().
    return this.finalizeReviewResult({ ...input, status: "invalid" }, db);
  }

  async reviewFraudSuspected(
    input: ReviewResponseInput,
    db?: ArenaDbClient,
  ): Promise<ResponseReview> {
    // Internal/testing adapter. Formal runtime entry is QualityEngineService.reviewPendingResponse().
    return this.finalizeReviewResult({ ...input, status: "fraud_suspected" }, db);
  }

  async finalizeReviewResult(
    input: ReviewFinalizationInput,
    db?: ArenaDbClient,
  ): Promise<ResponseReview> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      if (!(await this.responses.findById(input.responseId, tx))) {
        throw new ArenaNotFoundError(
          "response.not_found",
          `Response ${input.responseId} was not found`,
        );
      }

      const reasonCodes = [...(input.reasonCodes ?? [])];
      if (reasonCodes.length === 0) {
        throw new ArenaValidationError(
          "response_review.reason_required",
          "Final review states must include at least one reason code",
        );
      }

      const review = await this.markPendingReview(input.responseId, tx);
      const response = await this.responses.findById(input.responseId, tx);
      if (!response) {
        throw new ArenaNotFoundError(
          "response.not_found",
          `Response ${input.responseId} was not found`,
        );
      }

      if (review.status !== "pending_review") {
        if (isSameFinalizedReview(review, input, reasonCodes)) {
          await this.rewards.resolveFromReview(
            {
              propositionId: response.propositionId,
              responseId: response.id,
              reviewStatus: input.status,
              resolvedAt: input.reviewedAt,
              isLatest: response.isLatest,
              reasonCodes,
            },
            tx,
          );
          await this.reputation.refreshForUser(response.userId, input.reviewedAt, tx);
          await this.tags.refreshForUser(response.userId, input.reviewedAt, tx);
          return review;
        }

        const correctedReview = await this.reviews.update(
          input.responseId,
          {
            status: input.status,
            qualityScore: input.qualityScore ?? 0,
            flags: [...(input.flags ?? [])],
            reasonCodes,
            reviewedByUserId: input.reviewedByUserId,
            reviewedAt: toDate(input.reviewedAt),
          },
          tx,
        );

        await this.rewards.resolveFromReview(
          {
            propositionId: response.propositionId,
            responseId: response.id,
            reviewStatus: correctedReview.status,
            resolvedAt: input.reviewedAt,
            isLatest: response.isLatest,
            reasonCodes,
          },
          tx,
        );
        await this.reputation.refreshForUser(response.userId, input.reviewedAt, tx);
        await this.tags.refreshForUser(response.userId, input.reviewedAt, tx);

        return correctedReview;
      }

      assertResponseReviewTransition(
        review.status,
        input.status,
        "finalizeReview",
      );

      const finalizedReview = await this.reviews.update(
        input.responseId,
        {
          status: input.status,
          qualityScore: input.qualityScore ?? 0,
          flags: [...(input.flags ?? [])],
          reasonCodes,
          reviewedByUserId: input.reviewedByUserId,
          reviewedAt: toDate(input.reviewedAt),
        },
        tx,
      );

      await this.rewards.resolveFromReview(
        {
          propositionId: response.propositionId,
          responseId: response.id,
          reviewStatus: finalizedReview.status,
          resolvedAt: input.reviewedAt,
          isLatest: response.isLatest,
          reasonCodes,
        },
        tx,
      );
      await this.reputation.refreshForUser(response.userId, input.reviewedAt, tx);
      await this.tags.refreshForUser(response.userId, input.reviewedAt, tx);

      return finalizedReview;
    });
  }

  async getReviewForResponse(
    responseId: string,
    db?: ArenaDbClient,
  ): Promise<ResponseReview | null> {
    return this.reviews.findByResponseId(responseId, db);
  }

  async listPendingReviewsByProposition(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<ResponseReview[]> {
    return this.reviews.listPendingByPropositionId(propositionId, db);
  }
}
