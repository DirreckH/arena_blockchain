import { Module } from "@nestjs/common";

import { BlockchainModule } from "../blockchain/blockchain.module";
import { QueueClientModule } from "../queue/queue-client.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  imports: [BlockchainModule, QueueClientModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
