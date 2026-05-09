import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PinoLogger } from "nestjs-pino";

import { AUTH_QUEUE } from "../queue.constants";
import { buildJobLogContext } from "../job-log-context.util";

@Processor(AUTH_QUEUE, {
  skipWaitingForReady: true,
})
export class AuthQueueProcessor extends WorkerHost {
  constructor(private readonly logger: PinoLogger) {
    super();
    this.logger.setContext(AuthQueueProcessor.name);
  }

  async process(job: Job): Promise<Record<string, string>> {
    this.logger.debug(
      { jobId: job.id, payload: job.data },
      "Processed auth placeholder job",
    );

    return {
      processedAt: new Date().toISOString(),
    };
  }

  @OnWorkerEvent("error")
  onWorkerError(error: Error): void {
    this.logger.warn({ error: error.message }, "Auth queue worker connection error");
  }

  @OnWorkerEvent("completed")
  onCompleted(job: Job): void {
    this.logger.info(buildJobLogContext(AUTH_QUEUE, job), "Auth queue job completed");
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      buildJobLogContext(AUTH_QUEUE, job, {
        error: error.message,
      }),
      "Auth queue job failed",
    );
  }
}
