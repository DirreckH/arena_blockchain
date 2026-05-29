import { Injectable } from "@nestjs/common";
import type { Prisma, ValidationChainEvent } from "@prisma/client";
import type { providers } from "ethers";
import { PinoLogger } from "nestjs-pino";

import { PrismaService } from "../../database/prisma.service";
import { InternalAuditService } from "../services/internal-audit.service";
import { ValidationRehearsalCheckpointService } from "../services/validation-rehearsal-checkpoint.service";
import type { ArenaDbClient } from "../prisma.types";
import { MarketRepository } from "../repositories/market.repository";
import { ValidationChainCursorRepository } from "../repositories/validation-chain-cursor.repository";
import { ValidationChainEventRepository } from "../repositories/validation-chain-event.repository";
import {
  VALIDATION_CHAIN_STREAM_KEY,
  ValidationChainProcessingError,
  type ValidationChainBetPlacedPayload,
  type ValidationChainClaimedPayload,
  type ValidationChainEventPayload,
  type ValidationChainMarketCancelledPayload,
  type ValidationChainMarketCreatedPayload,
  type ValidationChainMarketFrozenPayload,
  type ValidationChainMarketOpenedPayload,
  type ValidationChainMarketResolvedPayload,
  type ValidationChainPausePayload,
  type ValidationChainRefundedPayload,
  type ValidationChainSyncSnapshot,
} from "./validation-chain.types";
import { ValidationChainContractService } from "./validation-chain-contract.service";
import { ValidationChainProjectionService } from "./validation-chain-projection.service";

@Injectable()
export class ValidationChainSyncWorker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contract: ValidationChainContractService,
    private readonly cursors: ValidationChainCursorRepository,
    private readonly events: ValidationChainEventRepository,
    private readonly markets: MarketRepository,
    private readonly projector: ValidationChainProjectionService,
    private readonly audit: InternalAuditService,
    private readonly rehearsalCheckpoints: ValidationRehearsalCheckpointService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ValidationChainSyncWorker.name);
  }

  async syncOnce(): Promise<ValidationChainSyncSnapshot> {
    const snapshot = this.contract.getSnapshot();
    const cursor = await this.cursors.upsertCursor({
      streamKey: VALIDATION_CHAIN_STREAM_KEY,
      chainId: snapshot.configuredChainId,
      contractAddress: snapshot.contractAddress,
      syncStatus: "syncing",
    });

    try {
      const latestBlock = await this.contract.getLatestBlockNumber();
      const safeToBlock = Math.max(latestBlock - snapshot.confirmations, 0);
      await this.cursors.updateFinalizedBlock(
        cursor.streamKey,
        safeToBlock,
        "syncing",
      );

      const startBlock = (cursor.lastProcessedBlock ?? -1) + 1;
      if (startBlock > safeToBlock) {
        await this.cursors.updateFinalizedBlock(cursor.streamKey, safeToBlock, "idle");
        return {
          streamKey: cursor.streamKey,
          latestBlock,
          safeToBlock,
          processedEvents: 0,
          fromBlock: null,
          toBlock: null,
        };
      }

      let fromBlock = startBlock;
      let processedEvents = 0;
      let lastToBlock = startBlock;

      while (fromBlock <= safeToBlock) {
        const toBlock = Math.min(
          fromBlock + snapshot.batchSize - 1,
          safeToBlock,
        );
        lastToBlock = toBlock;

        const logs = await this.contract.getLogs({
          fromBlock,
          toBlock,
          topics: [this.contract.getSupportedEventTopics()],
        });

        const orderedLogs = [...logs].sort(compareLogs);
        if (orderedLogs.length === 0) {
          await this.cursors.updateProcessedCheckpoint(cursor.streamKey, {
            lastProcessedBlock: toBlock,
            lastProcessedTxHash: null,
            lastProcessedLogIndex: null,
            syncStatus: "syncing",
          });
          fromBlock = toBlock + 1;
          continue;
        }

        const blockCache = new Map<number, providers.Block>();
        for (const log of orderedLogs) {
          await this.processLog(log, snapshot.configuredChainId, blockCache);
          processedEvents += 1;
        }

        fromBlock = toBlock + 1;
      }

      await this.cursors.updateFinalizedBlock(cursor.streamKey, safeToBlock, "idle");
      return {
        streamKey: cursor.streamKey,
        latestBlock,
        safeToBlock,
        processedEvents,
        fromBlock: startBlock,
        toBlock: lastToBlock,
      };
    } catch (error) {
      await this.cursors.upsertCursor({
        streamKey: cursor.streamKey,
        chainId: snapshot.configuredChainId,
        contractAddress: snapshot.contractAddress,
        lastProcessedBlock: cursor.lastProcessedBlock,
        lastProcessedTxHash: cursor.lastProcessedTxHash,
        lastProcessedLogIndex: cursor.lastProcessedLogIndex,
        lastFinalizedBlock: cursor.lastFinalizedBlock,
        syncStatus: "error",
      });
      await this.audit.record({
        entityType: "validation_chain_stream",
        entityId: cursor.streamKey,
        action: "validation_chain.sync.failed",
        reason: "validation_chain.sync.error",
        metadata: {
          retryable: isRetryableSyncError(error),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private async processLog(
    log: providers.Log,
    chainId: number,
    blockCache: Map<number, providers.Block>,
  ): Promise<void> {
    const parsed = this.contract.parseLog(log);
    const block = await this.getCachedBlock(log.blockNumber, blockCache);
    const payload = this.toPayload(parsed, block.timestamp);

    await this.prisma.$transaction(async (tx) => {
      const eventResult = await this.events.insertIfAbsent(
        {
          chainId,
          contractAddress: log.address,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          transactionIndex: log.transactionIndex,
          logIndex: log.logIndex,
          eventName: parsed.name,
          marketChainId: payload.marketId ?? null,
          propositionChainId: payload.propositionId ?? null,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      if (eventResult.inserted) {
        await this.projector.projectEvent(eventResult.event, tx);
        await this.recordAutomaticRehearsalCheckpoint(eventResult.event, tx);
      }

      await this.cursors.updateProcessedCheckpoint(VALIDATION_CHAIN_STREAM_KEY, {
        lastProcessedBlock: log.blockNumber,
        lastProcessedTxHash: log.transactionHash,
        lastProcessedLogIndex: log.logIndex,
        syncStatus: "syncing",
      }, tx);
    });
  }

  private async recordAutomaticRehearsalCheckpoint(
    event: ValidationChainEvent,
    tx: ArenaDbClient,
  ): Promise<void> {
    if (event.eventName !== "BetPlaced") {
      return;
    }

    const market =
      (event.marketChainId
        ? await this.markets.findByChainMarketId(event.marketChainId, tx)
        : null) ??
      (event.propositionChainId
        ? await this.markets.findByChainPropositionId(
            event.propositionChainId,
            tx,
          )
        : null);

    if (!market) {
      return;
    }

    const payload = event.payloadJson as unknown as ValidationChainBetPlacedPayload;
    await this.rehearsalCheckpoints.recordCheckpoint(
      {
        propositionId: market.propositionId,
        stepId: "local_bet_and_sync",
        status: "complete",
        reason: "validation_rehearsal.auto.bet_projection_synced",
        evidence: [
          `marketChainId=${event.marketChainId ?? "missing"}`,
          `chainPropositionId=${event.propositionChainId ?? "missing"}`,
          `marketId=${market.id}`,
          `userId=${payload.user.toLowerCase()}`,
          `selectedOption=${String(payload.selectedOption)}`,
          `stakeAmount=${payload.amount}`,
          `transactionHash=${event.transactionHash}`,
          `blockNumber=${String(event.blockNumber)}`,
        ],
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
        recordedAt: event.processedAt.toISOString(),
      },
      tx,
    );
  }

  private async getCachedBlock(
    blockNumber: number,
    blockCache: Map<number, providers.Block>,
  ): Promise<providers.Block> {
    const existing = blockCache.get(blockNumber);
    if (existing) {
      return existing;
    }

    const block = await this.contract.getBlock(blockNumber);
    blockCache.set(blockNumber, block);
    return block;
  }

  private toPayload(
    parsed: ReturnType<ValidationChainContractService["parseLog"]>,
    blockTimestamp: number,
  ): ValidationChainEventPayload & { marketId?: string; propositionId?: string } {
    switch (parsed.name) {
      case "MarketCreated":
        return {
          marketId: parsed.args.marketId,
          propositionId: parsed.args.propositionId,
          minStake: parsed.args.minStake.toString(),
          operator: parsed.args.operator,
          blockTimestamp,
        } satisfies ValidationChainMarketCreatedPayload;
      case "MarketOpened":
        return {
          marketId: parsed.args.marketId,
          openedAt: Number(parsed.args.openedAt),
          operator: parsed.args.operator,
          blockTimestamp,
        } satisfies ValidationChainMarketOpenedPayload;
      case "BetPlaced":
        return {
          marketId: parsed.args.marketId,
          propositionId: parsed.args.propositionId,
          user: parsed.args.user,
          selectedOption: Number(parsed.args.selectedOption),
          amount: parsed.args.amount.toString(),
          blockTimestamp,
        } satisfies ValidationChainBetPlacedPayload;
      case "MarketFrozen":
        return {
          marketId: parsed.args.marketId,
          frozenAt: Number(parsed.args.frozenAt),
          operator: parsed.args.operator,
          blockTimestamp,
        } satisfies ValidationChainMarketFrozenPayload;
      case "MarketResolved":
        return {
          marketId: parsed.args.marketId,
          propositionId: parsed.args.propositionId,
          resultKind:
            Number(parsed.args.resultKind) === 1 ? "resolved" : "void",
          winningOption:
            Number(parsed.args.resultKind) === 1
              ? Number(parsed.args.winningOption)
              : null,
          voidReason:
            Number(parsed.args.resultKind) === 2
              ? Number(parsed.args.voidReason) === 1
                ? "insufficient_sample"
                : "tie"
              : null,
          resolvedAt: Number(parsed.args.resolvedAt),
          oracle: parsed.args.oracle,
          blockTimestamp,
        } satisfies ValidationChainMarketResolvedPayload;
      case "MarketCancelled":
        return {
          marketId: parsed.args.marketId,
          propositionId: parsed.args.propositionId,
          reasonCode: parsed.args.reasonCode,
          cancelledAt: Number(parsed.args.cancelledAt),
          operator: parsed.args.operator,
          blockTimestamp,
        } satisfies ValidationChainMarketCancelledPayload;
      case "Claimed":
        return {
          marketId: parsed.args.marketId,
          propositionId: parsed.args.propositionId,
          user: parsed.args.user,
          amount: parsed.args.amount.toString(),
          blockTimestamp,
        } satisfies ValidationChainClaimedPayload;
      case "Refunded":
        return {
          marketId: parsed.args.marketId,
          propositionId: parsed.args.propositionId,
          user: parsed.args.user,
          amount: parsed.args.amount.toString(),
          blockTimestamp,
        } satisfies ValidationChainRefundedPayload;
      case "Paused":
      case "Unpaused":
        return {
          account: parsed.args.account,
          blockTimestamp,
        } satisfies ValidationChainPausePayload;
      default:
        throw new ValidationChainProcessingError(
          `Unsupported validation-chain event ${parsed.name}`,
          false,
        );
    }
  }
}

function compareLogs(left: providers.Log, right: providers.Log): number {
  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber - right.blockNumber;
  }

  if (left.transactionIndex !== right.transactionIndex) {
    return left.transactionIndex - right.transactionIndex;
  }

  return left.logIndex - right.logIndex;
}

function isRetryableSyncError(error: unknown): boolean {
  if (error instanceof ValidationChainProcessingError) {
    return error.retryable;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /timeout|network|ECONN|connection|server error|429/i.test(error.message);
}
