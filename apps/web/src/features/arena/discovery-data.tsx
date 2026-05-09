import type {
  PublicCategoryDirectoryViewModel,
  PublicDiscoverPageViewModel,
  PublicDiscoveryRankingViewModel,
  PublicLatestTopicsViewModel,
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
  categories: Map<string, PublicCategoryDirectoryViewModel>
  sourceMode: 'live' | 'demo'
  isLoading: boolean
  errorMessage: string | null
  refresh: () => Promise<void>
  getCategory: (pathname: string) => PublicCategoryDirectoryViewModel | null
}

const DiscoveryDataContext = createContext<DiscoveryDataContextValue | undefined>(undefined)

const categorySlugByPathname = new Map<string, string>([
  ['/zh/politics', 'politics'],
  ['/zh/sports/live', 'sports-live'],
  ['/zh/crypto', 'crypto'],
  ['/zh/tech', 'tech'],
  ['/zh/geopolitics', 'geopolitics'],
  ['/zh/finance', 'finance'],
  ['/zh/pop-culture', 'pop-culture'],
  ['/zh/economy', 'economy'],
  ['/zh/weather', 'weather'],
  ['/zh/surveys', 'surveys'],
  ['/zh/rolling', 'rolling'],
])

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
  const [categories, setCategories] = useState<Map<string, PublicCategoryDirectoryViewModel>>(new Map())
  const [sourceMode, setSourceMode] = useState<'live' | 'demo'>('live')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      if (isDemoSession && demoBackend.isDemoToken(token)) {
        setHome(demoBackend.getDiscoveryHome())
        setHot(demoBackend.getDiscoveryRanking('hot'))
        setBreaking(demoBackend.getDiscoveryRanking('breaking'))
        setLatestTopics(demoBackend.getLatestTopics())
        setSourceMode('demo')
        setCategories(new Map(
          Array.from(categorySlugByPathname.entries())
            .map(([pathname, slug]) => {
              const config = demoBackend.getCategoryDirectory(slug)
              return config ? ([pathname, config] as const) : null
            })
            .filter(isCategoryEntry),
        ))
        return
      }

      const [nextHome, nextHot, nextBreaking, nextLatestTopics, categoryEntries] = await Promise.all([
        arenaApi.getDiscoveryHomeFeed(),
        arenaApi.getDiscoveryRankingFeed('hot'),
        arenaApi.getDiscoveryRankingFeed('breaking'),
        arenaApi.getLatestTopicsFeed(),
        Promise.all(
          Array.from(categorySlugByPathname.entries()).map(async ([pathname, slug]) => {
            const config = await arenaApi.getCategoryDirectoryFeed(slug)
            return config.data ? ([pathname, config.data] as const) : null
          }),
        ),
      ])

      setHome(nextHome.data)
      setHot(nextHot.data)
      setBreaking(nextBreaking.data)
      setLatestTopics(nextLatestTopics.data)
      setSourceMode(
        [nextHome.sourceMode, nextHot.sourceMode, nextBreaking.sourceMode, nextLatestTopics.sourceMode].every((entry) => entry === 'live')
          ? 'live'
          : 'demo',
      )
      setCategories(new Map(categoryEntries.filter(isCategoryEntry)))
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
    categories,
    sourceMode,
    isLoading,
    errorMessage,
    refresh,
    getCategory: (pathname: string) => categories.get(pathname) ?? null,
  }), [breaking, categories, errorMessage, home, hot, isLoading, latestTopics, refresh, sourceMode])

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
