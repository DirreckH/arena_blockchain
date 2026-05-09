import { useEffect, useMemo, useState } from 'react'
import { Bookmark, Search, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CategoryCompactMarketCard } from '../components/market/CategoryDirectoryCards'
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

export function CategoryDirectoryPage({ pathname }: CategoryDirectoryPageProps) {
  const { getCategory, sourceMode, isLoading, errorMessage } = useDiscoveryData()
  const { sessionMode } = useAuthSession()
  const config = getCategory(pathname)
  const [activeSidebarItem, setActiveSidebarItem] = useState(config?.sidebarItems[0]?.label ?? '')
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

  return (
    <section className="route-page market-page category-directory-page">
      <DataSourceBadge
        mode={sessionMode === 'demo' ? 'demo' : sourceMode}
        detail={
          sessionMode === 'demo'
            ? 'Category directory uses the authenticated demo session.'
            : sourceMode === 'demo'
              ? 'Category directory fell back to the seeded demo discovery directory.'
              : 'Category directory uses the public discovery directory with the public market feed.'
        }
      />
      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      {errorMessage ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>Category directory unavailable</h2>
            <span>{errorMessage}</span>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>Loading category directory</h2>
            <span>Arena is assembling the current directory and linked market cards.</span>
          </div>
        </section>
      ) : null}

      <div className="category-directory-shell main-grid">
        <aside className="category-directory-sidebar" aria-label={`${config.title} sections`}>
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
              <Link to="/zh/search" aria-label="Search propositions">
                <Search size={21} />
              </Link>
              <Link to="/zh/markets?panel=filters" aria-label="Filter propositions">
                <SlidersHorizontal size={21} />
              </Link>
              <Link to="/zh/watchlist" aria-label="Saved propositions">
                <Bookmark size={21} />
              </Link>
            </div>
          </div>

          <div className="category-directory-grid">
            {orderedMarkets.map((market) => (
              <CategoryCompactMarketCard key={`${config.title}-${market.id}`} market={market} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
