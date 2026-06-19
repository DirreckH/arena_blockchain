import { Link } from 'react-router-dom'
import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'
import { ProgressMeter } from '../shared/ProgressMeter'

const marketHref = (marketId: string) => `/zh/event/${marketId}`
const resolveMarketHref = (market: PublicValidationMarketCard) => market.previewHref ?? marketHref(market.id)

const TIME_PROGRESS_LABEL = '\u65f6\u95f4\u8fdb\u5ea6'
const EFFECTIVE_SAMPLE_LABEL = '\u6709\u6548\u6837\u672c'

const revealLabel = (market: PublicValidationMarketCard) =>
  market.revealTargetAt ?? market.closesAt ?? 'Reveal target pending'

const effectiveSampleLabel = (market: PublicValidationMarketCard) =>
  `${market.progress.effectiveSampleCount} / ${market.progress.minEffectiveSample}`

export function CategoryFeaturedMarketCard({ market }: { market: PublicValidationMarketCard }) {
  const href = resolveMarketHref(market)
  const primaryOptions = market.options.slice(0, 2)

  return (
    <article className="category-card category-card-featured">
      <div className="category-card-head">
        <span className="category-card-kicker">{market.category}</span>
      </div>

      <Link className="category-featured-link" to={href}>
        <div className="category-featured-copy">
          <h2>{market.title}</h2>
          <p>{market.publicResult ?? revealLabel(market)}</p>
        </div>

        <div className="category-featured-media">
          <div className="category-featured-placeholder market-media-placeholder" aria-hidden="true" />
        </div>
      </Link>

      <div className="category-card-progress">
        <ProgressMeter label={TIME_PROGRESS_LABEL} detail={revealLabel(market)} value={market.progress.timeProgressPercent} />
        <ProgressMeter
          label={EFFECTIVE_SAMPLE_LABEL}
          detail={effectiveSampleLabel(market)}
          value={market.progress.effectiveSampleProgressPercent}
        />
      </div>

      <div className="category-featured-actions">
        {primaryOptions.map((option) => (
          <Link className="category-action-pill" key={option.id} to={`${href}?option=${encodeURIComponent(option.id)}`}>
            <span>{option.label}</span>
          </Link>
        ))}
      </div>

      <div className="category-card-footer">
        <span className="category-card-caption">{revealLabel(market)}</span>
      </div>
    </article>
  )
}

export function CategoryCompactMarketCard({ market }: { market: PublicValidationMarketCard }) {
  const href = resolveMarketHref(market)
  const compactOptions = market.options.slice(0, 2)
  const reveal = revealLabel(market)
  const effectiveSample = effectiveSampleLabel(market)

  return (
    <article className="category-card category-compact-card">
      <div className="category-compact-top">
        <Link className="category-compact-media" to={href} aria-label={`${market.title} details`}>
          <div className="category-compact-media-placeholder market-media-placeholder" aria-hidden="true" />
        </Link>

        <div className="category-compact-title-shell">
          <Link className="category-compact-title-link" to={href}>
            <strong>{market.title}</strong>
          </Link>
        </div>
      </div>

      <div className="category-compact-metrics" aria-label="命题概要">
        <div className="category-compact-metric">
          <ProgressMeter label={TIME_PROGRESS_LABEL} detail={reveal} value={market.progress.timeProgressPercent} />
        </div>
        <div className="category-compact-metric">
          <ProgressMeter
            label={EFFECTIVE_SAMPLE_LABEL}
            detail={effectiveSample}
            value={market.progress.effectiveSampleProgressPercent}
          />
        </div>
      </div>

      <div className="category-compact-options" role="list" aria-label="命题选项">
        {compactOptions.map((option) => (
          <Link
            key={option.id}
            className={`category-compact-option ${option.displayOrder === 1 ? 'option-tone-a' : 'option-tone-b'}`}
            role="listitem"
            to={`${href}?option=${encodeURIComponent(option.id)}`}
          >
            <span className="category-compact-option-label">{option.label}</span>
          </Link>
        ))}
      </div>
    </article>
  )
}
