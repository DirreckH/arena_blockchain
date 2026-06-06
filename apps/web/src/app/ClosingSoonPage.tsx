import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock3, Hourglass } from 'lucide-react'
import type { PublicClosingSoonItemViewModel } from '@arena/shared'
import { CategoryCompactMarketCard } from '../components/market/CategoryDirectoryCards'
import { MarketSearchBar } from '../components/market/MarketSearchBar'
import { FilterStrip } from '../components/navigation/FilterStrip'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { arenaApi } from '../features/api/arena-api'
import { useAuthSession } from '../features/auth/auth-session'
import { useValidationMarketData } from '../features/validation/validation-market-data'
import type { PublicValidationMarketCard } from '../features/validation/validation-market.types'

function formatCountdown(differenceMs: number) {
  if (differenceMs <= 0) {
    return '即将进入裁决窗口'
  }

  const totalMinutes = Math.round(differenceMs / 60000)

  if (totalMinutes < 60) {
    return `约 ${Math.max(1, totalMinutes)} 分钟后开奖`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours < 24) {
    return minutes === 0 ? `约 ${hours} 小时后开奖` : `约 ${hours} 小时 ${minutes} 分钟后开奖`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24

  return remainingHours === 0
    ? `约 ${days} 天后开奖`
    : `约 ${days} 天 ${remainingHours} 小时后开奖`
}

export function ClosingSoonPage() {
  const {
    markets,
    sourceMode: marketSourceMode,
    isLoading: isMarketLoading,
    errorMessage: marketErrorMessage,
  } = useValidationMarketData()
  const { sessionMode } = useAuthSession()
  const [closingSoonItems, setClosingSoonItems] = useState<{
    urgent: PublicClosingSoonItemViewModel[]
    upcoming: PublicClosingSoonItemViewModel[]
  }>({
    urgent: [],
    upcoming: [],
  })
  const [closingSoonSourceMode, setClosingSoonSourceMode] = useState<'live' | 'demo' | 'mixed'>('live')
  const [isClosingSoonLoading, setIsClosingSoonLoading] = useState(true)
  const [closingSoonErrorMessage, setClosingSoonErrorMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let disposed = false

    void (async () => {
      setIsClosingSoonLoading(true)
      setClosingSoonErrorMessage(null)

      try {
        const nextClosingSoon = await arenaApi.getDiscoveryClosingSoonFeed()
        if (disposed) {
          return
        }

        setClosingSoonItems({
          urgent: nextClosingSoon.data.urgent,
          upcoming: nextClosingSoon.data.upcoming,
        })
        setClosingSoonSourceMode(nextClosingSoon.sourceMode)
      } catch (error) {
        if (disposed) {
          return
        }

        setClosingSoonErrorMessage(error instanceof Error ? error.message : '即将开奖加载失败')
      } finally {
        if (!disposed) {
          setIsClosingSoonLoading(false)
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [])

  const marketMap = useMemo(
    () => new Map(markets.map((market) => [market.id, market])),
    [markets],
  )

  const urgentMarkets = useMemo(
    () => closingSoonItems.urgent
      .map((item) => {
        const market = marketMap.get(item.marketId)
        if (!market) {
          return null
        }

        return {
          market,
          differenceMs: item.differenceMs,
        }
      })
      .filter((entry): entry is { market: PublicValidationMarketCard; differenceMs: number } => entry !== null),
    [closingSoonItems.urgent, marketMap],
  )

  const upcomingMarkets = useMemo(
    () => closingSoonItems.upcoming
      .map((item) => {
        const market = marketMap.get(item.marketId)
        if (!market) {
          return null
        }

        return {
          market,
          differenceMs: item.differenceMs,
        }
      })
      .filter((entry): entry is { market: PublicValidationMarketCard; differenceMs: number } => entry !== null),
    [closingSoonItems.upcoming, marketMap],
  )

  const displayedSourceMode = sessionMode === 'demo'
    ? 'demo'
    : marketSourceMode === 'live' && closingSoonSourceMode === 'live'
      ? 'live'
      : marketSourceMode === 'demo' && closingSoonSourceMode === 'demo'
        ? 'demo'
        : 'mixed'

  const isLoading = isMarketLoading || isClosingSoonLoading
  const errorMessage = marketErrorMessage ?? closingSoonErrorMessage
  const totalCandidateCount = closingSoonItems.urgent.length + closingSoonItems.upcoming.length
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const visibleUrgentMarkets = useMemo(
    () => normalizedSearchQuery.length === 0
      ? urgentMarkets
      : urgentMarkets.filter(({ market }) => market.title.toLowerCase().includes(normalizedSearchQuery)),
    [normalizedSearchQuery, urgentMarkets],
  )
  const visibleUpcomingMarkets = useMemo(
    () => normalizedSearchQuery.length === 0
      ? upcomingMarkets
      : upcomingMarkets.filter(({ market }) => market.title.toLowerCase().includes(normalizedSearchQuery)),
    [normalizedSearchQuery, upcomingMarkets],
  )
  const showSearchEmptyState =
    !isLoading
    && !errorMessage
    && normalizedSearchQuery.length > 0
    && totalCandidateCount > 0
    && visibleUrgentMarkets.length === 0
    && visibleUpcomingMarkets.length === 0

  return (
    <section className="route-page market-page closing-soon-page">
      <DataSourceBadge mode={displayedSourceMode} />
      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      <header className="route-header compact closing-soon-header">
        <h1>即将开奖</h1>
        <p>距离公开结果裁决只剩 3 小时以内的命题，帮助你在样本门槛收尾前完成最后一轮判断。</p>
      </header>

      <MarketSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="搜索即将开奖"
      />

      {errorMessage ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>即将开奖加载失败</h2>
            <span>{errorMessage}</span>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>正在加载即将开奖命题</h2>
            <span>Arena 正在按裁决时间筛选最近 3 小时内即将进入公开结果窗口的命题。</span>
          </div>
        </section>
      ) : null}

      {visibleUrgentMarkets.length > 0 ? (
        <section className="prediction-topic-section closing-soon-urgent" aria-label="3 小时内即将开奖">
          <div className="prediction-topic-section-head">
            <div>
              <h2>3 小时内即将开奖</h2>
              <p>这些命题已经接近裁决时刻，临近样本门槛或时间上限。</p>
            </div>
            <span className="prediction-topic-count alert">紧急</span>
          </div>
          <div className="market-grid prediction-topic-grid closing-soon-grid">
            {visibleUrgentMarkets.map(({ market, differenceMs }) => (
              <article className="closing-soon-card-shell" key={`urgent-${market.id}`}>
                <div className="closing-soon-card-eyebrow">
                  <Hourglass size={14} />
                  {formatCountdown(differenceMs)}
                </div>
                <CategoryCompactMarketCard market={market} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {visibleUpcomingMarkets.length > 0 ? (
        <section className="prediction-topic-section closing-soon-upcoming-section" aria-label="接下来即将开奖">
          <div className="market-grid prediction-topic-grid closing-soon-grid">
            {visibleUpcomingMarkets.map(({ market, differenceMs }) => (
              <article className="closing-soon-card-shell" key={`upcoming-${market.id}`}>
                <div className="closing-soon-card-eyebrow upcoming">
                  <Clock3 size={14} />
                  {formatCountdown(differenceMs)}
                </div>
                <CategoryCompactMarketCard market={market} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showSearchEmptyState ? (
        <p className="market-page-search-empty" role="status">
          没有匹配“{searchQuery.trim()}”的命题，换个关键词试试。
        </p>
      ) : null}

      {!isLoading && totalCandidateCount === 0 && !errorMessage ? (
        <section className="account-menu-panel closing-soon-empty-panel">
          <div className="account-menu-panel-head">
            <h2>当前没有正在等待裁决的命题</h2>
            <span>所有命题都已完成裁决或尚未启动。可以先返回热门命题继续浏览。</span>
          </div>
          <Link className="closing-soon-empty-cta" to="/zh">
            返回热门命题
          </Link>
        </section>
      ) : null}
    </section>
  )
}
