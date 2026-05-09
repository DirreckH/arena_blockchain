import { useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowUp, ChevronRight, Flame, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FilterStrip } from '../navigation/FilterStrip'
import {
  filterRankedMarketItems,
  type RankedMarketFilterId,
  type RankedMarketPageConfig,
} from '../../mocks/ranked-market-page.mock'

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

function BreakingHeroArt() {
  return (
    <>
      <span className="breaking-hero-ring breaking-hero-ring-outer" />
      <span className="breaking-hero-ring breaking-hero-ring-inner" />
      <span className="breaking-hero-rail breaking-hero-rail-left" />
      <span className="breaking-hero-rail breaking-hero-rail-right" />
      <span className="breaking-hero-token breaking-hero-token-left">
        <ArrowDown size={28} strokeWidth={3} />
      </span>
      <span className="breaking-hero-token breaking-hero-token-right">
        <ArrowUp size={28} strokeWidth={3} />
      </span>
    </>
  )
}

function HotHeroArt() {
  return (
    <>
      <span className="breaking-hero-ring breaking-hero-ring-outer" />
      <span className="breaking-hero-ring breaking-hero-ring-inner" />
      <span className="breaking-hero-rail breaking-hero-rail-left" />
      <span className="breaking-hero-rail breaking-hero-rail-right" />
      <span className="breaking-hero-token breaking-hero-token-left">
        <Flame size={28} strokeWidth={2.5} />
      </span>
      <span className="breaking-hero-token breaking-hero-token-right">
        <TrendingUp size={28} strokeWidth={2.5} />
      </span>
      <span className="hot-hero-pulse hot-hero-pulse-left" />
      <span className="hot-hero-pulse hot-hero-pulse-right" />
      <span className="hot-hero-orbit">
        <Activity size={18} strokeWidth={2.4} />
      </span>
    </>
  )
}

function formatChange(change: number) {
  return `${change}`
}

export function MarketRankingPage({ config }: { config: RankedMarketPageConfig }) {
  const [activeCategoryId, setActiveCategoryId] = useState<RankedMarketFilterId>(
    config.categories[0]?.id ?? 'all',
  )
  const visibleItems = useMemo(
    () => filterRankedMarketItems(config, activeCategoryId),
    [config, activeCategoryId],
  )
  const isHotHero = config.heroVariant === 'hot'

  return (
    <section className={`route-page market-page breaking-page ${config.pageClassName}`.trim()}>
      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      <header className={isHotHero ? 'breaking-hero hot-hero' : 'breaking-hero'}>
        <div className="breaking-hero-copy">
          <p className="breaking-hero-date">{config.dateLabel}</p>
          <h1>{config.title}</h1>
          <p className="breaking-hero-description">{config.description}</p>
        </div>

        <div className={isHotHero ? 'breaking-hero-art hot-hero-art' : 'breaking-hero-art'} aria-hidden="true">
          {isHotHero ? <HotHeroArt /> : <BreakingHeroArt />}
        </div>
      </header>

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
    </section>
  )
}
