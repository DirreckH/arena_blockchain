import { Injectable } from "@nestjs/common";
import type { Prisma, ResponseReview } from "@prisma/client";
import type {
  RespondentReputationInternalViewModel,
  RespondentReputationSummaryViewModel,
  UserReputation as SharedUserReputation,
} from "@arena/shared";
import { QualityReputationEngine } from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import { ArenaIdService } from "../arena-id.service";
import { withArenaTransaction } from "../arena-transaction.utils";
import { toSharedUserReputation } from "../arena-view.mapper";
import type { ArenaDbClient } from "../prisma.types";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { UserReputationRepository } from "../repositories/user-reputation.repository";
import { toDate, type TimestampInput } from "../arena.utils";
import { ArenaUserIdentityService } from "./arena-user-identity.service";

const CLOSED_TASK_STATUSES = new Set([
  "submitted",
  "skipped",
  "expired",
  "cancelled",
]);

const isFlaggedReview = (review: ResponseReview): boolean => review.flags.length > 0;

@Injectable()
export class ReputationService {
  private readonly engine = new QualityReputationEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly tasks: DispatchTaskRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly reputations: UserReputationRepository,
    private readonly userIdentity: ArenaUserIdentityService,
  ) {}

  async refreshForUser(
    userId: string,
    computedAt?: TimestampInput,
    db?: ArenaDbClient,
  ): Promise<SharedUserReputation> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(userId, undefined, tx);
      const [tasks, reviews, existing] = await Promise.all([
        this.tasks.listByUser(userId, tx),
        this.reviews.listFinalizedByUserId(userId, tx),
        this.reputations.findByUserId(userId, tx),
      ]);

      const computedAtDate = computedAt ? toDate(computedAt) : new Date();
      const nextReputation = this.engine.compute({
        userId,
        assignedTaskCount: tasks.length,
        closedTaskCount: tasks.filter((task) =>
          CLOSED_TASK_STATUSES.has(task.status),
        ).length,
        submittedTaskCount: tasks.filter((task) => task.status === "submitted")
          .length,
        reviewedResponseCount: reviews.length,
        validCount: reviews.filter((review) => review.status === "valid").length,
        partialValidCount: reviews.filter(
          (review) => review.status === "partial_valid",
        ).length,
        invalidCount: reviews.filter((review) => review.status === "invalid")
          .length,
        fraudFlagCount: reviews.filter(
          (review) => review.status === "fraud_suspected",
        ).length,
        flaggedReviewCount: reviews.filter(isFlaggedReview).length,
        anomalyCount: reviews.filter(
          (review) =>
            review.status === "fraud_suspected" || isFlaggedReview(review),
        ).length,
        computedAt: computedAtDate.toISOString(),
      });

      const persisted = await this.reputations.upsertByUserId(
        userId,
        {
          id: existing?.id ?? this.ids.next("reputation"),
          userId,
          reputationScore: nextReputation.reputationScore,
          reputationLevel: nextReputation.reputationLevel,
          ruleVersion: nextReputation.ruleVersion,
          metricsJson: nextReputation.metrics as unknown as Prisma.InputJsonValue,
          computedAt: computedAtDate,
        },
        this.toPersistenceInput(nextReputation),
        tx,
      );

      return toSharedUserReputation(persisted)!;
    });
  }

  async getByUserId(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<SharedUserReputation> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const existing = await this.reputations.findByUserId(userId, tx);
      if (existing) {
        return toSharedUserReputation(existing)!;
      }

      return this.refreshForUser(userId, undefined, tx);
    });
  }

  async getSummaryForUser(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<RespondentReputationSummaryViewModel> {
    const reputation = await this.getByUserId(userId, db);

    return {
      reputationScore: reputation.reputationScore,
      reputationLevel: reputation.reputationLevel,
      metrics: {
        completionRate: reputation.metrics.completionRate,
        validRate: reputation.metrics.validRate,
        partialValidRate: reputation.metrics.partialValidRate,
        invalidRate: reputation.metrics.invalidRate,
        anomalyRate: reputation.metrics.anomalyRate,
        fraudFlagCount: reputation.metrics.fraudFlagCount,
        reviewedResponseCount: reputation.metrics.reviewedResponseCount,
      },
      computedAt: reputation.computedAt,
    };
  }

  async getInternalViewForUser(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<RespondentReputationInternalViewModel> {
    const reputation = await this.getByUserId(userId, db);

    return {
      userId: reputation.userId,
      reputationScore: reputation.reputationScore,
      reputationLevel: reputation.reputationLevel,
      ruleVersion: reputation.ruleVersion,
      metrics: reputation.metrics,
      computedAt: reputation.computedAt,
    };
  }

  private toPersistenceInput(
    reputation: Pick<
      SharedUserReputation,
      "reputationScore" | "reputationLevel" | "ruleVersion" | "metrics" | "computedAt"
    >,
  ): Prisma.UserReputationUncheckedUpdateInput {
    return {
      reputationScore: reputation.reputationScore,
      reputationLevel: reputation.reputationLevel,
      ruleVersion: reputation.ruleVersion,
      metricsJson: reputation.metrics as unknown as Prisma.InputJsonValue,
      computedAt: toDate(reputation.computedAt),
    };
  }
}
