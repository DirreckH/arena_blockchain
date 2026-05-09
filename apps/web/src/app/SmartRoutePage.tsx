import { useLocation } from 'react-router-dom'
import { AdjudicationPage } from './AdjudicationPage'
import { BreakingPage } from './BreakingPage'
import { CategoryDirectoryPage } from './CategoryDirectoryPage'
import { ChallengePage } from './ChallengePage'
import { DraftsPage } from './DraftsPage'
import { LatestPage } from './LatestPage'
import { SearchPage } from './SearchPage'
import { WatchlistPage } from './WatchlistPage'
import { isCategoryDirectoryPath } from '../mocks/category-directory.mock'
import { filters, footerTopics, knownPageTitles } from '../mocks/arena-market.mock'
import { AccountActivityPage } from '../components/shared/AccountActivityPage'
import { BuildingPage } from '../components/shared/BuildingPage'
import { DirectoryPage } from '../components/shared/DirectoryPage'
import { NotFoundPage } from '../components/shared/NotFoundPage'
import { UtilityPage } from '../components/shared/UtilityPage'

export function SmartRoutePage() {
  const { pathname } = useLocation()

  if (pathname === '/zh/search') {
    return <SearchPage />
  }

  if (pathname === '/zh/watchlist') {
    return <WatchlistPage />
  }

  if (pathname === '/zh/drafts') {
    return <DraftsPage />
  }

  if (pathname === '/zh/activity') {
    return <AccountActivityPage />
  }

  if (pathname === '/zh/menu') {
    return <UtilityPage title="Menu and account" description="Browse language, account entry points, and product support pages." variant="menu" />
  }

  if (pathname === '/zh/pages') {
    return <UtilityPage title="More pages" description="Browse account, tools, support, and additional product entry points." variant="pages" />
  }

  if (pathname === '/zh/categories') {
    return <UtilityPage title="More markets" description="Browse more market category entry points." variant="categories" />
  }

  if (pathname === '/zh/language') {
    return <UtilityPage title="Language" description="The current localized product shell is Chinese-first." variant="language" />
  }

  if (pathname === '/zh/share') {
    return <UtilityPage title="Share" description="Links stay inside the current internal shell and do not call external system integrations." variant="share" />
  }

  if (pathname === '/zh/help') {
    return <BuildingPage title="Help center" description="The help center route stays reserved while the rest of the product shell is being closed out." />
  }

  if (pathname === '/zh/adjudication') {
    return <AdjudicationPage />
  }

  if (pathname === '/zh/challenges') {
    return <ChallengePage />
  }

  if (pathname === '/zh/breaking') {
    return <BreakingPage />
  }

  if (pathname === '/zh/new') {
    return <LatestPage />
  }

  if (pathname.startsWith('/zh/predictions/')) {
    const topic =
      filters.find((item) => item.href === pathname)?.label
      ?? footerTopics.find((item) => item.href === pathname)?.label
      ?? 'Topic'

    return <DirectoryPage title={`${topic} propositions`} />
  }

  if (isCategoryDirectoryPath(pathname)) {
    return <CategoryDirectoryPage key={pathname} pathname={pathname} />
  }

  if (knownPageTitles[pathname]) {
    return <DirectoryPage title={knownPageTitles[pathname]} />
  }

  if (pathname.startsWith('/zh/news/')) {
    return <UtilityPage title="Reference detail" description="Read the internal supporting note linked to the current proposition." variant="news" />
  }

  return <NotFoundPage />
}
