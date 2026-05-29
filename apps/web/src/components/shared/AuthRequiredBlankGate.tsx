import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useRulesIntro } from './RulesIntroContext'

type AuthRedirectLocationState = {
  authCloseRedirectTo?: string
}

export function AuthRequiredBlankGate({
  className,
  ariaLabel,
  closeRedirectTo,
}: {
  className: string
  ariaLabel: string
  closeRedirectTo?: string
}) {
  const location = useLocation()
  const { isAuthModalOpen, lastVisitedRoute, openAuthModal } = useRulesIntro()
  const hasRequestedOpenRef = useRef(false)
  const locationState = location.state as AuthRedirectLocationState | null
  const resolvedCloseRedirectTo = locationState?.authCloseRedirectTo ?? lastVisitedRoute ?? closeRedirectTo

  useEffect(() => {
    if (isAuthModalOpen || hasRequestedOpenRef.current) {
      return
    }

    hasRequestedOpenRef.current = true
    openAuthModal('login', resolvedCloseRedirectTo ? { closeRedirectTo: resolvedCloseRedirectTo } : undefined)
  }, [isAuthModalOpen, openAuthModal, resolvedCloseRedirectTo])

  return <section className={`${className} auth-required-blank-gate`} aria-label={ariaLabel} />
}
