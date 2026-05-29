import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { QUICK_MENU_ALIAS_PATH } from './quick-menu.config'

export type QuickMenuTriggerId = 'desktop-nav' | 'mobile-nav' | 'mobile-tab'

type QuickMenuContextValue = {
  isQuickMenuOpen: boolean
  activeQuickMenuTrigger: QuickMenuTriggerId | null
  activeQuickMenuElement: HTMLElement | null
  toggleQuickMenu: (triggerId: QuickMenuTriggerId, triggerElement: HTMLElement | null) => void
  registerQuickMenuTrigger: (triggerId: QuickMenuTriggerId, triggerElement: HTMLElement | null) => () => void
  openQuickMenuFromRoute: () => void
  closeQuickMenu: () => void
}

const MOBILE_MEDIA_QUERY = '(max-width: 900px)'

const QuickMenuContext = createContext<QuickMenuContextValue | undefined>(undefined)

function isElementVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element)

  if (style.display === 'none' || style.visibility === 'hidden') {
    return false
  }

  return element.getClientRects().length > 0 || element.isConnected
}

export function QuickMenuProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false)
  const [activeQuickMenuTrigger, setActiveQuickMenuTrigger] = useState<QuickMenuTriggerId | null>(null)
  const [activeQuickMenuElement, setActiveQuickMenuElement] = useState<HTMLElement | null>(null)
  const [pendingRouteOpenVersion, setPendingRouteOpenVersion] = useState(0)
  const triggerElementsRef = useRef<Partial<Record<QuickMenuTriggerId, HTMLElement>>>({})
  const activeQuickMenuElementRef = useRef<HTMLElement | null>(null)
  const shouldOpenFromRouteRef = useRef(false)
  const previousPathnameRef = useRef(location.pathname)

  const closeQuickMenu = useCallback(() => {
    activeQuickMenuElementRef.current = null
    setIsQuickMenuOpen(false)
    setActiveQuickMenuTrigger(null)
    setActiveQuickMenuElement(null)
  }, [])

  const openQuickMenu = useCallback((triggerId: QuickMenuTriggerId, triggerElement: HTMLElement) => {
    shouldOpenFromRouteRef.current = false
    activeQuickMenuElementRef.current = triggerElement
    setActiveQuickMenuTrigger(triggerId)
    setActiveQuickMenuElement(triggerElement)
    setIsQuickMenuOpen(true)
  }, [])

  const pickVisibleTrigger = useCallback(() => {
    const desktopTrigger = triggerElementsRef.current['desktop-nav']
    const mobileTabTrigger = triggerElementsRef.current['mobile-tab']
    const mobileNavTrigger = triggerElementsRef.current['mobile-nav']
    const prefersMobile = typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
      : window.innerWidth <= 900

    if (prefersMobile) {
      if (mobileTabTrigger && isElementVisible(mobileTabTrigger)) {
        return { triggerId: 'mobile-tab' as const, triggerElement: mobileTabTrigger }
      }

      if (mobileNavTrigger && isElementVisible(mobileNavTrigger)) {
        return { triggerId: 'mobile-nav' as const, triggerElement: mobileNavTrigger }
      }
    }

    if (desktopTrigger && isElementVisible(desktopTrigger)) {
      return { triggerId: 'desktop-nav' as const, triggerElement: desktopTrigger }
    }

    if (mobileTabTrigger && isElementVisible(mobileTabTrigger)) {
      return { triggerId: 'mobile-tab' as const, triggerElement: mobileTabTrigger }
    }

    if (mobileNavTrigger && isElementVisible(mobileNavTrigger)) {
      return { triggerId: 'mobile-nav' as const, triggerElement: mobileNavTrigger }
    }

    return null
  }, [])

  const tryOpenPendingQuickMenu = useCallback(() => {
    if (!shouldOpenFromRouteRef.current) {
      return
    }

    if (location.pathname === QUICK_MENU_ALIAS_PATH) {
      return
    }

    const nextTrigger = pickVisibleTrigger()

    if (!nextTrigger) {
      return
    }

    openQuickMenu(nextTrigger.triggerId, nextTrigger.triggerElement)
  }, [location.pathname, openQuickMenu, pickVisibleTrigger])

  const toggleQuickMenu = useCallback(
    (triggerId: QuickMenuTriggerId, triggerElement: HTMLElement | null) => {
      if (!triggerElement) {
        return
      }

      const isSameTrigger = isQuickMenuOpen
        && activeQuickMenuTrigger === triggerId
        && activeQuickMenuElement === triggerElement

      if (isSameTrigger) {
        closeQuickMenu()
        return
      }

      openQuickMenu(triggerId, triggerElement)
    },
    [activeQuickMenuElement, activeQuickMenuTrigger, closeQuickMenu, isQuickMenuOpen, openQuickMenu],
  )

  const registerQuickMenuTrigger = useCallback(
    (triggerId: QuickMenuTriggerId, triggerElement: HTMLElement | null) => {
      if (triggerElement) {
        triggerElementsRef.current[triggerId] = triggerElement
        tryOpenPendingQuickMenu()
      }

      return () => {
        if (triggerElementsRef.current[triggerId] === triggerElement) {
          delete triggerElementsRef.current[triggerId]
        }

        if (activeQuickMenuElementRef.current === triggerElement) {
          activeQuickMenuElementRef.current = null
          setActiveQuickMenuElement(null)
          setActiveQuickMenuTrigger(null)
          setIsQuickMenuOpen(false)
        }
      }
    },
    [tryOpenPendingQuickMenu],
  )

  const openQuickMenuFromRoute = useCallback(() => {
    shouldOpenFromRouteRef.current = true
    setPendingRouteOpenVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    if (location.state && typeof location.state === 'object' && 'openQuickMenuFromAlias' in location.state) {
      shouldOpenFromRouteRef.current = true
      setPendingRouteOpenVersion((value) => value + 1)
    }
  }, [location.key, location.state])

  useEffect(() => {
    const pathnameChanged = previousPathnameRef.current !== location.pathname

    if (pathnameChanged) {
      activeQuickMenuElementRef.current = null
      setIsQuickMenuOpen(false)
      setActiveQuickMenuTrigger(null)
      setActiveQuickMenuElement(null)

      if (shouldOpenFromRouteRef.current) {
        queueMicrotask(() => {
          tryOpenPendingQuickMenu()
        })
      }
    }

    previousPathnameRef.current = location.pathname
  }, [location.pathname, tryOpenPendingQuickMenu])

  useEffect(() => {
    if (!shouldOpenFromRouteRef.current) {
      return undefined
    }

    let cancelled = false
    let timerId = 0
    let attempts = 0

    const retryOpen = () => {
      if (cancelled) {
        return
      }

      tryOpenPendingQuickMenu()

      if (!shouldOpenFromRouteRef.current || attempts >= 24) {
        return
      }

      attempts += 1
      timerId = window.setTimeout(retryOpen, 16)
    }

    const handleResize = () => {
      retryOpen()
    }

    retryOpen()
    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      window.clearTimeout(timerId)
      window.removeEventListener('resize', handleResize)
    }
  }, [location.pathname, pendingRouteOpenVersion, tryOpenPendingQuickMenu])

  const value = useMemo<QuickMenuContextValue>(
    () => ({
      isQuickMenuOpen,
      activeQuickMenuTrigger,
      activeQuickMenuElement,
      toggleQuickMenu,
      registerQuickMenuTrigger,
      openQuickMenuFromRoute,
      closeQuickMenu,
    }),
    [
      activeQuickMenuElement,
      activeQuickMenuTrigger,
      closeQuickMenu,
      isQuickMenuOpen,
      openQuickMenuFromRoute,
      registerQuickMenuTrigger,
      toggleQuickMenu,
    ],
  )

  return (
    <QuickMenuContext.Provider value={value}>
      {children}
    </QuickMenuContext.Provider>
  )
}

export function useQuickMenu() {
  const context = useContext(QuickMenuContext)

  if (!context) {
    throw new Error('useQuickMenu must be used within QuickMenuProvider')
  }

  return context
}
