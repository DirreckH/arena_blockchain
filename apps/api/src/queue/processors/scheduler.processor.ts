import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PinoLogger } from "nestjs-pino";

import type { ValidationChainCommandJobPayload } from "../../arena/validation-chain/validation-chain.types";
import { DispatchTaskExpiryAutomationService } from "../../arena/services/dispatch-task-expiry-automation.service";
import { PropositionLifecycleAutomationService } from "../../arena/services/proposition-lifecycle-automation.service";
import { RewardPayoutAutomationService } from "../../arena/services/reward-payout-automation.service";
import { RequesterComparisonSetDeliveryAutomationService } from "../../arena/services/requester-comparison-set-delivery-automation.service";
import { ValidationChainAlertService } from "../../arena/validation-chain/validation-chain-alert.service";
import { ValidationChainCommandRuntimeService } from "../../arena/validation-chain/validation-chain-command-runtime.service";
import { ValidationChainSyncWorker } from "../../arena/validation-chain/validation-chain-sync.worker";
import {
  DISPATCH_TASK_EXPIRY_AUTOMATION_JOB,
  PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
  REWARD_PAYOUT_AUTOMATION_JOB,
  REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB,
  SCHEDULER_HEARTBEAT_JOB,
  SCHEDULER_QUEUE,
  VALIDATION_CHAIN_COMMAND_JOB,
  VALIDATION_CHAIN_SYNC_JOB,
} from "../queue.constants";
import { buildJobLogContext } from "../job-log-context.util";
import { SchedulerWorkerHeartbeatService } from "../scheduler-worker-heartbeat.service";

@Processor(SCHEDULER_QUEUE, {
  skipWaitingForReady: true,
})
export class SchedulerQueueProcessor extends WorkerHost {
  constructor(
    private readonly logger: PinoLogger,
    private readonly validationChainSyncWorker: ValidationChainSyncWorker,
    private readonly validationChainCommands: ValidationChainCommandRuntimeService,
    private readonly propositionLifecycle: PropositionLifecycleAutomationService,
    private readonly requesterComparisonSetDeliveryAutomation: RequesterComparisonSetDeliveryAutomationService,
    private readonly dispatchTaskExpiryAutomation: DispatchTaskExpiryAutomationService,
    private readonly rewardPayoutAutomation: RewardPayoutAutomationService,
    private readonly validationChainAlerts: ValidationChainAlertService,
    private readonly workerHeartbeat: SchedulerWorkerHeartbeatService,
  ) {
    super();
    this.logger.setContext(SchedulerQueueProcessor.name);
  }

  async process(job: Job): Promise<Record<string, string> | null> {
    if (job.name === SCHEDULER_HEARTBEAT_JOB) {
      await this.workerHeartbeat.recordJobProcessed(job.name);
      this.logger.info(
        { jobId: job.id, payload: job.data },
        "Processed scheduler heartbeat job",
      );

      return {
        processedAt: new Date().toISOString(),
      };
    }

    if (job.name === VALIDATION_CHAIN_SYNC_JOB) {
      const snapshot = await this.validationChainSyncWorker.syncOnce();
      await this.workerHeartbeat.recordJobProcessed(job.name);

      return {
        processedAt: new Date().toISOString(),
        streamKey: snapshot.streamKey,
        safeToBlock: String(snapshot.safeToBlock),
        processedEvents: String(snapshot.processedEvents),
      };
    }

    if (job.name === VALIDATION_CHAIN_COMMAND_JOB) {
      await this.validationChainCommands.executeQueuedCommand(
        job.data as ValidationChainCommandJobPayload,
      );
      await this.workerHeartbeat.recordJobProcessed(job.name);

      return {
        processedAt: new Date().toISOString(),
        propositionId: String(job.data.propositionId ?? ""),
        command: String(job.data.command ?? ""),
      };
    }

    if (job.name === PROPOSITION_LIFECYCLE_AUTOMATION_JOB) {
      const result = await this.propositionLifecycle.runDuePropositionTransitions();
      const processedCount =
        result.published.processedCount +
        result.revealPrepared.processedCount +
        result.settled.processedCount;
      await this.workerHeartbeat.recordJobProcessed(job.name);

      return {
        processedAt: new Date().toISOString(),
        jobName: PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
        processedCount: String(processedCount),
      };
    }

    if (job.name === REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB) {
      const requestedAt =
        typeof job.data.requestedAt === "string" && job.data.requestedAt.length > 0
          ? job.data.requestedAt
          : new Date().toISOString();
      const result =
        await this.requesterComparisonSetDeliveryAutomation.runDuePolicies({
          now: requestedAt,
        });
      await this.workerHeartbeat.recordJobProcessed(job.name);

      return {
        processedAt: new Date().toISOString(),
        jobName: REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB,
        processedCount: String(result.processedCount),
      };
    }

    if (job.name === DISPATCH_TASK_EXPIRY_AUTOMATION_JOB) {
      const requestedAt =
        typeof job.data.requestedAt === "string" && job.data.requestedAt.length > 0
          ? job.data.requestedAt
          : new Date().toISOString();
      const result = await this.dispatchTaskExpiryAutomation.expireDueTasks({
        now: requestedAt,
      });
      await this.workerHeartbeat.recordJobProcessed(job.name);

      return {
        processedAt: new Date().toISOString(),
        jobName: DISPATCH_TASK_EXPIRY_AUTOMATION_JOB,
        processedCount: String(result.processedCount),
      };
    }

    if (job.name === REWARD_PAYOUT_AUTOMATION_JOB) {
      const requestedAt =
        typeof job.data.requestedAt === "string" && job.data.requestedAt.length > 0
          ? job.data.requestedAt
          : new Date().toISOString();
      const result = await this.rewardPayoutAutomation.runDuePayouts({
        now: requestedAt,
      });
      await this.workerHeartbeat.recordJobProcessed(job.name);

      return {
        processedAt: new Date().toISOString(),
        jobName: REWARD_PAYOUT_AUTOMATION_JOB,
        processedCount: String(result.processedCount),
      };
    }

    this.logger.warn(
      { jobId: job.id, name: job.name },
      "Unhandled scheduler queue job",
    );
    return null;
  }

  @OnWorkerEvent("error")
  onWorkerError(error: Error): void {
    void this.workerHeartbeat.recordWorkerError(error.message);
    this.logger.warn({ error: error.message }, "Scheduler queue worker connection error");
  }

  @OnWorkerEvent("completed")
  onCompleted(job: Job): void {
    this.logger.info(
      buildJobLogContext(SCHEDULER_QUEUE, job),
      "Scheduler queue job completed",
    );
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error): void {
    if (job?.name === VALIDATION_CHAIN_COMMAND_JOB) {
      const payload = job.data as ValidationChainCommandJobPayload;
      const maxAttempts = Number(job.opts.attempts ?? 1);
      if (job.attemptsMade >= maxAttempts) {
        void this.validationChainAlerts.recordCommandRetryExhausted({
          propositionId: payload.propositionId,
          command: payload.command,
          actorUserId: payload.actorUserId,
          attemptsMade: job.attemptsMade,
          maxAttempts,
          error: error.message,
        });
      }
    }

    this.logger.error(
      buildJobLogContext(SCHEDULER_QUEUE, job, {
        error: error.message,
      }),
      "Scheduler queue job failed",
    );
  }
}
