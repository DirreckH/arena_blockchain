import { eventHref, marketCards } from './arena-market.mock'
import {
  filterRankedMarketItems,
  type RankedMarketFilterId,
  type RankedMarketPageItem,
  type RankedMarketPageConfig,
} from './ranked-market-page.mock'

const breakingMarketCardById = new Map(marketCards.map((market) => [market.id, market]))

function buildBreakingItem(
  marketId: string,
  score: number,
  change: number,
  sparkline: number[],
  categoryIds: RankedMarketPageItem['categoryIds'],
  options?: {
    id?: string
    isVerified?: boolean
    tileLabel?: RankedMarketPageItem['tileLabel']
    tileTone?: RankedMarketPageItem['tileTone']
  },
): RankedMarketPageItem {
  const market = breakingMarketCardById.get(marketId)

  if (!market) {
    throw new Error(`Missing breaking ranking market fixture for ${marketId}`)
  }

  return {
    id: options?.id ?? `breaking-${marketId}`,
    href: eventHref(marketId),
    title: market.title,
    score,
    change,
    imageSrc: market.image,
    imageAlt: market.title,
    tileLabel: options?.tileLabel,
    tileTone: options?.tileTone,
    sparkline,
    categoryIds,
    isVerified: options?.isVerified,
  }
}

export const BREAKING_PAGE_CONFIG: RankedMarketPageConfig = {
  pageClassName: 'breaking-page-shell',
  heroVariant: 'breaking',
  dateLabel: '2026年5月3日',
  title: '突发新闻',
  description: '查看过去 24 小时内热度飙升最快、最能带节奏的 Arena 共识命题',
  categoryAriaLabel: 'Breaking categories',
  listAriaLabel: 'Breaking markets',
  categories: [
    { id: 'all', label: '全部' },
    { id: 'politics', label: '政治' },
    { id: 'global', label: '全球' },
    { id: 'sports', label: '体育' },
    { id: 'crypto', label: '加密货币' },
    { id: 'finance', label: '金融' },
    { id: 'tech', label: '科技' },
    { id: 'culture', label: '文化' },
  ],
  items: [
    buildBreakingItem('sports-hamilton-ferrari-spotlight', 100, 52, [18, 20, 24, 28, 33, 41, 54, 68, 82, 100], ['sports', 'culture'], { tileLabel: 'F1', tileTone: 'f1' }),
    buildBreakingItem('rolling-launch-fail-clip', 97, 48, [17, 19, 21, 25, 29, 36, 49, 63, 79, 97], ['tech', 'culture']),
    buildBreakingItem('crypto-founder-tweet-momentum', 94, 43, [16, 18, 22, 24, 27, 35, 47, 59, 75, 94], ['crypto', 'tech']),
    buildBreakingItem('politics-ai-regulation-spotlight', 90, 38, [15, 17, 19, 23, 28, 34, 42, 53, 68, 90], ['politics', 'tech']),
    buildBreakingItem('geo-first-response-importance', 86, 34, [14, 15, 18, 21, 24, 29, 37, 46, 61, 86], ['global', 'politics']),
    buildBreakingItem('finance-rate-cut-narrative', 82, 31, [13, 14, 16, 20, 23, 28, 34, 42, 55, 82], ['finance']),
    buildBreakingItem('culture-podcast-debut-hotsearch', 78, 27, [12, 13, 15, 18, 22, 26, 31, 39, 50, 78], ['culture']),
    buildBreakingItem('sports-penalty-drama', 75, 24, [11, 12, 14, 17, 20, 24, 29, 36, 46, 75], ['sports', 'culture']),
    buildBreakingItem('tech-apple-ai-expectation', 72, 22, [10, 11, 13, 15, 18, 22, 27, 33, 43, 72], ['tech']),
    buildBreakingItem('culture-variety-cringe-moment', 69, 19, [9, 10, 12, 14, 16, 20, 24, 30, 40, 69], ['culture']),
    buildBreakingItem('economy-ai-job-anxiety', 65, 17, [8, 9, 11, 13, 15, 18, 22, 27, 36, 65], ['finance', 'tech']),
    buildBreakingItem('rolling-celeb-response-drama', 61, 15, [7, 8, 10, 11, 13, 16, 19, 24, 32, 61], ['global', 'culture'], { isVerified: true }),
  ],
}

export function getBreakingItemsForCategory(categoryId: RankedMarketFilterId) {
  return filterRankedMarketItems(BREAKING_PAGE_CONFIG, categoryId)
}
