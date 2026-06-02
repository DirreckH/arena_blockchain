import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";

import { resolveWorkspaceRoot } from "./common/utils/workspace-root.util";
import { ArenaModule } from "./arena/arena.module";
import { ValidationChainModule } from "./arena/validation-chain/validation-chain.module";
import { BlockchainModule } from "./blockchain/blockchain.module";
import { AppConfigModule } from "./config/config.module";
import { validateEnv } from "./config/env.schema";
import { DatabaseModule } from "./database/database.module";
import { AppLoggerModule } from "./logger/logger.module";
import { QueueModule } from "./queue/queue.module";

const workspaceRoot = resolveWorkspaceRoot();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        resolve(workspaceRoot, ".env"),
        resolve(process.cwd(), ".env"),
      ],
      validate: validateEnv,
    }),
    AppConfigModule,
    AppLoggerModule,
    DatabaseModule,
    BlockchainModule,
    ValidationChainModule,
    ArenaModule,
    QueueModule.registerWorker(),
  ],
})
export class WorkerModule {}
