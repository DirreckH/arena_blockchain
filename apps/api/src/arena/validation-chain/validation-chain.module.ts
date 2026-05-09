import { Module } from "@nestjs/common";

import { ArenaIdService } from "../arena-id.service";
import { BetRepository } from "../repositories/bet.repository";
import { InternalAuditEventRepository } from "../repositories/internal-audit-event.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { InternalAuditService } from "../services/internal-audit.service";
import { ValidationChainCursorRepository } from "../repositories/validation-chain-cursor.repository";
import { ValidationChainEventRepository } from "../repositories/validation-chain-event.repository";
import { ValidationChainContractService } from "./validation-chain-contract.service";
import { ValidationChainIdService } from "./validation-chain-id.service";
import { ValidationChainAlertService } from "./validation-chain-alert.service";
import { ValidationChainOperatorCommandService } from "./validation-chain-operator-command.service";
import { ValidationChainOracleService } from "./validation-chain-oracle.service";
import { ValidationChainPauserService } from "./validation-chain-pauser.service";
import { ValidationChainProjectionService } from "./validation-chain-projection.service";
import { ValidationChainSyncWorker } from "./validation-chain-sync.worker";

@Module({
  providers: [
    ArenaIdService,
    PropositionRepository,
    MarketRepository,
    BetRepository,
    InternalAuditEventRepository,
    InternalAuditService,
    ValidationChainIdService,
    ValidationChainAlertService,
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
