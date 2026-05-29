import { Activity, Home, Menu } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuickMenu } from '../shared/QuickMenuContext'
import { QUICK_MENU_POPOVER_ID } from '../shared/quick-menu.config'

export function MobileTabBar() {
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const {
    activeQuickMenuTrigger,
    isQuickMenuOpen,
    registerQuickMenuTrigger,
    toggleQuickMenu,
  } = useQuickMenu()

  useEffect(() => registerQuickMenuTrigger('mobile-tab', menuTriggerRef.current), [registerQuickMenuTrigger])

  const isMenuOpen = isQuickMenuOpen && activeQuickMenuTrigger === 'mobile-tab'

  return (
    <nav className="mobile-tabbar" aria-label="Mobile navigation">
      <NavLink to="/zh" end>
        <Home size={20} />
        <span>首页</span>
      </NavLink>
      <NavLink to="/zh/breaking">
        <Activity size={20} />
        <span>突发</span>
      </NavLink>
      <button
        ref={menuTriggerRef}
        className={isMenuOpen ? 'active' : undefined}
        onClick={() => toggleQuickMenu('mobile-tab', menuTriggerRef.current)}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isMenuOpen}
        aria-controls={QUICK_MENU_POPOVER_ID}
      >
        <Menu size={20} />
        <span>菜单</span>
      </button>
    </nav>
  )
}
