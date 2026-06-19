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
import type { PublicValidationMarketCard } from '../features/validation/validation-market.types'

const DISCOVER_PREVIEW_COLUMN_COUNT = 4
const DISCOVER_PREVIEW_ROW_COUNT = 3
const DISCOVER_PREVIEW_LIMIT = DISCOVER_PREVIEW_COLUMN_COUNT * DISCOVER_PREVIEW_ROW_COUNT
const DISCOVER_DEFAULT_HREF = '/zh'
const DISCOVER_HERO_PAGER_SLOT_COUNT = 10

type PreviewTopicItem = {
  id: string
  href: string
  title: string
}

function extractMarketIdFromHref(href: string) {
  if (!href.startsWith('/zh/event/')) {
    return null
  }

  return href.slice('/zh/event/'.length).split('?')[0] ?? null
}

function buildPreviewCard(
  market: PublicValidationMarketCard,
  renderKey: string,
  overrides?: {
    previewHref?: string
    title?: string
  },
): PublicValidationMarketCard {
  return {
    ...market,
    renderKey,
    previewHref: overrides?.previewHref ?? market.previewHref,
    title: overrides?.title ?? market.title,
  }
}

function buildPreviewCardsFromRankingItems(
  items: PreviewTopicItem[],
  marketMap: Map<string, PublicValidationMarketCard>,
  keyPrefix: string,
) {
  return items
    .map((item, index) => {
      const marketId = extractMarketIdFromHref(item.href)
      const market = marketId ? marketMap.get(marketId) : undefined

      if (!market) {
        return null
      }

      return buildPreviewCard(
        market,
        `${keyPrefix}-${item.id}-${index + 1}`,
        {
          previewHref: item.href,
          title: item.title,
        },
      )
    })
    .filter((market): market is PublicValidationMarketCard => market !== null)
}

function buildPreviewCardsFromMarketIds(
  marketIds: string[],
  marketMap: Map<string, PublicValidationMarketCard>,
  keyPrefix: string,
) {
  return marketIds
    .map((marketId, index) => {
      const market = marketMap.get(marketId)

      if (!market) {
        return null
      }

      return buildPreviewCard(market, `${keyPrefix}-${marketId}-${index + 1}`)
    })
    .filter((market): market is PublicValidationMarketCard => market !== null)
}

function fillPreviewCards(
  primaryCards: PublicValidationMarketCard[],
  fallbackCards: PublicValidationMarketCard[],
  limit: number,
) {
  const filledCards = primaryCards.slice(0, limit)

  if (filledCards.length >= limit) {
    return filledCards
  }

  const occupiedMarketIds = new Set(primaryCards.map((market) => market.id))
  const uniqueFallbackCards = fallbackCards.filter((market) => !occupiedMarketIds.has(market.id))

  uniqueFallbackCards.forEach((market) => {
    if (filledCards.length >= limit) {
      return
    }

    filledCards.push(
      buildPreviewCard(
        market,
        `${market.renderKey ?? market.id}-fallback-${filledCards.length + 1}`,
      ),
    )
  })

  const repeatPool = primaryCards.length > 0 ? primaryCards : fallbackCards
  let repeatIndex = 0

  while (filledCards.length < limit && repeatPool.length > 0) {
    const market = repeatPool[repeatIndex % repeatPool.length]

    filledCards.push(
      buildPreviewCard(
        market,
        `${market.renderKey ?? market.id}-repeat-${repeatIndex + 1}`,
      ),
    )
    repeatIndex += 1
  }

  return filledCards
}

export function HomePage() {
  const [activeSectionHref, setActiveSectionHref] = useState(DISCOVER_DEFAULT_HREF)
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState(0)
  const { markets, isLoading: marketsLoading, sourceMode: marketSourceMode } = useValidationMarketData()
  const {
    home,
    hot,
    breaking,
    latestTopics,
    isLoading: discoveryLoading,
    sourceMode: discoverySourceMode,
  } = useDiscoveryData()
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
  const allPreviewCards = useMemo(
    () => markets.map((market, index) => buildPreviewCard(market, `discover-all-${market.id}-${index + 1}`)),
    [markets],
  )
  const featuredPager = heroMarkets.length > 1 ? (
    <div className="discover-hero-pager" aria-label="精选命题翻页">
      {Array.from({ length: DISCOVER_HERO_PAGER_SLOT_COUNT }, (_, index) => {
        const market = heroMarkets[index]
        const isActive = index === featuredIndex
        const isAvailable = market !== undefined

        return (
          <button
            type="button"
            key={market?.id ?? `discover-hero-slot-${index + 1}`}
            className={isActive ? 'discover-hero-dot active' : 'discover-hero-dot'}
            aria-label={market ? `精选命题第 ${index + 1} 页：${market.title}` : `精选命题第 ${index + 1} 页`}
            aria-pressed={isActive}
            disabled={!isAvailable}
            onClick={() => {
              if (isAvailable) {
                setActiveFeaturedIndex(index)
              }
            }}
          />
        )
      })}
    </div>
  ) : null
  const previewMarkets = useMemo(
    () => {
      if (activeSectionHref === '/zh') {
        const hotPreviewCards = buildPreviewCardsFromRankingItems(
          (hot?.items ?? []).map((item) => ({
            id: item.id,
            href: item.href,
            title: item.title,
          })),
          marketMap,
          'discover-hot',
        )

        return fillPreviewCards(hotPreviewCards, allPreviewCards, DISCOVER_PREVIEW_LIMIT)
      }

      if (activeSectionHref === '/zh/breaking') {
        const breakingPreviewCards = buildPreviewCardsFromRankingItems(
          (breaking?.items ?? []).map((item) => ({
            id: item.id,
            href: item.href,
            title: item.title,
          })),
          marketMap,
          'discover-breaking',
        )

        return fillPreviewCards(breakingPreviewCards, allPreviewCards, DISCOVER_PREVIEW_LIMIT)
      }

      if (activeSectionHref === '/zh/new') {
        const latestPreviewCards = latestTopics
          ? allPreviewCards
          : buildPreviewCardsFromMarketIds(
              markets.map((market) => market.id),
              marketMap,
              'discover-latest',
            )

        return fillPreviewCards(latestPreviewCards, allPreviewCards, DISCOVER_PREVIEW_LIMIT)
      }

      const sectionPreviewCards = buildPreviewCardsFromMarketIds(
        activeSection?.marketIds ?? markets.map((market) => market.id),
        marketMap,
        `discover-section-${activeSectionHref.replace(/[^a-z0-9]+/gi, '-')}`,
      )

      return fillPreviewCards(sectionPreviewCards, allPreviewCards, DISCOVER_PREVIEW_LIMIT)
    },
    [activeSection, activeSectionHref, allPreviewCards, breaking?.items, hot?.items, latestTopics, marketMap, markets],
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
      <section className="hero-grid" aria-label="精选命题与公开进度">
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
