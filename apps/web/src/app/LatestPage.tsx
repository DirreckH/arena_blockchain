import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MarketWorkspace } from '../components/market/MarketWorkspace'
import { FilterStrip } from '../components/navigation/FilterStrip'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useDiscoveryData } from '../features/arena/discovery-data'
import { useValidationMarketData } from '../features/validation/validation-market-data'
import { useAuthSession } from '../features/auth/auth-session'

const LATEST_TOPIC_PAGE_SIZE = 4

export function LatestPage() {
  const { latestTopics, sourceMode, isLoading, errorMessage } = useDiscoveryData()
  const { sessionMode } = useAuthSession()
  const topicItems = latestTopics?.items ?? []
  const [activeTopicId, setActiveTopicId] = useState(topicItems[0]?.id ?? '')
  const [activePage, setActivePage] = useState(0)
  const railRef = useRef<HTMLDivElement | null>(null)
  const { markets: allMarkets } = useValidationMarketData()
  const marketMap = useMemo(
    () => new Map(allMarkets.map((market) => [market.id, market])),
    [allMarkets],
  )

  useEffect(() => {
    if (!activeTopicId && topicItems[0]?.id) {
      setActiveTopicId(topicItems[0].id)
    }
  }, [activeTopicId, topicItems])

  const activeTopic = topicItems.find((topic) => topic.id === activeTopicId) ?? topicItems[0]
  const allTopicMarkets = useMemo(() => {
    if (!activeTopic) {
      return Array.from(marketMap.values())
    }

    return Array.from(new Set(activeTopic.marketIds))
      .map((marketId) => marketMap.get(marketId))
      .filter((market) => market !== undefined)
  }, [activeTopic, marketMap])
  const totalPages = Math.max(1, Math.ceil(allTopicMarkets.length / LATEST_TOPIC_PAGE_SIZE))
  const currentPage = Math.min(activePage, totalPages - 1)
  const markets = useMemo(() => {
    const start = currentPage * LATEST_TOPIC_PAGE_SIZE

    return allTopicMarkets.slice(start, start + LATEST_TOPIC_PAGE_SIZE)
  }, [allTopicMarkets, currentPage])

  const scrollRail = (direction: 'left' | 'right') => {
    railRef.current?.scrollBy({
      left: direction === 'left' ? -260 : 260,
      behavior: 'smooth',
    })
  }

  const pagination =
    totalPages > 1 ? (
      <div className="latest-topic-pagination" aria-label="Latest topic pagination">
        <button
          type="button"
          className="latest-page-button"
          onClick={() => setActivePage((page) => Math.max(0, page - 1))}
          disabled={currentPage === 0}
        >
          上一页
        </button>
        <div className="latest-page-dots" aria-label="Latest topic pages">
          {Array.from({ length: totalPages }, (_, pageIndex) => (
            <button
              type="button"
              key={pageIndex}
              className={pageIndex === currentPage ? 'latest-page-dot active' : 'latest-page-dot'}
              aria-label={`第 ${pageIndex + 1} 页`}
              aria-current={pageIndex === currentPage ? 'page' : undefined}
              onClick={() => setActivePage(pageIndex)}
            />
          ))}
        </div>
        <button
          type="button"
          className="latest-page-button"
          onClick={() => setActivePage((page) => Math.min(totalPages - 1, page + 1))}
          disabled={currentPage === totalPages - 1}
        >
          下一页
        </button>
      </div>
    ) : undefined

  return (
    <section className="route-page market-page latest-page">
      <DataSourceBadge
        mode={sessionMode === 'demo' ? 'demo' : sourceMode}
        detail={
          sessionMode === 'demo'
            ? 'Latest topics use the authenticated demo session.'
            : sourceMode === 'demo'
              ? 'Latest topics fell back to the seeded demo discovery feed.'
              : 'Latest topics and cards are read from the public discovery and market feeds.'
        }
      />
      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      {errorMessage ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>Latest topics unavailable</h2>
            <span>{errorMessage}</span>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>Loading latest topics</h2>
            <span>Arena is reading the current latest-topic view before rendering the market workspace.</span>
          </div>
        </section>
      ) : null}

      <div className="latest-topic-bar" aria-label="Latest topics">
        <button
          type="button"
          className="latest-topic-arrow"
          aria-label="Scroll latest topics left"
          onClick={() => scrollRail('left')}
        >
          <ChevronLeft size={18} />
        </button>

        <div className="latest-topic-rail" ref={railRef} role="tablist" aria-label="Latest topic categories">
          {topicItems.map((topic) => (
            <button
              type="button"
              key={topic.id}
              role="tab"
              aria-selected={topic.id === activeTopicId}
              className={topic.id === activeTopicId ? 'latest-topic-link active' : 'latest-topic-link'}
              onClick={() => {
                setActiveTopicId(topic.id)
                setActivePage(0)
              }}
            >
              {topic.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="latest-topic-arrow"
          aria-label="Scroll latest topics right"
          onClick={() => scrollRail('right')}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <MarketWorkspace
        compact
        markets={markets}
        showFilterStrip={false}
        title={`${activeTopic?.label ?? '最新'} 话题卡片`}
        showMoreLabel={null}
        footer={pagination}
      />
    </section>
  )
}
