import { Injectable } from "@nestjs/common";
import type { Prisma, SystemKeyValue } from "@prisma/client";
import type {
  ResponseReview,
  ResponseReviewStatus,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaConflictError,
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
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";
import { assertResponseReviewTransition } from "../state-machines/response-review-state.machine";
import { toDate } from "../arena.utils";
import { ArenaUserIdentityService } from "./arena-user-identity.service";
import { InternalAuditService } from "./internal-audit.service";
import { RewardLedgerService } from "./reward-ledger.service";
import { ReputationService } from "./reputation.service";
import { TagService } from "./tag.service";

const RESPONSE_REVIEW_WORKFLOW_NAMESPACE = "arena.response_review.workflow";
const RESPONSE_REVIEW_AUDIT_ENTITY_TYPE = "response_review";
export const RESPONSE_REVIEW_CLAIM_TTL_SECONDS = 15 * 60;
const RESPONSE_REVIEW_CLAIM_TTL_MS =
  RESPONSE_REVIEW_CLAIM_TTL_SECONDS * 1000;

export type ResponseReviewWorkflowState =
  | "unclaimed"
  | "claimed"
  | "released"
  | "expired"
  | "finalized";

export interface ResponseReviewWorkflowViewModel {
  responseId: string;
  reviewStatus: ResponseReviewStatus;
  workflowState: ResponseReviewWorkflowState;
  claimedByUserId: string | null;
  claimedAt: string | null;
  releasedByUserId: string | null;
  releasedAt: string | null;
  expiredAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  finalizedReviewStatus: ResponseReviewStatus | null;
  claimStaleAfterSeconds: number;
  isClaimStale: boolean;
}

interface ClaimPendingReviewInput {
  responseId: string;
  claimedAt: string;
  claimedByUserId: string;
  note?: string;
}

interface ReleasePendingReviewInput {
  responseId: string;
  releasedAt: string;
  releasedByUserId: string;
  note?: string;
}

type StoredResponseReviewWorkflowRecord = {
  responseId: string;
  workflowState: Exclude<ResponseReviewWorkflowState, "unclaimed">;
  claimedByUserId: string | null;
  claimedAt: string | null;
  releasedByUserId: string | null;
  releasedAt: string | null;
  expiredAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  finalizedReviewStatus: ResponseReviewStatus | null;
  updatedAt: string;
  note: string | null;
};

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
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly audits: InternalAuditService,
    private readonly rewards: RewardLedgerService,
    private readonly reputation: ReputationService,
    private readonly tags: TagService,
    private readonly userIdentity: ArenaUserIdentityService,
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

  async claimPendingReview(
    input: ClaimPendingReviewInput,
    db?: ArenaDbClient,
  ): Promise<ResponseReviewWorkflowViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.claimedByUserId,
        undefined,
        tx,
      );
      const review = await this.markPendingReview(input.responseId, tx);
      if (review.status !== "pending_review") {
        throw new ArenaConflictError(
          "response_review.claim_not_allowed",
          "Only pending response reviews can be claimed",
        );
      }

      const claimedAt = toDate(input.claimedAt);
      const next = await this.claimPendingReviewInTransaction(
        review,
        {
          claimedAt,
          claimedByUserId: input.claimedByUserId,
          note: input.note ?? null,
          source: "manual_claim",
        },
        tx,
      );

      return this.buildWorkflowViewModel(review, next, claimedAt);
    });
  }

  async releasePendingReview(
    input: ReleasePendingReviewInput,
    db?: ArenaDbClient,
  ): Promise<ResponseReviewWorkflowViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.releasedByUserId,
        undefined,
        tx,
      );
      const review = await this.markPendingReview(input.responseId, tx);
      if (review.status !== "pending_review") {
        throw new ArenaConflictError(
          "response_review.release_not_allowed",
          "Only pending response reviews can be released",
        );
      }

      const releasedAt = toDate(input.releasedAt);
      const stored = await this.getStoredWorkflowRecord(review.responseId, tx);
      if (!stored || stored.workflowState !== "claimed") {
        throw new ArenaConflictError(
          "response_review.release_not_claimed",
          "Pending response review is not currently claimed",
        );
      }

      if (stored.claimedByUserId !== input.releasedByUserId) {
        throw new ArenaConflictError(
          "response_review.release_conflict",
          "Pending response review is claimed by another operator",
        );
      }

      const next: StoredResponseReviewWorkflowRecord = {
        ...stored,
        workflowState: "released",
        releasedByUserId: input.releasedByUserId,
        releasedAt: releasedAt.toISOString(),
        expiredAt: null,
        updatedAt: releasedAt.toISOString(),
        note: input.note ?? stored.note ?? null,
      };
      await this.persistWorkflowRecord(next, tx);
      await this.recordWorkflowAudit(
        review.responseId,
        "response_review.released",
        input.releasedByUserId,
        "response_review.released",
        input.note ?? null,
        {
          workflowState: next.workflowState,
          claimedByUserId: next.claimedByUserId,
          claimedAt: next.claimedAt,
          releasedAt: next.releasedAt,
        },
        tx,
      );

      return this.buildWorkflowViewModel(review, next, releasedAt);
    });
  }

  async getReviewWorkflowState(
    responseId: string,
    db?: ArenaDbClient,
  ): Promise<ResponseReviewWorkflowViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const review = await this.markPendingReview(responseId, tx);
      const stored = await this.getStoredWorkflowRecord(responseId, tx);
      return this.buildWorkflowViewModel(review, stored, new Date());
    });
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
        if (input.reviewedByUserId) {
          await this.userIdentity.ensureUserExists(
            input.reviewedByUserId,
            undefined,
            tx,
          );
        }
        if (isSameFinalizedReview(review, input, reasonCodes)) {
          await this.persistFinalizedWorkflowRecord(
            review,
            input.status,
            tx,
          );
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
        await this.persistFinalizedWorkflowRecord(
          correctedReview,
          correctedReview.status,
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

      if (input.reviewedByUserId) {
        await this.userIdentity.ensureUserExists(
          input.reviewedByUserId,
          undefined,
          tx,
        );
        await this.ensurePendingReviewOwnershipForFinalization(
          review,
          input.reviewedByUserId,
          input.reviewedAt,
          tx,
        );
      }

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
      await this.persistFinalizedWorkflowRecord(
        finalizedReview,
        finalizedReview.status,
        tx,
      );
      await this.recordWorkflowAudit(
        finalizedReview.responseId,
        "response_review.finalized",
        finalizedReview.reviewedByUserId,
        "response_review.finalized",
        null,
        {
          finalStatus: finalizedReview.status,
          reviewedAt: finalizedReview.reviewedAt?.toISOString() ?? null,
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

  private async ensurePendingReviewOwnershipForFinalization(
    review: ResponseReview,
    reviewedByUserId: string,
    reviewedAtInput: ReviewFinalizationInput["reviewedAt"],
    db: ArenaDbClient,
  ): Promise<void> {
    const reviewedAt = toDate(reviewedAtInput);
    const stored = await this.getStoredWorkflowRecord(review.responseId, db);
    const workflow = this.buildWorkflowViewModel(review, stored, reviewedAt);

    if (
      workflow.workflowState === "claimed" &&
      workflow.claimedByUserId !== reviewedByUserId
    ) {
      throw new ArenaConflictError(
        "response_review.review_claim_conflict",
        "Pending response review is already claimed by another operator",
      );
    }

    if (
      workflow.workflowState === "claimed" &&
      workflow.claimedByUserId === reviewedByUserId
    ) {
      return;
    }

    await this.claimPendingReviewInTransaction(
      review,
      {
        claimedAt: reviewedAt,
        claimedByUserId: reviewedByUserId,
        note: null,
        source: "auto_finalize_claim",
      },
      db,
    );
  }

  private async claimPendingReviewInTransaction(
    review: ResponseReview,
    input: {
      claimedAt: Date;
      claimedByUserId: string;
      note: string | null;
      source: "manual_claim" | "auto_finalize_claim";
    },
    db: ArenaDbClient,
  ): Promise<StoredResponseReviewWorkflowRecord> {
    const stored = await this.getStoredWorkflowRecord(review.responseId, db);
    const workflow = this.buildWorkflowViewModel(review, stored, input.claimedAt);

    if (workflow.workflowState === "finalized") {
      throw new ArenaConflictError(
        "response_review.claim_not_allowed",
        "Finalized response reviews cannot be claimed",
      );
    }

    if (
      workflow.workflowState === "claimed" &&
      workflow.claimedByUserId !== input.claimedByUserId
    ) {
      throw new ArenaConflictError(
        "response_review.claim_conflict",
        "Pending response review is already claimed by another operator",
      );
    }

    if (
      workflow.workflowState === "expired" &&
      stored?.claimedByUserId &&
      stored.claimedByUserId !== input.claimedByUserId
    ) {
      await this.recordWorkflowAudit(
        review.responseId,
        "response_review.claim_expired",
        stored.claimedByUserId,
        "response_review.claim_expired",
        stored.note ?? null,
        {
          previousClaimedByUserId: stored.claimedByUserId,
          previousClaimedAt: stored.claimedAt,
          expiredAt: input.claimedAt.toISOString(),
        },
        db,
      );
    }

    const next: StoredResponseReviewWorkflowRecord = {
      responseId: review.responseId,
      workflowState: "claimed",
      claimedByUserId: input.claimedByUserId,
      claimedAt: input.claimedAt.toISOString(),
      releasedByUserId: null,
      releasedAt: null,
      expiredAt: null,
      reviewedByUserId: null,
      reviewedAt: null,
      finalizedReviewStatus: null,
      updatedAt: input.claimedAt.toISOString(),
      note: input.note,
    };
    await this.persistWorkflowRecord(next, db);
    await this.recordWorkflowAudit(
      review.responseId,
      "response_review.claimed",
      input.claimedByUserId,
      "response_review.claimed",
      input.note,
      {
        workflowState: next.workflowState,
        claimedByUserId: next.claimedByUserId,
        claimedAt: next.claimedAt,
        source: input.source,
      },
      db,
    );

    return next;
  }

  private async persistFinalizedWorkflowRecord(
    review: ResponseReview,
    finalStatus: ResponseReviewStatus,
    db: ArenaDbClient,
  ): Promise<void> {
    const updatedAt =
      review.reviewedAt?.toISOString() ??
      new Date().toISOString();
    const existing = await this.getStoredWorkflowRecord(review.responseId, db);
    const next: StoredResponseReviewWorkflowRecord = {
      responseId: review.responseId,
      workflowState: "finalized",
      claimedByUserId: existing?.claimedByUserId ?? review.reviewedByUserId,
      claimedAt: existing?.claimedAt ?? review.reviewedAt?.toISOString() ?? null,
      releasedByUserId: existing?.releasedByUserId ?? null,
      releasedAt: existing?.releasedAt ?? null,
      expiredAt: existing?.expiredAt ?? null,
      reviewedByUserId: review.reviewedByUserId,
      reviewedAt: review.reviewedAt?.toISOString() ?? null,
      finalizedReviewStatus: finalStatus,
      updatedAt,
      note: existing?.note ?? null,
    };
    await this.persistWorkflowRecord(next, db);
  }

  private buildWorkflowViewModel(
    review: ResponseReview,
    stored: StoredResponseReviewWorkflowRecord | null,
    asOf: Date,
  ): ResponseReviewWorkflowViewModel {
    const isFinalized = review.status !== "pending_review";
    const isClaimStale = this.isClaimStaleAt(stored, asOf);
    const workflowState: ResponseReviewWorkflowState = isFinalized
      ? "finalized"
      : stored?.workflowState === "released"
        ? "released"
        : stored?.workflowState === "expired"
          ? "expired"
          : stored?.workflowState === "claimed" && isClaimStale
            ? "expired"
            : stored?.workflowState === "claimed"
              ? "claimed"
              : "unclaimed";

    return {
      responseId: review.responseId,
      reviewStatus: review.status,
      workflowState,
      claimedByUserId: stored?.claimedByUserId ?? null,
      claimedAt: stored?.claimedAt ?? null,
      releasedByUserId: stored?.releasedByUserId ?? null,
      releasedAt: stored?.releasedAt ?? null,
      expiredAt:
        workflowState === "expired"
          ? stored?.expiredAt ??
            (stored?.claimedAt
              ? new Date(
                  Date.parse(stored.claimedAt) + RESPONSE_REVIEW_CLAIM_TTL_MS,
                ).toISOString()
              : null)
          : stored?.expiredAt ?? null,
      reviewedByUserId: review.reviewedByUserId ?? stored?.reviewedByUserId ?? null,
      reviewedAt: review.reviewedAt?.toISOString() ?? stored?.reviewedAt ?? null,
      finalizedReviewStatus: isFinalized ? review.status : null,
      claimStaleAfterSeconds: RESPONSE_REVIEW_CLAIM_TTL_SECONDS,
      isClaimStale,
    };
  }

  private isClaimStaleAt(
    stored: StoredResponseReviewWorkflowRecord | null,
    asOf: Date,
  ): boolean {
    if (!stored || stored.workflowState !== "claimed" || !stored.claimedAt) {
      return false;
    }

    return (
      asOf.getTime() - Date.parse(stored.claimedAt) >
      RESPONSE_REVIEW_CLAIM_TTL_MS
    );
  }

  private async getStoredWorkflowRecord(
    responseId: string,
    db: ArenaDbClient,
  ): Promise<StoredResponseReviewWorkflowRecord | null> {
    const record = await this.systemKeyValues.findByKey(
      this.buildWorkflowStorageKey(responseId),
      db,
    );

    return this.parseStoredWorkflowRecord(record);
  }

  private parseStoredWorkflowRecord(
    record: SystemKeyValue | null,
  ): StoredResponseReviewWorkflowRecord | null {
    const value = record?.valueJson;
    if (!value || typeof value !== "object") {
      return null;
    }

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.responseId !== "string" ||
      typeof candidate.workflowState !== "string" ||
      typeof candidate.updatedAt !== "string"
    ) {
      return null;
    }

    const workflowState = candidate.workflowState;
    if (
      workflowState !== "claimed" &&
      workflowState !== "released" &&
      workflowState !== "expired" &&
      workflowState !== "finalized"
    ) {
      return null;
    }

    const finalizedReviewStatus = candidate.finalizedReviewStatus;
    return {
      responseId: candidate.responseId,
      workflowState,
      claimedByUserId:
        typeof candidate.claimedByUserId === "string"
          ? candidate.claimedByUserId
          : null,
      claimedAt:
        typeof candidate.claimedAt === "string" ? candidate.claimedAt : null,
      releasedByUserId:
        typeof candidate.releasedByUserId === "string"
          ? candidate.releasedByUserId
          : null,
      releasedAt:
        typeof candidate.releasedAt === "string"
          ? candidate.releasedAt
          : null,
      expiredAt:
        typeof candidate.expiredAt === "string" ? candidate.expiredAt : null,
      reviewedByUserId:
        typeof candidate.reviewedByUserId === "string"
          ? candidate.reviewedByUserId
          : null,
      reviewedAt:
        typeof candidate.reviewedAt === "string" ? candidate.reviewedAt : null,
      finalizedReviewStatus:
        finalizedReviewStatus === "pending_review" ||
        finalizedReviewStatus === "valid" ||
        finalizedReviewStatus === "partial_valid" ||
        finalizedReviewStatus === "invalid" ||
        finalizedReviewStatus === "fraud_suspected"
          ? finalizedReviewStatus
          : null,
      updatedAt: candidate.updatedAt,
      note: typeof candidate.note === "string" ? candidate.note : null,
    };
  }

  private async persistWorkflowRecord(
    record: StoredResponseReviewWorkflowRecord,
    db: ArenaDbClient,
  ): Promise<void> {
    const key = this.buildWorkflowStorageKey(record.responseId);
    await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena response review workflow state for ${record.responseId}`,
        valueJson: structuredClone(record) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena response review workflow state for ${record.responseId}`,
        valueJson: structuredClone(record) as unknown as Prisma.InputJsonValue,
      },
      db,
    );
  }

  private async recordWorkflowAudit(
    responseId: string,
    action: string,
    actorUserId: string | null,
    reason: string,
    note: string | null,
    metadata: Record<string, unknown>,
    db: ArenaDbClient,
  ): Promise<void> {
    await this.audits.record(
      {
        entityType: RESPONSE_REVIEW_AUDIT_ENTITY_TYPE,
        entityId: responseId,
        action,
        actorUserId,
        reason,
        note: note ?? undefined,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
      db,
    );
  }

  private buildWorkflowStorageKey(responseId: string): string {
    return `${RESPONSE_REVIEW_WORKFLOW_NAMESPACE}.${responseId}`;
  }
}
