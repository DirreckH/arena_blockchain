import { Fragment } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { navItems } from '../../mocks/arena-market.mock'

type FilterStripMode = 'route' | 'local'

export function FilterStrip({
  className = '',
  dividerBeforeHref,
  mode = 'route',
  activeHref,
  onSelect,
}: {
  className?: string
  dividerBeforeHref?: string
  mode?: FilterStripMode
  activeHref?: string
  onSelect?: (href: string) => void
}) {
  const { pathname } = useLocation()
  const isLocalMode = mode === 'local'

  return (
    <div className={`filter-strip ${className}`.trim()} aria-label="Market categories">
      {navItems.map((item) => {
        const Icon = item.icon
        const isHotCategory = Boolean(item.icon && item.exact)
        const targetHref = isHotCategory ? '/zh/markets' : item.href
        const isActive = isLocalMode
          ? activeHref === item.href
          : pathname === targetHref || (isHotCategory && pathname === '/zh/markets')

        return (
          <Fragment key={item.label}>
            {dividerBeforeHref === item.href ? <span className="filter-divider" aria-hidden="true" /> : null}
            {isLocalMode ? (
              <button
                type="button"
                className={`filter ${isActive ? 'active' : ''}`.trim()}
                aria-pressed={isActive}
                onClick={() => onSelect?.(item.href)}
              >
                {Icon ? <Icon size={17} strokeWidth={2} /> : null}
                <span>{item.label}</span>
              </button>
            ) : (
              <NavLink
                className={() => `filter ${isActive ? 'active' : ''}`}
                end={isHotCategory || item.exact}
                to={targetHref}
              >
                {Icon ? <Icon size={17} strokeWidth={2} /> : null}
                <span>{item.label}</span>
              </NavLink>
            )}
          </Fragment>
        )
      })}
      <Link className="filter arrow" to="/zh/categories" aria-label="更多市场">
        <span>{"\u66f4\u591a"}</span>
        <ChevronRight size={18} />
      </Link>
    </div>
  )
}
