import type {
  RespondentAccountExportArtifactViewModel,
  RespondentAccountExportListViewModel,
  RespondentAccountOverviewViewModel,
  RespondentAccountPreferencesViewModel,
  RespondentReputationSummaryViewModel,
  RespondentRewardLedgerViewModel,
  RespondentTagSummaryViewModel,
  UpdateRespondentAccountPreferencesInput,
} from '@arena/shared'
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
import { isDemoToken } from '../demo/demo-auth'

type ArenaAccountSourceMode = 'live' | 'demo' | 'unavailable'

type RewardSummary = {
  currentCount: number
  pendingAmount: string
  finalizedAmount: string
}

type ArenaAccountDataContextValue = {
  overview: RespondentAccountOverviewViewModel | null
  rewards: RespondentRewardLedgerViewModel[]
  reputation: RespondentReputationSummaryViewModel | null
  tags: RespondentTagSummaryViewModel | null
  rewardSummary: RewardSummary
  preferences: RespondentAccountPreferencesViewModel | null
  exports: RespondentAccountExportListViewModel | null
  latestExport: RespondentAccountExportArtifactViewModel | null
  preferencesErrorMessage: string | null
  exportsErrorMessage: string | null
  isPreferencesLoading: boolean
  isPreferencesSaving: boolean
  isExportsLoading: boolean
  isExporting: boolean
  sourceMode: ArenaAccountSourceMode
  isLoading: boolean
  errorMessage: string | null
  refresh: () => Promise<void>
  updatePreferences: (
    input: UpdateRespondentAccountPreferencesInput,
  ) => Promise<RespondentAccountPreferencesViewModel>
  loadExport: (
    exportId: string,
  ) => Promise<RespondentAccountExportArtifactViewModel>
  createExport: () => Promise<RespondentAccountExportArtifactViewModel>
}

const EMPTY_REWARD_SUMMARY: RewardSummary = {
  currentCount: 0,
  pendingAmount: '0.00',
  finalizedAmount: '0.00',
}

const ArenaAccountDataContext = createContext<ArenaAccountDataContextValue | undefined>(undefined)

function buildRewardSummary(rewards: RespondentRewardLedgerViewModel[]): RewardSummary {
  const currentRewards = rewards.filter((reward) => reward.isCurrent)
  const pendingAmount = currentRewards
    .filter((reward) => reward.status === 'pending')
    .reduce((sum, reward) => sum + Number(reward.pendingAmount), 0)
  const finalizedAmount = currentRewards
    .filter((reward) => reward.status === 'finalized')
    .reduce((sum, reward) => sum + Number(reward.finalAmount ?? '0'), 0)

  return {
    currentCount: currentRewards.length,
    pendingAmount: pendingAmount.toFixed(2),
    finalizedAmount: finalizedAmount.toFixed(2),
  }
}

export function ArenaAccountDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, token } = useAuthSession()
  const [overview, setOverview] = useState<RespondentAccountOverviewViewModel | null>(null)
  const [rewards, setRewards] = useState<RespondentRewardLedgerViewModel[]>([])
  const [reputation, setReputation] = useState<RespondentReputationSummaryViewModel | null>(null)
  const [tags, setTags] = useState<RespondentTagSummaryViewModel | null>(null)
  const [preferences, setPreferences] = useState<RespondentAccountPreferencesViewModel | null>(null)
  const [exports, setExports] = useState<RespondentAccountExportListViewModel | null>(null)
  const [latestExport, setLatestExport] = useState<RespondentAccountExportArtifactViewModel | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [preferencesErrorMessage, setPreferencesErrorMessage] = useState<string | null>(null)
  const [exportsErrorMessage, setExportsErrorMessage] = useState<string | null>(null)
  const [isPreferencesLoading, setIsPreferencesLoading] = useState(false)
  const [isPreferencesSaving, setIsPreferencesSaving] = useState(false)
  const [isExportsLoading, setIsExportsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setOverview(null)
      setRewards([])
      setReputation(null)
      setTags(null)
      setPreferences(null)
      setExports(null)
      setLatestExport(null)
      setErrorMessage(null)
      setPreferencesErrorMessage(null)
      setExportsErrorMessage(null)
      setIsLoading(false)
      setIsPreferencesLoading(false)
      setIsExportsLoading(false)
      return
    }

    setIsLoading(true)
    setIsPreferencesLoading(true)
    setIsExportsLoading(true)
    setErrorMessage(null)
    setPreferencesErrorMessage(null)
    setExportsErrorMessage(null)

    try {
      const [nextOverview, nextPreferences, nextExports] = await Promise.all([
        arenaApi.getAccountOverview(token),
        arenaApi.getAccountPreferences(token),
        arenaApi.getAccountExports(token),
      ])

      setOverview(nextOverview)
      setRewards(nextOverview.rewards)
      setReputation(nextOverview.reputation)
      setTags(nextOverview.tags)
      setPreferences(nextPreferences)
      setExports(nextExports)
      if (nextExports.items.length > 0) {
        try {
          const latestArtifact = await arenaApi.getAccountExport(
            nextExports.items[0].exportId,
            token,
          )
          setLatestExport(latestArtifact)
        } catch {
          setLatestExport(null)
        }
      } else {
        setLatestExport(null)
      }
    } catch (error) {
      setOverview(null)
      setRewards([])
      setReputation(null)
      setTags(null)
      setPreferences(null)
      setExports(null)
      setLatestExport(null)
      const message = error instanceof Error ? error.message : 'Failed to load account data'
      setErrorMessage(message)
      setPreferencesErrorMessage(message)
      setExportsErrorMessage(message)
    } finally {
      setIsLoading(false)
      setIsPreferencesLoading(false)
      setIsExportsLoading(false)
    }
  }, [isAuthenticated, token])

  const updatePreferences = useCallback(async (input: UpdateRespondentAccountPreferencesInput) => {
    if (!token) {
      throw new Error('Authentication required')
    }

    setIsPreferencesSaving(true)
    setPreferencesErrorMessage(null)

    try {
      const nextPreferences = await arenaApi.updateAccountPreferences(input, token)
      setPreferences(nextPreferences)
      return nextPreferences
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save account preferences'
      setPreferencesErrorMessage(message)
      throw error
    } finally {
      setIsPreferencesSaving(false)
    }
  }, [token])

  const loadExport = useCallback(async (exportId: string) => {
    if (!token) {
      throw new Error('Authentication required')
    }

    setExportsErrorMessage(null)

    try {
      if (latestExport?.exportId === exportId) {
        return latestExport
      }

      const artifact = await arenaApi.getAccountExport(exportId, token)
      if (exports?.items[0]?.exportId === exportId) {
        setLatestExport(artifact)
      }
      return artifact
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load account export'
      setExportsErrorMessage(message)
      throw error
    }
  }, [exports?.items, latestExport, token])

  const createExport = useCallback(async () => {
    if (!token) {
      throw new Error('Authentication required')
    }

    setIsExporting(true)
    setExportsErrorMessage(null)

    try {
      const artifact = await arenaApi.createAccountExport(token)
      const nextExports = await arenaApi.getAccountExports(token)
      setLatestExport(artifact)
      setExports(nextExports)
      return artifact
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create account export'
      setExportsErrorMessage(message)
      throw error
    } finally {
      setIsExporting(false)
    }
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const sourceMode: ArenaAccountSourceMode = !isAuthenticated
    ? 'unavailable'
    : isDemoToken(token)
      ? 'demo'
      : overview
        ? 'live'
        : 'unavailable'

  const value = useMemo<ArenaAccountDataContextValue>(() => ({
    overview,
    rewards,
    reputation,
    tags,
    // Prefer the server-computed summary from overview; fall back to a local derivation
    // from the rewards ledger when overview has not yet loaded or failed to load.
    rewardSummary: overview?.rewardSummary ?? buildRewardSummary(rewards),
    preferences,
    exports,
    latestExport,
    preferencesErrorMessage,
    exportsErrorMessage,
    isPreferencesLoading,
    isPreferencesSaving,
    isExportsLoading,
    isExporting,
    sourceMode,
    isLoading,
    errorMessage,
    refresh,
    updatePreferences,
    loadExport,
    createExport,
  }), [
    errorMessage,
    exports,
    exportsErrorMessage,
    isExporting,
    isExportsLoading,
    isLoading,
    isPreferencesLoading,
    isPreferencesSaving,
    latestExport,
    loadExport,
    overview,
    preferences,
    preferencesErrorMessage,
    refresh,
    reputation,
    rewards,
    sourceMode,
    tags,
    createExport,
    updatePreferences,
  ])

  return (
    <ArenaAccountDataContext.Provider value={value}>
      {children}
    </ArenaAccountDataContext.Provider>
  )
}

export function useArenaAccountData() {
  const context = useContext(ArenaAccountDataContext)

  if (!context) {
    throw new Error('useArenaAccountData must be used within ArenaAccountDataProvider')
  }

  return context
}
