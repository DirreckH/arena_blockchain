import { MarketRankingPage } from '../components/market/MarketRankingPage'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useDiscoveryData } from '../features/arena/discovery-data'
import { toRankedMarketPageConfig } from '../features/arena/discovery-adapters'
import { useAuthSession } from '../features/auth/auth-session'

export function BreakingPage() {
  const { breaking, sourceMode, isLoading, errorMessage } = useDiscoveryData()
  const { sessionMode } = useAuthSession()

  if (isLoading) {
    return (
      <section className="route-page">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>Breaking</h1>
          <p>Loading the current public breaking ranking.</p>
        </div>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="route-page">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>Breaking</h1>
          <p>{errorMessage}</p>
        </div>
      </section>
    )
  }

  if (!breaking) {
    return (
      <section className="route-page">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>Breaking</h1>
          <p>No breaking ranking is available right now.</p>
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
            ? 'Breaking uses the authenticated demo read model.'
            : sourceMode === 'demo'
              ? 'Breaking ranking fell back to the seeded demo ranking.'
              : 'Breaking ranking is being read from the public discovery surface.'
        }
      />
      <MarketRankingPage config={toRankedMarketPageConfig(breaking)} />
    </>
  )
}
