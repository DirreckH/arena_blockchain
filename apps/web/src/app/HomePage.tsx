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
  const { markets, isLoading: marketsLoading, sourceMode: marketSourceMode } = useValidationMarketData()
  const { home, isLoading: discoveryLoading, sourceMode: discoverySourceMode } = useDiscoveryData()
  const { sessionMode } = useAuthSession()
  const isLoading = marketsLoading || discoveryLoading
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
  const featuredPager = heroMarkets.length > 1 ? (
    <div className="discover-hero-pager" aria-label="Featured discover card pagination">
      {heroMarkets.map((market, index) => (
        <button
          type="button"
          key={market.id}
          className={index === featuredIndex ? 'discover-hero-dot active' : 'discover-hero-dot'}
          aria-label={`切换精选命题 ${index + 1}：${market.title}`}
          aria-pressed={index === featuredIndex}
          onClick={() => setActiveFeaturedIndex(index)}
        />
      ))}
    </div>
  ) : null
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
      <h1 className="sr-only">Arena | 可验证共识与调研网络</h1>
      <MobileSearchBar />
      <DataSourceBadge
        mode={sessionMode === 'demo'
          ? 'demo'
          : marketSourceMode === 'live' && discoverySourceMode === 'live'
            ? 'live'
            : marketSourceMode === 'demo' && discoverySourceMode === 'demo'
              ? 'demo'
              : 'mixed'}
      />
      <section className="hero-grid" aria-label="Featured propositions and public progress">
        {featuredMarket ? (
          <FeaturedCarousel market={featuredMarket} pager={featuredPager} />
        ) : isLoading ? (
          <div className="featured-carousel-skeleton" aria-busy="true" aria-label="加载精选命题">
            <span className="skeleton-line medium" style={{ marginBottom: 10 }} />
            <span className="skeleton-line hero" style={{ marginBottom: 6 }} />
            <span className="skeleton-line full" />
            <span className="skeleton-line medium" style={{ marginTop: 14 }} />
          </div>
        ) : null}
        <UserBetRail />
      </section>
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
        title={`${activeSection?.label ?? '发现'} 命题`}
        showMoreLabel="更多"
        showMoreHref={activeSection?.moreHref ?? '/zh/markets'}
      />
    </section>
  )
}
