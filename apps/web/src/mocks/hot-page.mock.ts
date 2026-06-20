import { eventHref, marketCards } from './arena-market.mock'
import {
  filterRankedMarketItems,
  type RankedMarketFilterId,
  type RankedMarketPageItem,
  type RankedMarketPageConfig,
} from './ranked-market-page.mock'

const hotMarketCardById = new Map(marketCards.map((market) => [market.id, market]))

function buildHotItem(
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
  const market = hotMarketCardById.get(marketId)

  if (!market) {
    throw new Error(`Missing hot ranking market fixture for ${marketId}`)
  }

  return {
    id: options?.id ?? `hot-${marketId}`,
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

export const HOT_PAGE_CONFIG: RankedMarketPageConfig = {
  pageClassName: 'hot-page',
  heroVariant: 'hot',
  dateLabel: '最近 7 天',
  title: '近期热门',
  description: '查看过去 7 天内讨论度最高、传播性最强的 Arena 共识命题',
  categoryAriaLabel: 'Hot market categories',
  listAriaLabel: 'Hot markets',
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
    buildHotItem('sports-messi-ronaldo-goat', 99, 34, [41, 46, 51, 58, 64, 71, 79, 86, 93, 99], ['sports', 'culture'], { isVerified: true }),
    buildHotItem('culture-concert-ticket-chaos', 96, 30, [38, 43, 47, 53, 60, 66, 73, 81, 89, 96], ['culture']),
    buildHotItem('tech-ai-search-habit', 93, 27, [35, 38, 42, 47, 54, 60, 68, 76, 85, 93], ['tech']),
    buildHotItem('crypto-meme-vs-ai-coins', 91, 25, [32, 36, 40, 45, 49, 57, 64, 73, 82, 91], ['crypto', 'finance', 'tech']),
    buildHotItem('finance-fed-one-liner', 88, 23, [28, 31, 35, 40, 46, 52, 59, 67, 77, 88], ['finance']),
    buildHotItem('sports-hamilton-ferrari-spotlight', 85, 21, [27, 30, 34, 38, 44, 50, 57, 65, 74, 85], ['sports', 'culture'], { tileLabel: 'F1', tileTone: 'f1' }),
    buildHotItem('politics-short-video-turnout', 82, 20, [25, 27, 31, 36, 41, 47, 54, 62, 72, 82], ['politics', 'culture']),
    buildHotItem('geo-summit-photo-signal', 79, 18, [23, 26, 30, 34, 39, 44, 50, 58, 67, 79], ['global', 'politics']),
    buildHotItem('culture-red-carpet-over-awards', 76, 17, [20, 24, 27, 31, 36, 41, 48, 56, 66, 76], ['culture']),
    buildHotItem('tech-robot-videos-viral', 73, 15, [18, 21, 24, 29, 33, 38, 44, 51, 61, 73], ['tech', 'culture']),
    buildHotItem('rolling-one-episode-viral', 71, 14, [17, 20, 23, 27, 31, 36, 42, 49, 59, 71], ['culture']),
    buildHotItem('surveys-friend-vs-kol', 68, 13, [16, 18, 21, 24, 28, 33, 39, 45, 55, 68], ['tech', 'culture']),
  ],
}

export function getHotItemsForCategory(categoryId: RankedMarketFilterId) {
  return filterRankedMarketItems(HOT_PAGE_CONFIG, categoryId)
}
