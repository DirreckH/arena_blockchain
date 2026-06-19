import { Injectable } from "@nestjs/common";
import {
  PropositionPolicyError,
  assertSupportedMvpPropositionConfig,
} from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  ActivatePropositionLiveInput,
  ClosePropositionInput,
  CreateDraftPropositionInput,
  FreezePropositionInput,
  MarkPropositionSettledInput,
  RecordOfficialResultInput,
  SchedulePropositionInput,
  StartPropositionRevealInput,
} from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { PropositionRepository } from "../repositories/proposition.repository";
import { assertPropositionTransition } from "../state-machines/proposition-state.machine";
import {
  assertBinaryOption,
  toDate,
} from "../arena.utils";
import { ArenaUserIdentityService } from "./arena-user-identity.service";
import { MarketService } from "./market.service";

@Injectable()
export class PropositionStateService {
  // Low-level lifecycle primitive. Runtime callers should prefer the phase-specific
  // formal entry points on PropositionEngineService, FreezeRevealOrchestratorService
  // and ValidationSettlementService instead of stitching transitions manually.
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketService,
    private readonly userIdentity: ArenaUserIdentityService,
  ) {}

  async createDraft(
    input: CreateDraftPropositionInput,
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.createdByUserId,
        undefined,
        tx,
      );
      try {
        assertSupportedMvpPropositionConfig({
          type: "consensus",
          structure: "binary",
          rollingMode: "non_rolling",
          settlementTarget: "final",
          options: input.options,
          sampleConstraints: [...(input.sampleConstraints ?? [])],
          minEffectiveSample: input.minEffectiveSample,
          minDurationSeconds: input.minDurationSeconds,
          maxDurationSeconds: input.maxDurationSeconds,
          minBetAmount: input.minBetAmount,
          rewardBudget: input.rewardBudget,
          baseResponseReward: input.baseResponseReward,
          marketEnabled: input.marketEnabled ?? true,
        });
      } catch (error) {
        if (error instanceof PropositionPolicyError) {
          throw new ArenaValidationError(error.code, error.message);
        }

        throw error;
      }

      return this.propositions.create(
        {
          id: input.id ?? this.ids.next("proposition"),
          chainPkId: input.chainPkId,
          category: input.category ?? "general",
          title: input.title,
          description: input.description,
          options: [...input.options],
          sampleConstraints: [...(input.sampleConstraints ?? [])],
          minEffectiveSample: input.minEffectiveSample,
          minBetAmount: input.minBetAmount,
          minDurationSeconds: input.minDurationSeconds,
          maxDurationSeconds: input.maxDurationSeconds,
          rewardBudget: input.rewardBudget,
          baseResponseReward: input.baseResponseReward,
          marketEnabled: input.marketEnabled ?? true,
          createdByUserId: input.createdByUserId,
        },
        tx,
      );
    });
  }

  async schedule(
    input: SchedulePropositionInput,
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.updatedByUserId,
        undefined,
        tx,
      );
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      assertPropositionTransition(proposition.status, "scheduled", "schedule");

      return this.propositions.updateStatus(
        proposition.id,
        "scheduled",
        {
          publishedAt: toDate(input.publishedAt),
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );
    });
  }

  async activateLive(
    input: ActivatePropositionLiveInput,
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.updatedByUserId,
        undefined,
        tx,
      );
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      assertPropositionTransition(proposition.status, "live", "activateLive");

      const liveAt = toDate(input.liveAt);

      return this.propositions.updateStatus(
        proposition.id,
        "live",
        {
          liveAt,
          publishedAt: proposition.publishedAt ?? liveAt,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );
    });
  }

  async freeze(
    input: FreezePropositionInput,
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.updatedByUserId,
        undefined,
        tx,
      );
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      assertPropositionTransition(proposition.status, "frozen", "freeze");

      const frozenProposition = await this.propositions.updateStatus(
        proposition.id,
        "frozen",
        {
          frozenAt: toDate(input.frozenAt),
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );

      const market = await this.markets.findByPropositionId(proposition.id, tx);
      if (market && market.status !== "settled" && market.status !== "cancelled") {
        await this.markets.freezeForReveal(
          {
            marketId: market.id,
            propositionId: proposition.id,
            frozenAt: input.frozenAt,
          },
          tx,
        );
      }

      return frozenProposition;
    });
  }

  async startReveal(
    input: StartPropositionRevealInput,
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.updatedByUserId,
        undefined,
        tx,
      );
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      assertPropositionTransition(proposition.status, "revealing", "startReveal");

      const market = await this.markets.findByPropositionId(proposition.id, tx);
      if (
        market &&
        market.status !== "frozen_for_reveal" &&
        market.status !== "settled" &&
        market.status !== "cancelled"
      ) {
        throw new ArenaValidationError(
          "proposition.market_not_ready_for_reveal",
          "Market must be frozen for reveal before the proposition can enter revealing",
        );
      }

      return this.propositions.updateStatus(
        proposition.id,
        "revealing",
        {
          revealStartedAt: toDate(input.revealStartedAt),
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );
    });
  }

  async recordOfficialResult(
    input: RecordOfficialResultInput,
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.updatedByUserId,
        undefined,
        tx,
      );
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      if (proposition.status !== "revealing") {
        throw new ArenaValidationError(
          "proposition.not_revealing",
          "Official result can only be recorded while the proposition is revealing",
        );
      }

      if (proposition.resultComputedAt !== null) {
        throw new ArenaValidationError(
          "proposition.result_already_computed",
          "Official result has already been recorded for this proposition",
        );
      }

      const market = await this.markets.findByPropositionId(proposition.id, tx);
      if (
        market &&
        market.status !== "frozen_for_reveal" &&
        market.status !== "settling" &&
        market.status !== "settled" &&
        market.status !== "cancelled"
      ) {
        throw new ArenaValidationError(
          "proposition.market_not_ready_for_result",
          "Market must already be frozen before the official result is recorded",
        );
      }

      if (input.resultKind === "resolved") {
        if (input.winningOption === null) {
          throw new ArenaValidationError(
            "proposition.missing_winning_option",
            "Resolved propositions must provide a winning option",
          );
        }

        assertBinaryOption(input.winningOption, "winningOption");
        if (input.voidReason !== null) {
          throw new ArenaValidationError(
            "proposition.void_reason_not_allowed",
            "Resolved propositions cannot also set a void reason",
          );
        }
      }

      if (input.resultKind === "void") {
        if (!input.voidReason) {
          throw new ArenaValidationError(
            "proposition.missing_void_reason",
            "Void propositions must provide a void reason",
          );
        }

        if (input.winningOption !== null) {
          throw new ArenaValidationError(
            "proposition.winning_option_not_allowed",
            "Void propositions cannot set a winning option",
          );
        }
      }

      return this.propositions.update(
        proposition.id,
        {
          resultKind: input.resultKind,
          winningOption: input.winningOption,
          voidReason: input.voidReason,
          resultComputedAt: toDate(input.resultComputedAt),
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );
    });
  }

  async markSettled(
    input: MarkPropositionSettledInput,
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.updatedByUserId,
        undefined,
        tx,
      );
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      assertPropositionTransition(proposition.status, "settled", "markSettled");

      if (proposition.resultComputedAt === null || proposition.resultKind === null) {
        throw new ArenaValidationError(
          "proposition.result_not_computed",
          "Proposition cannot settle before the official result is recorded",
        );
      }

      const market = await this.markets.findByPropositionId(proposition.id, tx);
      if (
        market &&
        market.status !== "settled" &&
        market.status !== "cancelled"
      ) {
        throw new ArenaValidationError(
          "proposition.market_not_settled",
          "Market settlement must complete before the proposition can settle",
        );
      }

      return this.propositions.updateStatus(
        proposition.id,
        "settled",
        {
          settledAt: toDate(input.settledAt),
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );
    });
  }

  async close(
    input: ClosePropositionInput,
    db?: ArenaDbClient,
  ) {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.userIdentity.ensureUserExists(
        input.updatedByUserId,
        undefined,
        tx,
      );
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      assertPropositionTransition(proposition.status, "closed", "close");

      return this.propositions.updateStatus(
        proposition.id,
        "closed",
        {
          closedAt: toDate(input.closedAt),
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );
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
}
