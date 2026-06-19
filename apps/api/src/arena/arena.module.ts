import { Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { ArenaAdjudicationController } from "./adjudication.controller";
import { ArenaDiscussionController } from "./discussion.controller";
import { ArenaRespondentAccountController } from "./respondent-account.controller";
import { ArenaIdService } from "./arena-id.service";
import { ArenaPublicController } from "./public.controller";
import { ArenaPublicDiscoveryController } from "./public-discovery.controller";
import { ArenaPublicRespondentLeaderboardController } from "./public-respondent-leaderboard.controller";
import { ArenaInternalAuditController } from "./internal-audit.controller";
import { ArenaInternalDiscoveryConfigController } from "./internal-discovery-config.controller";
import { ArenaInternalDispatchController } from "./internal-dispatch.controller";
import { ArenaInternalMonitoringController } from "./internal-monitoring.controller";
import { ArenaInternalPropositionsController } from "./internal-propositions.controller";
import { ArenaInternalReputationController } from "./internal-reputation.controller";
import { ArenaInternalResponsesController } from "./internal-responses.controller";
import { ArenaInternalRewardsController } from "./internal-rewards.controller";
import { ArenaInternalTagsController } from "./internal-tags.controller";
import { ArenaInternalValidationChainController } from "./internal-validation-chain.controller";
import { ArenaPropositionsController } from "./propositions.controller";
import { ArenaRespondentResultsController } from "./respondent-results.controller";
import { ArenaRespondentRewardsController } from "./respondent-rewards.controller";
import { ArenaRespondentReputationController } from "./respondent-reputation.controller";
import { ArenaRespondentTagsController } from "./respondent-tags.controller";
import { BetRepository } from "./repositories/bet.repository";
import { ArenaUserRepository } from "./repositories/arena-user.repository";
import { ArenaUserSessionRepository } from "./repositories/arena-user-session.repository";
import { ArenaUserWalletRepository } from "./repositories/arena-user-wallet.repository";
import { DispatchTaskRepository } from "./repositories/dispatch-task.repository";
import { EffectiveSampleCounterRepository } from "./repositories/effective-sample-counter.repository";
import { InternalAuditEventRepository } from "./repositories/internal-audit-event.repository";
import { MarketRepository } from "./repositories/market.repository";
import { PropositionRepository } from "./repositories/proposition.repository";
import { ResponseReviewRepository } from "./repositories/response-review.repository";
import { ResponseRepository } from "./repositories/response.repository";
import { RewardLedgerRepository } from "./repositories/reward-ledger.repository";
import { RewardPayoutRepository } from "./repositories/reward-payout.repository";
import { SystemKeyValueRepository } from "./repositories/system-key-value.repository";
import { UserReputationRepository } from "./repositories/user-reputation.repository";
import { UserTagRepository } from "./repositories/user-tag.repository";
import { BetService } from "./services/bet.service";
import { AccountExportService } from "./services/account-export.service";
import { AccountPreferencesService } from "./services/account-preferences.service";
import { AccountViewService } from "./services/account-view.service";
import { AdjudicationViewService } from "./services/adjudication-view.service";
import { ConsensusClosureService } from "./services/consensus-closure.service";
import { DiscoveryConfigService } from "./services/discovery-config.service";
import { DispatchEngineService } from "./services/dispatch-engine.service";
import { DiscussionService } from "./services/discussion.service";
import { DispatchTaskService } from "./services/dispatch-task.service";
import { DispatchTaskExpiryAutomationService } from "./services/dispatch-task-expiry-automation.service";
import { EffectiveSampleCounterService } from "./services/effective-sample-counter.service";
import { FreezeRevealOrchestratorService } from "./services/freeze-reveal-orchestrator.service";
import { InternalAuditService } from "./services/internal-audit.service";
import { InternalMonitoringService } from "./services/internal-monitoring.service";
import { InternalPropositionOpsService } from "./services/internal-proposition-ops.service";
import { InternalResponseReviewOpsService } from "./services/internal-response-review-ops.service";
import { InternalRewardAuditService } from "./services/internal-reward-audit.service";
import { MarketService } from "./services/market.service";
import { OpsAlertNotifierService } from "./services/ops-alert-notifier.service";
import { PropositionEngineService } from "./services/proposition-engine.service";
import { PropositionDraftService } from "./services/proposition-draft.service";
import { PropositionLifecycleAutomationService } from "./services/proposition-lifecycle-automation.service";
import { PropositionStateService } from "./services/proposition-state.service";
import { PublicDiscoveryService } from "./services/public-discovery.service";
import { PublicIntegrityViewService } from "./services/public-integrity-view.service";
import { PublicRespondentLeaderboardService } from "./services/public-respondent-leaderboard.service";
import { PublicResultViewService } from "./services/public-result-view.service";
import { QualityEngineService } from "./services/quality-engine.service";
import { RequesterComparisonSetService } from "./services/requester-comparison-set.service";
import { RequesterComparisonSetDeliveryAutomationService } from "./services/requester-comparison-set-delivery-automation.service";
import { RequesterComparisonSetDeliveryPolicyService } from "./services/requester-comparison-set-delivery-policy.service";
import { RequesterComparisonSetDeliveryRunService } from "./services/requester-comparison-set-delivery-run.service";
import { RequesterComparisonSetDeliveryTransportService } from "./services/requester-comparison-set-delivery-transport.service";
import { RequesterPropositionViewService } from "./services/requester-proposition-view.service";
import { RequesterReportPresetService } from "./services/requester-report-preset.service";
import { ResponseReviewService } from "./services/response-review.service";
import { ResponseService } from "./services/response.service";
import { RewardLedgerService } from "./services/reward-ledger.service";
import { RewardPayoutExecutionService } from "./services/reward-payout-execution.service";
import { RewardPayoutAutomationService } from "./services/reward-payout-automation.service";
import { RewardPayoutService } from "./services/reward-payout.service";
import { ResultViewService } from "./services/result-view.service";
import { RewardViewService } from "./services/reward-view.service";
import { ArenaUserIdentityService } from "./services/arena-user-identity.service";
import { ReputationService } from "./services/reputation.service";
import { RuntimeContractAlertService } from "./services/runtime-contract-alert.service";
import { TagService } from "./services/tag.service";
import { ValidationProofRecordService } from "./services/validation-proof-record.service";
import { ValidationRehearsalCheckpointService } from "./services/validation-rehearsal-checkpoint.service";
import { ValidationSettlementService } from "./services/validation-settlement.service";
import { ValidationBetExecutionService } from "./services/validation-bet-execution.service";
import { ValidationViewService } from "./services/validation-view.service";
import { WatchlistService } from "./services/watchlist.service";
import { ArenaValidationController } from "./validation.controller";
import { ValidationChainModule } from "./validation-chain/validation-chain.module";

const repositories = [
  PropositionRepository,
  ArenaUserRepository,
  ArenaUserWalletRepository,
  ArenaUserSessionRepository,
  DispatchTaskRepository,
  ResponseRepository,
  ResponseReviewRepository,
  EffectiveSampleCounterRepository,
  InternalAuditEventRepository,
  MarketRepository,
  BetRepository,
  RewardLedgerRepository,
  RewardPayoutRepository,
  SystemKeyValueRepository,
  UserReputationRepository,
  UserTagRepository,
];

const services = [
  PropositionStateService,
  PropositionEngineService,
  ConsensusClosureService,
  DispatchEngineService,
  DiscoveryConfigService,
  DiscussionService,
  DispatchTaskService,
  DispatchTaskExpiryAutomationService,
  QualityEngineService,
  ResponseService,
  ResponseReviewService,
  EffectiveSampleCounterService,
  FreezeRevealOrchestratorService,
  InternalAuditService,
  InternalMonitoringService,
  InternalPropositionOpsService,
  InternalResponseReviewOpsService,
  InternalRewardAuditService,
  OpsAlertNotifierService,
  ValidationProofRecordService,
  ValidationRehearsalCheckpointService,
  MarketService,
  BetService,
  AdjudicationViewService,
  ValidationSettlementService,
  ValidationBetExecutionService,
  RewardPayoutExecutionService,
  RewardPayoutAutomationService,
  RewardPayoutService,
  PropositionDraftService,
  RequesterComparisonSetService,
  RequesterComparisonSetDeliveryPolicyService,
  RequesterComparisonSetDeliveryRunService,
  RequesterComparisonSetDeliveryTransportService,
  RequesterPropositionViewService,
  RequesterComparisonSetDeliveryAutomationService,
  RequesterReportPresetService,
  PropositionLifecycleAutomationService,
  PublicDiscoveryService,
  PublicIntegrityViewService,
  PublicRespondentLeaderboardService,
  PublicResultViewService,
  RewardLedgerService,
  ArenaUserIdentityService,
  AccountExportService,
  AccountPreferencesService,
  AccountViewService,
  ResultViewService,
  RewardViewService,
  ReputationService,
  RuntimeContractAlertService,
  TagService,
  ValidationViewService,
  WatchlistService,
];

@Module({
  imports: [ValidationChainModule, HealthModule],
  controllers: [
    ArenaPublicController,
    ArenaPublicDiscoveryController,
    ArenaPublicRespondentLeaderboardController,
    ArenaInternalAuditController,
    ArenaInternalDiscoveryConfigController,
    ArenaAdjudicationController,
    ArenaDiscussionController,
    ArenaRespondentAccountController,
    ArenaRespondentResultsController,
    ArenaRespondentRewardsController,
    ArenaRespondentReputationController,
    ArenaRespondentTagsController,
    ArenaInternalDispatchController,
    ArenaInternalMonitoringController,
    ArenaInternalPropositionsController,
    ArenaInternalResponsesController,
    ArenaInternalReputationController,
    ArenaInternalRewardsController,
    ArenaInternalTagsController,
    ArenaInternalValidationChainController,
    ArenaPropositionsController,
    ArenaValidationController,
  ],
  providers: [ArenaIdService, ...repositories, ...services],
  exports: [
    ArenaIdService,
    ArenaUserRepository,
    ArenaUserWalletRepository,
    ArenaUserSessionRepository,
    ...services,
    ValidationChainModule,
  ],
})
export class ArenaModule {}
