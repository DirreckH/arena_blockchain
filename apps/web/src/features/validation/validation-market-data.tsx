import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ValidationBetExecutionViewModel, ValidationMarketViewModel } from '@arena/shared'
import { arenaApi } from '../api/arena-api'
import { useAuthSession } from '../auth/auth-session'
import {
  toPublicValidationMarket,
  toPublicValidationMarketDetail,
} from './validation-market-adapter'
import type {
  PublicValidationMarketCard,
  PublicValidationMarketDetail,
} from './validation-market.types'

type ValidationMarketDataContextValue = {
  markets: PublicValidationMarketCard[]
  marketDetails: Map<string, PublicValidationMarketDetail>
  rawMarkets: ValidationMarketViewModel[]
  sourceMode: 'live' | 'demo'
  isLoading: boolean
  errorMessage: string | null
  latestBetExecution: ValidationBetExecutionViewModel | null
  refresh: () => Promise<void>
  placeBet: (input: {
    marketId: string
    propositionId: string
    selectedOption: 0 | 1
    stakeAmount: string
  }) => Promise<void>
}

const ValidationMarketDataContext = createContext<ValidationMarketDataContextValue | undefined>(
  undefined,
)

export function ValidationMarketDataProvider({ children }: { children: ReactNode }) {
  const { token, isAuthenticated, configuredChainId } = useAuthSession()
  const [rawMarkets, setRawMarkets] = useState<ValidationMarketViewModel[]>([])
  const [sourceMode, setSourceMode] = useState<'live' | 'demo'>('live')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [latestBetExecution, setLatestBetExecution] = useState<ValidationBetExecutionViewModel | null>(null)

  const refresh = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const nextMarkets = isAuthenticated && token
        ? await arenaApi.getValidationMarkets(token)
        : await arenaApi.getPublicMarketsFeed()

      if (Array.isArray(nextMarkets)) {
        setRawMarkets(nextMarkets)
        setSourceMode('live')
      } else {
        setRawMarkets(nextMarkets.data)
        setSourceMode(nextMarkets.sourceMode)
      }
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage('Failed to load markets')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [isAuthenticated, token])

  const placeBet = async (input: {
    marketId: string
    propositionId: string
    selectedOption: 0 | 1
    stakeAmount: string
  }) => {
    if (!isAuthenticated || !token) {
      throw new Error('Authentication required')
    }

    const placedAt = new Date().toISOString()
    const result = await arenaApi.placeValidationBet(
      input.marketId,
      {
        propositionId: input.propositionId,
        chainId: configuredChainId,
        selectedOption: input.selectedOption,
        stakeAmount: input.stakeAmount,
        placedAt,
      },
      token,
    )

    setRawMarkets((currentMarkets) => {
      const nextMarkets = currentMarkets.filter((market) => market.marketId !== result.marketView.marketId)
      return [...nextMarkets, result.marketView]
    })
    setLatestBetExecution(result.execution)
  }

  const value = useMemo<ValidationMarketDataContextValue>(() => {
    const markets = rawMarkets.map(toPublicValidationMarket)
    const marketDetails = new Map<string, PublicValidationMarketDetail>(
      rawMarkets.map((market) => [market.marketId, toPublicValidationMarketDetail(market)]),
    )

    return {
      markets,
      marketDetails,
      rawMarkets,
      isLoading,
      sourceMode,
      errorMessage,
      latestBetExecution,
      refresh,
      placeBet,
    }
  }, [errorMessage, isLoading, latestBetExecution, rawMarkets, sourceMode])

  return (
    <ValidationMarketDataContext.Provider value={value}>
      {children}
    </ValidationMarketDataContext.Provider>
  )
}

export function useValidationMarketData() {
  const context = useContext(ValidationMarketDataContext)

  if (!context) {
    throw new Error('useValidationMarketData must be used within ValidationMarketDataProvider')
  }

  return context
}
