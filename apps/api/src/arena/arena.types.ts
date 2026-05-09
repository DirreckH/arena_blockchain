import type {
  BetSettlementOutcome,
  MarketStatus,
  PropositionCategory,
  PropositionStatus,
  PropositionResultKind,
  PropositionVoidReason,
  ResponseReviewStatus,
  RewardLedgerReasonCode,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { DispatchPriorityBucket } from "@arena/shared";

import type { BinaryOption, TimestampInput } from "./arena.utils";

export interface CreateDraftPropositionInput {
  id?: string;
  chainPkId?: bigint | null;
  category?: PropositionCategory;
  title: string;
  description: string;
  options: [string, string];
  sampleConstraints?: string[];
  minEffectiveSample: number;
  minBetAmount: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  rewardBudget: string;
  baseResponseReward: string;
  marketEnabled?: boolean;
  createdByUserId: string;
}

export interface CreatePropositionInput {
  id?: string;
  category?: PropositionCategory;
  title: string;
  description: string;
  options: [string, string];
  sampleConstraints?: string[];
  minEffectiveSample: number;
  minBetAmount: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  rewardBudget: string;
  baseResponseReward: string;
  marketEnabled: boolean;
  createdByUserId: string;
}

export interface ApproveOrSchedulePropositionInput {
  propositionId: string;
  publishedAt: TimestampInput;
  updatedByUserId: string;
}

export interface PublishLivePropositionInput {
  propositionId: string;
  liveAt: TimestampInput;
  updatedByUserId: string;
}

export interface SchedulePropositionInput {
  propositionId: string;
  publishedAt: TimestampInput;
  updatedByUserId: string;
}

export interface ActivatePropositionLiveInput {
  propositionId: string;
  liveAt: TimestampInput;
  updatedByUserId: string;
}

export interface FreezePropositionInput {
  propositionId: string;
  frozenAt: TimestampInput;
  updatedByUserId: string;
}

export interface StartPropositionRevealInput {
  propositionId: string;
  revealStartedAt: TimestampInput;
  updatedByUserId: string;
}

export interface RecordOfficialResultInput {
  propositionId: string;
  resultKind: PropositionResultKind;
  winningOption: BinaryOption | null;
  voidReason: PropositionVoidReason | null;
  resultComputedAt: TimestampInput;
  updatedByUserId: string;
}

export interface MarkPropositionSettledInput {
  propositionId: string;
  settledAt: TimestampInput;
  updatedByUserId: string;
}

export interface ComputeOfficialResultInput {
  propositionId: string;
  resultComputedAt: TimestampInput;
  updatedByUserId: string;
}

export interface FinalizeConsensusSettlementInput {
  propositionId: string;
  settledAt: TimestampInput;
  platformFeeBps: number;
  updatedByUserId: string;
}

export interface FinalizeConsensusClosureInput {
  propositionId: string;
  resultComputedAt: TimestampInput;
  settledAt: TimestampInput;
  platformFeeBps: number;
  updatedByUserId: string;
}

export interface OfficialResultSnapshot {
  propositionId: string;
  resultKind: PropositionResultKind;
  winningOption: BinaryOption | null;
  voidReason: PropositionVoidReason | null;
  resultComputedAt: string;
}

export interface ClosePropositionInput {
  propositionId: string;
  closedAt: TimestampInput;
  updatedByUserId: string;
}

export interface AssignDispatchTaskInput {
  id?: string;
  propositionId: string;
  userId: string;
  assignedAt: TimestampInput;
  expiresAt: TimestampInput;
}

export interface CreateDispatchTasksForPropositionInput {
  propositionId: string;
  userIds: string[];
  assignedAt: TimestampInput;
  expiresAt: TimestampInput;
  maxAssignments?: number;
}

export interface PreviewDispatchCandidatesInput {
  propositionId: string;
  userIds: string[];
  assignedAt: TimestampInput;
  maxAssignments?: number;
}

export interface DispatchCandidateInternalViewModel {
  userId: string;
  eligible: boolean;
  selected: boolean;
  blockReason: string | null;
  priorityBucket: DispatchPriorityBucket;
  baseScore: number;
  qualityAdjustment: number;
  interestAdjustment: number;
  finalScore: number | null;
  matchedInterestTag: string | null;
  reasons: string[];
}

export interface DispatchSelectionInternalViewModel {
  propositionId: string;
  propositionCategory: PropositionCategory;
  ruleVersion: string;
  maxAssignments: number;
  generalReserveCount: number;
  selectedUserIds: string[];
  candidates: DispatchCandidateInternalViewModel[];
}

export interface StartDispatchTaskInput {
  taskId: string;
  userId: string;
  startedAt: TimestampInput;
}

export interface SubmitDispatchTaskInput {
  taskId: string;
  userId: string;
  submittedAt: TimestampInput;
}

export interface SkipDispatchTaskInput {
  taskId: string;
  userId: string;
  skippedAt: TimestampInput;
  skipReason: string;
}

export interface ExpireDispatchTaskInput {
  taskId: string;
  expiredAt: TimestampInput;
  expiryReason: string;
}

export interface SubmitResponseInput {
  id?: string;
  propositionId: string;
  taskId: string;
  userId: string;
  selectedOption: BinaryOption;
  confirmationOption: BinaryOption;
  clientStartedAt: TimestampInput;
  clientSubmittedAt: TimestampInput;
  submittedAt: TimestampInput;
  understandingAck: boolean;
  responsePayload?: Prisma.InputJsonValue;
}

export interface GetUserResponseForTaskInput {
  taskId: string;
  userId: string;
}

export interface ReviewResponseInput {
  responseId: string;
  reviewedAt: TimestampInput;
  reviewedByUserId?: string;
  qualityScore?: number;
  flags?: string[];
  reasonCodes?: string[];
}

export interface ReviewPendingResponseInput {
  responseId: string;
  reviewedAt: TimestampInput;
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

export interface PublicProgressSnapshot {
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
  lastPublishedResult: {
    resultKind: PropositionResultKind;
    winningOption: BinaryOption | null;
    voidReason: PropositionVoidReason | null;
    publishedAt: string;
  } | null;
}

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

export interface EvaluateClosureReadinessInput {
  propositionId: string;
  now: TimestampInput;
}

export interface FreezeForRevealInput {
  propositionId: string;
  now: TimestampInput;
  updatedByUserId: string;
}

export interface ComputeAndRecordOfficialResultInput {
  propositionId: string;
  now: TimestampInput;
  updatedByUserId: string;
}

export interface OfficialResultAggregateSnapshot {
  propositionId: string;
  effectiveSampleCount: number;
  validCount: number;
  partialValidCount: number;
  resultKind: PropositionResultKind;
  winningOption: BinaryOption | null;
  voidReason: PropositionVoidReason | null;
}

export interface ComputeOfficialResultSnapshot {
  propositionId: string;
  propositionStatus: PropositionStatus;
  marketStatus: MarketStatus | null;
  counterSnapshot: EffectiveSampleCounterSnapshot;
  aggregate: OfficialResultAggregateSnapshot;
  officialResult: OfficialResultSnapshot;
  revealStartedAt: string | null;
  resultComputedAt: string | null;
}

export interface FinalizeRevealPreparationInput {
  propositionId: string;
  now: TimestampInput;
  updatedByUserId: string;
}

export interface RevealPreparationSnapshot {
  propositionId: string;
  readiness: ClosureReadinessSnapshot;
  propositionStatus: PropositionStatus;
  marketStatus: MarketStatus | null;
  frozenAt: string | null;
  revealStartedAt: string | null;
  resultComputedAt: string | null;
  aggregate: OfficialResultAggregateSnapshot;
  officialResult: OfficialResultSnapshot;
}

export interface CreateMarketInput {
  id?: string;
  propositionId: string;
}

export interface ActivateMarketInput {
  propositionId: string;
  liveAt: TimestampInput;
}

export interface FreezeMarketInput {
  marketId?: string;
  propositionId?: string;
  frozenAt: TimestampInput;
}

export interface StartMarketSettlingInput {
  marketId: string;
  settlingAt: TimestampInput;
}

export interface SettleBetOutcomeInput {
  betId: string;
  outcome: BetSettlementOutcome;
  settledAt: TimestampInput;
  grossPayout?: string | null;
  pnl?: string | null;
  refundAmount?: string | null;
}

export interface SettleMarketInput {
  propositionId: string;
  settledAt: TimestampInput;
  platformFeeBps: number;
}

export interface SettleValidationMarketInput {
  propositionId: string;
  settledAt: TimestampInput;
  platformFeeBps?: number;
}

export interface ValidationSettlementSnapshot {
  propositionId: string;
  propositionStatus: PropositionStatus;
  marketId: string | null;
  marketStatus: MarketStatus | null;
  officialResult: OfficialResultSnapshot;
  settledAt: string | null;
  settledBetCount: number;
  isVoidSettlement: boolean;
  isTieSettlement: boolean;
}

export interface InternalSettleMarketWithOutcomesInput {
  // Internal/testing-only adapter shape retained for legacy harnesses.
  marketId: string;
  propositionId: string;
  settledAt: TimestampInput;
  lastPublicResult?: Prisma.InputJsonValue;
  currentPublicProgress?: Prisma.InputJsonValue;
  betOutcomes: readonly SettleBetOutcomeInput[];
}

export interface PlaceBetInput {
  id?: string;
  propositionId: string;
  marketId: string;
  userId: string;
  chainId: number;
  selectedOption: BinaryOption;
  stakeAmount: string;
  placedAt: TimestampInput;
}

export interface CreatePendingRewardInput {
  id?: string;
  propositionId: string;
  responseId: string;
  userId: string;
  createdAt: TimestampInput;
}

export interface ResolveRewardFromReviewInput {
  propositionId: string;
  responseId: string;
  reviewStatus: ResponseReviewStatus;
  resolvedAt: TimestampInput;
  isLatest: boolean;
  reasonCodes?: string[];
}

export interface ReverseRewardLedgerInput {
  ledgerId: string;
  reversedAt: TimestampInput;
  reasonCode: RewardLedgerReasonCode;
}

export interface ReviewFinalizationInput extends ReviewResponseInput {
  status: ResponseReviewStatus;
}
