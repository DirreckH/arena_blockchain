import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { resolve } from "node:path";

import { AuthModule } from "./auth/auth.module";
import { ArenaModule } from "./arena/arena.module";
import { BlockchainModule } from "./blockchain/blockchain.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { ArenaRateLimitGuard } from "./common/guards/arena-rate-limit.guard";
import { ArenaSurfaceBoundaryGuard } from "./common/guards/arena-surface-boundary.guard";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { resolveWorkspaceRoot } from "./common/utils/workspace-root.util";
import { AppConfigModule } from "./config/config.module";
import { validateEnv } from "./config/env.schema";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { AppLoggerModule } from "./logger/logger.module";
import { QueueModule } from "./queue/queue.module";
import { SystemModule } from "./system/system.module";

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
    QueueModule.register(),
    AuthModule,
    HealthModule,
    BlockchainModule,
    ArenaModule,
    SystemModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ArenaSurfaceBoundaryGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ArenaRateLimitGuard,
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}
