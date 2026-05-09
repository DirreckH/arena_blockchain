import { Injectable } from "@nestjs/common";
import {
  SettlementEngine as SharedSettlementEngine,
  type Market as SharedMarket,
  type PositionBet as SharedPositionBet,
  type Proposition as SharedProposition,
} from "@arena/shared";
import type { Bet, Market, Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaConflictError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  ActivateMarketInput,
  CreateMarketInput,
  FreezeMarketInput,
  SettleMarketInput,
  StartMarketSettlingInput,
} from "../arena.types";
import {
  isUniqueConstraintError,
  withArenaTransaction,
} from "../arena-transaction.utils";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { BetRepository } from "../repositories/bet.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { assertMarketTransition } from "../state-machines/market-state.machine";
import { toDate } from "../arena.utils";
import { EffectiveSampleCounterService } from "./effective-sample-counter.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly bets: BetRepository,
    private readonly counters: EffectiveSampleCounterService,
  ) {}

  async findById(
    marketId: string,
    db?: ArenaDbClient,
  ): Promise<Market | null> {
    return this.markets.findById(marketId, db);
  }

  async findByPropositionId(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<Market | null> {
    return this.markets.findByPropositionId(propositionId, db);
  }

  async createForProposition(
    input: CreateMarketInput,
    db?: ArenaDbClient,
  ): Promise<Market> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      if (!proposition.marketEnabled) {
        throw new ArenaValidationError(
          "market.disabled",
          "The proposition does not allow market creation",
        );
      }

      if (proposition.status === "closed" || proposition.status === "archived") {
        throw new ArenaValidationError(
          "market.proposition_terminal",
          "Cannot create a market for a closed proposition",
        );
      }

      const existing = await this.markets.findByPropositionId(input.propositionId, tx);
      if (existing) {
        throw new ArenaConflictError(
          "market.duplicate",
          "The proposition already has a primary market",
        );
      }

      const currentPublicProgress = await this.counters.getPublicProgress(
        input.propositionId,
        tx,
      );

      try {
        return await this.markets.create(
          {
            id: input.id ?? this.ids.next("market"),
            propositionId: input.propositionId,
            settlementTarget: proposition.settlementTarget,
            currentPublicProgress:
              currentPublicProgress as unknown as Prisma.InputJsonValue,
          },
          tx,
        );
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ArenaConflictError(
            "market.duplicate",
            "The proposition already has a primary market",
          );
        }

        throw error;
      }
    });
  }

  async activateMarket(
    input: ActivateMarketInput,
    db?: ArenaDbClient,
  ): Promise<Market> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      if (proposition.status !== "live") {
        throw new ArenaValidationError(
          "market.proposition_not_live",
          "Markets can only be activated while the proposition is live",
        );
      }

      const market = await this.getRequiredMarketByPropositionId(
        input.propositionId,
        tx,
      );
      assertMarketTransition(market.status, "live", "activateMarket");

      return this.markets.updateStatus(
        market.id,
        "live",
        {
          liveAt: toDate(input.liveAt),
          currentPublicProgress:
            (await this.counters.getPublicProgress(
              proposition.id,
              tx,
            )) as unknown as Prisma.InputJsonValue,
        },
        tx,
      );
    });
  }

  async freezeForReveal(
    input: FreezeMarketInput,
    db?: ArenaDbClient,
  ): Promise<Market> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const market = input.marketId
        ? await this.getRequiredMarket(input.marketId, tx)
        : await this.getRequiredMarketByPropositionId(
            input.propositionId as string,
            tx,
          );
      const proposition = await this.getRequiredProposition(
        market.propositionId,
        tx,
      );

      if (proposition.status !== "frozen") {
        throw new ArenaValidationError(
          "market.proposition_not_frozen",
          "Markets can only freeze for reveal after the proposition is frozen",
        );
      }

      assertMarketTransition(
        market.status,
        "frozen_for_reveal",
        "freezeForReveal",
      );

      return this.markets.updateStatus(
        market.id,
        "frozen_for_reveal",
        {
          frozenAt: toDate(input.frozenAt),
          currentPublicProgress:
            (await this.counters.getPublicProgress(
              market.propositionId,
              tx,
            )) as unknown as Prisma.InputJsonValue,
        },
        tx,
      );
    });
  }

  async startSettling(
    input: StartMarketSettlingInput,
    db?: ArenaDbClient,
  ): Promise<Market> {
    // Internal lifecycle primitive. Formal runtime settlement entry is ValidationSettlementService.settleValidationMarket().
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const market = await this.getRequiredMarket(input.marketId, tx);
      const proposition = await this.getRequiredProposition(
        market.propositionId,
        tx,
      );

      if (proposition.status !== "revealing") {
        throw new ArenaValidationError(
          "market.proposition_not_revealing",
          "Markets can only start settling while the proposition is revealing",
        );
      }

      assertMarketTransition(market.status, "settling", "startSettling");

      return this.markets.updateStatus(
        market.id,
        "settling",
        {
          settlingAt: toDate(input.settlingAt),
        },
        tx,
      );
    });
  }

  async settleMarket(
    input: SettleMarketInput,
    db?: ArenaDbClient,
  ): Promise<Market> {
    // Internal settlement adapter. Runtime callers should use ValidationSettlementService.settleValidationMarket().
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(
        input.propositionId,
        tx,
      );
      const market = await this.getRequiredMarketByPropositionId(
        proposition.id,
        tx,
      );

      if (proposition.status !== "revealing") {
        throw new ArenaValidationError(
          "market.proposition_not_revealing",
          "Market settlement must run after reveal has started and before the proposition is marked settled",
        );
      }

      if (proposition.resultComputedAt === null || proposition.resultKind === null) {
        throw new ArenaValidationError(
          "market.proposition_result_not_recorded",
          "Market settlement requires an official proposition result",
        );
      }

      const settledAt = toDate(input.settledAt).toISOString();
      const engine = new SharedSettlementEngine({
        propositionRead: {
          getById: async (propositionId: string) => {
            if (propositionId !== proposition.id) {
              return null;
            }

            return this.toSharedProposition(proposition);
          },
        },
        markets: {
          create: async () => {
            throw new ArenaValidationError(
              "market.create_not_supported",
              "Shared settlement adapter cannot create markets",
            );
          },
          update: async (nextMarket: SharedMarket) => {
            const updated = await this.markets.update(
              nextMarket.id,
              {
                status: nextMarket.status,
                liveAt: nextMarket.liveAt ? new Date(nextMarket.liveAt) : null,
                frozenAt: nextMarket.frozenAt
                  ? new Date(nextMarket.frozenAt)
                  : null,
                settlingAt: nextMarket.settlingAt
                  ? new Date(nextMarket.settlingAt)
                  : null,
                settledAt: nextMarket.settledAt
                  ? new Date(nextMarket.settledAt)
                  : null,
              },
              tx,
            );

            return this.toSharedMarket(updated);
          },
          getById: async (marketId: string) => {
            const current = await this.markets.findById(marketId, tx);
            return current ? this.toSharedMarket(current) : null;
          },
          findByPropositionId: async (propositionId: string) => {
            const current = await this.markets.findByPropositionId(
              propositionId,
              tx,
            );
            return current ? this.toSharedMarket(current) : null;
          },
          list: async () => {
            throw new ArenaValidationError(
              "market.list_not_supported",
              "Shared settlement adapter does not list markets",
            );
          },
        },
        positions: {
          create: async () => {
            throw new ArenaValidationError(
              "bet.create_not_supported",
              "Shared settlement adapter cannot create bets",
            );
          },
          update: async (position: SharedPositionBet) => {
            const updated = await this.bets.update(
              position.id,
              {
                status: "settled",
                settledAt: position.settledAt
                  ? new Date(position.settledAt)
                  : null,
                settlementOutcome: position.settlementOutcome,
                grossPayout: position.grossPayout,
                pnl: position.pnl,
                refundAmount: position.refundAmount,
              },
              tx,
            );

            return this.toSharedPosition(updated);
          },
          findByMarketAndUser: async (marketId: string, userId: string) => {
            const current = await this.bets.findByMarketAndUser(
              marketId,
              userId,
              tx,
            );
            return current ? this.toSharedPosition(current) : null;
          },
          listByMarket: async (marketId: string) => {
            const current = await this.bets.listByMarketId(marketId, tx);
            return current.map((bet) => this.toSharedPosition(bet));
          },
        },
      });

      const settlement = await engine.finalize({
        propositionId: proposition.id,
        marketId: market.id,
        resultKind: proposition.resultKind,
        winningOption: proposition.winningOption as 0 | 1 | null,
        voidReason: proposition.voidReason,
        platformFeeBps: input.platformFeeBps,
        settledAt,
      });

      return this.markets.update(
        market.id,
        {
          status: settlement.market.status,
          settledAt: toDate(input.settledAt),
          lastPublicResult: {
            propositionId: proposition.id,
            resultKind: proposition.resultKind,
            winningOption: proposition.winningOption,
            voidReason: proposition.voidReason,
            resultComputedAt: proposition.resultComputedAt.toISOString(),
            settledAt,
          } as Prisma.InputJsonValue,
          currentPublicProgress:
            (await this.counters.getPublicProgress(
              market.propositionId,
              tx,
            )) as unknown as Prisma.InputJsonValue,
        },
        tx,
      );
    });
  }

  private async getRequiredMarket(
    marketId: string,
    db: ArenaDbClient,
  ): Promise<Market> {
    const market = await this.markets.findById(marketId, db);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market ${marketId} was not found`,
      );
    }

    return market;
  }

  private async getRequiredMarketByPropositionId(
    propositionId: string,
    db: ArenaDbClient,
  ): Promise<Market> {
    const market = await this.markets.findByPropositionId(propositionId, db);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market for proposition ${propositionId} was not found`,
      );
    }

    return market;
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

  private toSharedProposition(
    proposition: Awaited<ReturnType<PropositionRepository["findById"]>> extends infer TResult
      ? NonNullable<TResult>
      : never,
  ): SharedProposition {
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

  private toSharedPosition(
    bet: Bet,
  ): SharedPositionBet {
    return {
      id: bet.id,
      marketId: bet.marketId,
      propositionId: bet.propositionId,
      userId: bet.userId,
      selectedOption: bet.selectedOption as 0 | 1,
      stakeAmount: bet.stakeAmount,
      placedAt: bet.placedAt.toISOString(),
      settlementOutcome: bet.settlementOutcome,
      grossPayout: bet.grossPayout,
      pnl: bet.pnl,
      refundAmount: bet.refundAmount,
      settledAt: toIso(bet.settledAt),
    };
  }
}
