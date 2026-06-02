import { Injectable } from "@nestjs/common";
import type {
  Market,
  MarketStatus,
  Proposition,
  PropositionCategory,
  PropositionStatus,
  PropositionResultKind,
  PropositionVoidReason,
  RewardLedger as PrismaRewardLedger,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "@prisma/client";
import {
  ArenaDomainError,
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import { ArenaIdService } from "../arena-id.service";
import type {
  ClosureReadinessSnapshot,
  EffectiveSampleCounterSnapshot,
} from "../arena.types";
import { INTERNAL_AUDIT_ENTITY_TYPES } from "../internal-ops.types";
import {
  buildPropositionSubmissionSnapshot,
  type PropositionSubmissionStatus,
} from "../proposition-submission";
import { withArenaTransaction } from "../arena-transaction.utils";
import type { ArenaDbClient } from "../prisma.types";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { RewardLedgerRepository } from "../repositories/reward-ledger.repository";
import { BetRepository } from "../repositories/bet.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";
import { InternalAuditService } from "./internal-audit.service";
import {
  RequesterComparisonSetDeliveryPolicyService,
  type RequesterComparisonSetDeliveryPolicyViewModel,
} from "./requester-comparison-set-delivery-policy.service";
import { RequesterComparisonSetDeliveryTransportService } from "./requester-comparison-set-delivery-transport.service";
import type { RequesterComparisonSetDeliveryTransportResult } from "./requester-comparison-set-delivery-transport.types";
import {
  RequesterComparisonSetDeliveryRunService,
  type RequesterComparisonSetDeliveryRunReplayFilter,
  type RequesterComparisonSetDeliveryRunViewModel,
  type RequesterComparisonSetDeliveryRunStatus,
  type RequesterComparisonSetDeliveryRunTriggerType,
} from "./requester-comparison-set-delivery-run.service";
import { RequesterComparisonSetService } from "./requester-comparison-set.service";
import { EffectiveSampleCounterService } from "./effective-sample-counter.service";
import { FreezeRevealOrchestratorService } from "./freeze-reveal-orchestrator.service";
import {
  type RequesterReportPresetConfig,
  type RequesterReportPresetViewModel,
  RequesterReportPresetService,
} from "./requester-report-preset.service";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

const REQUESTER_EXPORT_NAMESPACE = "arena.requester.exports";
const REQUESTER_COMPARISON_SET_EXPORT_NAMESPACE =
  "arena.requester.comparison_set_exports";
const DEFAULT_ANALYTICS_WINDOW_DAYS = 30;
const REQUESTER_EXPORT_FORMATS = ["json", "csv"] as const;
const REQUESTER_COMPARISON_SET_EXPORT_ORIGIN_TYPES = [
  "manual",
  "delivery_policy_manual",
  "delivery_policy_automation",
] as const;

const toAmountBigInt = (value: string | null | undefined): bigint =>
  BigInt(value ?? "0");

const toAmountString = (value: bigint): string => value.toString();

const toEffectiveBudgetTimestamp = (ledger: PrismaRewardLedger): Date =>
  ledger.reversedAt ??
  ledger.finalizedAt ??
  ledger.voidedAt ??
  ledger.createdAt;

const getBudgetEntryType = (
  ledger: PrismaRewardLedger,
): RequesterBudgetLedgerEntryType => {
  switch (ledger.status) {
    case "pending":
      return "reserved";
    case "finalized":
      return "spent";
    case "voided":
      return "released";
    case "reversed":
    default:
      return "adjusted";
  }
};

const getReservedBudgetAmount = (ledger: PrismaRewardLedger): bigint =>
  ledger.status === "pending" ? toAmountBigInt(ledger.pendingAmount) : 0n;

const getSpentBudgetAmount = (ledger: PrismaRewardLedger): bigint =>
  ledger.status === "finalized" ? toAmountBigInt(ledger.finalAmount) : 0n;

const getReleasedBudgetAmount = (ledger: PrismaRewardLedger): bigint => {
  if (ledger.status === "voided") {
    return toAmountBigInt(ledger.pendingAmount);
  }

  if (ledger.status === "finalized") {
    return (
      toAmountBigInt(ledger.pendingAmount) - toAmountBigInt(ledger.finalAmount)
    );
  }

  return 0n;
};

const getAdjustedBudgetAmount = (ledger: PrismaRewardLedger): bigint =>
  ledger.status === "reversed"
    ? ledger.finalAmount !== null
      ? toAmountBigInt(ledger.finalAmount)
      : toAmountBigInt(ledger.pendingAmount)
    : 0n;

type RequesterExportFormat = (typeof REQUESTER_EXPORT_FORMATS)[number];
type RequesterComparisonSetExportOriginType =
  (typeof REQUESTER_COMPARISON_SET_EXPORT_ORIGIN_TYPES)[number];
type RequesterSerializedArtifactViewModel = {
  mediaType: "application/json" | "text/csv";
  fileName: string;
  content: string;
};

interface ListOwnedPropositionsInput {
  userId: string;
}

interface GetOwnedPropositionOverviewInput {
  userId: string;
}

interface GetOwnedPropositionAnalyticsInput {
  userId: string;
  windowDays?: number;
  now?: string;
  presetId?: string;
}

interface CompareOwnedPropositionAnalyticsInput {
  userId: string;
  presetIds: string[];
  now?: string;
}

interface GetOwnedComparisonSetAnalyticsInput {
  userId: string;
  comparisonSetId: string;
  now?: string;
}

interface ListOwnedComparisonSetExportsInput {
  userId: string;
  comparisonSetId: string;
  origin?: RequesterComparisonSetExportOriginType;
  policyId?: string;
  limit?: number;
}

interface GetOwnedComparisonSetExportInput {
  userId: string;
  comparisonSetId: string;
  exportId: string;
}

interface DeleteOwnedComparisonSetExportInput {
  userId: string;
  comparisonSetId: string;
  exportId: string;
}

interface CreateOwnedComparisonSetExportInput {
  userId: string;
  comparisonSetId: string;
  format?: RequesterExportFormat;
  now?: string;
  origin?: Partial<RequesterComparisonSetExportOriginViewModel>;
  retainedExportCount?: number;
}

interface DeleteOwnedComparisonSetExportResult {
  userId: string;
  comparisonSetId: string;
  exportId: string;
  deleted: true;
}

interface RunOwnedComparisonSetDeliveryPolicyInput {
  userId: string;
  comparisonSetId: string;
  policyId: string;
}

interface RetryOwnedComparisonSetDeliveryPolicyRunInput {
  userId: string;
  comparisonSetId: string;
  policyId: string;
  runId: string;
}

interface GetOwnedComparisonSetDeliveryPolicyHealthInput {
  userId: string;
  comparisonSetId: string;
  policyId: string;
  now?: string;
}

interface ListOwnedComparisonSetDeliveryPolicyRunsInput {
  userId: string;
  comparisonSetId: string;
  policyId: string;
  status?: RequesterComparisonSetDeliveryRunStatus;
  triggerType?: RequesterComparisonSetDeliveryRunTriggerType;
  replay?: RequesterComparisonSetDeliveryRunReplayFilter;
  limit?: number;
}

interface GetOwnedPropositionDetailInput {
  propositionId: string;
  userId: string;
}

interface GetOwnedPropositionReportInput {
  propositionId: string;
  userId: string;
}

interface GetOwnedPropositionBudgetLedgerInput {
  propositionId: string;
  userId: string;
}

interface ListOwnedPropositionExportsInput {
  userId: string;
}

interface GetOwnedPropositionExportInput {
  userId: string;
  exportId: string;
}

interface CreateOwnedPropositionExportInput {
  userId: string;
  format?: RequesterExportFormat;
  analyticsWindowDays?: number;
  analyticsNow?: string;
  presetId?: string;
}

export interface RequesterOwnedPropositionListItemViewModel {
  propositionId: string;
  title: string;
  category: PropositionCategory;
  status: PropositionStatus;
  submissionStatus: PropositionSubmissionStatus;
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
}

type RequesterBudgetLedgerEntryType =
  | "reserved"
  | "spent"
  | "released"
  | "adjusted";

interface RequesterPropositionBudgetSummaryViewModel {
  configuredAmount: string;
  reservedAmount: string;
  spentAmount: string;
  remainingAmount: string;
  releasedAmount: string;
  adjustedAmount: string;
  currentEntryCount: number;
  pendingEntryCount: number;
  finalizedEntryCount: number;
  voidedEntryCount: number;
  adjustedEntryCount: number;
  lastEventAt: string | null;
}

interface RequesterPropositionBudgetLedgerEntryViewModel {
  entryId: string;
  entryType: RequesterBudgetLedgerEntryType;
  ledgerStatus: PrismaRewardLedger["status"];
  reviewStatus: PrismaRewardLedger["reviewStatus"];
  pendingAmount: string;
  finalAmount: string | null;
  reservedAmount: string;
  spentAmount: string;
  releasedAmount: string;
  adjustedAmount: string;
  reasonCode: PrismaRewardLedger["reasonCode"];
  createdAt: string;
  effectiveAt: string;
  finalizedAt: string | null;
  voidedAt: string | null;
  reversedAt: string | null;
  ledgerVersion: number;
  isCurrent: boolean;
}

interface RequesterPropositionBudgetLedgerViewModel {
  propositionId: string;
  summary: RequesterPropositionBudgetSummaryViewModel;
  items: RequesterPropositionBudgetLedgerEntryViewModel[];
}

interface RequesterOwnedPropositionOverviewViewModel {
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
      winningOption: number | null;
      settledAt: string;
    } | null;
  };
  marketSummary: {
    enabledCount: number;
    liveOrRevealingCount: number;
    awaitingSettlementCount: number;
  };
  budgetSummary: RequesterPropositionBudgetSummaryViewModel;
  recent: Array<
    RequesterOwnedPropositionListItemViewModel & {
      revealSettlement: {
        resultKind: PropositionResultKind | null;
        winningOption: number | null;
      };
    }
  >;
}

interface RequesterOwnedPropositionAnalyticsViewModel {
  userId: string;
  windowDays: number;
  now: string;
  windowStartedAt: string;
  preset: {
    presetId: string;
    name: string;
    statusScope: string;
    categories: PropositionCategory[];
    marketEnabledOnly: boolean;
  } | null;
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
  categoryHistory: Array<{
    category: PropositionCategory;
    propositionCount: number;
    settledCount: number;
    unresolvedCount: number;
    totalEffectiveSampleCount: number;
    totalReviewedResponseCount: number;
    totalBetCount: number;
    totalBetStakeAmount: string;
    uniqueTraderCount: number;
  }>;
  trend: Array<{
    date: string;
    createdCount: number;
    settledCount: number;
    reviewedResponseCount: number;
    effectiveSampleCount: number;
    betCount: number;
    betStakeAmount: string;
  }>;
  delivery: {
    exportCount: number;
    latestExportAt: string | null;
    latestExportId: string | null;
  };
}

interface RequesterOwnedPropositionAnalyticsComparisonViewModel {
  userId: string;
  totalCount: number;
  summary: {
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
  };
  comparisonSet?: {
    comparisonSetId: string;
    name: string;
    presetIds: string[];
  };
  items: Array<{
    preset: {
      presetId: string;
      name: string;
      statusScope: string;
      categories: PropositionCategory[];
      marketEnabledOnly: boolean;
    };
    analytics: RequesterOwnedPropositionAnalyticsViewModel;
  }>;
}

interface RequesterOwnedComparisonSetExportItemViewModel {
  exportId: string;
  userId: string;
  status: "completed";
  format: RequesterExportFormat;
  requestedAt: string;
  completedAt: string;
  fileName: string;
  origin: RequesterComparisonSetExportOriginViewModel;
  comparisonSet: {
    comparisonSetId: string;
    name: string;
  };
}

interface RequesterComparisonSetExportOriginViewModel {
  type: RequesterComparisonSetExportOriginType;
  policyId: string | null;
  policyName: string | null;
}

interface RequesterOwnedComparisonSetExportListViewModel {
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

export interface RequesterOwnedComparisonSetExportArtifactViewModel {
  exportId: string;
  userId: string;
  status: "completed";
  format: RequesterExportFormat;
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
  summary: RequesterOwnedPropositionAnalyticsComparisonViewModel["summary"];
  serialized: RequesterSerializedArtifactViewModel;
  report: {
    generatedAt: string;
    presetCount: number;
    totals: RequesterOwnedPropositionAnalyticsComparisonViewModel["summary"]["totals"];
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
    rows: Array<{
      rank: number;
      preset: {
        presetId: string;
        name: string;
        statusScope: string;
        categories: PropositionCategory[];
        marketEnabledOnly: boolean;
      };
      createdCount: number;
      settledCount: number;
      unresolvedCount: number;
      totalEffectiveSampleCount: number;
      totalReviewedResponseCount: number;
      totalBetCount: number;
      totalBetStakeAmount: string;
      uniqueTraderCount: number;
    }>;
  };
  items: RequesterOwnedPropositionAnalyticsComparisonViewModel["items"];
}

interface RequesterOwnedComparisonSetDeliveryPolicyRunViewModel {
  policy: {
    policyId: string;
    comparisonSetId: string;
    name: string;
    cadence: string;
    enabled: boolean;
    lastRunAt: string | null;
    lastRunStatus: "completed" | "failed" | null;
    lastRunError: {
      code: string;
      message: string;
    } | null;
    nextRunAt: string;
  };
  run: RequesterComparisonSetDeliveryRunViewModel;
  export: RequesterOwnedComparisonSetExportArtifactViewModel;
  delivery: RequesterComparisonSetDeliveryTransportResult | null;
}

interface RetryOwnedComparisonSetDeliveryPolicyRunResultViewModel {
  retriedRunId: string;
  retryRunId: string;
  policy: {
    policyId: string;
    comparisonSetId: string;
    name: string;
    cadence: string;
    enabled: boolean;
    lastRunAt: string | null;
    lastRunStatus: "completed" | "failed" | null;
    lastRunError: {
      code: string;
      message: string;
    } | null;
    nextRunAt: string;
  };
  run: RequesterComparisonSetDeliveryRunViewModel;
  export: RequesterOwnedComparisonSetExportArtifactViewModel;
  delivery: RequesterComparisonSetDeliveryTransportResult | null;
}

interface RequesterOwnedComparisonSetDeliveryPolicyHealthViewModel {
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

interface RequesterOwnedPropositionDetailViewModel {
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
    currentPublicProgress: unknown;
    lastPublicResult: unknown;
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
  budgetSummary: RequesterPropositionBudgetSummaryViewModel;
  revealSettlement: {
    propositionStatus: PropositionStatus;
    resultKind: PropositionResultKind | null;
    winningOption: number | null;
    voidReason: PropositionVoidReason | null;
    frozenAt: string | null;
    revealStartedAt: string | null;
    resultComputedAt: string | null;
    settledAt: string | null;
    marketStatus: MarketStatus | null;
    currentPublicProgress: unknown;
    lastPublicResult: unknown;
  };
}

interface RequesterOwnedSettledPropositionReportViewModel {
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
    status: PropositionSubmissionStatus;
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
  budgetSummary: RequesterPropositionBudgetSummaryViewModel;
  result: {
    resultKind: PropositionResultKind;
    winningOption: number | null;
    winningOptionLabel: string | null;
    voidReason: PropositionVoidReason | null;
    resultComputedAt: string;
    settledAt: string;
    marketStatus: MarketStatus | null;
    currentPublicProgress: unknown;
    lastPublicResult: unknown;
  };
  generatedAt: string;
}

interface RequesterOwnedPropositionExportItemViewModel {
  exportId: string;
  userId: string;
  status: "completed";
  format: RequesterExportFormat;
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

interface RequesterOwnedPropositionExportListViewModel {
  userId: string;
  totalCount: number;
  items: RequesterOwnedPropositionExportItemViewModel[];
}

interface RequesterOwnedPropositionExportArtifactViewModel {
  exportId: string;
  userId: string;
  status: "completed";
  format: RequesterExportFormat;
  requestedAt: string;
  completedAt: string;
  fileName: string;
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
  serialized: RequesterSerializedArtifactViewModel;
  metrics: {
    settledReportCount: number;
    openLifecycleCount: number;
  };
}

type StoredRequesterExportRecord = {
  exportId: string;
  userId: string;
  status: "completed";
  format: RequesterExportFormat;
  requestedAt: string;
  completedAt: string;
  fileName: string;
  serialized?: RequesterSerializedArtifactViewModel;
  preset?: {
    presetId: string;
    name: string;
    statusScope: string;
    categories: PropositionCategory[];
    marketEnabledOnly: boolean;
  } | null;
  overview: RequesterOwnedPropositionOverviewViewModel;
  analytics?: RequesterOwnedPropositionAnalyticsViewModel;
  reports: RequesterOwnedSettledPropositionReportViewModel[];
};

type StoredRequesterComparisonSetExportRecord = {
  exportId: string;
  userId: string;
  status: "completed";
  format: RequesterExportFormat;
  requestedAt: string;
  completedAt: string;
  fileName: string;
  serialized?: RequesterSerializedArtifactViewModel;
  origin: RequesterComparisonSetExportOriginViewModel;
  comparisonSet: {
    comparisonSetId: string;
    name: string;
    presetIds: string[];
  };
  totalCount: number;
  summary: RequesterOwnedPropositionAnalyticsComparisonViewModel["summary"];
  report?: RequesterOwnedComparisonSetExportArtifactViewModel["report"];
  items: RequesterOwnedPropositionAnalyticsComparisonViewModel["items"];
};

type OwnedPropositionSnapshot = {
  proposition: Proposition;
  market: Market | null;
  submission: ReturnType<typeof buildPropositionSubmissionSnapshot>;
  counter: EffectiveSampleCounterSnapshot;
  closureReadiness: ClosureReadinessSnapshot;
  listItem: RequesterOwnedPropositionListItemViewModel;
};

type DateBucketEntry = {
  createdCount: number;
  settledCount: number;
  reviewedResponseCount: number;
  effectiveSampleCount: number;
  betCount: number;
  betStakeAmount: bigint;
};

type CategoryAnalyticsBucket = {
  category: PropositionCategory;
  propositionCount: number;
  settledCount: number;
  unresolvedCount: number;
  totalEffectiveSampleCount: number;
  totalReviewedResponseCount: number;
  totalBetCount: number;
  totalBetStakeAmount: bigint;
  uniqueTraderIds: Set<string>;
};

type ComparisonSummaryInput = {
  items: RequesterOwnedPropositionAnalyticsComparisonViewModel["items"];
  uniqueTraderCount: number;
};

type BuiltOwnedPropositionAnalytics = {
  analytics: RequesterOwnedPropositionAnalyticsViewModel;
  uniqueTraderIds: Set<string>;
};

function isRequesterExportFormat(value: unknown): value is RequesterExportFormat {
  return (
    typeof value === "string" &&
    (REQUESTER_EXPORT_FORMATS as readonly string[]).includes(value)
  );
}

function normalizeStoredSerializedRequesterArtifact(
  value: unknown,
): RequesterSerializedArtifactViewModel | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RequesterSerializedArtifactViewModel>;
  if (
    (candidate.mediaType !== "application/json" &&
      candidate.mediaType !== "text/csv") ||
    typeof candidate.fileName !== "string" ||
    typeof candidate.content !== "string"
  ) {
    return null;
  }

  return {
    mediaType: candidate.mediaType,
    fileName: candidate.fileName,
    content: candidate.content,
  };
}

function serializeJsonArtifact(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\r\n]/u.test(text)) {
    return `"${text.replace(/"/gu, "\"\"")}"`;
  }

  return text;
}

function toCsvRow(values: unknown[]): string {
  return values.map((value) => escapeCsvCell(value)).join(",");
}

function parseStoredRequesterExports(value: unknown): StoredRequesterExportRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        typeof (item as { exportId?: unknown }).exportId !== "string" ||
        typeof (item as { userId?: unknown }).userId !== "string" ||
        typeof (item as { status?: unknown }).status !== "string" ||
        !isRequesterExportFormat((item as { format?: unknown }).format) ||
        typeof (item as { requestedAt?: unknown }).requestedAt !== "string" ||
        typeof (item as { completedAt?: unknown }).completedAt !== "string" ||
        typeof (item as { fileName?: unknown }).fileName !== "string" ||
        !Array.isArray((item as { reports?: unknown[] }).reports) ||
        !("overview" in (item as Record<string, unknown>))
      ) {
        return null;
      }

      const record = item as Partial<StoredRequesterExportRecord>;
      return {
        exportId: record.exportId!,
        userId: record.userId!,
        status: "completed",
        format: record.format!,
        requestedAt: record.requestedAt!,
        completedAt: record.completedAt!,
        fileName: record.fileName!,
        serialized:
          normalizeStoredSerializedRequesterArtifact(record.serialized) ??
          undefined,
        preset:
          record.preset && typeof record.preset === "object"
            ? structuredClone(record.preset)
            : null,
        overview: structuredClone(record.overview),
        analytics: record.analytics ? structuredClone(record.analytics) : undefined,
        reports: structuredClone(record.reports ?? []),
      } as StoredRequesterExportRecord;
    })
    .filter(
      (record): record is StoredRequesterExportRecord => record !== null,
    )
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
}

function cloneStoredRequesterExports(
  records: StoredRequesterExportRecord[],
): StoredRequesterExportRecord[] {
  return structuredClone(records);
}

function buildComparisonSetExportOrigin(
  value?: Partial<RequesterComparisonSetExportOriginViewModel> | null,
): RequesterComparisonSetExportOriginViewModel {
  const type =
    value?.type &&
    REQUESTER_COMPARISON_SET_EXPORT_ORIGIN_TYPES.includes(value.type)
      ? value.type
      : "manual";

  if (type === "manual") {
    return {
      type,
      policyId: null,
      policyName: null,
    };
  }

  return {
    type,
    policyId:
      typeof value?.policyId === "string" && value.policyId.trim().length > 0
        ? value.policyId
        : null,
    policyName:
      typeof value?.policyName === "string" &&
      value.policyName.trim().length > 0
        ? value.policyName
        : null,
  };
}

function normalizeStoredRequesterComparisonSetExport(
  value: unknown,
): StoredRequesterComparisonSetExportRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<StoredRequesterComparisonSetExportRecord>;
  if (
    typeof record.exportId !== "string" ||
    typeof record.userId !== "string" ||
    record.status !== "completed" ||
    !isRequesterExportFormat(record.format) ||
    typeof record.requestedAt !== "string" ||
    typeof record.completedAt !== "string" ||
    typeof record.fileName !== "string" ||
    typeof record.totalCount !== "number" ||
    !Array.isArray(record.items) ||
    !record.comparisonSet ||
    typeof record.comparisonSet !== "object" ||
    typeof record.comparisonSet.comparisonSetId !== "string" ||
    typeof record.comparisonSet.name !== "string" ||
    !Array.isArray(record.comparisonSet.presetIds)
  ) {
    return null;
  }

  return {
    exportId: record.exportId,
    userId: record.userId,
    status: "completed",
    format: record.format,
    requestedAt: record.requestedAt,
    completedAt: record.completedAt,
    fileName: record.fileName,
    serialized:
      normalizeStoredSerializedRequesterArtifact(record.serialized) ??
      undefined,
    origin: buildComparisonSetExportOrigin(record.origin),
    comparisonSet: {
      comparisonSetId: record.comparisonSet.comparisonSetId,
      name: record.comparisonSet.name,
      presetIds: structuredClone(record.comparisonSet.presetIds),
    },
    totalCount: record.totalCount,
    summary: normalizeStoredComparisonSummary(record.summary, record.items),
    report: normalizeStoredComparisonSetReport(
      record.report,
      {
        completedAt: record.completedAt,
        items: record.items,
      },
    ),
    items: structuredClone(record.items),
  };
}

function buildComparisonSetExportReport(
  input: {
    generatedAt: string;
    items: RequesterOwnedPropositionAnalyticsComparisonViewModel["items"];
    summary: RequesterOwnedPropositionAnalyticsComparisonViewModel["summary"];
  },
): RequesterOwnedComparisonSetExportArtifactViewModel["report"] {
  const rows = [...input.items]
    .map((item) => ({
      preset: structuredClone(item.preset),
      createdCount: item.analytics.totals.createdCount,
      settledCount: item.analytics.totals.settledCount,
      unresolvedCount: item.analytics.totals.unresolvedCount,
      totalEffectiveSampleCount: item.analytics.totals.totalEffectiveSampleCount,
      totalReviewedResponseCount: item.analytics.totals.totalReviewedResponseCount,
      totalBetCount: item.analytics.totals.totalBetCount,
      totalBetStakeAmount: item.analytics.totals.totalBetStakeAmount,
      uniqueTraderCount: item.analytics.totals.uniqueTraderCount,
    }))
    .sort((left, right) => {
      const createdDiff = right.createdCount - left.createdCount;
      if (createdDiff !== 0) {
        return createdDiff;
      }

      const settledDiff = right.settledCount - left.settledCount;
      if (settledDiff !== 0) {
        return settledDiff;
      }

      const stakeDiff =
        BigInt(right.totalBetStakeAmount) - BigInt(left.totalBetStakeAmount);
      if (stakeDiff !== 0n) {
        return stakeDiff > 0n ? 1 : -1;
      }

      return left.preset.presetId.localeCompare(right.preset.presetId);
    })
    .map((row, index) => ({
      rank: index + 1,
      ...row,
    }));
  const namesByPresetId = new Map(
    input.items.map((item) => [item.preset.presetId, item.preset.name] as const),
  );

  return {
    generatedAt: input.generatedAt,
    presetCount: input.summary.presetCount,
    totals: structuredClone(input.summary.totals),
    leaders: {
      byCreatedCount: input.summary.topPresetByCreatedCount
        ? {
            ...input.summary.topPresetByCreatedCount,
            name:
              namesByPresetId.get(
                input.summary.topPresetByCreatedCount.presetId,
              ) ?? input.summary.topPresetByCreatedCount.presetId,
          }
        : null,
      bySettledCount: input.summary.topPresetBySettledCount
        ? {
            ...input.summary.topPresetBySettledCount,
            name:
              namesByPresetId.get(
                input.summary.topPresetBySettledCount.presetId,
              ) ?? input.summary.topPresetBySettledCount.presetId,
          }
        : null,
      byBetStakeAmount: input.summary.topPresetByBetStakeAmount
        ? {
            ...input.summary.topPresetByBetStakeAmount,
            name:
              namesByPresetId.get(
                input.summary.topPresetByBetStakeAmount.presetId,
              ) ?? input.summary.topPresetByBetStakeAmount.presetId,
          }
        : null,
    },
    rows,
  };
}

function normalizeStoredComparisonSetReport(
  value: unknown,
  input: {
    completedAt: string;
    items: RequesterOwnedPropositionAnalyticsComparisonViewModel["items"];
  },
): RequesterOwnedComparisonSetExportArtifactViewModel["report"] {
  const summary = buildComparisonSummaryFromItems(input.items);

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { generatedAt?: unknown }).generatedAt === "string" &&
    typeof (value as { presetCount?: unknown }).presetCount === "number" &&
    Array.isArray((value as { rows?: unknown[] }).rows)
  ) {
    return structuredClone(
      value as RequesterOwnedComparisonSetExportArtifactViewModel["report"],
    );
  }

  return buildComparisonSetExportReport({
    generatedAt: input.completedAt,
    items: input.items,
    summary,
  });
}

function buildComparisonSummaryFromItems(
  items: RequesterOwnedPropositionAnalyticsComparisonViewModel["items"],
): RequesterOwnedPropositionAnalyticsComparisonViewModel["summary"] {
  const totalBetStakeAmount = items.reduce(
    (total, item) => total + BigInt(item.analytics.totals.totalBetStakeAmount),
    0n,
  );
  const topPresetByCreatedCount =
    items
      .map((item) => ({
        presetId: item.preset.presetId,
        createdCount: item.analytics.totals.createdCount,
      }))
      .sort(
        (left, right) =>
          right.createdCount - left.createdCount ||
          left.presetId.localeCompare(right.presetId),
      )[0] ?? null;
  const topPresetBySettledCount =
    items
      .map((item) => ({
        presetId: item.preset.presetId,
        settledCount: item.analytics.totals.settledCount,
      }))
      .sort(
        (left, right) =>
          right.settledCount - left.settledCount ||
          left.presetId.localeCompare(right.presetId),
      )[0] ?? null;
  const topPresetByBetStakeAmount =
    items
      .map((item) => ({
        presetId: item.preset.presetId,
        totalBetStakeAmount: item.analytics.totals.totalBetStakeAmount,
      }))
      .sort((left, right) => {
        const diff =
          BigInt(right.totalBetStakeAmount) -
          BigInt(left.totalBetStakeAmount);
        if (diff !== 0n) {
          return diff > 0n ? 1 : -1;
        }
        return left.presetId.localeCompare(right.presetId);
      })[0] ?? null;

  return {
    presetCount: items.length,
    topPresetByCreatedCount,
    topPresetBySettledCount,
    topPresetByBetStakeAmount,
    totals: {
      createdCount: items.reduce(
        (total, item) => total + item.analytics.totals.createdCount,
        0,
      ),
      settledCount: items.reduce(
        (total, item) => total + item.analytics.totals.settledCount,
        0,
      ),
      unresolvedCount: items.reduce(
        (total, item) => total + item.analytics.totals.unresolvedCount,
        0,
      ),
      totalEffectiveSampleCount: items.reduce(
        (total, item) =>
          total + item.analytics.totals.totalEffectiveSampleCount,
        0,
      ),
      totalReviewedResponseCount: items.reduce(
        (total, item) =>
          total + item.analytics.totals.totalReviewedResponseCount,
        0,
      ),
      totalBetCount: items.reduce(
        (total, item) => total + item.analytics.totals.totalBetCount,
        0,
      ),
      totalBetStakeAmount: totalBetStakeAmount.toString(),
      uniqueTraderCount: Math.max(
        ...items.map((item) => item.analytics.totals.uniqueTraderCount),
        0,
      ),
    },
  };
}

function normalizeStoredComparisonSummary(
  value: unknown,
  items: RequesterOwnedPropositionAnalyticsComparisonViewModel["items"],
): RequesterOwnedPropositionAnalyticsComparisonViewModel["summary"] {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { presetCount?: unknown }).presetCount === "number" &&
    (value as { topPresetByCreatedCount?: unknown }).topPresetByCreatedCount !==
      undefined &&
    (value as { topPresetBySettledCount?: unknown }).topPresetBySettledCount !==
      undefined &&
    (value as { topPresetByBetStakeAmount?: unknown }).topPresetByBetStakeAmount !==
      undefined &&
    (value as { totals?: unknown }).totals &&
    typeof (value as { totals?: unknown }).totals === "object" &&
    typeof (value as { totals: { createdCount?: unknown } }).totals.createdCount ===
      "number" &&
    typeof (value as { totals: { settledCount?: unknown } }).totals.settledCount ===
      "number" &&
    typeof (value as { totals: { unresolvedCount?: unknown } }).totals
      .unresolvedCount === "number" &&
    typeof (value as { totals: { totalEffectiveSampleCount?: unknown } }).totals
      .totalEffectiveSampleCount === "number" &&
    typeof (value as { totals: { totalReviewedResponseCount?: unknown } }).totals
      .totalReviewedResponseCount === "number" &&
    typeof (value as { totals: { totalBetCount?: unknown } }).totals.totalBetCount ===
      "number" &&
    typeof (value as { totals: { totalBetStakeAmount?: unknown } }).totals
      .totalBetStakeAmount === "string" &&
    typeof (value as { totals: { uniqueTraderCount?: unknown } }).totals
      .uniqueTraderCount === "number"
  ) {
    return structuredClone(
      value as RequesterOwnedPropositionAnalyticsComparisonViewModel["summary"],
    );
  }

  return buildComparisonSummaryFromItems(items);
}

function parseStoredRequesterComparisonSetExports(
  value: unknown,
): StoredRequesterComparisonSetExportRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeStoredRequesterComparisonSetExport)
    .filter(
      (item): item is StoredRequesterComparisonSetExportRecord => item !== null,
    )
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
}

function cloneStoredRequesterComparisonSetExports(
  records: StoredRequesterComparisonSetExportRecord[],
): StoredRequesterComparisonSetExportRecord[] {
  return structuredClone(records);
}

function applyComparisonSetExportRetention(
  records: StoredRequesterComparisonSetExportRecord[],
  input: {
    retainedExportCount?: number;
    policyId?: string | null;
  },
): StoredRequesterComparisonSetExportRecord[] {
  if (
    typeof input.retainedExportCount !== "number" ||
    input.retainedExportCount < 1 ||
    typeof input.policyId !== "string" ||
    input.policyId.length === 0
  ) {
    return records;
  }

  let retainedForPolicy = 0;

  return records.filter((record) => {
    if (record.origin.policyId !== input.policyId) {
      return true;
    }

    retainedForPolicy += 1;
    return retainedForPolicy <= input.retainedExportCount;
  });
}

@Injectable()
export class RequesterPropositionViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly propositions: PropositionRepository,
    private readonly audits: InternalAuditService,
    private readonly counters: EffectiveSampleCounterService,
    private readonly freezeReveal: FreezeRevealOrchestratorService,
    private readonly markets: MarketRepository,
    private readonly dispatchTasks: DispatchTaskRepository,
    private readonly bets: BetRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly rewardLedgers: RewardLedgerRepository,
    private readonly requesterReportPresets: RequesterReportPresetService,
    private readonly requesterComparisonSets: RequesterComparisonSetService,
    private readonly requesterComparisonSetDeliveryPolicies: RequesterComparisonSetDeliveryPolicyService,
    private readonly requesterComparisonSetDeliveryRuns: RequesterComparisonSetDeliveryRunService,
    private readonly requesterComparisonSetDeliveryTransport: RequesterComparisonSetDeliveryTransportService,
  ) {}

  async listOwnedPropositions(
    input: ListOwnedPropositionsInput,
    db?: ArenaDbClient,
  ): Promise<RequesterOwnedPropositionListItemViewModel[]> {
    return (await this.listOwnedPropositionSnapshots(input.userId, db)).map(
      ({ listItem }) => listItem,
    );
  }

  async getOwnedPropositionOverview(
    input: GetOwnedPropositionOverviewInput,
    db?: ArenaDbClient,
  ): Promise<RequesterOwnedPropositionOverviewViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const snapshots = await this.listOwnedPropositionSnapshots(input.userId, tx);
      const budgetSummaries = await Promise.all(
        snapshots.map(({ proposition }) =>
          this.buildOwnedPropositionBudgetSummary(proposition, tx),
        ),
      );
      const latestSettled = snapshots
        .filter(({ proposition }) => proposition.status === "settled")
        .sort(
          (left, right) =>
            (right.proposition.settledAt?.getTime() ?? 0) -
              (left.proposition.settledAt?.getTime() ?? 0) ||
            right.listItem.updatedAt.localeCompare(left.listItem.updatedAt),
        )[0] ?? null;

      return {
        userId: input.userId,
        totals: {
          totalCount: snapshots.length,
          draftCount: snapshots.filter(({ proposition }) => proposition.status === "draft").length,
          scheduledCount: snapshots.filter(({ proposition }) => proposition.status === "scheduled").length,
          liveCount: snapshots.filter(({ proposition }) => proposition.status === "live").length,
          revealingCount: snapshots.filter(({ proposition }) => proposition.status === "revealing").length,
          settledCount: snapshots.filter(({ proposition }) => proposition.status === "settled").length,
          archivedCount: snapshots.filter(({ proposition }) => proposition.status === "archived").length,
          unresolvedCount: snapshots.filter(({ proposition }) => proposition.status !== "settled").length,
        },
        submissionSummary: {
          draftCount: snapshots.filter(({ submission }) => submission.status === "draft").length,
          submittedCount: snapshots.filter(({ submission }) => submission.status === "submitted").length,
          approvedCount: snapshots.filter(({ submission }) => submission.status === "approved").length,
          rejectedCount: snapshots.filter(({ submission }) => submission.status === "rejected").length,
          withdrawnCount: snapshots.filter(({ submission }) => submission.status === "withdrawn").length,
          archivedCount: snapshots.filter(({ submission }) => submission.status === "archived").length,
        },
        sampleSummary: {
          totalEffectiveSampleCount: snapshots.reduce(
            (total, { counter }) => total + counter.effectiveSampleCount,
            0,
          ),
          readyToFreezeCount: snapshots.filter(
            ({ proposition, closureReadiness }) =>
              proposition.status === "live" && closureReadiness.isReadyToFreeze,
          ).length,
          unresolvedAboveMinSampleCount: snapshots.filter(
            ({ proposition, counter }) =>
              proposition.status !== "settled" && counter.hasReachedMinEffectiveSample,
          ).length,
        },
        resultSummary: {
          settledResolvedCount: snapshots.filter(
            ({ proposition }) => proposition.status === "settled" && proposition.resultKind === "resolved",
          ).length,
          settledVoidCount: snapshots.filter(
            ({ proposition }) => proposition.status === "settled" && proposition.resultKind === "void",
          ).length,
          unresolvedHiddenCount: snapshots.filter(({ proposition }) => proposition.status !== "settled").length,
          latestSettled: latestSettled
            ? {
                propositionId: latestSettled.proposition.id,
                resultKind: latestSettled.proposition.resultKind as PropositionResultKind,
                winningOption: latestSettled.proposition.winningOption,
                settledAt: latestSettled.proposition.settledAt!.toISOString(),
              }
            : null,
        },
        marketSummary: {
          enabledCount: snapshots.filter(({ market }) => market !== null).length,
          liveOrRevealingCount: snapshots.filter(
            ({ proposition }) =>
              proposition.marketEnabled &&
              (proposition.status === "live" || proposition.status === "revealing"),
          ).length,
          awaitingSettlementCount: snapshots.filter(
            ({ proposition }) => proposition.marketEnabled && proposition.status === "revealing",
          ).length,
        },
        budgetSummary: {
          configuredAmount: toAmountString(
            budgetSummaries.reduce(
              (total, summary) => total + toAmountBigInt(summary.configuredAmount),
              0n,
            ),
          ),
          reservedAmount: toAmountString(
            budgetSummaries.reduce(
              (total, summary) => total + toAmountBigInt(summary.reservedAmount),
              0n,
            ),
          ),
          spentAmount: toAmountString(
            budgetSummaries.reduce(
              (total, summary) => total + toAmountBigInt(summary.spentAmount),
              0n,
            ),
          ),
          remainingAmount: toAmountString(
            budgetSummaries.reduce(
              (total, summary) => total + toAmountBigInt(summary.remainingAmount),
              0n,
            ),
          ),
          releasedAmount: toAmountString(
            budgetSummaries.reduce(
              (total, summary) => total + toAmountBigInt(summary.releasedAmount),
              0n,
            ),
          ),
          adjustedAmount: toAmountString(
            budgetSummaries.reduce(
              (total, summary) => total + toAmountBigInt(summary.adjustedAmount),
              0n,
            ),
          ),
          currentEntryCount: budgetSummaries.reduce(
            (total, summary) => total + summary.currentEntryCount,
            0,
          ),
          pendingEntryCount: budgetSummaries.reduce(
            (total, summary) => total + summary.pendingEntryCount,
            0,
          ),
          finalizedEntryCount: budgetSummaries.reduce(
            (total, summary) => total + summary.finalizedEntryCount,
            0,
          ),
          voidedEntryCount: budgetSummaries.reduce(
            (total, summary) => total + summary.voidedEntryCount,
            0,
          ),
          adjustedEntryCount: budgetSummaries.reduce(
            (total, summary) => total + summary.adjustedEntryCount,
            0,
          ),
          lastEventAt:
            budgetSummaries
              .map((summary) => summary.lastEventAt)
              .filter((value): value is string => value !== null)
              .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null,
        },
        recent: snapshots.slice(0, 5).map(({ listItem, proposition }) => ({
          ...listItem,
          revealSettlement: {
            resultKind: proposition.status === "settled" ? proposition.resultKind : null,
            winningOption: proposition.status === "settled" ? proposition.winningOption : null,
          },
        })),
      };
    });
  }

  async getOwnedPropositionBudgetLedger(
    input: GetOwnedPropositionBudgetLedgerInput,
    db?: ArenaDbClient,
  ): Promise<RequesterPropositionBudgetLedgerViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredOwnedProposition(
        input.propositionId,
        input.userId,
        tx,
      );

      return this.buildOwnedPropositionBudgetLedger(proposition, tx);
    });
  }

  async getOwnedPropositionAnalytics(
    input: GetOwnedPropositionAnalyticsInput,
    db?: ArenaDbClient,
  ): Promise<RequesterOwnedPropositionAnalyticsViewModel> {
    return (await this.buildOwnedPropositionAnalytics(input, db)).analytics;
  }

  private async buildOwnedPropositionAnalytics(
    input: GetOwnedPropositionAnalyticsInput,
    db?: ArenaDbClient,
  ): Promise<BuiltOwnedPropositionAnalytics> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const preset = input.presetId
        ? await this.requesterReportPresets.getReportPresetForUser(
            input.userId,
            input.presetId,
            tx,
          )
        : null;
      const windowDays =
        input.windowDays ?? preset?.config.windowDays ?? DEFAULT_ANALYTICS_WINDOW_DAYS;
      const now = input.now ? new Date(input.now) : new Date();
      const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
      const snapshots = this.filterSnapshotsByPreset(
        await this.listOwnedPropositionSnapshots(input.userId, tx),
        preset?.config ?? null,
      );
      const windowSnapshots = snapshots.filter(
        ({ proposition }) => proposition.createdAt.getTime() >= windowStart.getTime(),
      );
      const storedExports = await this.listStoredRequesterExports(input.userId, tx);
      const propositionByMarketId = new Map(
        windowSnapshots
          .filter((snapshot) => snapshot.market !== null)
          .map((snapshot) => [snapshot.market!.id, snapshot] as const),
      );
      const betsBySnapshot = await Promise.all(
        windowSnapshots.map(async (snapshot) => ({
          snapshot,
          bets:
            snapshot.market === null
              ? []
              : await this.loadMarketBets(snapshot.market.id, tx),
        })),
      );
      const reviewsBySnapshot = await Promise.all(
        windowSnapshots.map(async (snapshot) => ({
          snapshot,
          reviews: await this.reviews.listByPropositionId(snapshot.proposition.id, tx),
        })),
      );
      const bets = betsBySnapshot.flatMap((entry) => entry.bets);

      const totalBetStakeAmount = bets.reduce(
        (sum, bet) => sum + BigInt(bet.stakeAmount),
        0n,
      );
      const categoryMap = new Map<PropositionCategory, CategoryAnalyticsBucket>();
      const trendMap = new Map<string, DateBucketEntry>();

      for (const snapshot of windowSnapshots) {
        const categoryEntry =
          categoryMap.get(snapshot.proposition.category) ??
          {
            category: snapshot.proposition.category,
            propositionCount: 0,
            settledCount: 0,
            unresolvedCount: 0,
            totalEffectiveSampleCount: 0,
            totalReviewedResponseCount: 0,
            totalBetCount: 0,
            totalBetStakeAmount: 0n,
            uniqueTraderIds: new Set<string>(),
          };

        categoryEntry.propositionCount += 1;
        categoryEntry.settledCount += snapshot.proposition.status === "settled" ? 1 : 0;
        categoryEntry.unresolvedCount += snapshot.proposition.status === "settled" ? 0 : 1;
        categoryEntry.totalEffectiveSampleCount += snapshot.counter.effectiveSampleCount;
        categoryEntry.totalReviewedResponseCount += snapshot.counter.reviewedResponses;
        categoryMap.set(snapshot.proposition.category, categoryEntry);

        this.bumpTrendCount(
          trendMap,
          this.toDayKey(snapshot.proposition.createdAt),
          (entry) => {
            entry.createdCount += 1;
          },
        );
        if (snapshot.proposition.settledAt) {
          this.bumpTrendCount(
            trendMap,
            this.toDayKey(snapshot.proposition.settledAt),
            (entry) => {
              entry.settledCount += 1;
            },
          );
        }
      }

      for (const bet of bets) {
        const snapshot = propositionByMarketId.get(bet.marketId);
        if (!snapshot) {
          continue;
        }
        const categoryEntry = categoryMap.get(snapshot.proposition.category);
        if (categoryEntry) {
          categoryEntry.totalBetCount += 1;
          categoryEntry.totalBetStakeAmount += BigInt(bet.stakeAmount);
          categoryEntry.uniqueTraderIds.add(bet.userId);
        }

        this.bumpTrendCount(
          trendMap,
          this.toDayKey(bet.placedAt),
          (entry) => {
            entry.betCount += 1;
            entry.betStakeAmount += BigInt(bet.stakeAmount);
          },
        );
      }

      for (const { reviews } of reviewsBySnapshot) {
        for (const review of reviews) {
          if (review.status === "pending_review") {
            continue;
          }

          this.bumpTrendCount(
            trendMap,
            this.toDayKey(review.reviewedAt ?? review.createdAt),
            (entry) => {
              entry.reviewedResponseCount += 1;
              if (review.status === "valid" || review.status === "partial_valid") {
                entry.effectiveSampleCount += 1;
              }
            },
          );
        }
      }

      const trend = [...trendMap.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([date, value]) => ({
          date,
          createdCount: value.createdCount,
          settledCount: value.settledCount,
          reviewedResponseCount: value.reviewedResponseCount,
          effectiveSampleCount: value.effectiveSampleCount,
          betCount: value.betCount,
          betStakeAmount: value.betStakeAmount.toString(),
        }));

      const categoryHistory = [...categoryMap.values()]
        .sort((left, right) => {
          if (right.propositionCount !== left.propositionCount) {
            return right.propositionCount - left.propositionCount;
          }
          return left.category.localeCompare(right.category);
        })
        .map((entry) => ({
          category: entry.category,
          propositionCount: entry.propositionCount,
          settledCount: entry.settledCount,
          unresolvedCount: entry.unresolvedCount,
          totalEffectiveSampleCount: entry.totalEffectiveSampleCount,
          totalReviewedResponseCount: entry.totalReviewedResponseCount,
          totalBetCount: entry.totalBetCount,
          totalBetStakeAmount: entry.totalBetStakeAmount.toString(),
          uniqueTraderCount: entry.uniqueTraderIds.size,
        }));

      const uniqueTraderIds = new Set(bets.map((bet) => bet.userId));

      return {
        analytics: {
          userId: input.userId,
          windowDays,
          now: now.toISOString(),
          windowStartedAt: windowStart.toISOString(),
          preset: preset ? this.toAnalyticsPresetSummary(preset) : null,
          totals: {
            createdCount: windowSnapshots.length,
            settledCount: windowSnapshots.filter(({ proposition }) => proposition.status === "settled")
              .length,
            unresolvedCount: windowSnapshots.filter(({ proposition }) => proposition.status !== "settled")
              .length,
            marketEnabledCount: windowSnapshots.filter(({ proposition }) => proposition.marketEnabled)
              .length,
            totalEffectiveSampleCount: windowSnapshots.reduce(
              (total, { counter }) => total + counter.effectiveSampleCount,
              0,
            ),
            totalReviewedResponseCount: windowSnapshots.reduce(
              (total, { counter }) => total + counter.reviewedResponses,
              0,
            ),
            totalBetCount: bets.length,
            totalBetStakeAmount: totalBetStakeAmount.toString(),
            uniqueTraderCount: uniqueTraderIds.size,
          },
          lifecycle: {
            averageHoursToPublish: this.averageHoursBetween(
              windowSnapshots
                .filter(({ proposition }) => proposition.publishedAt !== null)
                .map(({ proposition }) => [proposition.createdAt, proposition.publishedAt!] as const),
            ),
            averageHoursToLive: this.averageHoursBetween(
              windowSnapshots
                .filter(
                  ({ proposition }) =>
                    proposition.publishedAt !== null && proposition.liveAt !== null,
                )
                .map(({ proposition }) => [proposition.publishedAt!, proposition.liveAt!] as const),
            ),
            averageHoursToFreeze: this.averageHoursBetween(
              windowSnapshots
                .filter(
                  ({ proposition }) =>
                    proposition.liveAt !== null && proposition.frozenAt !== null,
                )
                .map(({ proposition }) => [proposition.liveAt!, proposition.frozenAt!] as const),
            ),
            averageHoursToSettle: this.averageHoursBetween(
              windowSnapshots
                .filter(
                  ({ proposition }) =>
                    proposition.liveAt !== null && proposition.settledAt !== null,
                )
                .map(({ proposition }) => [proposition.liveAt!, proposition.settledAt!] as const),
            ),
          },
          categoryHistory,
          trend,
          delivery: {
            exportCount: storedExports.length,
            latestExportAt: storedExports[0]?.completedAt ?? null,
            latestExportId: storedExports[0]?.exportId ?? null,
          },
        },
        uniqueTraderIds,
      };
    });
  }

  async compareOwnedPropositionAnalytics(
    input: CompareOwnedPropositionAnalyticsInput,
    db?: ArenaDbClient,
  ): Promise<RequesterOwnedPropositionAnalyticsComparisonViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const items = await Promise.all(
        input.presetIds.map(async (presetId) => {
          const builtAnalytics = await this.buildOwnedPropositionAnalytics(
            {
              userId: input.userId,
              presetId,
              now: input.now,
            },
            tx,
          );

          return {
            preset: builtAnalytics.analytics.preset!,
            analytics: builtAnalytics.analytics,
            uniqueTraderIds: builtAnalytics.uniqueTraderIds,
          };
        }),
      );

      return {
        userId: input.userId,
        totalCount: items.length,
        summary: this.buildComparisonSummary({
          items: items.map((item) => ({
            preset: item.preset,
            analytics: item.analytics,
          })),
          uniqueTraderCount: new Set(
            items.flatMap((item) => [...item.uniqueTraderIds]),
          ).size,
        }),
        items: items.map((item) => ({
          preset: item.preset,
          analytics: item.analytics,
        })),
      };
    });
  }

  async getOwnedComparisonSetAnalytics(
    input: GetOwnedComparisonSetAnalyticsInput,
    db?: ArenaDbClient,
  ): Promise<RequesterOwnedPropositionAnalyticsComparisonViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const comparisonSet =
        await this.requesterComparisonSets.getComparisonSetForUser(
          input.userId,
          input.comparisonSetId,
          tx,
        );
      const comparison = await this.compareOwnedPropositionAnalytics(
        {
          userId: input.userId,
          presetIds: comparisonSet.presetIds,
          now: input.now,
        },
        tx,
      );

      return {
        ...comparison,
        comparisonSet: {
          comparisonSetId: comparisonSet.comparisonSetId,
          name: comparisonSet.name,
          presetIds: structuredClone(comparisonSet.presetIds),
        },
      };
    });
  }

  async listOwnedComparisonSetExports(
    input: ListOwnedComparisonSetExportsInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterOwnedComparisonSetExportListViewModel> {
    const comparisonSet =
      await this.requesterComparisonSets.getComparisonSetForUser(
        input.userId,
        input.comparisonSetId,
        db,
      );
    const record = await this.systemKeyValues.findByKey(
      this.buildComparisonSetExportStorageKey(input.userId, input.comparisonSetId),
      db,
    );
    const storedExports = parseStoredRequesterComparisonSetExports(
      record?.valueJson ?? null,
    );
    const filteredExports = storedExports
      .filter((item) =>
        input.origin ? item.origin.type === input.origin : true,
      )
      .filter((item) =>
        input.policyId ? item.origin.policyId === input.policyId : true,
      );
    const exports =
      typeof input.limit === "number"
        ? filteredExports.slice(0, input.limit)
        : filteredExports;

    return {
      userId: input.userId,
      comparisonSet: {
        comparisonSetId: comparisonSet.comparisonSetId,
        name: comparisonSet.name,
      },
      totalCount: exports.length,
      storedCount: storedExports.length,
      appliedFilters: {
        origin: input.origin ?? null,
        policyId: input.policyId ?? null,
        limit: input.limit ?? null,
      },
      items: exports.map((item) => this.toComparisonSetExportListItem(item)),
    };
  }

  async getOwnedComparisonSetExport(
    input: GetOwnedComparisonSetExportInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterOwnedComparisonSetExportArtifactViewModel> {
    await this.requesterComparisonSets.getComparisonSetForUser(
      input.userId,
      input.comparisonSetId,
      db,
    );
    const record = await this.systemKeyValues.findByKey(
      this.buildComparisonSetExportStorageKey(input.userId, input.comparisonSetId),
      db,
    );
    const exports = parseStoredRequesterComparisonSetExports(record?.valueJson ?? null);
    const matched = exports.find((item) => item.exportId === input.exportId) ?? null;
    if (!matched) {
      throw new ArenaNotFoundError(
        "requester_comparison_set_export.not_found",
        `Requester comparison set export ${input.exportId} was not found`,
      );
    }

    return this.toComparisonSetExportArtifact(matched);
  }

  async deleteOwnedComparisonSetExport(
    input: DeleteOwnedComparisonSetExportInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<DeleteOwnedComparisonSetExportResult> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      await this.requesterComparisonSets.getComparisonSetForUser(
        input.userId,
        input.comparisonSetId,
        tx,
      );
      const storageKey = this.buildComparisonSetExportStorageKey(
        input.userId,
        input.comparisonSetId,
      );
      const record = await this.systemKeyValues.findByKey(storageKey, tx);
      const currentRecords = parseStoredRequesterComparisonSetExports(
        record?.valueJson ?? null,
      );
      const nextRecords = currentRecords.filter(
        (item) => item.exportId !== input.exportId,
      );

      if (nextRecords.length === currentRecords.length) {
        throw new ArenaNotFoundError(
          "requester_comparison_set_export.not_found",
          `Requester comparison set export ${input.exportId} was not found`,
        );
      }

      await this.systemKeyValues.upsertByKey(
        storageKey,
        {
          id: this.ids.next("system_key_value"),
          key: storageKey,
          description: `Arena requester comparison set exports for ${input.userId} and ${input.comparisonSetId}`,
          valueJson:
            cloneStoredRequesterComparisonSetExports(nextRecords) as unknown as Prisma.InputJsonValue,
        },
        {
          description: `Arena requester comparison set exports for ${input.userId} and ${input.comparisonSetId}`,
          valueJson:
            cloneStoredRequesterComparisonSetExports(nextRecords) as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return {
        userId: input.userId,
        comparisonSetId: input.comparisonSetId,
        exportId: input.exportId,
        deleted: true,
      };
    });
  }

  async createOwnedComparisonSetExport(
    input: CreateOwnedComparisonSetExportInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterOwnedComparisonSetExportArtifactViewModel> {
    const requestedAt = input.now ?? new Date().toISOString();
    const format = input.format ?? "json";
    const comparison =
      await this.getOwnedComparisonSetAnalytics(
        {
          userId: input.userId,
          comparisonSetId: input.comparisonSetId,
          now: input.now ?? requestedAt,
        },
        db,
      );

    const record: StoredRequesterComparisonSetExportRecord = {
      exportId: this.ids.next("requester_comparison_set_export"),
      userId: input.userId,
      status: "completed",
      format,
      requestedAt,
      completedAt: requestedAt,
      fileName: this.buildComparisonSetExportFileName(
        input.userId,
        input.comparisonSetId,
        requestedAt,
        format,
      ),
      origin: buildComparisonSetExportOrigin(input.origin),
      comparisonSet: {
        comparisonSetId: comparison.comparisonSet!.comparisonSetId,
        name: comparison.comparisonSet!.name,
        presetIds: structuredClone(comparison.comparisonSet!.presetIds),
      },
      totalCount: comparison.totalCount,
      summary: structuredClone(comparison.summary),
      report: buildComparisonSetExportReport({
        generatedAt: requestedAt,
        items: comparison.items,
        summary: comparison.summary,
      }),
      items: structuredClone(comparison.items),
    };
    record.serialized = this.buildSerializedComparisonSetExportArtifact(
      this.buildComparisonSetExportArtifactBase(record),
    );

    const storageKey = this.buildComparisonSetExportStorageKey(
      input.userId,
      input.comparisonSetId,
    );
    const existing = await this.systemKeyValues.findByKey(storageKey, db);
    const currentRecords = parseStoredRequesterComparisonSetExports(
      existing?.valueJson ?? null,
    );
    const nextRecords = applyComparisonSetExportRetention(
      [record, ...currentRecords].slice(0, 20),
      {
        retainedExportCount: input.retainedExportCount,
        policyId: record.origin.policyId,
      },
    );

    await this.systemKeyValues.upsertByKey(
      storageKey,
      {
        id: this.ids.next("system_key_value"),
        key: storageKey,
        description: `Arena requester comparison set exports for ${input.userId} and ${input.comparisonSetId}`,
        valueJson:
          cloneStoredRequesterComparisonSetExports(nextRecords) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena requester comparison set exports for ${input.userId} and ${input.comparisonSetId}`,
        valueJson:
          cloneStoredRequesterComparisonSetExports(nextRecords) as unknown as Prisma.InputJsonValue,
      },
      db,
    );

    return this.toComparisonSetExportArtifact(record);
  }

  async runOwnedComparisonSetDeliveryPolicy(
    input: RunOwnedComparisonSetDeliveryPolicyInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterOwnedComparisonSetDeliveryPolicyRunViewModel> {
    const policy =
      await this.requesterComparisonSetDeliveryPolicies.getPolicyForUser(
        input.userId,
        input.comparisonSetId,
        input.policyId,
        db,
      );
    const runAt = new Date().toISOString();
    const startedAt = runAt;

    try {
      const exportArtifact = await withArenaTransaction(this.prisma, db, async (tx) =>
        this.createOwnedComparisonSetExport(
          {
            userId: input.userId,
            comparisonSetId: input.comparisonSetId,
            now: runAt,
            origin: {
              type: "delivery_policy_manual",
              policyId: policy.policyId,
              policyName: policy.name,
            },
            retainedExportCount: policy.retainedExportCount,
          },
          tx,
        ),
      );
      const delivery = await this.requesterComparisonSetDeliveryTransport.deliverExport(
        {
          policy,
          exportArtifact,
        },
      );

      return await withArenaTransaction(this.prisma, db, async (tx) => {
        const updatedPolicy =
          await this.requesterComparisonSetDeliveryPolicies.recordPolicyRun(
            input.userId,
            input.comparisonSetId,
            input.policyId,
            runAt,
            tx,
          );
        const run = await this.requesterComparisonSetDeliveryRuns.createRunRecord(
          {
            userId: input.userId,
            comparisonSetId: input.comparisonSetId,
            policyId: input.policyId,
            retriedRunId: null,
            triggerType: "manual",
            status: "completed",
            startedAt,
            completedAt: exportArtifact.completedAt,
            exportId: exportArtifact.exportId,
            origin: {
              type: "delivery_policy_manual",
              policyId: policy.policyId,
              policyName: policy.name,
            },
            delivery,
          },
          tx,
        );

        return {
          policy: {
            policyId: updatedPolicy.policyId,
            comparisonSetId: updatedPolicy.comparisonSetId,
            name: updatedPolicy.name,
            cadence: updatedPolicy.cadence,
            enabled: updatedPolicy.enabled,
            lastRunAt: updatedPolicy.lastRunAt,
            lastRunStatus: updatedPolicy.lastRunStatus,
            lastRunError: structuredClone(updatedPolicy.lastRunError),
            nextRunAt: updatedPolicy.nextRunAt,
          },
          run,
          export: exportArtifact,
          delivery,
        };
      });
    } catch (error) {
      const normalizedError = this.normalizeDeliveryRunError(error);
      const exportId = await this.findLatestMatchingComparisonSetExportId({
        userId: input.userId,
        comparisonSetId: input.comparisonSetId,
        policyId: policy.policyId,
        originType: "delivery_policy_manual",
      });
      await this.requesterComparisonSetDeliveryPolicies.recordPolicyFailure(
        input.userId,
        input.comparisonSetId,
        input.policyId,
        normalizedError,
      );
      await this.requesterComparisonSetDeliveryRuns.createRunRecord({
        userId: input.userId,
        comparisonSetId: input.comparisonSetId,
        policyId: input.policyId,
        retriedRunId: null,
        triggerType: "manual",
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        exportId,
        origin: {
          type: "delivery_policy_manual",
          policyId: policy.policyId,
          policyName: policy.name,
        },
        error: normalizedError,
      });
      throw error;
    }
  }

  async listOwnedComparisonSetDeliveryPolicyRuns(
    input: ListOwnedComparisonSetDeliveryPolicyRunsInput,
    db: ArenaDbClient = this.prisma,
  ) {
    const runs = await this.requesterComparisonSetDeliveryRuns.listRunsForUser(
      input.userId,
      input.comparisonSetId,
      input.policyId,
      input.status,
      input.triggerType,
      input.replay,
      input.limit,
      db,
    );

    return this.hydrateComparisonSetDeliveryRunListRetentionAvailability(
      input.userId,
      input.comparisonSetId,
      runs,
      db,
    );
  }

  async retryOwnedComparisonSetDeliveryPolicyRun(
    input: RetryOwnedComparisonSetDeliveryPolicyRunInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RetryOwnedComparisonSetDeliveryPolicyRunResultViewModel> {
    const [policy, storedRun] = await Promise.all([
      this.requesterComparisonSetDeliveryPolicies.getPolicyForUser(
        input.userId,
        input.comparisonSetId,
        input.policyId,
        db,
      ),
      this.requesterComparisonSetDeliveryRuns.getRunForUser(
        input.userId,
        input.comparisonSetId,
        input.policyId,
        input.runId,
        db,
      ),
    ]);
    const run = (
      await this.hydrateComparisonSetDeliveryRunRetentionAvailability(
        input.userId,
        input.comparisonSetId,
        [storedRun],
        db,
      )
    )[0];

    if (run.status !== "failed") {
      throw new ArenaValidationError(
        "requester_comparison_set_delivery_run.retry_not_allowed",
        `Requester comparison set delivery run ${input.runId} can only be retried after a failed attempt`,
      );
    }

    if (run.exportId === null) {
      throw new ArenaValidationError(
        "requester_comparison_set_delivery_run.retry_export_missing",
        `Requester comparison set delivery run ${input.runId} cannot be retried because no export artifact was preserved`,
      );
    }

    if (!run.retainedExportAvailable) {
      throw new ArenaValidationError(
        "requester_comparison_set_delivery_run.retry_export_unavailable",
        `Requester comparison set delivery run ${input.runId} cannot be retried because the preserved export artifact is no longer retained`,
      );
    }

    const exportArtifact = await this.getOwnedComparisonSetExport(
      {
        userId: input.userId,
        comparisonSetId: input.comparisonSetId,
        exportId: run.exportId,
      },
      db,
    );
    const startedAt = new Date().toISOString();

    try {
      const delivery = await this.requesterComparisonSetDeliveryTransport.deliverExport(
        {
          policy,
          exportArtifact,
        },
      );

      return await withArenaTransaction(this.prisma, db, async (tx) => {
        const updatedPolicy =
          await this.requesterComparisonSetDeliveryPolicies.recordPolicyRun(
            input.userId,
            input.comparisonSetId,
            input.policyId,
            startedAt,
            tx,
          );
        const retryRun = await this.requesterComparisonSetDeliveryRuns.createRunRecord(
          {
            userId: input.userId,
            comparisonSetId: input.comparisonSetId,
            policyId: input.policyId,
            retriedRunId: run.runId,
            triggerType: "manual",
            status: "completed",
            startedAt,
            completedAt: delivery.deliveredAt,
            exportId: exportArtifact.exportId,
            origin: structuredClone(run.origin),
            delivery,
          },
          tx,
        );

        return {
          retriedRunId: run.runId,
          retryRunId: retryRun.runId,
          policy: {
            policyId: updatedPolicy.policyId,
            comparisonSetId: updatedPolicy.comparisonSetId,
            name: updatedPolicy.name,
            cadence: updatedPolicy.cadence,
            enabled: updatedPolicy.enabled,
            lastRunAt: updatedPolicy.lastRunAt,
            lastRunStatus: updatedPolicy.lastRunStatus,
            lastRunError: structuredClone(updatedPolicy.lastRunError),
            nextRunAt: updatedPolicy.nextRunAt,
          },
          run: retryRun,
          export: exportArtifact,
          delivery,
        };
      });
    } catch (error) {
      const normalizedError = this.normalizeDeliveryRunError(error);
      await this.requesterComparisonSetDeliveryPolicies.recordPolicyFailure(
        input.userId,
        input.comparisonSetId,
        input.policyId,
        normalizedError,
      );
      await this.requesterComparisonSetDeliveryRuns.createRunRecord({
        userId: input.userId,
        comparisonSetId: input.comparisonSetId,
        policyId: input.policyId,
        retriedRunId: run.runId,
        triggerType: "manual",
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        exportId: exportArtifact.exportId,
        origin: structuredClone(run.origin),
        error: normalizedError,
      });
      throw error;
    }
  }

  async getOwnedComparisonSetDeliveryPolicyHealth(
    input: GetOwnedComparisonSetDeliveryPolicyHealthInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterOwnedComparisonSetDeliveryPolicyHealthViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const checkedAt = input.now ?? new Date().toISOString();
      const [policy, runs] = await Promise.all([
        this.requesterComparisonSetDeliveryPolicies.getPolicyForUser(
          input.userId,
          input.comparisonSetId,
          input.policyId,
          tx,
        ),
        this.requesterComparisonSetDeliveryRuns.listRunsForUser(
          input.userId,
          input.comparisonSetId,
          input.policyId,
          undefined,
          undefined,
          undefined,
          50,
          tx,
        ),
      ]);
      const hydratedRuns =
        await this.hydrateComparisonSetDeliveryRunRetentionAvailability(
          input.userId,
          input.comparisonSetId,
          runs.items,
          tx,
        );

      return {
        policy: structuredClone(policy),
        health: this.buildComparisonSetDeliveryPolicyHealth({
          policy,
          runs: hydratedRuns,
          checkedAt,
        }),
      };
    });
  }

  private normalizeDeliveryRunError(error: unknown): {
    code: string;
    message: string;
  } {
    if (error instanceof ArenaDomainError) {
      return {
        code: error.code,
        message: error.message,
      };
    }

    if (error instanceof Error) {
      return {
        code: "INTERNAL_SERVER_ERROR",
        message: error.message || "Unexpected delivery run error",
      };
    }

    return {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected delivery run error",
    };
  }

  async findLatestMatchingComparisonSetExportId(input: {
    userId: string;
    comparisonSetId: string;
    policyId: string;
    originType: "delivery_policy_manual" | "delivery_policy_automation";
  }): Promise<string | null> {
    const exports = await this.listOwnedComparisonSetExports({
      userId: input.userId,
      comparisonSetId: input.comparisonSetId,
      origin: input.originType,
      policyId: input.policyId,
      limit: 1,
    });

    return exports.items[0]?.exportId ?? null;
  }

  private async hydrateComparisonSetDeliveryRunListRetentionAvailability(
    userId: string,
    comparisonSetId: string,
    runs: {
      userId: string;
      comparisonSetId: string;
      policyId: string;
      totalCount: number;
      storedCount: number;
      appliedFilters: {
        status: RequesterComparisonSetDeliveryRunStatus | null;
        triggerType: RequesterComparisonSetDeliveryRunTriggerType | null;
        replay: RequesterComparisonSetDeliveryRunReplayFilter;
        limit: number | null;
      };
      items: RequesterComparisonSetDeliveryRunViewModel[];
    },
    db: ArenaDbClient = this.prisma,
  ) {
    return {
      ...structuredClone(runs),
      items: await this.hydrateComparisonSetDeliveryRunRetentionAvailability(
        userId,
        comparisonSetId,
        runs.items,
        db,
      ),
    };
  }

  private async hydrateComparisonSetDeliveryRunRetentionAvailability(
    userId: string,
    comparisonSetId: string,
    runs: RequesterComparisonSetDeliveryRunViewModel[],
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterComparisonSetDeliveryRunViewModel[]> {
    if (runs.length === 0) {
      return [];
    }

    const retainedExportIds = await this.listRetainedComparisonSetExportIds(
      userId,
      comparisonSetId,
      db,
    );

    return runs.map((run) => ({
      ...structuredClone(run),
      retainedExportAvailable:
        run.exportId !== null && retainedExportIds.has(run.exportId),
    }));
  }

  private async listRetainedComparisonSetExportIds(
    userId: string,
    comparisonSetId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<Set<string>> {
    const record = await this.systemKeyValues.findByKey(
      this.buildComparisonSetExportStorageKey(userId, comparisonSetId),
      db,
    );
    const exports = parseStoredRequesterComparisonSetExports(record?.valueJson ?? null);

    return new Set(exports.map((item) => item.exportId));
  }

  async getOwnedPropositionDetail(
    input: GetOwnedPropositionDetailInput,
    db?: ArenaDbClient,
  ): Promise<RequesterOwnedPropositionDetailViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredOwnedProposition(
        input.propositionId,
        input.userId,
        tx,
      );
      const [
        auditEvents,
        market,
        sampleCounter,
        closureReadiness,
        tasks,
        reviews,
        budgetSummary,
      ] =
        await Promise.all([
          this.audits.listByEntity(
            INTERNAL_AUDIT_ENTITY_TYPES.proposition,
            proposition.id,
            tx,
          ),
          this.markets.findByPropositionId(proposition.id, tx),
          this.counters.getCounterSnapshot(proposition.id, tx),
          this.freezeReveal.evaluateClosureReadiness(
            {
              propositionId: proposition.id,
              now: new Date().toISOString(),
            },
            tx,
          ),
          this.dispatchTasks.listByProposition(proposition.id, tx),
          this.reviews.listByPropositionId(proposition.id, tx),
          this.buildOwnedPropositionBudgetSummary(proposition, tx),
        ]);
      const submission = buildPropositionSubmissionSnapshot(proposition, auditEvents);
      const resultVisible = proposition.status === "settled";

      return {
        proposition: {
          id: proposition.id,
          title: proposition.title,
          description: proposition.description,
          optionA: proposition.options[0] ?? "",
          optionB: proposition.options[1] ?? "",
          category: proposition.category,
          status: proposition.status,
          marketEnabled: proposition.marketEnabled,
          sampleConstraints: [...proposition.sampleConstraints],
          minEffectiveSample: proposition.minEffectiveSample,
          minBetAmount: proposition.minBetAmount,
          minDurationSeconds: proposition.minDurationSeconds,
          maxDurationSeconds: proposition.maxDurationSeconds,
          rewardBudget: proposition.rewardBudget,
          baseResponseReward: proposition.baseResponseReward,
          createdByUserId: proposition.createdByUserId,
          updatedByUserId: proposition.updatedByUserId,
          createdAt: proposition.createdAt.toISOString(),
          updatedAt: proposition.updatedAt.toISOString(),
          publishedAt: toIso(proposition.publishedAt),
          liveAt: toIso(proposition.liveAt),
          frozenAt: toIso(proposition.frozenAt),
          revealStartedAt: toIso(proposition.revealStartedAt),
          resultComputedAt: resultVisible ? toIso(proposition.resultComputedAt) : null,
          settledAt: toIso(proposition.settledAt),
          archivedAt: toIso(proposition.archivedAt),
        },
        submission: {
          status: submission.status,
          submittedAt: submission.submittedAt,
          submittedByUserId: submission.submittedByUserId,
          submissionReason: submission.submissionReason,
          submissionNote: submission.submissionNote,
        },
        market: market
          ? {
              id: market.id,
              status: market.status,
              liveAt: toIso(market.liveAt),
              frozenAt: toIso(market.frozenAt),
              settlingAt: toIso(market.settlingAt),
              settledAt: toIso(market.settledAt),
              currentPublicProgress: market.currentPublicProgress,
              lastPublicResult: market.lastPublicResult,
            }
          : null,
        sampleCounter,
        closureReadiness,
        dispatchSummary: this.buildDispatchSummary(tasks),
        reviewSummary: this.buildReviewSummary(reviews),
        budgetSummary,
        revealSettlement: {
          propositionStatus: proposition.status,
          resultKind: resultVisible ? proposition.resultKind : null,
          winningOption: resultVisible ? proposition.winningOption : null,
          voidReason: resultVisible ? proposition.voidReason : null,
          frozenAt: toIso(proposition.frozenAt),
          revealStartedAt: toIso(proposition.revealStartedAt),
          resultComputedAt: resultVisible ? toIso(proposition.resultComputedAt) : null,
          settledAt: toIso(proposition.settledAt),
          marketStatus: market?.status ?? null,
          currentPublicProgress: market?.currentPublicProgress ?? null,
          lastPublicResult: resultVisible ? (market?.lastPublicResult ?? null) : null,
        },
      };
    });
  }

  async getOwnedPropositionReport(
    input: GetOwnedPropositionReportInput,
    db?: ArenaDbClient,
  ): Promise<RequesterOwnedSettledPropositionReportViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredOwnedProposition(
        input.propositionId,
        input.userId,
        tx,
      );
      if (
        proposition.status !== "settled" ||
        proposition.resultKind === null ||
        proposition.resultComputedAt === null ||
        proposition.settledAt === null
      ) {
        throw new ArenaValidationError(
          "proposition.report_not_ready",
          `Settled report for proposition ${input.propositionId} is not available before settlement completes`,
        );
      }

      const [auditEvents, market, sampleCounter, tasks, reviews, budgetSummary] =
        await Promise.all([
          this.audits.listByEntity(
            INTERNAL_AUDIT_ENTITY_TYPES.proposition,
            proposition.id,
            tx,
          ),
          this.markets.findByPropositionId(proposition.id, tx),
          this.counters.getCounterSnapshot(proposition.id, tx),
          this.dispatchTasks.listByProposition(proposition.id, tx),
          this.reviews.listByPropositionId(proposition.id, tx),
          this.buildOwnedPropositionBudgetSummary(proposition, tx),
        ]);
      const submission = buildPropositionSubmissionSnapshot(proposition, auditEvents);
      const optionA = proposition.options[0] ?? "";
      const optionB = proposition.options[1] ?? "";

      return {
        proposition: {
          id: proposition.id,
          title: proposition.title,
          description: proposition.description,
          optionA,
          optionB,
          category: proposition.category,
          status: proposition.status,
          marketEnabled: proposition.marketEnabled,
          sampleConstraints: [...proposition.sampleConstraints],
          minEffectiveSample: proposition.minEffectiveSample,
          minBetAmount: proposition.minBetAmount,
          minDurationSeconds: proposition.minDurationSeconds,
          maxDurationSeconds: proposition.maxDurationSeconds,
          rewardBudget: proposition.rewardBudget,
          baseResponseReward: proposition.baseResponseReward,
          createdByUserId: proposition.createdByUserId,
          createdAt: proposition.createdAt.toISOString(),
          publishedAt: toIso(proposition.publishedAt),
          liveAt: toIso(proposition.liveAt),
          frozenAt: toIso(proposition.frozenAt),
          revealStartedAt: toIso(proposition.revealStartedAt),
          resultComputedAt: proposition.resultComputedAt.toISOString(),
          settledAt: proposition.settledAt.toISOString(),
        },
        submission: {
          status: submission.status,
          submittedAt: submission.submittedAt,
          submittedByUserId: submission.submittedByUserId,
          submissionReason: submission.submissionReason,
          submissionNote: submission.submissionNote,
        },
        sample: sampleCounter,
        dispatchSummary: this.buildDispatchSummary(tasks),
        reviewSummary: this.buildReviewSummary(reviews),
        budgetSummary,
        result: {
          resultKind: proposition.resultKind,
          winningOption: proposition.winningOption,
          winningOptionLabel:
            proposition.winningOption === 0
              ? optionA
              : proposition.winningOption === 1
                ? optionB
                : null,
          voidReason: proposition.voidReason,
          resultComputedAt: proposition.resultComputedAt.toISOString(),
          settledAt: proposition.settledAt.toISOString(),
          marketStatus: market?.status ?? null,
          currentPublicProgress: market?.currentPublicProgress ?? null,
          lastPublicResult: market?.lastPublicResult ?? null,
        },
        generatedAt: new Date().toISOString(),
      };
    });
  }

  async listOwnedPropositionExports(
    input: ListOwnedPropositionExportsInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterOwnedPropositionExportListViewModel> {
    const record = await this.systemKeyValues.findByKey(
      this.buildExportStorageKey(input.userId),
      db,
    );
    const exports = parseStoredRequesterExports(record?.valueJson ?? null);

    return {
      userId: input.userId,
      totalCount: exports.length,
      items: exports.map((record) => this.toExportListItem(record)),
    };
  }

  async getOwnedPropositionExport(
    input: GetOwnedPropositionExportInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterOwnedPropositionExportArtifactViewModel> {
    const record = await this.systemKeyValues.findByKey(
      this.buildExportStorageKey(input.userId),
      db,
    );
    const exports = parseStoredRequesterExports(record?.valueJson ?? null);
    const matched = exports.find((item) => item.exportId === input.exportId) ?? null;

    if (!matched) {
      throw new ArenaNotFoundError(
        "proposition_export.not_found",
        `Proposition export ${input.exportId} was not found`,
      );
    }

    return this.toExportArtifact(matched);
  }

  async createOwnedPropositionExport(
    input: CreateOwnedPropositionExportInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RequesterOwnedPropositionExportArtifactViewModel> {
    const requestedAt = new Date().toISOString();
    const preset = input.presetId
      ? await this.requesterReportPresets.getReportPresetForUser(
          input.userId,
          input.presetId,
          db,
        )
      : null;
    const [snapshots, analytics] = await Promise.all([
      this.listOwnedPropositionSnapshots(input.userId, db),
      this.getOwnedPropositionAnalytics(
        {
          userId: input.userId,
          windowDays:
            input.analyticsWindowDays ??
            preset?.config.windowDays ??
            DEFAULT_ANALYTICS_WINDOW_DAYS,
          now: input.analyticsNow ?? requestedAt,
          presetId: input.presetId,
        },
        db,
      ),
    ]);
    const filteredSnapshots = this.filterSnapshotsByPreset(
      snapshots,
      preset?.config ?? null,
    );
    const filteredBudgetSummaries = await Promise.all(
      filteredSnapshots.map(({ proposition }) =>
        this.buildOwnedPropositionBudgetSummary(proposition, db),
      ),
    );
    const overview = this.buildOverviewFromSnapshots(
      input.userId,
      filteredSnapshots,
      filteredBudgetSummaries,
    );

    const reports = await Promise.all(
      filteredSnapshots
        .filter(({ proposition }) => proposition.status === "settled")
        .map(({ proposition }) =>
          this.getOwnedPropositionReport(
            {
              propositionId: proposition.id,
              userId: input.userId,
            },
            db,
          ),
        ),
    );

    const exportId = this.ids.next("requester_export");
    const format = input.format ?? preset?.config.defaultExportFormat ?? "json";
    const record: StoredRequesterExportRecord = {
      exportId,
      userId: input.userId,
      status: "completed",
      format,
      requestedAt,
      completedAt: requestedAt,
      fileName: this.buildExportFileName(input.userId, requestedAt, format),
      preset: preset ? this.toExportPresetSummary(preset) : null,
      overview,
      analytics,
      reports,
    };
    record.serialized = this.buildSerializedPropositionExportArtifact(
      this.buildExportArtifactBase(record),
    );

    const storageKey = this.buildExportStorageKey(input.userId);
    const existing = await this.systemKeyValues.findByKey(storageKey, db);
    const currentRecords = parseStoredRequesterExports(existing?.valueJson ?? null);
    const nextRecords = [record, ...currentRecords].slice(0, 20);

    await this.systemKeyValues.upsertByKey(
      storageKey,
      {
        id: this.ids.next("system_key_value"),
        key: storageKey,
        description: `Arena requester exports for ${input.userId}`,
        valueJson: cloneStoredRequesterExports(nextRecords) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena requester exports for ${input.userId}`,
        valueJson: cloneStoredRequesterExports(nextRecords) as unknown as Prisma.InputJsonValue,
      },
      db,
    );

    return this.toExportArtifact(record);
  }

  private async buildOwnedPropositionBudgetSummary(
    proposition: Proposition,
    db: ArenaDbClient,
  ): Promise<RequesterPropositionBudgetSummaryViewModel> {
    return (await this.buildOwnedPropositionBudgetLedger(proposition, db)).summary;
  }

  private async buildOwnedPropositionBudgetLedger(
    proposition: Proposition,
    db: ArenaDbClient,
  ): Promise<RequesterPropositionBudgetLedgerViewModel> {
    const ledgers = await this.rewardLedgers.list(
      {
        propositionId: proposition.id,
        sourceType: "response",
      },
      db,
    );
    const currentLedgerIds = this.collectCurrentRewardLedgerIds(ledgers);
    const items = [...ledgers]
      .sort(
        (left, right) =>
          toEffectiveBudgetTimestamp(right).getTime() -
            toEffectiveBudgetTimestamp(left).getTime() ||
          right.ledgerVersion - left.ledgerVersion ||
          right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .map((ledger) => this.toRequesterBudgetLedgerEntry(ledger, currentLedgerIds));
    const currentItems = items.filter((item) => item.isCurrent);

    return {
      propositionId: proposition.id,
      summary: {
        configuredAmount: proposition.rewardBudget,
        reservedAmount: toAmountString(
          currentItems.reduce(
            (total, item) => total + toAmountBigInt(item.reservedAmount),
            0n,
          ),
        ),
        spentAmount: toAmountString(
          currentItems.reduce(
            (total, item) => total + toAmountBigInt(item.spentAmount),
            0n,
          ),
        ),
        remainingAmount: toAmountString(
          toAmountBigInt(proposition.rewardBudget) -
            currentItems.reduce(
              (total, item) => total + toAmountBigInt(item.reservedAmount),
              0n,
            ) -
            currentItems.reduce(
              (total, item) => total + toAmountBigInt(item.spentAmount),
              0n,
            ),
        ),
        releasedAmount: toAmountString(
          currentItems.reduce(
            (total, item) => total + toAmountBigInt(item.releasedAmount),
            0n,
          ),
        ),
        adjustedAmount: toAmountString(
          items.reduce(
            (total, item) => total + toAmountBigInt(item.adjustedAmount),
            0n,
          ),
        ),
        currentEntryCount: currentItems.length,
        pendingEntryCount: currentItems.filter((item) => item.ledgerStatus === "pending")
          .length,
        finalizedEntryCount: currentItems.filter(
          (item) => item.ledgerStatus === "finalized",
        ).length,
        voidedEntryCount: currentItems.filter((item) => item.ledgerStatus === "voided")
          .length,
        adjustedEntryCount: items.filter((item) => item.entryType === "adjusted").length,
        lastEventAt: items[0]?.effectiveAt ?? null,
      },
      items,
    };
  }

  private collectCurrentRewardLedgerIds(
    ledgers: PrismaRewardLedger[],
  ): Set<string> {
    const currentByUserId = new Map<string, PrismaRewardLedger>();

    for (const ledger of ledgers) {
      const current = currentByUserId.get(ledger.userId);
      if (
        !current ||
        ledger.ledgerVersion > current.ledgerVersion ||
        (ledger.ledgerVersion === current.ledgerVersion &&
          ledger.createdAt.getTime() > current.createdAt.getTime())
      ) {
        currentByUserId.set(ledger.userId, ledger);
      }
    }

    return new Set([...currentByUserId.values()].map((ledger) => ledger.id));
  }

  private toRequesterBudgetLedgerEntry(
    ledger: PrismaRewardLedger,
    currentLedgerIds: Set<string>,
  ): RequesterPropositionBudgetLedgerEntryViewModel {
    return {
      entryId: ledger.id,
      entryType: getBudgetEntryType(ledger),
      ledgerStatus: ledger.status,
      reviewStatus: ledger.reviewStatus,
      pendingAmount: ledger.pendingAmount,
      finalAmount: ledger.finalAmount,
      reservedAmount: toAmountString(getReservedBudgetAmount(ledger)),
      spentAmount: toAmountString(getSpentBudgetAmount(ledger)),
      releasedAmount: toAmountString(getReleasedBudgetAmount(ledger)),
      adjustedAmount: toAmountString(getAdjustedBudgetAmount(ledger)),
      reasonCode: ledger.reasonCode,
      createdAt: ledger.createdAt.toISOString(),
      effectiveAt: toEffectiveBudgetTimestamp(ledger).toISOString(),
      finalizedAt: toIso(ledger.finalizedAt),
      voidedAt: toIso(ledger.voidedAt),
      reversedAt: toIso(ledger.reversedAt),
      ledgerVersion: ledger.ledgerVersion,
      isCurrent: currentLedgerIds.has(ledger.id),
    };
  }

  private async getRequiredOwnedProposition(
    propositionId: string,
    userId: string,
    db: ArenaDbClient,
  ): Promise<Proposition> {
    const proposition = await this.propositions.findById(propositionId, db);
    if (!proposition || proposition.createdByUserId !== userId) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${propositionId} was not found`,
      );
    }

    return proposition;
  }

  private async listOwnedPropositionSnapshots(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<OwnedPropositionSnapshot[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const propositions = await this.propositions.list(
        {
          createdByUserId: userId,
        },
        tx,
      );
      const audits = await this.audits.listByEntityIds(
        INTERNAL_AUDIT_ENTITY_TYPES.proposition,
        propositions.map((proposition) => proposition.id),
        tx,
      );
      const auditsByPropositionId = this.groupAuditEventsByEntityId(audits);

      const items = await Promise.all(
        propositions.map(async (proposition) => {
          const [counter, closureReadiness, market] = await Promise.all([
            this.counters.getCounterSnapshot(proposition.id, tx),
            this.freezeReveal.evaluateClosureReadiness(
              {
                propositionId: proposition.id,
                now: new Date().toISOString(),
              },
              tx,
            ),
            this.markets.findByPropositionId(proposition.id, tx),
          ]);
          const submission = buildPropositionSubmissionSnapshot(
            proposition,
            auditsByPropositionId.get(proposition.id) ?? [],
          );

          return {
            proposition,
            market,
            submission,
            counter,
            closureReadiness,
            listItem: {
              propositionId: proposition.id,
              title: proposition.title,
              category: proposition.category,
              status: proposition.status,
              submissionStatus: submission.status,
              submittedAt: submission.submittedAt,
              marketEnabled: proposition.marketEnabled,
              createdAt: proposition.createdAt.toISOString(),
              updatedAt: proposition.updatedAt.toISOString(),
              publishedAt: toIso(proposition.publishedAt),
              liveAt: toIso(proposition.liveAt),
              frozenAt: toIso(proposition.frozenAt),
              settledAt: toIso(proposition.settledAt),
              minEffectiveSample: proposition.minEffectiveSample,
              effectiveSampleCount: counter.effectiveSampleCount,
              reviewedResponseCount: counter.reviewedResponses,
            } satisfies RequesterOwnedPropositionListItemViewModel,
          };
        }),
      );

      return items.sort((left, right) => {
        const leftTime = Date.parse(left.listItem.updatedAt);
        const rightTime = Date.parse(right.listItem.updatedAt);
        return (
          rightTime - leftTime ||
          right.listItem.createdAt.localeCompare(left.listItem.createdAt)
        );
      });
    });
  }

  private filterSnapshotsByPreset(
    snapshots: OwnedPropositionSnapshot[],
    preset: RequesterReportPresetConfig | null,
  ): OwnedPropositionSnapshot[] {
    if (!preset) {
      return snapshots;
    }

    return snapshots.filter(({ proposition }) => {
      if (
        preset.categories.length > 0 &&
        !preset.categories.includes(proposition.category)
      ) {
        return false;
      }
      if (preset.marketEnabledOnly && !proposition.marketEnabled) {
        return false;
      }
      if (preset.statusScope === "settled" && proposition.status !== "settled") {
        return false;
      }
      if (
        preset.statusScope === "unresolved" &&
        proposition.status === "settled"
      ) {
        return false;
      }

      return true;
    });
  }

  private async listStoredRequesterExports(
    userId: string,
    db: ArenaDbClient,
  ): Promise<StoredRequesterExportRecord[]> {
    const record = await this.systemKeyValues.findByKey(
      this.buildExportStorageKey(userId),
      db,
    );
    return parseStoredRequesterExports(record?.valueJson ?? null);
  }

  private buildExportStorageKey(userId: string): string {
    return `${REQUESTER_EXPORT_NAMESPACE}.${userId}`;
  }

  private buildComparisonSetExportStorageKey(
    userId: string,
    comparisonSetId: string,
  ): string {
    return `${REQUESTER_COMPARISON_SET_EXPORT_NAMESPACE}.${userId}.${comparisonSetId}`;
  }

  private buildExportFileName(
    userId: string,
    requestedAt: string,
    format: RequesterExportFormat,
  ): string {
    const compactTimestamp = requestedAt.replace(/[:.]/g, "-");
    return `arena-requester-${userId}-${compactTimestamp}.${format}`;
  }

  private buildComparisonSetExportFileName(
    userId: string,
    comparisonSetId: string,
    requestedAt: string,
    format: RequesterExportFormat,
  ): string {
    const compactTimestamp = requestedAt.replace(/[:.]/g, "-");
    return `arena-requester-comparison-${userId}-${comparisonSetId}-${compactTimestamp}.${format}`;
  }

  private buildOverviewFromSnapshots(
    userId: string,
    snapshots: OwnedPropositionSnapshot[],
    budgetSummaries: RequesterPropositionBudgetSummaryViewModel[],
  ): RequesterOwnedPropositionOverviewViewModel {
    const latestSettled = snapshots
      .filter(({ proposition }) => proposition.status === "settled")
      .sort(
        (left, right) =>
          (right.proposition.settledAt?.getTime() ?? 0) -
            (left.proposition.settledAt?.getTime() ?? 0) ||
          right.listItem.updatedAt.localeCompare(left.listItem.updatedAt),
      )[0] ?? null;

    return {
      userId,
      totals: {
        totalCount: snapshots.length,
        draftCount: snapshots.filter(({ proposition }) => proposition.status === "draft").length,
        scheduledCount: snapshots.filter(({ proposition }) => proposition.status === "scheduled").length,
        liveCount: snapshots.filter(({ proposition }) => proposition.status === "live").length,
        revealingCount: snapshots.filter(({ proposition }) => proposition.status === "revealing").length,
        settledCount: snapshots.filter(({ proposition }) => proposition.status === "settled").length,
        archivedCount: snapshots.filter(({ proposition }) => proposition.status === "archived").length,
        unresolvedCount: snapshots.filter(({ proposition }) => proposition.status !== "settled").length,
      },
      submissionSummary: {
        draftCount: snapshots.filter(({ submission }) => submission.status === "draft").length,
        submittedCount: snapshots.filter(({ submission }) => submission.status === "submitted").length,
        approvedCount: snapshots.filter(({ submission }) => submission.status === "approved").length,
        rejectedCount: snapshots.filter(({ submission }) => submission.status === "rejected").length,
        withdrawnCount: snapshots.filter(({ submission }) => submission.status === "withdrawn").length,
        archivedCount: snapshots.filter(({ submission }) => submission.status === "archived").length,
      },
      sampleSummary: {
        totalEffectiveSampleCount: snapshots.reduce(
          (total, { counter }) => total + counter.effectiveSampleCount,
          0,
        ),
        readyToFreezeCount: snapshots.filter(
          ({ proposition, closureReadiness }) =>
            proposition.status === "live" && closureReadiness.isReadyToFreeze,
        ).length,
        unresolvedAboveMinSampleCount: snapshots.filter(
          ({ proposition, counter }) =>
            proposition.status !== "settled" && counter.hasReachedMinEffectiveSample,
        ).length,
      },
      resultSummary: {
        settledResolvedCount: snapshots.filter(
          ({ proposition }) => proposition.status === "settled" && proposition.resultKind === "resolved",
        ).length,
        settledVoidCount: snapshots.filter(
          ({ proposition }) => proposition.status === "settled" && proposition.resultKind === "void",
        ).length,
        unresolvedHiddenCount: snapshots.filter(({ proposition }) => proposition.status !== "settled").length,
        latestSettled: latestSettled
          ? {
              propositionId: latestSettled.proposition.id,
              resultKind: latestSettled.proposition.resultKind as PropositionResultKind,
              winningOption: latestSettled.proposition.winningOption,
              settledAt: latestSettled.proposition.settledAt!.toISOString(),
            }
          : null,
      },
      marketSummary: {
        enabledCount: snapshots.filter(({ market }) => market !== null).length,
        liveOrRevealingCount: snapshots.filter(
          ({ proposition }) =>
            proposition.marketEnabled &&
            (proposition.status === "live" || proposition.status === "revealing"),
        ).length,
        awaitingSettlementCount: snapshots.filter(
          ({ proposition }) => proposition.marketEnabled && proposition.status === "revealing",
        ).length,
      },
      budgetSummary: {
        configuredAmount: toAmountString(
          budgetSummaries.reduce(
            (total, summary) => total + toAmountBigInt(summary.configuredAmount),
            0n,
          ),
        ),
        reservedAmount: toAmountString(
          budgetSummaries.reduce(
            (total, summary) => total + toAmountBigInt(summary.reservedAmount),
            0n,
          ),
        ),
        spentAmount: toAmountString(
          budgetSummaries.reduce(
            (total, summary) => total + toAmountBigInt(summary.spentAmount),
            0n,
          ),
        ),
        remainingAmount: toAmountString(
          budgetSummaries.reduce(
            (total, summary) => total + toAmountBigInt(summary.remainingAmount),
            0n,
          ),
        ),
        releasedAmount: toAmountString(
          budgetSummaries.reduce(
            (total, summary) => total + toAmountBigInt(summary.releasedAmount),
            0n,
          ),
        ),
        adjustedAmount: toAmountString(
          budgetSummaries.reduce(
            (total, summary) => total + toAmountBigInt(summary.adjustedAmount),
            0n,
          ),
        ),
        currentEntryCount: budgetSummaries.reduce(
          (total, summary) => total + summary.currentEntryCount,
          0,
        ),
        pendingEntryCount: budgetSummaries.reduce(
          (total, summary) => total + summary.pendingEntryCount,
          0,
        ),
        finalizedEntryCount: budgetSummaries.reduce(
          (total, summary) => total + summary.finalizedEntryCount,
          0,
        ),
        voidedEntryCount: budgetSummaries.reduce(
          (total, summary) => total + summary.voidedEntryCount,
          0,
        ),
        adjustedEntryCount: budgetSummaries.reduce(
          (total, summary) => total + summary.adjustedEntryCount,
          0,
        ),
        lastEventAt:
          budgetSummaries
            .map((summary) => summary.lastEventAt)
            .filter((value): value is string => value !== null)
            .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null,
      },
      recent: snapshots.slice(0, 5).map(({ listItem, proposition }) => ({
        ...listItem,
        revealSettlement: {
          resultKind: proposition.status === "settled" ? proposition.resultKind : null,
          winningOption: proposition.status === "settled" ? proposition.winningOption : null,
        },
      })),
    };
  }

  private buildExportArtifactBase(
    record: StoredRequesterExportRecord,
  ): Omit<RequesterOwnedPropositionExportArtifactViewModel, "serialized"> {
    return {
      exportId: record.exportId,
      userId: record.userId,
      status: record.status,
      format: record.format,
      requestedAt: record.requestedAt,
      completedAt: record.completedAt,
      fileName: record.fileName,
      preset: structuredClone(record.preset ?? null),
      overview: structuredClone(record.overview),
      analytics: structuredClone(
        record.analytics ?? this.buildLegacyExportAnalytics(record),
      ),
      reports: structuredClone(record.reports),
      metrics: {
        settledReportCount: record.reports.length,
        openLifecycleCount: record.overview.totals.unresolvedCount,
      },
    };
  }

  private toExportListItem(
    record: StoredRequesterExportRecord,
  ): RequesterOwnedPropositionExportItemViewModel {
    return {
      exportId: record.exportId,
      userId: record.userId,
      status: record.status,
      format: record.format,
      requestedAt: record.requestedAt,
      completedAt: record.completedAt,
      fileName: record.fileName,
      preset: record.preset
        ? {
            presetId: record.preset.presetId,
            name: record.preset.name,
          }
        : null,
      metrics: {
        settledReportCount: record.reports.length,
        openLifecycleCount: record.overview.totals.unresolvedCount,
      },
    };
  }

  private toExportArtifact(
    record: StoredRequesterExportRecord,
  ): RequesterOwnedPropositionExportArtifactViewModel {
    const artifact = this.buildExportArtifactBase(record);
    return {
      ...artifact,
      serialized:
        record.serialized ??
        this.buildSerializedPropositionExportArtifact(artifact),
    };
  }

  private toComparisonSetExportListItem(
    record: StoredRequesterComparisonSetExportRecord,
  ): RequesterOwnedComparisonSetExportItemViewModel {
    return {
      exportId: record.exportId,
      userId: record.userId,
      status: record.status,
      format: record.format,
      requestedAt: record.requestedAt,
      completedAt: record.completedAt,
      fileName: record.fileName,
      origin: structuredClone(record.origin),
      comparisonSet: {
        comparisonSetId: record.comparisonSet.comparisonSetId,
        name: record.comparisonSet.name,
      },
    };
  }

  private buildComparisonSetExportArtifactBase(
    record: StoredRequesterComparisonSetExportRecord,
  ): Omit<RequesterOwnedComparisonSetExportArtifactViewModel, "serialized"> {
    return {
      exportId: record.exportId,
      userId: record.userId,
      status: record.status,
      format: record.format,
      requestedAt: record.requestedAt,
      completedAt: record.completedAt,
      fileName: record.fileName,
      origin: structuredClone(record.origin),
      comparisonSet: structuredClone(record.comparisonSet),
      totalCount: record.totalCount,
      summary: structuredClone(record.summary),
      report: structuredClone(
        record.report ??
          buildComparisonSetExportReport({
            generatedAt: record.completedAt,
            items: record.items,
            summary: record.summary,
          }),
      ),
      items: structuredClone(record.items),
    };
  }

  private toComparisonSetExportArtifact(
    record: StoredRequesterComparisonSetExportRecord,
  ): RequesterOwnedComparisonSetExportArtifactViewModel {
    const artifact = this.buildComparisonSetExportArtifactBase(record);
    return {
      ...artifact,
      serialized:
        record.serialized ??
        this.buildSerializedComparisonSetExportArtifact(artifact),
    };
  }

  private buildSerializedPropositionExportArtifact(
    artifact: Omit<RequesterOwnedPropositionExportArtifactViewModel, "serialized">,
  ): RequesterSerializedArtifactViewModel {
    if (artifact.format === "csv") {
      const lines = [
        toCsvRow([
          "propositionId",
          "title",
          "category",
          "status",
          "resultKind",
          "winningOptionLabel",
          "settledAt",
          "effectiveSampleCount",
          "reviewedResponseCount",
          "validCount",
          "partialValidCount",
          "invalidCount",
        ]),
        ...artifact.reports.map((report) =>
          toCsvRow([
            report.proposition.id,
            report.proposition.title,
            report.proposition.category,
            report.proposition.status,
            report.result.resultKind,
            report.result.winningOptionLabel ?? "",
            report.result.settledAt,
            report.sample.effectiveSampleCount,
            report.sample.reviewedResponses,
            report.reviewSummary.validCount,
            report.reviewSummary.partialValidCount,
            report.reviewSummary.invalidCount,
          ]),
        ),
      ];

      return {
        mediaType: "text/csv",
        fileName: artifact.fileName,
        content: `${lines.join("\n")}\n`,
      };
    }

    return {
      mediaType: "application/json",
      fileName: artifact.fileName,
      content: serializeJsonArtifact(artifact),
    };
  }

  private buildSerializedComparisonSetExportArtifact(
    artifact: Omit<RequesterOwnedComparisonSetExportArtifactViewModel, "serialized">,
  ): RequesterSerializedArtifactViewModel {
    if (artifact.format === "csv") {
      const lines = [
        toCsvRow([
          "rank",
          "presetId",
          "presetName",
          "createdCount",
          "settledCount",
          "unresolvedCount",
          "totalEffectiveSampleCount",
          "totalReviewedResponseCount",
          "totalBetCount",
          "totalBetStakeAmount",
          "uniqueTraderCount",
        ]),
        ...artifact.report.rows.map((row) =>
          toCsvRow([
            row.rank,
            row.preset.presetId,
            row.preset.name,
            row.createdCount,
            row.settledCount,
            row.unresolvedCount,
            row.totalEffectiveSampleCount,
            row.totalReviewedResponseCount,
            row.totalBetCount,
            row.totalBetStakeAmount,
            row.uniqueTraderCount,
          ]),
        ),
      ];

      return {
        mediaType: "text/csv",
        fileName: artifact.fileName,
        content: `${lines.join("\n")}\n`,
      };
    }

    return {
      mediaType: "application/json",
      fileName: artifact.fileName,
      content: serializeJsonArtifact(artifact),
    };
  }

  private buildComparisonSummary(
    input: ComparisonSummaryInput,
  ): RequesterOwnedPropositionAnalyticsComparisonViewModel["summary"] {
    const summary = buildComparisonSummaryFromItems(input.items);
    return {
      ...summary,
      totals: {
        ...summary.totals,
        uniqueTraderCount: input.uniqueTraderCount,
      },
    };
  }

  private buildComparisonSetDeliveryPolicyHealth(input: {
    policy: RequesterComparisonSetDeliveryPolicyViewModel;
    runs: RequesterComparisonSetDeliveryRunViewModel[];
    checkedAt: string;
  }): RequesterOwnedComparisonSetDeliveryPolicyHealthViewModel["health"] {
    const checkedAtTime = Date.parse(input.checkedAt);
    const nextRunAtTime = Date.parse(input.policy.nextRunAt);
    const isDue =
      input.policy.enabled &&
      Number.isFinite(checkedAtTime) &&
      Number.isFinite(nextRunAtTime) &&
      nextRunAtTime <= checkedAtTime;
    const latestRun = input.runs[0] ?? null;
    const lastCompletedRunAt =
      input.runs.find((run) => run.status === "completed")?.completedAt ?? null;
    const lastFailedRunAt =
      input.runs.find((run) => run.status === "failed")?.completedAt ?? null;
    const consecutiveFailureCount = this.countLeadingFailedRuns(input.runs);
    const lagSeconds =
      isDue && Number.isFinite(checkedAtTime) && Number.isFinite(nextRunAtTime)
        ? Math.max(0, Math.floor((checkedAtTime - nextRunAtTime) / 1000))
        : 0;

    return {
      status: this.resolveComparisonSetDeliveryPolicyHealthStatus({
        enabled: input.policy.enabled,
        isDue,
        consecutiveFailureCount,
      }),
      checkedAt: input.checkedAt,
      isDue,
      lagSeconds,
      consecutiveFailureCount,
      lastCompletedRunAt,
      lastFailedRunAt,
      latestRun: latestRun ? structuredClone(latestRun) : null,
      runCounts: {
        totalCount: input.runs.length,
        completedCount: input.runs.filter((run) => run.status === "completed").length,
        failedCount: input.runs.filter((run) => run.status === "failed").length,
      },
      transport: input.policy.transport?.type === "webhook"
        ? this.requesterComparisonSetDeliveryTransport.getWebhookCredentialStatus(
            input.policy.transport.credentialKey,
          )
        : {
            status: "ready",
            blockingReason: null,
            credentialKey: null,
          },
    };
  }

  private countLeadingFailedRuns(
    runs: RequesterComparisonSetDeliveryRunViewModel[],
  ): number {
    let count = 0;
    for (const run of runs) {
      if (run.status !== "failed") {
        break;
      }
      count += 1;
    }

    return count;
  }

  private resolveComparisonSetDeliveryPolicyHealthStatus(input: {
    enabled: boolean;
    isDue: boolean;
    consecutiveFailureCount: number;
  }): "scheduled" | "due" | "failing" | "disabled" {
    if (!input.enabled) {
      return "disabled";
    }

    if (input.consecutiveFailureCount > 0) {
      return "failing";
    }

    if (input.isDue) {
      return "due";
    }

    return "scheduled";
  }

  private groupAuditEventsByEntityId(
    events: Array<{
      entityId: string;
      action: string;
      actorUserId: string | null;
      reason: string;
      note: string | null;
      createdAt: string;
    }>,
  ) {
    const grouped = new Map<string, typeof events>();
    for (const event of events) {
      const existing = grouped.get(event.entityId) ?? [];
      existing.push(event);
      grouped.set(event.entityId, existing);
    }

    return grouped;
  }

  private buildDispatchSummary(
    tasks: Array<{
      id: string;
      userId: string;
      assignedAt: Date;
      submittedAt: Date | null;
      status: string;
    }>,
  ) {
    const submittedTasks = tasks.filter((task) => task.submittedAt !== null);
    const lastAssignedAt = tasks.at(-1)?.assignedAt ?? null;
    const lastSubmittedAt =
      submittedTasks.length > 0
        ? submittedTasks
            .sort(
              (left, right) =>
                (left.submittedAt?.getTime() ?? 0) -
                (right.submittedAt?.getTime() ?? 0),
            )
            .at(-1)?.submittedAt ?? null
        : null;

    return {
      totalTasks: tasks.length,
      submittedCount: submittedTasks.length,
      uniqueAssignedUsers: new Set(tasks.map((task) => task.userId)).size,
      lastAssignedAt: toIso(lastAssignedAt),
      lastSubmittedAt: toIso(lastSubmittedAt),
    };
  }

  private buildReviewSummary(
    reviews: Array<{
      status: string;
    }>,
  ) {
    const finalized = reviews.filter((review) => review.status !== "pending_review");

    return {
      totalReviews: reviews.length,
      pendingCount: reviews.filter((review) => review.status === "pending_review").length,
      finalizedCount: finalized.length,
      validCount: finalized.filter((review) => review.status === "valid").length,
      partialValidCount: finalized.filter((review) => review.status === "partial_valid").length,
      invalidCount: finalized.filter((review) => review.status === "invalid").length,
      fraudSuspectedCount: finalized.filter(
        (review) => review.status === "fraud_suspected",
      ).length,
    };
  }

  private async loadMarketBets(marketId: string, db: ArenaDbClient) {
    return this.bets.listByMarketId(marketId, db);
  }

  private bumpTrendCount(
    trendMap: Map<string, DateBucketEntry>,
    date: string,
    updater: (entry: DateBucketEntry) => void,
  ) {
    const current =
      trendMap.get(date) ??
      {
        createdCount: 0,
        settledCount: 0,
        reviewedResponseCount: 0,
        effectiveSampleCount: 0,
        betCount: 0,
        betStakeAmount: 0n,
      };
    updater(current);
    trendMap.set(date, current);
  }

  private toDayKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private averageHoursBetween(values: ReadonlyArray<readonly [Date, Date]>): number | null {
    if (values.length === 0) {
      return null;
    }

    const totalHours =
      values.reduce(
        (sum, [start, end]) => sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60),
        0,
      ) / values.length;

    return Math.round(totalHours * 100) / 100;
  }

  private buildLegacyExportAnalytics(
    record: StoredRequesterExportRecord,
  ): RequesterOwnedPropositionAnalyticsViewModel {
    const completedAt = new Date(record.completedAt);
    const windowStartedAt = new Date(
      completedAt.getTime() - DEFAULT_ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const categoryMap = new Map<
      PropositionCategory,
      {
        category: PropositionCategory;
        propositionCount: number;
        settledCount: number;
        unresolvedCount: number;
        totalEffectiveSampleCount: number;
        totalReviewedResponseCount: number;
      }
    >();

    for (const report of record.reports) {
      const current =
        categoryMap.get(report.proposition.category) ??
        {
          category: report.proposition.category,
          propositionCount: 0,
          settledCount: 0,
          unresolvedCount: 0,
          totalEffectiveSampleCount: 0,
          totalReviewedResponseCount: 0,
        };
      current.propositionCount += 1;
      current.settledCount += 1;
      current.totalEffectiveSampleCount += report.sample.effectiveSampleCount;
      current.totalReviewedResponseCount += report.sample.reviewedResponses;
      categoryMap.set(report.proposition.category, current);
    }

    return {
      userId: record.userId,
      windowDays: DEFAULT_ANALYTICS_WINDOW_DAYS,
      now: record.completedAt,
      windowStartedAt: windowStartedAt.toISOString(),
      preset: record.preset
        ? {
            presetId: record.preset.presetId,
            name: record.preset.name,
            statusScope: record.preset.statusScope,
            categories: structuredClone(record.preset.categories),
            marketEnabledOnly: record.preset.marketEnabledOnly,
          }
        : null,
      totals: {
        createdCount: record.overview.totals.totalCount,
        settledCount: record.overview.totals.settledCount,
        unresolvedCount: record.overview.totals.unresolvedCount,
        marketEnabledCount: record.overview.marketSummary.enabledCount,
        totalEffectiveSampleCount: record.overview.sampleSummary.totalEffectiveSampleCount,
        totalReviewedResponseCount: record.reports.reduce(
          (total, report) => total + report.sample.reviewedResponses,
          0,
        ),
        totalBetCount: 0,
        totalBetStakeAmount: "0",
        uniqueTraderCount: 0,
      },
      lifecycle: {
        averageHoursToPublish: this.averageHoursBetween(
          record.reports
            .filter((report) => report.proposition.publishedAt !== null)
            .map((report) => [
              new Date(report.proposition.createdAt),
              new Date(report.proposition.publishedAt!),
            ] as const),
        ),
        averageHoursToLive: this.averageHoursBetween(
          record.reports
            .filter(
              (report) =>
                report.proposition.publishedAt !== null &&
                report.proposition.liveAt !== null,
            )
            .map((report) => [
              new Date(report.proposition.publishedAt!),
              new Date(report.proposition.liveAt!),
            ] as const),
        ),
        averageHoursToFreeze: this.averageHoursBetween(
          record.reports
            .filter(
              (report) =>
                report.proposition.liveAt !== null &&
                report.proposition.frozenAt !== null,
            )
            .map((report) => [
              new Date(report.proposition.liveAt!),
              new Date(report.proposition.frozenAt!),
            ] as const),
        ),
        averageHoursToSettle: this.averageHoursBetween(
          record.reports
            .filter(
              (report) =>
                report.proposition.liveAt !== null &&
                report.proposition.settledAt !== null,
            )
            .map((report) => [
              new Date(report.proposition.liveAt!),
              new Date(report.proposition.settledAt!),
            ] as const),
        ),
      },
      categoryHistory: [...categoryMap.values()]
        .sort((left, right) => right.propositionCount - left.propositionCount)
        .map((entry) => ({
          category: entry.category,
          propositionCount: entry.propositionCount,
          settledCount: entry.settledCount,
          unresolvedCount: entry.unresolvedCount,
          totalEffectiveSampleCount: entry.totalEffectiveSampleCount,
          totalReviewedResponseCount: entry.totalReviewedResponseCount,
          totalBetCount: 0,
          totalBetStakeAmount: "0",
          uniqueTraderCount: 0,
        })),
      trend: [],
      delivery: {
        exportCount: 0,
        latestExportAt: null,
        latestExportId: null,
      },
    };
  }

  private toAnalyticsPresetSummary(
    preset: RequesterReportPresetViewModel,
  ): NonNullable<RequesterOwnedPropositionAnalyticsViewModel["preset"]> {
    return {
      presetId: preset.presetId,
      name: preset.name,
      statusScope: preset.config.statusScope,
      categories: structuredClone(preset.config.categories),
      marketEnabledOnly: preset.config.marketEnabledOnly,
    };
  }

  private toExportPresetSummary(
    preset: RequesterReportPresetViewModel,
  ): NonNullable<StoredRequesterExportRecord["preset"]> {
    return {
      presetId: preset.presetId,
      name: preset.name,
      statusScope: preset.config.statusScope,
      categories: structuredClone(preset.config.categories),
      marketEnabledOnly: preset.config.marketEnabledOnly,
    };
  }
}
