import { Injectable, Optional } from "@nestjs/common";
import {
  PropositionPolicyError,
  assertReadyForLivePublication,
  assertReadyForScheduling,
  assertSupportedMvpPropositionDraftInput,
  buildPropositionRuntimeSnapshot,
  type Market as SharedMarket,
  type Proposition as SharedProposition,
  type PropositionRuntimeSnapshot,
} from "@arena/shared";
import type { Market, Proposition } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  ApproveOrSchedulePropositionInput,
  CreatePropositionInput,
  PublishLivePropositionInput,
} from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { toDate } from "../arena.utils";
import type { ArenaDbClient } from "../prisma.types";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ValidationChainCommandRuntimeService } from "../validation-chain/validation-chain-command-runtime.service";
import { MarketService } from "./market.service";
import { PropositionStateService } from "./proposition-state.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class PropositionEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly propositionState: PropositionStateService,
    private readonly markets: MarketService,
    @Optional()
    private readonly validationChainRuntime?: ValidationChainCommandRuntimeService,
  ) {}

  async createProposition(
    input: CreatePropositionInput,
    db?: ArenaDbClient,
  ): Promise<Proposition> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      this.assertPolicy(() => assertSupportedMvpPropositionDraftInput(input));

      return this.propositionState.createDraft(
        {
          ...input,
          sampleConstraints: [...(input.sampleConstraints ?? [])],
        },
        tx,
      );
    });
  }

  async approveOrScheduleProposition(
    input: ApproveOrSchedulePropositionInput,
    db?: ArenaDbClient,
  ): Promise<Proposition> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      const publishedAtIso = this.toIsoTimestamp(
        input.publishedAt,
        "publishedAt",
      );

      this.assertPolicy(() =>
        assertReadyForScheduling(
          this.toSharedProposition(proposition),
          publishedAtIso,
        ),
      );

      return this.propositionState.schedule(
        {
          propositionId: proposition.id,
          publishedAt: publishedAtIso,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );
    });
  }

  async publishLiveProposition(
    input: PublishLivePropositionInput,
    db?: ArenaDbClient,
  ): Promise<Proposition> {
    const liveProposition = await withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      const existingMarket = await this.markets.findByPropositionId(
        proposition.id,
        tx,
      );
      const liveAtIso = this.toIsoTimestamp(input.liveAt, "liveAt");

      this.assertPolicy(() =>
        assertReadyForLivePublication(
          this.toSharedProposition(proposition),
          liveAtIso,
          existingMarket ? this.toSharedMarket(existingMarket) : null,
        ),
      );

      const liveProposition = await this.propositionState.activateLive(
        {
          propositionId: proposition.id,
          liveAt: liveAtIso,
          updatedByUserId: input.updatedByUserId,
        },
        tx,
      );

      if (!liveProposition.marketEnabled) {
        return liveProposition;
      }

      const createdOrExistingMarket =
        existingMarket ??
        (await this.markets.createForProposition(
          { propositionId: liveProposition.id },
          tx,
        ));

      if (createdOrExistingMarket.status === "pre_live") {
        await this.markets.activateMarket(
          {
            propositionId: liveProposition.id,
            liveAt: liveAtIso,
          },
          tx,
        );
      }

      return liveProposition;
    });

    if (!db && liveProposition.marketEnabled) {
      await this.validationChainRuntime?.enqueueCreateOpenCommands({
        propositionId: liveProposition.id,
        actorUserId: input.updatedByUserId,
        reason: "validation_chain.runtime.publish_live",
        note: "Published proposition to live and queued validation create/open commands",
      });
    }

    return liveProposition;
  }

  async getPropositionRuntimeSnapshot(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<PropositionRuntimeSnapshot | null> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.propositions.findById(propositionId, tx);
      if (!proposition) {
        return null;
      }

      const market = await this.markets.findByPropositionId(proposition.id, tx);

      return this.assertPolicy(() =>
        buildPropositionRuntimeSnapshot({
          proposition: this.toSharedProposition(proposition),
          market: market ? this.toSharedMarket(market) : null,
        }),
      );
    });
  }

  async getById(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<Proposition | null> {
    return this.propositions.findById(propositionId, db);
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

  private toIsoTimestamp(value: Date | string, field: string): string {
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) {
      throw new ArenaValidationError(
        `proposition.invalid_${field}`,
        `${field} must be a valid timestamp.`,
      );
    }

    return date.toISOString();
  }

  private assertPolicy<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      if (error instanceof PropositionPolicyError) {
        throw new ArenaValidationError(error.code, error.message);
      }

      throw error;
    }
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

  private toSharedMarket(market: Market): SharedMarket {
    return {
      id: market.id,
      propositionId: market.propositionId,
      settlementTarget: market.settlementTarget,
      status: market.status,
      currentPublicProgress: market.currentPublicProgress,
      lastPublicResult: market.lastPublicResult,
      liveAt: toIso(market.liveAt),
      frozenAt: toIso(market.frozenAt),
      settlingAt: toIso(market.settlingAt),
      settledAt: toIso(market.settledAt),
    };
  }
}
