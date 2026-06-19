import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import { INTERNAL_AUDIT_ENTITY_TYPES } from "../internal-ops.types";
import { RewardLedgerRepository } from "../repositories/reward-ledger.repository";
import { RewardPayoutRepository } from "../repositories/reward-payout.repository";
import { InternalAuditService } from "./internal-audit.service";
import { RewardPayoutService } from "./reward-payout.service";
import {
  getRewardPayoutExecutionStaleKind,
  REWARD_PAYOUT_EXECUTION_STALE_AFTER_MS,
} from "../reward-payout-execution-staleness";

const AUTOMATION_ACTOR_USER_ID = "system_scheduler";

export interface RewardPayoutAutomationItemResult {
  payoutId: string;
  action:
    | "execution_started"
    | "execution_confirmed"
    | "stale_execution_failed";
  status: string;
}

export interface RewardPayoutAutomationResult {
  processedAt: string;
  processedCount: number;
  items: RewardPayoutAutomationItemResult[];
}

@Injectable()
export class RewardPayoutAutomationService {
  constructor(
    private readonly ledgers: RewardLedgerRepository,
    private readonly payouts: RewardPayoutRepository,
    private readonly payoutService: RewardPayoutService,
    private readonly audits: InternalAuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RewardPayoutAutomationService.name);
  }

  async runDuePayouts(input: {
    now?: string;
  } = {}): Promise<RewardPayoutAutomationResult> {
    const now = input.now ?? new Date().toISOString();
    const items: RewardPayoutAutomationItemResult[] = [];
    const startedThisRun = new Set<string>();

    const approved = await this.payouts.list({ status: "approved" });
    for (const payout of approved) {
      try {
        const executed = await this.payoutService.executePayout({
          payoutId: payout.id,
          startedAt: now,
        });
        await this.recordAutomationAudit({
          payoutId: executed.id,
          action: "reward_payout_execution_started",
          reason: "scheduler_auto_start_reward_payout_execution",
          note: "Scheduler worker automatically advanced an approved reward payout into execution",
          createdAt: now,
          metadata: {
            payoutStatus: executed.status,
            retryCount: executed.retryCount,
            executionTxHash: executed.executionTxHash,
            externalReference: executed.externalReference,
          },
        });
        items.push({
          payoutId: executed.id,
          action: "execution_started",
          status: executed.status,
        });
        startedThisRun.add(executed.id);
      } catch (error) {
        this.logger.error(
          {
            payoutId: payout.id,
            error: error instanceof Error ? error.message : "Unknown payout execution automation error",
          },
          "Failed to auto start approved reward payout execution",
        );
      }
    }

    const executing = await this.payouts.list({ status: "executing" });
    for (const payout of executing) {
      if (startedThisRun.has(payout.id)) {
        continue;
      }

      const staleKind = getRewardPayoutExecutionStaleKind(
        {
          status: payout.status,
          method: payout.method,
          executionStartedAt: payout.executionStartedAt,
          completedAt: payout.completedAt,
          executionTxHash: payout.executionTxHash,
        },
        now,
      );

      if (staleKind === "without_tx_hash") {
        try {
          const failed = await this.payoutService.failPayout({
            payoutId: payout.id,
            failedAt: now,
            errorCode: "reward_payout.execution_stale_without_tx_hash",
            errorMessage:
              "Reward payout execution remained stale without a recorded transaction hash and was returned to the retry queue",
          });
          await this.recordAutomationAudit({
            payoutId: failed.id,
            action: "reward_payout_failed",
            reason: "scheduler_auto_recover_stale_reward_payout_execution",
            note: "Scheduler worker automatically failed a stale executing reward payout that never recorded a transaction hash",
            createdAt: now,
            metadata: {
              payoutStatus: failed.status,
              retryCount: failed.retryCount,
              errorCode: failed.lastErrorCode,
              errorMessage: failed.lastErrorMessage,
            },
          });
          items.push({
            payoutId: failed.id,
            action: "stale_execution_failed",
            status: failed.status,
          });
        } catch (error) {
          this.logger.error(
            {
              payoutId: payout.id,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown stale payout recovery automation error",
            },
            "Failed to auto recover stale reward payout execution without tx hash",
          );
        }
        continue;
      }

      if (!payout.executionTxHash) {
        continue;
      }

      try {
        const completed = await this.payoutService.completePayout({
          payoutId: payout.id,
          completedAt: now,
        });
        await this.recordAutomationAudit({
          payoutId: completed.id,
          action: "reward_payout_completed",
          reason: "scheduler_auto_confirm_reward_payout_execution",
          note: "Scheduler worker automatically confirmed an executing reward payout from its recorded transaction hash",
          createdAt: now,
          metadata: {
            payoutStatus: completed.status,
            retryCount: completed.retryCount,
            executionTxHash: completed.executionTxHash,
            externalReference: completed.externalReference,
            confirmationMode: "recorded_execution_tx_hash",
          },
        });
        items.push({
          payoutId: completed.id,
          action: "execution_confirmed",
          status: completed.status,
        });
      } catch (error) {
        this.logger.debug(
          {
            payoutId: payout.id,
            staleKind,
            staleAfterMs: REWARD_PAYOUT_EXECUTION_STALE_AFTER_MS,
            error:
              error instanceof Error
                ? error.message
                : "Unknown payout confirmation automation note",
          },
          "Reward payout confirmation automation left payout in-place for later retry",
        );
      }
    }

    return {
      processedAt: now,
      processedCount: items.length,
      items,
    };
  }

  get automationActorUserId(): string {
    return AUTOMATION_ACTOR_USER_ID;
  }

  private async recordAutomationAudit(input: {
    payoutId: string;
    action: string;
    reason: string;
    note: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }) {
    const payout = await this.payouts.findById(input.payoutId);
    if (!payout) {
      return;
    }

    const ledger = await this.ledgers.findById(payout.ledgerId);
    if (!ledger) {
      return;
    }

    await this.audits.record({
      entityType: INTERNAL_AUDIT_ENTITY_TYPES.rewardLedger,
      entityId: ledger.id,
      action: input.action,
      actorUserId: AUTOMATION_ACTOR_USER_ID,
      reason: input.reason,
      note: input.note,
      metadata: {
        payoutId: payout.id,
        ...input.metadata,
      },
      createdAt: new Date(input.createdAt),
    });
  }
}
