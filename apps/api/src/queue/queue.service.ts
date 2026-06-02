import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { JobsOptions, Queue } from "bullmq";
import { PinoLogger } from "nestjs-pino";

import type { EnqueuedJobSnapshot, QueueOverviewSnapshot } from "@arena/shared";
import type { ValidationChainCommandJobPayload } from "../arena/validation-chain/validation-chain.types";

import {
  AUTH_QUEUE,
  AUTH_PLACEHOLDER_JOB,
  PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
  REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB,
  SCHEDULER_HEARTBEAT_JOB,
  SCHEDULER_QUEUE,
  SYSTEM_FAILURE_DEMO_JOB,
  SYSTEM_PING_JOB,
  SYSTEM_QUEUE,
  VALIDATION_CHAIN_COMMAND_JOB,
  VALIDATION_CHAIN_SYNC_JOB,
} from "./queue.constants";
import { buildJobLogContext } from "./job-log-context.util";
import {
  NO_RETRY_JOB_POLICY,
  type QueueJobPolicy,
  SAFE_RETRY_JOB_POLICY,
  toJobOptions,
} from "./queue-job-options";
import { RedisService } from "./redis.service";
import { evaluateSchedulerWorkerHealth } from "./scheduler-worker-heartbeat";

const VALIDATION_CHAIN_SYNC_JOB_ID = buildSchedulerJobId(
  "validation-chain",
  "sync",
);
const PROPOSITION_LIFECYCLE_AUTOMATION_JOB_ID = buildSchedulerJobId(
  "automation",
  "proposition-lifecycle",
);
const REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB_ID =
  buildSchedulerJobId("automation", "requester-comparison-set-delivery");

function buildSchedulerJobId(...parts: Array<string>): string {
  return parts
    .map((part) => part.replaceAll(":", "."))
    .join(".");
}

@Injectable()
export class AppQueueService {
  constructor(
    @InjectQueue(SYSTEM_QUEUE) private readonly systemQueue: Queue,
    @InjectQueue(AUTH_QUEUE) private readonly authQueue: Queue,
    @InjectQueue(SCHEDULER_QUEUE) private readonly schedulerQueue: Queue,
    private readonly redisService: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AppQueueService.name);
  }

  async enqueueSystemPing(
    payload: Record<string, unknown>,
  ): Promise<EnqueuedJobSnapshot> {
    return this.enqueueJob(
      this.systemQueue,
      SYSTEM_QUEUE,
      SYSTEM_PING_JOB,
      payload,
      SAFE_RETRY_JOB_POLICY,
    );
  }

  async enqueueSchedulerHeartbeat(): Promise<EnqueuedJobSnapshot> {
    return this.enqueueJob(
      this.schedulerQueue,
      SCHEDULER_QUEUE,
      SCHEDULER_HEARTBEAT_JOB,
      { triggeredAt: new Date().toISOString() },
      SAFE_RETRY_JOB_POLICY,
    );
  }

  async enqueueValidationChainSync(
    payload: Record<string, unknown> = {},
  ): Promise<EnqueuedJobSnapshot> {
    await this.releaseFinishedSchedulerJob(VALIDATION_CHAIN_SYNC_JOB_ID);

    return this.enqueueJob(
      this.schedulerQueue,
      SCHEDULER_QUEUE,
      VALIDATION_CHAIN_SYNC_JOB,
      {
        requestedAt: new Date().toISOString(),
        ...payload,
      },
      SAFE_RETRY_JOB_POLICY,
      {
        jobId: VALIDATION_CHAIN_SYNC_JOB_ID,
      },
    );
  }

  async enqueueValidationChainCommand(
    payload: ValidationChainCommandJobPayload,
    overrides: Partial<JobsOptions> = {},
  ): Promise<EnqueuedJobSnapshot> {
    const jobId = buildSchedulerJobId(
      "validation-chain",
      payload.command,
      payload.propositionId,
    );

    await this.releaseFinishedSchedulerJob(jobId);

    return this.enqueueJob(
      this.schedulerQueue,
      SCHEDULER_QUEUE,
      VALIDATION_CHAIN_COMMAND_JOB,
      payload as unknown as Record<string, unknown>,
      SAFE_RETRY_JOB_POLICY,
      {
        jobId,
        ...overrides,
      },
    );
  }

  async enqueuePropositionLifecycleAutomation(
    payload: Record<string, unknown> = {},
  ): Promise<EnqueuedJobSnapshot> {
    await this.releaseFinishedSchedulerJob(
      PROPOSITION_LIFECYCLE_AUTOMATION_JOB_ID,
    );

    return this.enqueueJob(
      this.schedulerQueue,
      SCHEDULER_QUEUE,
      PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
      {
        requestedAt: new Date().toISOString(),
        ...payload,
      },
      SAFE_RETRY_JOB_POLICY,
      {
        jobId: PROPOSITION_LIFECYCLE_AUTOMATION_JOB_ID,
      },
    );
  }

  async enqueueRequesterComparisonSetDeliveryAutomation(
    payload: Record<string, unknown> = {},
  ): Promise<EnqueuedJobSnapshot> {
    await this.releaseFinishedSchedulerJob(
      REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB_ID,
    );

    return this.enqueueJob(
      this.schedulerQueue,
      SCHEDULER_QUEUE,
      REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB,
      {
        requestedAt: new Date().toISOString(),
        ...payload,
      },
      SAFE_RETRY_JOB_POLICY,
      {
        jobId: REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB_ID,
      },
    );
  }

  async enqueueSystemFailureDemo(
    payload: Record<string, unknown>,
  ): Promise<EnqueuedJobSnapshot> {
    return this.enqueueJob(
      this.systemQueue,
      SYSTEM_QUEUE,
      SYSTEM_FAILURE_DEMO_JOB,
      payload,
      SAFE_RETRY_JOB_POLICY,
    );
  }

  enqueueAuthPlaceholder(payload: Record<string, unknown>) {
    return this.authQueue.add(
      AUTH_PLACEHOLDER_JOB,
      payload,
      toJobOptions(NO_RETRY_JOB_POLICY),
    );
  }

  async getQueueOverview(): Promise<QueueOverviewSnapshot> {
    try {
      await this.redisService.ping();
    } catch {
      // Redis state is still surfaced below through RedisService state tracking.
    }

    const redis = this.redisService.getStateSnapshot();

    const queues = await Promise.all([
      this.inspectQueue(SYSTEM_QUEUE, this.systemQueue, redis.status === "up"),
      this.inspectQueue(AUTH_QUEUE, this.authQueue, redis.status === "up"),
      this.inspectQueue(SCHEDULER_QUEUE, this.schedulerQueue, redis.status === "up"),
    ]);

    return {
      status:
        redis.status === "up" && queues.every((queue) => queue.status === "up")
          ? "ok"
          : "degraded",
      timestamp: new Date().toISOString(),
      redis,
      queues,
    };
  }

  private async enqueueJob(
    queue: Queue,
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    policy: typeof SAFE_RETRY_JOB_POLICY | typeof NO_RETRY_JOB_POLICY,
    overrides: Partial<JobsOptions> = {},
  ): Promise<EnqueuedJobSnapshot> {
    try {
      const job = await queue.add(jobName, payload, toJobOptions(policy, overrides));
      const snapshot = {
        queue: queueName,
        name: jobName,
        jobId: String(job.id),
      };

      this.logger.info(
        buildJobLogContext(queueName, job, {
          retryable: policy.retryable,
        }),
        "Enqueued queue job",
      );

      return snapshot;
    } catch (error) {
      this.logger.error(
        buildJobLogContext(queueName, undefined, {
          jobName,
          requestId: payload.requestId,
          traceId: payload.traceId,
          requestedBy: payload.requestedBy,
          retryable: policy.retryable,
          error: error instanceof Error ? error.message : "Unknown queue enqueue error",
        }),
        "Failed to enqueue queue job",
      );
      throw error;
    }
  }

  private async inspectQueue(
    queueName: string,
    queue: Queue,
    redisAvailable: boolean,
  ): Promise<QueueOverviewSnapshot["queues"][number]> {
    if (!redisAvailable) {
      return {
        name: queueName,
        status: "down",
        policy: this.toPolicySnapshot(this.resolveQueuePolicy(queueName)),
        details: this.redisService.getStateSnapshot().details,
      };
    }

    try {
      const [counts, paused] = await Promise.all([
        queue.getJobCounts("waiting", "active", "delayed", "completed", "failed"),
        queue.isPaused(),
      ]);
      const worker =
        queueName === SCHEDULER_QUEUE
          ? evaluateSchedulerWorkerHealth(
              await this.redisService.getSchedulerWorkerHeartbeat(),
            )
          : undefined;
      const details = paused
        ? "Scheduler queue is paused"
        : worker?.status === "down"
          ? worker.details
          : undefined;

      return {
        name: queueName,
        status:
          paused || worker?.status === "down" ? "down" : "up",
        policy: this.toPolicySnapshot(this.resolveQueuePolicy(queueName)),
        paused,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
        },
        worker,
        details,
      };
    } catch (error) {
      return {
        name: queueName,
        status: "down",
        policy: this.toPolicySnapshot(this.resolveQueuePolicy(queueName)),
        details:
          error instanceof Error ? error.message : "Unknown queue inspection error",
      };
    }
  }

  private async releaseFinishedSchedulerJob(
    jobId: string,
  ): Promise<void> {
    const job = await this.schedulerQueue.getJob(jobId);
    if (!job) {
      return;
    }

    const state = await job.getState();
    if (state !== "completed" && state !== "failed") {
      return;
    }

    await job.remove();
  }

  private resolveQueuePolicy(queueName: string): QueueJobPolicy {
    if (queueName === AUTH_QUEUE) {
      return NO_RETRY_JOB_POLICY;
    }

    return SAFE_RETRY_JOB_POLICY;
  }

  private toPolicySnapshot(
    policy: QueueJobPolicy,
  ): QueueOverviewSnapshot["queues"][number]["policy"] {
    return {
      retryable: policy.retryable,
      attempts: policy.attempts,
      backoffType: policy.backoff?.type,
      backoffDelayMs: policy.backoff?.delay,
    };
  }
}
