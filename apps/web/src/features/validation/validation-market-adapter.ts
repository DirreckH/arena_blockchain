import type { ValidationMarketViewModel } from '@arena/shared'
import { getFeaturedMarketComments } from './featured-market-comments'
import type {
  PublicValidationMarketCard,
  PublicValidationMarketDetail,
  ValidationMarketStatus,
} from './validation-market.types'

function mapMarketStatus(market: ValidationMarketViewModel): ValidationMarketStatus {
  if (market.marketStatus === 'settled') {
    return 'settled'
  }

  const publicPhase = market.publicProgress.publicState.phase

  if (publicPhase === 'settled') {
    return 'settled'
  }

  if (publicPhase === 'revealing') {
    return 'frozen'
  }

  if (publicPhase === 'frozen') {
    return 'frozen'
  }

  if (!market.publicProgress.publicState.reachedSampleThreshold) {
    return 'insufficient_sample'
  }

  if (market.publicProgress.publicState.reachedSampleThreshold) {
    return 'ready_to_reveal'
  }

  return 'collecting'
}

function buildStatusLabel(market: ValidationMarketViewModel) {
  const phase = market.publicProgress.publicState.phase

  switch (phase) {
    case 'scheduled':
      return 'Scheduled'
    case 'live':
      return market.publicProgress.publicState.reachedSampleThreshold
        ? 'Ready to reveal'
        : 'Collecting'
    case 'frozen':
      return 'Frozen'
    case 'revealing':
      return 'Revealing'
    case 'settled':
      return 'Settled'
    default:
      return market.canBet ? 'Collecting' : 'Pending'
  }
}

function buildPublicResult(market: ValidationMarketViewModel) {
  if (market.publicProgress.publicState.phase !== 'settled') {
    return undefined
  }

  const result = market.publicProgress.lastPublishedResult

  if (!result) {
    return 'Public result archived'
  }

  if (result.resultKind === 'void') {
    return result.voidReason ? `Void: ${result.voidReason}` : 'Void settlement'
  }

  if (typeof result.winningOption === 'number') {
    const label = market.options[result.winningOption]
    return label ? `Resolved: ${label}` : `Resolved option ${result.winningOption + 1}`
  }

  return 'Resolved'
}

export function toPublicValidationMarket(
  market: ValidationMarketViewModel,
): PublicValidationMarketCard {
  const status = mapMarketStatus(market)

  return {
    id: market.marketId,
    title: market.title,
    category: market.category,
    status,
    options: market.options.map((label, index) => ({
      id: `${market.marketId}-option-${index + 1}`,
      label,
      displayOrder: index + 1,
    })),
    progress: {
      timeProgressPercent: market.timeProgressPercent,
      effectiveSampleProgressPercent: market.publicProgress.progress.progressPercent,
      effectiveSampleCount: market.publicProgress.progress.currentEffectiveSample,
      minEffectiveSample: market.publicProgress.progress.totalRequired,
      statusLabel: buildStatusLabel(market),
    },
    revealTargetAt:
      market.publicProgress.timing.deadlineAt
      ?? market.publicProgress.timing.minDurationEndsAt
      ?? market.bettingClosesAt,
    closesAt: market.bettingClosesAt,
    isSettled: status === 'settled',
    publicResult: buildPublicResult(market),
    featuredComments: getFeaturedMarketComments(market.marketId),
  }
}

export function toPublicValidationMarketDetail(
  market: ValidationMarketViewModel,
): PublicValidationMarketDetail {
  return toPublicValidationMarket(market)
}
