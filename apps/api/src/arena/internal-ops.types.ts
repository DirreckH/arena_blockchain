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

export interface InternalPropositionListFilters {
  status?: PropositionStatus;
  submissionStatus?: PropositionSubmissionStatus;
  category?: PropositionCategory;
  marketEnabled?: boolean;
  createdFrom?: string;
  createdTo?: string;
}

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

export type PropositionValidationLifecycleViewModel =
  ValidationLifecycleSnapshotViewModel;

export interface PropositionValidationChainActivityViewModel {
  timeline: InternalAuditEventViewModel[];
  marketAuditEvents: InternalAuditEventViewModel[];
  commandAuditEvents: InternalAuditEventViewModel[];
  eventAuditEvents: InternalAuditEventViewModel[];
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
  sampleCounter: EffectiveSampleCounterSnapshot;
  closureReadiness: ClosureReadinessSnapshot;
  dispatchSummary: PropositionDispatchSummaryViewModel;
  reviewSummary: PropositionReviewSummaryViewModel;
  rewardSummary: PropositionRewardSummaryViewModel;
  revealSettlement: PropositionRevealSettlementViewModel;
  auditEvents: InternalAuditEventViewModel[];
  rewardAuditEvents: InternalAuditEventViewModel[];
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
  chainSyncedAt: string | null;
  publishedAt: string | null;
  liveAt: string | null;
  frozenAt: string | null;
  revealStartedAt: string | null;
  resultComputedAt: string | null;
  settledAt: string | null;
  driftReason: ValidationLifecycleDriftReason;
}

export interface ValidationChainHealthAlertViewModel {
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  metadata: unknown;
  createdAt: string;
}

export interface ValidationChainStalePayoutMarketViewModel {
  marketId: string;
  propositionId: string;
  chainStatus: ValidationChainMarketStatus;
  terminalAt: string;
  unclaimedBetCount: number;
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

export interface ValidationChainFailureViewModel {
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  metadata: unknown;
  createdAt: string;
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
  recentAlerts: ValidationChainHealthAlertViewModel[];
  metrics: {
    recentRetryExhaustedCount: number;
    recentTerminalCommandCount: number;
    recentSyncFailureCount: number;
    recentProjectorEntityMissingCount: number;
    stalePayoutMarketCount: number;
  };
  eventLedger: {
    totalEventCount: number;
    duplicateRows: ValidationChainDuplicateEventViewModel[];
    recentEvents: ValidationChainRecentEventViewModel[];
  };
  projection: {
    latestMarket: ValidationChainLatestMarketProjectionViewModel | null;
    latestBet: ValidationChainLatestBetProjectionViewModel | null;
  };
  failures: {
    projectorFailuresCount: number;
    syncFailuresCount: number;
    recentFailures: ValidationChainFailureViewModel[];
  };
  stalePayoutMarkets: ValidationChainStalePayoutMarketViewModel[];
}

export interface RewardAuditListFilters {
  propositionId?: string;
  userId?: string;
  responseId?: string;
  status?: RewardLedgerStatus;
  sourceType?: RewardLedgerSourceType;
}

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
}

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
  chain: InternalRewardAuditListItemViewModel[];
  auditEvents: InternalAuditEventViewModel[];
}
