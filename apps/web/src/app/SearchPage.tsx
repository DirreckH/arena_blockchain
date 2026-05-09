import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MarketCardView } from '../components/market/MarketCardView'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useValidationMarketData } from '../features/validation/validation-market-data'
import { useAuthSession } from '../features/auth/auth-session'

export function SearchPage() {
  const [query, setQuery] = useState('')
  const { markets, isLoading, errorMessage } = useValidationMarketData()
  const { sessionMode, isAuthenticated } = useAuthSession()

  const normalizedQuery = query.trim().toLowerCase()
  const filteredMarkets = useMemo(() => {
    if (!normalizedQuery) {
      return markets.slice(0, 8)
    }

    return markets.filter((market) =>
      `${market.title} ${market.category} ${market.options.map((option) => option.label).join(' ')}`
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [markets, normalizedQuery])

  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>Search propositions</h1>
        <p>Search stays inside the current Arena market surface and reads from the same public market feed as the rest of the product.</p>
      </div>

      <div className="utility-stack">
        <DataSourceBadge
          mode={sessionMode === 'demo' ? 'demo' : isAuthenticated ? 'live' : 'live'}
          detail="Search filters the currently loaded public proposition feed."
        />

        <div className="route-search search-page-search">
          <Search size={22} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search proposition title, category, or option label"
          />
        </div>

        {errorMessage ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>Search feed unavailable</h2>
              <span>{errorMessage}</span>
            </div>
          </section>
        ) : null}

        {isLoading ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>Loading market feed</h2>
              <span>Arena is loading the proposition set that powers search and discovery.</span>
            </div>
          </section>
        ) : null}

        {!isLoading && filteredMarkets.length === 0 ? (
          <section className="account-empty-card">
            <div className="account-empty-icon" aria-hidden="true">
              <Search size={28} />
            </div>
            <strong>No matching propositions</strong>
            <p>Try a different market title, category, or option label. Search only exposes public proposition fields.</p>
          </section>
        ) : null}

        {!isLoading && filteredMarkets.length > 0 ? (
          <div className="market-grid route-grid">
            {filteredMarkets.map((market) => (
              <MarketCardView market={market} key={`search-${market.id}`} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
