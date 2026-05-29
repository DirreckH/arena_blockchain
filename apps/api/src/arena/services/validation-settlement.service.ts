import { Injectable } from "@nestjs/common";
import type { Proposition } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  OfficialResultSnapshot,
  SettleValidationMarketInput,
  ValidationSettlementSnapshot,
} from "../arena.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import { toDate } from "../arena.utils";
import type { ArenaDbClient } from "../prisma.types";
import { BetRepository } from "../repositories/bet.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { EffectiveSampleCounterService } from "./effective-sample-counter.service";
import { MarketService } from "./market.service";
import { PropositionStateService } from "./proposition-state.service";
import { ValidationRehearsalCheckpointService } from "./validation-rehearsal-checkpoint.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class ValidationSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly markets: MarketRepository,
    private readonly bets: BetRepository,
    private readonly marketService: MarketService,
    private readonly propositionState: PropositionStateService,
    private readonly counters: EffectiveSampleCounterService,
    private readonly rehearsalCheckpoints: ValidationRehearsalCheckpointService,
  ) {}

  async settleValidationMarket(
    input: SettleValidationMarketInput,
    db?: ArenaDbClient,
  ): Promise<ValidationSettlementSnapshot> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(input.propositionId, tx);
      const market = await this.getRequiredMarketForProposition(proposition.id, tx);
      const settledAt = toDate(input.settledAt);
      const platformFeeBps = input.platformFeeBps ?? 0;
      const wasAlreadySettled = proposition.status === "settled";

      if (wasAlreadySettled) {
        this.assertOfficialResultRecorded(proposition);
        await this.counters.maybeRefreshPublicProgress(proposition.id, tx);

        if (market.status !== "settled") {
          throw new ArenaValidationError(
            "validation_settlement.market_not_settled",
            "Proposition is already settled but its market is not settled",
          );
        }

        return this.buildSettlementSnapshot(proposition, market, tx);
      }

      if (proposition.status !== "revealing") {
        throw new ArenaValidationError(
          "validation_settlement.proposition_not_revealing",
          "Validation settlement requires the proposition to be revealing",
        );
      }

      this.assertOfficialResultRecorded(proposition);

      if (!["frozen_for_reveal", "settled"].includes(market.status)) {
        throw new ArenaValidationError(
          "validation_settlement.market_not_ready",
          "Validation settlement requires the market to be frozen_for_reveal",
        );
      }

      if (market.status !== "settled") {
        await this.marketService.settleMarket(
          {
            propositionId: proposition.id,
            settledAt,
            platformFeeBps,
          },
          tx,
        );
      }

      const settledProposition = await this.propositionState.markSettled(
        {
          propositionId: proposition.id,
          settledAt,
          updatedByUserId: proposition.updatedByUserId ?? proposition.createdByUserId,
        },
        tx,
      );
      await this.counters.maybeRefreshPublicProgress(proposition.id, tx);
      const settledMarket = await this.getRequiredMarketForProposition(
        proposition.id,
        tx,
      );
      await this.recordAutomaticSettlementCheckpoint(
        {
          proposition: settledProposition,
          market: settledMarket,
          settledAt,
        },
        tx,
      );

      return this.buildSettlementSnapshot(settledProposition, settledMarket, tx);
    });
  }

  async getSettlementSnapshot(
    propositionId: string,
    db?: ArenaDbClient,
  ): Promise<ValidationSettlementSnapshot> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredProposition(propositionId, tx);
      const market = await this.getRequiredMarketForProposition(proposition.id, tx);
      this.assertOfficialResultRecorded(proposition);
      await this.counters.maybeRefreshPublicProgress(proposition.id, tx);
      return this.buildSettlementSnapshot(proposition, market, tx);
    });
  }

  private async buildSettlementSnapshot(
    proposition: Proposition,
    market: Awaited<ReturnType<MarketRepository["findByPropositionId"]>> extends infer TResult
      ? NonNullable<TResult>
      : never,
    db: ArenaDbClient,
  ): Promise<ValidationSettlementSnapshot> {
    const bets = await this.bets.listByMarketId(market.id, db);

    return {
      propositionId: proposition.id,
      propositionStatus: proposition.status,
      marketId: market.id,
      marketStatus: market.status,
      officialResult: this.toOfficialResultSnapshot(proposition),
      settledAt: toIso(proposition.settledAt ?? market.settledAt),
      settledBetCount: bets.filter((bet) => bet.status === "settled").length,
      isVoidSettlement: proposition.resultKind === "void",
      isTieSettlement: proposition.voidReason === "tie",
    };
  }

  private async recordAutomaticSettlementCheckpoint(
    input: {
      proposition: Proposition;
      market: Awaited<ReturnType<MarketRepository["findByPropositionId"]>> extends infer TResult
        ? NonNullable<TResult>
        : never;
      settledAt: Date;
    },
    db: ArenaDbClient,
  ): Promise<void> {
    const bets = await this.bets.listByMarketId(input.market.id, db);
    const terminalBetCount = bets.filter(
      (bet) => bet.status === "settled" && bet.settlementOutcome !== null,
    ).length;
    const projectedSyncedBetCount = bets.filter(
      (bet) => bet.chainSyncedAt !== null,
    ).length;

    await this.rehearsalCheckpoints.recordCheckpoint(
      {
        propositionId: input.proposition.id,
        stepId: "projection_and_settlement",
        status: "complete",
        reason: "validation_rehearsal.auto.local_settlement_converged",
        evidence: [
          `propositionStatus=${input.proposition.status}`,
          `propositionSettledAt=${toIso(input.proposition.settledAt) ?? "missing"}`,
          `marketStatus=${input.market.status}`,
          `marketSettledAt=${toIso(input.market.settledAt) ?? "missing"}`,
          `chainStatus=${input.market.chainStatus ?? "missing"}`,
          `chainResolvedAt=${toIso(input.market.chainResolvedAt) ?? "missing"}`,
          `chainCancelledAt=${toIso(input.market.chainCancelledAt) ?? "missing"}`,
          `terminalBetCount=${String(terminalBetCount)}`,
          `projectedSyncedBetCount=${String(projectedSyncedBetCount)}`,
        ],
        txHash: input.market.resolutionTxHash ?? input.market.cancelTxHash ?? undefined,
        recordedAt: input.settledAt.toISOString(),
      },
      db,
    );
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

  private async getRequiredMarketForProposition(
    propositionId: string,
    db: ArenaDbClient,
  ) {
    const market = await this.markets.findByPropositionId(propositionId, db);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market for proposition ${propositionId} was not found`,
      );
    }

    return market;
  }

  private assertOfficialResultRecorded(proposition: Proposition): void {
    if (proposition.resultKind === null || proposition.resultComputedAt === null) {
      throw new ArenaValidationError(
        "validation_settlement.official_result_missing",
        "Validation settlement requires an official proposition result",
      );
    }

    if (
      proposition.resultKind === "resolved" &&
      proposition.winningOption === null
    ) {
      throw new ArenaValidationError(
        "validation_settlement.winning_option_missing",
        "Resolved settlement requires a winning option on the proposition",
      );
    }

    if (proposition.resultKind === "void" && proposition.voidReason === null) {
      throw new ArenaValidationError(
        "validation_settlement.void_reason_missing",
        "Void settlement requires a void reason on the proposition",
      );
    }
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
