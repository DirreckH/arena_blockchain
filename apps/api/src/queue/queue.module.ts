import { DynamicModule, Module } from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";
import { QueueClientModule } from "./queue-client.module";
import { QueueWorkerModule } from "./queue-worker.module";

@Module({})
export class QueueModule {
  static register(): DynamicModule {
    return {
      module: QueueModule,
      imports: [QueueClientModule],
      providers: [
        {
          provide: "ARENA_QUEUE_ROLE_SENTINEL",
          inject: [AppConfigService],
          useFactory: (config: AppConfigService) => config.processRole,
        },
      ],
      exports: [QueueClientModule],
    };
  }

  static registerWorker(): DynamicModule {
    return {
      module: QueueModule,
      imports: [QueueClientModule, QueueWorkerModule],
      exports: [QueueClientModule, QueueWorkerModule],
    };
  }
}
