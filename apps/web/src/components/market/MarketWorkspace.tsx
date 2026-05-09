import type { ReactNode } from 'react'
import { Bookmark, ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'
import { FilterStrip } from '../navigation/FilterStrip'
import { MarketCardView } from './MarketCardView'

export function MarketWorkspace({
  compact = false,
  markets,
  showFilterStrip = true,
  title = 'All propositions',
  showMoreLabel = '查看热门排行',
  showMoreHref = '/zh/markets',
  footer,
}: {
  compact?: boolean
  markets: PublicValidationMarketCard[]
  showFilterStrip?: boolean
  title?: string
  showMoreLabel?: string | null
  showMoreHref?: string
  footer?: ReactNode
}) {
  return (
    <section className={compact ? 'market-workspace compact' : 'market-workspace'} aria-label={title}>
      <div className="market-heading-row">
        <h2>{title}</h2>
        <div className="market-toolbar">
          <Link to="/zh/search" aria-label="Search propositions">
            <Search size={21} />
          </Link>
          <Link to="/zh/markets?panel=filters" aria-label="Filter propositions">
            <SlidersHorizontal size={21} />
          </Link>
          <Link to="/zh/watchlist" aria-label="Saved propositions">
            <Bookmark size={21} />
          </Link>
        </div>
      </div>

      {showFilterStrip ? <FilterStrip /> : null}

      <div className="market-grid">
        {markets.map((market) => (
          <MarketCardView market={market} key={market.id} />
        ))}
      </div>

      {showMoreLabel ? (
        <Link className="show-more" to={showMoreHref}>
          <span>{showMoreLabel}</span>
          <ChevronRight size={18} />
        </Link>
      ) : null}
      {footer}
    </section>
  )
}
