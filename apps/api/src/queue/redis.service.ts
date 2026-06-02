import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { PinoLogger } from "nestjs-pino";

import { AppConfigService } from "../config/app-config.service";
import type { SchedulerWorkerHeartbeatRecord } from "./scheduler-worker-heartbeat";
import {
  parseSchedulerWorkerHeartbeatRecord,
  SCHEDULER_WORKER_HEARTBEAT_KEY,
  SCHEDULER_WORKER_HEARTBEAT_TTL_SECONDS,
} from "./scheduler-worker-heartbeat";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly readinessTimeoutMs = 1500;
  private connectionState: "unknown" | "up" | "down" = "unknown";
  private lastError?: string;

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.client = new Redis(this.config.redisUrl, {
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    this.logger.setContext(RedisService.name);

    this.client.on("error", (error) => {
      this.markUnhealthy(error.message);
    });
  }

  get connection(): Redis {
    return this.client;
  }

  async ping(): Promise<"PONG"> {
    try {
      if (this.client.status === "wait") {
        await this.withTimeout(
          this.client.connect(),
          this.readinessTimeoutMs,
          "Redis connection timed out",
        );
      }

      const result = await this.withTimeout(
        this.client.ping(),
        this.readinessTimeoutMs,
        "Redis ping timed out",
      );
      this.markHealthy();
      return result;
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown Redis error";
      this.markUnhealthy(details);
      throw error;
    }
  }

  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, "EX", ttlSeconds);
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setSchedulerWorkerHeartbeat(
    record: SchedulerWorkerHeartbeatRecord,
  ): Promise<void> {
    await this.setWithTtl(
      SCHEDULER_WORKER_HEARTBEAT_KEY,
      JSON.stringify(record),
      SCHEDULER_WORKER_HEARTBEAT_TTL_SECONDS,
    );
  }

  async getSchedulerWorkerHeartbeat(): Promise<SchedulerWorkerHeartbeatRecord | null> {
    const rawValue = await this.get(SCHEDULER_WORKER_HEARTBEAT_KEY);
    return parseSchedulerWorkerHeartbeatRecord(rawValue);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === "end") {
      return;
    }

    await this.client.quit();
  }

  getStateSnapshot(): { status: "up" | "down"; details?: string } {
    return this.connectionState === "up"
      ? { status: "up" }
      : {
          status: "down",
          details: this.lastError ?? "Redis connection has not been established",
        };
  }

  private markHealthy(): void {
    if (this.connectionState !== "up") {
      this.logger.info("Redis connection is ready");
    }

    this.connectionState = "up";
    this.lastError = undefined;
  }

  private markUnhealthy(details: string): void {
    if (this.connectionState !== "down" || this.lastError !== details) {
      this.logger.warn({ error: details }, "Redis connection is unavailable");
    }

    this.connectionState = "down";
    this.lastError = details;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
