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
  isLoading: boolean
  errorMessage: string | null
  refresh: () => Promise<void>
}

const ResultOverviewDataContext = createContext<ResultOverviewDataContextValue | undefined>(undefined)

export function ResultOverviewDataProvider({ children }: { children: ReactNode }) {
  const { overview: accountOverview, isLoading, errorMessage, refresh } = useArenaAccountData()
  const overview = accountOverview?.resultOverview ?? null

  const value = useMemo<ResultOverviewDataContextValue>(() => ({
    overview,
    isLoading,
    errorMessage,
    refresh,
  }), [errorMessage, isLoading, overview, refresh])

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
