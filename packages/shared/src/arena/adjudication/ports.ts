import type {
  AdjudicationTaskViewModel,
  PublicProgressViewModel,
  RespondentTaskViewModel,
  SubmitResponseInput,
} from "../dto.js";
import type {
  DispatchTask,
  EffectiveSampleCounter,
  Proposition,
  Response,
  ResponseReview,
  RewardLedger,
} from "../entities.js";
import type {
  ReputationLevel,
  BinaryOption,
  PropositionCategory,
  PropositionResultKind,
  PropositionVoidReason,
  ResponseReviewStatus,
  RewardLedgerStatus,
} from "../enums.js";
import type {
  DispatchIneligibilityReason,
  DispatchPriorityBucket,
  DispatchSelectionBlockReason,
  ReviewFlag,
} from "./constants.js";

export interface ArenaIdGeneratorPort {
  next(namespace: string): string;
}

export interface DispatchCandidateSnapshot {
  userId: string;
  userStatus: "active" | "inactive";
  matchesSampleConstraints: boolean;
  activeTaskCount: number;
  hasActiveTaskForProposition: boolean;
  hasSubmittedTaskForProposition: boolean;
  isInCooldown: boolean;
}

export interface DispatchEligibilityResult {
  eligible: boolean;
  reason: DispatchIneligibilityReason | null;
}

export interface DispatchCandidateRankingSnapshot
  extends DispatchCandidateSnapshot {
  reputationLevel: ReputationLevel | null;
  reputationScore: number | null;
  reviewedResponseCount: number;
  invalidRate: number;
  anomalyRate: number;
  fraudFlagCount: number;
  activeTagKeys: string[];
}

export interface DispatchCandidateScoreTrace {
  userId: string;
  eligible: boolean;
  selected: boolean;
  blockReason: DispatchSelectionBlockReason | null;
  priorityBucket: DispatchPriorityBucket;
  baseScore: number;
  qualityAdjustment: number;
  interestAdjustment: number;
  finalScore: number | null;
  matchedInterestTag: string | null;
  reasons: string[];
}

export interface DispatchSelectionInput {
  proposition: Proposition;
  candidates: DispatchCandidateRankingSnapshot[];
  maxAssignments: number;
}

export interface DispatchSelectionResult {
  ruleVersion: string;
  propositionCategory: PropositionCategory;
  maxAssignments: number;
  generalReserveCount: number;
  selectedUserIds: string[];
  candidates: DispatchCandidateScoreTrace[];
}

export interface StartDispatchTaskInput {
  taskId: string;
  userId: string;
  startedAt: string;
}

export interface SkipDispatchTaskInput {
  taskId: string;
  userId: string;
  skippedAt: string;
  skipReason: string;
}

export interface ExpireDispatchTaskInput {
  taskId: string;
  expiredAt: string;
  expiryReason: string;
}

export interface SubmitResponseResult {
  response: Response;
  task: DispatchTask;
  reviewRequested: boolean;
  duplicateRetry: boolean;
  counterRebuildRequired: boolean;
}

export interface FinalizeResponseReviewInput {
  propositionId: string;
  responseId: string;
  reviewedAt: string;
}

export interface ReviewEvaluationContext {
  proposition: Proposition;
  task: DispatchTask;
  response: Response;
  responseHistory: Response[];
}

export interface ReviewEvaluationResult {
  status: ResponseReviewStatus;
  qualityScore: number;
  flags: ReviewFlag[];
}

export interface ReviewFinalizeResult {
  review: ResponseReview;
  counterRebuildRequired: boolean;
  rewardSyncRequired: boolean;
}

export interface DispatchTransitionResult {
  task: DispatchTask;
  requeueRecommended: boolean;
}

export interface AdjudicationAggregate {
  propositionId: string;
  effectiveSampleCount: number;
  validCount: number;
  partialValidCount: number;
  option0Votes: number;
  option1Votes: number;
  winningOption: BinaryOption | null;
  resultKind: PropositionResultKind;
  voidReason: PropositionVoidReason | null;
}

export interface RewardLedgerAdjudicationSnapshot {
  status: RewardLedgerStatus;
  pendingAmount: string;
  finalAmount: string | null;
}

export interface BuildAdjudicationTaskViewModelInput {
  proposition: Proposition;
  task: DispatchTask;
  latestReview: ResponseReview | null;
  rewardLedger?: RewardLedgerAdjudicationSnapshot | null;
  publicProgress: PublicProgressViewModel;
  now: string;
}

export interface BuildRespondentTaskViewModelInput {
  proposition: Proposition;
  task: DispatchTask;
}

export interface PropositionReadPort {
  getById(propositionId: string): Promise<Proposition | null>;
}

export interface DispatchTaskRepositoryPort {
  create(task: DispatchTask): Promise<DispatchTask>;
  update(task: DispatchTask): Promise<DispatchTask>;
  getById(taskId: string): Promise<DispatchTask | null>;
  listByUser(userId: string): Promise<DispatchTask[]>;
  findActiveByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<DispatchTask | null>;
  listByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<DispatchTask[]>;
}

export interface ResponseRepositoryPort {
  create(response: Response): Promise<Response>;
  update(response: Response): Promise<Response>;
  getById(responseId: string): Promise<Response | null>;
  findLatestByTaskId(taskId: string): Promise<Response | null>;
  findLatestByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<Response | null>;
  listByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<Response[]>;
  listLatestByProposition(propositionId: string): Promise<Response[]>;
}

export interface ResponseReviewRepositoryPort {
  create(review: ResponseReview): Promise<ResponseReview>;
  update(review: ResponseReview): Promise<ResponseReview>;
  getByResponseId(responseId: string): Promise<ResponseReview | null>;
  listByProposition(propositionId: string): Promise<ResponseReview[]>;
}

export interface EffectiveSampleCounterRepositoryPort {
  upsert(counter: EffectiveSampleCounter): Promise<EffectiveSampleCounter>;
  getByPropositionId(
    propositionId: string,
  ): Promise<EffectiveSampleCounter | null>;
}

export interface RewardLedgerReadPort {
  getByPropositionAndUser(
    propositionId: string,
    userId: string,
  ): Promise<RewardLedger | null>;
  listByUser(userId: string): Promise<RewardLedger[]>;
}

export interface DispatchEngineDependencies {
  ids: ArenaIdGeneratorPort;
  propositionRead: PropositionReadPort;
  tasks: DispatchTaskRepositoryPort;
}

export interface ResponseEngineDependencies {
  ids: ArenaIdGeneratorPort;
  propositionRead: PropositionReadPort;
  tasks: DispatchTaskRepositoryPort;
  responses: ResponseRepositoryPort;
  reviews: ResponseReviewRepositoryPort;
}

export interface ReviewEngineDependencies {
  propositionRead: PropositionReadPort;
  tasks: DispatchTaskRepositoryPort;
  responses: ResponseRepositoryPort;
  reviews: ResponseReviewRepositoryPort;
}

export interface SampleCounterEngineDependencies {
  ids: ArenaIdGeneratorPort;
  responses: ResponseRepositoryPort;
  reviews: ResponseReviewRepositoryPort;
  counters: EffectiveSampleCounterRepositoryPort;
}

export interface BuildAggregateInput {
  proposition: Proposition;
  latestResponses: Response[];
  reviews: ResponseReview[];
  counter: EffectiveSampleCounter | null;
}

export type SubmitResponseCommand = SubmitResponseInput;

export type RespondentTaskView = RespondentTaskViewModel;
