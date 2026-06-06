import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import type {
  ValidationChainProjectionReplayViewModel,
  ValidationChainRecentEventViewModel,
} from "../internal-ops.types";
import { withArenaTransaction } from "../arena-transaction.utils";
import type { ArenaDbClient } from "../prisma.types";
import { BetRepository } from "../repositories/bet.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ValidationChainEventRepository } from "../repositories/validation-chain-event.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import { ValidationChainProjectionService } from "./validation-chain-projection.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class ValidationChainProjectionReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markets: MarketRepository,
    private readonly bets: BetRepository,
    private readonly propositions: PropositionRepository,
    private readonly events: ValidationChainEventRepository,
    private readonly projector: ValidationChainProjectionService,
    private readonly audit: InternalAuditService,
  ) {}

  async replayMarketProjection(input: {
    marketId: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
  }): Promise<ValidationChainProjectionReplayViewModel> {
    if (!input.actorUserId) {
      throw new ArenaValidationError(
        "validation_chain.replay.actor_required",
        "Validation-chain projection replay requires an explicit actor",
      );
    }

    return withArenaTransaction(this.prisma, undefined, async (tx) => {
      const market = await this.markets.findById(input.marketId, tx);
      if (!market) {
        throw new ArenaNotFoundError(
          "market.not_found",
          `Market ${input.marketId} was not found`,
        );
      }

      if (!market.chainMarketId && !market.chainPropositionId) {
        throw new ArenaValidationError(
          "validation_chain.replay.market_not_projected",
          "Validation-chain projection replay requires an existing chain market or proposition id",
        );
      }

      const proposition = await this.propositions.findById(market.propositionId, tx);
      if (!proposition) {
        throw new ArenaNotFoundError(
          "proposition.not_found",
          `Proposition ${market.propositionId} was not found`,
        );
      }

      const replayEvents = await this.events.listByChainReferences(
        {
          marketChainId: market.chainMarketId,
          propositionChainId: market.chainPropositionId,
        },
        tx,
      );

      if (replayEvents.length === 0) {
        throw new ArenaValidationError(
          "validation_chain.replay.no_events",
          "Validation-chain projection replay requires persisted chain events for the target market",
        );
      }

      await this.resetMarketProjectionState(market.id, tx);
      await this.resetBetProjectionState(market.id, tx);

      for (const event of replayEvents) {
        await this.projector.projectEvent(event, tx);
      }

      const replayedMarket = await this.markets.findById(market.id, tx);
      if (!replayedMarket) {
        throw new ArenaNotFoundError(
          "market.not_found",
          `Market ${market.id} was not found after projection replay`,
        );
      }

      const replayedBets = await this.bets.listByMarketId(market.id, tx);
      const processedAt = new Date().toISOString();
      const replayedEventsView = replayEvents.map<ValidationChainRecentEventViewModel>(
        (event) => ({
          eventName: event.eventName,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
          logIndex: event.logIndex,
          marketChainId: event.marketChainId,
          propositionChainId: event.propositionChainId,
          processedAt: event.processedAt.toISOString(),
        }),
      );

      await this.audit.record(
        {
          entityType: "validation_market",
          entityId: market.id,
          action: "validation_chain.projection_replay.performed",
          actorUserId: input.actorUserId,
          reason: input.reason,
          note: input.note,
          metadata: {
            propositionId: replayedMarket.propositionId,
            marketId: replayedMarket.id,
            chainMarketId: replayedMarket.chainMarketId,
            chainPropositionId: replayedMarket.chainPropositionId,
            replayedEventCount: replayEvents.length,
            replayedEventIds: replayEvents.map((event) => event.id),
          },
        },
        tx,
      );

      return {
        marketId: replayedMarket.id,
        propositionId: replayedMarket.propositionId,
        chainMarketId: replayedMarket.chainMarketId,
        chainPropositionId: replayedMarket.chainPropositionId,
        processedAt,
        replayedEventCount: replayEvents.length,
        replayedEvents: replayedEventsView,
        propositionStatus: proposition.status,
        propositionSettledAt: toIso(proposition.settledAt),
        finalMarketProjection: {
          chainStatus: replayedMarket.chainStatus,
          chainOpenedAt: toIso(replayedMarket.chainOpenedAt),
          chainFrozenAt: toIso(replayedMarket.chainFrozenAt),
          chainResolvedAt: toIso(replayedMarket.chainResolvedAt),
          chainCancelledAt: toIso(replayedMarket.chainCancelledAt),
          chainResultKind: replayedMarket.chainResultKind,
          chainWinningOption: replayedMarket.chainWinningOption,
          chainVoidReason: replayedMarket.chainVoidReason,
          resolutionTxHash: replayedMarket.resolutionTxHash,
          cancelTxHash: replayedMarket.cancelTxHash,
          chainSyncedAt: toIso(replayedMarket.chainSyncedAt),
        },
        finalBetProjections: replayedBets.map((bet) => ({
          betId: bet.id,
          marketId: bet.marketId,
          propositionId: bet.propositionId,
          userId: bet.userId,
          status: bet.status,
          claimed: bet.claimed,
          settlementOutcome: bet.settlementOutcome,
          grossPayout: bet.grossPayout,
          refundAmount: bet.refundAmount,
          claimTxHash: bet.claimTxHash,
          refundTxHash: bet.refundTxHash,
          chainSyncedAt: toIso(bet.chainSyncedAt),
        })),
      };
    });
  }

  private async resetMarketProjectionState(
    marketId: string,
    db: ArenaDbClient,
  ): Promise<void> {
    await this.markets.update(
      marketId,
      {
        chainStatus: null,
        chainOpenedAt: null,
        chainFrozenAt: null,
        chainResolvedAt: null,
        chainCancelledAt: null,
        chainResultKind: null,
        chainWinningOption: null,
        chainVoidReason: null,
        resolutionTxHash: null,
        cancelTxHash: null,
        chainSyncedAt: null,
      },
      db,
    );
  }

  private async resetBetProjectionState(
    marketId: string,
    db: ArenaDbClient,
  ): Promise<void> {
    const bets = await this.bets.listByMarketId(marketId, db);

    await Promise.all(
      bets.map((bet) =>
        this.bets.update(
          bet.id,
          {
            status: "placed",
            settledAt: null,
            settlementOutcome: null,
            grossPayout: null,
            pnl: null,
            refundAmount: null,
            claimed: false,
            claimedAt: null,
            claimTxHash: null,
            refundedAt: null,
            refundTxHash: null,
            chainSyncedAt: null,
          },
          db,
        ),
      ),
    );
  }
}
