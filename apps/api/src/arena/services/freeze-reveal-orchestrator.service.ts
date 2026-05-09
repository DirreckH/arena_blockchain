import { Injectable, Optional } from "@nestjs/common";
import {
  buildAdjudicationAggregate,
  evaluateFreezeRevealReadiness,
  type AdjudicationAggregate,
  type ClosureReadinessSnapshot as SharedClosureReadinessSnapshot,
  type EffectiveSampleCounter as SharedEffectiveSampleCounter,
  type Proposition as SharedProposition,
  type Response as SharedResponse,
  type ResponseReview as SharedResponseReview,
} from "@arena/shared";
import type {
  Market,
  Proposition,
  Response,
  ResponseReview,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  ClosureReadinessSnapshot,
  ComputeAndRecordOfficialResultInput,
  ComputeOfficialResultSnapshot,
  EffectiveSampleCounterSnapshot,
  EvaluateClosureReadinessInput,
  FinalizeRevealPreparationInput,
  FreezeForRevealInput,
  OfficialResultSnapshot,
  RevealPreparationSnapshot,
} from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { toDate } from "../arena.utils";
import type { ArenaDbClient } from "../prisma.types";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { ValidationChainCommandRuntimeService } from "../validation-chain/validation-chain-command-runtime.service";
import { EffectiveSampleCounterService } from "./effective-sample-counter.service";
import { PropositionStateService } from "./proposition-state.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class FreezeRevealOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly counters: EffectiveSampleCounterService,
    private readonly markets: MarketRepository,
    private readonly propositionState: PropositionStateService,
    @Optional()
    private readonly validationChainRuntime?: ValidationChainCommandRuntimeService,
  ) {}

  async evaluateClosureReadiness(
    input: EvaluateClosureReadinessInput,
    db?: ArenaDbClient,
  ): Promise<ClosureReadinessSnapshot> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      return this.buildReadinessSnapshot(
        proposition,
        input.now,
        await this.counters.getCounterSnapshot(proposition.id, tx),
      );
    });
  }

  async freezeForReveal(
    input: FreezeForRevealInput,
    db?: ArenaDbClient,
  ): Promise<Proposition> {
    const frozen = await withArenaTransaction(this.prisma, db, async (tx) => {
      const readiness = await this.evaluateClosureReadiness(
        {
          propositionId: input.propositionId,
          now: input.now,
        },
        tx,
      );

      if (!readiness.isReadyToFreeze) {
        throw new ArenaValidationError(
          "proposition.not_ready_for_freeze",
          `Proposition ${input.propositionId} is not ready to freeze`,
        );
      }

      return this.propositionState.freeze(
        {
          propositionId: input.propositionId,
          frozenAt: input.now,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );
    });

    if (!db) {
      await this.validationChainRuntime?.enqueueFreezeCommand({
        propositionId: input.propositionId,
        actorUserId: input.updatedByUserId,
        reason: "validation_chain.runtime.freeze_reveal",
        note: "Local freeze reached readiness and queued validation freeze command",
      });
    }

    return frozen;
  }

  async computeAndRecordOfficialResult(
    input: ComputeAndRecordOfficialResultInput,
    db?: ArenaDbClient,
  ): Promise<ComputeOfficialResultSnapshot> {
    const snapshot = await withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      if (proposition.status !== "frozen") {
        throw new ArenaValidationError(
          "proposition.not_frozen",
          "Official result can only be computed after freeze",
        );
      }

      const counterSnapshot = await this.counters.rebuildCounterForProposition(
        proposition.id,
        tx,
      );
      const latestResponses = await this.responses.listLatestByProposition(
        proposition.id,
        tx,
      );
      const latestReviews = await this.listLatestReviews(latestResponses, tx);

      const revealingProposition = await this.propositionState.startReveal(
        {
          propositionId: proposition.id,
          revealStartedAt: input.now,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );

      const aggregate = buildAdjudicationAggregate({
        proposition: this.toSharedProposition(proposition),
        latestResponses: latestResponses.map((response) =>
          this.toSharedResponse(response),
        ),
        reviews: latestReviews.map((review) => this.toSharedReview(review)),
        counter: this.toSharedCounter(counterSnapshot),
      });

      const official = await this.propositionState.recordOfficialResult(
        {
          propositionId: proposition.id,
          resultKind: aggregate.resultKind,
          winningOption: aggregate.winningOption,
          voidReason: aggregate.voidReason,
          resultComputedAt: input.now,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );

      const market = await this.markets.findByPropositionId(proposition.id, tx);

      return {
        propositionId: official.id,
        propositionStatus: official.status,
        marketStatus: market?.status ?? null,
        counterSnapshot,
        aggregate: this.toAggregateSnapshot(aggregate),
        officialResult: this.toOfficialResultSnapshot(official),
        revealStartedAt: toIso(official.revealStartedAt),
        resultComputedAt: toIso(official.resultComputedAt),
      };
    });

    if (!db) {
      await this.validationChainRuntime?.enqueueResolveCommand({
        propositionId: input.propositionId,
        actorUserId: input.updatedByUserId,
        reason: "validation_chain.runtime.official_result",
        note: "Official result recorded locally and queued validation resolve command",
      });
    }

    return snapshot;
  }

  async finalizeRevealPreparation(
    input: FinalizeRevealPreparationInput,
    db?: ArenaDbClient,
  ): Promise<RevealPreparationSnapshot> {
    const snapshot = await withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      const readiness = await this.buildReadinessSnapshot(
        proposition,
        input.now,
        await this.counters.rebuildCounterForProposition(proposition.id, tx),
      );

      if (!readiness.isReadyToFreeze) {
        throw new ArenaValidationError(
          "proposition.not_ready_for_freeze",
          `Proposition ${input.propositionId} is not ready to freeze`,
        );
      }

      const frozen = await this.propositionState.freeze(
        {
          propositionId: input.propositionId,
          frozenAt: input.now,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );
      const official = await this.computeAndRecordOfficialResult(
        {
          propositionId: input.propositionId,
          now: input.now,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );

      return {
        propositionId: input.propositionId,
        readiness,
        propositionStatus: official.propositionStatus,
        marketStatus: official.marketStatus,
        frozenAt: toIso(frozen.frozenAt),
        revealStartedAt: official.revealStartedAt,
        resultComputedAt: official.resultComputedAt,
        aggregate: official.aggregate,
        officialResult: official.officialResult,
      };
    });

    if (!db) {
      await this.validationChainRuntime?.enqueueFreezeCommand({
        propositionId: input.propositionId,
        actorUserId: input.updatedByUserId,
        reason: "validation_chain.runtime.finalize_reveal",
        note: "Finalize reveal queued validation freeze command",
      });
      await this.validationChainRuntime?.enqueueResolveCommand({
        propositionId: input.propositionId,
        actorUserId: input.updatedByUserId,
        reason: "validation_chain.runtime.finalize_reveal",
        note: "Finalize reveal queued validation resolve command",
      });
    }

    return snapshot;
  }

  private async listLatestReviews(
    latestResponses: Response[],
    db: ArenaDbClient,
  ): Promise<ResponseReview[]> {
    const reviews = await Promise.all(
      latestResponses.map((response) =>
        this.reviews.findByResponseId(response.id, db),
      ),
    );

    return reviews.filter((review): review is ResponseReview => review !== null);
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

  private buildReadinessSnapshot(
    proposition: Proposition,
    now: string | Date,
    counterSnapshot: EffectiveSampleCounterSnapshot,
  ): ClosureReadinessSnapshot {
    return this.toReadinessSnapshot(
      evaluateFreezeRevealReadiness({
        proposition: this.toSharedProposition(proposition),
        counterSnapshot,
        now: toDate(now).toISOString(),
      }),
    );
  }

  private toReadinessSnapshot(
    snapshot: SharedClosureReadinessSnapshot,
  ): ClosureReadinessSnapshot {
    return {
      propositionId: snapshot.propositionId,
      propositionStatus: snapshot.propositionStatus,
      counterSnapshot: snapshot.counterSnapshot,
      liveAt: snapshot.liveAt,
      minFreezeAt: snapshot.minFreezeAt,
      maxFreezeAt: snapshot.maxFreezeAt,
      minDurationReached: snapshot.minDurationReached,
      maxDurationReached: snapshot.maxDurationReached,
      hasReachedMinEffectiveSample: snapshot.hasReachedMinEffectiveSample,
      isReadyToFreeze: snapshot.isReadyToFreeze,
      triggerReason: snapshot.triggerReason,
    };
  }

  private toSharedProposition(proposition: Proposition): SharedProposition {
    return {
      id: proposition.id,
      chainPkId:
        proposition.chainPkId === null ? null : Number(proposition.chainPkId),
      type: proposition.type,
        structure: proposition.structure,
        rollingMode: "non_rolling",
        marketEnabled: proposition.marketEnabled,
        settlementTarget: proposition.settlementTarget,
        category: proposition.category,
        title: proposition.title,
        description: proposition.description,
      options: proposition.options as [string, string],
      sampleConstraints: proposition.sampleConstraints,
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

  private toSharedReview(review: ResponseReview): SharedResponseReview {
    return {
      id: review.id,
      responseId: review.responseId,
      status: review.status,
      qualityScore: review.qualityScore,
      flags: review.flags,
      reasonCodes: review.reasonCodes,
      reviewedByUserId: review.reviewedByUserId,
      reviewedAt: toIso(review.reviewedAt),
    };
  }

  private toSharedCounter(
    counter: EffectiveSampleCounterSnapshot,
  ): SharedEffectiveSampleCounter {
    return {
      id: `counter:${counter.propositionId}`,
      propositionId: counter.propositionId,
      totalResponses: counter.totalResponses,
      reviewedResponses: counter.reviewedResponses,
      validCount: counter.validCount,
      partialValidCount: counter.partialValidCount,
      invalidCount: counter.invalidCount,
      updatedAt: counter.updatedAt,
    };
  }

  private toAggregateSnapshot(aggregate: AdjudicationAggregate) {
    return {
      propositionId: aggregate.propositionId,
      effectiveSampleCount: aggregate.effectiveSampleCount,
      validCount: aggregate.validCount,
      partialValidCount: aggregate.partialValidCount,
      resultKind: aggregate.resultKind,
      winningOption: aggregate.winningOption,
      voidReason: aggregate.voidReason,
    };
  }

  private toOfficialResultSnapshot(
    proposition: Proposition,
  ): OfficialResultSnapshot {
    return {
      propositionId: proposition.id,
      resultKind: proposition.resultKind!,
      winningOption: proposition.winningOption as 0 | 1 | null,
      voidReason: proposition.voidReason,
      resultComputedAt: proposition.resultComputedAt!.toISOString(),
    };
  }
}
