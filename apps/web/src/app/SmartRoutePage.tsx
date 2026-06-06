import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AccuracyPage } from './AccuracyPage'
import { AdjudicationPage } from './AdjudicationPage'
import { BreakingPage } from './BreakingPage'
import { CategoryDirectoryPage } from './CategoryDirectoryPage'
import { ChallengePage } from './ChallengePage'
import { ClosingSoonPage } from './ClosingSoonPage'
import { DevSessionSeedPage } from './DevSessionSeedPage'
import { DraftsPage } from './DraftsPage'
import { HelpPage } from './HelpPage'
import { LatestPage } from './LatestPage'
import { PublicResultsPage } from './PublicResultsPage.tsx'
import { SubmissionsPage } from './SubmissionsPage'
import { WatchlistPage } from './WatchlistPage'
import { RewardsPage } from './RewardsPage'
import { LeaderboardPage } from './LeaderboardPage'
import { DocsPage } from './DocsPage'
import { MarketIntegrityPage } from './MarketIntegrityPage'
import { ContactPage } from './ContactPage'
import { filters, footerTopics, knownPageTitles } from '../features/app-shell/navigation-contract'
import { AccountActivityPage } from '../components/shared/AccountActivityPage'
import { DirectoryPage } from '../components/shared/DirectoryPage'
import { NotFoundPage } from '../components/shared/NotFoundPage'
import { useQuickMenu } from '../components/shared/QuickMenuContext'
import { UtilityPage } from '../components/shared/UtilityPage'
import { useDiscoveryData } from '../features/arena/discovery-data'
import { OpsConsolePage } from './OpsConsolePage'

const staticDirectoryPageTitles: Record<string, string> = {
  '/zh/brand': knownPageTitles['/zh/brand'],
}

function QuickMenuAliasPage() {
  const navigate = useNavigate()
  const { openQuickMenuFromRoute } = useQuickMenu()

  useEffect(() => {
    openQuickMenuFromRoute()
    navigate('/zh', { replace: true, state: { openQuickMenuFromAlias: true } })
  }, [navigate, openQuickMenuFromRoute])

  return null
}

export function SmartRoutePage() {
  const { pathname } = useLocation()
  const { hasCategoryPath, isLoading: discoveryIsLoading } = useDiscoveryData()
  const removedPredictionRoutes = new Set([
    '/zh/predictions/rolling',
    '/zh/predictions/public-policy',
    '/zh/predictions/geopolitics',
    '/zh/predictions/ai',
    '/zh/predictions/finance',
    '/zh/predictions/sports',
    '/zh/predictions/effective-sample',
  ])

  if (pathname === '/zh/watchlist') {
    return <WatchlistPage />
  }

  if (pathname === '/zh/dev/session-seed') {
    return <DevSessionSeedPage />
  }

  if (pathname === '/zh/drafts') {
    return <DraftsPage />
  }

  if (pathname === '/zh/submissions') {
    return <SubmissionsPage />
  }

  if (pathname === '/zh/activity') {
    return <AccountActivityPage />
  }

  if (pathname === '/zh/menu') {
    return <QuickMenuAliasPage />
  }

  if (pathname === '/zh/pages') {
    return <UtilityPage title="全部页面" description="Arena 产品所有入口一览，覆盖发现、市场、账户、支持等功能模块。" variant="pages" />
  }

  if (pathname === '/zh/categories') {
    return <UtilityPage title="分类浏览" description="按主题分类浏览 Arena 公开命题，覆盖政策、金融、科技、体育等多个领域。" variant="categories" />
  }

  if (pathname === '/zh/language') {
    return <UtilityPage title="语言设置" description="切换产品界面显示语言，当前产品以中文为主界面语言。" variant="language" />
  }

  if (pathname === '/zh/share') {
    return <UtilityPage title="分享命题" description="分享链接仅在当前产品界面内流转，不调用外部集成或第三方系统。" variant="share" />
  }

  if (pathname === '/zh/help') {
    return <HelpPage />
  }

  if (pathname === '/zh/adjudication') {
    return <AdjudicationPage />
  }

  if (pathname === '/zh/challenges') {
    return <ChallengePage />
  }

  if (pathname === '/zh/rewards') {
    return <RewardsPage />
  }

  if (pathname === '/zh/leaderboard') {
    return <LeaderboardPage />
  }

  if (pathname === '/zh/docs') {
    return <DocsPage />
  }

  if (pathname === '/zh/market-integrity') {
    return <MarketIntegrityPage />
  }

  if (pathname === '/zh/contact') {
    return <ContactPage />
  }

  if (pathname === '/zh/accuracy') {
    return <AccuracyPage />
  }

  if (pathname === '/zh/breaking') {
    return <BreakingPage />
  }

  if (pathname === '/zh/new') {
    return <LatestPage />
  }

  if (pathname === '/zh/ops' || pathname.startsWith('/zh/ops/')) {
    return <OpsConsolePage />
  }

  if (removedPredictionRoutes.has(pathname)) {
    return <NotFoundPage />
  }

  if (pathname === '/zh/predictions/public-results') {
    return <PublicResultsPage />
  }

  if (pathname === '/zh/predictions/closing-soon') {
    return <ClosingSoonPage />
  }

  if (pathname.startsWith('/zh/predictions/')) {
    const topic =
      filters.find((item) => item.href === pathname)?.label
      ?? footerTopics.find((item) => item.href === pathname)?.label
      ?? 'Topic'

    return <DirectoryPage title={`${topic} 命题`} />
  }

  if (hasCategoryPath(pathname)) {
    return <CategoryDirectoryPage key={pathname} pathname={pathname} />
  }

  if (staticDirectoryPageTitles[pathname]) {
    return <DirectoryPage title={staticDirectoryPageTitles[pathname]} />
  }

  if (pathname.startsWith('/zh/news/')) {
    return <UtilityPage title="命题参考" description="以下为 Arena 当前公开命题列表，可在其中找到相关命题的详细信息。" variant="news" />
  }

  if (discoveryIsLoading) {
    return null
  }

  return <NotFoundPage />
}
