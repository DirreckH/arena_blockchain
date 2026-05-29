import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'

const marketHref = (marketId: string) => `/zh/event/${marketId}`

const TIME_PROGRESS_LABEL = '时间进度'
const EFFECTIVE_SAMPLE_LABEL = '有效样本'

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

const revealLabel = (market: PublicValidationMarketCard) =>
  market.revealTargetAt ?? market.closesAt ?? 'Reveal target pending'

const effectiveSampleLabel = (market: PublicValidationMarketCard) =>
  `${market.progress.effectiveSampleCount} / ${market.progress.minEffectiveSample}`

export function FeaturedCarousel({
  market,
  pager,
}: {
  market: PublicValidationMarketCard
  pager?: ReactNode
}) {
  const href = marketHref(market.id)
  const compactOptions = market.options.slice(0, 2)
  const reveal = revealLabel(market)
  const effectiveSample = effectiveSampleLabel(market)
  const timePercent = clampPercent(market.progress.timeProgressPercent)
  const samplePercent = clampPercent(market.progress.effectiveSampleProgressPercent)

  return (
    <article className="trending-card" aria-label={market.title}>
      <Link className="trending-card-subject" to={href} aria-label={`${market.title} 详情`}>
        <span className="trending-card-media">
          {market.imageSrc ? (
            <img src={market.imageSrc} alt="" />
          ) : (
            <span className="trending-card-media-placeholder" aria-hidden="true" />
          )}
        </span>
        <span className="trending-card-title-block">
          <strong className="trending-card-title">{market.title}</strong>
          <span className="trending-card-meta">
            <span className="trending-card-status">{market.progress.statusLabel}</span>
            <span className="trending-card-category">{market.category}</span>
          </span>
        </span>
      </Link>

      <div className="trending-card-metrics" aria-label="命题进度">
        <div className="trending-card-metric">
          <div className="trending-card-metric-row">
            <span className="trending-card-metric-label">{TIME_PROGRESS_LABEL}</span>
            <strong className="trending-card-metric-value">{timePercent}%</strong>
          </div>
          <div className="trending-card-meter" aria-hidden="true">
            <span className="trending-card-meter-fill time" style={{ width: `${timePercent}%` }} />
          </div>
          <span className="trending-card-metric-detail">{reveal}</span>
        </div>
        <div className="trending-card-metric">
          <div className="trending-card-metric-row">
            <span className="trending-card-metric-label">{EFFECTIVE_SAMPLE_LABEL}</span>
            <strong className="trending-card-metric-value">{samplePercent}%</strong>
          </div>
          <div className="trending-card-meter" aria-hidden="true">
            <span className="trending-card-meter-fill sample" style={{ width: `${samplePercent}%` }} />
          </div>
          <span className="trending-card-metric-detail">{effectiveSample}</span>
        </div>
      </div>

      <div className="trending-card-options" role="list" aria-label="参与裁决">
        {compactOptions.map((option) => (
          <Link
            key={option.id}
            className={`trending-card-option ${option.displayOrder === 1 ? 'tone-yes' : 'tone-no'}`}
            role="listitem"
            to={`${href}?option=${encodeURIComponent(option.id)}`}
          >
            <span className="trending-card-option-label">{option.label}</span>
            <span className="trending-card-option-cta" aria-hidden="true">
              立即裁决 →
            </span>
          </Link>
        ))}
      </div>

      {pager ? <div className="trending-card-footer">{pager}</div> : null}
    </article>
  )
}
