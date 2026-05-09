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
        <h1>Saved propositions</h1>
        <p>Keep watchlisted markets inside the same product shell as discovery, activity, and validation.</p>
      </div>

      <div className="utility-stack">
        <DataSourceBadge
          mode={sourceMode}
          detail={
            !isAuthenticated
              ? 'Sign in to load your account watchlist.'
              : sessionMode === 'demo'
                ? 'This session uses the seeded demo watchlist.'
                : 'Saved markets are loaded from the authenticated account API.'
          }
        />

        {requestedMarketId && isAuthenticated ? (
          <section className="account-menu-panel watchlist-inline-action">
            <div className="account-menu-panel-head">
              <h2>{selectedMarketMeta ? selectedMarketMeta.title : 'Watchlist action'}</h2>
              <span>
                {selectedMarketMeta
                  ? 'Add or remove the selected proposition without leaving the current flow.'
                  : 'The requested market was not found in the current public market feed.'}
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
                    ? 'Saving...'
                    : selectedIsAlreadySaved
                      ? 'Remove from watchlist'
                      : 'Save to watchlist'}
                </button>
                <Link className="secondary-action" to={`/zh/event/${selectedMarketMeta.id}`}>
                  Open proposition
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
              <strong>Sign in to sync saved propositions</strong>
              <p>Your watchlist is now wired to the authenticated Arena account flow instead of a static preview shell.</p>
              <div className="account-summary-actions">
                <button className="primary-action" type="button" onClick={() => openAuthModal('login')}>
                  Connect wallet
                </button>
              </div>
            </section>
            <WalletStatusCard />
          </>
        ) : null}

        {isAuthenticated && errorMessage ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>Watchlist unavailable</h2>
              <span>{errorMessage}</span>
            </div>
          </section>
        ) : null}

        {isAuthenticated && (isLoading || isSaving) ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>{isLoading ? 'Loading saved propositions' : 'Updating watchlist'}</h2>
              <span>
                {isLoading
                  ? 'Arena is reading your saved markets from the current account.'
                  : 'The selected proposition is being written to the current account watchlist.'}
              </span>
            </div>
          </section>
        ) : null}

        {isAuthenticated && !isLoading && visibleMarkets.length === 0 ? (
          <section className="account-empty-card">
            <div className="account-empty-icon" aria-hidden="true">
              <Search size={28} />
            </div>
            <strong>No saved propositions yet</strong>
            <p>Save from discovery, category, or proposition detail pages and the market will appear here immediately.</p>
            <div className="account-summary-actions">
              <Link className="primary-action" to="/zh">
                Discover markets
              </Link>
              <Link className="secondary-action" to="/zh/markets">
                Browse rankings
              </Link>
            </div>
          </section>
        ) : null}

        {isAuthenticated && visibleMarkets.length > 0 ? (
          <>
            <section className="watchlist-summary-row">
              <div className="watchlist-summary-copy">
                <strong>{watchlist?.totalCount ?? visibleMarkets.length} saved propositions</strong>
                <span>Use the bookmark action on any proposition card to keep this list current.</span>
              </div>
              <Link className="secondary-action" to="/zh/markets">
                <Bookmark size={16} />
                <span>Browse more markets</span>
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
