import { InjectQueue } from "@nestjs/bullmq";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { JobsOptions, Queue } from "bullmq";
import { PinoLogger } from "nestjs-pino";

import type {
  EnqueuedJobSnapshot,
  QueueFailedJobRequeueResultSnapshot,
  QueueOverviewSnapshot,
} from "@arena/shared";
import type { ValidationChainCommandJobPayload } from "../arena/validation-chain/validation-chain.types";

import {
  AUTH_QUEUE,
  AUTH_PLACEHOLDER_JOB,
  DISPATCH_TASK_EXPIRY_AUTOMATION_JOB,
  PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
  REWARD_PAYOUT_AUTOMATION_JOB,
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

type SchedulerEnqueueSnapshot = EnqueuedJobSnapshot & {
  dedupeStatus: "enqueued" | "already_pending";
};

const VALIDATION_CHAIN_SYNC_JOB_ID = buildSchedulerJobId(
  "validation-chain",
  "sync",
);
const PROPOSITION_LIFECYCLE_AUTOMATION_JOB_ID = buildSchedulerJobId(
  "automation",
  "proposition-lifecycle",
);
const DISPATCH_TASK_EXPIRY_AUTOMATION_JOB_ID = buildSchedulerJobId(
  "automation",
  "dispatch-task-expiry",
);
const REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB_ID =
  buildSchedulerJobId("automation", "requester-comparison-set-delivery");
const REWARD_PAYOUT_AUTOMATION_JOB_ID = buildSchedulerJobId(
  "automation",
  "reward-payout",
);

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
  ): Promise<SchedulerEnqueueSnapshot> {
    const dedupeStatus = await this.prepareSchedulerJob(VALIDATION_CHAIN_SYNC_JOB_ID);
    const snapshot = await this.enqueueJob(
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

    return {
      ...snapshot,
      dedupeStatus,
    };
  }

  async enqueueValidationChainCommand(
    payload: ValidationChainCommandJobPayload,
    overrides: Partial<JobsOptions> = {},
  ): Promise<SchedulerEnqueueSnapshot> {
    const jobId = buildSchedulerJobId(
      "validation-chain",
      payload.command,
      payload.propositionId,
    );

    const dedupeStatus = await this.prepareSchedulerJob(jobId);
    const snapshot = await this.enqueueJob(
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

    return {
      ...snapshot,
      dedupeStatus,
    };
  }

  async enqueuePropositionLifecycleAutomation(
    payload: Record<string, unknown> = {},
  ): Promise<SchedulerEnqueueSnapshot> {
    const dedupeStatus = await this.prepareSchedulerJob(
      PROPOSITION_LIFECYCLE_AUTOMATION_JOB_ID,
    );

    const snapshot = await this.enqueueJob(
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

    return {
      ...snapshot,
      dedupeStatus,
    };
  }

  async enqueueDispatchTaskExpiryAutomation(
    payload: Record<string, unknown> = {},
  ): Promise<SchedulerEnqueueSnapshot> {
    const dedupeStatus = await this.prepareSchedulerJob(
      DISPATCH_TASK_EXPIRY_AUTOMATION_JOB_ID,
    );

    const snapshot = await this.enqueueJob(
      this.schedulerQueue,
      SCHEDULER_QUEUE,
      DISPATCH_TASK_EXPIRY_AUTOMATION_JOB,
      {
        requestedAt: new Date().toISOString(),
        ...payload,
      },
      SAFE_RETRY_JOB_POLICY,
      {
        jobId: DISPATCH_TASK_EXPIRY_AUTOMATION_JOB_ID,
      },
    );

    return {
      ...snapshot,
      dedupeStatus,
    };
  }

  async enqueueRequesterComparisonSetDeliveryAutomation(
    payload: Record<string, unknown> = {},
  ): Promise<SchedulerEnqueueSnapshot> {
    const dedupeStatus = await this.prepareSchedulerJob(
      REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB_ID,
    );

    const snapshot = await this.enqueueJob(
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

    return {
      ...snapshot,
      dedupeStatus,
    };
  }

  async enqueueRewardPayoutAutomation(
    payload: Record<string, unknown> = {},
  ): Promise<SchedulerEnqueueSnapshot> {
    const dedupeStatus = await this.prepareSchedulerJob(
      REWARD_PAYOUT_AUTOMATION_JOB_ID,
    );

    const snapshot = await this.enqueueJob(
      this.schedulerQueue,
      SCHEDULER_QUEUE,
      REWARD_PAYOUT_AUTOMATION_JOB,
      {
        requestedAt: new Date().toISOString(),
        ...payload,
      },
      SAFE_RETRY_JOB_POLICY,
      {
        jobId: REWARD_PAYOUT_AUTOMATION_JOB_ID,
      },
    );

    return {
      ...snapshot,
      dedupeStatus,
    };
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

  async requeueFailedJobs(
    queueName: string,
    limit = 25,
  ): Promise<QueueFailedJobRequeueResultSnapshot> {
    const queue = this.resolveQueueByName(queueName);
    if (!queue) {
      throw new NotFoundException(`Queue ${queueName} was not found`);
    }

    const policy = this.resolveQueuePolicy(queueName);
    if (!policy.retryable) {
      throw new ConflictException(`Queue ${queueName} does not support failed job requeue`);
    }

    const failedJobs = await queue.getFailed(0, Math.max(0, limit - 1));
    let retriedCount = 0;
    let skippedCount = 0;

    for (const job of failedJobs) {
      try {
        await job.retry("failed");
        retriedCount += 1;
      } catch (error) {
        skippedCount += 1;
        this.logger.warn(
          buildJobLogContext(queueName, job, {
            error: error instanceof Error ? error.message : "Unknown failed job retry error",
            retryable: policy.retryable,
          }),
          "Failed to requeue queue job",
        );
      }
    }

    return {
      queue: queueName,
      failedCount: failedJobs.length,
      retriedCount,
      skippedCount,
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

  private async prepareSchedulerJob(
    jobId: string,
  ): Promise<"enqueued" | "already_pending"> {
    const job = await this.schedulerQueue.getJob(jobId);
    if (!job) {
      return "enqueued";
    }

    const state = await job.getState();
    if (state !== "completed" && state !== "failed") {
      return "already_pending";
    }

    await job.remove();
    return "enqueued";
  }

  private resolveQueueByName(queueName: string): Queue | null {
    switch (queueName) {
      case SYSTEM_QUEUE:
        return this.systemQueue;
      case AUTH_QUEUE:
        return this.authQueue;
      case SCHEDULER_QUEUE:
        return this.schedulerQueue;
      default:
        return null;
    }
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
