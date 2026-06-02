import { Module } from "@nestjs/common";

import { ArenaIdService } from "../arena-id.service";
import { BetRepository } from "../repositories/bet.repository";
import { InternalAuditEventRepository } from "../repositories/internal-audit-event.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import { ValidationRehearsalCheckpointService } from "../services/validation-rehearsal-checkpoint.service";
import { ValidationChainCursorRepository } from "../repositories/validation-chain-cursor.repository";
import { ValidationChainEventRepository } from "../repositories/validation-chain-event.repository";
import { ValidationChainContractService } from "./validation-chain-contract.service";
import { ValidationChainIdService } from "./validation-chain-id.service";
import { ValidationChainAlertService } from "./validation-chain-alert.service";
import { ValidationChainBetReconciliationService } from "./validation-chain-bet-reconciliation.service";
import { ValidationChainCommandRuntimeService } from "./validation-chain-command-runtime.service";
import { ValidationChainCommandRecoveryService } from "./validation-chain-command-recovery.service";
import { ValidationChainManualSyncService } from "./validation-chain-manual-sync.service";
import { ValidationChainOperatorCommandService } from "./validation-chain-operator-command.service";
import { ValidationChainOracleService } from "./validation-chain-oracle.service";
import { ValidationChainPauserService } from "./validation-chain-pauser.service";
import { ValidationChainProjectionService } from "./validation-chain-projection.service";
import { ValidationChainProjectionReplayService } from "./validation-chain-projection-replay.service";
import { ValidationChainSyncWorker } from "./validation-chain-sync.worker";
import { QueueClientModule } from "../../queue/queue-client.module";

@Module({
  imports: [QueueClientModule],
  providers: [
    ArenaIdService,
    PropositionRepository,
    SystemKeyValueRepository,
    MarketRepository,
    BetRepository,
    InternalAuditEventRepository,
    InternalAuditService,
    ValidationChainIdService,
    ValidationChainAlertService,
    ValidationChainBetReconciliationService,
    ValidationChainCommandRuntimeService,
    ValidationChainCommandRecoveryService,
    ValidationChainManualSyncService,
    ValidationChainProjectionReplayService,
    ValidationRehearsalCheckpointService,
    ValidationChainContractService,
    ValidationChainEventRepository,
    ValidationChainCursorRepository,
    ValidationChainOperatorCommandService,
    ValidationChainOracleService,
    ValidationChainPauserService,
    ValidationChainProjectionService,
    ValidationChainSyncWorker,
  ],
  exports: [
    MarketRepository,
    ValidationChainIdService,
    ValidationChainAlertService,
    ValidationChainBetReconciliationService,
    ValidationChainCommandRuntimeService,
    ValidationChainCommandRecoveryService,
    ValidationChainManualSyncService,
    ValidationChainProjectionReplayService,
    ValidationRehearsalCheckpointService,
    ValidationChainContractService,
    ValidationChainEventRepository,
    ValidationChainCursorRepository,
    ValidationChainOperatorCommandService,
    ValidationChainOracleService,
    ValidationChainPauserService,
    ValidationChainProjectionService,
    ValidationChainSyncWorker,
  ],
})
export class ValidationChainModule {}
