import { Injectable } from "@nestjs/common";
import {
  buildEffectiveSampleCounterCounts,
  buildEffectiveSampleCounterSnapshot,
} from "../../../../../packages/shared/src/arena/adjudication/sample-counter-engine";
import { buildPublicProgressViewModel } from "../../../../../packages/shared/src/arena/application/public-progress";
import type { ResponseReview as SharedResponseReview } from "../../../../../packages/shared/src/arena/entities";
import type { Proposition as SharedProposition } from "../../../../../packages/shared/src/arena/entities";

import { PrismaService } from "../../database/prisma.service";
import { ArenaNotFoundError } from "../arena.errors";
import type {
  EffectiveSampleCounterSnapshot,
  PublicProgressSnapshot,
} from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { EffectiveSampleCounterRepository } from "../repositories/effective-sample-counter.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import type { Prisma } from "@prisma/client";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class EffectiveSampleCounterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly propositions: PropositionRepository,
    private readonly counters: EffectiveSampleCounterRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly markets: MarketRepository,
  ) {}

  async ensureCounter(
    propositionId: string,
    db?: ArenaDbClient,
  ) {
    // Low-level persistence helper retained for repository bootstrap and tests.
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.getRequiredProposition(propositionId, tx);
      return this.counters.createIfMissing(
        propositionId,
        this.ids.next("counter"),
        tx,
      );
    });
  }

  async rebuildCounter(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<EffectiveSampleCounterSnapshot> {
    // Backward-compatible alias. Formal runtime entry is rebuildCounterForProposition().
    return this.rebuildCounterForProposition(propositionId, db);
  }

  async rebuildCounterForProposition(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<EffectiveSampleCounterSnapshot> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(propositionId, tx);
      const latestResponses = await this.responses.listLatestByProposition(
        propositionId,
        tx,
      );
      const reviews = await this.reviews.listByPropositionId(propositionId, tx);
      const counts = buildEffectiveSampleCounterCounts({
        latestResponses: latestResponses.map((response) => ({ id: response.id })),
        reviews: reviews.map((review) => this.toSharedReview(review)),
      });

      const counter = await this.counters.upsertSnapshot(
        propositionId,
        this.ids.next("counter"),
        {
          totalResponses: counts.totalResponses,
          reviewedResponses: counts.reviewedResponses,
          validCount: counts.validCount,
          partialValidCount: counts.partialValidCount,
          invalidCount: counts.invalidCount,
        },
        tx,
      );

      const snapshot = buildEffectiveSampleCounterSnapshot({
        propositionId,
        minEffectiveSample: proposition.minEffectiveSample,
        counter: {
          totalResponses: counter.totalResponses,
          reviewedResponses: counter.reviewedResponses,
          validCount: counter.validCount,
          partialValidCount: counter.partialValidCount,
          invalidCount: counter.invalidCount,
          updatedAt: toIso(counter.updatedAt),
        },
      });

      await this.refreshPublicProgressRecord(propositionId, snapshot, tx);
      return snapshot;
    });
  }

  async getCounterSnapshot(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<EffectiveSampleCounterSnapshot> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(propositionId, tx);
      const counter =
        (await this.counters.findByPropositionId(propositionId, tx)) ??
        (await this.counters.createIfMissing(
          propositionId,
          this.ids.next("counter"),
          tx,
        ));

      return buildEffectiveSampleCounterSnapshot({
        propositionId,
        minEffectiveSample: proposition.minEffectiveSample,
        counter: {
          totalResponses: counter.totalResponses,
          reviewedResponses: counter.reviewedResponses,
          validCount: counter.validCount,
          partialValidCount: counter.partialValidCount,
          invalidCount: counter.invalidCount,
          updatedAt: toIso(counter.updatedAt),
        },
      });
    });
  }

  async getPublicProgress(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<PublicProgressSnapshot> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(propositionId, tx);
      const snapshot = await this.getCounterSnapshot(propositionId, tx);

      return buildPublicProgressViewModel({
        proposition: this.toSharedProposition(proposition),
        reviewedCount: snapshot.reviewedResponses,
        effectiveSampleCount: snapshot.effectiveSampleCount,
        now: new Date().toISOString(),
      });
    });
  }

  async maybeRefreshPublicProgress(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<PublicProgressSnapshot> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const snapshot = await this.getCounterSnapshot(propositionId, tx);
      return this.refreshPublicProgressRecord(propositionId, snapshot, tx);
    });
  }

  private async getRequiredProposition(
    propositionId: string,
    db: ArenaDbClient,
  ) {
    const proposition = await this.propositions.findById(propositionId, db);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${propositionId} was not found`,
      );
    }

    return proposition;
  }

  private async refreshPublicProgressRecord(
    propositionId: string,
    snapshot: EffectiveSampleCounterSnapshot,
    db: ArenaDbClient,
  ): Promise<PublicProgressSnapshot> {
    const proposition = await this.getRequiredProposition(propositionId, db);
    const publicProgress = buildPublicProgressViewModel({
      proposition: this.toSharedProposition(proposition),
      reviewedCount: snapshot.reviewedResponses,
      effectiveSampleCount: snapshot.effectiveSampleCount,
      now: new Date().toISOString(),
    });
    const market = await this.markets.findByPropositionId(propositionId, db);
    if (!market) {
      return publicProgress;
    }

    await this.markets.updatePublicProgress(
      market.id,
      publicProgress as unknown as Prisma.InputJsonValue,
      db,
    );
    return publicProgress;
  }

  private toSharedReview(review: {
    id: string;
    responseId: string;
    status: string;
    qualityScore: number;
    flags: string[];
    reasonCodes: string[];
    reviewedByUserId: string | null;
    reviewedAt: Date | null;
  }): SharedResponseReview {
    return {
      id: review.id,
      responseId: review.responseId,
      status: review.status as SharedResponseReview["status"],
      qualityScore: review.qualityScore,
      flags: [...review.flags],
      reasonCodes: [...review.reasonCodes],
      reviewedByUserId: review.reviewedByUserId,
      reviewedAt: review.reviewedAt ? review.reviewedAt.toISOString() : null,
    };
  }

  private toSharedProposition(proposition: {
    id: string;
    chainPkId: bigint | null;
    type: string;
    structure: string;
      rollingMode: string;
      marketEnabled: boolean;
      settlementTarget: string;
      category: string;
      title: string;
      description: string;
    options: string[];
    sampleConstraints: string[];
    minEffectiveSample: number;
    minBetAmount: string;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    rewardBudget: string;
    baseResponseReward: string;
    status: string;
    resultKind: string | null;
    winningOption: number | null;
    voidReason: string | null;
    publishedAt: Date | null;
    liveAt: Date | null;
    frozenAt: Date | null;
    revealStartedAt: Date | null;
    resultComputedAt: Date | null;
    settledAt: Date | null;
    closedAt: Date | null;
    archivedAt: Date | null;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
  }): SharedProposition {
    return {
      id: proposition.id,
      chainPkId:
        proposition.chainPkId === null ? null : Number(proposition.chainPkId),
      type: proposition.type as SharedProposition["type"],
        structure: proposition.structure as SharedProposition["structure"],
        rollingMode: proposition.rollingMode as SharedProposition["rollingMode"],
        marketEnabled: proposition.marketEnabled,
        settlementTarget:
          proposition.settlementTarget as SharedProposition["settlementTarget"],
        category: proposition.category as SharedProposition["category"],
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
      status: proposition.status as SharedProposition["status"],
      resultKind: proposition.resultKind as SharedProposition["resultKind"],
      winningOption:
        proposition.winningOption as SharedProposition["winningOption"],
      voidReason: proposition.voidReason as SharedProposition["voidReason"],
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
