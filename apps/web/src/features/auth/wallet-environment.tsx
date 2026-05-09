import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type EthereumProvider = {
  request: (input: { method: string; params?: unknown[] }) => Promise<unknown>
}

type WalletAvailability = 'unknown' | 'available' | 'missing'
type WalletNetworkStatus = 'unknown' | 'supported' | 'unsupported'

type WalletEnvironmentContextValue = {
  configuredChainId: number
  availability: WalletAvailability
  networkStatus: WalletNetworkStatus
  connectedWalletAddress: string | null
  currentChainId: number | null
  refresh: () => Promise<void>
}

const WalletEnvironmentContext = createContext<WalletEnvironmentContextValue | undefined>(undefined)

function getConfiguredChainId() {
  const raw = import.meta.env?.VITE_CHAIN_ID
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 31337
}

function getEthereumProvider(): EthereumProvider | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as Window & { ethereum?: EthereumProvider }).ethereum
}

function normalizeChainId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (!trimmed) {
      return null
    }

    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
      const parsedHex = Number.parseInt(trimmed, 16)
      return Number.isFinite(parsedHex) ? parsedHex : null
    }

    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function WalletEnvironmentProvider({ children }: { children: ReactNode }) {
  const configuredChainId = getConfiguredChainId()
  const [availability, setAvailability] = useState<WalletAvailability>('unknown')
  const [networkStatus, setNetworkStatus] = useState<WalletNetworkStatus>('unknown')
  const [connectedWalletAddress, setConnectedWalletAddress] = useState<string | null>(null)
  const [currentChainId, setCurrentChainId] = useState<number | null>(null)

  const refresh = async () => {
    const provider = getEthereumProvider()

    if (!provider) {
      setAvailability('missing')
      setNetworkStatus('unknown')
      setConnectedWalletAddress(null)
      setCurrentChainId(null)
      return
    }

    setAvailability('available')

    try {
      const [chainIdResponse, accountsResponse] = await Promise.all([
        provider.request({ method: 'eth_chainId' }),
        provider.request({ method: 'eth_accounts' }),
      ])

      const nextChainId = normalizeChainId(chainIdResponse)
      const nextAccounts = Array.isArray(accountsResponse)
        ? accountsResponse.filter((entry): entry is string => typeof entry === 'string')
        : []

      setCurrentChainId(nextChainId)
      setNetworkStatus(
        nextChainId === null
          ? 'unknown'
          : nextChainId === configuredChainId
            ? 'supported'
            : 'unsupported',
      )
      setConnectedWalletAddress(nextAccounts[0] ?? null)
    } catch {
      setCurrentChainId(null)
      setNetworkStatus('unknown')
      setConnectedWalletAddress(null)
    }
  }

  useEffect(() => {
    void refresh()

    const provider = getEthereumProvider()
    if (!provider || typeof window === 'undefined') {
      return undefined
    }

    const ethereumWithEvents = provider as EthereumProvider & {
      on?: (eventName: string, listener: (...args: unknown[]) => void) => void
      removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => void
    }

    const handleAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts)) {
        setConnectedWalletAddress(null)
        return
      }

      const nextAccount = accounts.find((entry): entry is string => typeof entry === 'string') ?? null
      setConnectedWalletAddress(nextAccount)
    }

    const handleChainChanged = (chainId: unknown) => {
      const nextChainId = normalizeChainId(chainId)
      setCurrentChainId(nextChainId)
      setNetworkStatus(
        nextChainId === null
          ? 'unknown'
          : nextChainId === configuredChainId
            ? 'supported'
            : 'unsupported',
      )
    }

    ethereumWithEvents.on?.('accountsChanged', handleAccountsChanged)
    ethereumWithEvents.on?.('chainChanged', handleChainChanged)

    return () => {
      ethereumWithEvents.removeListener?.('accountsChanged', handleAccountsChanged)
      ethereumWithEvents.removeListener?.('chainChanged', handleChainChanged)
    }
  }, [configuredChainId])

  const value = useMemo<WalletEnvironmentContextValue>(() => ({
    configuredChainId,
    availability,
    networkStatus,
    connectedWalletAddress,
    currentChainId,
    refresh,
  }), [availability, configuredChainId, connectedWalletAddress, currentChainId, networkStatus])

  return (
    <WalletEnvironmentContext.Provider value={value}>
      {children}
    </WalletEnvironmentContext.Provider>
  )
}

export function useWalletEnvironment() {
  const context = useContext(WalletEnvironmentContext)

  if (!context) {
    throw new Error('useWalletEnvironment must be used within WalletEnvironmentProvider')
  }

  return context
}
