import { ChevronRight } from 'lucide-react'
import { type CSSProperties, Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { filterMoreTopics, navItems } from '../../features/app-shell/navigation-contract'
import { useOptionalDiscoveryData } from '../../features/arena/discovery-data'
import { computeAnchoredDropdownLayout } from '../shared/anchored-dropdown-position'

type FilterStripMode = 'route' | 'local'

const MORE_DROPDOWN_GAP = 4
const MORE_DROPDOWN_VIEWPORT_PADDING = 12
const PRIMARY_FILTER_HREFS = new Set(['/zh', '/zh/breaking', '/zh/new'])
const navItemByHref = new Map(navItems.map((item) => [item.href, item] as const))

type FilterStripProps = {
  className?: string
  dividerBeforeHref?: string
  mode?: FilterStripMode
  activeHref?: string
  onSelect?: (href: string) => void
}

export function FilterStrip({
  className = '',
  dividerBeforeHref,
  mode = 'route',
  activeHref,
  onSelect,
}: FilterStripProps) {
  const { pathname } = useLocation()
  const discovery = useOptionalDiscoveryData()
  const isLocalMode = mode === 'local'
  const moreRef = useRef<HTMLButtonElement | null>(null)
  const moreDropdownRef = useRef<HTMLDivElement | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})
  const portalTarget = typeof document !== 'undefined' ? document.body : null
  const filterItems = useMemo(
    () => [
      ...navItems.filter((item) => PRIMARY_FILTER_HREFS.has(item.href)),
      ...Array.from(discovery?.categoryIndex?.values() ?? []).map((item) => (
        navItemByHref.get(item.pathname) ?? {
          label: item.title || item.label,
          href: item.pathname,
        }
      )),
    ],
    [discovery?.categoryIndex],
  )

  useLayoutEffect(() => {
    if (!moreOpen) {
      setDropdownStyle({})
      return
    }

    let frameId = 0

    const updateDropdownPosition = () => {
      if (!moreRef.current || !moreDropdownRef.current) {
        return
      }

      const layout = computeAnchoredDropdownLayout({
        triggerRect: moreRef.current.getBoundingClientRect(),
        dropdownWidth: moreDropdownRef.current.offsetWidth || 180,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        viewportPadding: MORE_DROPDOWN_VIEWPORT_PADDING,
        triggerGap: MORE_DROPDOWN_GAP,
      })

      setDropdownStyle({
        top: `${layout.top}px`,
        left: `${layout.left}px`,
        maxHeight: `${layout.maxHeight}px`,
      })
    }

    updateDropdownPosition()
    frameId = window.requestAnimationFrame(updateDropdownPosition)
    window.addEventListener('resize', updateDropdownPosition)
    window.addEventListener('scroll', updateDropdownPosition, true)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateDropdownPosition)
      window.removeEventListener('scroll', updateDropdownPosition, true)
    }
  }, [moreOpen])

  return (
    <>
      <div className={`filter-strip ${className}`.trim()} aria-label="命题分类">
        {filterItems.map((item) => {
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
        <button
          ref={moreRef}
          type="button"
          className={`filter arrow${moreOpen ? ' active' : ''}`}
          aria-label="More categories"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((value) => !value)}
        >
          <span>更多</span>
          <ChevronRight size={18} />
        </button>
      </div>
      {moreOpen && portalTarget ? createPortal(
        <>
          <div className="more-dropdown-overlay" onClick={() => setMoreOpen(false)} />
          <div ref={moreDropdownRef} className="more-dropdown" style={dropdownStyle} role="menu">
            {filterMoreTopics.map((item) => {
              const Icon = item.icon
              const isHotCategory = Boolean(item.icon && item.exact)
              const targetHref = isHotCategory ? '/zh/markets' : item.href
              const isActive = isLocalMode
                ? activeHref === item.href
                : pathname === targetHref || (isHotCategory && pathname === '/zh/markets')

              return isLocalMode ? (
                <button
                  key={item.href}
                  type="button"
                  className={`more-dropdown-item${isActive ? ' active' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    onSelect?.(item.href)
                    setMoreOpen(false)
                  }}
                >
                  {Icon ? <Icon size={15} strokeWidth={2} /> : null}
                  {item.label}
                </button>
              ) : (
                <NavLink
                  key={item.href}
                  className={({ isActive: active }) => `more-dropdown-item${active ? ' active' : ''}`}
                  to={targetHref}
                  role="menuitem"
                  onClick={() => setMoreOpen(false)}
                >
                  {Icon ? <Icon size={15} strokeWidth={2} /> : null}
                  {item.label}
                </NavLink>
              )
            })}
          </div>
        </>,
        portalTarget,
      ) : null}
    </>
  )
}
