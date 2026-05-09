import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PinoLogger } from "nestjs-pino";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly readinessTimeoutMs = 2000;
  private connectionState: "unknown" | "up" | "down" = "unknown";
  private lastError?: string;

  constructor(private readonly logger: PinoLogger) {
    super();
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    await this.warmup();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async assertReady(): Promise<void> {
    await this.withTimeout(
      (async () => {
        await this.$connect();
        await this.$queryRawUnsafe('SELECT 1 FROM "system_key_value" LIMIT 1');
      })(),
      this.readinessTimeoutMs,
      "Database readiness check timed out",
    );

    this.markHealthy();
  }

  getStateSnapshot(): { status: "up" | "down"; details?: string } {
    return this.connectionState === "up"
      ? { status: "up" }
      : {
          status: "down",
          details: this.lastError ?? "Database connection has not been established",
        };
  }

  private async warmup(): Promise<void> {
    try {
      await this.assertReady();
      this.logger.info("Database baseline is ready");
    } catch (error) {
      const details =
        error instanceof Error ? error.message : "Unknown database readiness error";
      this.markUnhealthy(details);
      this.logger.warn({ error: details }, "Database baseline is unavailable during startup");
    }
  }

  private markHealthy(): void {
    this.connectionState = "up";
    this.lastError = undefined;
  }

  private markUnhealthy(details: string): void {
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
    } catch (error) {
      const details =
        error instanceof Error ? error.message : "Unknown database readiness error";
      this.markUnhealthy(details);
      throw error;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
