import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MarketSearchBar } from '../components/market/MarketSearchBar'
import { MarketWorkspace } from '../components/market/MarketWorkspace'
import { FilterStrip } from '../components/navigation/FilterStrip'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useDiscoveryData } from '../features/arena/discovery-data'
import { useValidationMarketData } from '../features/validation/validation-market-data'
import { useAuthSession } from '../features/auth/auth-session'

const LATEST_TOPIC_PAGE_SIZE = 4
const ALL_LATEST_TOPICS_ID = 'all-latest-topics'

export function LatestPage() {
  const { latestTopics, sourceMode, isLoading, errorMessage } = useDiscoveryData()
  const { sessionMode } = useAuthSession()
  const topicItems = latestTopics?.items ?? []
  const [activeTopicId, setActiveTopicId] = useState(topicItems[0]?.id ?? '')
  const [activePage, setActivePage] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
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

  const activeTopic = activeTopicId === ALL_LATEST_TOPICS_ID
    ? undefined
    : (topicItems.find((topic) => topic.id === activeTopicId) ?? topicItems[0])
  const allTopicMarkets = useMemo(() => {
    const baseMarkets = !activeTopic
      ? Array.from(marketMap.values())
      : Array.from(new Set(activeTopic.marketIds))
          .map((marketId) => marketMap.get(marketId))
          .filter((market) => market !== undefined)

    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (normalizedQuery.length === 0) {
      return baseMarkets
    }

    return baseMarkets.filter((market) => market.title.toLowerCase().includes(normalizedQuery))
  }, [activeTopic, marketMap, searchQuery])
  const totalPages = Math.max(1, Math.ceil(allTopicMarkets.length / LATEST_TOPIC_PAGE_SIZE))
  const currentPage = Math.min(activePage, totalPages - 1)
  const markets = useMemo(() => {
    const start = currentPage * LATEST_TOPIC_PAGE_SIZE

    return allTopicMarkets.slice(start, start + LATEST_TOPIC_PAGE_SIZE)
  }, [allTopicMarkets, currentPage])

  useEffect(() => {
    setActivePage(0)
  }, [searchQuery])

  const scrollRail = (direction: 'left' | 'right') => {
    railRef.current?.scrollBy({
      left: direction === 'left' ? -260 : 260,
      behavior: 'smooth',
    })
  }

  const pagination =
    totalPages > 1 ? (
      <div className="latest-topic-pagination" aria-label="最新话题翻页">
        <button
          type="button"
          className="latest-page-button"
          onClick={() => setActivePage((page) => Math.max(0, page - 1))}
          disabled={currentPage === 0}
        >
          上一页
        </button>
        <div className="latest-page-dots" aria-label="最新话题页码">
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
      <DataSourceBadge mode={sessionMode === 'demo' ? 'demo' : sourceMode} />
      <MarketSearchBar value={searchQuery} onChange={setSearchQuery} />
      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      {errorMessage ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>最新话题加载失败</h2>
            <span>{errorMessage}</span>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>正在加载最新话题</h2>
            <span>Arena 正在读取最新话题视图，稍后即可展示命题卡片。</span>
          </div>
        </section>
      ) : null}

      <div className="latest-topic-bar" aria-label="最新话题">
        <button
          type="button"
          className={activeTopicId === ALL_LATEST_TOPICS_ID ? 'latest-topic-all active' : 'latest-topic-all'}
          aria-label="查看全部最新话题"
          onClick={() => {
            setActiveTopicId(ALL_LATEST_TOPICS_ID)
            setActivePage(0)
          }}
        >
          全部
        </button>

        <button
          type="button"
          className="latest-topic-arrow"
          aria-label="向左滚动话题列表"
          onClick={() => scrollRail('left')}
        >
          <ChevronLeft size={18} />
        </button>

        <div className="latest-topic-rail" ref={railRef} role="tablist" aria-label="最新话题分类">
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
          aria-label="向右滚动话题列表"
          onClick={() => scrollRail('right')}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <MarketWorkspace
        compact
        markets={markets}
        showFilterStrip={false}
        title={`${activeTopicId === ALL_LATEST_TOPICS_ID ? '全部' : (activeTopic?.label ?? '最新')} 话题卡片`}
        showMoreLabel={null}
        footer={pagination}
      />

      {searchQuery.trim().length > 0 && allTopicMarkets.length === 0 ? (
        <p className="market-page-search-empty" role="status">
          没有匹配“{searchQuery.trim()}”的市场，换个关键词试试。
        </p>
      ) : null}
    </section>
  )
}
