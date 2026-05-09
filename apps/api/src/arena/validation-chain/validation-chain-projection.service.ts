import { Injectable, Optional } from "@nestjs/common";
import type {
  Bet,
  Market,
  ValidationChainEvent,
  ValidationChainMarketStatus,
  ValidationChainResultKind,
  ValidationChainVoidReason,
} from "@prisma/client";
import { ethers } from "ethers";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaInvariantError,
  ArenaValidationError,
} from "../arena.errors";
import { withArenaTransaction } from "../arena-transaction.utils";
import type { ArenaDbClient } from "../prisma.types";
import { BetRepository } from "../repositories/bet.repository";
import { MarketRepository } from "../repositories/market.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import type {
  ValidationChainBetPlacedPayload,
  ValidationChainClaimedPayload,
  ValidationChainEventPayload,
  ValidationChainMarketCancelledPayload,
  ValidationChainMarketCreatedPayload,
  ValidationChainMarketFrozenPayload,
  ValidationChainMarketOpenedPayload,
  ValidationChainMarketResolvedPayload,
  ValidationChainRefundedPayload,
} from "./validation-chain.types";
import { ValidationChainProcessingError } from "./validation-chain.types";
import { ValidationChainAlertService } from "./validation-chain-alert.service";

@Injectable()
export class ValidationChainProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markets: MarketRepository,
    private readonly bets: BetRepository,
    private readonly audit: InternalAuditService,
    @Optional()
    private readonly alerts?: ValidationChainAlertService,
  ) {}

  async projectEvent(
    event: ValidationChainEvent,
    db?: ArenaDbClient,
  ): Promise<void> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      try {
        switch (event.eventName) {
          case "MarketCreated":
            await this.projectMarketCreated(event, tx);
            return;
          case "MarketOpened":
            await this.projectMarketOpened(event, tx);
            return;
          case "BetPlaced":
            await this.projectBetPlaced(event, tx);
            return;
          case "MarketFrozen":
            await this.projectMarketFrozen(event, tx);
            return;
          case "MarketResolved":
            await this.projectMarketResolved(event, tx);
            return;
          case "MarketCancelled":
            await this.projectMarketCancelled(event, tx);
            return;
          case "Claimed":
            await this.projectClaimed(event, tx);
            return;
          case "Refunded":
            await this.projectRefunded(event, tx);
            return;
          default:
            return;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await this.audit.record(
          {
            entityType: "validation_chain_event",
            entityId: event.id,
            action: "validation_chain.project.failed",
            reason: "validation_chain.project.error",
            metadata: {
              eventName: event.eventName,
              transactionHash: event.transactionHash,
              logIndex: event.logIndex,
              error: errorMessage,
            },
          },
          tx,
        );

        if (isProjectionEntityMissingError(errorMessage) && this.alerts) {
          await this.alerts.recordProjectorEntityMissing({
            eventId: event.id,
            eventName: event.eventName,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex,
            error: errorMessage,
          });
        }

        if (error instanceof ValidationChainProcessingError) {
          throw error;
        }

        throw new ValidationChainProcessingError(
          error instanceof Error ? error.message : "Unknown projection error",
          false,
        );
      }
    });
  }

  private async projectMarketCreated(
    event: ValidationChainEvent,
    db: ArenaDbClient,
  ): Promise<void> {
    const payload = event.payloadJson as unknown as ValidationChainMarketCreatedPayload;
    const market = await this.findRequiredMarketByEvent(event, db);

    await this.markets.update(
      market.id,
      {
        chainMarketId: payload.marketId,
        chainPropositionId: payload.propositionId,
        chainStatus: "pre_live",
        chainSyncedAt: this.toDate(payload.blockTimestamp),
      },
      db,
    );
  }

  private async projectMarketOpened(
    event: ValidationChainEvent,
    db: ArenaDbClient,
  ): Promise<void> {
    const payload = event.payloadJson as unknown as ValidationChainMarketOpenedPayload;
    const market = await this.findRequiredMarketByEvent(event, db);

    await this.markets.update(
      market.id,
      {
        chainStatus: "live",
        chainOpenedAt: this.toDate(payload.openedAt),
        chainSyncedAt: this.toDate(payload.blockTimestamp),
      },
      db,
    );
  }

  private async projectBetPlaced(
    event: ValidationChainEvent,
    db: ArenaDbClient,
  ): Promise<void> {
    const payload = event.payloadJson as unknown as ValidationChainBetPlacedPayload;
    const market = await this.findRequiredMarketByEvent(event, db);
    const userId = normalizeWalletAddress(payload.user);
    const bet = await this.bets.findByMarketAndUser(market.id, userId, db);

    if (!bet) {
      throw new ValidationChainProcessingError(
        `Validation bet for market ${market.id} and user ${userId} was not found`,
        false,
      );
    }

    if (
      bet.selectedOption !== payload.selectedOption ||
      bet.stakeAmount !== payload.amount
    ) {
      throw new ValidationChainProcessingError(
        `Validation bet payload mismatch for market ${market.id} and user ${userId}`,
        false,
      );
    }

    await this.bets.update(
      bet.id,
      {
        chainSyncedAt: this.toDate(payload.blockTimestamp),
      },
      db,
    );
  }

  private async projectMarketFrozen(
    event: ValidationChainEvent,
    db: ArenaDbClient,
  ): Promise<void> {
    const payload = event.payloadJson as unknown as ValidationChainMarketFrozenPayload;
    const market = await this.findRequiredMarketByEvent(event, db);

    await this.markets.update(
      market.id,
      {
        chainStatus: "frozen",
        chainFrozenAt: this.toDate(payload.frozenAt),
        chainSyncedAt: this.toDate(payload.blockTimestamp),
      },
      db,
    );
  }

  private async projectMarketResolved(
    event: ValidationChainEvent,
    db: ArenaDbClient,
  ): Promise<void> {
    const payload = event.payloadJson as unknown as ValidationChainMarketResolvedPayload;
    const market = await this.findRequiredMarketByEvent(event, db);
    const bets = await this.bets.listByMarketId(market.id, db);
    const resolvedAt = this.toDate(payload.resolvedAt);

    await this.markets.update(
      market.id,
      {
        chainStatus: "resolved",
        chainResolvedAt: resolvedAt,
        chainResultKind: payload.resultKind,
        chainWinningOption: payload.winningOption,
        chainVoidReason: payload.voidReason,
        resolutionTxHash: event.transactionHash,
        chainSyncedAt: this.toDate(payload.blockTimestamp),
      },
      db,
    );

    const poolOption0 = sumStakeAmounts(
      bets.filter((bet) => bet.selectedOption === 0),
    );
    const poolOption1 = sumStakeAmounts(
      bets.filter((bet) => bet.selectedOption === 1),
    );
    const totalPool = poolOption0 + poolOption1;
    const winningOption = payload.winningOption;
    const winningPool =
      winningOption === 0 ? poolOption0 : winningOption === 1 ? poolOption1 : 0n;

    for (const bet of bets) {
      const update = buildResolvedBetProjection({
        bet,
        resolvedAt,
        resultKind: payload.resultKind,
        winningOption,
        winningPool,
        totalPool,
      });

      await this.bets.update(bet.id, update, db);
    }
  }

  private async projectMarketCancelled(
    event: ValidationChainEvent,
    db: ArenaDbClient,
  ): Promise<void> {
    const payload = event.payloadJson as unknown as ValidationChainMarketCancelledPayload;
    const market = await this.findRequiredMarketByEvent(event, db);
    const cancelledAt = this.toDate(payload.cancelledAt);
    const bets = await this.bets.listByMarketId(market.id, db);

    await this.markets.update(
      market.id,
      {
        chainStatus: "cancelled",
        chainCancelledAt: cancelledAt,
        cancelTxHash: event.transactionHash,
        chainSyncedAt: this.toDate(payload.blockTimestamp),
      },
      db,
    );

    for (const bet of bets) {
      await this.bets.update(
        bet.id,
        {
          status: "settled",
          settledAt: cancelledAt,
          settlementOutcome: "refund",
          grossPayout: bet.stakeAmount,
          pnl: "0",
          refundAmount: bet.stakeAmount,
          chainSyncedAt: this.toDate(payload.blockTimestamp),
        },
        db,
      );
    }
  }

  private async projectClaimed(
    event: ValidationChainEvent,
    db: ArenaDbClient,
  ): Promise<void> {
    const payload = event.payloadJson as unknown as ValidationChainClaimedPayload;
    const { bet } = await this.findRequiredBetByEvent(event, payload.user, db);

    await this.bets.update(
      bet.id,
      {
        claimed: true,
        claimedAt: this.toDate(payload.blockTimestamp),
        claimTxHash: event.transactionHash,
        grossPayout: payload.amount,
        pnl: subtractIntegerStrings(payload.amount, bet.stakeAmount),
        chainSyncedAt: this.toDate(payload.blockTimestamp),
      },
      db,
    );
  }

  private async projectRefunded(
    event: ValidationChainEvent,
    db: ArenaDbClient,
  ): Promise<void> {
    const payload = event.payloadJson as unknown as ValidationChainRefundedPayload;
    const { bet } = await this.findRequiredBetByEvent(event, payload.user, db);

    await this.bets.update(
      bet.id,
      {
        claimed: true,
        refundedAt: this.toDate(payload.blockTimestamp),
        refundTxHash: event.transactionHash,
        refundAmount: payload.amount,
        grossPayout: payload.amount,
        pnl: "0",
        chainSyncedAt: this.toDate(payload.blockTimestamp),
      },
      db,
    );
  }

  private async findRequiredMarketByEvent(
    event: ValidationChainEvent,
    db: ArenaDbClient,
  ): Promise<Market> {
    if (!event.marketChainId && !event.propositionChainId) {
      throw new ValidationChainProcessingError(
        `Validation event ${event.id} is missing chain identifiers`,
        false,
      );
    }

    const market =
      (event.marketChainId
        ? await this.markets.findByChainMarketId(event.marketChainId, db)
        : null) ??
      (event.propositionChainId
        ? await this.markets.findByChainPropositionId(event.propositionChainId, db)
        : null);

    if (!market) {
      throw new ValidationChainProcessingError(
        `Validation market projection target was not found for event ${event.id}`,
        false,
      );
    }

    return market;
  }

  private async findRequiredBetByEvent(
    event: ValidationChainEvent,
    user: string,
    db: ArenaDbClient,
  ): Promise<{ market: Market; bet: Bet }> {
    const market = await this.findRequiredMarketByEvent(event, db);
    const userId = normalizeWalletAddress(user);
    const bet = await this.bets.findByMarketAndUser(market.id, userId, db);

    if (!bet) {
      throw new ValidationChainProcessingError(
        `Validation bet projection target was not found for market ${market.id} and user ${userId}`,
        false,
      );
    }

    return { market, bet };
  }

  private toDate(timestamp: number): Date {
    return new Date(timestamp * 1000);
  }
}

function normalizeWalletAddress(walletAddress: string): string {
  return ethers.utils.getAddress(walletAddress).toLowerCase();
}

function sumStakeAmounts(bets: Bet[]): bigint {
  return bets.reduce((sum, bet) => sum + BigInt(bet.stakeAmount), 0n);
}

function buildResolvedBetProjection(input: {
  bet: Bet;
  resolvedAt: Date;
  resultKind: ValidationChainResultKind;
  winningOption: number | null;
  winningPool: bigint;
  totalPool: bigint;
}) {
  if (input.resultKind === "void") {
    return {
      status: "settled" as const,
      settledAt: input.resolvedAt,
      settlementOutcome: "refund" as const,
      grossPayout: input.bet.stakeAmount,
      pnl: "0",
      refundAmount: input.bet.stakeAmount,
    };
  }

  if (input.bet.selectedOption !== input.winningOption) {
    return {
      status: "settled" as const,
      settledAt: input.resolvedAt,
      settlementOutcome: "lost" as const,
      grossPayout: "0",
      pnl: `-${input.bet.stakeAmount}`,
      refundAmount: null,
    };
  }

  if (input.winningPool === 0n) {
    throw new ArenaValidationError(
      "validation_chain.resolve.zero_winning_pool",
      "Winning pool must be non-zero for resolved markets",
    );
  }

  const stakeAmount = BigInt(input.bet.stakeAmount);
  const grossPayout = ((stakeAmount * input.totalPool) / input.winningPool).toString();

  return {
    status: "settled" as const,
    settledAt: input.resolvedAt,
    settlementOutcome: "won" as const,
    grossPayout,
    pnl: subtractIntegerStrings(grossPayout, input.bet.stakeAmount),
    refundAmount: null,
  };
}

function subtractIntegerStrings(left: string, right: string): string {
  return (BigInt(left) - BigInt(right)).toString();
}

function isProjectionEntityMissingError(message: string): boolean {
  return /projection target was not found|was not found/i.test(message);
}
