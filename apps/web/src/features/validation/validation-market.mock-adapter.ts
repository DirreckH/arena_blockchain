import { breakingNews, hotTopics, marketCards } from '../../mocks/arena-market.mock'
import type { ArenaMarketCard, ArenaOption, TrendingItem } from '../../mocks/arena-market.mock'
import { getFeaturedMarketComments } from './featured-market-comments'
import type {
  PublicValidationMarketCard,
  PublicValidationMarketDetail,
  PublicValidationOption,
  ValidationMarketStatus,
} from './validation-market.types'

type PublicMockMetadata = {
  status: ValidationMarketStatus
  effectiveSampleCount: number
  minEffectiveSample: number
  revealTargetAt?: string
  closesAt?: string
  isSettled?: boolean
  publicResult?: string
}

const DEFAULT_METADATA: PublicMockMetadata = {
  status: 'collecting',
  effectiveSampleCount: 0,
  minEffectiveSample: 1,
  revealTargetAt: 'Reveal target pending',
}

const PUBLIC_MARKET_METADATA: Record<string, PublicMockMetadata> = {
  'public-trust': {
    status: 'collecting',
    effectiveSampleCount: 420,
    minEffectiveSample: 600,
    revealTargetAt: '2026-04-30',
  },
  'btc-network-fee': {
    status: 'ready_to_reveal',
    effectiveSampleCount: 260,
    minEffectiveSample: 500,
    revealTargetAt: '2026-05-03',
  },
  'ai-model-review': {
    status: 'insufficient_sample',
    effectiveSampleCount: 310,
    minEffectiveSample: 800,
    revealTargetAt: '2026-05-08',
  },
  'regional-dialogue': {
    status: 'frozen',
    effectiveSampleCount: 540,
    minEffectiveSample: 700,
    closesAt: '2026-05-07',
  },
  'ceasefire-durability': {
    status: 'collecting',
    effectiveSampleCount: 360,
    minEffectiveSample: 650,
    revealTargetAt: '2026-05-12',
  },
  'nba-final-consensus': {
    status: 'insufficient_sample',
    effectiveSampleCount: 190,
    minEffectiveSample: 500,
    revealTargetAt: '2026-05-16',
  },
  'f1-season-result': {
    status: 'collecting',
    effectiveSampleCount: 280,
    minEffectiveSample: 900,
    closesAt: '2026 season window',
  },
  'rolling-temperature': {
    status: 'collecting',
    effectiveSampleCount: 145,
    minEffectiveSample: 200,
    revealTargetAt: '2026-04-29',
    publicResult: 'Previous public result archived',
  },
}

const toPublicOption = (
  marketId: string,
  option: ArenaOption,
  index: number,
): PublicValidationOption => ({
  id: `${marketId}-option-${index + 1}`,
  label: option.label,
  displayOrder: index + 1,
})

const toPublicMarket = (market: ArenaMarketCard): PublicValidationMarketCard => {
  const metadata = PUBLIC_MARKET_METADATA[market.id] ?? DEFAULT_METADATA

  return {
    id: market.id,
    title: market.title,
    category: market.category,
    status: metadata.status,
    options: market.options.map((option, index) => toPublicOption(market.id, option, index)),
    progress: {
      timeProgressPercent: market.timeProgressPercent,
      effectiveSampleProgressPercent: market.sampleProgressPercent,
      effectiveSampleCount: metadata.effectiveSampleCount,
      minEffectiveSample: metadata.minEffectiveSample,
      statusLabel: market.statusLabel,
    },
    revealTargetAt: metadata.revealTargetAt,
    closesAt: metadata.closesAt,
    imageSrc: market.image,
    isSettled: metadata.isSettled,
    publicResult: metadata.publicResult ?? market.previousResult,
    featuredComments: getFeaturedMarketComments(market.id),
  }
}

export const getPublicValidationMarkets = (): PublicValidationMarketCard[] =>
  marketCards.map(toPublicMarket)

export const getPublicValidationMarketById = (
  id: string,
): PublicValidationMarketDetail | undefined =>
  getPublicValidationMarkets().find((market) => market.id === id)

export const getBreakingNews = (): TrendingItem[] => breakingNews

export const getHotTopics = (): TrendingItem[] => hotTopics
