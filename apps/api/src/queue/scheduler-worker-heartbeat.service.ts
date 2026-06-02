import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import { AppConfigService } from "../config/app-config.service";
import { RedisService } from "./redis.service";
import {
  SCHEDULER_WORKER_KEEPALIVE_INTERVAL_MS,
  createSchedulerWorkerHeartbeatRecord,
  recordSchedulerWorkerError,
  recordSchedulerWorkerJobProcessed,
  touchSchedulerWorkerHeartbeat,
  type SchedulerWorkerHeartbeatRecord,
} from "./scheduler-worker-heartbeat";

@Injectable()
export class SchedulerWorkerHeartbeatService
  implements OnModuleInit, OnModuleDestroy
{
  private keepaliveTimer?: NodeJS.Timeout;

  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SchedulerWorkerHeartbeatService.name);
  }

  async onModuleInit(): Promise<void> {
    await this.persist((_current, nowIso) =>
      createSchedulerWorkerHeartbeatRecord({
        nowIso,
        processRole: this.toWorkerProcessRole(),
      }),
    );

    this.keepaliveTimer = setInterval(() => {
      void this.persist((current, nowIso) =>
        touchSchedulerWorkerHeartbeat(current, {
          nowIso,
          processRole: this.toWorkerProcessRole(),
        }),
      );
    }, SCHEDULER_WORKER_KEEPALIVE_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = undefined;
    }
  }

  async recordJobProcessed(
    jobName: string,
    nowIso = new Date().toISOString(),
  ): Promise<void> {
    await this.persist(
      (current) =>
        recordSchedulerWorkerJobProcessed(current, {
          nowIso,
          processRole: this.toWorkerProcessRole(),
          jobName,
        }),
      nowIso,
    );
  }

  async recordWorkerError(
    errorMessage: string,
    nowIso = new Date().toISOString(),
  ): Promise<void> {
    await this.persist(
      (current) =>
        recordSchedulerWorkerError(current, {
          nowIso,
          processRole: this.toWorkerProcessRole(),
          errorMessage,
        }),
      nowIso,
    );
  }

  private async persist(
    update: (
      current: SchedulerWorkerHeartbeatRecord | null,
      nowIso: string,
    ) => SchedulerWorkerHeartbeatRecord,
    nowIso = new Date().toISOString(),
  ): Promise<void> {
    try {
      const current = await this.redis.getSchedulerWorkerHeartbeat();
      const next = update(current, nowIso);
      await this.redis.setSchedulerWorkerHeartbeat(next);
    } catch (error) {
      this.logger.warn(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unknown scheduler worker heartbeat persistence error",
        },
        "Failed to persist scheduler worker heartbeat",
      );
    }
  }

  private toWorkerProcessRole(): "worker" | "all" {
    return this.config.processRole === "all" ? "all" : "worker";
  }
}
