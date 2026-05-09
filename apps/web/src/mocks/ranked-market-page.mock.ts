export type RankedMarketCategoryId =
  | 'politics'
  | 'global'
  | 'sports'
  | 'crypto'
  | 'finance'
  | 'tech'
  | 'culture'

export type RankedMarketFilterId = 'all' | RankedMarketCategoryId

export type RankedMarketCategory = {
  id: RankedMarketFilterId
  label: string
}

export type RankedMarketPageItem = {
  id: string
  href: string
  title: string
  score: number
  change: number
  imageSrc?: string
  imageAlt?: string
  tileLabel?: string
  tileTone?: 'f1' | 'neutral'
  sparkline: number[]
  categoryIds: RankedMarketCategoryId[]
  isVerified?: boolean
}

export type RankedMarketPageConfig = {
  pageClassName: string
  heroVariant: 'breaking' | 'hot'
  dateLabel: string
  title: string
  description: string
  categoryAriaLabel: string
  listAriaLabel: string
  categories: RankedMarketCategory[]
  items: RankedMarketPageItem[]
}

export function filterRankedMarketItems(
  config: RankedMarketPageConfig,
  categoryId: RankedMarketFilterId,
) {
  if (categoryId === 'all') {
    return config.items
  }

  return config.items.filter((item) => item.categoryIds.includes(categoryId))
}
