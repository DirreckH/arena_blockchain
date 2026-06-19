import { Injectable, Optional } from "@nestjs/common";

import type { Prisma, PropositionStatus, ValidationChainMarketStatus } from "@prisma/client";

import { AppConfigService } from "../../config/app-config.service";
import { PrismaService } from "../../database/prisma.service";
import type {
  OperatorCurrentSummaryViewModel,
  OperatorSummaryEvidenceViewModel,
  ValidationChainContractStateViewModel,
  ValidationChainHealthAlertViewModel,
  ValidationChainMonitoringViewModel,
} from "../internal-ops.types";
import type { ArenaDbClient } from "../prisma.types";
import { ValidationChainCursorRepository } from "../repositories/validation-chain-cursor.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import { OpsAlertNotifierService } from "../services/ops-alert-notifier.service";
import { withArenaTransaction } from "../arena-transaction.utils";
import {
  VALIDATION_CHAIN_STREAM_KEY,
  type ValidationContractMarketState,
} from "./validation-chain.types";
import { RedisService } from "../../queue/redis.service";
import {
  evaluateSchedulerWorkerHealth,
} from "../../queue/scheduler-worker-heartbeat";
import {
  buildValidationLifecycleSnapshot,
  type ValidationLifecycleDriftReason,
} from "../validation-lifecycle";
import { ValidationChainContractService } from "./validation-chain-contract.service";
import {
  buildValidationLifecycleOperatorGuidance,
  toValidationChainContractStateView,
  VALIDATION_RUNBOOK_PATH,
} from "./validation-lifecycle-guidance";

const RECENT_ALERT_WINDOW_MS = 15 * 60 * 1000;
const STALE_PAYOUT_WINDOW_MS = 24 * 60 * 60 * 1000;
const UNSYNCED_BET_BACKLOG_WINDOW_MS = 15 * 60 * 1000;

const CURSOR_STALLED_ACTION = "validation_chain.alert.cursor_stalled";
const COMMAND_TERMINAL_ACTION = "validation_chain.alert.command_terminal";
const COMMAND_RETRY_EXHAUSTED_ACTION =
  "validation_chain.alert.command_retry_exhausted";
const PROJECTOR_ENTITY_MISSING_ACTION =
  "validation_chain.alert.projector_entity_missing";
const LIFECYCLE_DRIFT_ACTION = "validation_chain.alert.lifecycle_drift";
const SYNC_WORKER_UNHEALTHY_ACTION =
  "validation_chain.alert.sync_worker_unhealthy";
const STALE_PAYOUT_ACTION = "validation_chain.alert.stale_payouts";
const UNSYNCED_BET_BACKLOG_ACTION =
  "validation_chain.alert.unsynced_bet_backlog";

const RECENT_ALERT_ACTIONS = [
  CURSOR_STALLED_ACTION,
  COMMAND_TERMINAL_ACTION,
  COMMAND_RETRY_EXHAUSTED_ACTION,
  PROJECTOR_ENTITY_MISSING_ACTION,
  LIFECYCLE_DRIFT_ACTION,
  SYNC_WORKER_UNHEALTHY_ACTION,
  STALE_PAYOUT_ACTION,
  UNSYNCED_BET_BACKLOG_ACTION,
  "validation_chain.pause.submitted",
  "validation_chain.unpause.submitted",
] as const;

const LIFECYCLE_ALERTABLE_STATUSES = [
  "live",
  "frozen",
  "revealing",
  "settled",
] as const satisfies PropositionStatus[];

type LifecycleDriftAlertInput = {
  entityType: string;
  entityId: string;
  reason: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class ValidationChainAlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly cursors: ValidationChainCursorRepository,
    private readonly redis: RedisService,
    private readonly audit: InternalAuditService,
    @Optional()
    private readonly validationContract?: ValidationChainContractService,
    @Optional()
    private readonly notifier?: OpsAlertNotifierService,
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

  async recordCommandAlreadyPending(input: {
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
      action: "validation_chain.command.already_pending",
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
      const cursor = await this.cursors.getCursor(VALIDATION_CHAIN_STREAM_KEY, tx);
      const currentStreamFailureSince =
        cursor?.syncStatus === "idle" ? cursor.updatedAt : null;

      const [
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
        tx.internalAuditEvent.findMany({
          where: this.buildRecentAlertWhere(
            recentSince,
            currentStreamFailureSince,
          ),
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
            chainMarketId: true,
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
            { processedAt: "desc" },
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
          where: this.buildCurrentStreamFailureWhere(currentStreamFailureSince),
        }),
        tx.internalAuditEvent.findMany({
          where: this.buildCurrentFailureWhere(currentStreamFailureSince),
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        }),
      ]);
      const actionableStalePayoutMarkets =
        await this.filterActionableStalePayoutMarkets(stalePayoutMarkets);

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

      const snapshot = {
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
          stalePayoutMarketCount: actionableStalePayoutMarkets.length,
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
            operatorActions: this.buildUnsyncedBetOperatorActions({
              marketId: bet.marketId,
              userId: bet.userId,
            }),
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
        stalePayoutMarkets: actionableStalePayoutMarkets.map((market) => ({
          marketId: market.id,
          propositionId: market.propositionId,
          chainStatus: market.chainStatus as ValidationChainMarketStatus,
          terminalAt: (
            market.chainResolvedAt ?? market.chainCancelledAt ?? new Date(0)
          ).toISOString(),
          unclaimedBetCount: market.bets.length,
          operatorActions: this.buildStalePayoutOperatorActions(market.id),
        })),
      } satisfies Omit<ValidationChainMonitoringViewModel, "operatorSummary">;

      return {
        ...snapshot,
        operatorSummary: this.buildOperatorSummary(snapshot),
      };
    });
  }

  private async filterActionableStalePayoutMarkets<
    T extends {
      chainMarketId: string | null;
    },
  >(markets: T[]): Promise<T[]> {
    if (!this.validationContract || markets.length === 0) {
      return markets;
    }

    const decisions = await Promise.all(
      markets.map(async (market) => ({
        market,
        actionable: await this.isActionableStalePayoutMarket(
          market.chainMarketId,
        ),
      })),
    );

    return decisions
      .filter((entry) => entry.actionable)
      .map((entry) => entry.market);
  }

  private async isActionableStalePayoutMarket(
    chainMarketId: string | null,
  ): Promise<boolean> {
    if (!this.validationContract || !chainMarketId) {
      return true;
    }

    try {
      const market = await this.validationContract.getMarketOrNull(chainMarketId);
      return market !== null;
    } catch {
      // Preserve visibility when the current chain cannot be inspected.
      return true;
    }
  }

  private buildRecentAlertWhere(
    recentSince: Date,
    currentStreamFailureSince: Date | null,
  ): Prisma.InternalAuditEventWhereInput {
    return {
      OR: [
        {
          action: {
            in: [...RECENT_ALERT_ACTIONS],
          },
          createdAt: {
            gte: recentSince,
          },
        },
        this.buildCurrentStreamFailureWhere(
          currentStreamFailureSince && currentStreamFailureSince > recentSince
            ? currentStreamFailureSince
            : recentSince,
        ),
      ],
    };
  }

  private buildCurrentStreamFailureWhere(
    currentStreamFailureSince: Date | null,
  ): Prisma.InternalAuditEventWhereInput {
    return {
      action: "validation_chain.sync.failed",
      ...(currentStreamFailureSince
        ? {
            createdAt: {
              gte: currentStreamFailureSince,
            },
          }
        : {}),
    };
  }

  private buildCurrentFailureWhere(
    currentStreamFailureSince: Date | null,
  ): Prisma.InternalAuditEventWhereInput {
    return {
      OR: [
        {
          action: {
            in: [
              "validation_chain.project.failed",
              PROJECTOR_ENTITY_MISSING_ACTION,
              COMMAND_TERMINAL_ACTION,
              COMMAND_RETRY_EXHAUSTED_ACTION,
            ],
          },
        },
        this.buildCurrentStreamFailureWhere(currentStreamFailureSince),
      ],
    };
  }

  async runHealthCheck(nowIso = new Date().toISOString()): Promise<void> {
    const notifications: Array<{
      action: string;
      reason: string;
      entityType: string;
      entityId: string;
      createdAt: string;
      metadata: Record<string, unknown>;
    }> = [];

    await withArenaTransaction(this.prisma, undefined, async (tx) => {
      const [snapshot, lifecycleDrifts] = await Promise.all([
        this.getHealthSnapshot(nowIso, tx),
        this.listLifecycleDriftAlerts(tx),
      ]);

      if (snapshot.isCursorStalled) {
        const alert = await this.recordAlertOnce({
          entityType: "validation_chain_stream",
          entityId: snapshot.streamKey,
          action: CURSOR_STALLED_ACTION,
          reason: "validation_chain.cursor.stalled",
          nowIso,
          dedupeAfter: snapshot.cursorStaleThresholdMs,
          metadata: {
            lastProcessedBlock: snapshot.lastProcessedBlock,
            lastFinalizedBlock: snapshot.lastFinalizedBlock,
            cursorUpdatedAt: snapshot.cursorUpdatedAt,
            pollIntervalMs: snapshot.pollIntervalMs,
            cursorStaleThresholdMs: snapshot.cursorStaleThresholdMs,
          },
        });
        if (alert) {
          notifications.push(alert);
        }
      }

      if (snapshot.metrics.recentSyncFailureCount >= 3) {
        const alert = await this.recordAlertOnce({
          entityType: "validation_chain_stream",
          entityId: snapshot.streamKey,
          action: SYNC_WORKER_UNHEALTHY_ACTION,
          reason: "validation_chain.sync.unhealthy",
          nowIso,
          dedupeAfter: RECENT_ALERT_WINDOW_MS,
          metadata: {
            recentSyncFailureCount: snapshot.metrics.recentSyncFailureCount,
            windowMs: RECENT_ALERT_WINDOW_MS,
          },
        });
        if (alert) {
          notifications.push(alert);
        }
      }

      if (snapshot.schedulerWorker?.status === "down") {
        const alert = await this.recordAlertOnce({
          entityType: "validation_chain_stream",
          entityId: snapshot.streamKey,
          action: SYNC_WORKER_UNHEALTHY_ACTION,
          reason: "validation_chain.sync.worker_heartbeat_down",
          nowIso,
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
            operatorActions: snapshot.schedulerWorker.operatorActions,
          },
        });
        if (alert) {
          notifications.push(alert);
        }
      }

      for (const lifecycleDrift of lifecycleDrifts) {
        const alert = await this.recordLifecycleDriftAlert(lifecycleDrift);
        if (alert) {
          notifications.push(alert);
        }
      }

      const oldestStalePayoutMarket = snapshot.stalePayoutMarkets[0];
      if (oldestStalePayoutMarket) {
        const alert = await this.recordAlertOnce({
          entityType: "validation_chain_stream",
          entityId: snapshot.streamKey,
          action: STALE_PAYOUT_ACTION,
          reason: "validation_chain.payout.stale",
          nowIso,
          dedupeAfter: STALE_PAYOUT_WINDOW_MS,
          metadata: {
            stalePayoutMarketCount: snapshot.metrics.stalePayoutMarketCount,
            oldestTerminalAt: oldestStalePayoutMarket.terminalAt,
            marketId: oldestStalePayoutMarket.marketId,
            propositionId: oldestStalePayoutMarket.propositionId,
            unclaimedBetCount: oldestStalePayoutMarket.unclaimedBetCount,
            operatorActions: oldestStalePayoutMarket.operatorActions,
          },
        });
        if (alert) {
          notifications.push(alert);
        }
      }

      const oldestUnsyncedBet = snapshot.projection.unsyncedBetBacklog[0];
      if (
        oldestUnsyncedBet &&
        oldestUnsyncedBet.oldestUnsyncedAgeMs >= UNSYNCED_BET_BACKLOG_WINDOW_MS
      ) {
        const alert = await this.recordAlertOnce({
          entityType: "validation_chain_stream",
          entityId: snapshot.streamKey,
          action: UNSYNCED_BET_BACKLOG_ACTION,
          reason: "validation_chain.bet_projection.backlog",
          nowIso,
          dedupeAfter: UNSYNCED_BET_BACKLOG_WINDOW_MS,
          metadata: {
            unsyncedBetBacklogCount: snapshot.metrics.unsyncedBetBacklogCount,
            oldestUnsyncedAgeMs: oldestUnsyncedBet.oldestUnsyncedAgeMs,
            oldestUnsyncedBetId: oldestUnsyncedBet.betId,
            marketId: oldestUnsyncedBet.marketId,
            propositionId: oldestUnsyncedBet.propositionId,
            operatorActions: oldestUnsyncedBet.operatorActions,
          },
        });
        if (alert) {
          notifications.push(alert);
        }
      }
    });

    for (const notification of notifications) {
      await this.notifyAlert(notification);
    }
  }

  private async listLifecycleDriftAlerts(
    db: ArenaDbClient,
  ): Promise<LifecycleDriftAlertInput[]> {
    const propositions = await db.proposition.findMany({
      where: {
        marketEnabled: true,
        status: {
          in: [...LIFECYCLE_ALERTABLE_STATUSES],
        },
      },
      select: {
        id: true,
        status: true,
        marketEnabled: true,
        resultComputedAt: true,
        resultKind: true,
      },
    });

    if (propositions.length === 0) {
      return [];
    }

    const markets = await db.market.findMany({
      where: {
        propositionId: {
          in: propositions.map((proposition) => proposition.id),
        },
      },
      select: {
        id: true,
        propositionId: true,
        status: true,
        chainMarketId: true,
        chainStatus: true,
      },
    });
    const marketByPropositionId = new Map(
      markets.map((market) => [market.propositionId, market]),
    );

    const items = await Promise.all(
      propositions.map(async (proposition) => {
        const market = marketByPropositionId.get(proposition.id) ?? null;
        const driftReason = buildValidationLifecycleSnapshot(
          proposition,
          market as never,
        ).driftReason;

        if (!driftReason) {
          return null;
        }

        const onChainState = await this.readOnChainState(
          market?.chainMarketId ?? null,
        );
        const operatorGuidance = buildValidationLifecycleOperatorGuidance({
          propositionId: proposition.id,
          marketId: market?.id ?? null,
          propositionStatus: proposition.status,
          marketStatus: market?.status ?? null,
          localChainStatus:
            (market?.chainStatus as ValidationChainMarketStatus | null) ?? null,
          onChainState,
          driftReason,
          hasOfficialResult:
            proposition.resultComputedAt !== null &&
            proposition.resultKind !== null,
        });

        return {
          entityType: market ? "validation_market" : "validation_proposition",
          entityId: market?.id ?? proposition.id,
          reason: `validation_chain.lifecycle_drift.${driftReason}.${operatorGuidance.kind}`,
          metadata: {
            propositionId: proposition.id,
            marketId: market?.id ?? null,
            propositionStatus: proposition.status,
            marketStatus: market?.status ?? null,
            localChainStatus: market?.chainStatus ?? null,
            chainMarketId: market?.chainMarketId ?? null,
            onChainState,
            driftReason,
            operatorGuidance,
          },
        };
      }),
    );

    const driftAlerts = items.filter(
      (item): item is NonNullable<(typeof items)[number]> => item !== null,
    );

    return driftAlerts;
  }

  private async readOnChainState(
    chainMarketId: string | null,
  ): Promise<ValidationChainContractStateViewModel | null> {
    if (!this.validationContract || !chainMarketId) {
      return null;
    }

    try {
      const market = await this.validationContract.getMarketOrNull(chainMarketId);
      return toValidationChainContractStateView(
        (market?.state as ValidationContractMarketState | null) ?? null,
      );
    } catch {
      return null;
    }
  }

  private async recordLifecycleDriftAlert(input: {
    entityType: string;
    entityId: string;
    reason: string;
    metadata: Record<string, unknown>;
  }): Promise<{
    action: string;
    reason: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  } | null> {
    const latest = await this.prisma.internalAuditEvent.findFirst({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: LIFECYCLE_DRIFT_ACTION,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (
      latest &&
      this.buildLifecycleDriftSignature(
        "metadataJson" in latest ? latest.metadataJson : null,
      ) === this.buildLifecycleDriftSignature(input.metadata)
    ) {
      return this.toAlertNotification({
        action: latest.action,
        reason: latest.reason,
        entityType: latest.entityType,
        entityId: latest.entityId,
        createdAt: latest.createdAt,
        metadata: latest.metadataJson,
      });
    }

    const recorded = await this.audit.record({
      entityType: input.entityType,
      entityId: input.entityId,
      action: LIFECYCLE_DRIFT_ACTION,
      reason: input.reason,
      metadata: input.metadata as Prisma.InputJsonValue,
    });
    return this.toAlertNotification(recorded);
  }

  private buildLifecycleDriftSignature(metadata: unknown): string {
    const payload =
      metadata !== null && typeof metadata === "object"
        ? (metadata as {
            propositionId?: string | null;
            marketId?: string | null;
            propositionStatus?: string | null;
            marketStatus?: string | null;
            localChainStatus?: string | null;
            chainMarketId?: string | null;
            onChainState?: string | null;
            driftReason?: string | null;
            operatorGuidance?: {
              kind?: string | null;
              summary?: string | null;
              recoveryReason?: string | null;
              plannedCommands?: string[];
              operatorActions?: string[];
            } | null;
          })
        : {};

    return JSON.stringify({
      propositionId: payload.propositionId ?? null,
      marketId: payload.marketId ?? null,
      propositionStatus: payload.propositionStatus ?? null,
      marketStatus: payload.marketStatus ?? null,
      localChainStatus: payload.localChainStatus ?? null,
      chainMarketId: payload.chainMarketId ?? null,
      onChainState: payload.onChainState ?? null,
      driftReason: payload.driftReason ?? null,
      operatorGuidance: {
        kind: payload.operatorGuidance?.kind ?? null,
        summary: payload.operatorGuidance?.summary ?? null,
        recoveryReason: payload.operatorGuidance?.recoveryReason ?? null,
        plannedCommands: [...(payload.operatorGuidance?.plannedCommands ?? [])].sort(
          (left, right) => left.localeCompare(right),
        ),
        operatorActions: [...(payload.operatorGuidance?.operatorActions ?? [])].sort(
          (left, right) => left.localeCompare(right),
        ),
      },
    });
  }

  private async recordAlertOnce(input: {
    entityType: string;
    entityId: string;
    action: string;
    reason: string;
    metadata: Record<string, unknown>;
    nowIso: string;
    dedupeAfter: number;
  }): Promise<{
    action: string;
    reason: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  } | null> {
    const dedupeSince = new Date(
      new Date(input.nowIso).getTime() - input.dedupeAfter,
    );
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
      return this.toAlertNotification({
        action: existing.action,
        reason: existing.reason,
        entityType: existing.entityType,
        entityId: existing.entityId,
        createdAt: existing.createdAt,
        metadata: existing.metadataJson,
      });
    }

    const recorded = await this.audit.record({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      reason: input.reason,
      metadata: input.metadata as Prisma.InputJsonValue,
    });
    return this.toAlertNotification(recorded);
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

  private buildOperatorSummary(
    snapshot: Omit<ValidationChainMonitoringViewModel, "operatorSummary">,
  ): ValidationChainMonitoringViewModel["operatorSummary"] {
    const latestRelevantEvidence = this.getLatestRelevantEvidence(snapshot);
    const oldestUnsyncedBet = snapshot.projection.unsyncedBetBacklog[0] ?? null;
    const backlogNeedsAction =
      oldestUnsyncedBet !== null &&
      oldestUnsyncedBet.oldestUnsyncedAgeMs >= UNSYNCED_BET_BACKLOG_WINDOW_MS;
    const oldestStalePayoutMarket = snapshot.stalePayoutMarkets[0] ?? null;

    if (snapshot.syncStatus === "missing") {
      return {
        status: "action_required",
        requiresActionNow: true,
        focusArea: "cursor_missing",
        summary:
          "Validation-chain cursor is missing. Rebuild sync state before trusting projection freshness.",
        operatorActions: this.buildCursorRecoveryOperatorActions(),
        blockers: ["cursor_missing"],
        latestRelevantEvidence,
      };
    }

    if (snapshot.syncStatus === "error") {
      return {
        status: "action_required",
        requiresActionNow: true,
        focusArea: "sync_error",
        summary:
          "Validation-chain sync is in an error state. Restore sync before trusting chain-derived market state.",
        operatorActions: this.buildCursorRecoveryOperatorActions(),
        blockers: ["sync_error"],
        latestRelevantEvidence,
      };
    }

    if (snapshot.schedulerWorker?.status === "down") {
      return {
        status: "action_required",
        requiresActionNow: true,
        focusArea: "scheduler_worker",
        summary:
          "Scheduler worker heartbeat is down. Restore worker processing before trusting sync or queued recovery flows.",
        operatorActions: [...snapshot.schedulerWorker.operatorActions],
        blockers: ["scheduler_worker"],
        latestRelevantEvidence,
      };
    }

    if (snapshot.isCursorStalled) {
      return {
        status: "action_required",
        requiresActionNow: true,
        focusArea: "cursor_stalled",
        summary:
          "Validation-chain cursor is stalled. Run sync and inspect worker/runtime health before trusting fresh chain state.",
        operatorActions: this.buildCursorRecoveryOperatorActions(),
        blockers: ["cursor_stalled"],
        latestRelevantEvidence,
      };
    }

    if (oldestStalePayoutMarket) {
      return {
        status: "action_required",
        requiresActionNow: true,
        focusArea: "stale_payouts",
        summary:
          "Stale payout recovery is required for at least one terminal market before settlement completeness can be trusted.",
        operatorActions: [...oldestStalePayoutMarket.operatorActions],
        blockers: ["stale_payouts"],
        latestRelevantEvidence,
      };
    }

    if (backlogNeedsAction) {
      return {
        status: "action_required",
        requiresActionNow: true,
        focusArea: "unsynced_bet_backlog",
        summary:
          "Unsynced local validation bets are backlogged. Run sync and reconciliation before trusting bet projections.",
        operatorActions: [...oldestUnsyncedBet.operatorActions],
        blockers: ["unsynced_bet_backlog"],
        latestRelevantEvidence,
      };
    }

    return {
      status: "ready",
      requiresActionNow: false,
      focusArea: "healthy",
      summary:
        latestRelevantEvidence === null
          ? "Validation-chain health is green. No operator recovery is required right now."
          : "No active validation-chain blocker. Recent validation evidence remains available in monitoring history.",
      operatorActions: [],
      blockers: [],
      latestRelevantEvidence,
    };
  }

  private getLatestRelevantEvidence(
    snapshot: Omit<ValidationChainMonitoringViewModel, "operatorSummary">,
  ): OperatorCurrentSummaryViewModel["latestRelevantEvidence"] {
    const alertEvidence = snapshot.recentAlerts.map((alert) =>
      this.toOperatorSummaryEvidence(alert),
    );
    const failureEvidence = snapshot.failures.recentFailures.map((failure) =>
      this.toOperatorSummaryEvidence(failure),
    );

    return [...alertEvidence, ...failureEvidence]
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      )
      .at(0) ?? null;
  }

  private toOperatorSummaryEvidence(input: {
    action: string;
    entityType: string;
    entityId: string;
    reason: string;
    createdAt: string;
  }): OperatorSummaryEvidenceViewModel {
    return {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      createdAt: input.createdAt,
    };
  }

  private buildCursorRecoveryOperatorActions(): string[] {
    return [
      "POST /arena/internal/validation-chain/sync",
      "GET /system/queues/overview",
      "GET /arena/internal/monitoring/validation-chain/runtime-readiness",
      VALIDATION_RUNBOOK_PATH,
    ];
  }

  private buildUnsyncedBetOperatorActions(input: {
    marketId: string;
    userId: string;
  }): string[] {
    return [
      "POST /arena/internal/validation-chain/sync",
      "POST /arena/internal/validation-chain/backlog/reconcile",
      `POST /arena/internal/validation-chain/markets/${input.marketId}/bets/${input.userId}/reconcile`,
      "GET /arena/internal/monitoring/validation-chain",
    ];
  }

  private buildStalePayoutOperatorActions(marketId: string): string[] {
    return [
      "POST /arena/internal/validation-chain/sync",
      `POST /arena/internal/validation-chain/markets/${marketId}/replay-projection`,
      "GET /arena/internal/monitoring/validation-chain",
    ];
  }

  private toAlertNotification(input: {
    action: string;
    reason: string;
    entityType: string;
    entityId: string;
    createdAt: string | Date;
    metadata?: unknown;
  }): {
    action: string;
    reason: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  } {
    return {
      action: input.action,
      reason: input.reason,
      entityType: input.entityType,
      entityId: input.entityId,
      createdAt:
        input.createdAt instanceof Date
          ? input.createdAt.toISOString()
          : input.createdAt,
      metadata:
        input.metadata && typeof input.metadata === "object"
          ? (input.metadata as Record<string, unknown>)
          : {},
    };
  }

  private async notifyAlert(input: {
    action: string;
    reason: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    if (!this.notifier) {
      return;
    }

    await this.notifier.notifyAlert({
      source: "validation_chain",
      ...input,
    });
  }
}
