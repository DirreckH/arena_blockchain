import { useMemo, useState } from 'react'
import { FeaturedCarousel } from '../components/market/FeaturedCarousel'
import { MarketWorkspace } from '../components/market/MarketWorkspace'
import { UserBetRail } from '../components/market/UserBetRail'
import { FilterStrip } from '../components/navigation/FilterStrip'
import { MobileSearchBar } from '../components/navigation/MobileSearchBar'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useDiscoveryData } from '../features/arena/discovery-data'
import { useValidationMarketData } from '../features/validation/validation-market-data'
import { useAuthSession } from '../features/auth/auth-session'

const DISCOVER_PREVIEW_LIMIT = 4
const DISCOVER_DEFAULT_HREF = '/zh'

export function HomePage() {
  const [activeSectionHref, setActiveSectionHref] = useState(DISCOVER_DEFAULT_HREF)
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState(0)
  const { markets, sourceMode: marketSourceMode } = useValidationMarketData()
  const { home, sourceMode: discoverySourceMode } = useDiscoveryData()
  const { sessionMode } = useAuthSession()
  const marketMap = useMemo(() => new Map(markets.map((market) => [market.id, market])), [markets])
  const heroMarkets = useMemo(
    () =>
      (home?.featuredMarketIds ?? [])
        .map((marketId) => marketMap.get(marketId))
        .filter((market) => market !== undefined),
    [home?.featuredMarketIds, marketMap],
  )
  const featuredIndex = Math.min(activeFeaturedIndex, Math.max(heroMarkets.length - 1, 0))
  const featuredMarket = heroMarkets[featuredIndex]
  const sections = home?.sections ?? []
  const activeSection = sections.find((section) => section.href === activeSectionHref) ?? sections[0] ?? null
  const previewMarkets = useMemo(
    () =>
      (activeSection?.marketIds ?? markets.map((market) => market.id))
        .map((marketId) => marketMap.get(marketId))
        .filter((market) => market !== undefined)
        .slice(0, DISCOVER_PREVIEW_LIMIT),
    [activeSection, marketMap, markets],
  )

  return (
    <section className="route-page market-page discover-page">
      <h1 className="sr-only">Arena | Verifiable consensus and research network</h1>
      <MobileSearchBar />
      <DataSourceBadge
        mode={sessionMode === 'demo' || marketSourceMode === 'demo' || discoverySourceMode === 'demo' ? 'demo' : 'live'}
        detail={
          sessionMode === 'demo'
            ? 'Home is running inside the authenticated demo session.'
            : marketSourceMode === 'demo' || discoverySourceMode === 'demo'
              ? 'One or more home feeds fell back to the seeded demo dataset.'
              : 'Home combines the current public market feed with the public discovery read model.'
        }
      />
      <section className="hero-grid" aria-label="Featured propositions and public progress">
        {featuredMarket ? <FeaturedCarousel market={featuredMarket} /> : null}
        <UserBetRail />
      </section>
      {heroMarkets.length > 1 ? (
        <div className="discover-hero-controls" aria-label="Featured discover card pagination">
          <div className="discover-hero-pager">
            {heroMarkets.map((market, index) => (
              <button
                type="button"
                key={market.id}
                className={index === featuredIndex ? 'discover-hero-dot active' : 'discover-hero-dot'}
                aria-label={`Show featured card ${index + 1}: ${market.title}`}
                aria-pressed={index === featuredIndex}
                onClick={() => setActiveFeaturedIndex(index)}
              />
            ))}
          </div>
        </div>
      ) : null}
      <FilterStrip
        className="market-category-strip discover-category-strip"
        dividerBeforeHref="/zh/politics"
        mode="local"
        activeHref={activeSectionHref}
        onSelect={setActiveSectionHref}
      />
        <MarketWorkspace
          markets={previewMarkets}
          showFilterStrip={false}
          title={`${activeSection?.label ?? 'Discover'} propositions`}
          showMoreLabel="更多"
          showMoreHref={activeSection?.moreHref ?? '/zh/markets'}
        />
    </section>
  )
}
