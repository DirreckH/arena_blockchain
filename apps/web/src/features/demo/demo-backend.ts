import type {
  AdjudicationTaskViewModel,
  AuthChallengeResponse,
  CurrentUserPositionViewModel,
  JwtIdentity,
  PlaceValidationBetResult,
  PropositionCategory,
  PropositionStatus,
  PublicCategoryDirectoryViewModel,
  PublicDiscoverPageViewModel,
  PublicDiscoveryRankingViewModel,
  PublicLatestTopicsViewModel,
  PublicProgressViewModel,
  RespondentAccountExportArtifactViewModel,
  RespondentAccountExportListViewModel,
  RespondentAccountOverviewViewModel,
  RespondentAccountPreferencesViewModel,
  RespondentReputationSummaryViewModel,
  RespondentResultOverviewViewModel,
  RespondentRewardLedgerViewModel,
  RespondentTagSummaryViewModel,
  RespondentWatchlistViewModel,
  SubmitAdjudicationResponseResult,
  UpdateRespondentAccountPreferencesInput,
  UpdateRespondentWatchlistResultViewModel,
  ValidationMarketViewModel,
} from '@arena/shared'
import { DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES } from '@arena/shared'
import type { AuthVerifyResponse, PropositionDraftRecord } from '../api/arena-api'
import { getCategoryDirectoryConfig } from '../../mocks/category-directory.mock'
import { DISCOVER_PAGE_SECTION_PATHS } from '../../mocks/discover-page.mock'
import { LATEST_TOPIC_ITEMS } from '../../mocks/latest-page.mock'
import { BREAKING_PAGE_CONFIG } from '../../mocks/breaking-page.mock'
import { HOT_PAGE_CONFIG } from '../../mocks/hot-page.mock'
import { marketCards, navItems } from '../../mocks/arena-market.mock'
import { buildDemoIdentity, DEMO_SESSION_TOKEN, DEMO_WALLET_ADDRESS } from './demo-auth'

type DemoState = {
  identity: JwtIdentity
  markets: ValidationMarketViewModel[]
  drafts: PropositionDraftRecord[]
  tasks: AdjudicationTaskViewModel[]
  watchlist: RespondentWatchlistViewModel
  preferences: RespondentAccountPreferencesViewModel
  rewards: RespondentRewardLedgerViewModel[]
  reputation: RespondentReputationSummaryViewModel
  tags: RespondentTagSummaryViewModel
  exports: RespondentAccountExportListViewModel
  latestExport: RespondentAccountExportArtifactViewModel | null
}

const DEMO_USER_ID = 'demo-user'
const DEMO_CHAIN_ID = 31337
const DEMO_NOW = '2026-05-08T09:30:00.000Z'

function plusHours(hours: number) {
  return new Date(Date.parse(DEMO_NOW) + hours * 60 * 60 * 1000).toISOString()
}

function plusDays(days: number) {
  return new Date(Date.parse(DEMO_NOW) + days * 24 * 60 * 60 * 1000).toISOString()
}

function minusHours(hours: number) {
  return new Date(Date.parse(DEMO_NOW) - hours * 60 * 60 * 1000).toISOString()
}

function minusDays(days: number) {
  return new Date(Date.parse(DEMO_NOW) - days * 24 * 60 * 60 * 1000).toISOString()
}

function toCategory(categoryHref: string): PropositionCategory {
  switch (categoryHref) {
    case '/zh/politics':
      return 'politics'
    case '/zh/sports/live':
      return 'sports'
    case '/zh/crypto':
    case '/zh/tech':
      return 'ai'
    case '/zh/pop-culture':
      return 'entertainment'
    case '/zh/finance':
    case '/zh/geopolitics':
    case '/zh/weather':
    case '/zh/surveys':
    case '/zh/economy':
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
      propositionId: 'draft-demo-search-quality',
      title: 'Perplexity 和 ChatGPT Search 哪个更适合高频研究检索？',
      summary: '比较两款 AI 搜索产品在资料追溯、答案可验证性、搜索效率和真实工作流中的综合表现，供 Arena 候选命题审阅。',
      optionA: 'Perplexity 更适合',
      optionB: 'ChatGPT Search 更适合',
      category: 'ai',
      sampleConstraints: ['AI', 'Search', 'Research'],
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
      sampleConstraints: ['Policy', 'Survey'],
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
    },
  ]
}

function buildDemoReputation(): RespondentReputationSummaryViewModel {
  return {
    userId: DEMO_USER_ID,
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
    userId: DEMO_USER_ID,
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
    userId: DEMO_USER_ID,
    settledResults: {
      userId: DEMO_USER_ID,
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
    userId: DEMO_USER_ID,
    rewards,
    rewardSummary,
    reputation: buildDemoReputation(),
    tags: buildDemoTags(),
    resultOverview: buildDemoResultOverview(markets),
  }
}

function buildDemoPreferences(): RespondentAccountPreferencesViewModel {
  return {
    userId: DEMO_USER_ID,
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
    userId: DEMO_USER_ID,
    totalCount: items.length,
    items,
  }
}

function buildDemoTasks(markets: ValidationMarketViewModel[]): AdjudicationTaskViewModel[] {
  const marketA = markets.find((market) => market.marketId === 'public-trust')!
  const marketB = markets.find((market) => market.marketId === 'ai-model-review')!
  const marketC = markets.find((market) => market.marketId === 'ceasefire-durability')!

  return [
    {
      taskId: 'demo-task-1',
      propositionId: marketA.propositionId,
      title: marketA.title,
      description: '请基于公开样本与材料判断哪一侧更接近当前可验证共识。',
      options: marketA.options,
      propositionStatus: 'live',
      taskStatus: 'assigned',
      hasSubmitted: false,
      timeRemainingSeconds: 8 * 60 * 60,
      latestResponseStatus: null,
      rewardStatus: 'pending',
      rewardPendingAmount: '12',
      rewardFinalAmount: null,
      publicProgress: marketA.publicProgress,
    },
    {
      taskId: 'demo-task-2',
      propositionId: marketB.propositionId,
      title: marketB.title,
      description: '二选一判断当前公开样本更支持哪一边。',
      options: marketB.options,
      propositionStatus: 'live',
      taskStatus: 'started',
      hasSubmitted: false,
      timeRemainingSeconds: 15 * 60 * 60,
      latestResponseStatus: 'pending_review',
      rewardStatus: null,
      rewardPendingAmount: '10',
      rewardFinalAmount: null,
      publicProgress: marketB.publicProgress,
    },
    {
      taskId: 'demo-task-3',
      propositionId: marketC.propositionId,
      title: marketC.title,
      description: '该任务已提交，等待奖励决议。',
      options: marketC.options,
      propositionStatus: 'frozen',
      taskStatus: 'submitted',
      hasSubmitted: true,
      timeRemainingSeconds: 2 * 60 * 60,
      latestResponseStatus: 'valid',
      rewardStatus: 'finalized',
      rewardPendingAmount: '0',
      rewardFinalAmount: '16',
      publicProgress: marketC.publicProgress,
    },
  ]
}

function buildDemoExports(): RespondentAccountExportListViewModel {
  return {
    userId: DEMO_USER_ID,
    totalCount: 1,
    items: [
      {
        exportId: 'demo-export-1',
        userId: DEMO_USER_ID,
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
    userId: DEMO_USER_ID,
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
  return {
    featuredMarketIds: ['public-trust', 'ai-model-review'],
    sections: DISCOVER_PAGE_SECTION_PATHS.map((pathname) => {
      const navItem = navItems.find((item) => item.href === pathname)
      const config = pathname === '/zh'
        ? { marketIds: HOT_PAGE_CONFIG.items.map((item) => item.href.replace('/zh/event/', '')).slice(0, 4), moreHref: '/zh/markets' }
        : pathname === '/zh/breaking'
          ? { marketIds: BREAKING_PAGE_CONFIG.items.map((item) => item.href.replace('/zh/event/', '')).slice(0, 4), moreHref: '/zh/breaking' }
          : getCategoryDirectoryConfig(pathname)
            ? { marketIds: getCategoryDirectoryConfig(pathname)!.marketIds, moreHref: pathname }
            : { marketIds: markets.slice(0, 4).map((market) => market.marketId), moreHref: '/zh/markets' }

      return {
        id: pathname,
        label: navItem?.label ?? pathname,
        href: pathname,
        marketIds: config.marketIds,
        moreHref: config.moreHref,
      }
    }),
  }
}

function buildDemoRanking(kind: 'hot' | 'breaking'): PublicDiscoveryRankingViewModel {
  const config = kind === 'hot' ? HOT_PAGE_CONFIG : BREAKING_PAGE_CONFIG

  return {
    pageClassName: config.pageClassName,
    heroVariant: kind,
    dateLabel: config.dateLabel,
    title: config.title,
    description: config.description,
    categoryAriaLabel: config.categoryAriaLabel,
    listAriaLabel: config.listAriaLabel,
    categories: config.categories.map((category) => ({
      id: category.id,
      label: category.label,
    })),
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
      categoryIds: item.categoryIds,
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

function buildDemoCategoryDirectory(slug: string): PublicCategoryDirectoryViewModel | null {
  const pathname = {
    politics: '/zh/politics',
    'sports-live': '/zh/sports/live',
    crypto: '/zh/crypto',
    tech: '/zh/tech',
    geopolitics: '/zh/geopolitics',
    finance: '/zh/finance',
    'pop-culture': '/zh/pop-culture',
    economy: '/zh/economy',
    weather: '/zh/weather',
    surveys: '/zh/surveys',
    rolling: '/zh/rolling',
  }[slug]

  if (!pathname) {
    return null
  }

  const config = getCategoryDirectoryConfig(pathname)
  if (!config) {
    return null
  }

  return {
    title: config.title,
    featuredMarketId: config.featuredMarketId,
    marketIds: config.marketIds,
    sidebarItems: config.sidebarItems.map((item) => ({
      label: item.label,
      count: item.count,
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

  return {
    identity,
    markets,
    drafts: buildDemoDrafts(),
    tasks,
    watchlist,
    preferences,
    rewards,
    reputation: buildDemoReputation(),
    tags: buildDemoTags(),
    exports,
    latestExport,
  }
}

let demoState = createInitialState()

function getOverview() {
  return buildDemoOverview(demoState.markets, demoState.rewards)
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
    userId: DEMO_USER_ID,
    totalCount: items.length,
    items,
  }
}

export const demoBackend = {
  isDemoToken(token: string | null | undefined) {
    return token === DEMO_SESSION_TOKEN
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
  submitAdjudicationResponse(taskId: string, selectedOption: 0 | 1): SubmitAdjudicationResponseResult {
    let nextTask: AdjudicationTaskViewModel | null = null

    demoState.tasks = demoState.tasks.map((task) => {
      if (task.taskId !== taskId) {
        return task
      }

      nextTask = {
        ...task,
        hasSubmitted: true,
        taskStatus: 'submitted',
        latestResponseStatus: selectedOption === 0 ? 'valid' : 'pending_review',
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
      userId: DEMO_USER_ID,
      ...structuredClone(body),
      updatedAt: DEMO_NOW,
    }

    return structuredClone(demoState.preferences)
  },
  getAccountExports(): RespondentAccountExportListViewModel {
    return structuredClone(demoState.exports)
  },
  createAccountExport(): RespondentAccountExportArtifactViewModel {
    const exportId = `demo-export-${Date.now()}`
    const requestedAt = DEMO_NOW
    const completedAt = plusHours(1)
    const item = {
      exportId,
      userId: DEMO_USER_ID,
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
      userId: DEMO_USER_ID,
      totalCount: demoState.exports.totalCount + 1,
      items: [item, ...demoState.exports.items],
    }

    demoState.latestExport = {
      exportId,
      userId: DEMO_USER_ID,
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
      userId: DEMO_USER_ID,
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
      userId: DEMO_USER_ID,
      marketId,
      propositionId: market?.propositionId ?? '',
      isSaved: false,
      savedAt: null,
    }
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
  getCategoryDirectory(slug: string): PublicCategoryDirectoryViewModel | null {
    return structuredClone(buildDemoCategoryDirectory(slug))
  },
  reset() {
    demoState = createInitialState()
  },
}
