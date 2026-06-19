import type { JwtIdentity } from '@arena/shared'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { arenaApi, ArenaApiError } from '../api/arena-api'
import { buildDemoIdentity, DEMO_SESSION_TOKEN, isDemoToken, isDemoWalletAddress } from '../demo/demo-auth'
import { useWalletEnvironment } from './wallet-environment'

const AUTH_TOKEN_STORAGE_KEY = 'arena.auth.token'
const AUTH_IDENTITY_STORAGE_KEY = 'arena.auth.identity'

type AuthSessionContextValue = {
  token: string | null
  identity: JwtIdentity | null
  sessionMode: 'real' | 'demo' | 'anonymous'
  isDemoSession: boolean
  isAuthenticated: boolean
  isLoading: boolean
  errorMessage: string | null
  configuredChainId: number
  loginWithWallet: (walletAddress: string) => Promise<void>
  logout: () => void
}

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(undefined)

function readStoredToken() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
}

function readStoredIdentity() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(AUTH_IDENTITY_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as JwtIdentity
  } catch {
    return null
  }
}

function persistSession(token: string, identity: JwtIdentity) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  window.localStorage.setItem(AUTH_IDENTITY_STORAGE_KEY, JSON.stringify(identity))
}

function clearStoredSession() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_IDENTITY_STORAGE_KEY)
}

function normalizeDemoIdentity(identity: JwtIdentity | null, chainId: number): JwtIdentity {
  const baseline = buildDemoIdentity(chainId)
  if (!identity) {
    return baseline
  }

  const normalizedIdentity = {
    ...identity,
    walletAddress: baseline.walletAddress,
    chainId: baseline.chainId,
    roles: baseline.roles,
  }

  return identity.walletAddress === normalizedIdentity.walletAddress
    && identity.chainId === normalizedIdentity.chainId
    && identity.roles.length === normalizedIdentity.roles.length
    && identity.roles.every((role, index) => role === normalizedIdentity.roles[index])
    ? identity
    : normalizedIdentity
}

async function signChallengeMessage(walletAddress: string, message: string): Promise<string> {
  const ethereumProvider = typeof window !== 'undefined'
    ? (window as Window & {
        ethereum?: {
          request: (input: { method: string; params?: unknown[] }) => Promise<unknown>
        }
      }).ethereum
    : undefined

  if (!ethereumProvider) {
    throw new Error('No injected wallet provider detected')
  }

  await ethereumProvider.request({
    method: 'eth_requestAccounts',
  })

  const signature = await ethereumProvider.request({
    method: 'personal_sign',
    params: [message, walletAddress],
  })

  if (typeof signature !== 'string') {
    throw new Error('Wallet signature failed')
  }

  return signature
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const { configuredChainId, refresh: refreshWalletEnvironment } = useWalletEnvironment()
  const [token, setToken] = useState<string | null>(() => readStoredToken())
  const [identity, setIdentity] = useState<JwtIdentity | null>(() => readStoredIdentity())
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const logout = useCallback(() => {
    clearStoredSession()
    setToken(null)
    setIdentity(null)
    setErrorMessage(null)
  }, [])

  useEffect(() => {
    if (!token) {
      return
    }

    if (isDemoToken(token)) {
      const nextIdentity = normalizeDemoIdentity(identity, configuredChainId)
      setIdentity(nextIdentity)
      persistSession(DEMO_SESSION_TOKEN, nextIdentity)
      return
    }

    let disposed = false

    void (async () => {
      try {
        const nextIdentity = await arenaApi.getAuthProfile(token)
        if (disposed) {
          return
        }

        setIdentity(nextIdentity)
        persistSession(token, nextIdentity)
      } catch {
        if (disposed) {
          return
        }

        logout()
      }
    })()

    return () => {
      disposed = true
    }
  }, [configuredChainId, identity, logout, token])

  const loginWithWallet = useCallback(async (walletAddress: string) => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const chainId = configuredChainId

      if (isDemoWalletAddress(walletAddress)) {
        const demoIdentity = buildDemoIdentity(chainId)
        persistSession(DEMO_SESSION_TOKEN, demoIdentity)
        setToken(DEMO_SESSION_TOKEN)
        setIdentity(demoIdentity)
        return
      }

      const challenge = await arenaApi.createAuthChallenge(walletAddress, chainId)
      const signature = await signChallengeMessage(walletAddress, challenge.message)
      const verified = await arenaApi.verifyAuthSignature(walletAddress, chainId, signature)

      persistSession(verified.accessToken, verified.identity)
      setToken(verified.accessToken)
      setIdentity(verified.identity)
      await refreshWalletEnvironment()
    } catch (error) {
      if (error instanceof ArenaApiError) {
        setErrorMessage(error.payload?.message ?? error.message)
      } else if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage('Authentication failed')
      }

      throw error
    } finally {
      setIsLoading(false)
    }
  }, [configuredChainId, refreshWalletEnvironment])

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      token,
      identity,
      sessionMode: identity && token ? (isDemoToken(token) ? 'demo' : 'real') : 'anonymous',
      isDemoSession: Boolean(identity && token && isDemoToken(token)),
      isAuthenticated: Boolean(token && identity),
      isLoading,
      errorMessage,
      configuredChainId,
      loginWithWallet,
      logout,
    }),
    [configuredChainId, errorMessage, identity, isLoading, loginWithWallet, logout, token],
  )

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext)

  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider')
  }

  return context
}
