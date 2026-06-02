import { Injectable } from "@nestjs/common";

import type { Prisma, ValidationChainMarketStatus } from "@prisma/client";

import { AppConfigService } from "../../config/app-config.service";
import { PrismaService } from "../../database/prisma.service";
import type {
  ValidationChainHealthAlertViewModel,
  ValidationChainMonitoringViewModel,
} from "../internal-ops.types";
import type { ArenaDbClient } from "../prisma.types";
import { ValidationChainCursorRepository } from "../repositories/validation-chain-cursor.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import { withArenaTransaction } from "../arena-transaction.utils";
import { VALIDATION_CHAIN_STREAM_KEY } from "./validation-chain.types";
import { RedisService } from "../../queue/redis.service";
import {
  evaluateSchedulerWorkerHealth,
} from "../../queue/scheduler-worker-heartbeat";

const RECENT_ALERT_WINDOW_MS = 15 * 60 * 1000;
const STALE_PAYOUT_WINDOW_MS = 24 * 60 * 60 * 1000;
const UNSYNCED_BET_BACKLOG_WINDOW_MS = 15 * 60 * 1000;

const CURSOR_STALLED_ACTION = "validation_chain.alert.cursor_stalled";
const COMMAND_TERMINAL_ACTION = "validation_chain.alert.command_terminal";
const COMMAND_RETRY_EXHAUSTED_ACTION =
  "validation_chain.alert.command_retry_exhausted";
const PROJECTOR_ENTITY_MISSING_ACTION =
  "validation_chain.alert.projector_entity_missing";
const SYNC_WORKER_UNHEALTHY_ACTION =
  "validation_chain.alert.sync_worker_unhealthy";
const UNSYNCED_BET_BACKLOG_ACTION =
  "validation_chain.alert.unsynced_bet_backlog";

const RECENT_ALERT_ACTIONS = [
  CURSOR_STALLED_ACTION,
  COMMAND_TERMINAL_ACTION,
  COMMAND_RETRY_EXHAUSTED_ACTION,
  PROJECTOR_ENTITY_MISSING_ACTION,
  SYNC_WORKER_UNHEALTHY_ACTION,
  UNSYNCED_BET_BACKLOG_ACTION,
  "validation_chain.pause.submitted",
  "validation_chain.unpause.submitted",
] as const;

@Injectable()
export class ValidationChainAlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly cursors: ValidationChainCursorRepository,
    private readonly redis: RedisService,
    private readonly audit: InternalAuditService,
  ) {}

  async recordCommandRetryQueued(input: {
    propositionId: string;
    command: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
    queueJobId: string;
    error: string;
  }): Promise<void> {
    await this.audit.record({
      entityType: "validation_chain_command",
      entityId: input.propositionId,
      action: "validation_chain.command.retry_queued",
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
      note: input.note,
      metadata: {
        command: input.command,
        queueJobId: input.queueJobId,
        error: input.error,
      },
    });
  }

  async recordCommandEnqueued(input: {
    propositionId: string;
    command: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
    queueJobId: string;
    delayMs: number;
  }): Promise<void> {
    await this.audit.record({
      entityType: "validation_chain_command",
      entityId: input.propositionId,
      action: "validation_chain.command.enqueued",
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
      note: input.note,
      metadata: {
        command: input.command,
        queueJobId: input.queueJobId,
        delayMs: input.delayMs,
      },
    });
  }

  async recordCommandTerminal(input: {
    propositionId: string;
    command: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
    error: string;
  }): Promise<void> {
    await this.audit.record({
      entityType: "validation_chain_command",
      entityId: input.propositionId,
      action: COMMAND_TERMINAL_ACTION,
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
      note: input.note,
      metadata: {
        command: input.command,
        error: input.error,
      },
    });
  }

  async recordCommandRetryExhausted(input: {
    propositionId: string;
    command: string;
    actorUserId?: string | null;
    attemptsMade: number;
    maxAttempts: number;
    error: string;
  }): Promise<void> {
    await this.audit.record({
      entityType: "validation_chain_command",
      entityId: input.propositionId,
      action: COMMAND_RETRY_EXHAUSTED_ACTION,
      actorUserId: input.actorUserId ?? null,
      reason: "validation_chain.command.retry_exhausted",
      metadata: {
        command: input.command,
        attemptsMade: input.attemptsMade,
        maxAttempts: input.maxAttempts,
        error: input.error,
      },
    });
  }

  async recordProjectorEntityMissing(input: {
    eventId: string;
    eventName: string;
    transactionHash: string;
    logIndex: number;
    error: string;
  }): Promise<void> {
    await this.audit.record({
      entityType: "validation_chain_event",
      entityId: input.eventId,
      action: PROJECTOR_ENTITY_MISSING_ACTION,
      reason: "validation_chain.project.entity_missing",
      metadata: {
        eventName: input.eventName,
        transactionHash: input.transactionHash,
        logIndex: input.logIndex,
        error: input.error,
      },
    });
  }

  async recordCommandSkipped(input: {
    propositionId: string;
    command: string;
    actorUserId?: string | null;
    reason: string;
    note?: string;
    error: string;
  }): Promise<void> {
    await this.audit.record({
      entityType: "validation_chain_command",
      entityId: input.propositionId,
      action: "validation_chain.command.skipped",
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
      note: input.note,
      metadata: {
        command: input.command,
        error: input.error,
      },
    });
  }

  async getHealthSnapshot(
    nowIso = new Date().toISOString(),
    db?: ArenaDbClient,
  ): Promise<ValidationChainMonitoringViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const now = new Date(nowIso);
      const recentSince = new Date(now.getTime() - RECENT_ALERT_WINDOW_MS);
      const stalePayoutBefore = new Date(now.getTime() - STALE_PAYOUT_WINDOW_MS);
      const staleThresholdMs = Math.max(
        this.config.validationSyncPollIntervalMs * 4,
        60_000,
      );

      const [
        cursor,
        recentAlerts,
        stalePayoutMarkets,
        totalEventCount,
        duplicateRows,
        recentEvents,
        latestMarket,
        latestBet,
        unsyncedBetBacklog,
        projectorFailuresCount,
        syncFailuresCount,
        recentFailures,
      ] = await Promise.all([
        this.cursors.getCursor(VALIDATION_CHAIN_STREAM_KEY, tx),
        tx.internalAuditEvent.findMany({
          where: {
            action: {
              in: [...RECENT_ALERT_ACTIONS, "validation_chain.sync.failed"],
            },
            createdAt: {
              gte: recentSince,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        }),
        tx.market.findMany({
          where: {
            OR: [
              {
                chainStatus: "resolved",
                chainResolvedAt: {
                  lt: stalePayoutBefore,
                },
              },
              {
                chainStatus: "cancelled",
                chainCancelledAt: {
                  lt: stalePayoutBefore,
                },
              },
            ],
            bets: {
              some: {
                claimed: false,
              },
            },
          },
          orderBy: [
            { chainResolvedAt: "asc" },
            { chainCancelledAt: "asc" },
          ],
          take: 10,
          select: {
            id: true,
            propositionId: true,
            chainStatus: true,
            chainResolvedAt: true,
            chainCancelledAt: true,
            bets: {
              where: {
                claimed: false,
              },
              select: {
                id: true,
              },
            },
          },
        }),
        tx.validationChainEvent.count(),
        tx.$queryRawUnsafe<
          Array<{
            chain_id: number;
            transaction_hash: string;
            log_index: number;
            count: number | bigint;
          }>
        >(
          `select chain_id,
                  transaction_hash,
                  log_index,
                  count(*)::int as count
             from validation_chain_event
            group by chain_id, transaction_hash, log_index
           having count(*) > 1
            order by chain_id asc, transaction_hash asc, log_index asc`,
        ),
        tx.validationChainEvent.findMany({
          orderBy: [
            { blockNumber: "desc" },
            { transactionIndex: "desc" },
            { logIndex: "desc" },
          ],
          take: 10,
          select: {
            eventName: true,
            blockNumber: true,
            transactionHash: true,
            transactionIndex: true,
            logIndex: true,
            marketChainId: true,
            propositionChainId: true,
            processedAt: true,
          },
        }),
        tx.market.findFirst({
          where: {
            chainStatus: {
              not: null,
            },
          },
          orderBy: {
            chainSyncedAt: "desc",
          },
          select: {
            id: true,
            propositionId: true,
            chainMarketId: true,
            chainStatus: true,
            chainResultKind: true,
            chainWinningOption: true,
            resolutionTxHash: true,
            cancelTxHash: true,
            chainSyncedAt: true,
          },
        }),
        tx.bet.findFirst({
          where: {
            chainSyncedAt: {
              not: null,
            },
          },
          orderBy: {
            chainSyncedAt: "desc",
          },
          select: {
            id: true,
            marketId: true,
            propositionId: true,
            userId: true,
            status: true,
            settlementOutcome: true,
            grossPayout: true,
            refundAmount: true,
            chainSyncedAt: true,
          },
        }),
        tx.bet.findMany({
          where: {
            chainSyncedAt: null,
            market: {
              chainMarketId: {
                not: null,
              },
              chainStatus: {
                notIn: ["resolved", "cancelled"],
              },
            },
          },
          orderBy: {
            placedAt: "asc",
          },
          take: 20,
          select: {
            id: true,
            marketId: true,
            propositionId: true,
            userId: true,
            status: true,
            stakeAmount: true,
            placedAt: true,
            chainSyncedAt: true,
            market: {
              select: {
                chainMarketId: true,
                chainStatus: true,
              },
            },
          },
        }),
        tx.internalAuditEvent.count({
          where: {
            action: "validation_chain.project.failed",
          },
        }),
        tx.internalAuditEvent.count({
          where: {
            action: "validation_chain.sync.failed",
          },
        }),
        tx.internalAuditEvent.findMany({
          where: {
            action: {
              in: [
                "validation_chain.project.failed",
                "validation_chain.sync.failed",
                PROJECTOR_ENTITY_MISSING_ACTION,
                COMMAND_TERMINAL_ACTION,
                COMMAND_RETRY_EXHAUSTED_ACTION,
              ],
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        }),
      ]);

      const isCursorStalled =
        cursor === null ||
        now.getTime() - cursor.updatedAt.getTime() > staleThresholdMs;
      const schedulerWorker = await this.getSchedulerWorkerSnapshot(nowIso);

      const mappedAlerts = recentAlerts.map<ValidationChainHealthAlertViewModel>(
        (event) => ({
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          reason: event.reason,
          metadata: event.metadataJson,
          createdAt: event.createdAt.toISOString(),
        }),
      );

      return {
        streamKey: VALIDATION_CHAIN_STREAM_KEY,
        chainId: cursor?.chainId ?? null,
        contractAddress: cursor?.contractAddress ?? null,
        syncStatus: cursor?.syncStatus ?? "missing",
        lastProcessedBlock: cursor?.lastProcessedBlock ?? null,
        lastProcessedTxHash: cursor?.lastProcessedTxHash ?? null,
        lastProcessedLogIndex: cursor?.lastProcessedLogIndex ?? null,
        lastFinalizedBlock: cursor?.lastFinalizedBlock ?? null,
        cursorUpdatedAt: cursor?.updatedAt.toISOString() ?? null,
        pollIntervalMs: this.config.validationSyncPollIntervalMs,
        cursorStaleThresholdMs: staleThresholdMs,
        isCursorStalled,
        schedulerWorker,
        recentAlerts: mappedAlerts,
        metrics: {
          recentRetryExhaustedCount: mappedAlerts.filter(
            (item) => item.action === COMMAND_RETRY_EXHAUSTED_ACTION,
          ).length,
          recentTerminalCommandCount: mappedAlerts.filter(
            (item) => item.action === COMMAND_TERMINAL_ACTION,
          ).length,
          recentSyncFailureCount: mappedAlerts.filter(
            (item) => item.action === "validation_chain.sync.failed",
          ).length,
          recentProjectorEntityMissingCount: mappedAlerts.filter(
            (item) => item.action === PROJECTOR_ENTITY_MISSING_ACTION,
          ).length,
          stalePayoutMarketCount: stalePayoutMarkets.length,
          unsyncedBetBacklogCount: unsyncedBetBacklog.length,
        },
        eventLedger: {
          totalEventCount,
          duplicateRows: duplicateRows.map((row) => ({
            chainId: Number(row.chain_id),
            transactionHash: row.transaction_hash,
            logIndex: Number(row.log_index),
            count: Number(row.count),
          })),
          recentEvents: recentEvents.map((event) => ({
            eventName: event.eventName,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            transactionIndex: event.transactionIndex,
            logIndex: event.logIndex,
            marketChainId: event.marketChainId,
            propositionChainId: event.propositionChainId,
            processedAt: event.processedAt.toISOString(),
          })),
        },
        projection: {
          latestMarket: latestMarket
            ? {
                marketId: latestMarket.id,
                propositionId: latestMarket.propositionId,
                chainMarketId: latestMarket.chainMarketId,
                chainStatus: latestMarket.chainStatus,
                chainResultKind: latestMarket.chainResultKind,
                chainWinningOption: latestMarket.chainWinningOption,
                resolutionTxHash: latestMarket.resolutionTxHash,
                cancelTxHash: latestMarket.cancelTxHash,
                chainSyncedAt: latestMarket.chainSyncedAt?.toISOString() ?? null,
              }
            : null,
          latestBet: latestBet
            ? {
                betId: latestBet.id,
                marketId: latestBet.marketId,
                propositionId: latestBet.propositionId,
                userId: latestBet.userId,
                status: latestBet.status,
                settlementOutcome: latestBet.settlementOutcome,
                grossPayout: latestBet.grossPayout,
                refundAmount: latestBet.refundAmount,
                chainSyncedAt: latestBet.chainSyncedAt?.toISOString() ?? null,
              }
            : null,
          unsyncedBetBacklog: unsyncedBetBacklog.map((bet) => ({
            betId: bet.id,
            marketId: bet.marketId,
            propositionId: bet.propositionId,
            userId: bet.userId,
            status: bet.status,
            stakeAmount: bet.stakeAmount,
            placedAt: bet.placedAt.toISOString(),
            chainMarketId: bet.market.chainMarketId,
            chainStatus: bet.market.chainStatus as ValidationChainMarketStatus | null,
            oldestUnsyncedAgeMs: Math.max(
              0,
              now.getTime() - bet.placedAt.getTime(),
            ),
          })),
        },
        failures: {
          projectorFailuresCount,
          syncFailuresCount,
          recentFailures: recentFailures.map((event) => ({
            action: event.action,
            entityType: event.entityType,
            entityId: event.entityId,
            reason: event.reason,
            metadata: event.metadataJson,
            createdAt: event.createdAt.toISOString(),
          })),
        },
        stalePayoutMarkets: stalePayoutMarkets.map((market) => ({
          marketId: market.id,
          propositionId: market.propositionId,
          chainStatus: market.chainStatus as ValidationChainMarketStatus,
          terminalAt: (
            market.chainResolvedAt ?? market.chainCancelledAt ?? new Date(0)
          ).toISOString(),
          unclaimedBetCount: market.bets.length,
        })),
      };
    });
  }

  async runHealthCheck(nowIso = new Date().toISOString()): Promise<void> {
    const snapshot = await this.getHealthSnapshot(nowIso);

    if (snapshot.isCursorStalled) {
      await this.recordAlertOnce({
        entityType: "validation_chain_stream",
        entityId: snapshot.streamKey,
        action: CURSOR_STALLED_ACTION,
        reason: "validation_chain.cursor.stalled",
        dedupeAfter: snapshot.cursorStaleThresholdMs,
        metadata: {
          lastProcessedBlock: snapshot.lastProcessedBlock,
          lastFinalizedBlock: snapshot.lastFinalizedBlock,
          cursorUpdatedAt: snapshot.cursorUpdatedAt,
          pollIntervalMs: snapshot.pollIntervalMs,
          cursorStaleThresholdMs: snapshot.cursorStaleThresholdMs,
        },
      });
    }

    if (snapshot.metrics.recentSyncFailureCount >= 3) {
      await this.recordAlertOnce({
        entityType: "validation_chain_stream",
        entityId: snapshot.streamKey,
        action: SYNC_WORKER_UNHEALTHY_ACTION,
        reason: "validation_chain.sync.unhealthy",
        dedupeAfter: RECENT_ALERT_WINDOW_MS,
        metadata: {
          recentSyncFailureCount: snapshot.metrics.recentSyncFailureCount,
          windowMs: RECENT_ALERT_WINDOW_MS,
        },
      });
    }

    if (snapshot.schedulerWorker?.status === "down") {
      await this.recordAlertOnce({
        entityType: "validation_chain_stream",
        entityId: snapshot.streamKey,
        action: SYNC_WORKER_UNHEALTHY_ACTION,
        reason: "validation_chain.sync.worker_heartbeat_down",
        dedupeAfter: snapshot.cursorStaleThresholdMs,
        metadata: {
          schedulerWorkerStatus: snapshot.schedulerWorker.status,
          workerStartedAt: snapshot.schedulerWorker.startedAt,
          workerLastSeenAt: snapshot.schedulerWorker.lastSeenAt,
          workerLastJobProcessedAt: snapshot.schedulerWorker.lastJobProcessedAt,
          workerLastJobName: snapshot.schedulerWorker.lastJobName,
          workerLastErrorAt: snapshot.schedulerWorker.lastWorkerErrorAt,
          workerLastErrorMessage:
            snapshot.schedulerWorker.lastWorkerErrorMessage,
          workerDetails: snapshot.schedulerWorker.details ?? null,
        },
      });
    }

    const oldestUnsyncedBet = snapshot.projection.unsyncedBetBacklog[0];
    if (
      oldestUnsyncedBet &&
      oldestUnsyncedBet.oldestUnsyncedAgeMs >= UNSYNCED_BET_BACKLOG_WINDOW_MS
    ) {
      await this.recordAlertOnce({
        entityType: "validation_chain_stream",
        entityId: snapshot.streamKey,
        action: UNSYNCED_BET_BACKLOG_ACTION,
        reason: "validation_chain.bet_projection.backlog",
        dedupeAfter: UNSYNCED_BET_BACKLOG_WINDOW_MS,
        metadata: {
          unsyncedBetBacklogCount: snapshot.metrics.unsyncedBetBacklogCount,
          oldestUnsyncedAgeMs: oldestUnsyncedBet.oldestUnsyncedAgeMs,
          oldestUnsyncedBetId: oldestUnsyncedBet.betId,
          marketId: oldestUnsyncedBet.marketId,
          propositionId: oldestUnsyncedBet.propositionId,
        },
      });
    }
  }

  private async recordAlertOnce(input: {
    entityType: string;
    entityId: string;
    action: string;
    reason: string;
    metadata: Record<string, unknown>;
    dedupeAfter: number;
  }): Promise<void> {
    const dedupeSince = new Date(Date.now() - input.dedupeAfter);
    const existing = await this.prisma.internalAuditEvent.findFirst({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        createdAt: {
          gte: dedupeSince,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existing) {
      return;
    }

    await this.audit.record({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      reason: input.reason,
      metadata: input.metadata as Prisma.InputJsonValue,
    });
  }

  private async getSchedulerWorkerSnapshot(
    nowIso: string,
  ): Promise<ValidationChainMonitoringViewModel["schedulerWorker"]> {
    let snapshot = evaluateSchedulerWorkerHealth(null, nowIso);

    try {
      const record = await this.redis.getSchedulerWorkerHeartbeat();
      snapshot = evaluateSchedulerWorkerHealth(record, nowIso);
    } catch (error) {
      snapshot = {
        ...snapshot,
        details:
          error instanceof Error
            ? `scheduler worker heartbeat read failed: ${error.message}`
            : "scheduler worker heartbeat read failed",
      };
    }

    return {
      ...snapshot,
      operatorActions:
        snapshot.status === "down"
          ? [
              "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml ps scheduler-worker",
              "docker logs --tail 200 <scheduler-worker-container>",
              "GET /system/queues/overview",
            ]
          : [],
    };
  }
}
