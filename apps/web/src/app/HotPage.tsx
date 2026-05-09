import { MarketRankingPage } from '../components/market/MarketRankingPage'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useDiscoveryData } from '../features/arena/discovery-data'
import { toRankedMarketPageConfig } from '../features/arena/discovery-adapters'
import { useAuthSession } from '../features/auth/auth-session'

export function HotPage() {
  const { hot, sourceMode, isLoading, errorMessage } = useDiscoveryData()
  const { sessionMode } = useAuthSession()

  if (isLoading) {
    return (
      <section className="route-page">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>Markets</h1>
          <p>Loading the current public ranking surface.</p>
        </div>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="route-page">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>Markets</h1>
          <p>{errorMessage}</p>
        </div>
      </section>
    )
  }

  if (!hot) {
    return (
      <section className="route-page">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>Markets</h1>
          <p>No ranking feed is available right now.</p>
        </div>
      </section>
    )
  }

  return (
    <>
      <DataSourceBadge
        mode={sessionMode === 'demo' ? 'demo' : sourceMode}
        detail={
          sessionMode === 'demo'
            ? 'Market rankings use the authenticated demo session.'
            : sourceMode === 'demo'
              ? 'Market rankings fell back to the seeded demo ranking.'
              : 'Market rankings are read from the public discovery read model.'
        }
      />
      <MarketRankingPage config={toRankedMarketPageConfig(hot)} />
    </>
  )
}
