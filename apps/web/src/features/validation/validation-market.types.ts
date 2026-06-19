export type ValidationMarketStatus =
  | 'collecting'
  | 'ready_to_reveal'
  | 'frozen'
  | 'settled'
  | 'insufficient_sample'

export type PublicProgressSnapshot = {
  timeProgressPercent: number
  effectiveSampleProgressPercent: number
  effectiveSampleCount: number
  minEffectiveSample: number
  statusLabel: string
}

export type PublicValidationOption = {
  id: string
  label: string
  displayOrder: number
}

export type PublicValidationMarketCard = {
  id: string
  renderKey?: string
  previewHref?: string
  title: string
  category: string
  status: ValidationMarketStatus
  options: PublicValidationOption[]
  progress: PublicProgressSnapshot
  revealTargetAt?: string
  closesAt?: string
  imageSrc?: string
  isSettled?: boolean
  publicResult?: string
}

export type PublicValidationMarketDetail = PublicValidationMarketCard

// Public validation market models must not include pre-reveal forbidden fields:
// probability, odds, leadingOption, currentDirection, responseRatio,
// voteCountByOption, rawVoteCount, internalSampleDistribution,
// unrevealedResultTrend, traderSentiment, optionVolume, trend, marketPrice.
// Future API responses must be mapped through an adapter before reaching UI components.
