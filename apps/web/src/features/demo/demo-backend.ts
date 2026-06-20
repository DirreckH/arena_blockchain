import type {
  AdjudicationTaskViewModel,
  ArenaDiscussionThreadViewModel,
  AuthChallengeResponse,
  CurrentUserPositionViewModel,
  JwtIdentity,
  PlaceValidationBetResult,
  PropositionCategory,
  PropositionStatus,
  PublicCategoryDirectoryIndexViewModel,
  PublicCategoryDirectoryViewModel,
  PublicClosingSoonViewModel,
  PublicDiscoverPageViewModel,
  PublicDiscoveryRankingViewModel,
  PublicIntegrityOverviewViewModel,
  PublicLatestTopicsViewModel,
  PublicProgressViewModel,
  PublicRespondentLeaderboardViewModel,
  PublicSettledResultsViewModel,
  RequesterDeliveryCredentialDirectoryViewModel,
  RequesterComparisonSetDeliveryPolicyHealthViewModel,
  RequesterComparisonSetDeliveryPolicyListViewModel,
  RequesterComparisonSetDeliveryRunListViewModel,
  RequesterComparisonSetDeliveryRunRetryResultViewModel,
  RequesterComparisonSetDeliveryRunViewModel,
  RequesterComparisonSetDeliveryPolicyRunResultViewModel,
  RequesterComparisonSetDeliveryPolicyViewModel,
  RespondentAccountExportArtifactViewModel,
  RespondentAccountExportListViewModel,
  RespondentAccountOverviewViewModel,
  RespondentAccountPreferencesViewModel,
  RespondentReputationSummaryViewModel,
  RespondentResultOverviewViewModel,
  RespondentRewardLedgerViewModel,
  RespondentTagSummaryViewModel,
  RespondentWatchlistViewModel,
  RequesterComparisonSetListViewModel,
  RequesterOwnedComparisonSetExportListViewModel,
  RequesterOwnedComparisonSetExportArtifactViewModel,
  RequesterOwnedPropositionAnalyticsComparisonViewModel,
  RequesterOwnedPropositionAnalyticsViewModel,
  RequesterPropositionBudgetLedgerViewModel,
  RequesterPropositionBudgetSummaryViewModel,
  RequesterPropositionSubmissionStatus,
  RequesterReportPresetListViewModel,
  RequesterReportPresetViewModel,
  RequesterComparisonSetViewModel,
  RequesterOwnedPropositionRecentItemViewModel,
  ChainSnapshot,
  SubmitAdjudicationResponseResult,
  UpdateRespondentAccountPreferencesInput,
  UpdateRespondentWatchlistResultViewModel,
  ValidationMarketViewModel,
} from '@arena/shared'
import { DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES } from '@arena/shared'
import type {
  AuthVerifyResponse,
  CreateRequesterComparisonSetDeliveryPolicyInputRecord,
  CreateRequesterComparisonSetInputRecord,
  CreateRequesterReportPresetInputRecord,
  DeleteRequesterComparisonSetDeliveryPolicyResultRecord,
  DeleteRequesterComparisonSetExportResultRecord,
  PropositionDraftRecord,
  RequesterComparisonSetAnalyticsRecord,
  RequesterComparisonSetDeliveryRunReplayFilterRecord,
  RequesterComparisonSetDeliveryRunStatusFilterRecord,
  RequesterComparisonSetDeliveryRunTriggerTypeFilterRecord,
  RequesterComparisonSetExportRecord,
  RequesterComparisonSetExportOriginFilterRecord,
  RequesterComparisonSetListRecord,
  RequesterOwnedPropositionDetailRecord,
  RequesterOwnedPropositionExportListRecord,
  RequesterOwnedPropositionExportRecord,
  RequesterPropositionBudgetLedgerRecord,
  RequesterOwnedPropositionOverviewRecord,
  RequesterOwnedSettledPropositionReportRecord,
  UpdateRequesterComparisonSetDeliveryPolicyInputRecord,
  UpdateRequesterComparisonSetInputRecord,
  UpdateRequesterReportPresetInputRecord,
} from '../api/arena-api'
import type {
  InternalDiscoveryCategoryConfigInput,
  InternalDiscoveryCategoryConfigSummaryViewModel,
  InternalDiscoveryCategoryConfigViewModel,
  InternalDiscoveryCategoryPageState,
  InternalDiscoveryGlobalCategoryConfigViewModel,
  InternalDiscoveryGlobalConfigInput,
  InternalDiscoveryGlobalConfigViewModel,
  InternalDiscoverySecondaryCapsuleViewModel,
  InternalDiscoverySidebarItemInput,
} from '../arena/internal-ops.types'
import { CATEGORY_DIRECTORY_CONFIGS, getCategoryDirectoryConfig } from '../../mocks/category-directory.mock'
import { DISCOVER_PAGE_SECTION_PATHS } from '../../mocks/discover-page.mock'
import { LATEST_TOPIC_ITEMS } from '../../mocks/latest-page.mock'
import { BREAKING_PAGE_CONFIG } from '../../mocks/breaking-page.mock'
import { HOT_PAGE_CONFIG } from '../../mocks/hot-page.mock'
import { marketCards, navItems } from '../../mocks/arena-market.mock'
import { DEMO_DISCUSSION_COMMENTS } from '../arena/discussion'
import { buildDemoIdentity, DEMO_SESSION_TOKEN, DEMO_WALLET_ADDRESS } from './demo-auth'
import { demoOpsBackend } from './demo-ops-backend'

type DemoState = {
  identity: JwtIdentity
  markets: ValidationMarketViewModel[]
  drafts: PropositionDraftRecord[]
  requesterExports: RequesterOwnedPropositionExportRecord[]
  requesterComparisonExports: RequesterOwnedComparisonSetExportArtifactViewModel[]
  requesterComparisonDeliveryPolicies: RequesterComparisonSetDeliveryPolicyViewModel[]
  requesterComparisonDeliveryRuns: RequesterComparisonSetDeliveryRunViewModel[]
  requesterComparisonDeliveryHealthReadCount: number
  tasks: AdjudicationTaskViewModel[]
  watchlist: RespondentWatchlistViewModel
  preferences: RespondentAccountPreferencesViewModel
  rewards: RespondentRewardLedgerViewModel[]
  reputation: RespondentReputationSummaryViewModel
  tags: RespondentTagSummaryViewModel
  exports: RespondentAccountExportListViewModel
  latestExport: RespondentAccountExportArtifactViewModel | null
  discussionThreads: Record<string, ArenaDiscussionThreadViewModel>
  discoveryGlobalConfig: InternalDiscoveryGlobalConfigViewModel
  discoveryCategoryConfigs: Record<string, InternalDiscoveryCategoryConfigInput>
}

const DEMO_USER_ID = 'demo-user'
const DEMO_CHAIN_ID = 31337
const DEMO_NOW = '2026-05-08T09:30:00.000Z'
const DEMO_CLOSING_SOON_URGENT_WINDOW_MS = 3 * 60 * 60 * 1000
const DEMO_DISCOVERY_RANKING_CATEGORY_ORDER = ['all', 'general', 'dao', 'politics', 'sports', 'tech', 'research', 'culture'] as const

const DEMO_CUSTOM_DIRECTORY_PATHNAME_PREFIX = '/zh/c/'
const DEMO_CUSTOM_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,31}$/
const DEMO_RESERVED_CUSTOM_SLUGS = new Set([
  'ops', 'admin', 'api', 'auth', 'event', 'events', 'markets', 'results',
  'rewards', 'watchlist', 'drafts', 'submissions', 'leaderboard', 'docs',
  'help', 'contact', 'predictions', 'categories', 'pages', 'menu', 'language',
  'share', 'breaking', 'hot', 'new', 'latest', 'adjudication', 'challenges',
  'accuracy', 'market-integrity', 'activity', 'dev', 'c',
])

function buildDemoCustomDirectoryPathname(slug: string): string {
  return `${DEMO_CUSTOM_DIRECTORY_PATHNAME_PREFIX}${slug}`
}

const demoCategoryDirectoryIndexItems: PublicCategoryDirectoryIndexViewModel['items'] = Object.entries(
  CATEGORY_DIRECTORY_CONFIGS,
).map(([pathname, config]) => ({
  slug: pathname.replace(/^\/zh\//, '').replace(/\//g, '-'),
  pathname,
  label:
    pathname === '/zh/politics' ? '公共政策'
      : pathname === '/zh/sports/live' ? '体育'
        : pathname === '/zh/crypto' ? '加密'
          : pathname === '/zh/tech' ? '科技'
            : pathname === '/zh/geopolitics' ? '地缘'
              : pathname === '/zh/finance' ? '金融'
                : pathname === '/zh/pop-culture' ? '文化'
                  : pathname === '/zh/economy' ? '经济'
                    : pathname === '/zh/dao' ? 'DAO'
                      : pathname === '/zh/surveys' ? '调研'
                      : '滚动命题',
  title: config.title,
  directoryLabel:
    pathname === '/zh/politics' ? '公共政策'
      : pathname === '/zh/sports/live' ? '体育结果'
        : pathname === '/zh/crypto' ? '加密观察'
          : pathname === '/zh/tech' ? '科技调研'
            : pathname === '/zh/geopolitics' ? '地缘事件'
              : pathname === '/zh/finance' ? '金融观察'
                : pathname === '/zh/pop-culture' ? '文化调研'
                  : pathname === '/zh/economy' ? '经济观察'
                    : pathname === '/zh/dao' ? 'DAO 命题'
                      : pathname === '/zh/surveys' ? '调研网络'
                        : '滚动命题',
  description:
    pathname === '/zh/politics' ? '政府、立法与公共治理'
      : pathname === '/zh/sports/live' ? '赛事结果与运动员表现'
        : pathname === '/zh/crypto' ? '区块链与数字资产市场'
          : pathname === '/zh/tech' ? '产品、开发者与科技生态'
            : pathname === '/zh/geopolitics' ? '国际局势与区域冲突'
              : pathname === '/zh/finance' ? '资产价格与宏观经济'
                : pathname === '/zh/pop-culture' ? '娱乐、媒体与大众文化'
                  : pathname === '/zh/economy' ? '就业、消费与产业数据'
                    : pathname === '/zh/dao' ? 'DAO 治理、国库、委托与协议研究命题'
                      : pathname === '/zh/surveys' ? '开发者、消费者与品牌调研'
                        : '周期更新与上期结果归档',
}))

const DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG: InternalDiscoveryGlobalConfigViewModel = {
  categories: demoCategoryDirectoryIndexItems.map((item, index) => ({
    slug: item.slug,
    pathname: item.pathname,
    label: item.label,
    title: item.title,
    directoryLabel: item.directoryLabel,
    description: item.description,
    displayOrder: index,
    pageState: 'visible',
    kind: 'system',
    marketIdWhitelist: [],
    invalidMarketIds: [],
  })),
  rankingCategoryLabels: {
    all: '全部',
    general: '综合',
    dao: 'DAO',
    politics: '政策',
    sports: '体育',
    tech: '科技',
    research: '研究',
    culture: '文化',
  },
  secondaryCapsules: DEMO_DISCOVERY_RANKING_CATEGORY_ORDER.map((id, index) => ({
    id,
    label:
      id === 'all' ? '全部'
        : id === 'general' ? '综合'
          : id === 'dao' ? 'DAO'
            : id === 'politics' ? '政策'
              : id === 'sports' ? '体育'
                : id === 'tech' ? '科技'
                  : id === 'research' ? '研究'
                    : '文化',
    displayOrder: index,
    pageState: 'visible',
    kind: 'system',
    baseRankingId: id,
    marketIdWhitelist: [],
    invalidMarketIds: [],
  })),
}

function plusHours(hours: number) {
  return new Date(Date.parse(DEMO_NOW) + hours * 60 * 60 * 1000).toISOString()
}

function plusDays(days: number) {
  return new Date(Date.parse(DEMO_NOW) + days * 24 * 60 * 60 * 1000).toISOString()
}

function minusHours(hours: number) {
  return new Date(Date.parse(DEMO_NOW) - hours * 60 * 60 * 1000).toISOString()
}

function minusMinutes(minutes: number) {
  return new Date(Date.parse(DEMO_NOW) - minutes * 60 * 1000).toISOString()
}

function minusDays(days: number) {
  return new Date(Date.parse(DEMO_NOW) - days * 24 * 60 * 60 * 1000).toISOString()
}

function toCategory(categoryHref: string): PropositionCategory {
  switch (categoryHref) {
    case '/zh/politics':
      return 'politics'
    case '/zh/dao':
      return 'dao'
    case '/zh/sports/live':
      return 'sports'
    case '/zh/crypto':
    case '/zh/tech':
      return 'ai'
    case '/zh/pop-culture':
      return 'entertainment'
    case '/zh/finance':
    case '/zh/geopolitics':
    case '/zh/surveys':
    case '/zh/economy':
    default:
      return 'general'
  }
}

function normalizeDemoText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function normalizeDemoPageState(
  value: string | undefined,
  fallback: InternalDiscoveryCategoryPageState = 'visible',
): InternalDiscoveryCategoryPageState {
  return value === 'hidden' || value === 'deleted' || value === 'visible'
    ? value
    : fallback
}

function dedupeDemoStrings(values: string[]) {
  return [...new Set(values)]
}

function getDemoDiscoveryGlobalConfigState() {
  return demoState.discoveryGlobalConfig
}

function isDemoSystemSlug(slug: string): boolean {
  return DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.categories.some((item) => item.slug === slug)
}

function getDemoDiscoveryCategoryMeta(slug: string) {
  return getDemoDiscoveryGlobalConfigState().categories.find((item) => item.slug === slug) ?? null
}

function getDemoDiscoveryCategoriesSorted() {
  return [...getDemoDiscoveryGlobalConfigState().categories].sort((left, right) => {
    const orderDelta = left.displayOrder - right.displayOrder
    if (orderDelta !== 0) {
      return orderDelta
    }

      const leftSystemIndex = DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.categories.findIndex((item) => item.slug === left.slug)
      const rightSystemIndex = DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.categories.findIndex((item) => item.slug === right.slug)
      // System slugs come first (preserved by their default index); custom slugs (-1) sort after.
      const leftRank = leftSystemIndex >= 0 ? leftSystemIndex : Number.MAX_SAFE_INTEGER
      const rightRank = rightSystemIndex >= 0 ? rightSystemIndex : Number.MAX_SAFE_INTEGER
      return leftRank - rightRank
  })
}

function getDemoVisibleDiscoveryCategoriesSorted() {
  return getDemoDiscoveryCategoriesSorted().filter((item) => item.pageState === 'visible')
}

function isValidDemoCustomSlug(slug: string): boolean {
  return (
    DEMO_CUSTOM_SLUG_PATTERN.test(slug)
    && !isDemoSystemSlug(slug)
    && !DEMO_RESERVED_CUSTOM_SLUGS.has(slug)
  )
}

function buildInvalidDemoMarketIds(marketIds: string[]): string[] {
  const validIds = new Set(demoState.markets.map((market) => market.marketId))
  return marketIds.filter((marketId) => !validIds.has(marketId))
}

function normalizeDemoDiscoveryGlobalConfig(
  input: InternalDiscoveryGlobalConfigInput,
): InternalDiscoveryGlobalConfigViewModel {
  // System categories: preserve metadata but allow operator overrides.
  const systemCategories: InternalDiscoveryGlobalCategoryConfigViewModel[]
    = DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.categories.map((defaultCategory) => {
      const override = input.categories.find((item) => item.slug === defaultCategory.slug)
      return {
        ...defaultCategory,
        label: normalizeDemoText(override?.label, defaultCategory.label),
        title: normalizeDemoText(override?.title, defaultCategory.title),
        directoryLabel: normalizeDemoText(override?.directoryLabel, defaultCategory.directoryLabel),
        description: normalizeDemoText(override?.description, defaultCategory.description),
        displayOrder: typeof override?.displayOrder === 'number' ? override.displayOrder : defaultCategory.displayOrder,
        pageState: normalizeDemoPageState(override?.pageState, defaultCategory.pageState),
        kind: 'system',
        marketIdWhitelist: [],
        invalidMarketIds: [],
      }
    })

  // Custom categories: any slug not in the system list. Validate slug format
  // and skip duplicates / reserved.
  const seenCustomSlugs = new Set<string>()
  const customCategories: InternalDiscoveryGlobalCategoryConfigViewModel[] = []
  for (const entry of input.categories) {
    if (isDemoSystemSlug(entry.slug)) {
      continue
    }

    const slug = entry.slug.trim()
    if (!isValidDemoCustomSlug(slug) || seenCustomSlugs.has(slug)) {
      continue
    }
    seenCustomSlugs.add(slug)

    const label = normalizeDemoText(entry.label, slug)
    const marketIdWhitelist = dedupeDemoStrings(
      (entry.marketIdWhitelist ?? []).map((id) => id.trim()).filter((id) => id.length > 0),
    )

    customCategories.push({
      slug,
      pathname: buildDemoCustomDirectoryPathname(slug),
      label,
      title: normalizeDemoText(entry.title, label),
      directoryLabel: normalizeDemoText(entry.directoryLabel, label),
      description: normalizeDemoText(entry.description, ''),
      displayOrder: typeof entry.displayOrder === 'number' ? entry.displayOrder : DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.categories.length + customCategories.length,
      pageState: normalizeDemoPageState(entry.pageState, 'visible'),
      kind: 'custom',
      marketIdWhitelist,
      invalidMarketIds: buildInvalidDemoMarketIds(marketIdWhitelist),
    })
  }

  const categories = [...systemCategories, ...customCategories].sort((left, right) => {
    const orderDelta = left.displayOrder - right.displayOrder
    if (orderDelta !== 0) {
      return orderDelta
    }

    const leftSystemIndex = DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.categories.findIndex((item) => item.slug === left.slug)
    const rightSystemIndex = DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.categories.findIndex((item) => item.slug === right.slug)
    const leftRank = leftSystemIndex >= 0 ? leftSystemIndex : Number.MAX_SAFE_INTEGER
    const rightRank = rightSystemIndex >= 0 ? rightSystemIndex : Number.MAX_SAFE_INTEGER
    return leftRank - rightRank
  })

  const rankingCategoryLabels = Object.fromEntries(
    DEMO_DISCOVERY_RANKING_CATEGORY_ORDER.map((categoryId) => [
      categoryId,
      normalizeDemoText(
        input.rankingCategoryLabels[categoryId],
        DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.rankingCategoryLabels[categoryId],
      ),
    ]),
  ) as InternalDiscoveryGlobalConfigViewModel['rankingCategoryLabels']

  // Secondary capsules: keep system entries (id matches a base ranking id) intact
  // for label/order/state changes; custom entries (id starts with `cap-`) carry
  // marketIdWhitelist + label.
  const inputCapsules = input.secondaryCapsules ?? []
  const systemCapsules: InternalDiscoverySecondaryCapsuleViewModel[]
    = DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.secondaryCapsules.map((defaultCapsule) => {
      const override = inputCapsules.find((item) => item.id === defaultCapsule.id)
      // Fallback chain: explicit secondaryCapsules.label → rankingCategoryLabels →
      // default capsule label. This keeps callers that only update
      // rankingCategoryLabels (e.g. legacy ops payloads) reflected on the
      // capsule strip without forcing them to mirror data into both fields.
      const baseId = defaultCapsule.baseRankingId
      const rankingFallback = baseId ? rankingCategoryLabels[baseId] : defaultCapsule.label
      return {
        ...defaultCapsule,
        label: normalizeDemoText(override?.label, rankingFallback),
        displayOrder: typeof override?.displayOrder === 'number' ? override.displayOrder : defaultCapsule.displayOrder,
        // System capsules cannot transition to 'deleted' to keep ranking filtering coherent.
        pageState: normalizeDemoPageState(override?.pageState === 'deleted' ? 'hidden' : override?.pageState, defaultCapsule.pageState),
      }
    })

  const seenCustomCapsuleIds = new Set<string>()
  const customCapsules: InternalDiscoverySecondaryCapsuleViewModel[] = []
  for (const entry of inputCapsules) {
    if (DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.secondaryCapsules.some((item) => item.id === entry.id)) {
      continue
    }

    const id = entry.id.trim()
    if (id.length === 0 || seenCustomCapsuleIds.has(id)) {
      continue
    }
    seenCustomCapsuleIds.add(id)

    const marketIdWhitelist = dedupeDemoStrings(
      (entry.marketIdWhitelist ?? []).map((marketId) => marketId.trim()).filter((marketId) => marketId.length > 0),
    )

    customCapsules.push({
      id,
      label: normalizeDemoText(entry.label, id),
      displayOrder: typeof entry.displayOrder === 'number' ? entry.displayOrder : DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG.secondaryCapsules.length + customCapsules.length,
      pageState: normalizeDemoPageState(entry.pageState, 'visible'),
      kind: 'custom',
      baseRankingId: null,
      marketIdWhitelist,
      invalidMarketIds: buildInvalidDemoMarketIds(marketIdWhitelist),
    })
  }

  const secondaryCapsules = [...systemCapsules, ...customCapsules].sort((left, right) => left.displayOrder - right.displayOrder)

  return {
    categories,
    rankingCategoryLabels,
    secondaryCapsules,
  }
}

function getDemoCategoryPublicMarketIdsBySlug(slug: string) {
  const meta = getDemoDiscoveryCategoryMeta(slug)
  if (!meta) {
    return []
  }

  if (meta.kind === 'custom') {
    return meta.marketIdWhitelist
  }

  return getCategoryDirectoryConfig(meta.pathname)?.marketIds ?? []
}

function getDemoAvailableCategoryMarkets(slug: string) {
  const marketIdSet = new Set(getDemoCategoryPublicMarketIdsBySlug(slug))
  return demoState.markets
    .filter((market) => marketIdSet.has(market.marketId))
    .map((market) => ({
      marketId: market.marketId,
      title: market.title,
    }))
}

function normalizeDemoCategoryConfigInput(
  input: InternalDiscoveryCategoryConfigInput,
): InternalDiscoveryCategoryConfigInput {
  return {
    sidebarItems: input.sidebarItems
      .map((item, index) => {
        const label = item.label.trim()
        if (label.length === 0) {
          return null
        }

        return {
          id: item.id.trim() || `sidebar-item-${index + 1}`,
          label,
          linkedMarketIds: dedupeDemoStrings(
            item.linkedMarketIds.map((marketId) => marketId.trim()).filter((marketId) => marketId.length > 0),
          ),
        }
      })
      .filter((item): item is InternalDiscoverySidebarItemInput => Boolean(item)),
  }
}

function resolveDemoSidebarItems(
  slug: string,
  items: InternalDiscoverySidebarItemInput[],
) {
  const validMarketIds = new Set(getDemoCategoryPublicMarketIdsBySlug(slug))
  return items.map((item) => {
    const linkedMarketIds = dedupeDemoStrings(item.linkedMarketIds)
    const invalidLinkedMarketIds = linkedMarketIds.filter((marketId) => !validMarketIds.has(marketId))
    return {
      id: item.id,
      label: item.label,
      linkedMarketIds,
      resolvedLinkedMarketCount: linkedMarketIds.filter((marketId) => validMarketIds.has(marketId)).length,
      invalidLinkedMarketIds,
    }
  })
}

function getDemoDiscoveryCategoryConfigInput(slug: string) {
  return demoState.discoveryCategoryConfigs[slug] ?? { sidebarItems: [] }
}

function buildDemoDiscoveryCategoryWarnings(slug: string) {
  return resolveDemoSidebarItems(slug, getDemoDiscoveryCategoryConfigInput(slug).sidebarItems)
    .filter((item) => item.invalidLinkedMarketIds.length > 0)
    .map((item) => `词条“${item.label}”存在 ${item.invalidLinkedMarketIds.length} 个失效或跨分类市场绑定。`)
}

function buildDemoDiscoveryCategoryConfigViewModel(
  slug: string,
): InternalDiscoveryCategoryConfigViewModel {
  const meta = getDemoDiscoveryCategoryMeta(slug)
  if (!meta) {
    throw new Error(`Unknown demo discovery category: ${slug}`)
  }

  const input = getDemoDiscoveryCategoryConfigInput(slug)

  return {
    slug: meta.slug,
    pathname: meta.pathname,
    label: meta.label,
    title: meta.title,
    directoryLabel: meta.directoryLabel,
    description: meta.description,
    configured: slug in demoState.discoveryCategoryConfigs,
    pageState: meta.pageState,
    kind: meta.kind,
    availableMarkets: getDemoAvailableCategoryMarkets(slug),
    sidebarItems: resolveDemoSidebarItems(slug, input.sidebarItems),
    warnings: buildDemoDiscoveryCategoryWarnings(slug),
  }
}

function buildDemoDiscoveryCategorySummaryList(): InternalDiscoveryCategoryConfigSummaryViewModel[] {
  return getDemoDiscoveryCategoriesSorted().map((item) => ({
    slug: item.slug,
    pathname: item.pathname,
    label: item.label,
    title: item.title,
    directoryLabel: item.directoryLabel,
    description: item.description,
    sidebarItemCount: getDemoDiscoveryCategoryConfigInput(item.slug).sidebarItems.length,
    configured: item.slug in demoState.discoveryCategoryConfigs,
    pageState: item.pageState,
    kind: item.kind,
  }))
}

function hasDemoDiscoveryConfigOverrides() {
  return JSON.stringify(demoState.discoveryGlobalConfig) !== JSON.stringify(DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG)
    || Object.keys(demoState.discoveryCategoryConfigs).length > 0
}

function mapDemoRankingCategoryId(categoryId: string) {
  switch (categoryId) {
    case 'all':
      return 'all'
    case 'dao':
      return 'dao'
    case 'politics':
      return 'politics'
    case 'sports':
      return 'sports'
    case 'tech':
      return 'tech'
    case 'culture':
      return 'culture'
    case 'crypto':
      return 'tech'
    case 'finance':
    case 'global':
    default:
      return 'general'
  }
}

function buildPublicProgress(
  propositionId: string,
  title: string,
  status: PropositionStatus,
  currentEffectiveSample: number,
  totalRequired: number,
  progressPercent: number,
  phase: PublicProgressViewModel['publicState']['phase'],
  overrides?: Partial<PublicProgressViewModel>,
): PublicProgressViewModel {
  const base: PublicProgressViewModel = {
    propositionId,
    title,
    status,
    marketEnabled: true,
    progress: {
      totalRequired,
      currentEffectiveSample,
      reviewedCount: Math.max(0, Math.round(currentEffectiveSample * 0.62)),
      progressPercent,
    },
    timing: {
      startedAt: minusDays(4),
      minDurationSeconds: 3600,
      maxDurationSeconds: 3600 * 24 * 14,
      minDurationEndsAt: minusDays(3),
      deadlineAt: plusDays(5),
      frozenAt: phase === 'frozen' || phase === 'revealing' || phase === 'settled' ? minusHours(12) : null,
      revealStartedAt: phase === 'revealing' || phase === 'settled' ? minusHours(6) : null,
      settledAt: phase === 'settled' ? minusHours(2) : null,
    },
    publicState: {
      phase,
      reachedSampleThreshold: currentEffectiveSample >= totalRequired,
      reachedMinDuration: true,
    },
    lastPublishedResult: phase === 'settled'
      ? {
          resultKind: 'resolved',
          winningOption: 0,
          voidReason: null,
          publishedAt: minusHours(2),
        }
      : null,
  }

  return {
    ...base,
    ...overrides,
    progress: {
      ...base.progress,
      ...overrides?.progress,
    },
    timing: {
      ...base.timing,
      ...overrides?.timing,
    },
    publicState: {
      ...base.publicState,
      ...overrides?.publicState,
    },
  }
}

function buildCurrentUserPosition(
  selectedOption: 0 | 1,
  stakeAmount: string,
  placedAt: string,
  overrides?: Partial<CurrentUserPositionViewModel>,
): CurrentUserPositionViewModel {
  return {
    selectedOption,
    stakeAmount,
    placedAt,
    settlementOutcome: null,
    grossPayout: null,
    pnl: null,
    refundAmount: null,
    ...overrides,
  }
}

function buildDemoMarkets(): ValidationMarketViewModel[] {
  return marketCards.map((market, index) => {
    const category = toCategory(market.categoryHref)
    const propositionId = `demo-proposition-${market.id}`
    const currentEffectiveSample = Number.parseInt(market.sampleProgressLabel.match(/(\d+)\s*\//)?.[1] ?? '0', 10)
    const totalRequired = Number.parseInt(market.sampleProgressLabel.match(/\/\s*(\d+)/)?.[1] ?? '100', 10)
    const isSettled = market.id === 'rolling-temperature'
    const isFrozen = market.id === 'regional-dialogue'
    const publicPhase = isSettled ? 'settled' : isFrozen ? 'frozen' : 'live'
    const marketStatus = isSettled ? 'settled' : isFrozen ? 'frozen_for_reveal' : 'live'
    const progress = buildPublicProgress(
      propositionId,
      market.title,
      isSettled ? 'settled' : isFrozen ? 'frozen' : 'live',
      currentEffectiveSample,
      totalRequired,
      market.sampleProgressPercent,
      publicPhase,
    )

    let currentUserPosition: CurrentUserPositionViewModel | null = null

    if (market.id === 'btc-network-fee') {
      currentUserPosition = buildCurrentUserPosition(0, '12.5', minusDays(2))
    }

    if (market.id === 'ceasefire-durability') {
      currentUserPosition = buildCurrentUserPosition(0, '8.0', minusDays(1))
    }

    if (market.id === 'regional-dialogue') {
      currentUserPosition = buildCurrentUserPosition(0, '6.5', minusDays(5), {
        settlementOutcome: 'won',
        grossPayout: '10.7',
        pnl: '4.2',
        refundAmount: null,
      })
    }

    if (market.id === 'rolling-temperature') {
      currentUserPosition = buildCurrentUserPosition(0, '5.0', minusDays(6), {
        settlementOutcome: 'lost',
        grossPayout: '0',
        pnl: '-5.0',
        refundAmount: null,
      })
    }

    return {
      marketId: market.id,
      propositionId,
      title: market.title,
      category,
      options: [market.options[0]?.label ?? 'Option A', market.options[1]?.label ?? 'Option B'],
      minBetAmount: index % 2 === 0 ? '5' : '10',
      marketStatus,
      timeProgressPercent: market.timeProgressPercent,
      bettingClosesAt: plusDays(5 - Math.min(index, 4)),
      canBet: !isSettled && !isFrozen,
      publicProgress: progress,
      currentUserPosition,
    }
  })
}

function buildDemoDrafts(): PropositionDraftRecord[] {
  return [
    {
      propositionId: 'draft-demo-dao-treasury',
      title: 'DAO 观察者是否会普遍认为，该 DAO 本季度的国库配置更偏向稳健防守而非风险扩张？',
      summary: '围绕 DAO 国库披露、资产结构变化与治理讨论，评估参与者是否会普遍认为该 DAO 本季度的国库配置更偏向稳健防守而非风险扩张，作为候选命题进入平台审核。',
      optionA: '会被视为更偏向稳健防守',
      optionB: '不会被视为更偏向稳健防守',
      category: 'dao',
      sampleConstraints: ['experienced_user', 'interested_in_dao'],
      minEffectiveSample: 5,
      minBetAmount: '10',
      minDurationSeconds: 7200,
      maxDurationSeconds: 604800,
      rewardBudget: '660',
      baseResponseReward: '22',
      marketEnabled: true,
      status: 'draft',
      submissionStatus: 'draft',
      createdAt: minusDays(3),
      updatedAt: minusHours(2),
      submittedAt: null,
    },
    {
      propositionId: 'draft-demo-consensus-window',
      title: '未来四周独立开发者是否会更偏好“研究型搜索 + 代码助手”组合工作流？',
      summary: '围绕独立开发者在高频调研、原型实现和结果复核中的真实使用路径，比较“研究型搜索 + 代码助手”组合是否会在未来四周成为更稳定的主流工作流。',
      optionA: '会更偏好该组合',
      optionB: '不会形成明显偏好',
      category: 'ai',
      sampleConstraints: ['experienced_user', 'interested_in_ai'],
      minEffectiveSample: 6,
      minBetAmount: '10',
      minDurationSeconds: 7200,
      maxDurationSeconds: 604800,
      rewardBudget: '720',
      baseResponseReward: '24',
      marketEnabled: true,
      status: 'draft',
      submissionStatus: 'submitted',
      createdAt: minusDays(5),
      updatedAt: minusHours(8),
      submittedAt: minusHours(8),
    },
    {
      propositionId: 'settled-demo-public-service',
      title: 'What is the recent public service satisfaction trend?',
      summary:
        'Track whether respondents believe recent public service satisfaction will continue improving across the next reporting window.',
      optionA: 'Will continue improving',
      optionB: 'Will not continue improving',
      category: 'politics',
      sampleConstraints: ['experienced_user', 'interested_in_politics'],
      minEffectiveSample: 10,
      minBetAmount: '10',
      minDurationSeconds: 7200,
      maxDurationSeconds: 604800,
      rewardBudget: '840',
      baseResponseReward: '28',
      marketEnabled: true,
      status: 'settled',
      submissionStatus: 'approved',
      createdAt: minusDays(14),
      updatedAt: minusDays(2),
      submittedAt: minusDays(13),
    },
    {
      propositionId: 'draft-demo-search-quality',
      title: 'Perplexity 和 ChatGPT Search 哪个更适合高频研究检索？',
      summary: '比较两款 AI 搜索产品在资料追溯、答案可验证性、搜索效率和真实工作流中的综合表现，供 Arena 候选命题审阅。',
      optionA: 'Perplexity 更适合',
      optionB: 'ChatGPT Search 更适合',
      category: 'ai',
      sampleConstraints: ['wallet_signed', 'interested_in_ai'],
      minEffectiveSample: 5,
      minBetAmount: '10',
      minDurationSeconds: 3600,
      maxDurationSeconds: 604800,
      rewardBudget: '600',
      baseResponseReward: '25',
      marketEnabled: true,
      status: 'draft',
      submissionStatus: 'draft',
      createdAt: minusDays(4),
      updatedAt: minusHours(6),
      submittedAt: null,
    },
    {
      propositionId: 'draft-demo-public-service',
      title: '下个季度公共服务响应满意度是否会继续改善？',
      summary: '基于公开服务工单与用户反馈观察，评估满意度是否会在下个季度继续改善，作为候选命题进入平台审核。',
      optionA: '会继续改善',
      optionB: '不会继续改善',
      category: 'politics',
      sampleConstraints: ['wallet_signed', 'interested_in_politics'],
      minEffectiveSample: 4,
      minBetAmount: '10',
      minDurationSeconds: 7200,
      maxDurationSeconds: 604800,
      rewardBudget: '480',
      baseResponseReward: '20',
      marketEnabled: true,
      status: 'draft',
      submissionStatus: 'draft',
      createdAt: minusDays(2),
      updatedAt: minusHours(3),
      submittedAt: null,
    },
  ]
}

function buildDemoRewards(): RespondentRewardLedgerViewModel[] {
  return [
    {
      ledgerId: 'reward-demo-1',
      propositionId: 'demo-proposition-regional-dialogue',
      propositionTitle: '区域外交会谈是否会在公开窗口内形成可验证结果？',
      responseId: 'response-demo-1',
      sourceType: 'response',
      status: 'finalized',
      pendingAmount: '0',
      finalAmount: '42',
      reasonCode: 'review_valid',
      isCurrent: true,
      createdAt: minusDays(3),
      finalizedAt: minusDays(2),
      voidedAt: null,
      reversedAt: null,
      ledgerVersion: 1,
      reviewStatus: 'valid',
      payoutStatus: 'completed',
      payoutMethod: 'wallet_transfer',
      payoutAmount: '42',
      payoutAssetSymbol: 'USDC',
      payoutDestinationAddress: '0xRewardDemo000000000000000000000000000001',
      payoutRequestedAt: minusDays(2),
      payoutCompletedAt: minusDays(2),
      payoutFailureReason: null,
    },
    {
      ledgerId: 'reward-demo-2',
      propositionId: 'demo-proposition-public-trust',
      propositionTitle: '公众是否认为本季度公共服务响应速度有所改善？',
      responseId: 'response-demo-2',
      sourceType: 'response',
      status: 'pending',
      pendingAmount: '18',
      finalAmount: null,
      reasonCode: 'review_partial_valid',
      isCurrent: true,
      createdAt: minusHours(20),
      finalizedAt: null,
      voidedAt: null,
      reversedAt: null,
      ledgerVersion: 1,
      reviewStatus: 'pending_review',
      payoutStatus: null,
      payoutMethod: null,
      payoutAmount: null,
      payoutAssetSymbol: null,
      payoutDestinationAddress: null,
      payoutRequestedAt: null,
      payoutCompletedAt: null,
      payoutFailureReason: null,
    },
  ]
}

function buildDemoReputation(): RespondentReputationSummaryViewModel {
  return {
    reputationScore: 82,
    reputationLevel: 'trusted',
    metrics: {
      completionRate: 0.93,
      validRate: 0.74,
      partialValidRate: 0.18,
      invalidRate: 0.06,
      anomalyRate: 0.02,
      fraudFlagCount: 0,
      reviewedResponseCount: 48,
    },
    computedAt: minusHours(2),
  }
}

function buildDemoTags(): RespondentTagSummaryViewModel {
  return {
    tags: [
      {
        tagKey: 'ai_research',
        tagType: 'interest',
        confidenceScore: 0.92,
        activatedAt: minusDays(10),
      },
      {
        tagKey: 'high_signal_reviewer',
        tagType: 'quality_reputation',
        confidenceScore: 0.88,
        activatedAt: minusDays(7),
      },
    ],
  }
}

function buildDemoResultOverview(markets: ValidationMarketViewModel[]): RespondentResultOverviewViewModel {
  return {
    settledResults: {
      totals: {
        settledCount: 2,
        resolvedCount: 2,
        voidCount: 0,
        wonCount: 1,
        lostCount: 1,
        refundCount: 0,
        finalizedRewardAmount: '42',
        pendingRewardAmount: '18',
        totalStakeAmount: '11.5',
        totalGrossPayout: '10.7',
        totalPnl: '-0.8',
        totalRefundAmount: '0',
      },
      items: [
        {
          propositionId: 'demo-proposition-regional-dialogue',
          propositionTitle: '区域外交会谈是否会在公开窗口内形成可验证结果？',
          category: 'general',
          marketId: 'regional-dialogue',
          resultKind: 'resolved',
          winningOption: 0,
          voidReason: null,
          settledAt: minusDays(2),
          currentUserRewardStatus: 'finalized',
          currentUserRewardAmount: '42',
          currentUserSettlementOutcome: 'won',
          currentUserStakeAmount: '6.5',
          currentUserGrossPayout: '10.7',
          currentUserPnl: '4.2',
          currentUserRefundAmount: null,
        },
        {
          propositionId: 'demo-proposition-rolling-temperature',
          propositionTitle: '城市日温度滚动命题的上一期公开结果复核',
          category: 'general',
          marketId: 'rolling-temperature',
          resultKind: 'resolved',
          winningOption: 1,
          voidReason: null,
          settledAt: minusDays(1),
          currentUserRewardStatus: null,
          currentUserRewardAmount: null,
          currentUserSettlementOutcome: 'lost',
          currentUserStakeAmount: '5.0',
          currentUserGrossPayout: '0',
          currentUserPnl: '-5.0',
          currentUserRefundAmount: null,
        },
      ],
    },
    openPositions: {
      totalCount: 2,
      totalStakeAmount: '20.5',
      items: markets
        .filter((market) => market.currentUserPosition && market.marketStatus !== 'settled')
        .map((market) => ({
          propositionId: market.propositionId,
          propositionTitle: market.title,
          category: market.category,
          marketId: market.marketId,
          marketStatus: market.marketStatus,
          selectedOption: market.currentUserPosition?.selectedOption ?? 0,
          selectedOptionLabel: market.options[market.currentUserPosition?.selectedOption ?? 0],
          stakeAmount: market.currentUserPosition?.stakeAmount ?? '0',
          placedAt: market.currentUserPosition?.placedAt ?? minusDays(1),
          currentPublicPhase: market.publicProgress.publicState.phase,
          publicResult: market.publicProgress.lastPublishedResult,
        })),
      categoryExposure: [
        { category: 'general', positionCount: 1, totalStakeAmount: '8.0' },
        { category: 'ai', positionCount: 1, totalStakeAmount: '12.5' },
      ],
    },
    recentActivity: [
      {
        activityType: 'reward_pending',
        propositionId: 'demo-proposition-public-trust',
        propositionTitle: '公众是否认为本季度公共服务响应速度有所改善？',
        category: 'politics',
        occurredAt: minusHours(18),
        amount: '18',
        direction: 'positive',
        detail: '最新一轮审核已进入待结算奖励队列',
      },
      {
        activityType: 'position_opened',
        propositionId: 'demo-proposition-btc-network-fee',
        propositionTitle: '比特币网络手续费是否会在本月维持高拥堵状态？',
        category: 'ai',
        occurredAt: minusDays(2),
        amount: '12.5',
        direction: 'neutral',
        detail: '新增验证市场仓位，等待公开窗口结果',
      },
      {
        activityType: 'reward_finalized',
        propositionId: 'demo-proposition-regional-dialogue',
        propositionTitle: '区域外交会谈是否会在公开窗口内形成可验证结果？',
        category: 'general',
        occurredAt: minusDays(2),
        amount: '42',
        direction: 'positive',
        detail: '裁决回答通过审核并完成奖励结算',
      },
      {
        activityType: 'result_settled',
        propositionId: 'demo-proposition-rolling-temperature',
        propositionTitle: '城市日温度滚动命题的上一期公开结果复核',
        category: 'general',
        occurredAt: minusDays(1),
        amount: '-5',
        direction: 'negative',
        detail: '公开结果归档，上一期仓位完成结算',
      },
    ],
    summary: {
      trackedEntryCount: 4,
      settledSharePercent: 50,
      openPositionSharePercent: 50,
      latestActivityAt: minusHours(18),
      latestActivityTitle: '最新奖励待结算',
      largestExposure: {
        category: 'ai',
        positionCount: 1,
        totalStakeAmount: '12.5',
        sharePercent: 61,
      },
    },
    performance: {
      trackedSettledPnlCount: 2,
      positiveSettledPnlCount: 1,
      negativeSettledPnlCount: 1,
      flatSettledPnlCount: 0,
      positiveSettledPnlRate: 0.5,
      averageSettledPnlAmount: '-0.4',
      bestSettledPnl: {
        propositionId: 'demo-proposition-regional-dialogue',
        propositionTitle: '区域外交会谈是否会在公开窗口内形成可验证结果？',
        settledAt: minusDays(2),
        amount: '4.2',
      },
      worstSettledPnl: {
        propositionId: 'demo-proposition-rolling-temperature',
        propositionTitle: '城市日温度滚动命题的上一期公开结果复核',
        settledAt: minusDays(1),
        amount: '-5.0',
      },
    },
    analytics: {
      assetBreakdown: {
        trackedAmount: '73.2',
        settledGrossPayoutAmount: '10.7',
        openStakeAmount: '20.5',
        rewardAmount: '60',
        finalizedRewardAmount: '42',
        pendingRewardAmount: '18',
        settledGrossPayoutSharePercent: 15,
        openStakeSharePercent: 28,
        rewardSharePercent: 57,
      },
      positionStructure: {
        totalCount: 2,
        longCount: 2,
        shortCount: 0,
        scheduledCount: 0,
        liveCount: 1,
        frozenCount: 1,
        revealingCount: 0,
        longSharePercent: 100,
        shortSharePercent: 0,
        scheduledSharePercent: 0,
        liveSharePercent: 50,
        frozenSharePercent: 50,
        revealingSharePercent: 0,
      },
      settlementDistribution: {
        trackedSettledPnlCount: 2,
        positiveCount: 1,
        negativeCount: 1,
        flatCount: 0,
        positiveSharePercent: 50,
        negativeSharePercent: 50,
        flatSharePercent: 0,
      },
    },
  }
}

function buildDemoOverview(markets: ValidationMarketViewModel[], rewards: RespondentRewardLedgerViewModel[]): RespondentAccountOverviewViewModel {
  const rewardSummary = {
    currentCount: rewards.filter((reward) => reward.isCurrent).length,
    pendingAmount: rewards
      .filter((reward) => reward.status === 'pending')
      .reduce((sum, reward) => sum + Number(reward.pendingAmount), 0)
      .toFixed(2),
    finalizedAmount: rewards
      .filter((reward) => reward.status === 'finalized')
      .reduce((sum, reward) => sum + Number(reward.finalAmount ?? '0'), 0)
      .toFixed(2),
  }

  return {
    rewards,
    rewardSummary,
    reputation: buildDemoReputation(),
    tags: buildDemoTags(),
    resultOverview: buildDemoResultOverview(markets),
  }
}

function buildDemoPreferences(): RespondentAccountPreferencesViewModel {
  return {
    ...structuredClone(DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES),
    wallet: {
      ...structuredClone(DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES.wallet),
      walletConnected: true,
    },
    developer: {
      ...structuredClone(DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES.developer),
      keyCreated: true,
      codeEnabled: true,
    },
    updatedAt: minusHours(4),
  }
}

function buildDemoWatchlist(markets: ValidationMarketViewModel[]): RespondentWatchlistViewModel {
  const ids = ['public-trust', 'btc-network-fee', 'regional-dialogue']
  const items = ids
    .map((marketId, index) => markets.find((market) => market.marketId === marketId))
    .filter((market): market is ValidationMarketViewModel => Boolean(market))
    .map((market, index) => ({
      marketId: market.marketId,
      propositionId: market.propositionId,
      propositionTitle: market.title,
      category: market.category,
      savedAt: minusDays(index + 1),
    }))

  return {
    totalCount: items.length,
    items,
  }
}

function buildDemoTasks(markets: ValidationMarketViewModel[]): AdjudicationTaskViewModel[] {
  const marketIndex = new Map(markets.map((market) => [market.marketId, market]))
  const toBinaryOptions = (options: string[]): [string, string] => [
    options[0] ?? 'Option A',
    options[1] ?? 'Option B',
  ]

  const requireMarket = (marketId: string) => {
    const market = marketIndex.get(marketId)
    if (!market) {
      throw new Error(`Demo market ${marketId} not found`)
    }

    return market
  }

  const buildTask = (task: {
    taskId: string
    propositionId: string
    title: string
    description: string
    options: [string, string]
    propositionStatus: PropositionStatus
    taskStatus: AdjudicationTaskViewModel['taskStatus']
    assignedAt: string
    startedAt: string | null
    expiresAt: string
    submittedAt: string | null
    hasSubmitted: boolean
    timeRemainingSeconds: number
    latestResponseStatus: AdjudicationTaskViewModel['latestResponseStatus']
    rewardStatus: AdjudicationTaskViewModel['rewardStatus']
    rewardPendingAmount: string | null
    rewardFinalAmount: string | null
    publicProgress: PublicProgressViewModel
  }): AdjudicationTaskViewModel => ({
    ...task,
    skipReason: null,
    expiryReason: null,
    cooldownUntil: null,
  })

  const buildMarketTask = (
    taskId: string,
    marketId: string,
    task: Omit<
      Parameters<typeof buildTask>[0],
      'taskId' | 'propositionId' | 'title' | 'options' | 'propositionStatus' | 'publicProgress'
    >,
  ) => {
    const market = requireMarket(marketId)

    return buildTask({
      taskId,
      propositionId: market.propositionId,
      title: market.title,
      options: toBinaryOptions(market.options),
      propositionStatus: market.publicProgress.status,
      publicProgress: market.publicProgress,
      ...task,
    })
  }

  const buildSyntheticTask = (task: {
    taskId: string
    title: string
    description: string
    options: [string, string]
    currentEffectiveSample: number
    totalRequired: number
    progressPercent: number
    taskStatus: AdjudicationTaskViewModel['taskStatus']
    assignedAt: string
    startedAt: string | null
    expiresAt: string
    submittedAt: string | null
    hasSubmitted: boolean
    timeRemainingSeconds: number
    latestResponseStatus: AdjudicationTaskViewModel['latestResponseStatus']
    rewardStatus: AdjudicationTaskViewModel['rewardStatus']
    rewardPendingAmount: string | null
    rewardFinalAmount: string | null
  }) => {
    const propositionId = `demo-proposition-${task.taskId}`

    return buildTask({
      taskId: task.taskId,
      propositionId,
      title: task.title,
      description: task.description,
      options: task.options,
      propositionStatus: 'live',
      taskStatus: task.taskStatus,
      assignedAt: task.assignedAt,
      startedAt: task.startedAt,
      expiresAt: task.expiresAt,
      submittedAt: task.submittedAt,
      hasSubmitted: task.hasSubmitted,
      timeRemainingSeconds: task.timeRemainingSeconds,
      latestResponseStatus: task.latestResponseStatus,
      rewardStatus: task.rewardStatus,
      rewardPendingAmount: task.rewardPendingAmount,
      rewardFinalAmount: task.rewardFinalAmount,
      publicProgress: buildPublicProgress(
        propositionId,
        task.title,
        'live',
        task.currentEffectiveSample,
        task.totalRequired,
        task.progressPercent,
        'live',
      ),
    })
  }

  return [
    buildMarketTask('demo-task-1', 'public-trust', {
      description: '请基于公开样本与材料判断哪一侧更接近当前可验证共识。',
      taskStatus: 'assigned',
      assignedAt: minusHours(1),
      startedAt: null,
      expiresAt: plusHours(8),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 8 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: 'pending',
      rewardPendingAmount: '12',
      rewardFinalAmount: null,
    }),
    buildMarketTask('demo-task-2', 'ai-model-review', {
      description: '二选一判断当前公开样本更支持哪一边。',
      taskStatus: 'started',
      assignedAt: minusHours(2),
      startedAt: minusMinutes(45),
      expiresAt: plusHours(15),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 15 * 60 * 60,
      latestResponseStatus: 'pending_review',
      rewardStatus: null,
      rewardPendingAmount: '10',
      rewardFinalAmount: null,
    }),
    buildMarketTask('demo-task-4', 'btc-network-fee', {
      description: '请根据公开链上迹象判断本月拥堵状态是否仍会持续。',
      taskStatus: 'assigned',
      assignedAt: minusHours(3),
      startedAt: null,
      expiresAt: plusHours(16),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 16 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: 'pending',
      rewardPendingAmount: '9',
      rewardFinalAmount: null,
    }),
    buildMarketTask('demo-task-5', 'ceasefire-durability', {
      description: '围绕停火观察期内的公开证据，判断哪一侧更接近当前共识。',
      taskStatus: 'started',
      assignedAt: minusHours(4),
      startedAt: minusMinutes(90),
      expiresAt: plusHours(18),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 18 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: null,
      rewardPendingAmount: '11',
      rewardFinalAmount: null,
    }),
    buildMarketTask('demo-task-6', 'nba-final-consensus', {
      description: '请基于最新公开样本判断赛前共识更偏向哪一边。',
      taskStatus: 'assigned',
      assignedAt: minusHours(5),
      startedAt: null,
      expiresAt: plusHours(20),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 20 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: 'pending',
      rewardPendingAmount: '8',
      rewardFinalAmount: null,
    }),
    buildMarketTask('demo-task-7', 'f1-season-result', {
      description: '结合赛季公开动态，判断哪一项结果更接近可验证结论。',
      taskStatus: 'started',
      assignedAt: minusHours(6),
      startedAt: minusMinutes(120),
      expiresAt: plusHours(22),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 22 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: null,
      rewardPendingAmount: '7',
      rewardFinalAmount: null,
    }),
    buildSyntheticTask({
      taskId: 'demo-task-8',
      title: '企业是否会在本季度扩大私有 AI 助手采购预算？',
      description: '根据公开采购信号与团队反馈，判断预算是否会继续扩大。',
      options: ['会扩大采购预算', '不会扩大采购预算'],
      currentEffectiveSample: 292,
      totalRequired: 520,
      progressPercent: 56,
      taskStatus: 'assigned',
      assignedAt: minusHours(7),
      startedAt: null,
      expiresAt: plusHours(24),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 24 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: 'pending',
      rewardPendingAmount: '9',
      rewardFinalAmount: null,
    }),
    buildSyntheticTask({
      taskId: 'demo-task-9',
      title: '城市夜间出行安全感是否会在本月出现可验证改善？',
      description: '请结合公开样本与事件记录判断改善是否已经形成稳定趋势。',
      options: ['会出现明显改善', '不会出现明显改善'],
      currentEffectiveSample: 344,
      totalRequired: 600,
      progressPercent: 57,
      taskStatus: 'started',
      assignedAt: minusHours(8),
      startedAt: minusMinutes(150),
      expiresAt: plusHours(26),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 26 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: null,
      rewardPendingAmount: '10',
      rewardFinalAmount: null,
    }),
    buildSyntheticTask({
      taskId: 'demo-task-10',
      title: '跨境电商卖家是否认为本月物流时效明显修复？',
      description: '基于公开物流反馈和交付时延样本，判断修复是否已经被验证。',
      options: ['明显修复', '未明显修复'],
      currentEffectiveSample: 251,
      totalRequired: 540,
      progressPercent: 46,
      taskStatus: 'assigned',
      assignedAt: minusHours(9),
      startedAt: null,
      expiresAt: plusHours(28),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 28 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: 'pending',
      rewardPendingAmount: '8',
      rewardFinalAmount: null,
    }),
    buildSyntheticTask({
      taskId: 'demo-task-11',
      title: '开发者是否会在未来两周提高对 AI 代码审查代理的使用频率？',
      description: '请根据公开使用反馈判断代码审查代理是否正进入更高频使用阶段。',
      options: ['会提高使用频率', '不会提高使用频率'],
      currentEffectiveSample: 412,
      totalRequired: 620,
      progressPercent: 66,
      taskStatus: 'started',
      assignedAt: minusHours(10),
      startedAt: minusMinutes(180),
      expiresAt: plusHours(30),
      submittedAt: null,
      hasSubmitted: false,
      timeRemainingSeconds: 30 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: null,
      rewardPendingAmount: '11',
      rewardFinalAmount: null,
    }),
    buildMarketTask('demo-task-3', 'ceasefire-durability', {
      description: '该任务已提交，等待奖励决议。',
      taskStatus: 'submitted',
      assignedAt: minusHours(6),
      startedAt: minusHours(5),
      expiresAt: plusHours(2),
      submittedAt: minusHours(3),
      hasSubmitted: true,
      timeRemainingSeconds: 2 * 60 * 60,
      latestResponseStatus: 'valid',
      rewardStatus: 'finalized',
      rewardPendingAmount: '0',
      rewardFinalAmount: '16',
    }),
  ]
}

function buildDemoExports(): RespondentAccountExportListViewModel {
  return {
    totalCount: 1,
    items: [
      {
        exportId: 'demo-export-1',
        status: 'completed',
        format: 'json',
        period: '30d',
        includeSettlementAttachment: true,
        maskWalletAddress: true,
        requestedAt: minusDays(1),
        completedAt: minusDays(1),
        fileName: 'arena-demo-export-2026-05-07.json',
        metrics: {
          rewardCount: 2,
          settledResultCount: 2,
          openPositionCount: 2,
        },
      },
    ],
  }
}

function buildDemoExportArtifact(
  overview: RespondentAccountOverviewViewModel,
  preferences: RespondentAccountPreferencesViewModel,
  exportList: RespondentAccountExportListViewModel,
): RespondentAccountExportArtifactViewModel {
  const latest = exportList.items[0]!

  return {
    exportId: latest.exportId,
    status: latest.status,
    format: latest.format,
    period: latest.period,
    includeSettlementAttachment: latest.includeSettlementAttachment,
    maskWalletAddress: latest.maskWalletAddress,
    requestedAt: latest.requestedAt,
    completedAt: latest.completedAt,
    fileName: latest.fileName,
    walletAddress: DEMO_WALLET_ADDRESS,
    overview,
    preferences,
    settlementAttachment: {
      generatedAt: latest.completedAt,
      settledResultCount: 2,
      openPositionCount: 2,
      recentActivityCount: 4,
    },
  }
}

function buildDemoDiscoveryHome(markets: ValidationMarketViewModel[]): PublicDiscoverPageViewModel {
  const hotFeaturedMarketIds = Array.from(new Set(
    HOT_PAGE_CONFIG.items
      .map((item) => item.href.startsWith('/zh/event/') ? item.href.replace('/zh/event/', '') : null)
      .filter((marketId): marketId is string => Boolean(marketId)),
  )).slice(0, 10)
  const categorySections = getDemoVisibleDiscoveryCategoriesSorted().map((category) => ({
    href: category.pathname,
    label: category.label,
    marketIds: getCategoryDirectoryConfig(category.pathname)?.marketIds ?? [],
    moreHref: category.pathname,
  }))
  const topSections: PublicDiscoverPageViewModel['sections'] = DISCOVER_PAGE_SECTION_PATHS
    .filter((pathname) => pathname === '/zh' || pathname === '/zh/breaking' || pathname === '/zh/new')
    .map((pathname) => {
      const navItem = navItems.find((item) => item.href === pathname)
      const config = pathname === '/zh'
        ? { marketIds: HOT_PAGE_CONFIG.items.map((item) => item.href.replace('/zh/event/', '')).slice(0, 4), moreHref: '/zh/markets' }
        : pathname === '/zh/breaking'
          ? { marketIds: BREAKING_PAGE_CONFIG.items.map((item) => item.href.replace('/zh/event/', '')).slice(0, 4), moreHref: '/zh/breaking' }
          : pathname === '/zh/new'
            ? { marketIds: markets.map((market) => market.marketId), moreHref: '/zh/new' }
            : { marketIds: markets.slice(0, 4).map((market) => market.marketId), moreHref: '/zh/markets' }

      return {
        label: navItem?.label ?? pathname,
        href: pathname,
        marketIds: config.marketIds,
        moreHref: config.moreHref,
      }
    })

  return {
    featuredMarketIds: hotFeaturedMarketIds,
    sections: [...topSections, ...categorySections],
  }
}

function buildDemoRanking(kind: 'hot' | 'breaking'): PublicDiscoveryRankingViewModel {
  const config = kind === 'hot' ? HOT_PAGE_CONFIG : BREAKING_PAGE_CONFIG
  const globalConfig = getDemoDiscoveryGlobalConfigState()
  const rankingLabels = globalConfig.rankingCategoryLabels
  const validRankingMarketIds = new Set(config.items.map((item) => item.id))

  // Build categories from server-driven secondary capsules. Visible capsules only.
  // System capsules: derive from base ranking ids (existing categoryId-based filter).
  // Custom capsules: include explicit marketIds for the page to filter by intersection.
  const visibleCapsules = [...globalConfig.secondaryCapsules]
    .filter((capsule) => capsule.pageState === 'visible')
    .sort((left, right) => left.displayOrder - right.displayOrder)

  const categories = visibleCapsules
    .map((capsule) => {
      if (capsule.kind === 'custom') {
        const marketIds = capsule.marketIdWhitelist.filter((marketId) => validRankingMarketIds.has(marketId))
        return {
          id: capsule.id,
          label: capsule.label,
          marketIds,
        }
      }

      // System capsule: only include when at least one item maps into its base ranking id
      // (or it is the special 'all' bucket).
      const baseId = capsule.baseRankingId
      if (!baseId) {
        return null
      }
      if (baseId !== 'all' && !config.items.some((item) => item.categoryIds.some((itemCategoryId) => mapDemoRankingCategoryId(itemCategoryId) === baseId))) {
        return null
      }
      return {
        id: baseId,
        label: capsule.label || rankingLabels[baseId],
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  return {
    pageClassName: config.pageClassName,
    heroVariant: kind,
    dateLabel: config.dateLabel,
    title: config.title,
    description: config.description,
    categoryAriaLabel: config.categoryAriaLabel,
    listAriaLabel: config.listAriaLabel,
    categories,
    items: config.items.map((item, index) => ({
      id: item.id,
      href: item.href,
      title: item.title,
      rank: index + 1,
      score: item.score,
      change: item.change,
      imageSrc: item.imageSrc ?? null,
      imageAlt: item.imageAlt ?? null,
      tileLabel: item.tileLabel ?? null,
      tileTone: item.tileTone ?? null,
      sparkline: item.sparkline,
      isVerified: item.isVerified ?? false,
      categoryIds: dedupeDemoStrings(item.categoryIds.map(mapDemoRankingCategoryId).filter((categoryId) => categoryId !== 'all')),
    })),
  }
}

function buildDemoLatestTopics(): PublicLatestTopicsViewModel {
  return {
    items: LATEST_TOPIC_ITEMS.map((item) => ({
      id: item.id,
      label: item.label,
      marketIds: item.marketIds,
    })),
  }
}

function buildDemoClosingSoon(markets: ValidationMarketViewModel[]): PublicClosingSoonViewModel {
  const referenceNowMs = Date.parse(DEMO_NOW)
  const orderedItems = markets
    .filter((market) => market.publicProgress.publicState.phase !== 'settled')
    .map((market) => {
      const revealAt =
        market.publicProgress.timing.deadlineAt
        ?? market.publicProgress.timing.minDurationEndsAt
        ?? market.bettingClosesAt
        ?? null

      if (!revealAt) {
        return null
      }

      const revealAtMs = Date.parse(revealAt)
      if (Number.isNaN(revealAtMs)) {
        return null
      }

      const differenceMs = revealAtMs - referenceNowMs
      if (differenceMs <= 0) {
        return null
      }

      return {
        marketId: market.marketId,
        revealAt,
        differenceMs,
      }
    })
    .filter((item): item is PublicClosingSoonViewModel['urgent'][number] => item !== null)
    .sort((left, right) => left.differenceMs - right.differenceMs)

  return {
    generatedAt: DEMO_NOW,
    urgentWindowMs: DEMO_CLOSING_SOON_URGENT_WINDOW_MS,
    urgent: orderedItems.filter((item) => item.differenceMs <= DEMO_CLOSING_SOON_URGENT_WINDOW_MS),
    upcoming: orderedItems
      .filter((item) => item.differenceMs > DEMO_CLOSING_SOON_URGENT_WINDOW_MS)
      .slice(0, 6),
  }
}

function buildDemoCategoryDirectory(slug: string): PublicCategoryDirectoryViewModel | null {
  const meta = getDemoDiscoveryCategoryMeta(slug)

  if (!meta || meta.pageState !== 'visible') {
    return null
  }

  const validMarketIds = new Set(getDemoCategoryPublicMarketIdsBySlug(slug))

  // Custom directories: marketIds come straight from the whitelist; no
  // category-directory-mock fallback because there is no static mock.
  if (meta.kind === 'custom') {
    const marketIds = meta.marketIdWhitelist.filter((marketId) => validMarketIds.has(marketId))
    const sidebarItems = slug in demoState.discoveryCategoryConfigs
      ? resolveDemoSidebarItems(slug, getDemoDiscoveryCategoryConfigInput(slug).sidebarItems).map((item) => ({
          label: item.label,
          count: String(item.resolvedLinkedMarketCount),
          marketIds: item.linkedMarketIds.filter((marketId) => validMarketIds.has(marketId)),
        }))
      : []

    return {
      title: meta.title,
      featuredMarketId: marketIds[0] ?? null,
      marketIds,
      sidebarItems,
    }
  }

  const config = getCategoryDirectoryConfig(meta.pathname)
  if (!config) {
    return null
  }

  return {
    title: meta.title ?? config.title,
    featuredMarketId: config.featuredMarketId,
    marketIds: config.marketIds,
    sidebarItems: slug in demoState.discoveryCategoryConfigs
      ? resolveDemoSidebarItems(slug, getDemoDiscoveryCategoryConfigInput(slug).sidebarItems).map((item) => ({
          label: item.label,
          count: String(item.resolvedLinkedMarketCount),
          marketIds: item.linkedMarketIds.filter((marketId) => validMarketIds.has(marketId)),
        }))
      : config.sidebarItems.map((item) => ({
          label: item.label,
          count: item.count,
        })),
  }
}

function buildDemoCategoryDirectoryIndex(): PublicCategoryDirectoryIndexViewModel {
  return {
    items: getDemoVisibleDiscoveryCategoriesSorted().map((item) => ({
      slug: item.slug,
      pathname: item.pathname,
      label: item.label,
      title: item.title,
      directoryLabel: item.directoryLabel,
      description: item.description,
    })),
  }
}

function createInitialState(): DemoState {
  const identity = buildDemoIdentity(DEMO_CHAIN_ID)
  const markets = buildDemoMarkets()
  const rewards = buildDemoRewards()
  const preferences = buildDemoPreferences()
  const watchlist = buildDemoWatchlist(markets)
  const tasks = buildDemoTasks(markets)
  const exports = buildDemoExports()
  const overview = buildDemoOverview(markets, rewards)
  const latestExport = buildDemoExportArtifact(overview, preferences, exports)
  const discussionThreads = Object.fromEntries(
    markets.map((market) => [
      market.marketId,
      {
        marketId: market.marketId,
        propositionId: market.propositionId,
        availability: 'demo' as const,
        totalCount: DEMO_DISCUSSION_COMMENTS.length,
        comments: DEMO_DISCUSSION_COMMENTS.map((comment) => ({
          id: comment.id,
          marketId: market.marketId,
          propositionId: market.propositionId,
          author: comment.author,
          handle: comment.handle,
          tone: comment.tone,
          timeLabel: comment.timeLabel,
          minutesAgo: comment.minutesAgo,
          optionIndex:
            comment.optionIndex === 0 || comment.optionIndex === 1
              ? comment.optionIndex
              : null,
          body: comment.body,
          likes: comment.likes,
          replyCount: comment.replyCount,
          repliesPreview: comment.repliesPreview ?? [],
          createdAt: minusHours(1),
        })),
      } satisfies ArenaDiscussionThreadViewModel,
    ]),
  )
  const requesterComparisonExports = [
    buildDemoRequesterComparisonExport('comparison-set-demo-core', {
      exportId: 'comparison-export-demo-core',
      requestedAt: minusHours(22),
      completedAt: minusHours(22),
      origin: {
        type: 'delivery_policy_manual',
        policyId: 'delivery-policy-demo-daily',
        policyName: 'Daily settled delivery',
      },
    }),
  ]

  return {
    identity,
    markets,
    drafts: buildDemoDrafts(),
    requesterExports: [],
    requesterComparisonExports,
    requesterComparisonDeliveryPolicies: buildDemoRequesterComparisonDeliveryPolicies(),
    requesterComparisonDeliveryRuns: buildDemoRequesterComparisonDeliveryRuns(),
    requesterComparisonDeliveryHealthReadCount: 0,
    tasks,
    watchlist,
    preferences,
    rewards,
    reputation: buildDemoReputation(),
    tags: buildDemoTags(),
    exports,
    latestExport,
    discussionThreads,
    discoveryGlobalConfig: structuredClone(DEFAULT_DEMO_DISCOVERY_GLOBAL_CONFIG),
    discoveryCategoryConfigs: {},
  }
}

let demoState = createInitialState()

// In-memory stores for the recently added requester CRUD endpoints (B5/B6).
// Reset by demoBackend.reset() so live tests start clean.
function buildInitialDemoRequesterReportPresets(): Map<string, RequesterReportPresetViewModel> {
  return new Map<string, RequesterReportPresetViewModel>([
    [
      'preset-demo-settled',
      {
        presetId: 'preset-demo-settled',
        name: 'Settled only',
        description: 'Only settled requester propositions with completed reports.',
        config: {
          windowDays: 30,
          categories: [],
          marketEnabledOnly: false,
          statusScope: 'settled',
          defaultExportFormat: 'json',
        },
        createdAt: minusHours(8),
        updatedAt: minusHours(4),
      },
    ],
    [
      'preset-demo-unresolved',
      {
        presetId: 'preset-demo-unresolved',
        name: 'Unresolved watchlist',
        description: 'Requester propositions still moving through review and settlement.',
        config: {
          windowDays: 14,
          categories: [],
          marketEnabledOnly: true,
          statusScope: 'unresolved',
          defaultExportFormat: 'csv',
        },
        createdAt: minusHours(8),
        updatedAt: minusHours(2),
      },
    ],
  ])
}

function buildInitialDemoRequesterComparisonSets(): Map<string, RequesterComparisonSetViewModel> {
  return new Map<string, RequesterComparisonSetViewModel>([
    [
      'comparison-set-demo-core',
      {
        comparisonSetId: 'comparison-set-demo-core',
        name: 'Core requester mix',
        description: 'Saved comparison between settled and unresolved requester cohorts.',
        presetIds: ['preset-demo-settled', 'preset-demo-unresolved'],
        createdAt: minusHours(2),
        updatedAt: minusHours(1),
      },
    ],
  ])
}

let demoRequesterReportPresets = buildInitialDemoRequesterReportPresets()
let demoRequesterReportPresetCounter = 1
let demoRequesterComparisonSets = buildInitialDemoRequesterComparisonSets()
let demoRequesterComparisonSetCounter = 1

function getOverview() {
  return buildDemoOverview(demoState.markets, demoState.rewards)
}

function buildRequesterOverview(
  drafts: PropositionDraftRecord[],
): RequesterOwnedPropositionOverviewRecord {
  const submittedDrafts = drafts.filter((draft) => draft.submissionStatus === 'submitted')
  const budgetSummaries = drafts.map((draft) => buildDemoBudgetSummary(draft))
  const recent = [...drafts]
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        || Date.parse(right.createdAt) - Date.parse(left.createdAt),
    )
    .slice(0, 5)
    .map((draft) => ({
      propositionId: draft.propositionId,
      title: draft.title,
      category: draft.category,
      status: draft.status,
      submissionStatus: draft.submissionStatus as RequesterPropositionSubmissionStatus,
      submittedAt: draft.submittedAt,
      marketEnabled: draft.marketEnabled,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      publishedAt: draft.status === 'settled' ? minusDays(10) : null,
      liveAt: draft.status === 'settled' ? minusDays(9) : null,
      frozenAt: draft.status === 'settled' ? minusDays(3) : null,
      settledAt: draft.status === 'settled' ? minusDays(2) : null,
      minEffectiveSample: draft.minEffectiveSample,
      effectiveSampleCount: draft.status === 'settled' ? 12 : 0,
      reviewedResponseCount: draft.status === 'settled' ? 12 : 0,
      revealSettlement: {
        resultKind: draft.status === 'settled' ? ('resolved' as const) : null,
        winningOption: draft.status === 'settled' ? (0 as const) : null,
      },
    }))

  return {
    totals: {
      totalCount: drafts.length,
      draftCount: drafts.filter((draft) => draft.submissionStatus === 'draft').length,
      scheduledCount: 0,
      liveCount: 0,
      revealingCount: 0,
      settledCount: drafts.filter((draft) => draft.status === 'settled').length,
      archivedCount: 0,
      unresolvedCount: drafts.filter((draft) => draft.status !== 'settled').length,
    },
    submissionSummary: {
      draftCount: drafts.filter((draft) => draft.submissionStatus === 'draft').length,
      submittedCount: submittedDrafts.length,
      approvedCount: drafts.filter((draft) => draft.submissionStatus === 'approved').length,
      rejectedCount: 0,
      withdrawnCount: 0,
      archivedCount: 0,
    },
    sampleSummary: {
      totalEffectiveSampleCount: drafts.reduce(
        (total, draft) => total + (draft.status === 'settled' ? 12 : 0),
        0,
      ),
      readyToFreezeCount: 0,
      unresolvedAboveMinSampleCount: 0,
    },
    resultSummary: {
      settledResolvedCount: drafts.filter((draft) => draft.status === 'settled').length,
      settledVoidCount: 0,
      unresolvedHiddenCount: drafts.filter((draft) => draft.status !== 'settled').length,
      latestSettled: {
        propositionId: 'settled-demo-public-service',
        resultKind: 'resolved',
        winningOption: 0,
        settledAt: minusDays(2),
      },
    },
    marketSummary: {
      enabledCount: drafts.filter((draft) => draft.marketEnabled).length,
      liveOrRevealingCount: 0,
      awaitingSettlementCount: 0,
    },
    budgetSummary: {
      configuredAmount: budgetSummaries
        .reduce((total, summary) => total + BigInt(summary.configuredAmount), 0n)
        .toString(),
      reservedAmount: budgetSummaries
        .reduce((total, summary) => total + BigInt(summary.reservedAmount), 0n)
        .toString(),
      spentAmount: budgetSummaries
        .reduce((total, summary) => total + BigInt(summary.spentAmount), 0n)
        .toString(),
      remainingAmount: budgetSummaries
        .reduce((total, summary) => total + BigInt(summary.remainingAmount), 0n)
        .toString(),
      releasedAmount: budgetSummaries
        .reduce((total, summary) => total + BigInt(summary.releasedAmount), 0n)
        .toString(),
      adjustedAmount: budgetSummaries
        .reduce((total, summary) => total + BigInt(summary.adjustedAmount), 0n)
        .toString(),
      currentEntryCount: budgetSummaries.reduce(
        (total, summary) => total + summary.currentEntryCount,
        0,
      ),
      pendingEntryCount: budgetSummaries.reduce(
        (total, summary) => total + summary.pendingEntryCount,
        0,
      ),
      finalizedEntryCount: budgetSummaries.reduce(
        (total, summary) => total + summary.finalizedEntryCount,
        0,
      ),
      voidedEntryCount: budgetSummaries.reduce(
        (total, summary) => total + summary.voidedEntryCount,
        0,
      ),
      adjustedEntryCount: budgetSummaries.reduce(
        (total, summary) => total + summary.adjustedEntryCount,
        0,
      ),
      lastEventAt:
        budgetSummaries
          .map((summary) => summary.lastEventAt)
          .filter((value): value is string => Boolean(value))
          .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null,
    },
    recent,
  }
}

function buildDemoBudgetLedger(
  draft: PropositionDraftRecord,
): RequesterPropositionBudgetLedgerRecord {
  const configuredAmount = draft.rewardBudget
  const baseResponseReward = BigInt(draft.baseResponseReward)

  if (draft.status !== 'settled') {
    return {
      propositionId: draft.propositionId,
      summary: {
        configuredAmount,
        reservedAmount: '0',
        spentAmount: '0',
        remainingAmount: configuredAmount,
        releasedAmount: '0',
        adjustedAmount: '0',
        currentEntryCount: 0,
        pendingEntryCount: 0,
        finalizedEntryCount: 0,
        voidedEntryCount: 0,
        adjustedEntryCount: 0,
        lastEventAt: null,
      },
      items: [],
    }
  }

  const partialSpent = (baseResponseReward / 2n).toString()
  const partialReleased = (baseResponseReward - baseResponseReward / 2n).toString()
  const items: RequesterPropositionBudgetLedgerViewModel['items'] = [
    ...Array.from({ length: 10 }, (_, index) => ({
      entryId: `${draft.propositionId}-budget-spent-${index + 1}`,
      entryType: 'spent' as const,
      ledgerStatus: 'finalized' as const,
      reviewStatus: 'valid' as const,
      pendingAmount: draft.baseResponseReward,
      finalAmount: draft.baseResponseReward,
      reservedAmount: '0',
      spentAmount: draft.baseResponseReward,
      releasedAmount: '0',
      adjustedAmount: '0',
      reasonCode: 'review_valid' as const,
      createdAt: minusDays(7 + index),
      effectiveAt: minusDays(6 + index),
      finalizedAt: minusDays(6 + index),
      voidedAt: null,
      reversedAt: null,
      ledgerVersion: 1,
      isCurrent: true,
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      entryId: `${draft.propositionId}-budget-partial-${index + 1}`,
      entryType: 'spent' as const,
      ledgerStatus: 'finalized' as const,
      reviewStatus: 'partial_valid' as const,
      pendingAmount: draft.baseResponseReward,
      finalAmount: partialSpent,
      reservedAmount: '0',
      spentAmount: partialSpent,
      releasedAmount: partialReleased,
      adjustedAmount: '0',
      reasonCode: 'review_partial_valid' as const,
      createdAt: minusDays(4 + index),
      effectiveAt: minusDays(3 + index),
      finalizedAt: minusDays(3 + index),
      voidedAt: null,
      reversedAt: null,
      ledgerVersion: 1,
      isCurrent: true,
    })),
  ].sort((left, right) => Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt))

  return {
    propositionId: draft.propositionId,
    summary: {
      configuredAmount,
      reservedAmount: '0',
      spentAmount: items
        .reduce((total, item) => total + BigInt(item.spentAmount), 0n)
        .toString(),
      remainingAmount: (
        BigInt(configuredAmount)
        - items.reduce((total, item) => total + BigInt(item.spentAmount), 0n)
      ).toString(),
      releasedAmount: items
        .reduce((total, item) => total + BigInt(item.releasedAmount), 0n)
        .toString(),
      adjustedAmount: '0',
      currentEntryCount: items.length,
      pendingEntryCount: 0,
      finalizedEntryCount: items.length,
      voidedEntryCount: 0,
      adjustedEntryCount: 0,
      lastEventAt: items[0]?.effectiveAt ?? null,
    },
    items,
  }
}

function buildDemoBudgetSummary(
  draft: PropositionDraftRecord,
): RequesterPropositionBudgetSummaryViewModel {
  return buildDemoBudgetLedger(draft).summary
}

function buildDemoSubmissionDetail(
  draft: PropositionDraftRecord,
): RequesterOwnedPropositionDetailRecord {
  const isSettled = draft.status === 'settled'
  const budgetSummary = buildDemoBudgetSummary(draft)

  return {
    proposition: {
      id: draft.propositionId,
      title: draft.title,
      description: draft.summary,
      optionA: draft.optionA,
      optionB: draft.optionB,
      category: draft.category,
      status: draft.status,
      marketEnabled: draft.marketEnabled,
      sampleConstraints: [...draft.sampleConstraints],
      minEffectiveSample: draft.minEffectiveSample,
      minBetAmount: draft.minBetAmount,
      minDurationSeconds: draft.minDurationSeconds,
      maxDurationSeconds: draft.maxDurationSeconds,
      rewardBudget: draft.rewardBudget,
      baseResponseReward: draft.baseResponseReward,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      publishedAt: isSettled ? minusDays(10) : null,
      liveAt: isSettled ? minusDays(9) : null,
      frozenAt: isSettled ? minusDays(3) : null,
      revealStartedAt: isSettled ? minusDays(2) : null,
      resultComputedAt: isSettled ? minusDays(2) : null,
      settledAt: isSettled ? minusDays(2) : null,
      archivedAt: null,
    },
    submission: {
      status: draft.submissionStatus as RequesterOwnedPropositionDetailRecord['submission']['status'],
      submittedAt: draft.submittedAt,
      submissionReason: isSettled ? 'demo_approved_and_settled' : 'demo_review_queue',
      submissionNote: isSettled
        ? 'Seeded demo proposition already completed requester review and settlement.'
        : 'Seeded demo submission awaiting requester review.',
    },
    market: isSettled
      ? {
          id: 'demo-settled-market-public-service',
          status: 'settled',
          liveAt: minusDays(9),
          frozenAt: minusDays(3),
          settlingAt: minusDays(2),
          settledAt: minusDays(2),
          currentPublicProgress: buildPublicProgress(
            draft.propositionId,
            draft.title,
            'settled',
            12,
            draft.minEffectiveSample,
            100,
            'settled',
          ),
          lastPublicResult: {
            resultKind: 'resolved',
            winningOption: 0,
            voidReason: null,
            publishedAt: minusDays(2),
          },
        }
      : null,
    sampleCounter: {
      propositionId: draft.propositionId,
      totalResponses: isSettled ? 12 : 0,
      reviewedResponses: isSettled ? 12 : 0,
      validCount: isSettled ? 10 : 0,
      partialValidCount: isSettled ? 2 : 0,
      invalidCount: 0,
      effectiveSampleCount: isSettled ? 12 : 0,
      currentProgress: isSettled ? 100 : 0,
      hasReachedMinEffectiveSample: isSettled,
      updatedAt: draft.updatedAt,
    },
    closureReadiness: {
      propositionId: draft.propositionId,
      propositionStatus: draft.status,
      counterSnapshot: {
        propositionId: draft.propositionId,
        totalResponses: isSettled ? 12 : 0,
        reviewedResponses: isSettled ? 12 : 0,
        validCount: isSettled ? 10 : 0,
        partialValidCount: isSettled ? 2 : 0,
        invalidCount: 0,
        effectiveSampleCount: isSettled ? 12 : 0,
        currentProgress: isSettled ? 100 : 0,
        hasReachedMinEffectiveSample: isSettled,
        updatedAt: draft.updatedAt,
      },
      liveAt: isSettled ? minusDays(9) : null,
      minFreezeAt: isSettled ? minusDays(8) : null,
      maxFreezeAt: isSettled ? minusDays(3) : null,
      minDurationReached: isSettled,
      maxDurationReached: isSettled,
      hasReachedMinEffectiveSample: isSettled,
      isReadyToFreeze: isSettled,
      triggerReason: isSettled ? 'min_duration_and_sample_reached' : 'not_ready',
    },
    dispatchSummary: {
      totalTasks: isSettled ? 14 : 0,
      submittedCount: isSettled ? 12 : 0,
      uniqueAssignedUsers: isSettled ? 12 : 0,
      lastAssignedAt: isSettled ? minusDays(8) : null,
      lastSubmittedAt: isSettled ? minusDays(4) : null,
    },
    reviewSummary: {
      totalReviews: isSettled ? 12 : 0,
      pendingCount: 0,
      finalizedCount: isSettled ? 12 : 0,
      validCount: isSettled ? 10 : 0,
      partialValidCount: isSettled ? 2 : 0,
      invalidCount: 0,
      fraudSuspectedCount: 0,
    },
    budgetSummary,
    revealSettlement: {
      propositionStatus: draft.status,
      resultKind: isSettled ? 'resolved' : null,
      winningOption: isSettled ? 0 : null,
      voidReason: null,
      frozenAt: isSettled ? minusDays(3) : null,
      revealStartedAt: isSettled ? minusDays(2) : null,
      resultComputedAt: isSettled ? minusDays(2) : null,
      settledAt: isSettled ? minusDays(2) : null,
      marketStatus: isSettled ? 'settled' : null,
      currentPublicProgress: isSettled
        ? buildPublicProgress(
            draft.propositionId,
            draft.title,
            'settled',
            12,
            draft.minEffectiveSample,
            100,
            'settled',
          )
        : null,
      lastPublicResult: isSettled
        ? {
            resultKind: 'resolved',
            winningOption: 0,
            voidReason: null,
            publishedAt: minusDays(2),
          }
        : null,
    },
  }
}

function buildDemoSettledRequesterReport(
  draft: PropositionDraftRecord,
): RequesterOwnedSettledPropositionReportRecord {
  const detail = buildDemoSubmissionDetail(draft)

  return {
    proposition: {
      id: detail.proposition.id,
      title: detail.proposition.title,
      description: detail.proposition.description,
      optionA: detail.proposition.optionA,
      optionB: detail.proposition.optionB,
      category: detail.proposition.category,
      status: detail.proposition.status,
      marketEnabled: detail.proposition.marketEnabled,
      sampleConstraints: [...detail.proposition.sampleConstraints],
      minEffectiveSample: detail.proposition.minEffectiveSample,
      minBetAmount: detail.proposition.minBetAmount,
      minDurationSeconds: detail.proposition.minDurationSeconds,
      maxDurationSeconds: detail.proposition.maxDurationSeconds,
      rewardBudget: detail.proposition.rewardBudget,
      baseResponseReward: detail.proposition.baseResponseReward,
      createdAt: detail.proposition.createdAt,
      publishedAt: detail.proposition.publishedAt,
      liveAt: detail.proposition.liveAt,
      frozenAt: detail.proposition.frozenAt,
      revealStartedAt: detail.proposition.revealStartedAt,
      resultComputedAt: detail.proposition.resultComputedAt ?? minusDays(2),
      settledAt: detail.proposition.settledAt ?? minusDays(2),
    },
    submission: {
      ...detail.submission,
    },
    sample: {
      ...detail.sampleCounter,
    },
    dispatchSummary: {
      ...detail.dispatchSummary,
    },
    reviewSummary: {
      ...detail.reviewSummary,
    },
    budgetSummary: {
      ...detail.budgetSummary,
    },
    result: {
      resultKind: 'resolved',
      winningOption: 0,
      winningOptionLabel: draft.optionA,
      voidReason: null,
      resultComputedAt: detail.revealSettlement.resultComputedAt ?? minusDays(2),
      settledAt: detail.revealSettlement.settledAt ?? minusDays(2),
      marketStatus: 'settled',
      currentPublicProgress: detail.revealSettlement.currentPublicProgress,
      lastPublicResult: detail.revealSettlement.lastPublicResult,
    },
    generatedAt: DEMO_NOW,
  }
}

function buildDemoRequesterExport(
  exportId: string,
  requestedAt: string,
  presetId?: string,
  format: 'json' | 'csv' = 'json',
): RequesterOwnedPropositionExportRecord {
  const overview = buildRequesterOverview(demoState.drafts)
  const preset =
    presetId === 'preset-demo-settled'
      ? {
          presetId: 'preset-demo-settled',
          name: 'Settled only',
          statusScope: 'settled' as const,
          categories: ['politics' as PropositionCategory],
          marketEnabledOnly: false,
        }
      : null
  const settledDrafts = demoState.drafts.filter((draft) => draft.status === 'settled')
  const reports = settledDrafts.map((draft) => buildDemoSettledRequesterReport(draft))
  const categoryHistory = [
    {
      category: 'ai' as const,
      propositionCount: 2,
      settledCount: 0,
      unresolvedCount: 2,
      totalEffectiveSampleCount: 0,
      totalReviewedResponseCount: 0,
      totalBetCount: 0,
      totalBetStakeAmount: '0',
      uniqueTraderCount: 0,
    },
    {
      category: 'politics' as const,
      propositionCount: 2,
      settledCount: 1,
      unresolvedCount: 1,
      totalEffectiveSampleCount: 12,
      totalReviewedResponseCount: 12,
      totalBetCount: 0,
      totalBetStakeAmount: '0',
      uniqueTraderCount: 0,
    },
  ] satisfies RequesterOwnedPropositionAnalyticsViewModel['categoryHistory']
  const analytics: RequesterOwnedPropositionAnalyticsViewModel = {
    windowDays: 30,
    now: requestedAt,
    windowStartedAt: minusDays(30),
    preset: null,
    totals: {
      createdCount: demoState.drafts.length,
      settledCount: settledDrafts.length,
      unresolvedCount: demoState.drafts.length - settledDrafts.length,
      marketEnabledCount: demoState.drafts.filter((draft) => draft.marketEnabled).length,
      totalEffectiveSampleCount: overview.sampleSummary.totalEffectiveSampleCount,
      totalReviewedResponseCount: 12,
      totalBetCount: 0,
      totalBetStakeAmount: '0',
      uniqueTraderCount: 0,
    },
    lifecycle: {
      averageHoursToPublish: 24,
      averageHoursToLive: 24,
      averageHoursToFreeze: 144,
      averageHoursToSettle: 168,
    },
    categoryHistory,
    trend: [
      {
        date: '2026-04-24',
        createdCount: 1,
        settledCount: 0,
        reviewedResponseCount: 0,
        effectiveSampleCount: 0,
        betCount: 0,
        betStakeAmount: '0',
      },
      {
        date: '2026-04-26',
        createdCount: 1,
        settledCount: 1,
        reviewedResponseCount: 12,
        effectiveSampleCount: 12,
        betCount: 0,
        betStakeAmount: '0',
      },
      {
        date: '2026-05-03',
        createdCount: 2,
        settledCount: 0,
        reviewedResponseCount: 0,
        effectiveSampleCount: 0,
        betCount: 0,
        betStakeAmount: '0',
      },
    ],
    delivery: {
      exportCount: demoState.requesterExports.length + 1,
      latestExportAt: requestedAt,
      latestExportId: exportId,
    },
  }

  return {
    exportId,
    status: 'completed',
    format,
    requestedAt,
    completedAt: requestedAt,
    fileName: `arena-requester-${DEMO_USER_ID}-${requestedAt.replace(/[:.]/g, '-')}.${format}`,
    preset,
    overview,
    analytics,
    reports,
    serialized:
      format === 'csv'
        ? {
            mediaType: 'text/csv',
            fileName: `arena-requester-${DEMO_USER_ID}-${requestedAt.replace(/[:.]/g, '-')}.${format}`,
            content: [
              'propositionId,title,category,status,resultKind,winningOptionLabel,settledAt,effectiveSampleCount,reviewedResponseCount,validCount,partialValidCount,invalidCount',
              ...reports.map((report) =>
                [
                  report.proposition.id,
                  report.proposition.title,
                  report.proposition.category,
                  report.proposition.status,
                  report.result.resultKind,
                  report.result.winningOptionLabel ?? '',
                  report.result.settledAt,
                  String(report.sample.effectiveSampleCount),
                  String(report.sample.reviewedResponses),
                  String(report.reviewSummary.validCount),
                  String(report.reviewSummary.partialValidCount),
                  String(report.reviewSummary.invalidCount),
                ].join(','),
              ),
            ].join('\n') + '\n',
          }
        : {
            mediaType: 'application/json',
            fileName: `arena-requester-${DEMO_USER_ID}-${requestedAt.replace(/[:.]/g, '-')}.${format}`,
            content: JSON.stringify(
              {
                exportId,
                status: 'completed',
                format,
                requestedAt,
                completedAt: requestedAt,
                fileName: `arena-requester-${DEMO_USER_ID}-${requestedAt.replace(/[:.]/g, '-')}.${format}`,
                preset,
                overview,
                analytics,
                reports,
              },
              null,
              2,
            ) + '\n',
          },
    metrics: {
      settledReportCount: reports.length,
      openLifecycleCount: overview.totals.unresolvedCount,
    },
  }
}

function buildDemoRequesterComparisonSets(): RequesterComparisonSetListRecord {
  return {
    totalCount: 1,
    items: [
      {
        comparisonSetId: 'comparison-set-demo-core',
        name: 'Core requester mix',
        description: 'Saved comparison between settled and unresolved requester cohorts.',
        presetIds: ['preset-demo-settled', 'preset-demo-unresolved'],
        updatedAt: minusHours(1),
      },
    ],
  }
}

function buildDemoRequesterComparisonDeliveryPolicies(): RequesterComparisonSetDeliveryPolicyViewModel[] {
  return [
    {
      policyId: 'delivery-policy-demo-daily',
      comparisonSetId: 'comparison-set-demo-core',
      name: 'Daily settled delivery',
      description: 'Materialize a reusable requester comparison export on a daily cadence.',
      cadence: 'daily',
      nextRunAt: plusDays(1),
      lastRunAt: minusHours(22),
      lastRunStatus: 'completed',
      lastRunError: null,
      enabled: true,
      retainedExportCount: 5,
      transport: {
        type: 'webhook',
        targetUrl: 'https://example.arena.test/requester-deliveries',
        credentialKey: 'ARENA_REQUESTER_WEBHOOK_BEARER',
      },
      createdAt: minusDays(7),
      updatedAt: minusHours(3),
    },
  ]
}

function buildDemoRequesterComparisonDeliveryRuns(): RequesterComparisonSetDeliveryRunViewModel[] {
  return [
    {
      runId: 'delivery-run-demo-failed',
      comparisonSetId: 'comparison-set-demo-core',
      policyId: 'delivery-policy-demo-daily',
      retriedRunId: null,
      triggerType: 'automation',
      status: 'failed',
      startedAt: minusHours(30),
      completedAt: minusHours(30),
      exportId: 'comparison-export-demo-core',
      retainedExportAvailable: true,
      origin: {
        type: 'delivery_policy_automation',
        policyId: 'delivery-policy-demo-daily',
        policyName: 'Daily settled delivery',
      },
      delivery: null,
      error: {
        code: 'transport_credential_missing',
        message: 'transport credential missing',
      },
    },
    {
      runId: 'delivery-run-demo-latest',
      comparisonSetId: 'comparison-set-demo-core',
      policyId: 'delivery-policy-demo-daily',
      retriedRunId: null,
      triggerType: 'manual',
      status: 'completed',
      startedAt: minusHours(22),
      completedAt: minusHours(22),
      exportId: 'comparison-export-demo-core',
      retainedExportAvailable: true,
      origin: {
        type: 'delivery_policy_manual',
        policyId: 'delivery-policy-demo-daily',
        policyName: 'Daily settled delivery',
      },
      delivery: {
        deliveredAt: minusHours(22),
        statusCode: 202,
        authentication: {
          kind: 'none',
          credentialKey: null,
        },
      },
      error: null,
    },
  ]
}

function isDemoComparisonExportRetained(
  comparisonSetId: string,
  exportId: string | null,
) {
  if (!exportId) {
    return false
  }

  return demoState.requesterComparisonExports.some(
    (entry) =>
      entry.comparisonSet.comparisonSetId === comparisonSetId && entry.exportId === exportId,
  )
}

function withDemoRetainedExportAvailability(
  run: RequesterComparisonSetDeliveryRunViewModel,
): RequesterComparisonSetDeliveryRunViewModel {
  return {
    ...run,
    retainedExportAvailable: isDemoComparisonExportRetained(
      run.comparisonSetId,
      run.exportId,
    ),
  }
}

function buildDemoRequesterComparisonAnalytics(
  comparisonSetId: string,
): RequesterComparisonSetAnalyticsRecord {
  if (comparisonSetId !== 'comparison-set-demo-core') {
    throw new Error('Demo requester comparison set not found')
  }

  const settledAnalytics: RequesterOwnedPropositionAnalyticsViewModel = {
    windowDays: 30,
    now: DEMO_NOW,
    windowStartedAt: minusDays(30),
    preset: {
      presetId: 'preset-demo-settled',
      name: 'Settled only',
      statusScope: 'settled',
      categories: ['politics'],
      marketEnabledOnly: false,
    },
    totals: {
      createdCount: 1,
      settledCount: 1,
      unresolvedCount: 0,
      marketEnabledCount: 1,
      totalEffectiveSampleCount: 12,
      totalReviewedResponseCount: 12,
      totalBetCount: 0,
      totalBetStakeAmount: '0',
      uniqueTraderCount: 0,
    },
    lifecycle: {
      averageHoursToPublish: 24,
      averageHoursToLive: 24,
      averageHoursToFreeze: 144,
      averageHoursToSettle: 168,
    },
    categoryHistory: [
      {
        category: 'politics',
        propositionCount: 1,
        settledCount: 1,
        unresolvedCount: 0,
        totalEffectiveSampleCount: 12,
        totalReviewedResponseCount: 12,
        totalBetCount: 0,
        totalBetStakeAmount: '0',
        uniqueTraderCount: 0,
      },
    ],
    trend: [
      {
        date: '2026-04-26',
        createdCount: 1,
        settledCount: 1,
        reviewedResponseCount: 12,
        effectiveSampleCount: 12,
        betCount: 0,
        betStakeAmount: '0',
      },
    ],
    delivery: {
      exportCount: 1,
      latestExportAt: DEMO_NOW,
      latestExportId: 'comparison-export-demo-core',
    },
  }

  const unresolvedAnalytics: RequesterOwnedPropositionAnalyticsViewModel = {
    windowDays: 30,
    now: DEMO_NOW,
    windowStartedAt: minusDays(30),
    preset: {
      presetId: 'preset-demo-unresolved',
      name: 'Unresolved watchlist',
      statusScope: 'unresolved',
      categories: ['ai'],
      marketEnabledOnly: false,
    },
    totals: {
      createdCount: 1,
      settledCount: 0,
      unresolvedCount: 1,
      marketEnabledCount: 1,
      totalEffectiveSampleCount: 0,
      totalReviewedResponseCount: 0,
      totalBetCount: 0,
      totalBetStakeAmount: '0',
      uniqueTraderCount: 0,
    },
    lifecycle: {
      averageHoursToPublish: null,
      averageHoursToLive: null,
      averageHoursToFreeze: null,
      averageHoursToSettle: null,
    },
    categoryHistory: [
      {
        category: 'ai',
        propositionCount: 1,
        settledCount: 0,
        unresolvedCount: 1,
        totalEffectiveSampleCount: 0,
        totalReviewedResponseCount: 0,
        totalBetCount: 0,
        totalBetStakeAmount: '0',
        uniqueTraderCount: 0,
      },
    ],
    trend: [
      {
        date: '2026-05-03',
        createdCount: 1,
        settledCount: 0,
        reviewedResponseCount: 0,
        effectiveSampleCount: 0,
        betCount: 0,
        betStakeAmount: '0',
      },
    ],
    delivery: {
      exportCount: 1,
      latestExportAt: DEMO_NOW,
      latestExportId: 'comparison-export-demo-core',
    },
  }

  return {
    totalCount: 2,
    summary: {
      presetCount: 2,
      topPresetByCreatedCount: {
        presetId: 'preset-demo-settled',
        createdCount: 1,
      },
      topPresetBySettledCount: {
        presetId: 'preset-demo-settled',
        settledCount: 1,
      },
      topPresetByBetStakeAmount: {
        presetId: 'preset-demo-settled',
        totalBetStakeAmount: '0',
      },
      totals: {
        createdCount: 2,
        settledCount: 1,
        unresolvedCount: 1,
        totalEffectiveSampleCount: 12,
        totalReviewedResponseCount: 12,
        totalBetCount: 0,
        totalBetStakeAmount: '0',
        uniqueTraderCount: 0,
      },
    },
    comparisonSet: {
      comparisonSetId: 'comparison-set-demo-core',
      name: 'Core requester mix',
      presetIds: ['preset-demo-settled', 'preset-demo-unresolved'],
    },
    items: [
      {
        preset: settledAnalytics.preset!,
        analytics: settledAnalytics,
      },
      {
        preset: unresolvedAnalytics.preset!,
        analytics: unresolvedAnalytics,
      },
    ],
  }
}

function buildDemoRequesterComparisonExport(
  comparisonSetId: string,
  overrides?: Partial<
    Pick<
      RequesterComparisonSetExportRecord,
      'exportId' | 'requestedAt' | 'completedAt' | 'fileName' | 'origin' | 'format'
    >
  >,
): RequesterComparisonSetExportRecord {
  const comparison = buildDemoRequesterComparisonAnalytics(comparisonSetId)
  const requestedAt = overrides?.requestedAt ?? new Date().toISOString()
  const completedAt = overrides?.completedAt ?? requestedAt
  const exportId =
    overrides?.exportId
    ?? `comparison-export-demo-${comparisonSetId}-${Date.now()}`
  const format = overrides?.format ?? 'json'
  const fileName =
    overrides?.fileName
    ?? `arena-requester-comparison-${DEMO_USER_ID}-${comparisonSetId}-${requestedAt.replace(/[:.]/g, '-')}.${format}`

  const report = {
    generatedAt: completedAt,
    presetCount: comparison.summary.presetCount,
    totals: structuredClone(comparison.summary.totals),
    leaders: {
      byCreatedCount: {
        presetId: 'preset-demo-settled',
        name: 'Settled only',
        createdCount: 1,
      },
      bySettledCount: {
        presetId: 'preset-demo-settled',
        name: 'Settled only',
        settledCount: 1,
      },
      byBetStakeAmount: {
        presetId: 'preset-demo-settled',
        name: 'Settled only',
        totalBetStakeAmount: '0',
      },
    },
    rows: [
      {
        rank: 1,
        preset: comparison.items[0]!.preset,
        createdCount: 1,
        settledCount: 1,
        unresolvedCount: 0,
        totalEffectiveSampleCount: 12,
        totalReviewedResponseCount: 12,
        totalBetCount: 0,
        totalBetStakeAmount: '0',
        uniqueTraderCount: 0,
      },
      {
        rank: 2,
        preset: comparison.items[1]!.preset,
        createdCount: 1,
        settledCount: 0,
        unresolvedCount: 1,
        totalEffectiveSampleCount: 0,
        totalReviewedResponseCount: 0,
        totalBetCount: 0,
        totalBetStakeAmount: '0',
        uniqueTraderCount: 0,
      },
    ],
  } satisfies RequesterComparisonSetExportRecord['report']

  return {
    exportId,
    status: 'completed',
    format,
    requestedAt,
    completedAt,
    fileName,
    origin: overrides?.origin ?? {
      type: 'manual',
      policyId: null,
      policyName: null,
    },
    comparisonSet: {
      comparisonSetId: comparison.comparisonSet!.comparisonSetId,
      name: comparison.comparisonSet!.name,
      presetIds: [...comparison.comparisonSet!.presetIds],
    },
    totalCount: comparison.totalCount,
    summary: structuredClone(comparison.summary),
    serialized:
      format === 'csv'
        ? {
            mediaType: 'text/csv',
            fileName,
            content: [
              'rank,presetId,presetName,createdCount,settledCount,unresolvedCount,totalEffectiveSampleCount,totalReviewedResponseCount,totalBetCount,totalBetStakeAmount,uniqueTraderCount',
              ...report.rows.map((row) =>
                [
                  String(row.rank),
                  row.preset.presetId,
                  row.preset.name,
                  String(row.createdCount),
                  String(row.settledCount),
                  String(row.unresolvedCount),
                  String(row.totalEffectiveSampleCount),
                  String(row.totalReviewedResponseCount),
                  String(row.totalBetCount),
                  row.totalBetStakeAmount,
                  String(row.uniqueTraderCount),
                ].join(','),
              ),
            ].join('\n') + '\n',
          }
        : {
            mediaType: 'application/json',
            fileName,
            content: JSON.stringify(
              {
                exportId,
                status: 'completed',
                format,
                requestedAt,
                completedAt,
                fileName,
                origin: overrides?.origin ?? {
                  type: 'manual',
                  policyId: null,
                  policyName: null,
                },
                comparisonSet: {
                  comparisonSetId: comparison.comparisonSet!.comparisonSetId,
                  name: comparison.comparisonSet!.name,
                  presetIds: [...comparison.comparisonSet!.presetIds],
                },
                totalCount: comparison.totalCount,
                summary: structuredClone(comparison.summary),
                report,
                items: structuredClone(comparison.items),
              },
              null,
              2,
            ) + '\n',
          },
    report,
    items: structuredClone(comparison.items),
  }
}

function sortDemoComparisonExports(
  records: RequesterOwnedComparisonSetExportArtifactViewModel[],
) {
  return [...records].sort(
    (left, right) =>
      Date.parse(right.completedAt) - Date.parse(left.completedAt)
      || Date.parse(right.requestedAt) - Date.parse(left.requestedAt),
  )
}

function applyDemoComparisonSetExportRetention(
  records: RequesterOwnedComparisonSetExportArtifactViewModel[],
  input: {
    retainedExportCount?: number
    policyId?: string | null
  },
) {
  if (
    typeof input.retainedExportCount !== 'number'
    || input.retainedExportCount < 1
    || typeof input.policyId !== 'string'
    || input.policyId.length === 0
  ) {
    return records
  }

  let retainedForPolicy = 0

  return records.filter((record) => {
    if (record.origin.policyId !== input.policyId) {
      return true
    }

    retainedForPolicy += 1
    return retainedForPolicy <= input.retainedExportCount
  })
}

function upsertDemoComparisonExport(
  exportArtifact: RequesterOwnedComparisonSetExportArtifactViewModel,
  retention?: {
    retainedExportCount?: number
    policyId?: string | null
  },
) {
  const nextRecords = sortDemoComparisonExports([
    exportArtifact,
    ...demoState.requesterComparisonExports.filter(
      (item) => item.exportId !== exportArtifact.exportId,
    ),
  ])

  demoState.requesterComparisonExports = applyDemoComparisonSetExportRetention(
    nextRecords,
    retention ?? {},
  )
}

function getComparisonDeliveryPolicyOrThrow(
  comparisonSetId: string,
  policyId: string,
): RequesterComparisonSetDeliveryPolicyViewModel {
  const policy = demoState.requesterComparisonDeliveryPolicies.find(
    (entry) => entry.comparisonSetId === comparisonSetId && entry.policyId === policyId,
  )

  if (!policy) {
    throw new Error('Demo requester comparison delivery policy not found')
  }

  return policy
}

function updateComparisonDeliveryPolicy(
  comparisonSetId: string,
  policyId: string,
  recipe: (
    current: RequesterComparisonSetDeliveryPolicyViewModel,
  ) => RequesterComparisonSetDeliveryPolicyViewModel,
): RequesterComparisonSetDeliveryPolicyViewModel {
  let nextPolicy: RequesterComparisonSetDeliveryPolicyViewModel | null = null

  demoState.requesterComparisonDeliveryPolicies = demoState.requesterComparisonDeliveryPolicies.map((entry) => {
    if (entry.comparisonSetId !== comparisonSetId || entry.policyId !== policyId) {
      return entry
    }

    nextPolicy = recipe(entry)
    return nextPolicy
  })

  if (!nextPolicy) {
    throw new Error('Demo requester comparison delivery policy not found')
  }

  return nextPolicy
}

function createDemoComparisonDeliveryPolicy(
  comparisonSetId: string,
  input: CreateRequesterComparisonSetDeliveryPolicyInputRecord,
): RequesterComparisonSetDeliveryPolicyViewModel {
  const policy: RequesterComparisonSetDeliveryPolicyViewModel = {
    policyId: `delivery-policy-demo-${Date.now()}`,
    comparisonSetId,
    name: input.name,
    description: input.description ?? null,
    cadence: input.cadence,
    nextRunAt: input.nextRunAt,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
    enabled: input.enabled,
    retainedExportCount: input.retainedExportCount ?? 5,
    transport: input.transport ?? null,
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
  }

  demoState.requesterComparisonDeliveryPolicies = [
    policy,
    ...demoState.requesterComparisonDeliveryPolicies,
  ]

  return policy
}

function deleteDemoComparisonDeliveryPolicy(
  comparisonSetId: string,
  policyId: string,
): DeleteRequesterComparisonSetDeliveryPolicyResultRecord {
  const beforeCount = demoState.requesterComparisonDeliveryPolicies.length
  demoState.requesterComparisonDeliveryPolicies = demoState.requesterComparisonDeliveryPolicies.filter(
    (entry) => !(entry.comparisonSetId === comparisonSetId && entry.policyId === policyId),
  )

  if (demoState.requesterComparisonDeliveryPolicies.length === beforeCount) {
    throw new Error('Demo requester comparison delivery policy not found')
  }

  demoState.requesterComparisonDeliveryRuns = demoState.requesterComparisonDeliveryRuns.filter(
    (entry) => !(entry.comparisonSetId === comparisonSetId && entry.policyId === policyId),
  )

  return {
    comparisonSetId,
    policyId,
    deleted: true,
  }
}

function buildDemoRequesterComparisonDeliveryHealth(
  comparisonSetId: string,
  policyId: string,
  checkedAt: string = DEMO_NOW,
): RequesterComparisonSetDeliveryPolicyHealthViewModel {
  const policy = getComparisonDeliveryPolicyOrThrow(comparisonSetId, policyId)
  const runs = demoState.requesterComparisonDeliveryRuns
    .filter((entry) => entry.comparisonSetId === comparisonSetId && entry.policyId === policyId)
    .sort((left, right) => {
      const rightCompletedAt = right.completedAt ? Date.parse(right.completedAt) : 0
      const leftCompletedAt = left.completedAt ? Date.parse(left.completedAt) : 0
      if (rightCompletedAt !== leftCompletedAt) {
        return rightCompletedAt - leftCompletedAt
      }

      return Date.parse(right.startedAt) - Date.parse(left.startedAt)
    })
  const latestRun = runs[0] ?? null
  const completedRuns = runs.filter((entry) => entry.status === 'completed')
  const failedRuns = runs.filter((entry) => entry.status === 'failed')
  const credentialKey =
    policy.transport?.type === 'webhook' ? (policy.transport.credentialKey ?? null) : null
  const transportStatus =
    credentialKey && credentialKey !== 'ARENA_REQUESTER_WEBHOOK_BEARER'
      ? {
          status: 'blocked' as const,
          blockingReason: 'transport_credential_missing' as const,
          credentialKey,
        }
      : {
          status: 'ready' as const,
          blockingReason: null,
          credentialKey,
        }
  const isDue =
    policy.enabled && Date.parse(policy.nextRunAt) <= Date.parse(DEMO_NOW)
  let consecutiveFailureCount = 0
  for (const run of runs) {
    if (run.status !== 'failed') {
      break
    }

    consecutiveFailureCount += 1
  }
  const healthStatus =
    !policy.enabled
      ? 'disabled'
      : consecutiveFailureCount > 0
        ? 'failing'
        : isDue
          ? 'due'
          : 'scheduled'

  return {
    policy: structuredClone(policy),
    health: {
      status: healthStatus,
      checkedAt,
      isDue,
      lagSeconds:
        isDue
          ? Math.max(0, Math.floor((Date.parse(DEMO_NOW) - Date.parse(policy.nextRunAt)) / 1000))
          : 0,
      consecutiveFailureCount,
      lastCompletedRunAt: completedRuns[0]?.completedAt ?? null,
      lastFailedRunAt: failedRuns[0]?.completedAt ?? null,
      latestRun: latestRun ? withDemoRetainedExportAvailability(latestRun) : null,
      runCounts: {
        totalCount: runs.length,
        completedCount: completedRuns.length,
        failedCount: failedRuns.length,
      },
      transport: transportStatus,
    },
  }
}

function buildDemoRequesterComparisonDeliveryRunResult(
  comparisonSetId: string,
  policyId: string,
): RequesterComparisonSetDeliveryPolicyRunResultViewModel {
  const currentPolicy = getComparisonDeliveryPolicyOrThrow(comparisonSetId, policyId)
  const completedAt = DEMO_NOW
  const exportArtifact: RequesterOwnedComparisonSetExportArtifactViewModel = {
    ...buildDemoRequesterComparisonExport(comparisonSetId),
    origin: {
      type: 'delivery_policy_manual',
      policyId,
      policyName: currentPolicy.name,
    },
  }
  upsertDemoComparisonExport(exportArtifact, {
    retainedExportCount: currentPolicy.retainedExportCount,
    policyId,
  })

  const credentialKey =
    currentPolicy.transport?.type === 'webhook' ? (currentPolicy.transport.credentialKey ?? null) : null

  if (credentialKey && credentialKey !== 'ARENA_REQUESTER_WEBHOOK_BEARER') {
    updateComparisonDeliveryPolicy(comparisonSetId, policyId, (current) => ({
      ...current,
      lastRunAt: completedAt,
      lastRunStatus: 'failed',
      lastRunError: {
        code: 'requester_comparison_set_delivery.transport_credential_missing',
        message: 'Requester comparison set delivery credential is not configured',
      },
      updatedAt: completedAt,
    }))
    demoState.requesterComparisonDeliveryRuns = [
      {
        runId: `delivery-run-demo-failed-${Date.now()}`,
        comparisonSetId,
        policyId,
        retriedRunId: null,
        triggerType: 'manual',
        status: 'failed',
        startedAt: completedAt,
        completedAt,
        exportId: exportArtifact.exportId,
        retainedExportAvailable: true,
        origin: {
          type: 'delivery_policy_manual',
          policyId,
          policyName: currentPolicy.name,
        },
        delivery: null,
        error: {
          code: 'requester_comparison_set_delivery.transport_credential_missing',
          message: 'Requester comparison set delivery credential is not configured',
        },
      },
      ...demoState.requesterComparisonDeliveryRuns,
    ]

    throw new Error('Requester comparison set delivery credential is not configured')
  }

  const updatedPolicy = updateComparisonDeliveryPolicy(comparisonSetId, policyId, (current) => ({
    ...current,
    lastRunAt: completedAt,
    lastRunStatus: 'completed',
    lastRunError: null,
    updatedAt: completedAt,
  }))
  exportArtifact.origin.policyName = updatedPolicy.name
    const run: RequesterComparisonSetDeliveryRunViewModel = {
      runId: `delivery-run-demo-${Date.now()}`,
      comparisonSetId,
      policyId,
      retriedRunId: null,
      triggerType: 'manual',
      status: 'completed',
      startedAt: completedAt,
      completedAt,
      exportId: exportArtifact.exportId,
      retainedExportAvailable: true,
      origin: {
        type: 'delivery_policy_manual',
        policyId: updatedPolicy.policyId,
        policyName: updatedPolicy.name,
      },
      delivery: {
        deliveredAt: completedAt,
        statusCode: 202,
        authentication: {
          kind:
            updatedPolicy.transport?.type === 'webhook'
            && updatedPolicy.transport.credentialKey
              ? 'bearer'
              : 'none',
          credentialKey:
            updatedPolicy.transport?.type === 'webhook'
              ? (updatedPolicy.transport.credentialKey ?? null)
              : null,
        },
      },
      error: null,
    }
  demoState.requesterComparisonDeliveryRuns = [run, ...demoState.requesterComparisonDeliveryRuns]

  return {
    policy: {
      policyId: updatedPolicy.policyId,
      comparisonSetId: updatedPolicy.comparisonSetId,
      name: updatedPolicy.name,
      cadence: updatedPolicy.cadence,
      enabled: updatedPolicy.enabled,
      lastRunAt: updatedPolicy.lastRunAt,
      lastRunStatus: updatedPolicy.lastRunStatus,
      lastRunError: updatedPolicy.lastRunError,
      nextRunAt: updatedPolicy.nextRunAt,
    },
    run: structuredClone(run),
    export: structuredClone(exportArtifact),
    delivery: {
      deliveredAt: completedAt,
      statusCode: 202,
      authentication: {
        kind: 'bearer',
        credentialKey:
          updatedPolicy.transport?.type === 'webhook'
            ? (updatedPolicy.transport.credentialKey ?? null)
            : null,
      },
    },
  }
}

function listDemoRequesterComparisonDeliveryRuns(
  comparisonSetId: string,
  policyId: string,
  filters?: {
    status?: 'completed' | 'failed'
    triggerType?: 'manual' | 'automation'
    replay?: 'all' | 'fresh_only' | 'replayed_only'
    limit?: number
  },
): RequesterComparisonSetDeliveryRunListViewModel {
  const storedItems = demoState.requesterComparisonDeliveryRuns.filter(
    (entry) => entry.comparisonSetId === comparisonSetId && entry.policyId === policyId,
  )
  const filteredItems = storedItems
    .filter((entry) => (filters?.status ? entry.status === filters.status : true))
    .filter((entry) => (filters?.triggerType ? entry.triggerType === filters.triggerType : true))
    .filter((entry) =>
      filters?.replay === 'fresh_only'
        ? entry.retriedRunId === null
        : filters?.replay === 'replayed_only'
          ? entry.retriedRunId !== null
          : true,
    )
  const items =
    typeof filters?.limit === 'number' ? filteredItems.slice(0, filters.limit) : filteredItems

  return {
    comparisonSetId,
    policyId,
    totalCount: items.length,
    storedCount: storedItems.length,
    appliedFilters: {
      status: filters?.status ?? null,
      triggerType: filters?.triggerType ?? null,
      replay: filters?.replay ?? 'all',
      limit: filters?.limit ?? null,
    },
    items: items.map(withDemoRetainedExportAvailability),
  }
}

function buildDemoRequesterComparisonDeliveryRetryResult(
  comparisonSetId: string,
  policyId: string,
  runId: string,
): RequesterComparisonSetDeliveryRunRetryResultViewModel {
  const previousRun = demoState.requesterComparisonDeliveryRuns.find(
    (entry) =>
      entry.comparisonSetId === comparisonSetId &&
      entry.policyId === policyId &&
      entry.runId === runId,
  )

  if (!previousRun) {
    throw new Error('Demo requester comparison delivery run not found')
  }

  if (previousRun.status !== 'failed') {
    throw new Error('Demo requester comparison delivery run can only retry a failed run')
  }

  if (!previousRun.exportId) {
    throw new Error('Demo requester comparison delivery retry requires a preserved export artifact')
  }

  if (!isDemoComparisonExportRetained(comparisonSetId, previousRun.exportId)) {
    throw new Error('Demo requester comparison delivery retry requires a retained export artifact')
  }

  const exportArtifact =
    demoState.requesterComparisonExports.find(
      (entry) =>
        entry.comparisonSet.comparisonSetId === comparisonSetId && entry.exportId === previousRun.exportId,
    )

  if (!exportArtifact) {
    throw new Error('Demo requester comparison delivery retained export not found')
  }

  const currentPolicy = getComparisonDeliveryPolicyOrThrow(comparisonSetId, policyId)
  const credentialKey =
    currentPolicy.transport?.type === 'webhook' ? (currentPolicy.transport.credentialKey ?? null) : null

  if (credentialKey && credentialKey !== 'ARENA_REQUESTER_WEBHOOK_BEARER') {
    updateComparisonDeliveryPolicy(comparisonSetId, policyId, (current) => ({
      ...current,
      lastRunAt: DEMO_NOW,
      lastRunStatus: 'failed',
      lastRunError: {
        code: 'requester_comparison_set_delivery.transport_credential_missing',
        message: 'Requester comparison set delivery credential is not configured',
      },
      updatedAt: DEMO_NOW,
    }))
    demoState.requesterComparisonDeliveryRuns = [
      {
        runId: `delivery-run-demo-retry-failed-${Date.now()}`,
        comparisonSetId,
        policyId,
        retriedRunId: previousRun.runId,
        triggerType: 'manual',
        status: 'failed',
        startedAt: DEMO_NOW,
        completedAt: DEMO_NOW,
        exportId: previousRun.exportId,
        retainedExportAvailable: true,
        origin: structuredClone(previousRun.origin),
        delivery: null,
        error: {
          code: 'requester_comparison_set_delivery.transport_credential_missing',
          message: 'Requester comparison set delivery credential is not configured',
        },
      },
      ...demoState.requesterComparisonDeliveryRuns,
    ]
    throw new Error('Requester comparison set delivery credential is not configured')
  }

  const completedAt = DEMO_NOW
  const updatedPolicy = updateComparisonDeliveryPolicy(comparisonSetId, policyId, (current) => ({
    ...current,
    lastRunAt: completedAt,
    lastRunStatus: 'completed',
    lastRunError: null,
    updatedAt: completedAt,
  }))
  const retryRunId = `delivery-run-demo-retry-${Date.now()}`
  const retryRun: RequesterComparisonSetDeliveryRunViewModel = {
    runId: retryRunId,
    comparisonSetId,
    policyId,
    retriedRunId: previousRun.runId,
    triggerType: 'manual',
    status: 'completed',
    startedAt: completedAt,
    completedAt,
    exportId: previousRun.exportId,
    retainedExportAvailable: true,
    origin: structuredClone(previousRun.origin),
    delivery: {
      deliveredAt: completedAt,
      statusCode: 202,
      authentication: {
        kind:
          updatedPolicy.transport?.type === 'webhook'
          && updatedPolicy.transport.credentialKey
            ? 'bearer'
            : 'none',
        credentialKey:
          updatedPolicy.transport?.type === 'webhook'
            ? (updatedPolicy.transport.credentialKey ?? null)
            : null,
      },
    },
    error: null,
  }
  demoState.requesterComparisonDeliveryRuns = [retryRun, ...demoState.requesterComparisonDeliveryRuns]

  return {
    retriedRunId: previousRun.runId,
    retryRunId,
    policy: {
      policyId: updatedPolicy.policyId,
      comparisonSetId: updatedPolicy.comparisonSetId,
      name: updatedPolicy.name,
      cadence: updatedPolicy.cadence,
      enabled: updatedPolicy.enabled,
      lastRunAt: updatedPolicy.lastRunAt,
      lastRunStatus: updatedPolicy.lastRunStatus,
      lastRunError: updatedPolicy.lastRunError,
      nextRunAt: updatedPolicy.nextRunAt,
    },
    run: structuredClone(retryRun),
    export: structuredClone(exportArtifact),
    delivery: {
      deliveredAt: completedAt,
      statusCode: 202,
      authentication: {
        kind: 'bearer',
        credentialKey:
          updatedPolicy.transport?.type === 'webhook'
            ? (updatedPolicy.transport.credentialKey ?? null)
            : null,
      },
    },
  }
}

function buildDemoPublicSettledResults(): PublicSettledResultsViewModel {
  return {
    totalCount: 3,
    items: [
      {
        propositionId: 'demo-proposition-public-trust',
        marketId: 'public-trust',
        title: '公众是否认为本季度公共服务响应速度有所改善？',
        category: 'politics',
        winningOptionLabel: '改善明显',
        resultKind: 'resolved',
        winningOption: 0,
        voidReason: null,
        validSampleCount: 612,
        winMarginPercent: 58.3,
        settledAt: '2026-04-18T08:00:00.000Z',
        settlementTxHash: '0x3a8f00000000000000000000000000000000000000000000000000000000e291',
        onChain: true,
      },
      {
        propositionId: 'demo-proposition-ai-regulation',
        marketId: 'ai-model-review',
        title: '多数受访者是否支持对生成式 AI 实施行业自律规范？',
        category: 'ai',
        winningOptionLabel: '支持自律规范',
        resultKind: 'resolved',
        winningOption: 0,
        voidReason: null,
        validSampleCount: 480,
        winMarginPercent: 61.7,
        settledAt: '2026-03-31T08:00:00.000Z',
        settlementTxHash: '0xb12c000000000000000000000000000000000000000000000000000000007f04',
        onChain: true,
      },
      {
        propositionId: 'demo-proposition-defi-adoption',
        marketId: 'btc-network-fee',
        title: '链上用户是否认为 DeFi 协议在 2026 Q1 安全性有所提升？',
        category: 'general',
        winningOptionLabel: '安全性有所提升',
        resultKind: 'resolved',
        winningOption: 0,
        voidReason: null,
        validSampleCount: 344,
        winMarginPercent: 54.1,
        settledAt: '2026-02-28T08:00:00.000Z',
        settlementTxHash: '0x9d4400000000000000000000000000000000000000000000000000000000a812',
        onChain: true,
      },
    ],
  }
}

function buildDemoPublicIntegrityOverview(): PublicIntegrityOverviewViewModel {
  return {
    generatedAt: DEMO_NOW,
    live: {
      totalCount: 3,
      reachedSampleThresholdCount: 2,
      marketEnabledCount: 3,
      phaseBreakdown: [
        { phase: 'live', label: '采集中', count: 2 },
        { phase: 'revealing', label: '开奖中', count: 1 },
      ],
      items: [
        {
          propositionId: 'demo-integrity-ai-sampling',
          title: 'AI 工具在客服响应中是否显著提升满意度？',
          category: 'ai',
          phase: 'live',
          effectiveSampleCount: 128,
          requiredSampleCount: 200,
          progressPercent: 64,
          reachedSampleThreshold: false,
          marketEnabled: true,
          deadlineAt: plusDays(2),
        },
        {
          propositionId: 'demo-integrity-public-service',
          title: '多数受访者是否认可本月公共服务响应改善？',
          category: 'politics',
          phase: 'live',
          effectiveSampleCount: 244,
          requiredSampleCount: 200,
          progressPercent: 100,
          reachedSampleThreshold: true,
          marketEnabled: true,
          deadlineAt: plusHours(18),
        },
        {
          propositionId: 'demo-integrity-sports-reveal',
          title: '球迷是否认为联赛新规提升了现场观赛体验？',
          category: 'sports',
          phase: 'revealing',
          effectiveSampleCount: 182,
          requiredSampleCount: 180,
          progressPercent: 100,
          reachedSampleThreshold: true,
          marketEnabled: true,
          deadlineAt: plusHours(4),
        },
      ],
    },
    archive: {
      settledCount: 3,
      onChainCount: 3,
      averageValidSampleCount: 479,
      latestSettledAt: '2026-04-18T08:00:00.000Z',
      recentItems: [
        {
          propositionId: 'demo-integrity-city-budget',
          title: '鏄惁搴旇鎶婂煄甯傞绠楃殑澧為噺閮ㄥ垎浼樺厛鐢ㄤ簬鍏叡浜ら€氾紵',
          category: 'politics',
          settledAt: '2026-04-18T08:00:00.000Z',
          settlementTxHash: '0x8bf1ac2f0d4a91c5d4f9b8d0f4f3b183d5d0a23a8c1b5d6e7f8091a2b3c4d5e6',
          onChain: true,
        },
        {
          propositionId: 'demo-integrity-ai-copilot',
          title: 'AI 缂栫▼鍓┚鏄惁宸茬粡鎴愪负鍥㈤槦鏍囬厤宸ュ叿锛?',
          category: 'ai',
          settledAt: '2026-04-12T06:30:00.000Z',
          settlementTxHash: '0x7cf1ac2f0d4a91c5d4f9b8d0f4f3b183d5d0a23a8c1b5d6e7f8091a2b3c4d5e7',
          onChain: true,
        },
        {
          propositionId: 'demo-integrity-sports-reform',
          title: '鐞冭糠鏄惁璁や负鑱旇禌鏂拌鐪熸鎻愬崌浜嗘瘮璧涜鎰燂紵',
          category: 'sports',
          settledAt: '2026-04-03T03:15:00.000Z',
          settlementTxHash: '0x6df1ac2f0d4a91c5d4f9b8d0f4f3b183d5d0a23a8c1b5d6e7f8091a2b3c4d5e8',
          onChain: true,
        },
      ],
    },
    focus: {
      propositionId: 'demo-integrity-public-service',
      visible: true,
      source: 'live',
      liveItem: {
        propositionId: 'demo-integrity-public-service',
        title: '澶氭暟鍙楄鑰呮槸鍚﹁鍙湰鏈堝叕鍏辨湇鍔″搷搴旀敼鍠勶紵',
        category: 'politics',
        phase: 'live',
        effectiveSampleCount: 244,
        requiredSampleCount: 200,
        progressPercent: 100,
        reachedSampleThreshold: true,
        marketEnabled: true,
        deadlineAt: plusHours(18),
      },
      archiveItem: null,
    },
  }
}

function buildDemoPublicRespondentLeaderboard(): PublicRespondentLeaderboardViewModel {
  return {
    categories: [
      {
        id: 'dao',
        label: 'DAO',
        description: 'DAO 治理、国库、委托与协议研究命题的回答率排行。',
        rows: [
          {
            handle: 'delegate.scope',
            walletShort: '0x5ab1…8d42',
            responseRatePercent: 95.8,
            reviewedCount: 148,
            acceptedCount: 141,
            reputationScore: 1886,
            topTag: 'DAO 研究',
          },
        ],
      },
      {
        id: 'public-policy',
        label: '公共政策',
        description: '公共政策、公共服务、舆情类命题的回答率排行。',
        rows: [
          {
            handle: 'civic.signal',
            walletShort: '0x4f12…b9c3',
            responseRatePercent: 96.4,
            reviewedCount: 142,
            acceptedCount: 137,
            reputationScore: 1840,
            topTag: '公共服务',
          },
        ],
      },
      {
        id: 'ai-research',
        label: 'AI 调研',
        description: 'AI 工具链、模型调研、开发者工作流类命题的回答率排行。',
        rows: [
          {
            handle: 'kernel.research',
            walletShort: '0x82ad…3a14',
            responseRatePercent: 94.7,
            reviewedCount: 165,
            acceptedCount: 156,
            reputationScore: 1925,
            topTag: '开发者调研',
          },
        ],
      },
      {
        id: 'geopolitics',
        label: '地缘事件',
        description: '地缘动态、跨境观察类命题的回答率排行。',
        rows: [
          {
            handle: 'border.brief',
            walletShort: '0x6e10…12bd',
            responseRatePercent: 95.2,
            reviewedCount: 134,
            acceptedCount: 128,
            reputationScore: 1788,
            topTag: '跨境观察',
          },
        ],
      },
      {
        id: 'finance',
        label: '金融观察',
        description: '宏观金融、市场动态、价格趋势类命题的回答率排行。',
        rows: [
          {
            handle: 'macro.scope',
            walletShort: '0xf432…1198',
            responseRatePercent: 93.6,
            reviewedCount: 138,
            acceptedCount: 129,
            reputationScore: 1812,
            topTag: '宏观判断',
          },
        ],
      },
      {
        id: 'sports',
        label: '体育结果',
        description: '体育赛事、赛季积分、赛前共识类命题的回答率排行。',
        rows: [
          {
            handle: 'court.notes',
            walletShort: '0x9d77…3aa0',
            responseRatePercent: 92.4,
            reviewedCount: 121,
            acceptedCount: 112,
            reputationScore: 1648,
            topTag: '赛季积分',
          },
        ],
      },
    ],
  }
}

function listStoredDemoComparisonExports(
  comparisonSetId: string,
): RequesterOwnedComparisonSetExportArtifactViewModel[] {
  return demoState.requesterComparisonExports.filter(
    (item) => item.comparisonSet.comparisonSetId === comparisonSetId,
  )
}

function buildFallbackDemoComparisonExportFromRun(
  comparisonSetId: string,
  exportId: string,
): RequesterOwnedComparisonSetExportArtifactViewModel | null {
  if (!isDemoComparisonExportRetained(comparisonSetId, exportId)) {
    return null
  }

  const matchingRun = demoState.requesterComparisonDeliveryRuns
    .filter(
      (entry) =>
        entry.comparisonSetId === comparisonSetId && entry.exportId === exportId,
    )
    .sort(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt)
        || Date.parse(right.startedAt) - Date.parse(left.startedAt),
    )[0]

  if (!matchingRun) {
    return null
  }

  return buildDemoRequesterComparisonExport(comparisonSetId, {
    exportId,
    requestedAt: matchingRun.completedAt,
    completedAt: matchingRun.completedAt,
    origin: structuredClone(matchingRun.origin),
  })
}

function ensureDemoToken(token: string) {
  if (token !== DEMO_SESSION_TOKEN) {
    throw new Error('Demo session token required')
  }
}

function saveWatchlistFromMarketIds(marketIds: string[]) {
  const items = marketIds
    .map((marketId, index) => demoState.markets.find((market) => market.marketId === marketId))
    .filter((market): market is ValidationMarketViewModel => Boolean(market))
    .map((market, index) => ({
      marketId: market.marketId,
      propositionId: market.propositionId,
      propositionTitle: market.title,
      category: market.category,
      savedAt: minusHours(index + 1),
    }))

  demoState.watchlist = {
    totalCount: items.length,
    items,
  }
}

export const demoBackend = {
  isDemoToken(token: string | null | undefined) {
    return token === DEMO_SESSION_TOKEN
  },
  hasDiscoveryConfigOverrides() {
    return hasDemoDiscoveryConfigOverrides()
  },
  createChallenge(walletAddress: string, chainId: number): AuthChallengeResponse {
    return {
      walletAddress,
      chainId,
      nonce: 'demo-nonce',
      message: 'Demo login does not require wallet signature.',
      expiresAt: plusHours(1),
    }
  },
  verifyAuthSignature(chainId: number): AuthVerifyResponse {
    const identity = buildDemoIdentity(chainId)
    demoState.identity = identity

    return {
      accessToken: DEMO_SESSION_TOKEN,
      identity,
    }
  },
  getAuthProfile(token: string): JwtIdentity {
    ensureDemoToken(token)
    return demoState.identity
  },
  getValidationMarkets(token?: string | null): ValidationMarketViewModel[] {
    if (!token || token === DEMO_SESSION_TOKEN) {
      return structuredClone(demoState.markets)
    }

    return structuredClone(demoState.markets)
  },
  getValidationMarket(marketId: string): ValidationMarketViewModel {
    const market = demoState.markets.find((entry) => entry.marketId === marketId)
    if (!market) {
      throw new Error('Demo market not found')
    }

    return structuredClone(market)
  },
  searchValidationMarkets(query: string): ValidationMarketViewModel[] {
    const normalizedQuery = query.trim().toLowerCase()
    const markets = structuredClone(demoState.markets)

    if (!normalizedQuery) {
      return markets
    }

    return markets.filter((market) =>
      `${market.title} ${market.category} ${market.options.join(' ')}`
        .toLowerCase()
        .includes(normalizedQuery),
    )
  },
  placeValidationBet(input: {
    marketId: string
    propositionId: string
    chainId: number
    selectedOption: 0 | 1
    stakeAmount: string
    placedAt: string
  }): PlaceValidationBetResult {
    demoState.markets = demoState.markets.map((market) =>
      market.marketId === input.marketId
        ? {
            ...market,
            currentUserPosition: buildCurrentUserPosition(
              input.selectedOption,
              input.stakeAmount,
              input.placedAt,
            ),
          }
        : market,
    )

    const marketView = demoState.markets.find((market) => market.marketId === input.marketId)!

    return {
      marketView: structuredClone(marketView),
      positionId: `position-${input.marketId}-${Date.now()}`,
      execution: {
        mode: 'demo_bypass',
        stage: 'position_recorded',
        requiresWalletSignature: false,
        usesDemoFlow: true,
        chainId: input.chainId,
        txHash: null,
        submittedAt: input.placedAt,
        recordedAt: input.placedAt,
        statusLabel: 'Demo position recorded',
        detail: 'Arena skipped wallet signing and recorded the seeded demo position immediately.',
      },
    }
  },
  listDrafts(): PropositionDraftRecord[] {
    return structuredClone(demoState.drafts)
  },
  listSubmissions(): PropositionDraftRecord[] {
    return structuredClone(
      demoState.drafts.filter((draft) => draft.submissionStatus === 'submitted'),
    )
  },
  getRequesterOverview(): RequesterOwnedPropositionOverviewRecord {
    return structuredClone(buildRequesterOverview(demoState.drafts))
  },
  getOwnedPropositionDetail(propositionId: string): RequesterOwnedPropositionDetailRecord {
    const draft = demoState.drafts.find((entry) => entry.propositionId === propositionId)
    if (!draft) {
      throw new Error('Demo submission not found')
    }

    return structuredClone(buildDemoSubmissionDetail(draft))
  },
  getOwnedPropositionBudgetLedger(propositionId: string): RequesterPropositionBudgetLedgerRecord {
    const draft = demoState.drafts.find((entry) => entry.propositionId === propositionId)
    if (!draft) {
      throw new Error('Demo submission budget ledger not found')
    }

    return structuredClone(buildDemoBudgetLedger(draft))
  },
  getOwnedPropositionReport(propositionId: string): RequesterOwnedSettledPropositionReportRecord {
    const draft = demoState.drafts.find((entry) => entry.propositionId === propositionId)
    if (!draft || draft.status !== 'settled') {
      throw new Error('Demo settled report is unavailable before settlement')
    }

    return structuredClone(buildDemoSettledRequesterReport(draft))
  },
  getOwnedPropositionExport(exportId: string): RequesterOwnedPropositionExportRecord {
    const record = demoState.requesterExports.find((item) => item.exportId === exportId)
    if (!record) {
      throw new Error('Demo requester export not found')
    }

    return structuredClone(record)
  },
  listOwnedPropositionExports(): RequesterOwnedPropositionExportListRecord {
    return structuredClone({
      totalCount: demoState.requesterExports.length,
      items: demoState.requesterExports.map((item) => ({
        exportId: item.exportId,
        status: item.status,
        format: item.format,
        requestedAt: item.requestedAt,
        completedAt: item.completedAt,
        fileName: item.fileName,
        preset: item.preset
          ? {
              presetId: item.preset.presetId,
              name: item.preset.name,
            }
          : null,
        metrics: item.metrics,
      })),
    })
  },
  listRequesterReportPresets(): RequesterReportPresetListViewModel {
    const items = Array.from(demoRequesterReportPresets.values()).map((preset) => ({
      presetId: preset.presetId,
      name: preset.name,
      description: preset.description,
      updatedAt: preset.updatedAt,
    }))
    return structuredClone({
      totalCount: items.length,
      items,
    })
  },
  listRequesterComparisonSets(): RequesterComparisonSetListRecord {
    const items = Array.from(demoRequesterComparisonSets.values()).map((set) => ({
      comparisonSetId: set.comparisonSetId,
      name: set.name,
      description: set.description,
      presetIds: set.presetIds,
      updatedAt: set.updatedAt,
    }))
    return structuredClone({
      totalCount: items.length,
      items,
    })
  },
  listRequesterDeliveryCredentials(): RequesterDeliveryCredentialDirectoryViewModel {
    return structuredClone({
      totalCount: 1,
      items: [
        {
          credentialKey: 'ARENA_REQUESTER_WEBHOOK_BEARER',
          label: 'ARENA_REQUESTER_WEBHOOK_BEARER',
          transportType: 'webhook',
          authenticationKind: 'bearer',
        },
      ],
    })
  },
  listRequesterComparisonSetDeliveryPolicies(
    comparisonSetId: string,
  ): RequesterComparisonSetDeliveryPolicyListViewModel {
    const items = demoState.requesterComparisonDeliveryPolicies.filter(
      (entry) => entry.comparisonSetId === comparisonSetId,
    )

    return structuredClone({
      comparisonSetId,
      totalCount: items.length,
      items,
    })
  },
  createRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    body: CreateRequesterComparisonSetDeliveryPolicyInputRecord,
  ): RequesterComparisonSetDeliveryPolicyViewModel {
    return structuredClone(createDemoComparisonDeliveryPolicy(comparisonSetId, body))
  },
  updateRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
    body: UpdateRequesterComparisonSetDeliveryPolicyInputRecord,
  ): RequesterComparisonSetDeliveryPolicyViewModel {
    return structuredClone(
      updateComparisonDeliveryPolicy(comparisonSetId, policyId, (current) => ({
        ...current,
        name: body.name ?? current.name,
        description: body.description ?? current.description,
        cadence: body.cadence ?? current.cadence,
        nextRunAt: body.nextRunAt ?? current.nextRunAt,
        enabled: body.enabled ?? current.enabled,
        retainedExportCount: body.retainedExportCount ?? current.retainedExportCount,
        transport: body.transport === undefined ? current.transport : (body.transport ?? null),
        updatedAt: DEMO_NOW,
      })),
    )
  },
  deleteRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
  ): DeleteRequesterComparisonSetDeliveryPolicyResultRecord {
    return structuredClone(deleteDemoComparisonDeliveryPolicy(comparisonSetId, policyId))
  },
  getRequesterComparisonSetAnalytics(
    comparisonSetId: string,
  ): RequesterComparisonSetAnalyticsRecord {
    return structuredClone(buildDemoRequesterComparisonAnalytics(comparisonSetId))
  },

  // -------------------------------------------------------------------------
  // Demo fallbacks for the recently added respondent / requester endpoints.
  // -------------------------------------------------------------------------
  getRespondentPropositionResult(propositionId: string) {
    const market = demoState.markets.find((entry) => entry.propositionId === propositionId)
    if (!market) {
      throw new Error('Demo proposition result not found')
    }
    return {
      propositionId,
      resultKind: 'resolved' as const,
      winningOption: 0 as const,
      voidReason: null,
      settledAt: minusHours(1),
      currentUserRewardStatus: 'finalized' as const,
      currentUserSettlementOutcome: 'won' as const,
    }
  },
  getSubmission(propositionId: string): PropositionDraftRecord {
    const draft = demoState.drafts.find(
      (entry) => entry.propositionId === propositionId && entry.submissionStatus === 'submitted',
    )
    if (!draft) {
      throw new Error('Demo submission not found')
    }
    return structuredClone(draft)
  },
  listOwnedPropositions(): RequesterOwnedPropositionRecentItemViewModel[] {
    return demoState.drafts.map((draft) => ({
      propositionId: draft.propositionId,
      title: draft.title,
      category: draft.category,
      status: draft.status,
      submissionStatus: draft.submissionStatus,
      submittedAt: draft.submittedAt,
      marketEnabled: draft.marketEnabled,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      publishedAt: null,
      liveAt: null,
      frozenAt: null,
      settledAt: null,
      minEffectiveSample: draft.minEffectiveSample,
      effectiveSampleCount: 0,
      reviewedResponseCount: 0,
      revealSettlement: {
        resultKind: null,
        winningOption: null,
      },
    }))
  },
  getRequesterAnalytics(filters?: { windowDays?: number; now?: string; presetId?: string }) {
    const settledDrafts = demoState.drafts.filter((draft) => draft.status === 'settled')
    const unresolved = demoState.drafts.length - settledDrafts.length
    const window = filters?.windowDays ?? 30
    const now = filters?.now ?? minusHours(0)
    const windowStartedAt = new Date(Date.parse(now) - window * 24 * 60 * 60 * 1000).toISOString()
    const presetSnapshot = filters?.presetId
      ? demoRequesterReportPresets.get(filters.presetId) ?? null
      : null
    return structuredClone({
      windowDays: window,
      now,
      windowStartedAt,
      preset: presetSnapshot
        ? {
            presetId: presetSnapshot.presetId,
            name: presetSnapshot.name,
            statusScope: presetSnapshot.config.statusScope,
            categories: presetSnapshot.config.categories,
            marketEnabledOnly: presetSnapshot.config.marketEnabledOnly,
          }
        : null,
      totals: {
        createdCount: demoState.drafts.length,
        settledCount: settledDrafts.length,
        unresolvedCount: unresolved,
        marketEnabledCount: demoState.drafts.filter((draft) => draft.marketEnabled).length,
        totalEffectiveSampleCount: 0,
        totalReviewedResponseCount: 0,
        totalBetCount: 0,
        totalBetStakeAmount: '0',
        uniqueTraderCount: 0,
      },
      lifecycle: {
        averageHoursToPublish: null,
        averageHoursToLive: null,
        averageHoursToFreeze: null,
        averageHoursToSettle: null,
      },
      categoryHistory: [],
      trend: [],
      delivery: {
        exportCount: demoState.requesterExports.length,
        latestExportAt: null,
        latestExportId: null,
      },
    } satisfies RequesterOwnedPropositionAnalyticsViewModel)
  },
  compareRequesterAnalytics(body: { presetIds: string[]; now?: string }) {
    return structuredClone({
      totalCount: body.presetIds.length,
      summary: {
        presetCount: body.presetIds.length,
        topPresetByCreatedCount: null,
        topPresetBySettledCount: null,
        topPresetByBetStakeAmount: null,
        totals: {
          createdCount: 0,
          settledCount: 0,
          unresolvedCount: 0,
          totalEffectiveSampleCount: 0,
          totalReviewedResponseCount: 0,
          totalBetCount: 0,
          totalBetStakeAmount: '0',
          uniqueTraderCount: 0,
        },
      },
      items: body.presetIds.map((presetId) => {
        const preset = demoRequesterReportPresets.get(presetId)
        return {
          preset: {
            presetId,
            name: preset?.name ?? presetId,
            statusScope: preset?.config.statusScope ?? 'all',
            categories: preset?.config.categories ?? [],
            marketEnabledOnly: preset?.config.marketEnabledOnly ?? false,
          },
          analytics: this.getRequesterAnalytics({ presetId, now: body.now }),
        }
      }),
    } satisfies RequesterOwnedPropositionAnalyticsComparisonViewModel)
  },
  createRequesterReportPreset(body: CreateRequesterReportPresetInputRecord): RequesterReportPresetViewModel {
    const presetId = `preset-demo-${demoRequesterReportPresetCounter++}`
    const now = minusHours(0)
    const preset: RequesterReportPresetViewModel = {
      presetId,
      name: body.name,
      description: body.description ?? null,
      config: {
        windowDays: body.windowDays ?? 30,
        categories: body.categories ?? [],
        marketEnabledOnly: body.marketEnabledOnly ?? false,
        statusScope: body.statusScope ?? 'all',
        defaultExportFormat: body.defaultExportFormat ?? 'json',
      },
      createdAt: now,
      updatedAt: now,
    }
    demoRequesterReportPresets.set(presetId, preset)
    return structuredClone(preset)
  },
  getRequesterReportPreset(presetId: string): RequesterReportPresetViewModel {
    const preset = demoRequesterReportPresets.get(presetId)
    if (!preset) {
      throw new Error(`Demo requester report preset ${presetId} not found`)
    }
    return structuredClone(preset)
  },
  updateRequesterReportPreset(
    presetId: string,
    body: UpdateRequesterReportPresetInputRecord,
  ): RequesterReportPresetViewModel {
    const current = demoRequesterReportPresets.get(presetId)
    if (!current) {
      throw new Error(`Demo requester report preset ${presetId} not found`)
    }
    const next: RequesterReportPresetViewModel = {
      ...current,
      name: body.name ?? current.name,
      description: body.description !== undefined ? body.description ?? null : current.description,
      config: {
        windowDays: body.windowDays ?? current.config.windowDays,
        categories: body.categories ?? current.config.categories,
        marketEnabledOnly: body.marketEnabledOnly ?? current.config.marketEnabledOnly,
        statusScope: body.statusScope ?? current.config.statusScope,
        defaultExportFormat: body.defaultExportFormat ?? current.config.defaultExportFormat,
      },
      updatedAt: minusHours(0),
    }
    demoRequesterReportPresets.set(presetId, next)
    return structuredClone(next)
  },
  deleteRequesterReportPreset(presetId: string) {
    if (!demoRequesterReportPresets.has(presetId)) {
      throw new Error(`Demo requester report preset ${presetId} not found`)
    }
    demoRequesterReportPresets.delete(presetId)
    return { presetId, deleted: true as const }
  },
  createRequesterComparisonSet(
    body: CreateRequesterComparisonSetInputRecord,
  ): RequesterComparisonSetViewModel {
    const comparisonSetId = `comparison-set-demo-${demoRequesterComparisonSetCounter++}`
    const now = minusHours(0)
    const set: RequesterComparisonSetViewModel = {
      comparisonSetId,
      name: body.name,
      description: body.description ?? null,
      presetIds: body.presetIds,
      createdAt: now,
      updatedAt: now,
    }
    demoRequesterComparisonSets.set(comparisonSetId, set)
    return structuredClone(set)
  },
  getRequesterComparisonSet(comparisonSetId: string): RequesterComparisonSetViewModel {
    const set = demoRequesterComparisonSets.get(comparisonSetId)
    if (!set) {
      throw new Error(`Demo requester comparison set ${comparisonSetId} not found`)
    }
    return structuredClone(set)
  },
  updateRequesterComparisonSet(
    comparisonSetId: string,
    body: UpdateRequesterComparisonSetInputRecord,
  ): RequesterComparisonSetViewModel {
    const current = demoRequesterComparisonSets.get(comparisonSetId)
    if (!current) {
      throw new Error(`Demo requester comparison set ${comparisonSetId} not found`)
    }
    const next: RequesterComparisonSetViewModel = {
      ...current,
      name: body.name ?? current.name,
      description:
        body.description !== undefined ? body.description ?? null : current.description,
      presetIds: body.presetIds ?? current.presetIds,
      updatedAt: minusHours(0),
    }
    demoRequesterComparisonSets.set(comparisonSetId, next)
    return structuredClone(next)
  },
  deleteRequesterComparisonSet(comparisonSetId: string) {
    if (!demoRequesterComparisonSets.has(comparisonSetId)) {
      throw new Error(`Demo requester comparison set ${comparisonSetId} not found`)
    }
    demoRequesterComparisonSets.delete(comparisonSetId)
    return { comparisonSetId, deleted: true as const }
  },
  getChainSnapshot(): ChainSnapshot {
    return {
      rpcUrl: 'http://127.0.0.1:8545',
      configuredChainId: DEMO_CHAIN_ID,
      connectedChainId: DEMO_CHAIN_ID,
      contractAddress: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      artifactPath: 'demo://artifacts/arena.demo.json',
    }
  },

  getRequesterComparisonSetDeliveryPolicyHealth(
    comparisonSetId: string,
    policyId: string,
  ): RequesterComparisonSetDeliveryPolicyHealthViewModel {
    demoState = {
      ...demoState,
      requesterComparisonDeliveryHealthReadCount:
        demoState.requesterComparisonDeliveryHealthReadCount + 1,
    }

    const checkedAt = new Date(
      Date.parse(DEMO_NOW) + demoState.requesterComparisonDeliveryHealthReadCount * 60 * 1000,
    ).toISOString()

    return structuredClone(
      buildDemoRequesterComparisonDeliveryHealth(comparisonSetId, policyId, checkedAt),
    )
  },
  listRequesterComparisonSetExports(
    comparisonSetId: string,
    filters?: {
      origin?: RequesterComparisonSetExportOriginFilterRecord
      policyId?: string
      limit?: number
    },
  ): RequesterOwnedComparisonSetExportListViewModel {
    const comparisonSet = buildDemoRequesterComparisonSets().items.find(
      (item) => item.comparisonSetId === comparisonSetId,
    )

    if (!comparisonSet) {
      throw new Error('Demo requester comparison set not found')
    }

    const items = listStoredDemoComparisonExports(comparisonSetId)
      .filter((item) => (filters?.origin ? item.origin.type === filters.origin : true))
      .filter((item) => (filters?.policyId ? item.origin.policyId === filters.policyId : true))
    const limitedItems =
      typeof filters?.limit === 'number' ? items.slice(0, filters.limit) : items

    return structuredClone({
      comparisonSet: {
        comparisonSetId,
        name: comparisonSet.name,
      },
      totalCount: limitedItems.length,
      storedCount: items.length,
      appliedFilters: {
        origin: filters?.origin ?? null,
        policyId: filters?.policyId ?? null,
        limit: filters?.limit ?? null,
      },
      items: limitedItems.map((item) => ({
        exportId: item.exportId,
        status: item.status,
        format: item.format,
        requestedAt: item.requestedAt,
        completedAt: item.completedAt,
        fileName: item.fileName,
        origin: structuredClone(item.origin),
        comparisonSet: {
          comparisonSetId: item.comparisonSet.comparisonSetId,
          name: item.comparisonSet.name,
        },
      })),
    })
  },
  getRequesterComparisonSetExport(
    comparisonSetId: string,
    exportId: string,
  ): RequesterComparisonSetExportRecord {
    const record =
      listStoredDemoComparisonExports(comparisonSetId).find(
        (item) => item.exportId === exportId,
      )
      ?? buildFallbackDemoComparisonExportFromRun(comparisonSetId, exportId)

    if (!record) {
      throw new Error('Demo requester comparison export not found')
    }

    return structuredClone(record)
  },
  createRequesterComparisonSetExport(
    comparisonSetId: string,
    body?: { format?: 'json' | 'csv' },
  ): RequesterComparisonSetExportRecord {
    const exportArtifact = buildDemoRequesterComparisonExport(comparisonSetId, {
      format: body?.format ?? 'json',
    })
    upsertDemoComparisonExport(exportArtifact)
    return structuredClone(exportArtifact)
  },
  deleteRequesterComparisonSetExport(
    comparisonSetId: string,
    exportId: string,
  ): DeleteRequesterComparisonSetExportResultRecord {
    const beforeCount = demoState.requesterComparisonExports.length
    demoState.requesterComparisonExports = demoState.requesterComparisonExports.filter(
      (item) =>
        !(
          item.comparisonSet.comparisonSetId === comparisonSetId
          && item.exportId === exportId
        ),
    )

    if (demoState.requesterComparisonExports.length === beforeCount) {
      throw new Error('Demo requester comparison export not found')
    }

    return structuredClone({
      comparisonSetId,
      exportId,
      deleted: true,
    })
  },
  runRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
  ): RequesterComparisonSetDeliveryPolicyRunResultViewModel {
    return structuredClone(buildDemoRequesterComparisonDeliveryRunResult(comparisonSetId, policyId))
  },
  listRequesterComparisonSetDeliveryRuns(
    comparisonSetId: string,
    policyId: string,
    filters?: {
      status?: RequesterComparisonSetDeliveryRunStatusFilterRecord
      triggerType?: RequesterComparisonSetDeliveryRunTriggerTypeFilterRecord
      replay?: RequesterComparisonSetDeliveryRunReplayFilterRecord
      limit?: number
    },
  ): RequesterComparisonSetDeliveryRunListViewModel {
    return structuredClone(
      listDemoRequesterComparisonDeliveryRuns(comparisonSetId, policyId, filters),
    )
  },
  retryRequesterComparisonSetDeliveryRun(
    comparisonSetId: string,
    policyId: string,
    runId: string,
  ): RequesterComparisonSetDeliveryRunRetryResultViewModel {
    return structuredClone(
      buildDemoRequesterComparisonDeliveryRetryResult(comparisonSetId, policyId, runId),
    )
  },
  pauseRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
  ): RequesterComparisonSetDeliveryPolicyViewModel {
    return structuredClone(
      updateComparisonDeliveryPolicy(comparisonSetId, policyId, (current) => ({
        ...current,
        enabled: false,
        updatedAt: DEMO_NOW,
      })),
    )
  },
  resumeRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
  ): RequesterComparisonSetDeliveryPolicyViewModel {
    return structuredClone(
      updateComparisonDeliveryPolicy(comparisonSetId, policyId, (current) => ({
        ...current,
        enabled: true,
        updatedAt: DEMO_NOW,
      })),
    )
  },
  createOwnedPropositionExport(body: { presetId?: string; format?: 'json' | 'csv' }): RequesterOwnedPropositionExportRecord {
    const requestedAt = DEMO_NOW
    const exportId = `requester-export-${Date.now()}`
    const record = buildDemoRequesterExport(exportId, requestedAt, body.presetId, body.format ?? 'json')
    demoState.requesterExports = [record, ...demoState.requesterExports]
    return structuredClone(record)
  },
  getDraft(propositionId: string): PropositionDraftRecord {
    const draft = demoState.drafts.find((entry) => entry.propositionId === propositionId)
    if (!draft) {
      throw new Error('Demo draft not found')
    }

    return structuredClone(draft)
  },
  createDraft(body: Omit<PropositionDraftRecord, 'propositionId' | 'status' | 'submissionStatus' | 'createdAt' | 'updatedAt' | 'submittedAt'>): PropositionDraftRecord {
    const propositionId = `draft-demo-${Date.now()}`
    const draft: PropositionDraftRecord = {
      propositionId,
      ...body,
      status: 'draft',
      submissionStatus: 'draft',
      createdAt: DEMO_NOW,
      updatedAt: DEMO_NOW,
      submittedAt: null,
    }

    demoState.drafts = [draft, ...demoState.drafts]
    return structuredClone(draft)
  },
  updateDraft(
    propositionId: string,
    body: Partial<Omit<PropositionDraftRecord, 'propositionId' | 'status' | 'submissionStatus' | 'createdAt' | 'updatedAt' | 'submittedAt'>>,
  ): PropositionDraftRecord {
    let nextDraft: PropositionDraftRecord | null = null

    demoState.drafts = demoState.drafts.map((draft) => {
      if (draft.propositionId !== propositionId) {
        return draft
      }

      nextDraft = {
        ...draft,
        ...body,
        updatedAt: DEMO_NOW,
      }

      return nextDraft
    })

    if (!nextDraft) {
      throw new Error('Demo draft not found')
    }

    return structuredClone(nextDraft)
  },
  submitDraft(propositionId: string): PropositionDraftRecord {
    let nextDraft: PropositionDraftRecord | null = null

    demoState.drafts = demoState.drafts.map((draft) => {
      if (draft.propositionId !== propositionId) {
        return draft
      }

      nextDraft = {
        ...draft,
        submissionStatus: 'submitted',
        updatedAt: DEMO_NOW,
        submittedAt: DEMO_NOW,
      }

      return nextDraft
    })

    if (!nextDraft) {
      throw new Error('Demo draft not found')
    }

    return structuredClone(nextDraft)
  },
  withdrawSubmission(propositionId: string): PropositionDraftRecord {
    let nextDraft: PropositionDraftRecord | null = null

    demoState.drafts = demoState.drafts.map((draft) => {
      if (draft.propositionId !== propositionId) {
        return draft
      }

      nextDraft = {
        ...draft,
        submissionStatus: 'draft',
        updatedAt: DEMO_NOW,
        submittedAt: null,
      }

      return nextDraft
    })

    if (!nextDraft) {
      throw new Error('Demo submission not found')
    }

    return structuredClone(nextDraft)
  },
  deleteDraft(propositionId: string) {
    demoState.drafts = demoState.drafts.filter((draft) => draft.propositionId !== propositionId)
    return {
      propositionId,
      archivedAt: DEMO_NOW,
    }
  },
  listAdjudicationTasks(): AdjudicationTaskViewModel[] {
    return structuredClone(demoState.tasks)
  },
  startAdjudicationTask(
    taskId: string,
    body: {
      startedAt: string
    },
  ): AdjudicationTaskViewModel {
    let nextTask: AdjudicationTaskViewModel | null = null

    demoState.tasks = demoState.tasks.map((task) => {
      if (task.taskId !== taskId) {
        return task
      }

      nextTask = {
        ...task,
        taskStatus: 'started',
        startedAt: body.startedAt,
      }

      return nextTask
    })

    if (!nextTask) {
      throw new Error('Demo adjudication task not found')
    }

    return structuredClone(nextTask)
  },
  skipAdjudicationTask(
    taskId: string,
    body: {
      skippedAt: string
      skipReason: string
    },
  ): AdjudicationTaskViewModel {
    let nextTask: AdjudicationTaskViewModel | null = null

    demoState.tasks = demoState.tasks.map((task) => {
      if (task.taskId !== taskId) {
        return task
      }

      nextTask = {
        ...task,
        taskStatus: 'skipped',
        timeRemainingSeconds: 0,
        skipReason: body.skipReason,
        cooldownUntil: new Date(new Date(body.skippedAt).getTime() + 12 * 60 * 60 * 1000).toISOString(),
      }

      return nextTask
    })

    if (!nextTask) {
      throw new Error('Demo adjudication task not found')
    }

    return structuredClone(nextTask)
  },
  submitAdjudicationResponse(
    taskId: string,
    body: {
      selectedOption: 0 | 1
      clientStartedAt: string
      submittedAt: string
    },
  ): SubmitAdjudicationResponseResult {
    let nextTask: AdjudicationTaskViewModel | null = null

    demoState.tasks = demoState.tasks.map((task) => {
      if (task.taskId !== taskId) {
        return task
      }

      nextTask = {
        ...task,
        hasSubmitted: true,
        taskStatus: 'submitted',
        startedAt: task.startedAt ?? body.clientStartedAt,
        submittedAt: body.submittedAt,
        latestResponseStatus: body.selectedOption === 0 ? 'valid' : 'pending_review',
        rewardStatus: 'pending',
        rewardPendingAmount: task.rewardPendingAmount ?? '10',
      }

      return nextTask
    })

    if (!nextTask) {
      throw new Error('Demo adjudication task not found')
    }

    return {
      taskView: structuredClone(nextTask),
      responseId: `demo-response-${taskId}`,
      duplicateRetry: false,
      reviewRequested: false,
      counterRebuildRequired: false,
    }
  },
  getAccountOverview(): RespondentAccountOverviewViewModel {
    return structuredClone(getOverview())
  },
  getAccountPreferences(): RespondentAccountPreferencesViewModel {
    return structuredClone(demoState.preferences)
  },
  updateAccountPreferences(body: UpdateRespondentAccountPreferencesInput): RespondentAccountPreferencesViewModel {
    demoState.preferences = {
      ...structuredClone(body),
      updatedAt: DEMO_NOW,
    }

    return structuredClone(demoState.preferences)
  },
  getAccountExports(): RespondentAccountExportListViewModel {
    return structuredClone(demoState.exports)
  },
  getAccountExport(exportId: string): RespondentAccountExportArtifactViewModel {
    if (demoState.latestExport?.exportId === exportId) {
      return structuredClone(demoState.latestExport)
    }

    const item = demoState.exports.items.find((entry) => entry.exportId === exportId)
    if (!item) {
      throw new Error(`Demo account export ${exportId} unavailable`)
    }

    return structuredClone({
      ...(demoState.latestExport ?? buildDemoExportArtifact(getOverview(), demoState.preferences, demoState.exports)),
      exportId: item.exportId,
      status: item.status,
      format: item.format,
      period: item.period,
      includeSettlementAttachment: item.includeSettlementAttachment,
      maskWalletAddress: item.maskWalletAddress,
      requestedAt: item.requestedAt,
      completedAt: item.completedAt,
      fileName: item.fileName,
    })
  },
  createAccountExport(): RespondentAccountExportArtifactViewModel {
    const exportId = `demo-export-${Date.now()}`
    const requestedAt = DEMO_NOW
    const completedAt = plusHours(1)
    const item = {
      exportId,
      status: 'completed' as const,
      format: 'json' as const,
      period: demoState.preferences.exports.period,
      includeSettlementAttachment: demoState.preferences.exports.includeSettlementAttachment,
      maskWalletAddress: demoState.preferences.exports.maskWalletAddress,
      requestedAt,
      completedAt,
      fileName: `arena-demo-export-${exportId}.json`,
      metrics: {
        rewardCount: demoState.rewards.length,
        settledResultCount: getOverview().resultOverview.settledResults.items.length,
        openPositionCount: getOverview().resultOverview.openPositions.items.length,
      },
    }

    demoState.exports = {
      totalCount: demoState.exports.totalCount + 1,
      items: [item, ...demoState.exports.items],
    }

    demoState.latestExport = {
      exportId,
      status: 'completed',
      format: 'json',
      period: item.period,
      includeSettlementAttachment: item.includeSettlementAttachment,
      maskWalletAddress: item.maskWalletAddress,
      requestedAt,
      completedAt,
      fileName: item.fileName,
      walletAddress: DEMO_WALLET_ADDRESS,
      overview: getOverview(),
      preferences: structuredClone(demoState.preferences),
      settlementAttachment: {
        generatedAt: completedAt,
        settledResultCount: 2,
        openPositionCount: 2,
        recentActivityCount: 4,
      },
    }

    return structuredClone(demoState.latestExport)
  },
  getWatchlist(): RespondentWatchlistViewModel {
    return structuredClone(demoState.watchlist)
  },
  saveWatchlistItem(marketId: string): UpdateRespondentWatchlistResultViewModel {
    const nextMarketIds = Array.from(new Set([marketId, ...demoState.watchlist.items.map((item) => item.marketId)]))
    saveWatchlistFromMarketIds(nextMarketIds)

    const market = demoState.markets.find((entry) => entry.marketId === marketId)!

    return {
      marketId,
      propositionId: market.propositionId,
      isSaved: true,
      savedAt: DEMO_NOW,
    }
  },
  removeWatchlistItem(marketId: string): UpdateRespondentWatchlistResultViewModel {
    const nextMarketIds = demoState.watchlist.items
      .map((item) => item.marketId)
      .filter((item) => item !== marketId)
    saveWatchlistFromMarketIds(nextMarketIds)

    const market = demoState.markets.find((entry) => entry.marketId === marketId)

    return {
      marketId,
      propositionId: market?.propositionId ?? '',
      isSaved: false,
      savedAt: null,
    }
  },
  getOpsDiscoveryGlobalConfig(): InternalDiscoveryGlobalConfigViewModel {
    return structuredClone(getDemoDiscoveryGlobalConfigState())
  },
  updateOpsDiscoveryGlobalConfig(
    body: InternalDiscoveryGlobalConfigInput,
  ): InternalDiscoveryGlobalConfigViewModel {
    demoState.discoveryGlobalConfig = normalizeDemoDiscoveryGlobalConfig(body)
    return structuredClone(demoState.discoveryGlobalConfig)
  },
  getOpsDiscoveryCategoryConfigs(): InternalDiscoveryCategoryConfigSummaryViewModel[] {
    return structuredClone(buildDemoDiscoveryCategorySummaryList())
  },
  getOpsDiscoveryCategoryConfig(slug: string): InternalDiscoveryCategoryConfigViewModel {
    return structuredClone(buildDemoDiscoveryCategoryConfigViewModel(slug))
  },
  updateOpsDiscoveryCategoryConfig(
    slug: string,
    body: InternalDiscoveryCategoryConfigInput,
  ): InternalDiscoveryCategoryConfigViewModel {
    if (!getDemoDiscoveryCategoryMeta(slug)) {
      throw new Error(`Unknown demo discovery category: ${slug}`)
    }

    demoState.discoveryCategoryConfigs[slug] = normalizeDemoCategoryConfigInput(body)
    return structuredClone(buildDemoDiscoveryCategoryConfigViewModel(slug))
  },
  getDiscoveryHome(): PublicDiscoverPageViewModel {
    return structuredClone(buildDemoDiscoveryHome(demoState.markets))
  },
  getDiscoveryRanking(kind: 'hot' | 'breaking'): PublicDiscoveryRankingViewModel {
    return structuredClone(buildDemoRanking(kind))
  },
  getLatestTopics(): PublicLatestTopicsViewModel {
    return structuredClone(buildDemoLatestTopics())
  },
  getDiscoveryClosingSoon(): PublicClosingSoonViewModel {
    return structuredClone(buildDemoClosingSoon(demoState.markets))
  },
  getPublicRespondentLeaderboard(): PublicRespondentLeaderboardViewModel {
    return structuredClone(buildDemoPublicRespondentLeaderboard())
  },
  getCategoryDirectoryIndex(): PublicCategoryDirectoryIndexViewModel {
    return structuredClone(buildDemoCategoryDirectoryIndex())
  },
  getCategoryDirectory(slug: string): PublicCategoryDirectoryViewModel | null {
    return structuredClone(buildDemoCategoryDirectory(slug))
  },
  getPublicSettledResults(): PublicSettledResultsViewModel {
    return structuredClone(buildDemoPublicSettledResults())
  },
  getPublicIntegrityOverview(): PublicIntegrityOverviewViewModel {
    return structuredClone(buildDemoPublicIntegrityOverview())
  },
  getMarketDiscussionThread(marketId: string): ArenaDiscussionThreadViewModel {
    return structuredClone(
      demoState.discussionThreads[marketId] ?? {
        marketId,
        propositionId: `demo-proposition-${marketId}`,
        availability: 'demo',
        totalCount: 0,
        comments: [],
      },
    )
  },
  createMarketDiscussionComment(
    marketId: string,
    body: {
      propositionId: string
      body: string
      optionIndex?: 0 | 1
      createdAt: string
    },
  ): ArenaDiscussionThreadViewModel {
    const current = demoState.discussionThreads[marketId] ?? {
      marketId,
      propositionId: body.propositionId,
      availability: 'demo' as const,
      totalCount: 0,
      comments: [],
    }

    const nextComment = {
      id: `demo-comment-${current.comments.length + 1}`,
      marketId,
      propositionId: body.propositionId,
      author: 'You',
      handle: '@arena_demo',
      tone: body.optionIndex === 0 ? '演示观点 A' : body.optionIndex === 1 ? '演示观点 B' : '演示讨论',
      timeLabel: '刚刚',
      minutesAgo: 0,
      optionIndex:
        body.optionIndex === 0 || body.optionIndex === 1
          ? body.optionIndex
          : null,
      body: body.body.trim(),
      likes: 0,
      replyCount: 0,
      repliesPreview: [],
      createdAt: body.createdAt,
    }

    const nextThread: ArenaDiscussionThreadViewModel = {
      ...current,
      totalCount: current.totalCount + 1,
      comments: [nextComment, ...current.comments],
    }

    demoState.discussionThreads[marketId] = nextThread
    return structuredClone(nextThread)
  },
  reset() {
    demoState = createInitialState()
    demoRequesterReportPresets = buildInitialDemoRequesterReportPresets()
    demoRequesterReportPresetCounter = 1
    demoRequesterComparisonSets = buildInitialDemoRequesterComparisonSets()
    demoRequesterComparisonSetCounter = 1
    demoOpsBackend.reset()
  },
}
