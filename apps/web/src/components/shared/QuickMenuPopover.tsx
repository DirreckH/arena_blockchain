import {
  Check,
  ChevronLeft,
  ChevronRight,
  Languages,
  LogIn,
  LogOut,
  Wallet,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuickMenu } from './QuickMenuContext'
import {
  QUICK_MENU_ITEMS,
  QUICK_MENU_LANGUAGE_HREF,
  QUICK_MENU_POPOVER_ID,
} from './quick-menu.config'
import { useRulesIntro } from './RulesIntroContext'
import { useShellLanguage } from './ShellLanguageContext'

const DESKTOP_OFFSET = 8
const MOBILE_OFFSET = 10
const VIEWPORT_PADDING = 12
const MOBILE_VIEWPORT_PADDING = 10
const DESKTOP_MAX_WIDTH = 332
const MOBILE_MAX_WIDTH = 340
const SUBMENU_WIDTH = 220
const SUBMENU_OFFSET = 10

type PopoverLayout = {
  top: number
  left: number
  maxHeight: number
}

type Point = {
  top: number
  left: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function buildFallbackLayout(): PopoverLayout {
  return {
    top: VIEWPORT_PADDING,
    left: VIEWPORT_PADDING,
    maxHeight: Math.max(window.innerHeight - VIEWPORT_PADDING * 2, 240),
  }
}

function buildFallbackPoint(): Point {
  return {
    top: VIEWPORT_PADDING,
    left: VIEWPORT_PADDING,
  }
}

export function QuickMenuPopover() {
  const navigate = useNavigate()
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const languageTriggerRef = useRef<HTMLButtonElement | null>(null)
  const languageMenuRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<PopoverLayout | null>(null)
  const [languageMenuPosition, setLanguageMenuPosition] = useState<Point | null>(null)
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const {
    isQuickMenuOpen,
    activeQuickMenuElement,
    activeQuickMenuTrigger,
    closeQuickMenu,
  } = useQuickMenu()
  const {
    isAuthenticated,
    openAuthModal,
    logout,
  } = useRulesIntro()
  const {
    activeLanguage,
    availableLanguages,
    setActiveLanguage,
  } = useShellLanguage()

  const isMobileTabTrigger = activeQuickMenuTrigger === 'mobile-tab'
  const portalTarget = typeof document !== 'undefined' ? document.body : null

  const popoverStyle = useMemo<CSSProperties>(() => {
    if (!layout) {
      return { visibility: 'hidden' }
    }

    return {
      top: `${layout.top}px`,
      left: `${layout.left}px`,
      maxHeight: `${layout.maxHeight}px`,
    }
  }, [layout])

  const languageMenuStyle = useMemo<CSSProperties>(() => {
    if (!languageMenuPosition) {
      return { visibility: 'hidden' }
    }

    return {
      top: `${languageMenuPosition.top}px`,
      left: `${languageMenuPosition.left}px`,
    }
  }, [languageMenuPosition])

  useLayoutEffect(() => {
    if (!isQuickMenuOpen || !activeQuickMenuElement) {
      setLayout(null)
      return
    }

    const updateLayout = () => {
      if (!activeQuickMenuElement || !cardRef.current) {
        setLayout(buildFallbackLayout())
        return
      }

      const triggerRect = activeQuickMenuElement.getBoundingClientRect()
      const prefersMobileLayout = activeQuickMenuTrigger === 'mobile-tab'
      const viewportPadding = prefersMobileLayout ? MOBILE_VIEWPORT_PADDING : VIEWPORT_PADDING
      const triggerGap = prefersMobileLayout ? MOBILE_OFFSET : DESKTOP_OFFSET
      const cardWidth = Math.min(
        prefersMobileLayout ? MOBILE_MAX_WIDTH : DESKTOP_MAX_WIDTH,
        window.innerWidth - viewportPadding * 2,
      )
      const cardHeight = cardRef.current.offsetHeight || 360
      const left = clamp(
        triggerRect.right - cardWidth,
        viewportPadding,
        Math.max(window.innerWidth - cardWidth - viewportPadding, viewportPadding),
      )
      const top = prefersMobileLayout
        ? Math.max(triggerRect.top - cardHeight - triggerGap, viewportPadding)
        : Math.min(
          triggerRect.bottom + triggerGap,
          Math.max(window.innerHeight - cardHeight - viewportPadding, viewportPadding),
        )
      const availableHeight = prefersMobileLayout
        ? triggerRect.top - viewportPadding - triggerGap
        : window.innerHeight - top - viewportPadding

      setLayout({
        top,
        left,
        maxHeight: Math.max(availableHeight, 220),
      })
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)
    window.addEventListener('scroll', updateLayout, true)

    return () => {
      window.removeEventListener('resize', updateLayout)
      window.removeEventListener('scroll', updateLayout, true)
    }
  }, [activeQuickMenuElement, activeQuickMenuTrigger, isQuickMenuOpen])

  useLayoutEffect(() => {
    if (!isQuickMenuOpen || !isLanguageMenuOpen) {
      setLanguageMenuPosition(null)
      return
    }

    const updateLanguageMenuPosition = () => {
      if (!languageTriggerRef.current || !languageMenuRef.current || !cardRef.current) {
        setLanguageMenuPosition(buildFallbackPoint())
        return
      }

      const triggerRect = languageTriggerRef.current.getBoundingClientRect()
      const submenuHeight = languageMenuRef.current.offsetHeight || 232
      const submenuWidth = languageMenuRef.current.offsetWidth || SUBMENU_WIDTH
      const proposedLeft = triggerRect.right + SUBMENU_OFFSET
      const fitsRight = proposedLeft + submenuWidth <= window.innerWidth - VIEWPORT_PADDING
      const fallbackLeft = triggerRect.left - submenuWidth - SUBMENU_OFFSET

      setLanguageMenuPosition({
        top: clamp(
          triggerRect.top - 6,
          VIEWPORT_PADDING,
          Math.max(window.innerHeight - submenuHeight - VIEWPORT_PADDING, VIEWPORT_PADDING),
        ),
        left: fitsRight
          ? proposedLeft
          : clamp(
            fallbackLeft,
            VIEWPORT_PADDING,
            Math.max(window.innerWidth - submenuWidth - VIEWPORT_PADDING, VIEWPORT_PADDING),
          ),
      })
    }

    updateLanguageMenuPosition()
    window.addEventListener('resize', updateLanguageMenuPosition)
    window.addEventListener('scroll', updateLanguageMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateLanguageMenuPosition)
      window.removeEventListener('scroll', updateLanguageMenuPosition, true)
    }
  }, [isLanguageMenuOpen, isQuickMenuOpen, layout])

  useEffect(() => {
    if (!isQuickMenuOpen) {
      setIsLanguageMenuOpen(false)
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (isLanguageMenuOpen) {
        setIsLanguageMenuOpen(false)
        return
      }

      closeQuickMenu()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeQuickMenu, isLanguageMenuOpen, isQuickMenuOpen])

  if (!isQuickMenuOpen || !portalTarget) {
    return null
  }

  const handleCloseQuickMenu = () => {
    setIsLanguageMenuOpen(false)
    closeQuickMenu()
  }

  const handleNavigate = (href: string) => {
    handleCloseQuickMenu()
    navigate(href)
  }

  const handleOverlayPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) {
      handleCloseQuickMenu()
    }
  }

  const handleLogout = () => {
    handleCloseQuickMenu()
    logout()
  }

  const handleAuthAction = (mode: 'login' | 'signup') => {
    handleCloseQuickMenu()
    openAuthModal(mode)
  }

  const handleLanguageSelect = (code: (typeof availableLanguages)[number]['code']) => {
    setActiveLanguage(code)
    setIsLanguageMenuOpen(false)
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="quick-menu-overlay"
      data-testid="quick-menu-overlay"
      onPointerDown={handleOverlayPointerDown}
    >
      <div
        ref={cardRef}
        id={QUICK_MENU_POPOVER_ID}
        className={isMobileTabTrigger ? 'quick-menu-card quick-menu-card-mobile' : 'quick-menu-card'}
        role="dialog"
        aria-label="快捷菜单"
        style={popoverStyle}
      >
        {!isAuthenticated ? (
          <div className="quick-menu-auth-actions">
            <button
              className="quick-menu-auth-button"
              onClick={() => handleAuthAction('login')}
              type="button"
            >
              <LogIn size={16} />
              <span>登录</span>
            </button>
            <button
              className="quick-menu-auth-button primary"
              onClick={() => handleAuthAction('signup')}
              type="button"
            >
              <Wallet size={16} />
              <span>钱包会话</span>
            </button>
          </div>
        ) : null}

        <div className="quick-menu-list">
          <button
            ref={languageTriggerRef}
            className={`quick-menu-item${isLanguageMenuOpen ? ' active' : ''}`}
            aria-expanded={isLanguageMenuOpen}
            aria-haspopup="dialog"
            aria-controls="quick-menu-language-popover"
            onClick={() => setIsLanguageMenuOpen((value) => !value)}
            type="button"
          >
            <div className="quick-menu-item-copy">
              <strong>语言</strong>
              <span>{activeLanguage.label}</span>
            </div>
            <ChevronRight size={16} />
          </button>

          {QUICK_MENU_ITEMS.filter((item) => item.href !== QUICK_MENU_LANGUAGE_HREF).map((item) => (
            <button
              key={item.href}
              className="quick-menu-item"
              onClick={() => handleNavigate(item.href)}
              type="button"
            >
              <div className="quick-menu-item-copy">
                <strong>{item.label}</strong>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>

        {isAuthenticated ? (
          <div className="quick-menu-footer">
            <button className="quick-menu-logout" onClick={handleLogout} type="button">
              <LogOut size={16} />
              <span>退出登录</span>
            </button>
          </div>
        ) : null}
      </div>

      {isLanguageMenuOpen ? (
        <div
          ref={languageMenuRef}
          id="quick-menu-language-popover"
          className="quick-menu-submenu"
          role="dialog"
          aria-label="语言选择"
          style={languageMenuStyle}
        >
          <div className="quick-menu-submenu-head">
            <span className="quick-menu-submenu-kicker">Arena</span>
            <button
              className="quick-menu-submenu-back"
              onClick={() => setIsLanguageMenuOpen(false)}
              type="button"
            >
              <ChevronLeft size={16} />
              <span>语言</span>
            </button>
          </div>
          <div className="quick-menu-submenu-list">
            {availableLanguages.map((language) => {
              const isActive = language.code === activeLanguage.code

              return (
                <button
                  key={language.code}
                  className={`quick-menu-submenu-item${isActive ? ' selected' : ''}`}
                  onClick={() => handleLanguageSelect(language.code)}
                  type="button"
                >
                  <div className="quick-menu-submenu-item-copy">
                    <Languages size={16} />
                    <strong>{language.label}</strong>
                  </div>
                  {isActive ? <Check size={16} /> : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>,
    portalTarget,
  )
}
