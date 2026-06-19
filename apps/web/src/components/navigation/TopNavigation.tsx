import { ChevronRight, Globe2, Info, Menu } from 'lucide-react'
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import { hasAnySystemRole, SystemRole } from '@arena/shared'
import { useAuthSession } from '../../features/auth/auth-session'
import { ARENA_LOGO_SRC, productNavItems } from '../../features/app-shell/navigation-contract'
import { computeAnchoredDropdownLayout } from '../shared/anchored-dropdown-position'
import { useQuickMenu } from '../shared/QuickMenuContext'
import { QUICK_MENU_POPOVER_ID } from '../shared/quick-menu.config'
import { useRulesIntro } from '../shared/RulesIntroContext'

const MORE_LABEL = '\u66f4\u591a'
const LEADERBOARD_LABEL = '\u6392\u884c\u699c'
const LOGIN_LABEL = '\u767b\u5f55'
const WALLET_SESSION_LABEL = '\u94b1\u5305\u4f1a\u8bdd'
const RULES_LABEL = '\u73a9\u6cd5\u8bf4\u660e'
const ACCOUNT_ACTIVITY_LABEL = '\u67e5\u770b\u8d26\u6237\u6d3b\u52a8'
const DEFAULT_USER_TITLE = `Arena ${'\u7528\u6237'}`

const MORE_NAV_ITEMS = [
  { label: LEADERBOARD_LABEL, href: '/zh/leaderboard' },
]

const MORE_DROPDOWN_GAP = 4
const MORE_DROPDOWN_VIEWPORT_PADDING = 12

export function TopNavigation() {
  const { isAuthenticated, user, openAuthModal, openRulesIntro } = useRulesIntro()
  const { sessionMode, identity } = useAuthSession()
  const isOperator = identity != null &&
    hasAnySystemRole(identity.roles, [SystemRole.Operator, SystemRole.Admin, SystemRole.System])
  const desktopMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const mobileMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const moreChipRef = useRef<HTMLButtonElement | null>(null)
  const moreDropdownRef = useRef<HTMLDivElement | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})
  const portalTarget = typeof document !== 'undefined' ? document.body : null
  const {
    activeQuickMenuTrigger,
    isQuickMenuOpen,
    registerQuickMenuTrigger,
    toggleQuickMenu,
  } = useQuickMenu()

  useEffect(() => registerQuickMenuTrigger('desktop-nav', desktopMenuTriggerRef.current), [registerQuickMenuTrigger])
  useEffect(() => registerQuickMenuTrigger('mobile-nav', mobileMenuTriggerRef.current), [registerQuickMenuTrigger])

  useLayoutEffect(() => {
    if (!moreOpen) {
      setDropdownStyle({})
      return
    }

    let frameId = 0

    const updateDropdownPosition = () => {
      if (!moreChipRef.current || !moreDropdownRef.current) {
        return
      }

      const layout = computeAnchoredDropdownLayout({
        triggerRect: moreChipRef.current.getBoundingClientRect(),
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

  const isDesktopMenuOpen = isQuickMenuOpen && activeQuickMenuTrigger === 'desktop-nav'
  const isMobileMenuOpen = isQuickMenuOpen && activeQuickMenuTrigger === 'mobile-nav'
  const accountActivityAriaLabel = user?.displayName
    ? `\u67e5\u770b ${user.displayName} \u7684\u8d26\u6237\u6d3b\u52a8`
    : ACCOUNT_ACTIVITY_LABEL

  return (
    <header className="top-shell">
      <div className="topbar layout-container">
        <NavLink className="brand-button" to="/zh" aria-label="Arena 首页">
          <img src={ARENA_LOGO_SRC} alt="Arena" className="brand-logo" />
          <span className="brand-name">Arena</span>
        </NavLink>

        <nav className="category-nav" aria-label="主导航">
          {productNavItems.map((item) => (
            <NavLink
              key={item.label}
              className={({ isActive }) => `nav-chip ${isActive ? 'active' : ''}`}
              end={item.exact}
              to={item.href}
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button
            ref={moreChipRef}
            type="button"
            className={`nav-chip more-chip${moreOpen ? ' open' : ''}`}
            aria-label="更多页面"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((value) => !value)}
          >
            <span>{MORE_LABEL}</span>
            <ChevronRight size={15} />
          </button>
        </nav>

        <div className="account-actions">
          {isOperator && (
            <NavLink
              className={({ isActive }) => `nav-chip${isActive ? ' active' : ''}`}
              to="/zh/ops"
              aria-label="运营控制台"
            >
              运营
            </NavLink>
          )}
          {isAuthenticated ? (
            <NavLink
              className="account-button"
              to="/zh/activity"
              aria-label={accountActivityAriaLabel}
              title={user?.displayName ?? DEFAULT_USER_TITLE}
            >
              <span className="account-avatar" aria-hidden="true">{user?.avatarInitial ?? 'A'}</span>
              <span
                className={sessionMode === 'demo' ? 'account-status-dot demo' : 'account-status-dot'}
                aria-hidden="true"
              />
            </NavLink>
          ) : (
            <>
              <button className="login-button" onClick={() => openAuthModal('login')} type="button">{LOGIN_LABEL}</button>
              <button className="signup-button" onClick={() => openAuthModal('signup')} type="button">{WALLET_SESSION_LABEL}</button>
            </>
          )}
          <button
            ref={desktopMenuTriggerRef}
            className={isDesktopMenuOpen ? 'icon-button desktop-only active' : 'icon-button desktop-only'}
            onClick={() => toggleQuickMenu('desktop-nav', desktopMenuTriggerRef.current)}
            type="button"
            aria-label="Menu and language"
            aria-haspopup="dialog"
            aria-expanded={isDesktopMenuOpen}
            aria-controls={QUICK_MENU_POPOVER_ID}
          >
            <Menu size={19} />
            <Globe2 size={17} />
          </button>
          {isAuthenticated ? (
            <button
              ref={mobileMenuTriggerRef}
              className={isMobileMenuOpen ? 'icon-button mobile-only active' : 'icon-button mobile-only'}
              onClick={() => toggleQuickMenu('mobile-nav', mobileMenuTriggerRef.current)}
              type="button"
              aria-label="菜单与语言"
              aria-haspopup="dialog"
              aria-expanded={isMobileMenuOpen}
              aria-controls={QUICK_MENU_POPOVER_ID}
            >
              <Menu size={19} />
              <Globe2 size={17} />
            </button>
          ) : null}
          <button className="learn-link desktop-only" onClick={openRulesIntro} type="button" aria-label={RULES_LABEL}>
            <Info size={16} fill="currentColor" strokeWidth={2.2} />
            <span>{RULES_LABEL}</span>
          </button>
        </div>
      </div>
      {moreOpen && portalTarget ? createPortal(
        <>
          <div className="more-dropdown-overlay" onClick={() => setMoreOpen(false)} />
          <div ref={moreDropdownRef} className="more-dropdown" style={dropdownStyle} role="menu">
            {MORE_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                className={({ isActive }) => `more-dropdown-item${isActive ? ' active' : ''}`}
                to={item.href}
                role="menuitem"
                onClick={() => setMoreOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </>,
        portalTarget,
      ) : null}
    </header>
  )
}
