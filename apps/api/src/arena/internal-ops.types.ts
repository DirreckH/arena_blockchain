import type {
  HealthSnapshot,
  QueueOverviewSnapshot,
  ReadinessSnapshot,
} from "@arena/shared";
import type {
  BetSettlementOutcome,
  BetStatus,
  InternalAuditEvent,
  MarketStatus,
  PropositionCategory,
  PropositionStatus,
  ResponseReviewStatus,
  RewardLedgerSourceType,
  RewardLedgerStatus,
  RewardPayoutMethod,
  RewardPayoutStatus,
  ValidationChainMarketStatus,
  ValidationChainResultKind,
  ValidationChainSyncStatus,
  ValidationChainVoidReason,
} from "@prisma/client";

import type {
  ClosureReadinessSnapshot,
  EffectiveSampleCounterSnapshot,
} from "./arena.types";
import type { PropositionSubmissionStatus } from "./proposition-submission";
import type {
  ValidationLifecycleDriftReason,
  ValidationLifecycleSnapshotViewModel,
} from "./validation-lifecycle";
import type { ValidationChainAutomaticCommand } from "./validation-chain/validation-chain.types";

export const INTERNAL_AUDIT_ENTITY_TYPES = {
  proposition: "proposition",
  rewardLedger: "reward_ledger",
} as const;

export type InternalAuditEntityType =
  (typeof INTERNAL_AUDIT_ENTITY_TYPES)[keyof typeof INTERNAL_AUDIT_ENTITY_TYPES];

export interface InternalAuditEventViewModel {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string | null;
  reason: string;
  note: string | null;
  metadata: InternalAuditEvent["metadataJson"];
  createdAt: string;
}

export interface InternalAuditEventListFilters {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  search?: string;
  sortDirection?: InternalListSortDirection;
  limit?: number;
  offset?: number;
}

export type InternalAuditEventListPageViewModel =
  InternalListPageViewModel<InternalAuditEventViewModel>;

export interface PropositionControlActionInput {
  propositionId: string;
  actorUserId: string;
  reason: string;
  note?: string;
}

export interface ApprovePropositionControlInput
  extends PropositionControlActionInput {
  publishedAt: string;
}

export interface RejectPropositionControlInput
  extends PropositionControlActionInput {
  rejectedAt: string;
}

export interface EmergencyFreezePropositionControlInput
  extends PropositionControlActionInput {
  frozenAt: string;
}

export interface RewardPayoutControlActionInput {
  ledgerId: string;
  actorUserId: string;
  reason: string;
  note?: string;
}

export interface ApproveRewardPayoutControlInput
  extends RewardPayoutControlActionInput {
  approvedAt: string;
}

export interface StartRewardPayoutExecutionControlInput
  extends RewardPayoutControlActionInput {
  startedAt: string;
}

export interface CompleteRewardPayoutControlInput
  extends RewardPayoutControlActionInput {
  completedAt: string;
  executionTxHash?: string;
  externalReference?: string;
}

export interface ConfirmRewardPayoutExecutionControlInput
  extends RewardPayoutControlActionInput {
  confirmedAt: string;
  externalReference?: string;
}

export interface FailRewardPayoutControlInput
  extends RewardPayoutControlActionInput {
  failedAt: string;
  errorCode: string;
  errorMessage: string;
}

export interface EnsureRewardPayoutControlInput
  extends RewardPayoutControlActionInput {
  ensuredAt: string;
}

export interface InternalPropositionListFilters {
  status?: PropositionStatus;
  submissionStatus?: PropositionSubmissionStatus;
  category?: PropositionCategory;
  marketEnabled?: boolean;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
  sortBy?: InternalPropositionListSortBy;
  sortDirection?: InternalListSortDirection;
  limit?: number;
  offset?: number;
}

export type InternalListSortDirection = "asc" | "desc";

export interface InternalListPageViewModel<TItem> {
  items: TItem[];
  totalCount: number;
  limit: number;
  offset: number;
}

export type InternalPropositionListSortBy =
  | "createdAt"
  | "submittedAt"
  | "title"
  | "effectiveSampleCount"
  | "pendingReviewCount"
  | "sampleShortageCount";

export interface InternalPropositionListItemViewModel {
  propositionId: string;
  title: string;
  category: PropositionCategory;
  status: PropositionStatus;
  submissionStatus: PropositionSubmissionStatus;
  submittedAt: string | null;
  marketEnabled: boolean;
  createdAt: string;
  publishedAt: string | null;
  liveAt: string | null;
  frozenAt: string | null;
  settledAt: string | null;
  minEffectiveSample: number;
  effectiveSampleCount: number;
  reviewedResponseCount: number;
  pendingReviewCount: number;
  sampleShortageCount: number;
}

export type InternalPropositionListPageViewModel =
  InternalListPageViewModel<InternalPropositionListItemViewModel>;

export interface PropositionDispatchSummaryViewModel {
  totalTasks: number;
  assignedCount: number;
  startedCount: number;
  submittedCount: number;
  skippedCount: number;
  expiredCount: number;
  cancelledCount: number;
  lastAssignedAt: string | null;
  lastSubmittedAt: string | null;
  uniqueAssignedUsers: number;
}

export interface PropositionReviewSummaryViewModel {
  totalReviews: number;
  pendingCount: number;
  finalizedCount: number;
  validCount: number;
  partialValidCount: number;
  invalidCount: number;
  fraudSuspectedCount: number;
  flaggedCount: number;
  invalidRate: number;
  anomalyRate: number;
  topFlags: Array<{ flag: string; count: number }>;
}

export interface PropositionRewardSummaryViewModel {
  totalEntries: number;
  pendingCount: number;
  finalizedCount: number;
  voidedCount: number;
  reversedCount: number;
  totalPendingAmount: string;
  totalFinalAmount: string;
  rewardEntries: Array<{
    ledgerId: string;
    responseId: string;
    userId: string;
    status: RewardLedgerStatus;
    reviewStatus: ResponseReviewStatus | null;
    pendingAmount: string;
    finalAmount: string | null;
    ledgerVersion: number;
    reasonCode: string | null;
    reversalOfLedgerId: string | null;
    createdAt: string;
    finalizedAt: string | null;
    voidedAt: string | null;
    reversedAt: string | null;
  }>;
}

export interface PropositionRevealSettlementViewModel {
  propositionStatus: PropositionStatus;
  resultKind: string | null;
  winningOption: number | null;
  voidReason: string | null;
  frozenAt: string | null;
  revealStartedAt: string | null;
  resultComputedAt: string | null;
  settledAt: string | null;
  marketStatus: string | null;
  currentPublicProgress: unknown;
  lastPublicResult: unknown;
}

export interface PropositionValidationLifecycleViewModel
  extends ValidationLifecycleSnapshotViewModel {
  onChainState: ValidationChainContractStateViewModel | null;
  operatorGuidance: ValidationLifecycleDriftOperatorGuidanceViewModel | null;
}

export interface PropositionValidationChainActivityViewModel {
  timeline: InternalAuditEventViewModel[];
  marketAuditEvents: InternalAuditEventViewModel[];
  commandAuditEvents: InternalAuditEventViewModel[];
  eventAuditEvents: InternalAuditEventViewModel[];
  driftAuditEvents: InternalAuditEventViewModel[];
  recoveryAuditEvents: InternalAuditEventViewModel[];
}

export interface PropositionValidationOperatorSummaryViewModel {
  status: "ready" | "action_required";
  requiresActionNow: boolean;
  summary: string;
  plannedCommands: ValidationChainAutomaticCommand[];
  operatorActions: string[];
  latestRelevantAudit: InternalAuditEventViewModel | null;
}

export type PropositionValidationRehearsalStepStatus =
  | "pending"
  | "complete"
  | "blocked";

export type PropositionValidationRehearsalStepId =
  | "preflight"
  | "publish_and_open"
  | "local_bet_and_sync"
  | "freeze_and_resolve"
  | "projection_and_settlement";

export interface PropositionValidationRehearsalStepViewModel {
  id: PropositionValidationRehearsalStepId;
  status: PropositionValidationRehearsalStepStatus;
  summary: string;
  commands: string[];
  evidence: string[];
  blockingReasons: string[];
  manualCheckpoint: PropositionValidationRehearsalCheckpointViewModel | null;
}

export interface PropositionValidationRehearsalSummaryViewModel {
  completedStepCount: number;
  remainingStepCount: number;
  currentStepId: PropositionValidationRehearsalStepId | null;
  currentStepStatus: PropositionValidationRehearsalStepStatus | null;
  nextCommands: string[];
  blockingReasons: string[];
  latestCheckpointAt: string | null;
  latestCheckpointStepId: PropositionValidationRehearsalStepId | null;
  latestCheckpointStatus: PropositionValidationRehearsalStepStatus | null;
}

export interface PropositionValidationRehearsalEnvironmentReadinessViewModel {
  status: "ok" | "degraded";
  checkedAt: string;
  validationEnvironment: "local" | "dev" | "staging" | "prod";
  chainId: number;
  runbookPath: string;
  blockingDependencies: ValidationChainRuntimeReadinessDependencyViewModel["name"][];
  preflightCommands: string[];
  operatorActions: ValidationChainRuntimeReadinessActionViewModel[];
}

export interface PropositionValidationRehearsalViewModel {
  status: "ready" | "blocked";
  targetOutcome: string;
  runbookPath: string;
  blockingDependencies: string[];
  summary: PropositionValidationRehearsalSummaryViewModel;
  environmentReadiness: PropositionValidationRehearsalEnvironmentReadinessViewModel;
  steps: PropositionValidationRehearsalStepViewModel[];
}

export interface PropositionValidationRehearsalCheckpointViewModel {
  propositionId: string;
  environment: "local" | "dev" | "staging" | "prod";
  chainId: number;
  stepId: PropositionValidationRehearsalStepId;
  status: PropositionValidationRehearsalStepStatus;
  reason: string;
  note: string | null;
  evidence: string[];
  txHash: string | null;
  blockNumber: number | null;
  recordedByUserId: string | null;
  recordedAt: string;
}

export interface InternalPropositionDetailViewModel {
  proposition: {
    id: string;
    title: string;
    description: string;
    category: PropositionCategory;
    status: PropositionStatus;
    marketEnabled: boolean;
    minEffectiveSample: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    rewardBudget: string;
    baseResponseReward: string;
    createdByUserId: string;
    updatedByUserId: string | null;
    createdAt: string;
    publishedAt: string | null;
    liveAt: string | null;
    frozenAt: string | null;
    revealStartedAt: string | null;
    resultComputedAt: string | null;
    settledAt: string | null;
    closedAt: string | null;
    archivedAt: string | null;
  };
  submission: {
    status: PropositionSubmissionStatus;
    submittedAt: string | null;
    submittedByUserId: string | null;
    submissionReason: string | null;
    submissionNote: string | null;
  };
  market: {
    id: string;
    status: MarketStatus;
    liveAt: string | null;
    frozenAt: string | null;
    settlingAt: string | null;
    settledAt: string | null;
    chainMarketId: string | null;
    chainPropositionId: string | null;
    chainStatus: ValidationChainMarketStatus | null;
    chainOpenedAt: string | null;
    chainFrozenAt: string | null;
    chainResolvedAt: string | null;
    chainCancelledAt: string | null;
    chainResultKind: ValidationChainResultKind | null;
    chainWinningOption: number | null;
    chainVoidReason: ValidationChainVoidReason | null;
    resolutionTxHash: string | null;
    cancelTxHash: string | null;
    chainSyncedAt: string | null;
    currentPublicProgress: unknown;
    lastPublicResult: unknown;
  } | null;
  validationLifecycle: PropositionValidationLifecycleViewModel;
  validationChainActivity: PropositionValidationChainActivityViewModel;
  validationOperatorSummary: PropositionValidationOperatorSummaryViewModel;
  validationRehearsal: PropositionValidationRehearsalViewModel;
  validationRehearsalCheckpoints: PropositionValidationRehearsalCheckpointViewModel[];
  sampleCounter: EffectiveSampleCounterSnapshot;
  closureReadiness: ClosureReadinessSnapshot;
  dispatchSummary: PropositionDispatchSummaryViewModel;
  reviewSummary: PropositionReviewSummaryViewModel;
  rewardSummary: PropositionRewardSummaryViewModel;
  revealSettlement: PropositionRevealSettlementViewModel;
  auditEvents: InternalAuditEventViewModel[];
  rewardAuditEvents: InternalAuditEventViewModel[];
}

export interface InternalPropositionEvidenceBundleViewModel {
  propositionId: string;
  exportedAt: string;
  propositionExport: InternalPropositionDetailViewModel & { exportedAt: string };
  runtimeContract: BackendRuntimeContractViewModel;
  validationChainHealth: ValidationChainMonitoringViewModel | null;
}

export interface SampleShortageMonitoringItemViewModel {
  propositionId: string;
  title: string;
  category: PropositionCategory;
  status: PropositionStatus;
  liveAt: string | null;
  deadlineAt: string | null;
  remainingSeconds: number | null;
  minEffectiveSample: number;
  effectiveSampleCount: number;
  reviewedResponseCount: number;
  shortageCount: number;
  nearingDeadline: boolean;
}

export interface QualityAnomalyMonitoringItemViewModel {
  propositionId: string;
  title: string;
  category: PropositionCategory;
  status: PropositionStatus;
  reviewedResponseCount: number;
  validCount: number;
  partialValidCount: number;
  invalidCount: number;
  fraudSuspectedCount: number;
  flaggedCount: number;
  invalidRate: number;
  anomalyRate: number;
  riskyRespondentCount: number;
  topFlags: Array<{ flag: string; count: number }>;
}

export interface ValidationLifecycleDriftMonitoringItemViewModel {
  propositionId: string;
  title: string;
  category: PropositionCategory;
  propositionStatus: PropositionStatus;
  marketId: string | null;
  marketStatus: MarketStatus | null;
  chainMarketId: string | null;
  chainStatus: ValidationChainMarketStatus | null;
  onChainState: ValidationChainContractStateViewModel | null;
  chainSyncedAt: string | null;
  publishedAt: string | null;
  liveAt: string | null;
  frozenAt: string | null;
  revealStartedAt: string | null;
  resultComputedAt: string | null;
  settledAt: string | null;
  driftReason: ValidationLifecycleDriftReason;
  operatorGuidance: ValidationLifecycleDriftOperatorGuidanceViewModel;
}

export interface ValidationChainHealthAlertViewModel {
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  metadata: unknown;
  createdAt: string;
}

export interface OperatorSummaryEvidenceViewModel {
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  createdAt: string;
}

export interface OperatorCurrentSummaryViewModel {
  status: "ready" | "action_required";
  requiresActionNow: boolean;
  focusArea: string;
  summary: string;
  operatorActions: string[];
  blockers: string[];
  latestRelevantEvidence: OperatorSummaryEvidenceViewModel | null;
}

export interface ValidationChainSchedulerWorkerViewModel {
  status: "up" | "down";
  checkedAt: string;
  startedAt: string | null;
  lastSeenAt: string | null;
  lastJobProcessedAt: string | null;
  lastJobName: string | null;
  lastWorkerErrorAt: string | null;
  lastWorkerErrorMessage: string | null;
  details?: string;
  operatorActions: string[];
}

export interface ValidationChainStalePayoutMarketViewModel {
  marketId: string;
  propositionId: string;
  chainStatus: ValidationChainMarketStatus;
  terminalAt: string;
  unclaimedBetCount: number;
  operatorActions: string[];
}

export interface ValidationChainRecentEventViewModel {
  eventName: string;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  marketChainId: string | null;
  propositionChainId: string | null;
  processedAt: string;
}

export interface ValidationChainDuplicateEventViewModel {
  chainId: number;
  transactionHash: string;
  logIndex: number;
  count: number;
}

export interface ValidationChainLatestMarketProjectionViewModel {
  marketId: string;
  propositionId: string;
  chainMarketId: string | null;
  chainStatus: ValidationChainMarketStatus | null;
  chainResultKind: ValidationChainResultKind | null;
  chainWinningOption: number | null;
  resolutionTxHash: string | null;
  cancelTxHash: string | null;
  chainSyncedAt: string | null;
}

export interface ValidationChainLatestBetProjectionViewModel {
  betId: string;
  marketId: string;
  propositionId: string;
  userId: string;
  status: BetStatus;
  settlementOutcome: BetSettlementOutcome | null;
  grossPayout: string | null;
  refundAmount: string | null;
  chainSyncedAt: string | null;
}

export interface ValidationChainUnsyncedBetBacklogItemViewModel {
  betId: string;
  marketId: string;
  propositionId: string;
  userId: string;
  status: BetStatus;
  stakeAmount: string;
  placedAt: string;
  chainMarketId: string | null;
  chainStatus: ValidationChainMarketStatus | null;
  oldestUnsyncedAgeMs: number;
  operatorActions: string[];
}

export interface ValidationChainBetReconciliationViewModel {
  betId: string;
  marketId: string;
  propositionId: string;
  userId: string;
  localBet: {
    selectedOption: number;
    stakeAmount: string;
    status: BetStatus;
    claimed: boolean;
    chainSyncedAt: string | null;
    placedAt: string;
  };
  onChainPosition: {
    exists: boolean;
    selectedOption: number | null;
    stakeAmount: string;
    claimed: boolean;
    claimableAmount: string;
  };
  comparison: {
    positionExists: boolean;
    optionMatches: boolean;
    amountMatches: boolean;
    claimedMatches: boolean;
    claimableAmount: string;
  };
}

export type ValidationChainBetReconciliationBatchItemStatus =
  | "matched"
  | "mismatched"
  | "failed";

export interface ValidationChainBetReconciliationBatchItemViewModel {
  betId: string;
  marketId: string;
  propositionId: string;
  userId: string;
  status: ValidationChainBetReconciliationBatchItemStatus;
  reconciliation: ValidationChainBetReconciliationViewModel | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ValidationChainBetReconciliationBatchViewModel {
  processedAt: string;
  requestedLimit: number;
  processedCount: number;
  matchedCount: number;
  mismatchedCount: number;
  failedCount: number;
  items: ValidationChainBetReconciliationBatchItemViewModel[];
}

export interface ValidationChainProjectionReplayMarketViewModel {
  chainStatus: ValidationChainMarketStatus | null;
  chainOpenedAt: string | null;
  chainFrozenAt: string | null;
  chainResolvedAt: string | null;
  chainCancelledAt: string | null;
  chainResultKind: ValidationChainResultKind | null;
  chainWinningOption: number | null;
  chainVoidReason: ValidationChainVoidReason | null;
  resolutionTxHash: string | null;
  cancelTxHash: string | null;
  chainSyncedAt: string | null;
}

export interface ValidationChainProjectionReplayBetViewModel {
  betId: string;
  marketId: string;
  propositionId: string;
  userId: string;
  status: BetStatus;
  claimed: boolean;
  settlementOutcome: BetSettlementOutcome | null;
  grossPayout: string | null;
  refundAmount: string | null;
  claimTxHash: string | null;
  refundTxHash: string | null;
  chainSyncedAt: string | null;
}

export interface ValidationChainProjectionReplayViewModel {
  marketId: string;
  propositionId: string;
  chainMarketId: string | null;
  chainPropositionId: string | null;
  processedAt: string;
  replayedEventCount: number;
  replayedEvents: ValidationChainRecentEventViewModel[];
  propositionStatus: PropositionStatus;
  propositionSettledAt: string | null;
  finalMarketProjection: ValidationChainProjectionReplayMarketViewModel;
  finalBetProjections: ValidationChainProjectionReplayBetViewModel[];
}

export type ValidationChainContractStateViewModel =
  | "unset"
  | "pre_live"
  | "live"
  | "frozen"
  | "resolved"
  | "cancelled";

export type ValidationLifecycleDriftOperatorGuidanceKind =
  | "queue_recovery"
  | "projection_repair"
  | "manual_intervention";

export type ValidationChainCommandRecoveryReason =
  | "create_open_missing_market"
  | "open_pre_live_market"
  | "freeze_live_market"
  | "freeze_resolve_live_market"
  | "resolve_settled_market"
  | "resolve_frozen_market";

export type ValidationChainCommandSubmissionStatus =
  | "enqueued"
  | "already_pending"
  | "failed";

export type ValidationChainCommandRecoveryRequestStatus =
  | "queued"
  | "already_pending"
  | "partial_failure"
  | "failed";

export interface ValidationLifecycleDriftOperatorGuidanceViewModel {
  kind: ValidationLifecycleDriftOperatorGuidanceKind;
  summary: string;
  recoveryReason: ValidationChainCommandRecoveryReason | null;
  plannedCommands: ValidationChainAutomaticCommand[];
  operatorActions: string[];
}

export interface ValidationChainCommandSubmissionViewModel {
  command: ValidationChainAutomaticCommand;
  status: ValidationChainCommandSubmissionStatus;
  queueJobId: string | null;
  delayMs: number;
  errorMessage: string | null;
}

export interface ValidationChainCommandRecoveryViewModel {
  propositionId: string;
  marketId: string;
  chainMarketId: string;
  chainPropositionId: string;
  queuedAt: string;
  requestStatus: ValidationChainCommandRecoveryRequestStatus;
  propositionStatus: PropositionStatus;
  marketStatus: MarketStatus;
  localChainStatus: ValidationChainMarketStatus | null;
  onChainState: ValidationChainContractStateViewModel | null;
  driftReason: ValidationLifecycleDriftReason | null;
  recoveryReason: ValidationChainCommandRecoveryReason;
  plannedCommands: ValidationChainAutomaticCommand[];
  commandSubmissions: ValidationChainCommandSubmissionViewModel[];
}

export interface ValidationChainFailureViewModel {
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  metadata: unknown;
  createdAt: string;
}

export interface ValidationChainRuntimeReadinessDependencyViewModel {
  name:
    | "env"
    | "database"
    | "redis"
    | "rpc"
    | "arena_artifact"
    | "validation_artifact"
    | "validation_contract"
    | "validation_contract_code"
    | "validation_contract_bytecode"
    | "validation_operator_signer"
    | "validation_oracle_signer"
    | "validation_pauser_signer"
    | "reward_payout_token"
    | "reward_payout_operator_signer";
  status: "up" | "down";
  details?: string;
}

export interface ValidationChainRuntimeReadinessActionViewModel {
  dependency: ValidationChainRuntimeReadinessDependencyViewModel["name"];
  summary: string;
  envKeys: string[];
  commands: string[];
}

export interface ValidationChainRuntimeReadinessViewModel {
  status: "ok" | "degraded";
  checkedAt: string;
  validationEnvironment: "local" | "dev" | "staging" | "prod";
  chainId: number;
  rpcUrl: string;
  arenaContractAddress: string;
  validationContractAddress: string;
  dependencies: ValidationChainRuntimeReadinessDependencyViewModel[];
  requiredEnvKeys: string[];
  optionalEnvKeys: string[];
  preflightCommands: string[];
  runbookPath: string;
  operatorActions: ValidationChainRuntimeReadinessActionViewModel[];
}

export interface BackendRuntimeContractCommandSetViewModel {
  install: string[];
  dev: string[];
  typecheck: string[];
  unitTest: string[];
  integrationTest: string[];
  e2eOrSmoke: string[];
  productionBuild: string[];
  validationLocalPrepare: string[];
  databaseMigrate: string[];
  preflight: string[];
}

export interface BackendRuntimeContractChecklistItemViewModel {
  id: string;
  status: "ready" | "blocked";
  summary: string;
  blockingDependencies: string[];
  commands: string[];
  operatorActions: string[];
}

export interface BackendRuntimeContractReleaseReadinessViewModel {
  status: "ready" | "blocked";
  blockingDependencies: string[];
  completedGateCount: number;
  totalGateCount: number;
}

export type BackendValidationRehearsalStepId =
  | "preflight"
  | "publish_and_open"
  | "local_bet_and_sync"
  | "freeze_and_resolve"
  | "projection_and_settlement";

export interface BackendValidationRehearsalStepViewModel {
  id: BackendValidationRehearsalStepId;
  summary: string;
  commands: string[];
  evidence: string[];
}

export interface BackendValidationRehearsalViewModel {
  status: "ready" | "blocked";
  targetOutcome: string;
  runbookPath: string;
  blockingDependencies: string[];
  steps: BackendValidationRehearsalStepViewModel[];
}

export interface BackendValidationProofRecordViewModel {
  environment: "local" | "dev" | "staging" | "prod";
  chainId: number;
  propositionId: string;
  proofComplete: boolean;
  failures: string[];
  releaseReadinessStatus: "ready" | "blocked" | "unknown";
  releaseBlockingDependencies: string[];
  validationRehearsalStatus: "ready" | "blocked" | "unknown";
  validationCurrentStepId: BackendValidationRehearsalStepId | null;
  validationCurrentStepStatus: "complete" | "blocked" | "pending" | null;
  completedStepCount: number;
  remainingStepCount: number;
  latestCheckpointStepId: BackendValidationRehearsalStepId | null;
  latestCheckpointStatus: "complete" | "blocked" | "pending" | null;
  latestCheckpointAt: string | null;
  publicSettledResultVisible: boolean;
  publicIntegrityOverviewVisible: boolean;
  rewardPayoutLedgerEntryCount: number;
  rewardPayoutRecordCount: number;
  rewardPayoutFinalizedWithoutPayoutCount: number;
  rewardPayoutExecutingWithoutTxHashCount: number;
  rewardPayoutStaleExecutingCount: number;
  rewardPayoutStaleExecutingWithoutTxHashCount: number;
  rewardPayoutStaleExecutingAwaitingConfirmationCount: number;
  rewardPayoutCompletedWithExecutionTxHashCount: number;
  rewardPayoutStatusCounts: {
    requested: number;
    approved: number;
    executing: number;
    completed: number;
    failed: number;
    cancelled: number;
    none: number;
  };
  summaryArtifactPath: string | null;
  evidenceArtifactPath: string | null;
  publicResultArtifactPath: string | null;
  rewardPayoutArtifactPath: string | null;
  publicIntegrityArtifactPath: string | null;
  note: string | null;
  recordedByUserId: string | null;
  checkedAt: string;
  recordedAt: string;
}

export interface BackendRuntimeContractViewModel {
  status: "ok" | "degraded";
  generatedAt: string;
  environment: {
    nodeEnv: "development" | "test" | "production";
    validationEnvironment: "local" | "dev" | "staging" | "prod";
    port: number;
  };
  health: {
    live: HealthSnapshot;
    readiness: ReadinessSnapshot;
    queues: QueueOverviewSnapshot;
  };
  validationChain: ValidationChainRuntimeReadinessViewModel;
  validationRehearsal: BackendValidationRehearsalViewModel;
  validationProofRecord: BackendValidationProofRecordViewModel | null;
  commands: BackendRuntimeContractCommandSetViewModel;
  releaseReadiness: BackendRuntimeContractReleaseReadinessViewModel;
  releaseChecklist: BackendRuntimeContractChecklistItemViewModel[];
  recentAlerts: InternalAuditEventViewModel[];
  operatorSummary: OperatorCurrentSummaryViewModel;
}

export interface ValidationChainMonitoringViewModel {
  streamKey: string;
  chainId: number | null;
  contractAddress: string | null;
  syncStatus: ValidationChainSyncStatus | "missing";
  lastProcessedBlock: number | null;
  lastProcessedTxHash: string | null;
  lastProcessedLogIndex: number | null;
  lastFinalizedBlock: number | null;
  cursorUpdatedAt: string | null;
  pollIntervalMs: number;
  cursorStaleThresholdMs: number;
  isCursorStalled: boolean;
  schedulerWorker: ValidationChainSchedulerWorkerViewModel | null;
  recentAlerts: ValidationChainHealthAlertViewModel[];
  metrics: {
    recentRetryExhaustedCount: number;
    recentTerminalCommandCount: number;
    recentSyncFailureCount: number;
    recentProjectorEntityMissingCount: number;
    stalePayoutMarketCount: number;
    unsyncedBetBacklogCount: number;
  };
  eventLedger: {
    totalEventCount: number;
    duplicateRows: ValidationChainDuplicateEventViewModel[];
    recentEvents: ValidationChainRecentEventViewModel[];
  };
  projection: {
    latestMarket: ValidationChainLatestMarketProjectionViewModel | null;
    latestBet: ValidationChainLatestBetProjectionViewModel | null;
    unsyncedBetBacklog: ValidationChainUnsyncedBetBacklogItemViewModel[];
  };
  failures: {
    projectorFailuresCount: number;
    syncFailuresCount: number;
    recentFailures: ValidationChainFailureViewModel[];
  };
  stalePayoutMarkets: ValidationChainStalePayoutMarketViewModel[];
  operatorSummary: OperatorCurrentSummaryViewModel;
}

export type ResponseReviewWorkflowStateViewModel =
  | "unclaimed"
  | "claimed"
  | "released"
  | "expired"
  | "finalized";

export interface InternalResponseReviewQueueFilters {
  workflowState?: ResponseReviewWorkflowStateViewModel;
  propositionId?: string;
  claimStaleOnly?: boolean;
  claimedByUserId?: string;
  reviewStatus?: ResponseReviewStatus;
  search?: string;
  sortBy?: InternalResponseReviewQueueSortBy;
  sortDirection?: InternalListSortDirection;
  limit?: number;
  offset?: number;
}

export type InternalResponseReviewQueueSortBy =
  | "submittedAt"
  | "claimedAt"
  | "propositionTitle"
  | "userId"
  | "workflowState";

export interface InternalResponseReviewQueueItemViewModel {
  responseId: string;
  propositionId: string;
  propositionTitle: string;
  userId: string;
  submittedAt: string;
  reviewStatus: ResponseReviewStatus;
  workflowState: ResponseReviewWorkflowStateViewModel;
  claimedByUserId: string | null;
  claimedAt: string | null;
  isClaimStale: boolean;
  claimStaleAfterSeconds: number;
}

export type InternalResponseReviewQueuePageViewModel =
  InternalListPageViewModel<InternalResponseReviewQueueItemViewModel>;

export interface InternalResponseReviewDetailViewModel {
  response: {
    id: string;
    propositionId: string;
    taskId: string;
    userId: string;
    responseVersion: number;
    isLatest: boolean;
    selectedOption: number;
    confirmationOption: number;
    responsePayload: unknown;
    understandingAck: boolean;
    clientStartedAt: string;
    clientSubmittedAt: string;
    submittedAt: string;
  };
  proposition: {
    id: string;
    title: string;
    category: PropositionCategory;
    status: PropositionStatus;
  };
  task: {
    id: string;
    status: string;
    assignedAt: string;
    startedAt: string | null;
    submittedAt: string | null;
    expiresAt: string;
  };
  workflow: {
    responseId: string;
    reviewStatus: ResponseReviewStatus;
    workflowState: ResponseReviewWorkflowStateViewModel;
    claimedByUserId: string | null;
    claimedAt: string | null;
    releasedByUserId: string | null;
    releasedAt: string | null;
    expiredAt: string | null;
    reviewedByUserId: string | null;
    reviewedAt: string | null;
    finalizedReviewStatus: ResponseReviewStatus | null;
    claimStaleAfterSeconds: number;
    isClaimStale: boolean;
  };
  currentReview: {
    status: ResponseReviewStatus;
    qualityScore: number;
    flags: string[];
    reasonCodes: string[];
    reviewedByUserId: string | null;
    reviewedAt: string | null;
  } | null;
}

export interface RewardAuditListFilters {
  propositionId?: string;
  userId?: string;
  responseId?: string;
  status?: RewardLedgerStatus;
  payoutStatus?: RewardPayoutStatus;
  missingPayoutOnly?: boolean;
  staleExecutionOnly?: boolean;
  actionQueue?: RewardAuditActionQueue;
  sourceType?: RewardLedgerSourceType;
  search?: string;
  sortBy?: RewardAuditListSortBy;
  sortDirection?: InternalListSortDirection;
  limit?: number;
  offset?: number;
}

export type RewardAuditActionQueue =
  | "missing_payout"
  | "approval"
  | "execution_start"
  | "execution_confirm"
  | "execution_recover"
  | "retry";

export type RewardAuditListSortBy =
  | "createdAt"
  | "finalizedAt"
  | "propositionTitle"
  | "userId"
  | "amount"
  | "ledgerVersion";

export interface InternalRewardAuditListItemViewModel {
  ledgerId: string;
  propositionId: string;
  propositionTitle: string;
  responseId: string;
  userId: string;
  sourceType: RewardLedgerSourceType;
  status: RewardLedgerStatus;
  reviewStatus: ResponseReviewStatus | null;
  pendingAmount: string;
  finalAmount: string | null;
  ledgerVersion: number;
  reasonCode: string | null;
  reversalOfLedgerId: string | null;
  createdAt: string;
  finalizedAt: string | null;
  voidedAt: string | null;
  reversedAt: string | null;
  payoutId: string | null;
  payoutStatus: RewardPayoutStatus | null;
  payoutMethod: RewardPayoutMethod | null;
  payoutAmount: string | null;
  payoutAssetSymbol: string | null;
  payoutDestinationAddress: string | null;
  payoutRequestedAt: string | null;
  payoutApprovedAt: string | null;
  payoutExecutionStartedAt: string | null;
  payoutCompletedAt: string | null;
  payoutFailedAt: string | null;
  payoutCancelledAt: string | null;
  payoutExecutionTxHash: string | null;
  payoutRetryCount: number;
  payoutLastErrorCode: string | null;
  payoutLastErrorMessage: string | null;
}

export type InternalRewardAuditListPageViewModel =
  InternalListPageViewModel<InternalRewardAuditListItemViewModel>;

export interface InternalRewardAuditDetailViewModel {
  ledgerId: string;
  proposition: {
    id: string;
    title: string;
    status: PropositionStatus;
  };
  response: {
    id: string;
    userId: string;
    isLatest: boolean;
    submittedAt: string;
  };
  currentReview: {
    status: ResponseReviewStatus;
    qualityScore: number;
    flags: string[];
    reasonCodes: string[];
    reviewedByUserId: string | null;
    reviewedAt: string | null;
  } | null;
  payout: {
    payoutId: string;
    status: RewardPayoutStatus;
    method: RewardPayoutMethod;
    amount: string;
    assetSymbol: string;
    destinationAddress: string;
    requestedAt: string;
    approvedAt: string | null;
    approvedByUserId: string | null;
    executionStartedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    cancelledAt: string | null;
    executionTxHash: string | null;
    externalReference: string | null;
    retryCount: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  } | null;
  chain: InternalRewardAuditListItemViewModel[];
  auditEvents: InternalAuditEventViewModel[];
}

export type InternalDiscoveryRankingCategoryLabelMap = Record<
  | "all"
  | "general"
  | "politics"
  | "sports"
  | "tech"
  | "research"
  | "culture",
  string
>;

export type InternalDiscoveryCategoryPageState =
  | "visible"
  | "hidden"
  | "deleted";

export type InternalDiscoveryCategoryKind = "system" | "custom";

export interface InternalDiscoveryGlobalCategoryConfigViewModel {
  slug: string;
  pathname: string;
  label: string;
  title: string;
  directoryLabel: string;
  description: string;
  displayOrder: number;
  pageState: InternalDiscoveryCategoryPageState;
  kind: InternalDiscoveryCategoryKind;
  marketIdWhitelist: string[];
  invalidMarketIds: string[];
}

export interface InternalDiscoveryGlobalCategoryConfigInput {
  slug: string;
  pathname?: string;
  label?: string;
  title?: string;
  directoryLabel?: string;
  description?: string;
  displayOrder?: number;
  pageState?: InternalDiscoveryCategoryPageState;
  kind?: InternalDiscoveryCategoryKind;
  marketIdWhitelist?: string[];
}

export type InternalDiscoverySecondaryCapsulePageState =
  | "visible"
  | "hidden"
  | "deleted";

export type InternalDiscoverySecondaryCapsuleKind = "system" | "custom";

export type InternalDiscoverySecondaryCapsuleBaseRankingId =
  | "all"
  | "general"
  | "politics"
  | "sports"
  | "tech"
  | "research"
  | "culture";

export interface InternalDiscoverySecondaryCapsuleViewModel {
  id: string;
  label: string;
  displayOrder: number;
  pageState: InternalDiscoverySecondaryCapsulePageState;
  kind: InternalDiscoverySecondaryCapsuleKind;
  baseRankingId: InternalDiscoverySecondaryCapsuleBaseRankingId | null;
  marketIdWhitelist: string[];
  invalidMarketIds: string[];
}

export interface InternalDiscoverySecondaryCapsuleInput {
  id: string;
  label?: string;
  displayOrder?: number;
  pageState?: InternalDiscoverySecondaryCapsulePageState;
  kind?: InternalDiscoverySecondaryCapsuleKind;
  baseRankingId?: InternalDiscoverySecondaryCapsuleBaseRankingId | null;
  marketIdWhitelist?: string[];
}

export interface InternalDiscoveryGlobalConfigViewModel {
  categories: InternalDiscoveryGlobalCategoryConfigViewModel[];
  rankingCategoryLabels: InternalDiscoveryRankingCategoryLabelMap;
  secondaryCapsules: InternalDiscoverySecondaryCapsuleViewModel[];
}

export interface InternalDiscoveryGlobalConfigInput {
  categories: InternalDiscoveryGlobalCategoryConfigInput[];
  rankingCategoryLabels: Partial<InternalDiscoveryRankingCategoryLabelMap>;
  secondaryCapsules?: InternalDiscoverySecondaryCapsuleInput[];
}

export interface InternalDiscoveryCategoryConfigSummaryViewModel {
  slug: string;
  pathname: string;
  label: string;
  title: string;
  directoryLabel: string;
  description: string;
  sidebarItemCount: number;
  configured: boolean;
  pageState: InternalDiscoveryCategoryPageState;
  kind: InternalDiscoveryCategoryKind;
}

export interface InternalDiscoverySidebarItemViewModel {
  id: string;
  label: string;
  linkedMarketIds: string[];
  resolvedLinkedMarketCount: number;
  invalidLinkedMarketIds: string[];
}

export interface InternalDiscoverySidebarItemInput {
  id: string;
  label: string;
  linkedMarketIds: string[];
}

export interface InternalDiscoveryCategoryConfigViewModel {
  slug: string;
  pathname: string;
  label: string;
  title: string;
  directoryLabel: string;
  description: string;
  configured: boolean;
  pageState: InternalDiscoveryCategoryPageState;
  availableMarkets: Array<{
    marketId: string;
    title: string;
  }>;
  sidebarItems: InternalDiscoverySidebarItemViewModel[];
  warnings: string[];
  kind: InternalDiscoveryCategoryKind;
}

export interface InternalDiscoveryCategoryConfigInput {
  sidebarItems: InternalDiscoverySidebarItemInput[];
}
