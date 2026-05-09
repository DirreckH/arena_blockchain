import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthSession } from '../../features/auth/auth-session'
import { isDemoWalletAddress } from '../../features/demo/demo-auth'
import { AuthModal } from './AuthModal'
import { RULES_INTRO_STEPS } from './RulesIntroContent'
import { RulesIntroModal } from './RulesIntroModal'

export type SessionUser = {
  displayName: string
  avatarInitial: string
  email: string
  walletAddress: string
}

type RulesIntroContextValue = {
  isRulesIntroOpen: boolean
  openRulesIntro: () => void
  closeRulesIntro: () => void
  isAuthModalOpen: boolean
  authMode: 'login' | 'signup'
  isAuthenticated: boolean
  user: SessionUser | null
  mockUser: SessionUser | null
  openAuthModal: (mode: 'login' | 'signup') => void
  closeAuthModal: () => void
  switchAuthMode: (mode: 'login' | 'signup') => void
  logout: () => void
}

const RulesIntroContext = createContext<RulesIntroContextValue | undefined>(undefined)

function formatWalletIdentity(walletAddress: string) {
  const normalized = walletAddress.trim()

  if (normalized.length <= 10) {
    return normalized
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`
}

function buildSessionUser(walletAddress: string): SessionUser {
  return {
    displayName: formatWalletIdentity(walletAddress),
    avatarInitial: walletAddress.slice(2, 3).toUpperCase() || 'A',
    email: `${walletAddress.toLowerCase()}@wallet.arena.local`,
    walletAddress,
  }
}

export function RulesIntroProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { identity, isAuthenticated, loginWithWallet, logout: logoutSession } = useAuthSession()
  const [isRulesIntroOpen, setIsRulesIntroOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [postAuthRedirectTo, setPostAuthRedirectTo] = useState('/zh/activity')

  const openRulesIntro = useCallback(() => {
    setStepIndex(0)
    setIsRulesIntroOpen(true)
  }, [])

  const closeRulesIntro = useCallback(() => {
    setIsRulesIntroOpen(false)
    setStepIndex(0)
  }, [])

  const openAuthModal = useCallback((mode: 'login' | 'signup') => {
    setAuthMode(mode)
    setPostAuthRedirectTo(`${location.pathname}${location.search}${location.hash}`)
    setIsAuthModalOpen(true)
  }, [location.hash, location.pathname, location.search])

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false)
  }, [])

  const switchAuthMode = useCallback((mode: 'login' | 'signup') => {
    setAuthMode(mode)
  }, [])

  const logout = useCallback(() => {
    logoutSession()
    setIsAuthModalOpen(false)
  }, [logoutSession])

  const handleAuthenticate = useCallback(
    async (walletAddress: string, mode: 'login' | 'signup') => {
      setAuthMode(mode)
      await loginWithWallet(walletAddress)
      setIsAuthModalOpen(false)
      navigate(isDemoWalletAddress(walletAddress) ? '/zh/activity' : (postAuthRedirectTo || '/zh/activity'))
    },
    [loginWithWallet, navigate, postAuthRedirectTo],
  )

  const handlePrimaryAction = useCallback(
    (currentStepIndex: number) => {
      if (currentStepIndex >= RULES_INTRO_STEPS.length - 1) {
        closeRulesIntro()
        return
      }

      setStepIndex(currentStepIndex + 1)
    },
    [closeRulesIntro],
  )

  useEffect(() => {
    if (!isRulesIntroOpen && !isAuthModalOpen) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (isAuthModalOpen) {
        closeAuthModal()
        return
      }

      closeRulesIntro()
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeAuthModal, closeRulesIntro, isAuthModalOpen, isRulesIntroOpen])

  const value = useMemo(
    () => ({
      isRulesIntroOpen,
      openRulesIntro,
      closeRulesIntro,
      isAuthModalOpen,
      authMode,
      isAuthenticated,
      user: identity ? buildSessionUser(identity.walletAddress) : null,
      mockUser: identity ? buildSessionUser(identity.walletAddress) : null,
      openAuthModal,
      closeAuthModal,
      switchAuthMode,
      logout,
    }),
    [
      authMode,
      closeAuthModal,
      closeRulesIntro,
      identity,
      isAuthModalOpen,
      isAuthenticated,
      isRulesIntroOpen,
      logout,
      openAuthModal,
      openRulesIntro,
      switchAuthMode,
    ],
  )

  return (
    <RulesIntroContext.Provider value={value}>
      {children}
      <RulesIntroModal
        isOpen={isRulesIntroOpen}
        onClose={closeRulesIntro}
        onPrimaryAction={handlePrimaryAction}
        onSelectStep={setStepIndex}
        stepIndex={stepIndex}
      />
      <AuthModal
        isOpen={isAuthModalOpen}
        mode={authMode}
        onAuthenticate={handleAuthenticate}
        onClose={closeAuthModal}
        onSwitchMode={switchAuthMode}
      />
    </RulesIntroContext.Provider>
  )
}

export function useRulesIntro() {
  const context = useContext(RulesIntroContext)

  if (!context) {
    throw new Error('useRulesIntro must be used within RulesIntroProvider')
  }

  return context
}
