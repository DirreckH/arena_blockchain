import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SchedulerQueueProcessor } from "../../src/queue/processors/scheduler.processor";
import {
  PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
  REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB,
} from "../../src/queue/queue.constants";
import { AppQueueService } from "../../src/queue/queue.service";
import { SchedulerService } from "../../src/queue/scheduler.service";

class FakeLogger {
  setContext(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
}

class FakeBullQueue {
  readonly addCalls: Array<{
    name: string;
    data: Record<string, unknown>;
    opts: Record<string, unknown>;
  }> = [];
  readonly jobs = new Map<
    string,
    {
      id: string;
      name: string;
      data: Record<string, unknown>;
      opts: Record<string, unknown>;
      state: "waiting" | "active" | "completed" | "failed";
      removed: boolean;
    }
  >();

  async add(
    name: string,
    data: Record<string, unknown>,
    opts: Record<string, unknown> = {},
  ) {
    this.addCalls.push({ name, data, opts });

    const configuredJobId =
      typeof opts.jobId === "string" && opts.jobId.length > 0
        ? opts.jobId
        : `job_${this.addCalls.length}`;
    if (configuredJobId.includes(":")) {
      throw new Error("Custom Id cannot contain :");
    }
    const existing = this.jobs.get(configuredJobId);

    if (existing && !existing.removed) {
      return {
        id: existing.id,
        name: existing.name,
        data: existing.data,
        opts: existing.opts,
      };
    }

    const job = {
      id: configuredJobId,
      name,
      data,
      opts,
      state: "waiting" as const,
      removed: false,
    };
    this.jobs.set(configuredJobId, job);

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
    };
  }

  async getJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.removed) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      async getState() {
        return job.state;
      },
      async remove() {
        job.removed = true;
      },
    };
  }

  async getJobCounts() {
    return {
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
    };
  }

  async isPaused() {
    return false;
  }
}

class FakeRedisService {
  schedulerWorkerHeartbeat: Record<string, unknown> | null = null;

  async ping(): Promise<void> {}

  async getSchedulerWorkerHeartbeat() {
    return this.schedulerWorkerHeartbeat as never;
  }

  getStateSnapshot() {
    return {
      status: "up" as const,
      checkedAt: new Date().toISOString(),
      details: null,
    };
  }
}

class FakePropositionLifecycleAutomationService {
  readonly calls: Array<Record<string, unknown>> = [];

  async runDuePropositionTransitions(input: Record<string, unknown> = {}) {
    this.calls.push({ ...input });
    return {
      processedAt: new Date().toISOString(),
      published: {
        processedAt: new Date().toISOString(),
        processedCount: 0,
        propositionIds: [],
      },
      revealPrepared: {
        processedAt: new Date().toISOString(),
        processedCount: 0,
        propositionIds: [],
      },
      settled: {
        processedAt: new Date().toISOString(),
        processedCount: 0,
        propositionIds: [],
      },
    };
  }
}

class FakeRequesterComparisonSetDeliveryAutomationService {
  readonly calls: Array<Record<string, unknown>> = [];

  async runDuePolicies(input: { now: string }) {
    this.calls.push({ ...input });
    return {
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
      items: [],
    };
  }
}

class FakeValidationChainAlertService {
  async runHealthCheck(): Promise<void> {}
  async recordCommandRetryExhausted(): Promise<void> {}
}

class FakeValidationChainSyncWorker {
  async syncOnce() {
    return {
      streamKey: "validation-chain:events",
      safeToBlock: true,
      processedEvents: 0,
    };
  }
}

class FakeValidationChainCommandRuntimeService {
  async executeQueuedCommand(): Promise<void> {}
}

class FakeSchedulerWorkerHeartbeatService {
  readonly processedJobNames: string[] = [];
  readonly errors: string[] = [];

  async recordJobProcessed(jobName: string): Promise<void> {
    this.processedJobNames.push(jobName);
  }

  async recordWorkerError(errorMessage: string): Promise<void> {
    this.errors.push(errorMessage);
  }
}

function createQueueServiceHarness() {
  const systemQueue = new FakeBullQueue();
  const authQueue = new FakeBullQueue();
  const schedulerQueue = new FakeBullQueue();
  const redis = new FakeRedisService();
  const service = new AppQueueService(
    systemQueue as never,
    authQueue as never,
    schedulerQueue as never,
    redis as never,
    new FakeLogger() as never,
  );

  return { service, schedulerQueue, redis };
}

describe("Scheduler queue automations", () => {
  it("allows re-enqueue after a completed proposition lifecycle automation job is retained", async () => {
    const { service, schedulerQueue } = createQueueServiceHarness();

    await service.enqueuePropositionLifecycleAutomation();

    const jobId = String(schedulerQueue.addCalls[0]?.opts.jobId ?? "");
    assert.equal(jobId, "automation.proposition-lifecycle");

    const retainedJob = schedulerQueue.jobs.get(jobId);
    assert.equal(retainedJob?.removed, false);
    if (retainedJob) {
      retainedJob.state = "completed";
    }

    await service.enqueuePropositionLifecycleAutomation();

    assert.equal(schedulerQueue.addCalls.length, 2);
    assert.equal(retainedJob?.removed, true);
    assert.equal(String(schedulerQueue.addCalls[1]?.opts.jobId ?? ""), jobId);
  });

  it("keeps a waiting requester comparison set delivery automation job as the active dedupe target", async () => {
    const { service, schedulerQueue } = createQueueServiceHarness();

    await service.enqueueRequesterComparisonSetDeliveryAutomation({
      requestedAt: "2026-05-25T00:00:00.000Z",
    });

    const jobId = String(schedulerQueue.addCalls[0]?.opts.jobId ?? "");
    assert.equal(jobId, "automation.requester-comparison-set-delivery");

    const pendingJob = schedulerQueue.jobs.get(jobId);

    await service.enqueueRequesterComparisonSetDeliveryAutomation({
      requestedAt: "2026-05-25T00:01:00.000Z",
    });

    assert.equal(schedulerQueue.addCalls.length, 2);
    assert.equal(pendingJob?.removed, false);
    assert.equal(String(schedulerQueue.addCalls[1]?.opts.jobId ?? ""), jobId);
  });

  it("marks the scheduler queue down when the worker heartbeat is missing", async () => {
    const { service } = createQueueServiceHarness();

    const overview = await service.getQueueOverview();
    const schedulerQueue = overview.queues.find((queue) => queue.name === "scheduler");

    assert.equal(overview.status, "degraded");
    assert.equal(schedulerQueue?.status, "down");
    assert.equal(
      schedulerQueue?.details,
      "scheduler worker heartbeat is missing",
    );
  });

  it("marks the scheduler queue up when the worker heartbeat is fresh", async () => {
    const { service, redis } = createQueueServiceHarness();
    const nowIso = new Date().toISOString();
    redis.schedulerWorkerHeartbeat = {
      processRole: "worker",
      startedAt: nowIso,
      lastSeenAt: nowIso,
      lastJobProcessedAt: nowIso,
      lastJobName: PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
      lastWorkerErrorAt: null,
      lastWorkerErrorMessage: null,
    };

    const overview = await service.getQueueOverview();
    const schedulerQueue = overview.queues.find((queue) => queue.name === "scheduler");

    assert.equal(overview.status, "ok");
    assert.equal(schedulerQueue?.status, "up");
    assert.equal(
      schedulerQueue?.worker?.lastJobName,
      PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
    );
  });

  it("marks the scheduler queue down when the worker heartbeat carries a fresh worker error", async () => {
    const { service, redis } = createQueueServiceHarness();
    const nowIso = new Date().toISOString();
    redis.schedulerWorkerHeartbeat = {
      processRole: "worker",
      startedAt: nowIso,
      lastSeenAt: nowIso,
      lastJobProcessedAt: null,
      lastJobName: null,
      lastWorkerErrorAt: nowIso,
      lastWorkerErrorMessage: "scheduler queue worker is disconnected",
    };

    const overview = await service.getQueueOverview();
    const schedulerQueue = overview.queues.find((queue) => queue.name === "scheduler");

    assert.equal(overview.status, "degraded");
    assert.equal(schedulerQueue?.status, "down");
    assert.equal(
      schedulerQueue?.details,
      "scheduler queue worker is disconnected",
    );
  });

  it("enqueues proposition lifecycle automation from the scheduler cron entrypoint", async () => {
    const queueCalls: Array<Record<string, unknown>> = [];
    const queueService = {
      async enqueuePropositionLifecycleAutomation() {
        const snapshot = {
          queue: "scheduler",
          name: PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
          jobId: "automation.proposition-lifecycle",
        };
        queueCalls.push(snapshot);
        return snapshot;
      },
      async enqueueRequesterComparisonSetDeliveryAutomation() {
        throw new Error("not expected");
      },
      async enqueueSchedulerHeartbeat() {
        throw new Error("not expected");
      },
      async enqueueValidationChainSync() {
        throw new Error("not expected");
      },
    };
    const service = new SchedulerService(
      { validationSyncPollIntervalMs: 60_000 } as never,
      queueService as never,
      new FakeValidationChainAlertService() as never,
      new FakeLogger() as never,
    );

    await service.runPropositionLifecycleAutomation();

    assert.equal(queueCalls.length, 1);
  });

  it("enqueues requester comparison set delivery automation from the scheduler cron entrypoint", async () => {
    const queueCalls: Array<{
      queue: string;
      name: string;
      jobId: string;
      payload: Record<string, unknown>;
    }> = [];
    const queueService = {
      async enqueuePropositionLifecycleAutomation() {
        throw new Error("not expected");
      },
      async enqueueRequesterComparisonSetDeliveryAutomation(
        payload: Record<string, unknown>,
      ) {
        const snapshot = {
          queue: "scheduler",
          name: REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB,
          jobId: "automation.requester-comparison-set-delivery",
          payload,
        };
        queueCalls.push(snapshot);
        return snapshot;
      },
      async enqueueSchedulerHeartbeat() {
        throw new Error("not expected");
      },
      async enqueueValidationChainSync() {
        throw new Error("not expected");
      },
    };
    const service = new SchedulerService(
      { validationSyncPollIntervalMs: 60_000 } as never,
      queueService as never,
      new FakeValidationChainAlertService() as never,
      new FakeLogger() as never,
    );

    await service.runRequesterComparisonSetDeliveryAutomation();

    assert.equal(queueCalls.length, 1);
    assert.equal(typeof queueCalls[0]?.payload?.requestedAt, "string");
  });

  it("processes a queued proposition lifecycle automation job", async () => {
    const propositionLifecycle =
      new FakePropositionLifecycleAutomationService();
    const requesterDelivery =
      new FakeRequesterComparisonSetDeliveryAutomationService();
    const workerHeartbeat = new FakeSchedulerWorkerHeartbeatService();
    const processor = new SchedulerQueueProcessor(
      new FakeLogger() as never,
      new FakeValidationChainSyncWorker() as never,
      new FakeValidationChainCommandRuntimeService() as never,
      propositionLifecycle as never,
      requesterDelivery as never,
      new FakeValidationChainAlertService() as never,
      workerHeartbeat as never,
    );

    const result = await processor.process({
      id: "automation_1",
      name: PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
      data: {
        requestedAt: "2026-05-25T00:00:00.000Z",
      },
      opts: { attempts: 3 },
      attemptsMade: 1,
    } as never);

    assert.equal(propositionLifecycle.calls.length, 1);
    assert.deepEqual(workerHeartbeat.processedJobNames, [
      PROPOSITION_LIFECYCLE_AUTOMATION_JOB,
    ]);
    assert.equal(result?.processedAt !== undefined, true);
    assert.equal(result?.jobName, PROPOSITION_LIFECYCLE_AUTOMATION_JOB);
  });

  it("processes a queued requester comparison set delivery automation job", async () => {
    const propositionLifecycle =
      new FakePropositionLifecycleAutomationService();
    const requesterDelivery =
      new FakeRequesterComparisonSetDeliveryAutomationService();
    const workerHeartbeat = new FakeSchedulerWorkerHeartbeatService();
    const processor = new SchedulerQueueProcessor(
      new FakeLogger() as never,
      new FakeValidationChainSyncWorker() as never,
      new FakeValidationChainCommandRuntimeService() as never,
      propositionLifecycle as never,
      requesterDelivery as never,
      new FakeValidationChainAlertService() as never,
      workerHeartbeat as never,
    );

    const result = await processor.process({
      id: "automation_2",
      name: REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB,
      data: {
        requestedAt: "2026-05-25T00:00:00.000Z",
      },
      opts: { attempts: 3 },
      attemptsMade: 1,
    } as never);

    assert.equal(requesterDelivery.calls.length, 1);
    assert.equal(
      typeof requesterDelivery.calls[0]?.now,
      "string",
    );
    assert.deepEqual(workerHeartbeat.processedJobNames, [
      REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB,
    ]);
    assert.equal(result?.processedAt !== undefined, true);
    assert.equal(
      result?.jobName,
      REQUESTER_COMPARISON_SET_DELIVERY_AUTOMATION_JOB,
    );
  });
});
