import { useState } from 'react'
import { EyeOff, LogIn, Search } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { MarketCardView } from '../components/market/MarketCardView'
import { MarketSearchBar } from '../components/market/MarketSearchBar'
import { FilterStrip } from '../components/navigation/FilterStrip'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { WalletStatusCard } from '../components/shared/WalletStatusCard'
import { useRulesIntro } from '../components/shared/RulesIntroContext'
import { formatCategoryLabel, formatRelativeTime } from '../features/arena/arena-ui-mappers'
import { useWatchlistData } from '../features/arena/watchlist-data'
import { useValidationMarketData } from '../features/validation/validation-market-data'
import { useAuthSession } from '../features/auth/auth-session'

export function WatchlistPage() {
  const location = useLocation()
  const { isAuthenticated, openAuthModal } = useRulesIntro()
  const { sessionMode } = useAuthSession()
  const { markets } = useValidationMarketData()
  const {
    watchlist,
    isLoading,
    isSaving,
    errorMessage,
    saveMarket,
    removeMarket,
  } = useWatchlistData()
  const [searchQuery, setSearchQuery] = useState('')

  const params = new URLSearchParams(location.search)
  const requestedMarketId = params.get('market')
  const watchlistItems = watchlist?.items ?? []
  const watchlistMarketIds = watchlistItems.map((item) => item.marketId)
  const visibleMarkets = markets.filter((market) => watchlistMarketIds.includes(market.id))
  const hiddenWatchlistItems = watchlistItems.filter(
    (item) => !visibleMarkets.some((market) => market.id === item.marketId),
  )
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredVisibleMarkets = normalizedSearchQuery.length === 0
    ? visibleMarkets
    : visibleMarkets.filter((market) => {
      const searchableText = [market.title, formatCategoryLabel(market.category)].join(' ').toLowerCase()

      return searchableText.includes(normalizedSearchQuery)
    })
  const filteredHiddenWatchlistItems = normalizedSearchQuery.length === 0
    ? hiddenWatchlistItems
    : hiddenWatchlistItems.filter((item) => {
      const searchableText = [item.propositionTitle, formatCategoryLabel(item.category)].join(' ').toLowerCase()

      return searchableText.includes(normalizedSearchQuery)
    })

  const selectedMarketMeta = requestedMarketId
    ? markets.find((market) => market.id === requestedMarketId) ?? null
    : null
  const selectedIsAlreadySaved = Boolean(requestedMarketId && watchlistItems.some((item) => item.marketId === requestedMarketId))

  const sourceMode = !isAuthenticated
    ? 'unavailable'
    : sessionMode === 'demo'
      ? 'demo'
      : errorMessage
        ? 'unavailable'
        : 'live'
  const showEmptyState = isAuthenticated
    && !isLoading
    && !errorMessage
    && watchlist !== null
    && visibleMarkets.length === 0
    && hiddenWatchlistItems.length === 0
  const showHiddenState = isAuthenticated
    && !isLoading
    && !errorMessage
    && filteredHiddenWatchlistItems.length > 0
  const showSearchEmptyState = isAuthenticated
    && !isLoading
    && !errorMessage
    && normalizedSearchQuery.length > 0
    && (visibleMarkets.length > 0 || hiddenWatchlistItems.length > 0)
    && filteredVisibleMarkets.length === 0
    && filteredHiddenWatchlistItems.length === 0

  return (
    <section className="route-page utility-page">
      <DataSourceBadge mode={sourceMode} />
      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      <div className="route-header compact">
        <h1>我的收藏</h1>
      </div>

      <MarketSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="搜索收藏命题"
      />

      <div className="utility-stack">
        {requestedMarketId && isAuthenticated ? (
          <section className="account-menu-panel watchlist-inline-action">
            <div className="account-menu-panel-head">
              <h2>{selectedMarketMeta ? selectedMarketMeta.title : '关注操作'}</h2>
              <span>
                {selectedMarketMeta
                  ? '可在不离开当前流程的情况下添加或移除该命题。'
                  : '当前公开市场列表中未找到该命题。'}
              </span>
            </div>
            {selectedMarketMeta ? (
              <div className="watchlist-inline-actions">
                <button
                  className="primary-action"
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    if (selectedIsAlreadySaved) {
                      void removeMarket(selectedMarketMeta.id)
                      return
                    }

                    void saveMarket(selectedMarketMeta.id)
                  }}
                >
                  {isSaving
                    ? '保存中...'
                    : selectedIsAlreadySaved
                      ? '从关注列表移除'
                      : '添加到关注列表'}
                </button>
                <Link className="secondary-action" to={`/zh/event/${selectedMarketMeta.id}`}>
                  查看命题详情
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}

        {!isAuthenticated ? (
          <>
            <section className="account-empty-card">
              <div className="account-empty-icon" aria-hidden="true">
                <LogIn size={28} />
              </div>
              <strong>登录后同步已保存的命题</strong>
              <p>关注列表已接入真实 Arena 账户，登录后可在任意设备同步查看。</p>
              <div className="account-summary-actions">
                <button className="primary-action" type="button" onClick={() => openAuthModal('login')}>
                  连接钱包
                </button>
              </div>
            </section>
            <WalletStatusCard />
          </>
        ) : null}

        {isAuthenticated && errorMessage ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>关注列表加载失败</h2>
              <span>{errorMessage}</span>
            </div>
          </section>
        ) : null}

        {isAuthenticated && (isLoading || isSaving) ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>{isLoading ? '正在加载已保存命题' : '正在更新关注列表'}</h2>
              <span>
                {isLoading
                  ? '正在从账户读取已保存的命题列表。'
                  : '正在将所选命题写入账户关注列表。'}
              </span>
            </div>
          </section>
        ) : null}

        {showEmptyState ? (
          <section className="account-empty-card" data-testid="watchlist-empty-state">
            <div className="account-empty-icon" aria-hidden="true">
              <Search size={28} />
            </div>
            <strong>还没有保存过命题</strong>
            <p>在发现页、分类页或命题详情页点击书签图标，命题会立即出现在这里。</p>
            <div className="account-summary-actions">
              <Link className="primary-action" to="/zh">
                去发现命题
              </Link>
              <Link className="secondary-action" to="/zh/markets">
                浏览排行榜
              </Link>
            </div>
          </section>
        ) : null}

        {showHiddenState ? (
          <section className="account-menu-panel" data-testid="watchlist-hidden-state">
            <div className="account-menu-panel-head">
              <div>
                <h2>已保存但暂未出现在当前公开市场流里的命题</h2>
                <span>
                  这些收藏仍然保存在你的账户里，只是当前公开市场列表暂时没有返回对应卡片。
                </span>
              </div>
            </div>

            <div className="rewards-ledger-list">
              {filteredHiddenWatchlistItems.map((item) => (
                <article
                  className="rewards-ledger-item"
                  key={item.marketId}
                  data-testid={`watchlist-hidden-item-${item.marketId}`}
                >
                  <div className="rewards-ledger-top">
                    <div className="rewards-ledger-copy">
                      <strong>{item.propositionTitle}</strong>
                      <p>{formatCategoryLabel(item.category)}</p>
                    </div>
                    <div className="rewards-ledger-amounts">
                      <strong>
                        <EyeOff size={16} aria-hidden="true" /> 暂未返回卡片
                      </strong>
                      <span>收藏于 {formatRelativeTime(item.savedAt)}</span>
                    </div>
                  </div>

                  <div className="rewards-ledger-meta">
                    <span>Market ID: {item.marketId}</span>
                    <span>Proposition ID: {item.propositionId}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {showSearchEmptyState ? (
          <p className="market-page-search-empty" role="status">
            没有匹配“{searchQuery.trim()}”的收藏命题，换个关键词试试。
          </p>
        ) : null}

        {isAuthenticated && filteredVisibleMarkets.length > 0 ? (
          <>
            <div className="market-grid route-grid">
              {filteredVisibleMarkets.map((market) => (
                <MarketCardView market={market} key={`watchlist-${market.id}`} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
