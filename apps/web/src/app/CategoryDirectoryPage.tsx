import { useEffect, useMemo, useState } from 'react'
import { Bookmark, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublicCategorySidebarItemViewModel } from '@arena/shared'
import { CategoryCompactMarketCard } from '../components/market/CategoryDirectoryCards'
import { MarketSearchBar } from '../components/market/MarketSearchBar'
import { FilterStrip } from '../components/navigation/FilterStrip'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useDiscoveryData } from '../features/arena/discovery-data'
import { useValidationMarketData } from '../features/validation/validation-market-data'
import { useAuthSession } from '../features/auth/auth-session'

type CategoryDirectoryPageProps = {
  pathname: string
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

/**
 * Apply the active sidebar entry's `marketIds` whitelist to a list of markets,
 * if present. The first sidebar entry conventionally represents the unfiltered
 * "All" view: when its whitelist is empty/missing, the full list is returned.
 *
 * Exported for unit testing.
 */
export function filterMarketsByActiveSidebar<TMarket extends { id: string }>(
  markets: TMarket[],
  activeSidebarEntry: PublicCategorySidebarItemViewModel | null,
): TMarket[] {
  if (!activeSidebarEntry || !activeSidebarEntry.marketIds || activeSidebarEntry.marketIds.length === 0) {
    return markets
  }
  const whitelist = new Set(activeSidebarEntry.marketIds)
  return markets.filter((market) => whitelist.has(market.id))
}

export function CategoryDirectoryPage({ pathname }: CategoryDirectoryPageProps) {
  const { getCategory, sourceMode, isLoading, errorMessage } = useDiscoveryData()
  const { sessionMode } = useAuthSession()
  const config = getCategory(pathname)
  const [activeSidebarItem, setActiveSidebarItem] = useState(config?.sidebarItems[0]?.label ?? '')
  const [searchQuery, setSearchQuery] = useState('')
  const { markets } = useValidationMarketData()

  const marketMap = useMemo(
    () => new Map(markets.map((market) => [market.id, market])),
    [markets],
  )

  useEffect(() => {
    if (config?.sidebarItems[0]?.label && !activeSidebarItem) {
      setActiveSidebarItem(config.sidebarItems[0].label)
    }
  }, [activeSidebarItem, config])

  if (!config) {
    return null
  }

  const orderedMarkets = config.marketIds
    .map((marketId) => marketMap.get(marketId))
    .filter(isDefined)

  // When the active sidebar entry has an explicit marketIds whitelist (operator
  // configured the entry with linkedMarketIds), filter the right-side cards to
  // that whitelist. The first sidebar entry conventionally represents the
  // "全部" / unfiltered view: when its whitelist is empty we treat it as a
  // pass-through so the page still shows everything.
  const activeSidebarEntry = config.sidebarItems.find((item) => item.label === activeSidebarItem) ?? null
  const sidebarFilteredMarkets = filterMarketsByActiveSidebar(orderedMarkets, activeSidebarEntry)

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visibleMarkets =
    normalizedQuery.length === 0
      ? sidebarFilteredMarkets
      : sidebarFilteredMarkets.filter((market) => market.title.toLowerCase().includes(normalizedQuery))

  return (
    <section className="route-page market-page category-directory-page">
      <DataSourceBadge mode={sessionMode === 'demo' ? 'demo' : sourceMode} />
      <MarketSearchBar value={searchQuery} onChange={setSearchQuery} />
      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      {errorMessage ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>分类目录加载失败</h2>
            <span>{errorMessage}</span>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>正在加载分类目录</h2>
            <span>Arena 正在组装当前分类目录与关联命题卡片。</span>
          </div>
        </section>
      ) : null}

      <div className="category-directory-shell main-grid">
        <aside className="category-directory-sidebar" aria-label={`${config.title} 分区`}>
          <div className="category-sidebar-list">
            {config.sidebarItems.map((item) => (
              <button
                type="button"
                key={item.label}
                className={item.label === activeSidebarItem ? 'category-sidebar-item active' : 'category-sidebar-item'}
                aria-pressed={item.label === activeSidebarItem}
                onClick={() => setActiveSidebarItem(item.label)}
              >
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
          </div>
        </aside>

        <div className="category-directory-main">
          <div className="category-directory-header">
            <h1>{config.title}</h1>
            <div className="market-toolbar category-directory-tools">
              <Link to="/zh/markets?panel=filters" aria-label="筛选命题">
                <SlidersHorizontal size={21} />
              </Link>
              <Link to="/zh/watchlist" aria-label="已保存命题">
                <Bookmark size={21} />
              </Link>
            </div>
          </div>

          <div className="category-directory-grid">
            {visibleMarkets.map((market) => (
              <CategoryCompactMarketCard key={`${config.title}-${market.id}`} market={market} />
            ))}
          </div>

          {searchQuery.trim().length > 0 && visibleMarkets.length === 0 ? (
            <p className="market-page-search-empty" role="status">
              没有匹配“{searchQuery.trim()}”的市场，换个关键词试试。
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
