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
          <h1>突发</h1>
          <p>正在加载当前突发事件排行。</p>
        </div>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="route-page">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>突发</h1>
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
          <h1>突发</h1>
          <p>当前暂无突发事件排行数据。</p>
        </div>
      </section>
    )
  }

  return (
    <>
      <DataSourceBadge mode={sessionMode === 'demo' ? 'demo' : sourceMode} />
      <MarketRankingPage
        config={toRankedMarketPageConfig(breaking)}
        showSearch
        searchPlaceholder="搜索市场标题"
      />
    </>
  )
}
