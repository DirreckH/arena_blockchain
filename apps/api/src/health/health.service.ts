import { Injectable } from "@nestjs/common";

import type { HealthSnapshot, ReadinessSnapshot } from "@arena/shared";

import { BlockchainService } from "../blockchain/blockchain.service";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../queue/redis.service";

@Injectable()
export class HealthService {
  private readonly dependencyTimeoutMs = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly blockchain: BlockchainService,
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
}
