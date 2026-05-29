import type {
  PublicCategoryDirectoryIndexItemViewModel,
  PublicCategoryDirectoryViewModel,
  PublicDiscoverPageViewModel,
  PublicDiscoveryRankingViewModel,
  PublicLatestTopicsViewModel,
  PublicRespondentLeaderboardViewModel,
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
import { demoBackend } from '../demo/demo-backend'
import { useAuthSession } from '../auth/auth-session'

type DiscoveryDataContextValue = {
  home: PublicDiscoverPageViewModel | null
  hot: PublicDiscoveryRankingViewModel | null
  breaking: PublicDiscoveryRankingViewModel | null
  latestTopics: PublicLatestTopicsViewModel | null
  respondentLeaderboard: PublicRespondentLeaderboardViewModel | null
  categoryIndex: Map<string, PublicCategoryDirectoryIndexItemViewModel>
  categories: Map<string, PublicCategoryDirectoryViewModel>
  sourceMode: 'live' | 'demo' | 'mixed'
  isLoading: boolean
  errorMessage: string | null
  refresh: () => Promise<void>
  hasCategoryPath: (pathname: string) => boolean
  getCategory: (pathname: string) => PublicCategoryDirectoryViewModel | null
}

const DiscoveryDataContext = createContext<DiscoveryDataContextValue | undefined>(undefined)

function isCategoryEntry(
  entry: readonly [string, PublicCategoryDirectoryViewModel] | null,
): entry is readonly [string, PublicCategoryDirectoryViewModel] {
  return entry !== null
}

export function DiscoveryDataProvider({ children }: { children: ReactNode }) {
  const { token, isDemoSession } = useAuthSession()
  const [home, setHome] = useState<PublicDiscoverPageViewModel | null>(null)
  const [hot, setHot] = useState<PublicDiscoveryRankingViewModel | null>(null)
  const [breaking, setBreaking] = useState<PublicDiscoveryRankingViewModel | null>(null)
  const [latestTopics, setLatestTopics] = useState<PublicLatestTopicsViewModel | null>(null)
  const [respondentLeaderboard, setRespondentLeaderboard] = useState<PublicRespondentLeaderboardViewModel | null>(null)
  const [categoryIndex, setCategoryIndex] = useState<Map<string, PublicCategoryDirectoryIndexItemViewModel>>(new Map())
  const [categories, setCategories] = useState<Map<string, PublicCategoryDirectoryViewModel>>(new Map())
  const [sourceMode, setSourceMode] = useState<'live' | 'demo' | 'mixed'>('live')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      if (isDemoSession && demoBackend.isDemoToken(token)) {
        const nextCategoryIndex = demoBackend.getCategoryDirectoryIndex()
        setHome(demoBackend.getDiscoveryHome())
        setHot(demoBackend.getDiscoveryRanking('hot'))
        setBreaking(demoBackend.getDiscoveryRanking('breaking'))
        setLatestTopics(demoBackend.getLatestTopics())
        setRespondentLeaderboard(demoBackend.getPublicRespondentLeaderboard())
        setSourceMode('demo')
        setCategoryIndex(new Map(
          nextCategoryIndex.items.map((item) => [item.pathname, item] as const),
        ))
        setCategories(new Map(
          nextCategoryIndex.items
            .map((item) => {
              const config = demoBackend.getCategoryDirectory(item.slug)
              return config ? ([item.pathname, config] as const) : null
            })
            .filter(isCategoryEntry),
        ))
        return
      }

      const [nextHome, nextHot, nextBreaking, nextLatestTopics, nextRespondentLeaderboard, nextCategoryIndex] = await Promise.all([
        arenaApi.getDiscoveryHomeFeed(),
        arenaApi.getDiscoveryRankingFeed('hot'),
        arenaApi.getDiscoveryRankingFeed('breaking'),
        arenaApi.getLatestTopicsFeed(),
        arenaApi.getPublicRespondentLeaderboardFeed(),
        arenaApi.getCategoryDirectoryIndexFeed(),
      ])

      const categoryFeeds = await Promise.all(
        nextCategoryIndex.data.items.map(async (item) => ({
          pathname: item.pathname,
          feed: await arenaApi.getCategoryDirectoryFeed(item.slug),
        })),
      )

      setHome(nextHome.data)
      setHot(nextHot.data)
      setBreaking(nextBreaking.data)
      setLatestTopics(nextLatestTopics.data)
      setRespondentLeaderboard(nextRespondentLeaderboard.data)
      setCategoryIndex(new Map(
        nextCategoryIndex.data.items.map((item) => [item.pathname, item] as const),
      ))
      setSourceMode(
        [
          nextHome.sourceMode,
          nextHot.sourceMode,
          nextBreaking.sourceMode,
          nextLatestTopics.sourceMode,
          nextRespondentLeaderboard.sourceMode,
          nextCategoryIndex.sourceMode,
          ...categoryFeeds.map((entry) => entry.feed.sourceMode),
        ].every((entry) => entry === 'live')
          ? 'live'
          : [
              nextHome.sourceMode,
              nextHot.sourceMode,
              nextBreaking.sourceMode,
              nextLatestTopics.sourceMode,
              nextRespondentLeaderboard.sourceMode,
              nextCategoryIndex.sourceMode,
              ...categoryFeeds.map((entry) => entry.feed.sourceMode),
            ].every((entry) => entry === 'demo')
            ? 'demo'
            : 'mixed',
      )
      setCategories(new Map(
        categoryFeeds
          .map(({ pathname, feed }) => (feed.data ? ([pathname, feed.data] as const) : null))
          .filter(isCategoryEntry),
      ))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load discovery data')
    } finally {
      setIsLoading(false)
    }
  }, [isDemoSession, token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<DiscoveryDataContextValue>(() => ({
    home,
    hot,
    breaking,
    latestTopics,
    respondentLeaderboard,
    categoryIndex,
    categories,
    sourceMode,
    isLoading,
    errorMessage,
    refresh,
    hasCategoryPath: (pathname: string) => categoryIndex.has(pathname),
    getCategory: (pathname: string) => categories.get(pathname) ?? null,
  }), [breaking, categories, categoryIndex, errorMessage, home, hot, isLoading, latestTopics, refresh, respondentLeaderboard, sourceMode])

  return (
    <DiscoveryDataContext.Provider value={value}>
      {children}
    </DiscoveryDataContext.Provider>
  )
}

export function useDiscoveryData() {
  const context = useContext(DiscoveryDataContext)

  if (!context) {
    throw new Error('useDiscoveryData must be used within DiscoveryDataProvider')
  }

  return context
}

export function useOptionalDiscoveryData() {
  return useContext(DiscoveryDataContext)
}
