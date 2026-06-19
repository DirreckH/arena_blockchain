// Frontend mirror of the operator/internal view models defined in
// apps/api/src/arena/internal-ops.types.ts and a few related service contracts.
// These types are NOT exported from @arena/shared, so the web app keeps a local
// mirror limited to the fields the operator console actually consumes.
// When the backend view models change, update this file to match.

import type {
  DispatchPriorityBucket,
  HealthSnapshot,
  QueueOverviewSnapshot,
  ReadinessSnapshot,
} from '@arena/shared'

// --- Prisma-derived string unions (mirrored locally) ---

export type PropositionCategory = string

export type PropositionStatus =
  | 'draft'
  | 'scheduled'
  | 'live'
  | 'frozen'
  | 'revealing'
  | 'settled'
  | 'closed'
  | 'archived'

export type PropositionSubmissionStatus =
  | 'unsubmitted'
  | 'submitted'
  | 'withdrawn'
  | 'approved'
  | 'rejected'

export type MarketStatus =
  | 'pending'
  | 'live'
  | 'frozen'
  | 'settling'
  | 'settled'
  | 'cancelled'

export type ResponseReviewStatus =
  | 'pending_review'
  | 'valid'
  | 'partial_valid'
  | 'invalid'
  | 'fraud_suspected'

export type RewardLedgerStatus =
  | 'pending'
  | 'finalized'
  | 'voided'
  | 'reversed'

export type RewardLedgerSourceType = 'response'

export type RewardPayoutStatus =
  | 'requested'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type RewardPayoutMethod = 'wallet_transfer'

export type ValidationChainMarketStatus =
  | 'pre_live'
  | 'live'
  | 'frozen'
  | 'resolved'
  | 'cancelled'

export type ValidationChainSyncStatus = 'idle' | 'syncing' | 'error'

export type BetStatus = 'open' | 'settled' | 'refunded' | 'void'

export type BetSettlementOutcome = 'won' | 'lost' | 'refunded' | 'void'

export type ValidationLifecycleDriftReason =
  | 'market_missing'
  | 'chain_market_not_created'
  | 'chain_market_not_opened'
  | 'chain_market_not_frozen'
  | 'chain_market_not_resolved'

export type ValidationChainContractStateViewModel =
  | 'unset'
  | 'pre_live'
  | 'live'
  | 'frozen'
  | 'resolved'
  | 'cancelled'

export type ValidationLifecycleDriftOperatorGuidanceKind =
  | 'queue_recovery'
  | 'projection_repair'
  | 'manual_intervention'

export type ValidationChainCommandRecoveryReason =
  | 'create_open_missing_market'
  | 'open_pre_live_market'
  | 'freeze_live_market'
  | 'freeze_resolve_live_market'
  | 'resolve_settled_market'
  | 'resolve_frozen_market'

// --- Audit + proposition list/detail ---

export interface InternalAuditEventViewModel {
  id: string
  entityType: string
  entityId: string
  action: string
  actorUserId: string | null
  reason: string
  note: string | null
  metadata: unknown
  createdAt: string
}

export interface InternalPropositionListItemViewModel {
  propositionId: string
  title: string
  category: PropositionCategory
  status: PropositionStatus
  submissionStatus: PropositionSubmissionStatus
  submittedAt: string | null
  marketEnabled: boolean
  createdAt: string
  publishedAt: string | null
  liveAt: string | null
  frozenAt: string | null
  settledAt: string | null
  minEffectiveSample: number
  effectiveSampleCount: number
  reviewedResponseCount: number
  pendingReviewCount: number
  sampleShortageCount: number
}

export type InternalListSortDirection = 'asc' | 'desc'

export interface InternalListPageViewModel<TItem> {
  items: TItem[]
  totalCount: number
  limit: number
  offset: number
}

export type InternalAuditEventListPageViewModel =
  InternalListPageViewModel<InternalAuditEventViewModel>

export type InternalPropositionListSortBy =
  | 'createdAt'
  | 'submittedAt'
  | 'title'
  | 'effectiveSampleCount'
  | 'pendingReviewCount'
  | 'sampleShortageCount'

export type InternalPropositionListPageViewModel =
  InternalListPageViewModel<InternalPropositionListItemViewModel>

export interface PropositionReviewSummaryViewModel {
  totalReviews: number
  pendingCount: number
  finalizedCount: number
  validCount: number
  partialValidCount: number
  invalidCount: number
  fraudSuspectedCount: number
  flaggedCount: number
  invalidRate: number
  anomalyRate: number
  topFlags: Array<{ flag: string; count: number }>
}

export interface PropositionRewardEntryViewModel {
  ledgerId: string
  responseId: string
  userId: string
  status: RewardLedgerStatus
  reviewStatus: ResponseReviewStatus | null
  pendingAmount: string
  finalAmount: string | null
  ledgerVersion: number
  reasonCode: string | null
  reversalOfLedgerId: string | null
  createdAt: string
  finalizedAt: string | null
  voidedAt: string | null
  reversedAt: string | null
}

export interface PropositionRewardSummaryViewModel {
  totalEntries: number
  pendingCount: number
  finalizedCount: number
  voidedCount: number
  reversedCount: number
  totalPendingAmount: string
  totalFinalAmount: string
  rewardEntries: PropositionRewardEntryViewModel[]
}

// --- Effective sample / closure / dispatch snapshots ---

export interface EffectiveSampleCounterSnapshot {
  propositionId: string
  totalResponses: number
  reviewedResponses: number
  validCount: number
  partialValidCount: number
  invalidCount: number
  effectiveSampleCount: number
  currentProgress: number
  hasReachedMinEffectiveSample: boolean
  updatedAt: string
}

export type ClosureReadinessTriggerReason =
  | 'min_duration_and_sample_reached'
  | 'max_duration_reached'
  | 'not_ready'

export interface ClosureReadinessSnapshot {
  propositionId: string
  propositionStatus: PropositionStatus
  counterSnapshot: EffectiveSampleCounterSnapshot
  liveAt: string | null
  minFreezeAt: string | null
  maxFreezeAt: string | null
  minDurationReached: boolean
  maxDurationReached: boolean
  hasReachedMinEffectiveSample: boolean
  isReadyToFreeze: boolean
  triggerReason: ClosureReadinessTriggerReason
}

export interface PropositionDispatchSummaryViewModel {
  totalTasks: number
  assignedCount: number
  startedCount: number
  submittedCount: number
  skippedCount: number
  expiredCount: number
  cancelledCount: number
  lastAssignedAt: string | null
  lastSubmittedAt: string | null
  uniqueAssignedUsers: number
}

export interface OpsDispatchCandidateViewModel {
  userId: string
  eligible: boolean
  selected: boolean
  blockReason: string | null
  priorityBucket: DispatchPriorityBucket
  baseScore: number
  qualityAdjustment: number
  interestAdjustment: number
  finalScore: number | null
  matchedInterestTag: string | null
  reasons: string[]
}

export interface OpsDispatchPreviewViewModel {
  propositionId: string
  propositionCategory: PropositionCategory
  ruleVersion: string
  maxAssignments: number
  generalReserveCount: number
  selectedUserIds: string[]
  candidates: OpsDispatchCandidateViewModel[]
}

export interface OpsDispatchTaskViewModel {
  id: string
  propositionId: string
  userId: string
  status: string
  assignedAt: string
  startedAt: string | null
  submittedAt: string | null
  expiresAt: string
  skipReason: string | null
  expiryReason: string | null
  cooldownUntil: string | null
  createdAt?: string
  updatedAt?: string
}

export interface PropositionRevealSettlementViewModel {
  propositionStatus: PropositionStatus
  resultKind: string | null
  winningOption: number | null
  voidReason: string | null
  frozenAt: string | null
  revealStartedAt: string | null
  resultComputedAt: string | null
  settledAt: string | null
  marketStatus: string | null
  currentPublicProgress: unknown
  lastPublicResult: unknown
}

// --- Validation chain activity (audit timeline grouped by concern) ---

export interface PropositionValidationChainActivityViewModel {
  timeline: InternalAuditEventViewModel[]
  marketAuditEvents: InternalAuditEventViewModel[]
  commandAuditEvents: InternalAuditEventViewModel[]
  eventAuditEvents: InternalAuditEventViewModel[]
  driftAuditEvents: InternalAuditEventViewModel[]
  recoveryAuditEvents: InternalAuditEventViewModel[]
}

// --- Validation rehearsal stepper + checkpoints ---

export type PropositionValidationRehearsalStepStatus =
  | 'pending'
  | 'complete'
  | 'blocked'

export type PropositionValidationRehearsalStepId =
  | 'preflight'
  | 'publish_and_open'
  | 'local_bet_and_sync'
  | 'freeze_and_resolve'
  | 'projection_and_settlement'

export interface PropositionValidationRehearsalCheckpointViewModel {
  propositionId: string
  environment: 'local' | 'dev' | 'staging' | 'prod'
  chainId: number
  stepId: PropositionValidationRehearsalStepId
  status: PropositionValidationRehearsalStepStatus
  reason: string
  note: string | null
  evidence: string[]
  txHash: string | null
  blockNumber: number | null
  recordedByUserId: string | null
  recordedAt: string
}

export interface PropositionValidationRehearsalStepViewModel {
  id: PropositionValidationRehearsalStepId
  status: PropositionValidationRehearsalStepStatus
  summary: string
  commands: string[]
  evidence: string[]
  blockingReasons: string[]
  manualCheckpoint: PropositionValidationRehearsalCheckpointViewModel | null
}

export interface PropositionValidationRehearsalSummaryViewModel {
  completedStepCount: number
  remainingStepCount: number
  currentStepId: PropositionValidationRehearsalStepId | null
  currentStepStatus: PropositionValidationRehearsalStepStatus | null
  nextCommands: string[]
  blockingReasons: string[]
  latestCheckpointAt: string | null
  latestCheckpointStepId: PropositionValidationRehearsalStepId | null
  latestCheckpointStatus: PropositionValidationRehearsalStepStatus | null
}

export interface PropositionValidationRehearsalEnvironmentReadinessViewModel {
  status: 'ok' | 'degraded'
  validationEnvironment: 'local' | 'dev' | 'staging' | 'prod'
  blockingDependencies: string[]
}

export interface PropositionValidationRehearsalViewModel {
  status: 'ready' | 'blocked'
  targetOutcome: string
  runbookPath: string
  blockingDependencies: string[]
  summary: PropositionValidationRehearsalSummaryViewModel
  environmentReadiness: PropositionValidationRehearsalEnvironmentReadinessViewModel
  steps: PropositionValidationRehearsalStepViewModel[]
}

export interface ValidationLifecycleDriftOperatorGuidanceViewModel {
  kind: ValidationLifecycleDriftOperatorGuidanceKind
  summary: string
  recoveryReason: ValidationChainCommandRecoveryReason | null
  plannedCommands: string[]
  operatorActions: string[]
}

export interface PropositionValidationLifecycleViewModel {
  propositionStatus: PropositionStatus
  marketId: string | null
  marketStatus: MarketStatus | null
  chainMarketId: string | null
  chainStatus: ValidationChainMarketStatus | null
  chainSyncedAt: string | null
  driftReason: ValidationLifecycleDriftReason | null
  onChainState: ValidationChainContractStateViewModel | null
  operatorGuidance: ValidationLifecycleDriftOperatorGuidanceViewModel | null
}

export interface PropositionValidationOperatorSummaryViewModel {
  status: 'ready' | 'action_required'
  requiresActionNow: boolean
  summary: string
  plannedCommands: string[]
  operatorActions: string[]
  latestRelevantAudit: InternalAuditEventViewModel | null
}

export interface InternalPropositionDetailViewModel {
  proposition: {
    id: string
    title: string
    description: string
    category: PropositionCategory
    status: PropositionStatus
    marketEnabled: boolean
    minEffectiveSample: number
    minDurationSeconds: number
    maxDurationSeconds: number
    rewardBudget: string
    baseResponseReward: string
    createdByUserId: string
    updatedByUserId: string | null
    createdAt: string
    publishedAt: string | null
    liveAt: string | null
    frozenAt: string | null
    revealStartedAt: string | null
    resultComputedAt: string | null
    settledAt: string | null
    closedAt: string | null
    archivedAt: string | null
  }
  submission: {
    status: PropositionSubmissionStatus
    submittedAt: string | null
    submittedByUserId: string | null
    submissionReason: string | null
    submissionNote: string | null
  }
  market: {
    id: string
    status: MarketStatus
    liveAt: string | null
    frozenAt: string | null
    settlingAt: string | null
    settledAt: string | null
    chainMarketId: string | null
    chainPropositionId: string | null
    chainStatus: ValidationChainMarketStatus | null
    chainOpenedAt: string | null
    chainFrozenAt: string | null
    chainResolvedAt: string | null
    chainCancelledAt: string | null
    chainResultKind: string | null
    chainWinningOption: number | null
    chainVoidReason: string | null
    resolutionTxHash: string | null
    cancelTxHash: string | null
    chainSyncedAt: string | null
    currentPublicProgress: unknown
    lastPublicResult: unknown
  } | null
  validationLifecycle: PropositionValidationLifecycleViewModel
  validationChainActivity: PropositionValidationChainActivityViewModel
  validationOperatorSummary: PropositionValidationOperatorSummaryViewModel
  validationRehearsal: PropositionValidationRehearsalViewModel
  validationRehearsalCheckpoints: PropositionValidationRehearsalCheckpointViewModel[]
  sampleCounter: EffectiveSampleCounterSnapshot
  closureReadiness: ClosureReadinessSnapshot
  dispatchSummary: PropositionDispatchSummaryViewModel
  reviewSummary: PropositionReviewSummaryViewModel
  rewardSummary: PropositionRewardSummaryViewModel
  revealSettlement: PropositionRevealSettlementViewModel
  auditEvents: InternalAuditEventViewModel[]
  rewardAuditEvents: InternalAuditEventViewModel[]
}

export interface InternalPropositionEvidenceBundleViewModel {
  propositionId: string
  exportedAt: string
  propositionExport: InternalPropositionDetailViewModel & { exportedAt: string }
  runtimeContract: BackendRuntimeContractViewModel
  validationChainHealth: ValidationChainMonitoringViewModel | null
}

// --- Monitoring ---

export interface SampleShortageMonitoringItemViewModel {
  propositionId: string
  title: string
  category: PropositionCategory
  status: PropositionStatus
  liveAt: string | null
  deadlineAt: string | null
  remainingSeconds: number | null
  minEffectiveSample: number
  effectiveSampleCount: number
  reviewedResponseCount: number
  shortageCount: number
  nearingDeadline: boolean
}

export interface QualityAnomalyMonitoringItemViewModel {
  propositionId: string
  title: string
  category: PropositionCategory
  status: PropositionStatus
  reviewedResponseCount: number
  validCount: number
  partialValidCount: number
  invalidCount: number
  fraudSuspectedCount: number
  flaggedCount: number
  invalidRate: number
  anomalyRate: number
  riskyRespondentCount: number
  topFlags: Array<{ flag: string; count: number }>
}

export interface ValidationLifecycleDriftMonitoringItemViewModel {
  propositionId: string
  title: string
  category: PropositionCategory
  propositionStatus: PropositionStatus
  marketId: string | null
  marketStatus: MarketStatus | null
  chainMarketId: string | null
  chainStatus: ValidationChainMarketStatus | null
  onChainState: ValidationChainContractStateViewModel | null
  chainSyncedAt: string | null
  publishedAt: string | null
  liveAt: string | null
  frozenAt: string | null
  revealStartedAt: string | null
  resultComputedAt: string | null
  settledAt: string | null
  driftReason: ValidationLifecycleDriftReason
  operatorGuidance: ValidationLifecycleDriftOperatorGuidanceViewModel
}

// --- Validation chain health ---

export interface ValidationChainHealthAlertViewModel {
  action: string
  entityType: string
  entityId: string
  reason: string
  metadata: unknown
  createdAt: string
}

export interface OperatorSummaryEvidenceViewModel {
  action: string
  entityType: string
  entityId: string
  reason: string
  createdAt: string
}

export interface OperatorCurrentSummaryViewModel {
  status: 'ready' | 'action_required'
  requiresActionNow: boolean
  focusArea: string
  summary: string
  operatorActions: string[]
  blockers: string[]
  latestRelevantEvidence: OperatorSummaryEvidenceViewModel | null
}

export interface ValidationChainSchedulerWorkerViewModel {
  status: 'up' | 'down'
  checkedAt: string
  startedAt: string | null
  lastSeenAt: string | null
  lastJobProcessedAt: string | null
  lastJobName: string | null
  lastWorkerErrorAt: string | null
  lastWorkerErrorMessage: string | null
  details?: string
  operatorActions: string[]
}

export interface ValidationChainStalePayoutMarketViewModel {
  marketId: string
  propositionId: string
  chainStatus: ValidationChainMarketStatus
  terminalAt: string
  unclaimedBetCount: number
  operatorActions: string[]
}

export interface ValidationChainUnsyncedBetBacklogItemViewModel {
  betId: string
  marketId: string
  propositionId: string
  userId: string
  status: BetStatus
  stakeAmount: string
  placedAt: string
  chainMarketId: string | null
  chainStatus: ValidationChainMarketStatus | null
  oldestUnsyncedAgeMs: number
  operatorActions: string[]
}

export interface ValidationChainLatestMarketProjectionViewModel {
  marketId: string
  propositionId: string
  chainMarketId: string | null
  chainStatus: ValidationChainMarketStatus | null
  chainResultKind: string | null
  chainWinningOption: number | null
  resolutionTxHash: string | null
  cancelTxHash: string | null
  chainSyncedAt: string | null
}

export interface ValidationChainLatestBetProjectionViewModel {
  betId: string
  marketId: string
  propositionId: string
  userId: string
  status: BetStatus
  settlementOutcome: BetSettlementOutcome | null
  grossPayout: string | null
  refundAmount: string | null
  chainSyncedAt: string | null
}

export interface ValidationChainRecentEventViewModel {
  eventName: string
  blockNumber: number
  transactionHash: string
  transactionIndex: number
  logIndex: number
  marketChainId: string | null
  propositionChainId: string | null
  processedAt: string
}

export interface ValidationChainDuplicateEventViewModel {
  chainId: number
  transactionHash: string
  logIndex: number
  count: number
}

export interface ValidationChainFailureViewModel {
  action: string
  entityType: string
  entityId: string
  reason: string
  metadata: unknown
  createdAt: string
}

export interface ValidationChainMonitoringViewModel {
  streamKey: string
  chainId: number | null
  contractAddress: string | null
  syncStatus: ValidationChainSyncStatus | 'missing'
  lastProcessedBlock: number | null
  lastProcessedTxHash: string | null
  lastProcessedLogIndex: number | null
  lastFinalizedBlock: number | null
  cursorUpdatedAt: string | null
  pollIntervalMs: number
  cursorStaleThresholdMs: number
  isCursorStalled: boolean
  schedulerWorker: ValidationChainSchedulerWorkerViewModel | null
  recentAlerts: ValidationChainHealthAlertViewModel[]
  metrics: {
    recentRetryExhaustedCount: number
    recentTerminalCommandCount: number
    recentSyncFailureCount: number
    recentProjectorEntityMissingCount: number
    stalePayoutMarketCount: number
    unsyncedBetBacklogCount: number
  }
  eventLedger: {
    totalEventCount: number
    duplicateRows: ValidationChainDuplicateEventViewModel[]
    recentEvents: ValidationChainRecentEventViewModel[]
  }
  projection: {
    latestMarket: ValidationChainLatestMarketProjectionViewModel | null
    latestBet: ValidationChainLatestBetProjectionViewModel | null
    unsyncedBetBacklog: ValidationChainUnsyncedBetBacklogItemViewModel[]
  }
  failures: {
    projectorFailuresCount: number
    syncFailuresCount: number
    recentFailures: ValidationChainFailureViewModel[]
  }
  stalePayoutMarkets: ValidationChainStalePayoutMarketViewModel[]
  operatorSummary: OperatorCurrentSummaryViewModel
}

// --- Runtime readiness + runtime contract ---

export interface ValidationChainRuntimeReadinessDependencyViewModel {
  name:
    | 'env'
    | 'database'
    | 'redis'
    | 'rpc'
    | 'arena_artifact'
    | 'validation_artifact'
    | 'validation_contract'
    | 'validation_contract_code'
    | 'validation_contract_bytecode'
    | 'validation_operator_signer'
    | 'validation_oracle_signer'
    | 'validation_pauser_signer'
    | 'reward_payout_token'
    | 'reward_payout_operator_signer'
  status: 'up' | 'down'
  details?: string
}

export interface ValidationChainRuntimeReadinessActionViewModel {
  dependency: ValidationChainRuntimeReadinessDependencyViewModel['name']
  summary: string
  envKeys: string[]
  commands: string[]
}

export interface ValidationChainRuntimeReadinessViewModel {
  status: 'ok' | 'degraded'
  checkedAt: string
  validationEnvironment: 'local' | 'dev' | 'staging' | 'prod'
  chainId: number
  rpcUrl: string
  arenaContractAddress: string
  validationContractAddress: string
  dependencies: ValidationChainRuntimeReadinessDependencyViewModel[]
  requiredEnvKeys: string[]
  optionalEnvKeys: string[]
  preflightCommands: string[]
  runbookPath: string
  operatorActions: ValidationChainRuntimeReadinessActionViewModel[]
}

export interface BackendRuntimeContractChecklistItemViewModel {
  id: string
  status: 'ready' | 'blocked'
  summary: string
  blockingDependencies: string[]
  commands: string[]
  operatorActions: string[]
}

export interface BackendRuntimeContractCommandSetViewModel {
  install: string[]
  dev: string[]
  typecheck: string[]
  unitTest: string[]
  integrationTest: string[]
  e2eOrSmoke: string[]
  productionBuild: string[]
  validationLocalPrepare: string[]
  databaseMigrate: string[]
  preflight: string[]
}

export type BackendValidationRehearsalStepId =
  | 'preflight'
  | 'publish_and_open'
  | 'local_bet_and_sync'
  | 'freeze_and_resolve'
  | 'projection_and_settlement'

export interface BackendValidationRehearsalStepViewModel {
  id: BackendValidationRehearsalStepId
  summary: string
  commands: string[]
  evidence: string[]
}

export interface BackendValidationRehearsalViewModel {
  status: 'ready' | 'blocked'
  targetOutcome: string
  runbookPath: string
  blockingDependencies: string[]
  steps: BackendValidationRehearsalStepViewModel[]
}

export interface BackendRuntimeContractReleaseReadinessViewModel {
  status: 'ready' | 'blocked'
  blockingDependencies: string[]
  completedGateCount: number
  totalGateCount: number
}

export interface BackendRuntimeContractViewModel {
  status: 'ok' | 'degraded'
  generatedAt: string
  environment: {
    nodeEnv: 'development' | 'test' | 'production'
    validationEnvironment: 'local' | 'dev' | 'staging' | 'prod'
    port: number
  }
  health: {
    live: HealthSnapshot
    readiness: ReadinessSnapshot
    queues: QueueOverviewSnapshot
  }
  validationChain: ValidationChainRuntimeReadinessViewModel
  validationRehearsal: BackendValidationRehearsalViewModel
  commands: BackendRuntimeContractCommandSetViewModel
  releaseReadiness: BackendRuntimeContractReleaseReadinessViewModel
  releaseChecklist: BackendRuntimeContractChecklistItemViewModel[]
  recentAlerts: InternalAuditEventViewModel[]
  operatorSummary: OperatorCurrentSummaryViewModel
}

// --- Reward audit ---

export interface InternalRewardAuditListItemViewModel {
  ledgerId: string
  propositionId: string
  propositionTitle: string
  responseId: string
  userId: string
  sourceType: RewardLedgerSourceType
  status: RewardLedgerStatus
  reviewStatus: ResponseReviewStatus | null
  pendingAmount: string
  finalAmount: string | null
  ledgerVersion: number
  reasonCode: string | null
  reversalOfLedgerId: string | null
  createdAt: string
  finalizedAt: string | null
  voidedAt: string | null
  reversedAt: string | null
  payoutId: string | null
  payoutStatus: RewardPayoutStatus | null
  payoutMethod: RewardPayoutMethod | null
  payoutAmount: string | null
  payoutAssetSymbol: string | null
  payoutDestinationAddress: string | null
  payoutRequestedAt: string | null
  payoutApprovedAt: string | null
  payoutCompletedAt: string | null
  payoutFailedAt: string | null
  payoutCancelledAt: string | null
  payoutExecutionTxHash: string | null
  payoutRetryCount: number
  payoutLastErrorCode: string | null
  payoutLastErrorMessage: string | null
}

export interface InternalRewardAuditDetailViewModel {
  ledgerId: string
  proposition: {
    id: string
    title: string
    status: PropositionStatus
  }
  response: {
    id: string
    userId: string
    isLatest: boolean
    submittedAt: string
  }
  currentReview: {
    status: ResponseReviewStatus
    qualityScore: number
    flags: string[]
    reasonCodes: string[]
    reviewedByUserId: string | null
    reviewedAt: string | null
  } | null
  payout: {
    payoutId: string
    status: RewardPayoutStatus
    method: RewardPayoutMethod
    amount: string
    assetSymbol: string
    destinationAddress: string
    requestedAt: string
    approvedAt: string | null
    approvedByUserId: string | null
    executionStartedAt: string | null
    completedAt: string | null
    failedAt: string | null
    cancelledAt: string | null
    executionTxHash: string | null
    externalReference: string | null
    retryCount: number
    lastErrorCode: string | null
    lastErrorMessage: string | null
  } | null
  chain: InternalRewardAuditListItemViewModel[]
  auditEvents: InternalAuditEventViewModel[]
}

// --- Response review workflow ---

export type ResponseReviewWorkflowState =
  | 'unclaimed'
  | 'claimed'
  | 'released'
  | 'expired'
  | 'finalized'

export interface ResponseReviewWorkflowViewModel {
  responseId: string
  reviewStatus: ResponseReviewStatus
  workflowState: ResponseReviewWorkflowState
  claimedByUserId: string | null
  claimedAt: string | null
  releasedByUserId: string | null
  releasedAt: string | null
  expiredAt: string | null
  reviewedByUserId: string | null
  reviewedAt: string | null
  finalizedReviewStatus: ResponseReviewStatus | null
  claimStaleAfterSeconds: number
  isClaimStale: boolean
}

export interface InternalResponseReviewQueueItemViewModel {
  responseId: string
  propositionId: string
  propositionTitle: string
  userId: string
  submittedAt: string
  reviewStatus: ResponseReviewStatus
  workflowState: ResponseReviewWorkflowState
  claimedByUserId: string | null
  claimedAt: string | null
  isClaimStale: boolean
  claimStaleAfterSeconds: number
}

export interface InternalResponseReviewDetailViewModel {
  response: {
    id: string
    propositionId: string
    taskId: string
    userId: string
    responseVersion: number
    isLatest: boolean
    selectedOption: number
    confirmationOption: number
    responsePayload: unknown
    understandingAck: boolean
    clientStartedAt: string
    clientSubmittedAt: string
    submittedAt: string
  }
  proposition: {
    id: string
    title: string
    category: PropositionCategory
    status: PropositionStatus
  }
  task: {
    id: string
    status: string
    assignedAt: string
    startedAt: string | null
    submittedAt: string | null
    expiresAt: string
  }
  workflow: ResponseReviewWorkflowViewModel
  currentReview: {
    status: ResponseReviewStatus
    qualityScore: number
    flags: string[]
    reasonCodes: string[]
    reviewedByUserId: string | null
    reviewedAt: string | null
  } | null
}

export interface OpsResponseQueueFilters {
  workflowState?: ResponseReviewWorkflowState
  propositionId?: string
  claimStaleOnly?: boolean
  claimedByUserId?: string
  reviewStatus?: ResponseReviewStatus
  search?: string
  sortBy?: OpsResponseQueueSortBy
  sortDirection?: InternalListSortDirection
  limit?: number
  offset?: number
}

export type OpsResponseQueueSortBy =
  | 'submittedAt'
  | 'claimedAt'
  | 'propositionTitle'
  | 'userId'
  | 'workflowState'

export type InternalResponseReviewQueuePageViewModel =
  InternalListPageViewModel<InternalResponseReviewQueueItemViewModel>

export interface OpsRewardFilters {
  propositionId?: string
  userId?: string
  responseId?: string
  status?: RewardLedgerStatus
  sourceType?: RewardLedgerSourceType
  search?: string
  sortBy?: OpsRewardSortBy
  sortDirection?: InternalListSortDirection
  limit?: number
  offset?: number
}

export type OpsRewardSortBy =
  | 'createdAt'
  | 'finalizedAt'
  | 'propositionTitle'
  | 'userId'
  | 'amount'
  | 'ledgerVersion'

export type InternalRewardAuditListPageViewModel =
  InternalListPageViewModel<InternalRewardAuditListItemViewModel>

export interface OpsAuditFilters {
  entityType?: string
  entityId?: string
  actorUserId?: string
  action?: string
  search?: string
  sortDirection?: InternalListSortDirection
  limit?: number
  offset?: number
}

// --- Validation chain command results (loose, console only surfaces status) ---

export interface ValidationChainCommandResultViewModel {
  propositionId?: string
  marketId?: string
  chainMarketId?: string
  chainPropositionId?: string
  requestStatus?: string
  attemptedAt?: string
  txHash?: string | null
  [key: string]: unknown
}

// --- Operator console request helpers ---

// Subset of PropositionStatus accepted by the internal propositions list filter.
export type OpsPropositionStatusFilter = PropositionStatus

export interface OpsPropositionFilters {
  status?: OpsPropositionStatusFilter
  category?: string
  marketEnabled?: boolean
  search?: string
  sortBy?: InternalPropositionListSortBy
  sortDirection?: InternalListSortDirection
  limit?: number
  offset?: number
}

// Validation-chain lifecycle commands keyed by proposition (high-risk, confirmed).
export type OpsValidationChainPropositionCommand =
  | 'create-market'
  | 'open-market'
  | 'freeze-market'
  | 'resolve-market'

export type InternalDiscoveryRankingCategoryLabelMap = Record<
  'all' | 'general' | 'politics' | 'sports' | 'tech' | 'research' | 'culture',
  string
>

export type InternalDiscoveryCategoryPageState = 'visible' | 'hidden' | 'deleted'

export type InternalDiscoveryCategoryKind = 'system' | 'custom'

export interface InternalDiscoveryGlobalCategoryConfigViewModel {
  slug: string
  pathname: string
  label: string
  title: string
  directoryLabel: string
  description: string
  displayOrder: number
  pageState: InternalDiscoveryCategoryPageState
  kind: InternalDiscoveryCategoryKind
  marketIdWhitelist: string[]
  invalidMarketIds: string[]
}

export interface InternalDiscoveryGlobalCategoryConfigInput {
  slug: string
  pathname?: string
  label?: string
  title?: string
  directoryLabel?: string
  description?: string
  displayOrder?: number
  pageState?: InternalDiscoveryCategoryPageState
  kind?: InternalDiscoveryCategoryKind
  marketIdWhitelist?: string[]
}

export type InternalDiscoverySecondaryCapsulePageState = 'visible' | 'hidden' | 'deleted'

export type InternalDiscoverySecondaryCapsuleKind = 'system' | 'custom'

export type InternalDiscoverySecondaryCapsuleBaseRankingId =
  | 'all'
  | 'general'
  | 'politics'
  | 'sports'
  | 'tech'
  | 'research'
  | 'culture'

export interface InternalDiscoverySecondaryCapsuleViewModel {
  id: string
  label: string
  displayOrder: number
  pageState: InternalDiscoverySecondaryCapsulePageState
  kind: InternalDiscoverySecondaryCapsuleKind
  baseRankingId: InternalDiscoverySecondaryCapsuleBaseRankingId | null
  marketIdWhitelist: string[]
  invalidMarketIds: string[]
}

export interface InternalDiscoverySecondaryCapsuleInput {
  id: string
  label?: string
  displayOrder?: number
  pageState?: InternalDiscoverySecondaryCapsulePageState
  kind?: InternalDiscoverySecondaryCapsuleKind
  baseRankingId?: InternalDiscoverySecondaryCapsuleBaseRankingId | null
  marketIdWhitelist?: string[]
}

export interface InternalDiscoveryGlobalConfigViewModel {
  categories: InternalDiscoveryGlobalCategoryConfigViewModel[]
  rankingCategoryLabels: InternalDiscoveryRankingCategoryLabelMap
  secondaryCapsules: InternalDiscoverySecondaryCapsuleViewModel[]
}

export interface InternalDiscoveryGlobalConfigInput {
  categories: InternalDiscoveryGlobalCategoryConfigInput[]
  rankingCategoryLabels: Partial<InternalDiscoveryRankingCategoryLabelMap>
  secondaryCapsules?: InternalDiscoverySecondaryCapsuleInput[]
}

export interface InternalDiscoveryCategoryConfigSummaryViewModel {
  slug: string
  pathname: string
  label: string
  title: string
  directoryLabel: string
  description: string
  sidebarItemCount: number
  configured: boolean
  pageState: InternalDiscoveryCategoryPageState
  kind: InternalDiscoveryCategoryKind
}

export interface InternalDiscoverySidebarItemViewModel {
  id: string
  label: string
  linkedMarketIds: string[]
  resolvedLinkedMarketCount: number
  invalidLinkedMarketIds: string[]
}

export interface InternalDiscoverySidebarItemInput {
  id: string
  label: string
  linkedMarketIds: string[]
}

export interface InternalDiscoveryCategoryConfigViewModel {
  slug: string
  pathname: string
  label: string
  title: string
  directoryLabel: string
  description: string
  configured: boolean
  pageState: InternalDiscoveryCategoryPageState
  kind: InternalDiscoveryCategoryKind
  availableMarkets: Array<{
    marketId: string
    title: string
  }>
  sidebarItems: InternalDiscoverySidebarItemViewModel[]
  warnings: string[]
}

export interface InternalDiscoveryCategoryConfigInput {
  sidebarItems: InternalDiscoverySidebarItemInput[]
}
