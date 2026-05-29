import { Injectable } from "@nestjs/common";

import type { HealthSnapshot, ReadinessSnapshot } from "@arena/shared";

import { BlockchainService } from "../blockchain/blockchain.service";
import { PrismaService } from "../database/prisma.service";
import { AppQueueService } from "../queue/queue.service";
import { RedisService } from "../queue/redis.service";

@Injectable()
export class HealthService {
  private readonly dependencyTimeoutMs = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly blockchain: BlockchainService,
    private readonly queueService: AppQueueService,
  ) {}

  getLiveSnapshot(): HealthSnapshot {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  async getReadinessSnapshot(): Promise<ReadinessSnapshot> {
    const dependencies = await Promise.all([
      this.probeDatabase(),
      this.probeDependency("redis", async () => {
        await this.redis.ping();
      }),
      this.probeDependency("rpc", async () => {
        await this.blockchain.assertReady();
      }),
      this.probeSchedulerQueue(),
    ]);

    const status = dependencies.every((dependency) => dependency.status === "up")
      ? "ok"
      : "degraded";

    return {
      status,
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  private async probeDatabase(): Promise<ReadinessSnapshot["dependencies"][number]> {
    try {
      await this.prisma.assertReady();
      return { name: "database", status: "up" };
    } catch (error) {
      return {
        name: "database",
        status: "down",
        details:
          error instanceof Error ? error.message : "Unknown database readiness error",
      };
    }
  }

  private async probeDependency(
    name: ReadinessSnapshot["dependencies"][number]["name"],
    task: () => Promise<void>,
  ): Promise<ReadinessSnapshot["dependencies"][number]> {
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        task(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${name} check timed out`)),
            this.dependencyTimeoutMs,
          );
        }),
      ]);

      return { name, status: "up" };
    } catch (error) {
      return {
        name,
        status: "down",
        details:
          error instanceof Error ? error.message : `Unknown ${name} error`,
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async probeSchedulerQueue(): Promise<
    ReadinessSnapshot["dependencies"][number]
  > {
    try {
      const overview = await this.queueService.getQueueOverview();
      const schedulerQueue =
        overview.queues.find((queue) => queue.name === "scheduler") ?? null;

      if (!schedulerQueue) {
        return {
          name: "scheduler_queue",
          status: "down",
          details: "Scheduler queue overview is missing",
        };
      }

      if (schedulerQueue.status !== "up") {
        return {
          name: "scheduler_queue",
          status: "down",
          details:
            schedulerQueue.details ??
            "Scheduler queue is unavailable",
        };
      }

      if (schedulerQueue.paused) {
        return {
          name: "scheduler_queue",
          status: "down",
          details: "Scheduler queue is paused",
        };
      }

      return {
        name: "scheduler_queue",
        status: "up",
      };
    } catch (error) {
      return {
        name: "scheduler_queue",
        status: "down",
        details:
          error instanceof Error
            ? error.message
            : "Unknown scheduler queue readiness error",
      };
    }
  }
}
