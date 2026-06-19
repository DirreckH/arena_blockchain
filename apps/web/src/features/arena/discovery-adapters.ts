import type {
  PublicDiscoveryRankingViewModel,
} from '@arena/shared'
import type {
  RankedMarketCategory,
  RankedMarketPageConfig,
  RankedMarketPageItem,
} from './ranked-market-page'

export function toRankedMarketPageConfig(
  view: PublicDiscoveryRankingViewModel,
): RankedMarketPageConfig {
  const categories: RankedMarketCategory[] = view.categories.map((category) => ({
    id: category.id,
    label: category.label,
    marketIds: category.marketIds,
  }))

  const items: RankedMarketPageItem[] = view.items.map((item) => ({
    id: item.id,
    href: item.href,
    title: item.title,
    score: item.score,
    change: item.change,
    imageSrc: item.imageSrc,
    imageAlt: item.imageAlt,
    tileLabel: item.tileLabel,
    tileTone: item.tileTone,
    sparkline: item.sparkline,
    categoryIds: item.categoryIds as RankedMarketPageItem['categoryIds'],
    isVerified: item.isVerified,
  }))

  return {
    pageClassName: view.pageClassName,
    heroVariant: view.heroVariant,
    dateLabel: view.dateLabel,
    title: view.title,
    description: view.description,
    categoryAriaLabel: view.categoryAriaLabel,
    listAriaLabel: view.listAriaLabel,
    categories,
    items,
  }
}
