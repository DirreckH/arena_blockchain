import type {
  BinaryOption,
  MarketStatus,
  PropositionCategory,
  PropositionResultKind,
  PropositionStatus,
  PropositionVoidReason,
} from "./enums.js";
import type {
  ClosureReadinessSnapshot,
  EffectiveSampleCounterSnapshot,
  PublishedResultViewModel,
  PublicProgressViewModel,
} from "./dto.js";

export type RequesterPropositionSubmissionStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "archived";

export interface RequesterOwnedPropositionRecentItemViewModel {
  propositionId: string;
  title: string;
  category: PropositionCategory;
  status: PropositionStatus;
  submissionStatus: RequesterPropositionSubmissionStatus;
  submittedAt: string | null;
  marketEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  liveAt: string | null;
  frozenAt: string | null;
  settledAt: string | null;
  minEffectiveSample: number;
  effectiveSampleCount: number;
  reviewedResponseCount: number;
  revealSettlement: {
    resultKind: PropositionResultKind | null;
    winningOption: BinaryOption | null;
  };
}

export interface RequesterOwnedPropositionOverviewViewModel {
  userId: string;
  totals: {
    totalCount: number;
    draftCount: number;
    scheduledCount: number;
    liveCount: number;
    revealingCount: number;
    settledCount: number;
    archivedCount: number;
    unresolvedCount: number;
  };
  submissionSummary: {
    draftCount: number;
    submittedCount: number;
    approvedCount: number;
    rejectedCount: number;
    withdrawnCount: number;
    archivedCount: number;
  };
  sampleSummary: {
    totalEffectiveSampleCount: number;
    readyToFreezeCount: number;
    unresolvedAboveMinSampleCount: number;
  };
  resultSummary: {
    settledResolvedCount: number;
    settledVoidCount: number;
    unresolvedHiddenCount: number;
    latestSettled: {
      propositionId: string;
      resultKind: PropositionResultKind;
      winningOption: BinaryOption | null;
      settledAt: string;
    } | null;
  };
  marketSummary: {
    enabledCount: number;
    liveOrRevealingCount: number;
    awaitingSettlementCount: number;
  };
  recent: RequesterOwnedPropositionRecentItemViewModel[];
}

export interface RequesterOwnedPropositionAnalyticsPresetViewModel {
  presetId: string;
  name: string;
  statusScope: string;
  categories: PropositionCategory[];
  marketEnabledOnly: boolean;
}

export interface RequesterOwnedPropositionCategoryAnalyticsViewModel {
  category: PropositionCategory;
  propositionCount: number;
  settledCount: number;
  unresolvedCount: number;
  totalEffectiveSampleCount: number;
  totalReviewedResponseCount: number;
  totalBetCount: number;
  totalBetStakeAmount: string;
  uniqueTraderCount: number;
}

export interface RequesterOwnedPropositionTrendAnalyticsViewModel {
  date: string;
  createdCount: number;
  settledCount: number;
  reviewedResponseCount: number;
  effectiveSampleCount: number;
  betCount: number;
  betStakeAmount: string;
}

export interface RequesterOwnedPropositionAnalyticsViewModel {
  userId: string;
  windowDays: number;
  now: string;
  windowStartedAt: string;
  preset: RequesterOwnedPropositionAnalyticsPresetViewModel | null;
  totals: {
    createdCount: number;
    settledCount: number;
    unresolvedCount: number;
    marketEnabledCount: number;
    totalEffectiveSampleCount: number;
    totalReviewedResponseCount: number;
    totalBetCount: number;
    totalBetStakeAmount: string;
    uniqueTraderCount: number;
  };
  lifecycle: {
    averageHoursToPublish: number | null;
    averageHoursToLive: number | null;
    averageHoursToFreeze: number | null;
    averageHoursToSettle: number | null;
  };
  categoryHistory: RequesterOwnedPropositionCategoryAnalyticsViewModel[];
  trend: RequesterOwnedPropositionTrendAnalyticsViewModel[];
  delivery: {
    exportCount: number;
    latestExportAt: string | null;
    latestExportId: string | null;
  };
}

export type RequesterReportPresetStatusScope =
  | "all"
  | "settled"
  | "unresolved";

export type RequesterReportPresetExportFormat = "json";

export interface RequesterReportPresetConfigViewModel {
  windowDays: number;
  categories: PropositionCategory[];
  marketEnabledOnly: boolean;
  statusScope: RequesterReportPresetStatusScope;
  defaultExportFormat: RequesterReportPresetExportFormat;
}

export interface RequesterReportPresetViewModel {
  presetId: string;
  userId: string;
  name: string;
  description: string | null;
  config: RequesterReportPresetConfigViewModel;
  createdAt: string;
  updatedAt: string;
}

export interface RequesterReportPresetListItemViewModel {
  presetId: string;
  userId: string;
  name: string;
  description: string | null;
  updatedAt: string;
}

export interface RequesterReportPresetListViewModel {
  userId: string;
  totalCount: number;
  items: RequesterReportPresetListItemViewModel[];
}

export interface RequesterOwnedPropositionDetailViewModel {
  proposition: {
    id: string;
    title: string;
    description: string;
    optionA: string;
    optionB: string;
    category: PropositionCategory;
    status: PropositionStatus;
    marketEnabled: boolean;
    sampleConstraints: string[];
    minEffectiveSample: number;
    minBetAmount: string;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    rewardBudget: string;
    baseResponseReward: string;
    createdByUserId: string;
    updatedByUserId: string | null;
    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
    liveAt: string | null;
    frozenAt: string | null;
    revealStartedAt: string | null;
    resultComputedAt: string | null;
    settledAt: string | null;
    archivedAt: string | null;
  };
  submission: {
    status: RequesterPropositionSubmissionStatus;
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
    currentPublicProgress: PublicProgressViewModel | null;
    lastPublicResult: PublishedResultViewModel | null;
  } | null;
  sampleCounter: EffectiveSampleCounterSnapshot;
  closureReadiness: ClosureReadinessSnapshot;
  dispatchSummary: {
    totalTasks: number;
    submittedCount: number;
    uniqueAssignedUsers: number;
    lastAssignedAt: string | null;
    lastSubmittedAt: string | null;
  };
  reviewSummary: {
    totalReviews: number;
    pendingCount: number;
    finalizedCount: number;
    validCount: number;
    partialValidCount: number;
    invalidCount: number;
    fraudSuspectedCount: number;
  };
  revealSettlement: {
    propositionStatus: PropositionStatus;
    resultKind: PropositionResultKind | null;
    winningOption: BinaryOption | null;
    voidReason: PropositionVoidReason | null;
    frozenAt: string | null;
    revealStartedAt: string | null;
    resultComputedAt: string | null;
    settledAt: string | null;
    marketStatus: MarketStatus | null;
    currentPublicProgress: PublicProgressViewModel | null;
    lastPublicResult: PublishedResultViewModel | null;
  };
}

export interface RequesterOwnedSettledPropositionReportViewModel {
  proposition: {
    id: string;
    title: string;
    description: string;
    optionA: string;
    optionB: string;
    category: PropositionCategory;
    status: PropositionStatus;
    marketEnabled: boolean;
    sampleConstraints: string[];
    minEffectiveSample: number;
    minBetAmount: string;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    rewardBudget: string;
    baseResponseReward: string;
    createdByUserId: string;
    createdAt: string;
    publishedAt: string | null;
    liveAt: string | null;
    frozenAt: string | null;
    revealStartedAt: string | null;
    resultComputedAt: string | null;
    settledAt: string | null;
  };
  submission: {
    status: RequesterPropositionSubmissionStatus;
    submittedAt: string | null;
    submittedByUserId: string | null;
    submissionReason: string | null;
    submissionNote: string | null;
  };
  sample: EffectiveSampleCounterSnapshot;
  dispatchSummary: {
    totalTasks: number;
    submittedCount: number;
    uniqueAssignedUsers: number;
    lastAssignedAt: string | null;
    lastSubmittedAt: string | null;
  };
  reviewSummary: {
    totalReviews: number;
    pendingCount: number;
    finalizedCount: number;
    validCount: number;
    partialValidCount: number;
    invalidCount: number;
    fraudSuspectedCount: number;
  };
  result: {
    resultKind: PropositionResultKind;
    winningOption: BinaryOption | null;
    winningOptionLabel: string | null;
    voidReason: PropositionVoidReason | null;
    resultComputedAt: string;
    settledAt: string;
    marketStatus: MarketStatus | null;
    currentPublicProgress: PublicProgressViewModel | null;
    lastPublicResult: PublishedResultViewModel | null;
  };
  generatedAt: string;
}

export interface RequesterOwnedPropositionExportItemViewModel {
  exportId: string;
  userId: string;
  status: "completed";
  format: "json";
  requestedAt: string;
  completedAt: string;
  fileName: string;
  preset: {
    presetId: string;
    name: string;
  } | null;
  metrics: {
    settledReportCount: number;
    openLifecycleCount: number;
  };
}

export interface RequesterOwnedPropositionExportListViewModel {
  userId: string;
  totalCount: number;
  items: RequesterOwnedPropositionExportItemViewModel[];
}

export interface RequesterOwnedPropositionExportArtifactViewModel
  extends RequesterOwnedPropositionExportItemViewModel {
  preset: {
    presetId: string;
    name: string;
    statusScope: string;
    categories: PropositionCategory[];
    marketEnabledOnly: boolean;
  } | null;
  overview: RequesterOwnedPropositionOverviewViewModel;
  analytics: RequesterOwnedPropositionAnalyticsViewModel;
  reports: RequesterOwnedSettledPropositionReportViewModel[];
}

export interface RequesterComparisonSetViewModel {
  comparisonSetId: string;
  userId: string;
  name: string;
  description: string | null;
  presetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RequesterComparisonSetListItemViewModel {
  comparisonSetId: string;
  userId: string;
  name: string;
  description: string | null;
  presetIds: string[];
  updatedAt: string;
}

export interface RequesterComparisonSetListViewModel {
  userId: string;
  totalCount: number;
  items: RequesterComparisonSetListItemViewModel[];
}

export interface RequesterOwnedPropositionAnalyticsComparisonSummaryViewModel {
  presetCount: number;
  topPresetByCreatedCount: {
    presetId: string;
    createdCount: number;
  } | null;
  topPresetBySettledCount: {
    presetId: string;
    settledCount: number;
  } | null;
  topPresetByBetStakeAmount: {
    presetId: string;
    totalBetStakeAmount: string;
  } | null;
  totals: {
    createdCount: number;
    settledCount: number;
    unresolvedCount: number;
    totalEffectiveSampleCount: number;
    totalReviewedResponseCount: number;
    totalBetCount: number;
    totalBetStakeAmount: string;
    uniqueTraderCount: number;
  };
}

export interface RequesterOwnedPropositionAnalyticsComparisonItemViewModel {
  preset: RequesterOwnedPropositionAnalyticsPresetViewModel;
  analytics: RequesterOwnedPropositionAnalyticsViewModel;
}

export interface RequesterOwnedPropositionAnalyticsComparisonViewModel {
  userId: string;
  totalCount: number;
  summary: RequesterOwnedPropositionAnalyticsComparisonSummaryViewModel;
  comparisonSet?: {
    comparisonSetId: string;
    name: string;
    presetIds: string[];
  };
  items: RequesterOwnedPropositionAnalyticsComparisonItemViewModel[];
}

export type RequesterComparisonSetExportOriginType =
  | "manual"
  | "delivery_policy_manual"
  | "delivery_policy_automation";

export interface RequesterComparisonSetExportOriginViewModel {
  type: RequesterComparisonSetExportOriginType;
  policyId: string | null;
  policyName: string | null;
}

export interface RequesterOwnedComparisonSetExportItemViewModel {
  exportId: string;
  userId: string;
  status: "completed";
  format: "json";
  requestedAt: string;
  completedAt: string;
  fileName: string;
  origin: RequesterComparisonSetExportOriginViewModel;
  comparisonSet: {
    comparisonSetId: string;
    name: string;
  };
}

export interface RequesterOwnedComparisonSetExportListViewModel {
  userId: string;
  comparisonSet: {
    comparisonSetId: string;
    name: string;
  };
  totalCount: number;
  storedCount: number;
  appliedFilters: {
    origin: RequesterComparisonSetExportOriginType | null;
    policyId: string | null;
    limit: number | null;
  };
  items: RequesterOwnedComparisonSetExportItemViewModel[];
}

export interface RequesterOwnedComparisonSetExportReportRowViewModel {
  rank: number;
  preset: RequesterOwnedPropositionAnalyticsPresetViewModel;
  createdCount: number;
  settledCount: number;
  unresolvedCount: number;
  totalEffectiveSampleCount: number;
  totalReviewedResponseCount: number;
  totalBetCount: number;
  totalBetStakeAmount: string;
  uniqueTraderCount: number;
}

export interface RequesterOwnedComparisonSetExportArtifactViewModel {
  exportId: string;
  userId: string;
  status: "completed";
  format: "json";
  requestedAt: string;
  completedAt: string;
  fileName: string;
  origin: RequesterComparisonSetExportOriginViewModel;
  comparisonSet: {
    comparisonSetId: string;
    name: string;
    presetIds: string[];
  };
  totalCount: number;
  summary: RequesterOwnedPropositionAnalyticsComparisonSummaryViewModel;
  report: {
    generatedAt: string;
    presetCount: number;
    totals: RequesterOwnedPropositionAnalyticsComparisonSummaryViewModel["totals"];
    leaders: {
      byCreatedCount: {
        presetId: string;
        name: string;
        createdCount: number;
      } | null;
      bySettledCount: {
        presetId: string;
        name: string;
        settledCount: number;
      } | null;
      byBetStakeAmount: {
        presetId: string;
        name: string;
        totalBetStakeAmount: string;
      } | null;
    };
    rows: RequesterOwnedComparisonSetExportReportRowViewModel[];
  };
  items: RequesterOwnedPropositionAnalyticsComparisonItemViewModel[];
}

export interface DeleteOwnedComparisonSetExportResultViewModel {
  userId: string;
  comparisonSetId: string;
  exportId: string;
  deleted: true;
}

export type RequesterComparisonSetDeliveryCadence = "daily";

export type RequesterComparisonSetDeliveryPolicyRunStatus =
  | "completed"
  | "failed";

export interface RequesterComparisonSetDeliveryPolicyErrorViewModel {
  code: string;
  message: string;
}

export interface RequesterComparisonSetDeliveryWebhookTransportConfig {
  type: "webhook";
  targetUrl: string;
  credentialKey?: string | null;
}

export type RequesterComparisonSetDeliveryTransportConfig =
  | RequesterComparisonSetDeliveryWebhookTransportConfig;

export interface CreateRequesterComparisonSetDeliveryPolicyInputViewModel {
  name: string;
  description?: string;
  cadence: RequesterComparisonSetDeliveryCadence;
  nextRunAt: string;
  enabled: boolean;
  retainedExportCount?: number;
  transport?: RequesterComparisonSetDeliveryTransportConfig | null;
}

export interface UpdateRequesterComparisonSetDeliveryPolicyInputViewModel {
  name?: string;
  description?: string;
  cadence?: RequesterComparisonSetDeliveryCadence;
  nextRunAt?: string;
  enabled?: boolean;
  retainedExportCount?: number;
  transport?: RequesterComparisonSetDeliveryTransportConfig | null;
}

export interface RequesterComparisonSetDeliveryPolicyViewModel {
  policyId: string;
  userId: string;
  comparisonSetId: string;
  name: string;
  description: string | null;
  cadence: RequesterComparisonSetDeliveryCadence;
  nextRunAt: string;
  lastRunAt: string | null;
  lastRunStatus: RequesterComparisonSetDeliveryPolicyRunStatus | null;
  lastRunError: RequesterComparisonSetDeliveryPolicyErrorViewModel | null;
  enabled: boolean;
  retainedExportCount: number;
  transport: RequesterComparisonSetDeliveryTransportConfig | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequesterComparisonSetDeliveryPolicyListViewModel {
  userId: string;
  comparisonSetId: string;
  totalCount: number;
  items: RequesterComparisonSetDeliveryPolicyViewModel[];
}

export interface DeleteRequesterComparisonSetDeliveryPolicyResultViewModel {
  userId: string;
  comparisonSetId: string;
  policyId: string;
  deleted: true;
}

export type RequesterComparisonSetDeliveryRunTriggerType =
  | "manual"
  | "automation";

export type RequesterComparisonSetDeliveryRunReplayFilter =
  | "all"
  | "fresh_only"
  | "replayed_only";

export interface RequesterComparisonSetDeliveryRunOriginViewModel {
  type:
    | "delivery_policy_manual"
    | "delivery_policy_automation";
  policyId: string;
  policyName: string | null;
}

export interface RequesterComparisonSetDeliveryRunViewModel {
  runId: string;
  userId: string;
  comparisonSetId: string;
  policyId: string;
  retriedRunId: string | null;
  triggerType: RequesterComparisonSetDeliveryRunTriggerType;
  status: RequesterComparisonSetDeliveryPolicyRunStatus;
  startedAt: string;
  completedAt: string;
  exportId: string | null;
  retainedExportAvailable: boolean;
  origin: RequesterComparisonSetDeliveryRunOriginViewModel;
  delivery: RequesterComparisonSetDeliveryTransportResultViewModel | null;
  error: RequesterComparisonSetDeliveryPolicyErrorViewModel | null;
}

export interface RequesterComparisonSetDeliveryRunListViewModel {
  userId: string;
  comparisonSetId: string;
  policyId: string;
  totalCount: number;
  storedCount: number;
  appliedFilters: {
    status: RequesterComparisonSetDeliveryPolicyRunStatus | null;
    triggerType: RequesterComparisonSetDeliveryRunTriggerType | null;
    replay: RequesterComparisonSetDeliveryRunReplayFilter;
    limit: number | null;
  };
  items: RequesterComparisonSetDeliveryRunViewModel[];
}

export interface RequesterComparisonSetDeliveryTransportResultViewModel {
  deliveredAt: string;
  statusCode: number;
  authentication: {
    kind: "none" | "bearer";
    credentialKey: string | null;
  };
}

export interface RequesterComparisonSetDeliveryPolicyRunResultViewModel {
  policy: {
    policyId: string;
    comparisonSetId: string;
    name: string;
    cadence: RequesterComparisonSetDeliveryCadence;
    enabled: boolean;
    lastRunAt: string | null;
    lastRunStatus: RequesterComparisonSetDeliveryPolicyRunStatus | null;
    lastRunError: RequesterComparisonSetDeliveryPolicyErrorViewModel | null;
    nextRunAt: string;
  };
  run: RequesterComparisonSetDeliveryRunViewModel;
  export: RequesterOwnedComparisonSetExportArtifactViewModel;
  delivery: RequesterComparisonSetDeliveryTransportResultViewModel | null;
}

export interface RequesterComparisonSetDeliveryRunRetryResultViewModel
  extends RequesterComparisonSetDeliveryPolicyRunResultViewModel {
  retriedRunId: string;
  retryRunId: string;
}

export interface RequesterComparisonSetDeliveryPolicyHealthViewModel {
  policy: RequesterComparisonSetDeliveryPolicyViewModel;
  health: {
    status: "scheduled" | "due" | "failing" | "disabled";
    checkedAt: string;
    isDue: boolean;
    lagSeconds: number;
    consecutiveFailureCount: number;
    lastCompletedRunAt: string | null;
    lastFailedRunAt: string | null;
    latestRun: RequesterComparisonSetDeliveryRunViewModel | null;
    runCounts: {
      totalCount: number;
      completedCount: number;
      failedCount: number;
    };
    transport: {
      status: "ready" | "blocked";
      blockingReason: "transport_credential_missing" | null;
      credentialKey: string | null;
    };
  };
}
