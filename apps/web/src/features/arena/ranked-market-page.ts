export type RankedMarketCategoryId =
  | 'politics'
  | 'global'
  | 'sports'
  | 'crypto'
  | 'finance'
  | 'tech'
  | 'culture'

export type RankedMarketFilterId = string

export type RankedMarketCategory = {
  id: RankedMarketFilterId
  label: string
  // Optional: when populated, items are filtered to those whose id appears in
  // this whitelist (used by operator-defined custom capsules). When omitted,
  // the categoryIds-based filter applies (the default for system capsules).
  marketIds?: string[]
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

  const category = config.categories.find((entry) => entry.id === categoryId)
  // Custom capsules: explicit marketIds whitelist drives filtering.
  if (category?.marketIds) {
    const whitelist = new Set(category.marketIds)
    return config.items.filter((item) => whitelist.has(item.id))
  }

  // System capsules: filter by categoryIds tag membership (existing behavior).
  return config.items.filter((item) =>
    (item.categoryIds as readonly string[]).includes(categoryId),
  )
}
