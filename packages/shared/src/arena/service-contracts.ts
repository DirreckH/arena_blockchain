import type {
  AdjudicationTaskViewModel,
  ClosureReadinessSnapshot,
  AssignDispatchTaskInput,
  CreateDispatchTasksForPropositionInput,
  CreatePropositionInput,
  EffectiveSampleCounterSnapshot,
  FreezeMarketForRevealInput,
  MarketPublicSnapshot,
  MarketSettlementInput,
  OpenMarketForLiveInput,
  PlacePositionBetInput,
  PrepareValidationBetResult,
  PlaceValidationBetResult,
  PublicProgressViewModel,
  PropositionRuntimeSnapshot,
  PublishPropositionLiveInput,
  RebindRewardLedgerToLatestResponseInput,
  RecordRewardSubmissionInput,
  RespondentTaskViewModel,
  RespondentTagInternalViewModel,
  RespondentTagSummaryViewModel,
  RespondentRewardLedgerViewModel,
  RespondentReputationInternalViewModel,
  RespondentReputationSummaryViewModel,
  RespondentAccountOverviewViewModel,
  RespondentAccountPreferencesViewModel,
  RespondentAccountExportArtifactViewModel,
  RespondentAccountExportListViewModel,
  RespondentResultOverviewViewModel,
  RespondentResultListViewModel,
  ResultSummaryViewModel,
  RespondentWatchlistViewModel,
  PublicCategoryDirectoryViewModel,
  PublicCategoryDirectoryIndexViewModel,
  PublicClosingSoonViewModel,
  PublicDiscoverPageViewModel,
  PublicDiscoveryRankingKind,
  PublicDiscoveryRankingViewModel,
  PublicIntegrityOverviewViewModel,
  PublicLatestTopicsViewModel,
  PublicSettledResultsViewModel,
  RewardReviewResolutionInput,
  ReviewPendingResponseInput,
  ReviewResponseInput,
  SchedulePropositionInput,
  SettlementFinalizeResult,
  SettleValidationMarketInput,
  SubmitAdjudicationResponseResult,
  SubmitResponseInput,
  CreateRespondentAccountExportInput,
  UpdateRespondentWatchlistInput,
  UpdateRespondentWatchlistResultViewModel,
  ValidationSettlementSnapshot,
  ValidationMarketViewModel,
  UpdateRespondentAccountPreferencesInput,
} from "./dto.js";
import type {
  ArenaDiscussionThreadViewModel,
  CreateArenaDiscussionCommentInput,
} from "./discussion.js";
import type {
  DispatchTask,
  Market,
  PositionBet,
  Proposition,
  Response,
  ResponseReview,
  RewardLedger,
  RewardPayout,
  UserReputation,
  UserTag,
} from "./entities.js";

export interface PropositionServiceContract {
  createProposition(input: CreatePropositionInput): Promise<Proposition>;
  approveOrScheduleProposition(
    input: SchedulePropositionInput,
  ): Promise<Proposition>;
  publishLiveProposition(
    input: PublishPropositionLiveInput,
  ): Promise<Proposition>;
  getById(propositionId: string): Promise<Proposition | null>;
  getPropositionRuntimeSnapshot(
    propositionId: string,
  ): Promise<PropositionRuntimeSnapshot | null>;
}

export interface DispatchServiceContract {
  createDispatchTasksForProposition(
    input: CreateDispatchTasksForPropositionInput,
  ): Promise<DispatchTask[]>;
  assign(input: AssignDispatchTaskInput): Promise<DispatchTask>;
  startTask(taskId: string, userId: string, startedAt: string): Promise<DispatchTask>;
  skip(taskId: string, userId: string, skippedAt: string): Promise<DispatchTask>;
  expire(taskId: string, expiredAt: string): Promise<DispatchTask>;
  listAssignedTasksForUser(userId: string): Promise<RespondentTaskViewModel[]>;
  getTaskView(
    taskId: string,
    userId: string,
  ): Promise<AdjudicationTaskViewModel | null>;
  listTaskViews(userId: string): Promise<AdjudicationTaskViewModel[]>;
}

export interface ResponseServiceContract {
  submit(input: SubmitResponseInput): Promise<Response>;
  getLatest(propositionId: string, userId: string): Promise<Response | null>;
  getUserResponseForTask(taskId: string, userId: string): Promise<Response | null>;
}

export interface ReviewServiceContract {
  finalize(input: ReviewResponseInput): Promise<ResponseReview>;
  getByResponseId(responseId: string): Promise<ResponseReview | null>;
  reviewPendingResponse(
    input: ReviewPendingResponseInput,
  ): Promise<ResponseReview>;
  getReviewForResponse(responseId: string): Promise<ResponseReview | null>;
  listPendingReviewsByProposition(
    propositionId: string,
  ): Promise<ResponseReview[]>;
}

export interface SampleCounterServiceContract {
  rebuildCounterForProposition(
    propositionId: string,
  ): Promise<EffectiveSampleCounterSnapshot>;
  getCounterSnapshot(
    propositionId: string,
  ): Promise<EffectiveSampleCounterSnapshot>;
  getPublicProgress(
    propositionId: string,
  ): Promise<PublicProgressViewModel>;
  maybeRefreshPublicProgress(
    propositionId: string,
  ): Promise<PublicProgressViewModel>;
}

export interface RevealPreparationServiceContract {
  evaluateClosureReadiness(
    propositionId: string,
    now: string,
  ): Promise<ClosureReadinessSnapshot>;
}

export interface MarketServiceContract {
  ensureForProposition(propositionId: string): Promise<Market>;
  openForLive(input: OpenMarketForLiveInput): Promise<Market>;
  freezeForReveal(input: FreezeMarketForRevealInput): Promise<Market>;
  placeBet(input: PlacePositionBetInput): Promise<PositionBet>;
  getPublicSnapshot(
    marketId: string,
    userId?: string,
  ): Promise<MarketPublicSnapshot | null>;
  getMarketView(
    marketId: string,
    userId?: string,
  ): Promise<ValidationMarketViewModel | null>;
  listMarketViews(userId?: string): Promise<ValidationMarketViewModel[]>;
}

export interface SettlementServiceContract {
  finalize(input: MarketSettlementInput): Promise<SettlementFinalizeResult>;
}

export interface ValidationSettlementServiceContract {
  settleValidationMarket(
    input: SettleValidationMarketInput,
  ): Promise<ValidationSettlementSnapshot>;
  getSettlementSnapshot(
    propositionId: string,
  ): Promise<ValidationSettlementSnapshot>;
}

export interface RewardServiceContract {
  recordSubmission(
    input: RecordRewardSubmissionInput,
  ): Promise<RewardLedger>;
  rebindToLatestResponse(
    input: RebindRewardLedgerToLatestResponseInput,
  ): Promise<RewardLedger>;
  resolveFromReview(
    input: RewardReviewResolutionInput,
  ): Promise<RewardLedger>;
  getByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<RewardLedger | null>;
  listByUser(userId: string): Promise<RewardLedger[]>;
  listPayoutsByUser(userId: string): Promise<RewardPayout[]>;
}

export interface ReputationServiceContract {
  refreshForUser(userId: string): Promise<UserReputation>;
  getByUserId(userId: string): Promise<UserReputation>;
  getSummaryForUser(
    userId: string,
  ): Promise<RespondentReputationSummaryViewModel>;
  getInternalViewForUser(
    userId: string,
  ): Promise<RespondentReputationInternalViewModel>;
}

export interface TagServiceContract {
  refreshForUser(userId: string): Promise<UserTag[]>;
  listCurrentByUser(userId: string): Promise<UserTag[]>;
  getSummaryForUser(userId: string): Promise<RespondentTagSummaryViewModel>;
  getInternalViewForUser(
    userId: string,
  ): Promise<RespondentTagInternalViewModel>;
}

export interface AdjudicationSurfaceContract {
  listTasksForUser(userId: string): Promise<AdjudicationTaskViewModel[]>;
  getTaskForUser(
    taskId: string,
    userId: string,
  ): Promise<AdjudicationTaskViewModel | null>;
  submitResponseForUser(
    input: SubmitResponseInput,
  ): Promise<SubmitAdjudicationResponseResult>;
}

export interface ValidationSurfaceContract {
  listMarkets(userId?: string): Promise<ValidationMarketViewModel[]>;
  getMarket(
    marketId: string,
    userId?: string,
  ): Promise<ValidationMarketViewModel | null>;
  prepareBetForUser(
    input: PlacePositionBetInput,
  ): Promise<PrepareValidationBetResult>;
  placeBetForUser(
    input: PlacePositionBetInput,
  ): Promise<PlaceValidationBetResult>;
}

export interface ResultSurfaceContract {
  getResultSummary(
    propositionId: string,
    userId?: string,
  ): Promise<ResultSummaryViewModel>;
  listResultsForUser(userId: string): Promise<RespondentResultListViewModel>;
  getResultOverviewForUser(
    userId: string,
  ): Promise<RespondentResultOverviewViewModel>;
}

export interface RespondentRewardSurfaceContract {
  listRewardsForUser(userId: string): Promise<RespondentRewardLedgerViewModel[]>;
}

export interface RespondentReputationSurfaceContract {
  getReputationForUser(
    userId: string,
  ): Promise<RespondentReputationSummaryViewModel>;
}

export interface RespondentTagSurfaceContract {
  getTagsForUser(userId: string): Promise<RespondentTagSummaryViewModel>;
}

export interface RespondentAccountSurfaceContract {
  getAccountOverviewForUser(
    userId: string,
  ): Promise<RespondentAccountOverviewViewModel>;
  getAccountPreferencesForUser(
    userId: string,
  ): Promise<RespondentAccountPreferencesViewModel>;
  updateAccountPreferencesForUser(
    userId: string,
    input: UpdateRespondentAccountPreferencesInput,
  ): Promise<RespondentAccountPreferencesViewModel>;
  listAccountExportsForUser(
    userId: string,
  ): Promise<RespondentAccountExportListViewModel>;
  createAccountExportForUser(
    userId: string,
    input: CreateRespondentAccountExportInput,
  ): Promise<RespondentAccountExportArtifactViewModel>;
}

export interface RespondentWatchlistSurfaceContract {
  getWatchlistForUser(userId: string): Promise<RespondentWatchlistViewModel>;
  saveWatchlistItemForUser(
    userId: string,
    input: UpdateRespondentWatchlistInput,
  ): Promise<UpdateRespondentWatchlistResultViewModel>;
  removeWatchlistItemForUser(
    userId: string,
    marketId: string,
  ): Promise<UpdateRespondentWatchlistResultViewModel>;
}

export interface DiscussionSurfaceContract {
  getDiscussionThread(
    marketId: string,
    userId?: string,
  ): Promise<ArenaDiscussionThreadViewModel>;
  createDiscussionComment(
    input: CreateArenaDiscussionCommentInput,
  ): Promise<ArenaDiscussionThreadViewModel>;
}

export interface PublicDiscoverySurfaceContract {
  getHome(): Promise<PublicDiscoverPageViewModel>;
  getRanking(
    kind: PublicDiscoveryRankingKind,
  ): Promise<PublicDiscoveryRankingViewModel>;
  getLatestTopics(): Promise<PublicLatestTopicsViewModel>;
  getClosingSoon(): Promise<PublicClosingSoonViewModel>;
  getCategoryDirectoryIndex(): Promise<PublicCategoryDirectoryIndexViewModel>;
  getCategoryDirectory(
    pathname: string,
  ): Promise<PublicCategoryDirectoryViewModel | null>;
}

export interface PublicResultSurfaceContract {
  listSettledResults(): Promise<PublicSettledResultsViewModel>;
  getIntegrityOverview(
    propositionId?: string,
  ): Promise<PublicIntegrityOverviewViewModel>;
}
