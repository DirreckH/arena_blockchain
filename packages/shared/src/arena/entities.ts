import type {
  ArenaPropositionStructure,
  ArenaPropositionType,
  ArenaRollingMode,
  ArenaSettlementTarget,
  BinaryOption,
  DispatchTaskStatus,
  MarketStatus,
  PositionSettlementOutcome,
  PropositionCategory,
  PropositionResultKind,
  PropositionStatus,
  PropositionVoidReason,
  ResponseReviewStatus,
  RewardLedgerReasonCode,
  RewardLedgerSourceType,
  RewardLedgerStatus,
  ReputationLevel,
  UserTagSourceType,
  UserTagType,
} from "./enums.js";

export interface Proposition {
  id: string;
  chainPkId: number | null;
  type: ArenaPropositionType;
  structure: ArenaPropositionStructure;
  rollingMode: ArenaRollingMode;
  marketEnabled: boolean;
  settlementTarget: ArenaSettlementTarget;
  category: PropositionCategory;
  title: string;
  description: string;
  options: [string, string];
  sampleConstraints: string[];
  minEffectiveSample: number;
  minBetAmount: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  rewardBudget: string;
  baseResponseReward: string;
  status: PropositionStatus;
  resultKind: PropositionResultKind | null;
  winningOption: BinaryOption | null;
  voidReason: PropositionVoidReason | null;
  publishedAt: string | null;
  liveAt: string | null;
  frozenAt: string | null;
  revealStartedAt: string | null;
  resultComputedAt: string | null;
  settledAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchTask {
  id: string;
  propositionId: string;
  userId: string;
  status: DispatchTaskStatus;
  assignedAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  expiresAt: string;
  skipReason: string | null;
  expiryReason: string | null;
  cooldownUntil: string | null;
}

export interface Response {
  id: string;
  propositionId: string;
  taskId: string;
  userId: string;
  responseVersion: number;
  isLatest: boolean;
  selectedOption: BinaryOption;
  confirmationOption: BinaryOption;
  clientStartedAt: string;
  clientSubmittedAt: string;
  understandingAck: boolean;
  submittedAt: string;
}

export interface ResponseReview {
  id: string;
  responseId: string;
  status: ResponseReviewStatus;
  qualityScore: number;
  flags: string[];
  reasonCodes: string[];
  reviewedByUserId: string | null;
  reviewedAt: string | null;
}

export interface EffectiveSampleCounter {
  id: string;
  propositionId: string;
  totalResponses: number;
  reviewedResponses: number;
  validCount: number;
  partialValidCount: number;
  invalidCount: number;
  updatedAt: string;
}

export interface Market {
  id: string;
  propositionId: string;
  settlementTarget: ArenaSettlementTarget;
  status: MarketStatus;
  chainMarketId?: string | null;
  chainStatus?: string | null;
  currentPublicProgress: unknown | null;
  lastPublicResult: unknown | null;
  liveAt: string | null;
  frozenAt: string | null;
  settlingAt: string | null;
  settledAt: string | null;
}

export interface PositionBet {
  id: string;
  marketId: string;
  propositionId: string;
  userId: string;
  selectedOption: BinaryOption;
  stakeAmount: string;
  placedAt: string;
  settlementOutcome: PositionSettlementOutcome | null;
  grossPayout: string | null;
  pnl: string | null;
  refundAmount: string | null;
  settledAt: string | null;
}

export interface RewardLedger {
  id: string;
  userId: string;
  propositionId: string;
  responseId: string;
  sourceType: RewardLedgerSourceType;
  sourceId: string;
  ledgerVersion: number;
  pendingAmount: string;
  finalAmount: string | null;
  status: RewardLedgerStatus;
  reviewStatus: ResponseReviewStatus | null;
  createdAt: string;
  finalizedAt: string | null;
  voidedAt: string | null;
  reversedAt: string | null;
  reversalOfLedgerId: string | null;
  reasonCode: RewardLedgerReasonCode | null;
}

export interface UserReputationMetrics {
  assignedTaskCount: number;
  closedTaskCount: number;
  submittedTaskCount: number;
  reviewedResponseCount: number;
  validCount: number;
  partialValidCount: number;
  invalidCount: number;
  fraudFlagCount: number;
  flaggedReviewCount: number;
  anomalyCount: number;
  completionRate: number;
  validRate: number;
  partialValidRate: number;
  invalidRate: number;
  fraudRate: number;
  anomalyRate: number;
}

export interface UserReputation {
  id: string;
  userId: string;
  reputationScore: number;
  reputationLevel: ReputationLevel;
  ruleVersion: string;
  metrics: UserReputationMetrics;
  computedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserTag {
  id: string;
  userId: string;
  tagKey: string;
  tagType: UserTagType;
  tagValue: string;
  confidenceScore: number;
  sourceType: UserTagSourceType;
  ruleVersion: string;
  metadata: unknown;
  activatedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
