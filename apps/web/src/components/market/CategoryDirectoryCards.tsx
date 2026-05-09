import { Link } from 'react-router-dom'
import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'
import { ProgressMeter } from '../shared/ProgressMeter'
import { WatchlistToggleButton } from './WatchlistToggleButton'

const marketHref = (marketId: string) => `/zh/event/${marketId}`
const optionCode = (displayOrder: number) => `Option ${String.fromCharCode(64 + displayOrder)}`

const revealLabel = (market: PublicValidationMarketCard) =>
  market.revealTargetAt ?? market.closesAt ?? 'Reveal target pending'

const effectiveSampleLabel = (market: PublicValidationMarketCard) =>
  `${market.progress.effectiveSampleCount} / ${market.progress.minEffectiveSample}`

export function CategoryFeaturedMarketCard({ market }: { market: PublicValidationMarketCard }) {
  const href = marketHref(market.id)
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
          {market.imageSrc ? <img src={market.imageSrc} alt={`${market.title} cover`} /> : <div className="category-featured-placeholder" />}
        </div>
      </Link>

      <div className="category-card-progress">
        <ProgressMeter label="时间进度" detail={revealLabel(market)} value={market.progress.timeProgressPercent} />
        <ProgressMeter
          label="有效样本"
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
        <WatchlistToggleButton marketId={market.id} />
      </div>
    </article>
  )
}

export function CategoryCompactMarketCard({ market }: { market: PublicValidationMarketCard }) {
  const href = marketHref(market.id)
  const primaryOptions = market.options.slice(0, 2)

  return (
    <article className="category-card category-card-compact discover-featured-card">
      <Link className={market.imageSrc ? 'category-compact-title discover-featured-title' : 'category-compact-title without-media discover-featured-title'} to={href}>
        {market.imageSrc ? <img src={market.imageSrc} alt={`${market.title} card icon`} /> : null}
        <span className="category-compact-copy discover-featured-copy">
          <strong>{market.title}</strong>
        </span>
      </Link>

      <div className="category-card-progress discover-featured-progress">
        <ProgressMeter label="时间进度" detail={revealLabel(market)} value={market.progress.timeProgressPercent} />
        <ProgressMeter
          label="有效样本"
          detail={effectiveSampleLabel(market)}
          value={market.progress.effectiveSampleProgressPercent}
        />
      </div>

      {market.publicResult ? <p className="category-card-note discover-featured-note">{market.publicResult}</p> : null}

      <div className="category-card-options discover-featured-options">
        {primaryOptions.map((option) => (
          <div className="category-option-row" key={option.id}>
            <span className="category-option-label">{option.label}</span>
            <Link className="category-option-code" to={`${href}?option=${encodeURIComponent(option.id)}`}>
              {optionCode(option.displayOrder)}
            </Link>
          </div>
        ))}
      </div>

      <div className="category-card-footer discover-featured-footer">
        <span className="category-card-caption">{revealLabel(market)}</span>
        <WatchlistToggleButton marketId={market.id} />
      </div>
    </article>
  )
}
