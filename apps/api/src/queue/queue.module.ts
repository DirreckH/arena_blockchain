import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { ArenaModule } from "../arena/arena.module";
import { ValidationChainCommandRuntimeService } from "../arena/validation-chain/validation-chain-command-runtime.service";
import { ValidationChainModule } from "../arena/validation-chain/validation-chain.module";
import { AppConfigService } from "../config/app-config.service";
import { AUTH_QUEUE, SCHEDULER_QUEUE, SYSTEM_QUEUE } from "./queue.constants";
import { AuthQueueProcessor } from "./processors/auth.processor";
import { SchedulerQueueProcessor } from "./processors/scheduler.processor";
import { SystemQueueProcessor } from "./processors/system.processor";
import {
  NO_RETRY_JOB_POLICY,
  SAFE_RETRY_JOB_POLICY,
  toJobOptions,
} from "./queue-job-options";
import { AppQueueService } from "./queue.service";
import { RedisService } from "./redis.service";
import { SchedulerService } from "./scheduler.service";

function toBullConnection(redisUrl: string) {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.replace("/", "") || "0") : 0,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 1000,
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
  };
}

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ArenaModule,
    ValidationChainModule,
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: toBullConnection(config.redisUrl),
        skipWaitingForReady: true,
      }),
    }),
    BullModule.registerQueue(
      {
        name: SYSTEM_QUEUE,
        skipWaitingForReady: true,
        defaultJobOptions: toJobOptions(SAFE_RETRY_JOB_POLICY),
      },
      {
        name: AUTH_QUEUE,
        skipWaitingForReady: true,
        defaultJobOptions: toJobOptions(NO_RETRY_JOB_POLICY),
      },
      {
        name: SCHEDULER_QUEUE,
        skipWaitingForReady: true,
        defaultJobOptions: toJobOptions(SAFE_RETRY_JOB_POLICY),
      },
    ),
  ],
  providers: [
    RedisService,
    AppQueueService,
    ValidationChainCommandRuntimeService,
    SchedulerService,
    SystemQueueProcessor,
    AuthQueueProcessor,
    SchedulerQueueProcessor,
  ],
  exports: [
    RedisService,
    AppQueueService,
    ValidationChainCommandRuntimeService,
    BullModule,
  ],
})
export class QueueModule {}
