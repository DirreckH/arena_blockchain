import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";

import { PropositionLifecycleAutomationService } from "../arena/services/proposition-lifecycle-automation.service";
import { ValidationChainAlertService } from "../arena/validation-chain/validation-chain-alert.service";
import { AppConfigService } from "../config/app-config.service";
import { AppQueueService } from "./queue.service";

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private validationChainTimer?: NodeJS.Timeout;

  constructor(
    private readonly config: AppConfigService,
    private readonly queueService: AppQueueService,
    private readonly propositionLifecycle: PropositionLifecycleAutomationService,
    private readonly validationChainAlerts: ValidationChainAlertService,
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
  async runPropositionLifecycleAutomation(): Promise<void> {
    try {
      const result =
        await this.propositionLifecycle.runDuePropositionTransitions();
      const processedCount =
        result.published.processedCount +
        result.revealPrepared.processedCount +
        result.settled.processedCount;
      if (processedCount > 0) {
        this.logger.info(
          result,
          "Ran proposition lifecycle automation",
        );
      }
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
