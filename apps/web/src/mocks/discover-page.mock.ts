import { navItems } from './arena-market.mock'
import { BREAKING_PAGE_CONFIG } from './breaking-page.mock'
import { CATEGORY_DIRECTORY_CONFIGS } from './category-directory.mock'
import { HOT_PAGE_CONFIG } from './hot-page.mock'
import { LATEST_TOPIC_ITEMS } from './latest-page.mock'

export type DiscoverPageSectionConfig = {
  marketIds: string[]
  moreHref: string
}

export type DiscoverPageFilterItem = {
  label: string
  href: string
}

const EVENT_ROUTE_PREFIX = '/zh/event/'

function marketIdFromEventHref(href: string) {
  return href.startsWith(EVENT_ROUTE_PREFIX) ? href.slice(EVENT_ROUTE_PREFIX.length) : null
}

function uniqueMarketIds(marketIds: Array<string | null | undefined>) {
  return Array.from(new Set(marketIds.filter((marketId): marketId is string => Boolean(marketId))))
}

const TOP_DISCOVER_SECTION_CONFIGS: Record<string, DiscoverPageSectionConfig> = {
  '/zh': {
    marketIds: uniqueMarketIds(HOT_PAGE_CONFIG.items.map((item) => marketIdFromEventHref(item.href))),
    moreHref: '/zh/markets',
  },
  '/zh/breaking': {
    marketIds: uniqueMarketIds(BREAKING_PAGE_CONFIG.items.map((item) => marketIdFromEventHref(item.href))),
    moreHref: '/zh/breaking',
  },
  '/zh/new': {
    marketIds: uniqueMarketIds(LATEST_TOPIC_ITEMS.flatMap((item) => item.marketIds)),
    moreHref: '/zh/new',
  },
}

const DIRECTORY_DISCOVER_SECTION_CONFIGS = Object.fromEntries(
  Object.entries(CATEGORY_DIRECTORY_CONFIGS).map(([pathname, config]) => [
    pathname,
    {
      marketIds: config.marketIds,
      moreHref: pathname,
    } satisfies DiscoverPageSectionConfig,
  ]),
) as Record<string, DiscoverPageSectionConfig>

export const DISCOVER_PAGE_SECTION_CONFIGS: Record<string, DiscoverPageSectionConfig> = {
  ...TOP_DISCOVER_SECTION_CONFIGS,
  ...DIRECTORY_DISCOVER_SECTION_CONFIGS,
}

export const DISCOVER_PAGE_SECTION_PATHS = navItems.map((item) => item.href)

export const DISCOVER_PAGE_FILTER_ITEMS: DiscoverPageFilterItem[] = navItems.map((item) => ({
  label: item.label,
  href: item.href,
}))

export function getDiscoverPageSectionConfig(pathname: string) {
  return DISCOVER_PAGE_SECTION_CONFIGS[pathname]
}

export function getDiscoverPageFilterItem(pathname: string) {
  return DISCOVER_PAGE_FILTER_ITEMS.find((item) => item.href === pathname)
}
