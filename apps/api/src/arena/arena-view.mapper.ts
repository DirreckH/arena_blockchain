import type {
  Bet,
  DispatchTask,
  EffectiveSampleCounter,
  Market,
  Proposition,
  Response,
  ResponseReview,
  RewardLedger,
  UserReputation,
  UserTag,
} from "@prisma/client";
import type {
  DispatchTask as SharedDispatchTask,
  EffectiveSampleCounter as SharedEffectiveSampleCounter,
  Market as SharedMarket,
  PositionBet as SharedPositionBet,
  Proposition as SharedProposition,
  Response as SharedResponse,
  ResponseReview as SharedResponseReview,
  RewardLedger as SharedRewardLedger,
  UserReputation as SharedUserReputation,
  UserTag as SharedUserTag,
} from "@arena/shared";

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

export const toSharedProposition = (
  proposition: Proposition,
): SharedProposition => ({
  id: proposition.id,
  chainPkId: proposition.chainPkId === null ? null : Number(proposition.chainPkId),
  type: proposition.type,
  structure: proposition.structure,
  rollingMode: proposition.rollingMode as SharedProposition["rollingMode"],
  marketEnabled: proposition.marketEnabled,
  settlementTarget: proposition.settlementTarget,
  category: proposition.category,
  title: proposition.title,
  description: proposition.description,
  options: proposition.options as [string, string],
  sampleConstraints: [...proposition.sampleConstraints],
  minEffectiveSample: proposition.minEffectiveSample,
  minBetAmount: proposition.minBetAmount,
  minDurationSeconds: proposition.minDurationSeconds,
  maxDurationSeconds: proposition.maxDurationSeconds,
  rewardBudget: proposition.rewardBudget,
  baseResponseReward: proposition.baseResponseReward,
  status: proposition.status,
  resultKind: proposition.resultKind,
  winningOption: proposition.winningOption as 0 | 1 | null,
  voidReason: proposition.voidReason,
  publishedAt: toIso(proposition.publishedAt),
  liveAt: toIso(proposition.liveAt),
  frozenAt: toIso(proposition.frozenAt),
  revealStartedAt: toIso(proposition.revealStartedAt),
  resultComputedAt: toIso(proposition.resultComputedAt),
  settledAt: toIso(proposition.settledAt),
  closedAt: toIso(proposition.closedAt),
  archivedAt: toIso(proposition.archivedAt),
  createdByUserId: proposition.createdByUserId,
  createdAt: proposition.createdAt.toISOString(),
  updatedAt: proposition.updatedAt.toISOString(),
});

export const toSharedDispatchTask = (
  task: DispatchTask,
): SharedDispatchTask => ({
  id: task.id,
  propositionId: task.propositionId,
  userId: task.userId,
  status: task.status,
  assignedAt: task.assignedAt.toISOString(),
  startedAt: toIso(task.startedAt),
  submittedAt: toIso(task.submittedAt),
  expiresAt: task.expiresAt.toISOString(),
  skipReason: task.skipReason,
  expiryReason: task.expiryReason,
  cooldownUntil: toIso(task.cooldownUntil),
});

export const toSharedCounter = (
  counter: EffectiveSampleCounter | null,
): SharedEffectiveSampleCounter | null =>
  counter
    ? {
        id: counter.id,
        propositionId: counter.propositionId,
        totalResponses: counter.totalResponses,
        reviewedResponses: counter.reviewedResponses,
        validCount: counter.validCount,
        partialValidCount: counter.partialValidCount,
        invalidCount: counter.invalidCount,
        updatedAt: counter.updatedAt.toISOString(),
      }
    : null;

export const toSharedResponse = (
  response: Response | null,
): SharedResponse | null =>
  response
    ? {
        id: response.id,
        propositionId: response.propositionId,
        taskId: response.taskId,
        userId: response.userId,
        responseVersion: response.responseVersion,
        isLatest: response.isLatest,
        selectedOption: response.selectedOption as 0 | 1,
        confirmationOption: response.confirmationOption as 0 | 1,
        clientStartedAt: response.clientStartedAt.toISOString(),
        clientSubmittedAt: response.clientSubmittedAt.toISOString(),
        understandingAck: response.understandingAck,
        submittedAt: response.submittedAt.toISOString(),
      }
    : null;

export const toSharedMarket = (
  market: Market,
): SharedMarket => ({
  id: market.id,
  propositionId: market.propositionId,
  settlementTarget: market.settlementTarget,
  status: market.status,
  chainMarketId: market.chainMarketId,
  chainStatus: market.chainStatus,
  currentPublicProgress: market.currentPublicProgress,
  lastPublicResult: market.lastPublicResult,
  liveAt: toIso(market.liveAt),
  frozenAt: toIso(market.frozenAt),
  settlingAt: toIso(market.settlingAt),
  settledAt: toIso(market.settledAt),
});

export const toSharedPositionBet = (
  bet: Bet | null,
): SharedPositionBet | null =>
  bet
    ? {
        id: bet.id,
        marketId: bet.marketId,
        propositionId: bet.propositionId,
        userId: bet.userId,
        selectedOption: bet.selectedOption as 0 | 1,
        stakeAmount: bet.stakeAmount,
        placedAt: bet.placedAt.toISOString(),
        settlementOutcome: bet.settlementOutcome,
        grossPayout: bet.grossPayout,
        pnl: bet.pnl,
        refundAmount: bet.refundAmount,
        settledAt: toIso(bet.settledAt),
      }
    : null;

export const toSharedReview = (
  review: ResponseReview | null,
): SharedResponseReview | null =>
  review
    ? {
        id: review.id,
        responseId: review.responseId,
        status: review.status,
        qualityScore: review.qualityScore,
        flags: [...review.flags],
        reasonCodes: [...review.reasonCodes],
        reviewedByUserId: review.reviewedByUserId,
        reviewedAt: toIso(review.reviewedAt),
      }
    : null;

export const toSharedRewardLedger = (
  rewardLedger: RewardLedger | null,
): SharedRewardLedger | null =>
  rewardLedger
    ? {
        id: rewardLedger.id,
        userId: rewardLedger.userId,
        propositionId: rewardLedger.propositionId,
        responseId: rewardLedger.responseId,
        sourceType: rewardLedger.sourceType,
        sourceId: rewardLedger.sourceId,
        ledgerVersion: rewardLedger.ledgerVersion,
        pendingAmount: rewardLedger.pendingAmount,
        finalAmount: rewardLedger.finalAmount,
        status: rewardLedger.status,
        reviewStatus: rewardLedger.reviewStatus,
        createdAt: rewardLedger.createdAt.toISOString(),
        finalizedAt: toIso(rewardLedger.finalizedAt),
        voidedAt: toIso(rewardLedger.voidedAt),
        reversedAt: toIso(rewardLedger.reversedAt),
        reversalOfLedgerId: rewardLedger.reversalOfLedgerId,
        reasonCode: rewardLedger.reasonCode,
      }
    : null;

export const toSharedUserReputation = (
  reputation: UserReputation | null,
): SharedUserReputation | null =>
  reputation
    ? {
        id: reputation.id,
        userId: reputation.userId,
        reputationScore: reputation.reputationScore,
        reputationLevel: reputation.reputationLevel,
        ruleVersion: reputation.ruleVersion,
        metrics: reputation.metricsJson as unknown as SharedUserReputation["metrics"],
        computedAt: reputation.computedAt.toISOString(),
        createdAt: reputation.createdAt.toISOString(),
        updatedAt: reputation.updatedAt.toISOString(),
      }
    : null;

export const toSharedUserTag = (
  tag: UserTag | null,
): SharedUserTag | null =>
  tag
    ? {
        id: tag.id,
        userId: tag.userId,
        tagKey: tag.tagKey,
        tagType: tag.tagType,
        tagValue: tag.tagValue,
        confidenceScore: tag.confidenceScore,
        sourceType: tag.sourceType,
        ruleVersion: tag.ruleVersion,
        metadata: tag.metadataJson,
        activatedAt: tag.activatedAt.toISOString(),
        expiresAt: toIso(tag.expiresAt),
        createdAt: tag.createdAt.toISOString(),
        updatedAt: tag.updatedAt.toISOString(),
      }
    : null;
