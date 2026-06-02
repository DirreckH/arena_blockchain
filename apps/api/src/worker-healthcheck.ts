import Redis from "ioredis";

import {
  evaluateSchedulerWorkerHealth,
  parseSchedulerWorkerHeartbeatRecord,
  SCHEDULER_WORKER_HEARTBEAT_KEY,
} from "./queue/scheduler-worker-heartbeat";

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for scheduler worker health checks");
  }

  const redis = new Redis(redisUrl, {
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    await redis.ping();
    const rawValue = await redis.get(SCHEDULER_WORKER_HEARTBEAT_KEY);
    const snapshot = evaluateSchedulerWorkerHealth(
      parseSchedulerWorkerHeartbeatRecord(rawValue),
    );

    if (snapshot.status !== "up") {
      throw new Error(
        snapshot.details ?? "scheduler worker heartbeat is unavailable",
      );
    }
  } finally {
    if (redis.status !== "end") {
      await redis.quit().catch(() => undefined);
    }
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown worker healthcheck error";
    console.error(message);
    process.exitCode = 1;
  });
}
