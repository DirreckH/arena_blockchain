import type {
  ArenaPropositionStructure,
  ArenaPropositionType,
  ArenaRollingMode,
  ArenaSettlementTarget,
  BinaryOption,
  FrontendSurface,
  MarketStatus,
  PositionSettlementOutcome,
  PropositionCategory,
  PropositionResultKind,
  PropositionStatus,
  PropositionVoidReason,
  ReputationLevel,
  ResponseReviewStatus,
  RewardLedgerReasonCode,
  RewardLedgerStatus,
} from "./enums.js";
import type {
  Market,
  PositionBet,
  UserReputationMetrics,
} from "./entities.js";

export interface CreatePropositionInput {
  createdByUserId: string;
  category?: PropositionCategory;
  title: string;
  description: string;
  options: [string, string];
  sampleConstraints?: string[];
  minEffectiveSample: number;
  minBetAmount: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  marketEnabled: boolean;
  rewardBudget: string;
  baseResponseReward: string;
}

export interface SchedulePropositionInput {
  propositionId: string;
  publishedAt: string;
  updatedByUserId: string;
}

export interface PublishPropositionLiveInput {
  propositionId: string;
  liveAt: string;
  updatedByUserId: string;
}

export interface PropositionRuntimeSnapshot {
  propositionId: string;
  type: ArenaPropositionType;
  structure: ArenaPropositionStructure;
  rollingMode: ArenaRollingMode;
  settlementTarget: ArenaSettlementTarget;
  category: PropositionCategory;
  title: string;
  description: string;
  options: [string, string];
  marketEnabled: boolean;
  status: PropositionStatus;
  timeRules: {
    publishedAt: string | null;
    liveAt: string | null;
    minDurationSeconds: number;
    maxDurationSeconds: number;
  };
  sampleRules: {
    minEffectiveSample: number;
    sampleConstraints: string[];
  };
  rewardPolicy: {
    rewardBudget: string;
    baseResponseReward: string;
  };
  validationRuntime: {
    enabled: boolean;
    marketId: string | null;
    marketStatus: MarketStatus | null;
  };
}

export interface AssignDispatchTaskInput {
  propositionId: string;
  userId: string;
  assignedAt: string;
  expiresAt: string;
}

export interface CreateDispatchTasksForPropositionInput {
  propositionId: string;
  userIds: string[];
  assignedAt: string;
  expiresAt: string;
}

export interface RespondentTaskViewModel {
  taskId: string;
  propositionId: string;
  title: string;
  description: string;
  options: [string, string];
  propositionStatus: PropositionStatus;
  taskStatus: string;
  assignedAt: string;
  startedAt: string | null;
  expiresAt: string;
  submittedAt: string | null;
  hasSubmitted: boolean;
}

export interface SubmitResponseInput {
  propositionId: string;
  taskId: string;
  userId: string;
  selectedOption: BinaryOption;
  confirmationOption: BinaryOption;
  clientStartedAt: string;
  clientSubmittedAt: string;
  understandingAck: boolean;
  submittedAt: string;
}

export interface ReviewResponseInput {
  propositionId: string;
  responseId: string;
  reviewStatus: ResponseReviewStatus;
  qualityScore: number;
  flags: string[];
  reviewedAt: string;
}

export interface ReviewPendingResponseInput {
  responseId: string;
  reviewedAt: string;
  reviewedByUserId?: string;
}

export interface EffectiveSampleCounterSnapshot {
  propositionId: string;
  totalResponses: number;
  reviewedResponses: number;
  validCount: number;
  partialValidCount: number;
  invalidCount: number;
  effectiveSampleCount: number;
  currentProgress: number;
  hasReachedMinEffectiveSample: boolean;
  updatedAt: string;
}

export type PublicLifecyclePhase =
  | "scheduled"
  | "live"
  | "frozen"
  | "revealing"
  | "settled";

export interface PublishedResultViewModel {
  resultKind: PropositionResultKind;
  winningOption: BinaryOption | null;
  voidReason: PropositionVoidReason | null;
  publishedAt: string;
}

export interface PublicProgressViewModel {
  propositionId: string;
  title: string;
  status: PropositionStatus;
  marketEnabled: boolean;
  progress: {
    totalRequired: number;
    currentEffectiveSample: number;
    reviewedCount: number;
    progressPercent: number;
  };
  timing: {
    startedAt: string | null;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    minDurationEndsAt: string | null;
    deadlineAt: string | null;
    frozenAt: string | null;
    revealStartedAt: string | null;
    settledAt: string | null;
  };
  publicState: {
    phase: PublicLifecyclePhase;
    reachedSampleThreshold: boolean;
    reachedMinDuration: boolean;
  };
  lastPublishedResult: PublishedResultViewModel | null;
}

export type PublicProgressSnapshot = PublicProgressViewModel;

export type ClosureReadinessTriggerReason =
  | "min_duration_and_sample_reached"
  | "max_duration_reached"
  | "not_ready";

export interface ClosureReadinessSnapshot {
  propositionId: string;
  propositionStatus: PropositionStatus;
  counterSnapshot: EffectiveSampleCounterSnapshot;
  liveAt: string | null;
  minFreezeAt: string | null;
  maxFreezeAt: string | null;
  minDurationReached: boolean;
  maxDurationReached: boolean;
  hasReachedMinEffectiveSample: boolean;
  isReadyToFreeze: boolean;
  triggerReason: ClosureReadinessTriggerReason;
}

export interface PlacePositionBetInput {
  propositionId: string;
  marketId: string;
  userId: string;
  chainId: number;
  selectedOption: BinaryOption;
  stakeAmount: string;
  placedAt: string;
}

export interface OpenMarketForLiveInput {
  propositionId: string;
  liveAt: string;
}

export interface FreezeMarketForRevealInput {
  marketId: string;
  frozenAt: string;
}

export interface MarketPublicSnapshot {
  marketStatus: MarketStatus;
  timeProgressPercent: number;
  canBet: boolean;
  bettingClosesAt: string;
  publicProgress: PublicProgressViewModel;
}

export interface MarketSettlementInput {
  propositionId: string;
  marketId: string;
  resultKind: PropositionResultKind;
  winningOption: BinaryOption | null;
  voidReason: PropositionVoidReason | null;
  platformFeeBps: number;
  settledAt: string;
}

export type FinalizeSettlementInput = MarketSettlementInput;

export interface SettlementFinalizeResult {
  market: Market;
  positions: PositionBet[];
  totalPool: string;
  winningPool: string;
  platformFeeAmount: string;
  distributablePool: string;
  roundingRemainder: string;
}

export interface SettleValidationMarketInput {
  propositionId: string;
  settledAt: string;
  platformFeeBps?: number;
}

export interface ValidationSettlementSnapshot {
  propositionId: string;
  propositionStatus: PropositionStatus;
  marketId: string | null;
  marketStatus: MarketStatus | null;
  officialResult: {
    resultKind: PropositionResultKind;
    winningOption: BinaryOption | null;
    voidReason: PropositionVoidReason | null;
    resultComputedAt: string;
  };
  settledAt: string | null;
  settledBetCount: number;
  isVoidSettlement: boolean;
  isTieSettlement: boolean;
}

export interface RecordRewardSubmissionInput {
  propositionId: string;
  userId: string;
  responseId: string;
  recordedAt: string;
}

export interface RebindRewardLedgerToLatestResponseInput {
  propositionId: string;
  userId: string;
  responseId: string;
  reboundAt: string;
}

export interface RewardReviewResolutionInput {
  propositionId: string;
  responseId: string;
  reviewStatus: ResponseReviewStatus;
  isLatest: boolean;
  resolvedAt: string;
  reasonCodes?: string[];
}

export interface CurrentUserPositionViewModel {
  selectedOption: BinaryOption;
  stakeAmount: string;
  placedAt: string;
  settlementOutcome: PositionSettlementOutcome | null;
  grossPayout: string | null;
  pnl: string | null;
  refundAmount: string | null;
}

export interface RespondentRewardLedgerViewModel {
  ledgerId: string;
  propositionId: string;
  propositionTitle: string;
  responseId: string;
  sourceType: "response";
  status: RewardLedgerStatus;
  pendingAmount: string;
  finalAmount: string | null;
  reviewStatus: ResponseReviewStatus | null;
  reasonCode: RewardLedgerReasonCode | null;
  createdAt: string;
  finalizedAt: string | null;
  voidedAt: string | null;
  reversedAt: string | null;
  ledgerVersion: number;
  isCurrent: boolean;
}

export interface RespondentReputationSummaryMetricsViewModel {
  completionRate: number;
  validRate: number;
  partialValidRate: number;
  invalidRate: number;
  anomalyRate: number;
  fraudFlagCount: number;
  reviewedResponseCount: number;
}

export interface RespondentReputationSummaryViewModel {
  userId: string;
  reputationScore: number;
  reputationLevel: ReputationLevel;
  metrics: RespondentReputationSummaryMetricsViewModel;
  computedAt: string;
}

export interface RespondentReputationInternalViewModel {
  userId: string;
  reputationScore: number;
  reputationLevel: ReputationLevel;
  ruleVersion: string;
  metrics: UserReputationMetrics;
  computedAt: string;
}

export interface RespondentTagSummaryTagViewModel {
  tagKey: string;
  tagType: "quality_reputation" | "interest";
  confidenceScore: number;
  activatedAt: string;
}

export interface RespondentTagSummaryViewModel {
  userId: string;
  tags: RespondentTagSummaryTagViewModel[];
}

export interface RespondentTagInternalTagViewModel {
  tagKey: string;
  tagType: "quality_reputation" | "interest";
  tagValue: string;
  confidenceScore: number;
  sourceType: "reputation" | "participation";
  ruleVersion: string;
  metadata: unknown;
  activatedAt: string;
  expiresAt: string | null;
  updatedAt: string;
}

export interface RespondentTagInternalViewModel {
  userId: string;
  tags: RespondentTagInternalTagViewModel[];
}

export interface AdjudicationTaskViewModel {
  taskId: string;
  propositionId: string;
  title: string;
  description: string;
  options: [string, string];
  propositionStatus: PropositionStatus;
  taskStatus: string;
  hasSubmitted: boolean;
  timeRemainingSeconds: number;
  latestResponseStatus: ResponseReviewStatus | null;
  rewardStatus: RewardLedgerStatus | null;
  rewardPendingAmount: string | null;
  rewardFinalAmount: string | null;
  publicProgress: PublicProgressViewModel;
}

export interface SubmitAdjudicationResponseResult {
  taskView: AdjudicationTaskViewModel;
  responseId: string;
  duplicateRetry: boolean;
  reviewRequested: boolean;
  counterRebuildRequired: boolean;
}

export interface ValidationMarketViewModel {
  marketId: string;
  propositionId: string;
  title: string;
  category: PropositionCategory;
  options: [string, string];
  minBetAmount: string;
  marketStatus: MarketStatus;
  timeProgressPercent: number;
  bettingClosesAt: string;
  canBet: boolean;
  publicProgress: PublicProgressViewModel;
  currentUserPosition: CurrentUserPositionViewModel | null;
}

export interface PlaceValidationBetResult {
  marketView: ValidationMarketViewModel;
  positionId: string;
  execution: ValidationBetExecutionViewModel;
}

export type ValidationBetExecutionMode = "wallet_authenticated_account_write" | "demo_bypass";

export type ValidationBetExecutionStage =
  | "session_validated"
  | "account_write_submitted"
  | "position_recorded";

export interface ValidationBetExecutionViewModel {
  mode: ValidationBetExecutionMode;
  stage: ValidationBetExecutionStage;
  requiresWalletSignature: boolean;
  usesDemoFlow: boolean;
  chainId: number;
  txHash: string | null;
  submittedAt: string;
  recordedAt: string;
  statusLabel: string;
  detail: string;
}

export interface ResultSummaryViewModel {
  propositionId: string;
  resultKind: PropositionResultKind;
  winningOption: BinaryOption | null;
  voidReason: PropositionVoidReason | null;
  settledAt: string;
  currentUserRewardStatus: RewardLedgerStatus | null;
  currentUserSettlementOutcome: PositionSettlementOutcome | null;
}

export interface RespondentResultListItemViewModel {
  propositionId: string;
  propositionTitle: string;
  category: PropositionCategory;
  marketId: string | null;
  resultKind: PropositionResultKind;
  winningOption: BinaryOption | null;
  voidReason: PropositionVoidReason | null;
  settledAt: string;
  currentUserRewardStatus: RewardLedgerStatus | null;
  currentUserRewardAmount: string | null;
  currentUserSettlementOutcome: PositionSettlementOutcome | null;
  currentUserStakeAmount: string | null;
  currentUserGrossPayout: string | null;
  currentUserPnl: string | null;
  currentUserRefundAmount: string | null;
}

export interface RespondentResultSummaryTotalsViewModel {
  settledCount: number;
  resolvedCount: number;
  voidCount: number;
  wonCount: number;
  lostCount: number;
  refundCount: number;
  finalizedRewardAmount: string;
  pendingRewardAmount: string;
  totalStakeAmount: string;
  totalGrossPayout: string;
  totalPnl: string;
  totalRefundAmount: string;
}

export interface RespondentResultListViewModel {
  userId: string;
  totals: RespondentResultSummaryTotalsViewModel;
  items: RespondentResultListItemViewModel[];
}

export interface RespondentOpenPositionListItemViewModel {
  propositionId: string;
  propositionTitle: string;
  category: PropositionCategory;
  marketId: string;
  marketStatus: MarketStatus;
  selectedOption: BinaryOption;
  selectedOptionLabel: string;
  stakeAmount: string;
  placedAt: string;
  currentPublicPhase: PublicLifecyclePhase;
  publicResult: PublishedResultViewModel | null;
}

export interface RespondentOpenPositionCategoryExposureViewModel {
  category: PropositionCategory;
  positionCount: number;
  totalStakeAmount: string;
}

export interface RespondentAccountActivityItemViewModel {
  activityType:
    | "result_settled"
    | "reward_finalized"
    | "reward_pending"
    | "position_opened";
  propositionId: string;
  propositionTitle: string;
  category: PropositionCategory;
  occurredAt: string;
  amount: string | null;
  direction: "positive" | "negative" | "neutral";
  detail: string;
}

export interface RespondentResultOverviewLargestExposureViewModel {
  category: PropositionCategory;
  positionCount: number;
  totalStakeAmount: string;
  sharePercent: number;
}

export interface RespondentResultOverviewPnlExtremeViewModel {
  propositionId: string;
  propositionTitle: string;
  settledAt: string;
  amount: string;
}

export interface RespondentResultOverviewSummaryViewModel {
  trackedEntryCount: number;
  settledSharePercent: number;
  openPositionSharePercent: number;
  latestActivityAt: string | null;
  latestActivityTitle: string | null;
  largestExposure: RespondentResultOverviewLargestExposureViewModel | null;
}

export interface RespondentResultOverviewPerformanceViewModel {
  trackedSettledPnlCount: number;
  positiveSettledPnlCount: number;
  negativeSettledPnlCount: number;
  flatSettledPnlCount: number;
  positiveSettledPnlRate: number;
  averageSettledPnlAmount: string;
  bestSettledPnl: RespondentResultOverviewPnlExtremeViewModel | null;
  worstSettledPnl: RespondentResultOverviewPnlExtremeViewModel | null;
}

export interface RespondentResultOverviewAssetBreakdownViewModel {
  trackedAmount: string;
  settledGrossPayoutAmount: string;
  openStakeAmount: string;
  rewardAmount: string;
  finalizedRewardAmount: string;
  pendingRewardAmount: string;
  settledGrossPayoutSharePercent: number;
  openStakeSharePercent: number;
  rewardSharePercent: number;
}

export interface RespondentResultOverviewPositionStructureViewModel {
  totalCount: number;
  longCount: number;
  shortCount: number;
  scheduledCount: number;
  liveCount: number;
  frozenCount: number;
  revealingCount: number;
  longSharePercent: number;
  shortSharePercent: number;
  scheduledSharePercent: number;
  liveSharePercent: number;
  frozenSharePercent: number;
  revealingSharePercent: number;
}

export interface RespondentResultOverviewSettlementDistributionViewModel {
  trackedSettledPnlCount: number;
  positiveCount: number;
  negativeCount: number;
  flatCount: number;
  positiveSharePercent: number;
  negativeSharePercent: number;
  flatSharePercent: number;
}

export interface RespondentResultOverviewAnalyticsViewModel {
  assetBreakdown: RespondentResultOverviewAssetBreakdownViewModel;
  positionStructure: RespondentResultOverviewPositionStructureViewModel;
  settlementDistribution: RespondentResultOverviewSettlementDistributionViewModel;
}

export interface RespondentResultOverviewViewModel {
  userId: string;
  settledResults: RespondentResultListViewModel;
  openPositions: {
    totalCount: number;
    totalStakeAmount: string;
    items: RespondentOpenPositionListItemViewModel[];
    categoryExposure: RespondentOpenPositionCategoryExposureViewModel[];
  };
  recentActivity: RespondentAccountActivityItemViewModel[];
  summary: RespondentResultOverviewSummaryViewModel;
  performance: RespondentResultOverviewPerformanceViewModel;
  analytics: RespondentResultOverviewAnalyticsViewModel;
}

export interface RespondentAccountRewardSummaryViewModel {
  currentCount: number;
  pendingAmount: string;
  finalizedAmount: string;
}

export interface RespondentAccountOverviewViewModel {
  userId: string;
  rewards: RespondentRewardLedgerViewModel[];
  rewardSummary: RespondentAccountRewardSummaryViewModel;
  reputation: RespondentReputationSummaryViewModel;
  tags: RespondentTagSummaryViewModel;
  resultOverview: RespondentResultOverviewViewModel;
}

export type RespondentAccountAvatarStyle = "initial" | "image";

export type RespondentAccountLandingView =
  | "overview"
  | "performance"
  | "positions";

export type RespondentAccountProfileVisibility = "members" | "public";

export type RespondentAccountMetricView = "usdc" | "shares";

export type RespondentAccountTimeDisplay = "absolute" | "relative";

export type RespondentAccountExportPeriod = "30d" | "90d";

export type RespondentAccountDeveloperScope = "self" | "team";

export type RespondentAccountDeveloperEnvironment =
  | "sandbox"
  | "production";

export interface RespondentAccountNotificationPreferencesViewModel {
  emailSettlement: boolean;
  emailWatchlistUpdate: boolean;
  emailSecurityAlert: boolean;
  appOrderFilled: boolean;
  appSettlement: boolean;
  appWatchlistUpdate: boolean;
  reviewSubmissionReceived: boolean;
  reviewNeedMoreInfo: boolean;
  reviewDecision: boolean;
  challengeProgress: boolean;
  dailyDigest: boolean;
  quietHours: boolean;
  onlyImportant: boolean;
  syncEmailAndApp: boolean;
}

export interface RespondentAccountProfilePreferencesViewModel {
  avatarStyle: RespondentAccountAvatarStyle;
  landingView: RespondentAccountLandingView;
  profileVisibility: RespondentAccountProfileVisibility;
}

export interface RespondentAccountPrivacyPreferencesViewModel {
  showAccountSummary: boolean;
  showSettledHistory: boolean;
  allowActivityIndexing: boolean;
}

export interface RespondentAccountSecurityPreferencesViewModel {
  twoFactorEnabled: boolean;
  withdrawalConfirmEnabled: boolean;
}

export interface RespondentAccountDevicePreferencesViewModel {
  rememberTrustedDevice: boolean;
  sessionAlertsEnabled: boolean;
}

export interface RespondentAccountWalletPreferencesViewModel {
  walletConnected: boolean;
  signingReminderEnabled: boolean;
  metricView: RespondentAccountMetricView;
  timeDisplay: RespondentAccountTimeDisplay;
  highlightSettlement: boolean;
  hideSmallFills: boolean;
}

export interface RespondentAccountExportPreferencesViewModel {
  period: RespondentAccountExportPeriod;
  includeSettlementAttachment: boolean;
  maskWalletAddress: boolean;
}

export interface RespondentAccountDeveloperPreferencesViewModel {
  keyCreated: boolean;
  whitelistEnabled: boolean;
  environment: RespondentAccountDeveloperEnvironment;
  codeEnabled: boolean;
  scope: RespondentAccountDeveloperScope;
}

export interface RespondentAccountPreferencesViewModel {
  userId: string;
  notificationPreferences: RespondentAccountNotificationPreferencesViewModel;
  profile: RespondentAccountProfilePreferencesViewModel;
  privacy: RespondentAccountPrivacyPreferencesViewModel;
  security: RespondentAccountSecurityPreferencesViewModel;
  devices: RespondentAccountDevicePreferencesViewModel;
  wallet: RespondentAccountWalletPreferencesViewModel;
  exports: RespondentAccountExportPreferencesViewModel;
  developer: RespondentAccountDeveloperPreferencesViewModel;
  updatedAt: string | null;
}

export type UpdateRespondentAccountPreferencesInput = Omit<
  RespondentAccountPreferencesViewModel,
  "userId" | "updatedAt"
>;

export type RespondentAccountExportFormat = "json";

export type RespondentAccountExportStatus = "completed";

export interface RespondentAccountExportMetricsViewModel {
  rewardCount: number;
  settledResultCount: number;
  openPositionCount: number;
}

export interface RespondentAccountExportSettlementAttachmentViewModel {
  generatedAt: string;
  settledResultCount: number;
  openPositionCount: number;
  recentActivityCount: number;
}

export interface RespondentAccountExportItemViewModel {
  exportId: string;
  userId: string;
  status: RespondentAccountExportStatus;
  format: RespondentAccountExportFormat;
  period: RespondentAccountExportPeriod;
  includeSettlementAttachment: boolean;
  maskWalletAddress: boolean;
  requestedAt: string;
  completedAt: string;
  fileName: string;
  metrics: RespondentAccountExportMetricsViewModel;
}

export interface RespondentAccountExportArtifactViewModel {
  exportId: string;
  userId: string;
  status: RespondentAccountExportStatus;
  format: RespondentAccountExportFormat;
  period: RespondentAccountExportPeriod;
  includeSettlementAttachment: boolean;
  maskWalletAddress: boolean;
  requestedAt: string;
  completedAt: string;
  fileName: string;
  walletAddress: string | null;
  overview: RespondentAccountOverviewViewModel;
  preferences: RespondentAccountPreferencesViewModel;
  settlementAttachment: RespondentAccountExportSettlementAttachmentViewModel | null;
}

export interface RespondentAccountExportListViewModel {
  userId: string;
  totalCount: number;
  items: RespondentAccountExportItemViewModel[];
}

export interface CreateRespondentAccountExportInput {
  format?: RespondentAccountExportFormat;
}

export const DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES: UpdateRespondentAccountPreferencesInput =
  {
    notificationPreferences: {
      emailSettlement: false,
      emailWatchlistUpdate: true,
      emailSecurityAlert: true,
      appOrderFilled: true,
      appSettlement: true,
      appWatchlistUpdate: true,
      reviewSubmissionReceived: true,
      reviewNeedMoreInfo: true,
      reviewDecision: true,
      challengeProgress: true,
      dailyDigest: false,
      quietHours: false,
      onlyImportant: false,
      syncEmailAndApp: true,
    },
    profile: {
      avatarStyle: "initial",
      landingView: "overview",
      profileVisibility: "members",
    },
    privacy: {
      showAccountSummary: true,
      showSettledHistory: false,
      allowActivityIndexing: false,
    },
    security: {
      twoFactorEnabled: false,
      withdrawalConfirmEnabled: true,
    },
    devices: {
      rememberTrustedDevice: true,
      sessionAlertsEnabled: true,
    },
    wallet: {
      walletConnected: false,
      signingReminderEnabled: true,
      metricView: "usdc",
      timeDisplay: "absolute",
      highlightSettlement: true,
      hideSmallFills: true,
    },
    exports: {
      period: "30d",
      includeSettlementAttachment: true,
      maskWalletAddress: true,
    },
    developer: {
      keyCreated: false,
      whitelistEnabled: false,
      environment: "sandbox",
      codeEnabled: false,
      scope: "self",
    },
  };

export interface RespondentWatchlistItemViewModel {
  marketId: string;
  propositionId: string;
  propositionTitle: string;
  category: PropositionCategory;
  savedAt: string;
}

export interface RespondentWatchlistViewModel {
  userId: string;
  totalCount: number;
  items: RespondentWatchlistItemViewModel[];
}

export interface UpdateRespondentWatchlistInput {
  marketId: string;
}

export interface UpdateRespondentWatchlistResultViewModel {
  userId: string;
  marketId: string;
  propositionId: string;
  isSaved: boolean;
  savedAt: string | null;
}

export type PublicDiscoveryRankingKind = "hot" | "breaking";

export interface PublicDiscoveryCategoryViewModel {
  id: string;
  label: string;
}

export interface PublicDiscoveryRankingItemViewModel {
  id: string;
  href: string;
  title: string;
  score: number;
  change: number;
  categoryIds: string[];
  sparkline: number[];
  imageSrc?: string;
  imageAlt?: string;
  tileLabel?: string;
  tileTone?: "f1" | "neutral";
  isVerified?: boolean;
}

export interface PublicDiscoveryRankingViewModel {
  pageClassName: string;
  heroVariant: PublicDiscoveryRankingKind;
  dateLabel: string;
  title: string;
  description: string;
  categoryAriaLabel: string;
  listAriaLabel: string;
  categories: PublicDiscoveryCategoryViewModel[];
  items: PublicDiscoveryRankingItemViewModel[];
}

export interface PublicDiscoverPageSectionViewModel {
  href: string;
  label: string;
  marketIds: string[];
  moreHref: string;
}

export interface PublicDiscoverPageViewModel {
  featuredMarketIds: string[];
  sections: PublicDiscoverPageSectionViewModel[];
}

export interface PublicLatestTopicItemViewModel {
  id: string;
  label: string;
  marketIds: string[];
}

export interface PublicLatestTopicsViewModel {
  items: PublicLatestTopicItemViewModel[];
}

export interface PublicCategorySidebarItemViewModel {
  label: string;
  count: string;
}

export interface PublicCategoryDirectoryViewModel {
  title: string;
  sidebarItems: PublicCategorySidebarItemViewModel[];
  featuredMarketId: string | null;
  marketIds: string[];
}

export interface FrontendIsolationPolicyView {
  surface: FrontendSurface;
  allowedFields: readonly string[];
  forbiddenFields: readonly string[];
  crossSurfaceLinksAllowed: boolean;
}
