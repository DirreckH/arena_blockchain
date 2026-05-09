import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PinoLogger } from "nestjs-pino";

import type { ValidationChainCommandJobPayload } from "../../arena/validation-chain/validation-chain.types";
import { ValidationChainAlertService } from "../../arena/validation-chain/validation-chain-alert.service";
import { ValidationChainCommandRuntimeService } from "../../arena/validation-chain/validation-chain-command-runtime.service";
import { ValidationChainSyncWorker } from "../../arena/validation-chain/validation-chain-sync.worker";
import {
  VALIDATION_CHAIN_COMMAND_JOB,
  SCHEDULER_HEARTBEAT_JOB,
  SCHEDULER_QUEUE,
  VALIDATION_CHAIN_SYNC_JOB,
} from "../queue.constants";
import { buildJobLogContext } from "../job-log-context.util";

@Processor(SCHEDULER_QUEUE, {
  skipWaitingForReady: true,
})
export class SchedulerQueueProcessor extends WorkerHost {
  constructor(
    private readonly logger: PinoLogger,
    private readonly validationChainSyncWorker: ValidationChainSyncWorker,
    private readonly validationChainCommands: ValidationChainCommandRuntimeService,
    private readonly validationChainAlerts: ValidationChainAlertService,
  ) {
    super();
    this.logger.setContext(SchedulerQueueProcessor.name);
  }

  async process(job: Job): Promise<Record<string, string> | null> {
    if (job.name === SCHEDULER_HEARTBEAT_JOB) {
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

      return {
        processedAt: new Date().toISOString(),
        propositionId: String(job.data.propositionId ?? ""),
        command: String(job.data.command ?? ""),
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
