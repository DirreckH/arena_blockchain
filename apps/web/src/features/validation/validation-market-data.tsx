import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ethers } from 'ethers'
import type {
  PrepareValidationBetResult,
  ValidationBetExecutionViewModel,
  ValidationMarketViewModel,
} from '@arena/shared'
import { arenaApi } from '../api/arena-api'
import { useAuthSession } from '../auth/auth-session'
import { isDemoToken } from '../demo/demo-auth'
import {
  assertMatchingWalletSession,
  confirmValidationBetWithRetry,
} from './validation-bet-execution-runtime'
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
  sourceMode: 'live' | 'demo' | 'mixed'
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
  const { token, isAuthenticated, configuredChainId, identity } = useAuthSession()
  const [rawMarkets, setRawMarkets] = useState<ValidationMarketViewModel[]>([])
  const [sourceMode, setSourceMode] = useState<'live' | 'demo' | 'mixed'>('live')
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
    if (isDemoToken(token)) {
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
      return
    }

    const prepared = await arenaApi.prepareValidationBet(
      input.marketId,
      {
        propositionId: input.propositionId,
        selectedOption: input.selectedOption,
        stakeAmount: input.stakeAmount,
        placedAt,
      },
      token,
    )

    setLatestBetExecution({
      ...prepared.execution,
      stage: 'awaiting_signature',
      statusLabel: 'Awaiting wallet signature',
      detail: 'Approve the transaction in your wallet to submit the on-chain validation bet.',
    })

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

    const walletAddress = identity?.walletAddress
    const connectedWalletAddress = await ethereumProvider.request({
      method: 'eth_accounts',
    })
    const browserWalletAddress = Array.isArray(connectedWalletAddress)
      ? connectedWalletAddress.find((entry): entry is string => typeof entry === 'string') ?? null
      : null

    assertMatchingWalletSession(walletAddress, browserWalletAddress)

    const valueHex = ethers.BigNumber.from(prepared.transaction.value).toHexString()
    const chainIdHex = `0x${prepared.transaction.chainId.toString(16)}`

    try {
      await ethereumProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      })
    } catch {
      throw new Error(`Switch wallet network to chain ${prepared.transaction.chainId} and retry`)
    }

    const txHash = await ethereumProvider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: walletAddress,
        to: prepared.transaction.to,
        data: prepared.transaction.data,
        value: valueHex,
      }],
    })

    if (typeof txHash !== 'string') {
      throw new Error('Wallet did not return a transaction hash')
    }

    setLatestBetExecution({
      ...prepared.execution,
      stage: 'transaction_submitted',
      txHash,
      statusLabel: 'Transaction submitted',
      detail: 'Arena is waiting for the chain receipt, then it will record the matching local position.',
    })

    const result = await confirmValidationBetWithRetry(
      () => arenaApi.confirmValidationBet(
        input.marketId,
        {
          propositionId: input.propositionId,
          selectedOption: input.selectedOption,
          stakeAmount: input.stakeAmount,
          placedAt,
          txHash,
        },
        token,
      ),
      {
        maxAttempts: 4,
        delayMs: 1200,
      },
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
