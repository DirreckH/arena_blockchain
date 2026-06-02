import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { ArenaModule } from "../arena/arena.module";
import { ValidationChainModule } from "../arena/validation-chain/validation-chain.module";
import { QueueClientModule } from "./queue-client.module";
import { AuthQueueProcessor } from "./processors/auth.processor";
import { SchedulerQueueProcessor } from "./processors/scheduler.processor";
import { SchedulerWorkerHeartbeatService } from "./scheduler-worker-heartbeat.service";
import { SystemQueueProcessor } from "./processors/system.processor";
import { SchedulerService } from "./scheduler.service";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    QueueClientModule,
    ArenaModule,
    ValidationChainModule,
  ],
  providers: [
    SchedulerService,
    SchedulerWorkerHeartbeatService,
    SystemQueueProcessor,
    AuthQueueProcessor,
    SchedulerQueueProcessor,
  ],
})
export class QueueWorkerModule {}
