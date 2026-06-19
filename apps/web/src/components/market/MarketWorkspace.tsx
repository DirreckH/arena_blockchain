import type { ReactNode } from 'react'
import { Bookmark, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'
import { FilterStrip } from '../navigation/FilterStrip'
import { MarketCardView } from './MarketCardView'

export function MarketWorkspace({
  compact = false,
  markets,
  showFilterStrip = true,
  title = '全部命题',
  showMoreLabel = '查看热门排行',
  showMoreHref = '/zh/markets',
  emptyLabel = '当前条件下暂无命题，换个分类或稍后再来看看。',
  footer,
}: {
  compact?: boolean
  markets: PublicValidationMarketCard[]
  showFilterStrip?: boolean
  title?: string
  showMoreLabel?: string | null
  showMoreHref?: string
  emptyLabel?: string | null
  footer?: ReactNode
}) {
  return (
    <section className={compact ? 'market-workspace compact' : 'market-workspace'} aria-label={title}>
      <div className="market-heading-row">
        <h2>{title}</h2>
        <div className="market-toolbar">
          <Link to="/zh/markets?panel=filters" aria-label="筛选命题">
            <SlidersHorizontal size={21} />
          </Link>
          <Link to="/zh/watchlist" aria-label="已保存命题">
            <Bookmark size={21} />
          </Link>
        </div>
      </div>

      {showFilterStrip ? <FilterStrip /> : null}

      {markets.length > 0 ? (
        <div className="market-grid">
          {markets.map((market) => (
            <MarketCardView market={market} key={market.renderKey ?? market.id} />
          ))}
        </div>
      ) : emptyLabel ? (
        <div className="market-grid-empty" role="status">
          <span>{emptyLabel}</span>
        </div>
      ) : null}

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
