import type { RespondentWatchlistViewModel } from '@arena/shared'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { arenaApi } from '../api/arena-api'
import { useAuthSession } from '../auth/auth-session'

type WatchlistDataContextValue = {
  watchlist: RespondentWatchlistViewModel | null
  isLoading: boolean
  isSaving: boolean
  errorMessage: string | null
  refresh: () => Promise<void>
  saveMarket: (marketId: string) => Promise<void>
  removeMarket: (marketId: string) => Promise<void>
  isSaved: (marketId: string) => boolean
}

const WatchlistDataContext = createContext<WatchlistDataContextValue | undefined>(undefined)

export function WatchlistDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, token } = useAuthSession()
  const [watchlist, setWatchlist] = useState<RespondentWatchlistViewModel | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setWatchlist(null)
      setErrorMessage(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const nextWatchlist = await arenaApi.getWatchlist(token)
      setWatchlist(nextWatchlist)
    } catch (error) {
      setWatchlist(null)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load watchlist')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveMarket = useCallback(async (marketId: string) => {
    if (!token) {
      throw new Error('Authentication required')
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      await arenaApi.saveWatchlistItem(marketId, token)
      const nextWatchlist = await arenaApi.getWatchlist(token)
      setWatchlist(nextWatchlist)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save watchlist item')
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [token])

  const removeMarket = useCallback(async (marketId: string) => {
    if (!token) {
      throw new Error('Authentication required')
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      await arenaApi.removeWatchlistItem(marketId, token)
      const nextWatchlist = await arenaApi.getWatchlist(token)
      setWatchlist(nextWatchlist)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to remove watchlist item')
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [token])

  const value = useMemo<WatchlistDataContextValue>(() => ({
    watchlist,
    isLoading,
    isSaving,
    errorMessage,
    refresh,
    saveMarket,
    removeMarket,
    isSaved: (marketId: string) =>
      Boolean(watchlist?.items.some((item) => item.marketId === marketId)),
  }), [errorMessage, isLoading, isSaving, refresh, removeMarket, saveMarket, watchlist])

  return (
    <WatchlistDataContext.Provider value={value}>
      {children}
    </WatchlistDataContext.Provider>
  )
}

export function useWatchlistData() {
  const context = useContext(WatchlistDataContext)

  if (!context) {
    throw new Error('useWatchlistData must be used within WatchlistDataProvider')
  }

  return context
}
