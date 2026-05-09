import { ChevronRight, Globe2, Info, Menu } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuthSession } from '../../features/auth/auth-session'
import { ARENA_LOGO_SRC, productNavItems } from '../../mocks/arena-market.mock'
import { useRulesIntro } from '../shared/RulesIntroContext'

export function TopNavigation() {
  const { isAuthenticated, mockUser, openAuthModal, openRulesIntro } = useRulesIntro()
  const { sessionMode } = useAuthSession()

  return (
    <header className="top-shell">
      <div className="topbar layout-container">
        <NavLink className="brand-button" to="/zh" aria-label="Arena home">
          <img src={ARENA_LOGO_SRC} alt="Arena" className="brand-logo" />
          <span className="brand-name">Arena</span>
        </NavLink>

        <nav className="category-nav" aria-label="Primary navigation">
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
          <NavLink className="nav-chip more-chip" to="/zh/pages" aria-label="More pages">
            <span>More</span>
            <ChevronRight size={15} />
          </NavLink>
        </nav>

        <div className="account-actions">
          {isAuthenticated ? (
            <NavLink
              className="account-button"
              to="/zh/activity"
              aria-label={`Open account activity for ${mockUser?.displayName ?? 'Arena user'}`}
              title={mockUser?.displayName ?? 'Arena user'}
            >
              <span className="account-avatar" aria-hidden="true">{mockUser?.avatarInitial ?? 'A'}</span>
              <span className={sessionMode === 'demo' ? 'account-status-dot demo' : 'account-status-dot'} aria-hidden="true" />
            </NavLink>
          ) : (
            <>
              <button className="login-button" onClick={() => openAuthModal('login')} type="button">Sign in</button>
              <button className="signup-button" onClick={() => openAuthModal('signup')} type="button">Wallet session</button>
            </>
          )}
          <NavLink className="icon-button desktop-only" to="/zh/menu" aria-label="Menu and language">
            <Menu size={19} />
            <Globe2 size={17} />
          </NavLink>
          {isAuthenticated ? (
            <NavLink className="icon-button mobile-only" to="/zh/menu" aria-label="Menu and language">
              <Menu size={19} />
              <Globe2 size={17} />
            </NavLink>
          ) : null}
          <button className="learn-link desktop-only" onClick={openRulesIntro} type="button" aria-label="Rules overview">
            <Info size={16} fill="currentColor" strokeWidth={2.2} />
            <span>Rules overview</span>
          </button>
        </div>
      </div>
    </header>
  )
}
