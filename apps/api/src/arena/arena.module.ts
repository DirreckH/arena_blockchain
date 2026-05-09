import { Module } from "@nestjs/common";

import { ArenaAdjudicationController } from "./adjudication.controller";
import { ArenaRespondentAccountController } from "./respondent-account.controller";
import { ArenaIdService } from "./arena-id.service";
import { ArenaPublicController } from "./public.controller";
import { ArenaPublicDiscoveryController } from "./public-discovery.controller";
import { ArenaInternalDispatchController } from "./internal-dispatch.controller";
import { ArenaInternalMonitoringController } from "./internal-monitoring.controller";
import { ArenaInternalPropositionsController } from "./internal-propositions.controller";
import { ArenaInternalReputationController } from "./internal-reputation.controller";
import { ArenaInternalRewardsController } from "./internal-rewards.controller";
import { ArenaInternalTagsController } from "./internal-tags.controller";
import { ArenaInternalValidationChainController } from "./internal-validation-chain.controller";
import { ArenaPropositionsController } from "./propositions.controller";
import { ArenaRespondentResultsController } from "./respondent-results.controller";
import { ArenaRespondentRewardsController } from "./respondent-rewards.controller";
import { ArenaRespondentReputationController } from "./respondent-reputation.controller";
import { ArenaRespondentTagsController } from "./respondent-tags.controller";
import { BetRepository } from "./repositories/bet.repository";
import { DispatchTaskRepository } from "./repositories/dispatch-task.repository";
import { EffectiveSampleCounterRepository } from "./repositories/effective-sample-counter.repository";
import { InternalAuditEventRepository } from "./repositories/internal-audit-event.repository";
import { MarketRepository } from "./repositories/market.repository";
import { PropositionRepository } from "./repositories/proposition.repository";
import { ResponseReviewRepository } from "./repositories/response-review.repository";
import { ResponseRepository } from "./repositories/response.repository";
import { RewardLedgerRepository } from "./repositories/reward-ledger.repository";
import { SystemKeyValueRepository } from "./repositories/system-key-value.repository";
import { UserReputationRepository } from "./repositories/user-reputation.repository";
import { UserTagRepository } from "./repositories/user-tag.repository";
import { BetService } from "./services/bet.service";
import { AccountExportService } from "./services/account-export.service";
import { AccountPreferencesService } from "./services/account-preferences.service";
import { AccountViewService } from "./services/account-view.service";
import { AdjudicationViewService } from "./services/adjudication-view.service";
import { ConsensusClosureService } from "./services/consensus-closure.service";
import { DispatchEngineService } from "./services/dispatch-engine.service";
import { DispatchTaskService } from "./services/dispatch-task.service";
import { EffectiveSampleCounterService } from "./services/effective-sample-counter.service";
import { FreezeRevealOrchestratorService } from "./services/freeze-reveal-orchestrator.service";
import { InternalAuditService } from "./services/internal-audit.service";
import { InternalMonitoringService } from "./services/internal-monitoring.service";
import { InternalPropositionOpsService } from "./services/internal-proposition-ops.service";
import { InternalRewardAuditService } from "./services/internal-reward-audit.service";
import { MarketService } from "./services/market.service";
import { PropositionEngineService } from "./services/proposition-engine.service";
import { PropositionDraftService } from "./services/proposition-draft.service";
import { PropositionLifecycleAutomationService } from "./services/proposition-lifecycle-automation.service";
import { PropositionStateService } from "./services/proposition-state.service";
import { PublicDiscoveryService } from "./services/public-discovery.service";
import { QualityEngineService } from "./services/quality-engine.service";
import { ResponseReviewService } from "./services/response-review.service";
import { ResponseService } from "./services/response.service";
import { RewardLedgerService } from "./services/reward-ledger.service";
import { ResultViewService } from "./services/result-view.service";
import { RewardViewService } from "./services/reward-view.service";
import { ReputationService } from "./services/reputation.service";
import { TagService } from "./services/tag.service";
import { ValidationSettlementService } from "./services/validation-settlement.service";
import { ValidationViewService } from "./services/validation-view.service";
import { WatchlistService } from "./services/watchlist.service";
import { ArenaValidationController } from "./validation.controller";
import { ValidationChainModule } from "./validation-chain/validation-chain.module";

const repositories = [
  PropositionRepository,
  DispatchTaskRepository,
  ResponseRepository,
  ResponseReviewRepository,
  EffectiveSampleCounterRepository,
  InternalAuditEventRepository,
  MarketRepository,
  BetRepository,
  RewardLedgerRepository,
  SystemKeyValueRepository,
  UserReputationRepository,
  UserTagRepository,
];

const services = [
  PropositionStateService,
  PropositionEngineService,
  ConsensusClosureService,
  DispatchEngineService,
  DispatchTaskService,
  QualityEngineService,
  ResponseService,
  ResponseReviewService,
  EffectiveSampleCounterService,
  FreezeRevealOrchestratorService,
  InternalAuditService,
  InternalMonitoringService,
  InternalPropositionOpsService,
  InternalRewardAuditService,
  MarketService,
  BetService,
  AdjudicationViewService,
  ValidationSettlementService,
  PropositionDraftService,
  PropositionLifecycleAutomationService,
  PublicDiscoveryService,
  RewardLedgerService,
  AccountExportService,
  AccountPreferencesService,
  AccountViewService,
  ResultViewService,
  RewardViewService,
  ReputationService,
  TagService,
  ValidationViewService,
  WatchlistService,
];

@Module({
  imports: [ValidationChainModule],
  controllers: [
    ArenaPublicController,
    ArenaPublicDiscoveryController,
    ArenaAdjudicationController,
    ArenaRespondentAccountController,
    ArenaRespondentResultsController,
    ArenaRespondentRewardsController,
    ArenaRespondentReputationController,
    ArenaRespondentTagsController,
    ArenaInternalDispatchController,
    ArenaInternalMonitoringController,
    ArenaInternalPropositionsController,
    ArenaInternalReputationController,
    ArenaInternalRewardsController,
    ArenaInternalTagsController,
    ArenaInternalValidationChainController,
    ArenaPropositionsController,
    ArenaValidationController,
  ],
  providers: [ArenaIdService, ...repositories, ...services],
  exports: [...services, ValidationChainModule],
})
export class ArenaModule {}
