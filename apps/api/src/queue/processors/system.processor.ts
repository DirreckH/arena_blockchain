import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PinoLogger } from "nestjs-pino";

import { SYSTEM_FAILURE_DEMO_JOB, SYSTEM_PING_JOB, SYSTEM_QUEUE } from "../queue.constants";
import { buildJobLogContext } from "../job-log-context.util";

@Processor(SYSTEM_QUEUE, {
  skipWaitingForReady: true,
})
export class SystemQueueProcessor extends WorkerHost {
  constructor(private readonly logger: PinoLogger) {
    super();
    this.logger.setContext(SystemQueueProcessor.name);
  }

  async process(job: Job): Promise<Record<string, string> | null> {
    if (job.name === SYSTEM_PING_JOB) {
      this.logger.info(
        { jobId: job.id, payload: job.data },
        "Processed system ping job",
      );

      return {
        processedAt: new Date().toISOString(),
      };
    }

    if (job.name === SYSTEM_FAILURE_DEMO_JOB) {
      const failuresBeforeSuccess =
        typeof job.data?.failuresBeforeSuccess === "number"
          ? job.data.failuresBeforeSuccess
          : 0;
      const forcePermanentFailure = job.data?.forcePermanentFailure === true;
      const currentAttempt = job.attemptsMade + 1;

      this.logger.warn(
        buildJobLogContext(SYSTEM_QUEUE, job, {
          failuresBeforeSuccess,
          forcePermanentFailure,
        }),
        "Processing system failure demo job",
      );

      if (forcePermanentFailure || currentAttempt <= failuresBeforeSuccess) {
        throw new Error(
          `Demo failure triggered on attempt ${currentAttempt} for ${SYSTEM_FAILURE_DEMO_JOB}`,
        );
      }

      return {
        processedAt: new Date().toISOString(),
      };
    }

    this.logger.warn({ jobId: job.id, name: job.name }, "Unhandled system queue job");
    return null;
  }

  @OnWorkerEvent("error")
  onWorkerError(error: Error): void {
    this.logger.warn({ error: error.message }, "System queue worker connection error");
  }

  @OnWorkerEvent("completed")
  onCompleted(job: Job): void {
    this.logger.info(
      buildJobLogContext(SYSTEM_QUEUE, job),
      "System queue job completed",
    );
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      buildJobLogContext(SYSTEM_QUEUE, job, {
        error: error.message,
      }),
      "System queue job failed",
    );
  }
}
