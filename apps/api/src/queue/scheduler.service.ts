import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";

import { ValidationChainAlertService } from "../arena/validation-chain/validation-chain-alert.service";
import { RuntimeContractAlertService } from "../arena/services/runtime-contract-alert.service";
import { AppConfigService } from "../config/app-config.service";
import { AppQueueService } from "./queue.service";

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private validationChainTimer?: NodeJS.Timeout;

  constructor(
    private readonly config: AppConfigService,
    private readonly queueService: AppQueueService,
    private readonly validationChainAlerts: ValidationChainAlertService,
    private readonly runtimeContractAlerts: RuntimeContractAlertService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SchedulerService.name);
  }

  onModuleInit(): void {
    this.validationChainTimer = setInterval(() => {
      void this.enqueueValidationChainSync();
    }, this.config.validationSyncPollIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.validationChainTimer) {
      clearInterval(this.validationChainTimer);
      this.validationChainTimer = undefined;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async enqueueHeartbeat(): Promise<void> {
    try {
      const job = await this.queueService.enqueueSchedulerHeartbeat();
      this.logger.debug({ job }, "Enqueued scheduler heartbeat");
    } catch (error) {
      this.logger.error(
        {
          error:
            error instanceof Error ? error.message : "Unknown scheduler enqueue error",
        },
        "Failed to enqueue scheduler heartbeat",
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runValidationChainHealthCheck(): Promise<void> {
    try {
      await this.validationChainAlerts.runHealthCheck();
    } catch (error) {
      this.logger.error(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unknown validation-chain health-check error",
        },
        "Failed to run validation-chain health check",
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runRuntimeContractHealthCheck(): Promise<void> {
    try {
      await this.runtimeContractAlerts.runHealthCheck();
    } catch (error) {
      this.logger.error(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unknown runtime-contract health-check error",
        },
        "Failed to run runtime-contract health check",
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runPropositionLifecycleAutomation(): Promise<void> {
    try {
      const job = await this.queueService.enqueuePropositionLifecycleAutomation();
      this.logger.debug({ job }, "Enqueued proposition lifecycle automation job");
    } catch (error) {
      this.logger.error(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unknown proposition lifecycle automation error",
        },
        "Failed to run proposition lifecycle automation",
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runDispatchTaskExpiryAutomation(): Promise<void> {
    try {
      const job = await this.queueService.enqueueDispatchTaskExpiryAutomation({
        requestedAt: new Date().toISOString(),
      });
      this.logger.debug({ job }, "Enqueued dispatch task expiry automation job");
    } catch (error) {
      this.logger.error(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unknown dispatch task expiry automation error",
        },
        "Failed to run dispatch task expiry automation",
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runRequesterComparisonSetDeliveryAutomation(): Promise<void> {
    try {
      const job =
        await this.queueService.enqueueRequesterComparisonSetDeliveryAutomation({
          requestedAt: new Date().toISOString(),
        });
      this.logger.debug(
        { job },
        "Enqueued requester comparison set delivery automation job",
      );
    } catch (error) {
      this.logger.error(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unknown requester comparison set delivery automation error",
        },
        "Failed to run requester comparison set delivery automation",
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runRewardPayoutAutomation(): Promise<void> {
    try {
      const job = await this.queueService.enqueueRewardPayoutAutomation({
        requestedAt: new Date().toISOString(),
      });
      this.logger.debug({ job }, "Enqueued reward payout automation job");
    } catch (error) {
      this.logger.error(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unknown reward payout automation error",
        },
        "Failed to run reward payout automation",
      );
    }
  }

  private async enqueueValidationChainSync(): Promise<void> {
    try {
      const job = await this.queueService.enqueueValidationChainSync();
      this.logger.debug({ job }, "Enqueued validation-chain sync job");
    } catch (error) {
      this.logger.error(
        {
          error:
            error instanceof Error ? error.message : "Unknown validation-chain sync enqueue error",
        },
        "Failed to enqueue validation-chain sync job",
      );
    }
  }
}
