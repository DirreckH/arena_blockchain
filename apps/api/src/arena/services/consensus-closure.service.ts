import { Injectable } from "@nestjs/common";
import {
  buildAdjudicationAggregate,
  type AdjudicationAggregate,
  type EffectiveSampleCounter as SharedEffectiveSampleCounter,
  type Proposition as SharedProposition,
  type Response as SharedResponse,
  type ResponseReview as SharedResponseReview,
} from "@arena/shared";
import type { Proposition, Response, ResponseReview } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  ComputeOfficialResultInput,
  EffectiveSampleCounterSnapshot,
  FinalizeConsensusClosureInput,
  FinalizeConsensusSettlementInput,
} from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import type { ArenaDbClient } from "../prisma.types";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { EffectiveSampleCounterService } from "./effective-sample-counter.service";
import { PropositionStateService } from "./proposition-state.service";
import { ValidationSettlementService } from "./validation-settlement.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class ConsensusClosureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly counters: EffectiveSampleCounterService,
    private readonly marketRepository: MarketRepository,
    private readonly propositionState: PropositionStateService,
    private readonly validationSettlement: ValidationSettlementService,
  ) {}

  async computeOfficialResult(
    input: ComputeOfficialResultInput,
    db?: ArenaDbClient,
  ): Promise<{ proposition: Proposition; aggregate: AdjudicationAggregate }> {
    // Internal composite helper used by higher-level orchestration. Freeze/reveal runtime should prefer FreezeRevealOrchestratorService.
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      if (proposition.status !== "revealing") {
        throw new ArenaValidationError(
          "consensus.proposition_not_revealing",
          "Official result computation requires the proposition to be revealing",
        );
      }

      const counter = await this.counters.getCounterSnapshot(proposition.id, tx);
      const latestResponses = await this.responses.listLatestByProposition(
        proposition.id,
        tx,
      );
      const latestReviews = await this.listLatestReviews(latestResponses, tx);

      const aggregate = buildAdjudicationAggregate({
        proposition: this.toSharedProposition(proposition),
        latestResponses: latestResponses.map((response) =>
          this.toSharedResponse(response),
        ),
        reviews: latestReviews.map((review) => this.toSharedReview(review)),
        counter: this.toSharedCounter(counter),
      });

      const official = await this.propositionState.recordOfficialResult(
        {
          propositionId: proposition.id,
          resultKind: aggregate.resultKind,
          winningOption: aggregate.winningOption,
          voidReason: aggregate.voidReason,
          resultComputedAt: input.resultComputedAt,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );

      return {
        proposition: official,
        aggregate,
      };
    });
  }

  async settleFromOfficialResult(
    input: FinalizeConsensusSettlementInput,
    db?: ArenaDbClient,
  ) {
    // Internal composite helper. Runtime settlement should prefer ValidationSettlementService.settleValidationMarket().
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      const market = await this.marketRepository.findByPropositionId(
        proposition.id,
        tx,
      );

      if (proposition.marketEnabled && !market) {
        throw new ArenaValidationError(
          "consensus.market_missing",
          "Consensus settlement requires a market when validation is enabled",
        );
      }

      if (market && market.status !== "cancelled") {
        await this.validationSettlement.settleValidationMarket(
          {
            propositionId: proposition.id,
            settledAt: input.settledAt,
            platformFeeBps: input.platformFeeBps,
          },
          tx,
        );
      }
      const settledProposition = await this.getRequiredProposition(
        proposition.id,
        tx,
      );
      const refreshedMarket = market
        ? await this.marketRepository.findByPropositionId(proposition.id, tx)
        : null;

      return {
        proposition: settledProposition,
        market: refreshedMarket,
      };
    });
  }

  async finalizeConsensusClosure(
    input: FinalizeConsensusClosureInput,
    db?: ArenaDbClient,
  ) {
    // Internal end-to-end composite kept for integration coverage and future automation wiring.
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const official = await this.computeOfficialResult(
        {
          propositionId: input.propositionId,
          resultComputedAt: input.resultComputedAt,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );

      const settlement = await this.settleFromOfficialResult(
        {
          propositionId: input.propositionId,
          settledAt: input.settledAt,
          platformFeeBps: input.platformFeeBps,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );

      return {
        aggregate: official.aggregate,
        proposition: settlement.proposition,
        market: settlement.market,
      };
    });
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
}
