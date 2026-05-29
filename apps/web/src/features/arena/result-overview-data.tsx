import type {
  RespondentResultOverviewViewModel,
} from '@arena/shared'
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { useArenaAccountData } from './account-data'

type ResultOverviewDataContextValue = {
  overview: RespondentResultOverviewViewModel | null
  sourceMode: 'live' | 'demo' | 'unavailable'
  isLoading: boolean
  errorMessage: string | null
  refresh: () => Promise<void>
}

const ResultOverviewDataContext = createContext<ResultOverviewDataContextValue | undefined>(undefined)

export function ResultOverviewDataProvider({ children }: { children: ReactNode }) {
  const { overview: accountOverview, sourceMode, isLoading, errorMessage, refresh } = useArenaAccountData()
  const overview = accountOverview?.resultOverview ?? null

  const value = useMemo<ResultOverviewDataContextValue>(() => ({
    overview,
    sourceMode,
    isLoading,
    errorMessage,
    refresh,
  }), [errorMessage, isLoading, overview, refresh, sourceMode])

  return (
    <ResultOverviewDataContext.Provider value={value}>
      {children}
    </ResultOverviewDataContext.Provider>
  )
}

export function useResultOverviewData() {
  const context = useContext(ResultOverviewDataContext)

  if (!context) {
    throw new Error('useResultOverviewData must be used within ResultOverviewDataProvider')
  }

  return context
}
