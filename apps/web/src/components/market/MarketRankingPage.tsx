import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FilterStrip } from '../navigation/FilterStrip'
import { MarketSearchBar } from './MarketSearchBar'
import {
  filterRankedMarketItems,
  type RankedMarketFilterId,
  type RankedMarketPageConfig,
  type RankedMarketPageItem,
} from '../../features/arena/ranked-market-page'

const SPARKLINE_WIDTH = 132
const SPARKLINE_HEIGHT = 46

const clampSparklinePoint = (value: number) => Math.max(0, Math.min(100, value))

function buildSparklinePath(points: number[]) {
  if (points.length === 0) {
    return ''
  }

  return points
    .map((point, index) => {
      const x =
        points.length === 1 ? SPARKLINE_WIDTH / 2 : (SPARKLINE_WIDTH / (points.length - 1)) * index
      const y = SPARKLINE_HEIGHT - (clampSparklinePoint(point) / 100) * SPARKLINE_HEIGHT

      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function RankingSparkline({ points }: { points: number[] }) {
  return (
    <svg
      className="breaking-sparkline"
      aria-hidden="true"
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
    >
      <path d={buildSparklinePath(points)} pathLength={100} />
    </svg>
  )
}

function formatChange(change: number) {
  return `${change}`
}

function matchesQuery(item: RankedMarketPageItem, normalizedQuery: string) {
  if (normalizedQuery.length === 0) {
    return true
  }

  return item.title.toLowerCase().includes(normalizedQuery)
}

interface MarketRankingPageProps {
  config: RankedMarketPageConfig
  showSearch?: boolean
  searchPlaceholder?: string
}

export function MarketRankingPage({
  config,
  showSearch = false,
  searchPlaceholder = '搜索市场标题',
}: MarketRankingPageProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<RankedMarketFilterId>(
    config.categories[0]?.id ?? 'all',
  )
  const [query, setQuery] = useState('')
  const visibleItems = useMemo(() => {
    const byCategory = filterRankedMarketItems(config, activeCategoryId)
    const normalizedQuery = query.trim().toLowerCase()

    if (!showSearch || normalizedQuery.length === 0) {
      return byCategory
    }

    return byCategory.filter((item) => matchesQuery(item, normalizedQuery))
  }, [config, activeCategoryId, query, showSearch])

  return (
    <section className={`route-page market-page breaking-page ${config.pageClassName}`.trim()}>
      {showSearch ? (
        <MarketSearchBar value={query} onChange={setQuery} placeholder={searchPlaceholder} />
      ) : null}

      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      <div className="breaking-category-pills" role="tablist" aria-label={config.categoryAriaLabel}>
        {config.categories.map((category) => (
          <button
            type="button"
            key={category.id}
            role="tab"
            aria-selected={category.id === activeCategoryId}
            className={category.id === activeCategoryId ? 'breaking-pill active' : 'breaking-pill'}
            onClick={() => setActiveCategoryId(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>

      <ol className="breaking-list" aria-label={config.listAriaLabel}>
        {visibleItems.map((item, index) => (
          <li className="breaking-list-item" key={item.id}>
            <Link className="breaking-row" to={item.href}>
              <span className="breaking-rank">{index + 1}</span>

              <div className="breaking-thumbnail-shell">
                {item.imageSrc ? (
                  <img className="breaking-thumbnail" src={item.imageSrc} alt={item.imageAlt ?? item.title} />
                ) : (
                  <span
                    className={`breaking-thumbnail breaking-thumbnail-tile ${
                      item.tileTone === 'f1' ? 'breaking-thumbnail-f1' : 'breaking-thumbnail-neutral'
                    }`}
                    aria-hidden="true"
                  >
                    {item.tileLabel}
                  </span>
                )}
                {item.isVerified ? <span className="breaking-verified-marker" aria-hidden="true" /> : null}
              </div>

              <div className="breaking-row-copy">
                <h2>{item.title}</h2>

                <div className="breaking-row-metrics">
                  <strong>{item.score}</strong>
                  <span className={item.change >= 0 ? 'positive' : 'negative'}>
                    <span aria-hidden="true">{item.change >= 0 ? '↗' : '↘'}</span>
                    {formatChange(item.change)}
                  </span>
                </div>
              </div>

              <div className="breaking-row-trend">
                <RankingSparkline points={item.sparkline} />
              </div>

              <span className="breaking-row-arrow" aria-hidden="true">
                <ChevronRight size={22} />
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {showSearch && query.trim().length > 0 && visibleItems.length === 0 ? (
        <p className="market-page-search-empty" role="status">
          没有匹配“{query.trim()}”的市场，换个关键词试试。
        </p>
      ) : null}
    </section>
  )
}
