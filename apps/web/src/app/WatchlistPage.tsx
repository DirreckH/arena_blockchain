import { Bookmark, LogIn, Search } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { MarketCardView } from '../components/market/MarketCardView'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { WalletStatusCard } from '../components/shared/WalletStatusCard'
import { useRulesIntro } from '../components/shared/RulesIntroContext'
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

  const params = new URLSearchParams(location.search)
  const requestedMarketId = params.get('market')
  const watchlistItems = watchlist?.items ?? []
  const watchlistMarketIds = watchlistItems.map((item) => item.marketId)
  const visibleMarkets = markets.filter((market) => watchlistMarketIds.includes(market.id))

  const selectedMarketMeta = requestedMarketId
    ? markets.find((market) => market.id === requestedMarketId) ?? null
    : null
  const selectedIsAlreadySaved = Boolean(requestedMarketId && watchlistItems.some((item) => item.marketId === requestedMarketId))

  const sourceMode = !isAuthenticated
    ? 'unavailable'
    : sessionMode === 'demo'
      ? 'demo'
      : 'live'

  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>已保存的命题</h1>
        <p>在同一个产品界面内管理你关注的命题，与发现、活动和验证层保持连贯。</p>
      </div>

      <div className="utility-stack">
        <DataSourceBadge
          mode={sourceMode}
          detail={
            !isAuthenticated
              ? '登录后加载账户关注列表。'
              : sessionMode === 'demo'
                ? '当前会话使用预置演示关注列表。'
                : '已保存命题从真实认证账户 API 加载。'
          }
        />

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

        {isAuthenticated && !isLoading && visibleMarkets.length === 0 ? (
          <section className="account-empty-card">
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

        {isAuthenticated && visibleMarkets.length > 0 ? (
          <>
            <section className="watchlist-summary-row">
              <div className="watchlist-summary-copy">
                <strong>已保存 {watchlist?.totalCount ?? visibleMarkets.length} 个命题</strong>
                <span>在任意命题卡片上点击书签图标即可更新此列表。</span>
              </div>
              <Link className="secondary-action" to="/zh/markets">
                <Bookmark size={16} />
                <span>浏览更多命题</span>
              </Link>
            </section>

            <div className="market-grid route-grid">
              {visibleMarkets.map((market) => (
                <MarketCardView market={market} key={`watchlist-${market.id}`} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
