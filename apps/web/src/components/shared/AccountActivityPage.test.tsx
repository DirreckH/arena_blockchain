import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RespondentAccountExportArtifactViewModel,
  RespondentAccountExportListViewModel,
  RespondentAccountOverviewViewModel,
  RespondentAccountPreferencesViewModel,
} from '@arena/shared'
import { DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES } from '@arena/shared'
import { AccountActivityPage } from './AccountActivityPage'
import { useRulesIntro } from './RulesIntroContext'
import { useArenaAccountData } from '../../features/arena/account-data'

vi.mock('./RulesIntroContext', async () => {
  const actual = await vi.importActual<typeof import('./RulesIntroContext')>(
    './RulesIntroContext',
  )

  return {
    ...actual,
    useRulesIntro: vi.fn(),
  }
})

vi.mock('../../features/arena/account-data', async () => {
  const actual = await vi.importActual<typeof import('../../features/arena/account-data')>(
    '../../features/arena/account-data',
  )

  return {
    ...actual,
    useArenaAccountData: vi.fn(),
  }
})

const mockedUseRulesIntro = vi.mocked(useRulesIntro)
const mockedUseArenaAccountData = vi.mocked(useArenaAccountData)

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountActivityPage />
    </MemoryRouter>,
  )
}

function buildRulesIntro() {
  return {
    isAuthenticated: true,
    logout: vi.fn(),
    openAuthModal: vi.fn(),
    user: {
      displayName: '0x1234...abcd',
      avatarInitial: '1',
      email: 'live_user_1@wallet.arena.local',
      walletAddress: '0x1234567890abcdef1234567890abcdef1234abcd',
    },
  }
}

function buildOverview(): RespondentAccountOverviewViewModel {
  return {
    userId: 'live_user_1',
    rewards: [],
    rewardSummary: {
      currentCount: 0,
      pendingAmount: '0.00',
      finalizedAmount: '0.00',
    },
    reputation: null,
    tags: null,
    resultOverview: {
      userId: 'live_user_1',
      settledResults: {
        userId: 'live_user_1',
        totals: {
          settledCount: 0,
          resolvedCount: 0,
          voidCount: 0,
          wonCount: 0,
          lostCount: 0,
          refundCount: 0,
          finalizedRewardAmount: '0.00',
          pendingRewardAmount: '0.00',
          totalStakeAmount: '0.00',
          totalGrossPayout: '0.00',
          totalPnl: '0.00',
          totalRefundAmount: '0.00',
        },
        items: [],
      },
      openPositions: {
        totalCount: 0,
        totalStakeAmount: '0.00',
        items: [],
        categoryExposure: [],
      },
      recentActivity: [],
      summary: {
        trackedEntryCount: 0,
        settledSharePercent: 0,
        openPositionSharePercent: 0,
        latestActivityAt: null,
        latestActivityTitle: null,
        largestExposure: null,
      },
      performance: {
        trackedSettledPnlCount: 0,
        positiveSettledPnlCount: 0,
        negativeSettledPnlCount: 0,
        flatSettledPnlCount: 0,
        positiveSettledPnlRate: 0,
        averageSettledPnlAmount: '0.00',
        bestSettledPnl: null,
        worstSettledPnl: null,
      },
      analytics: {
        assetBreakdown: {
          trackedAmount: '0.00',
          settledGrossPayoutAmount: '0.00',
          openStakeAmount: '0.00',
          rewardAmount: '0.00',
          finalizedRewardAmount: '0.00',
          pendingRewardAmount: '0.00',
          settledGrossPayoutSharePercent: 0,
          openStakeSharePercent: 0,
          rewardSharePercent: 0,
        },
        positionStructure: {
          totalCount: 0,
          longCount: 0,
          shortCount: 0,
          scheduledCount: 0,
          liveCount: 0,
          frozenCount: 0,
          revealingCount: 0,
          longSharePercent: 0,
          shortSharePercent: 0,
          scheduledSharePercent: 0,
          liveSharePercent: 0,
          frozenSharePercent: 0,
          revealingSharePercent: 0,
        },
        settlementDistribution: {
          trackedSettledPnlCount: 0,
          positiveCount: 0,
          negativeCount: 0,
          flatCount: 0,
          positiveSharePercent: 0,
          negativeSharePercent: 0,
          flatSharePercent: 0,
        },
      },
    },
  }
}

function buildPreferences(): RespondentAccountPreferencesViewModel {
  return {
    userId: 'live_user_1',
    updatedAt: '2026-05-29T00:00:00.000Z',
    ...structuredClone(DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES),
  }
}

function buildExportList(): RespondentAccountExportListViewModel {
  return {
    userId: 'live_user_1',
    totalCount: 2,
    items: [
      {
        exportId: 'account_export_1',
        userId: 'live_user_1',
        status: 'completed',
        format: 'json',
        period: '90d',
        includeSettlementAttachment: true,
        maskWalletAddress: true,
        requestedAt: '2026-05-29T01:00:00.000Z',
        completedAt: '2026-05-29T01:01:00.000Z',
        fileName: 'arena-account-live_user_1-90d.json',
        metrics: {
          rewardCount: 1,
          settledResultCount: 4,
          openPositionCount: 2,
        },
      },
      {
        exportId: 'account_export_older',
        userId: 'live_user_1',
        status: 'completed',
        format: 'json',
        period: '30d',
        includeSettlementAttachment: false,
        maskWalletAddress: true,
        requestedAt: '2026-05-28T01:00:00.000Z',
        completedAt: '2026-05-28T01:01:00.000Z',
        fileName: 'arena-account-live_user_1-30d.json',
        metrics: {
          rewardCount: 1,
          settledResultCount: 1,
          openPositionCount: 0,
        },
      },
    ],
  }
}

function buildLatestExportArtifact(): RespondentAccountExportArtifactViewModel {
  const overview = buildOverview()

  return {
    exportId: 'account_export_1',
    userId: 'live_user_1',
    status: 'completed',
    format: 'json',
    period: '90d',
    includeSettlementAttachment: true,
    maskWalletAddress: true,
    requestedAt: '2026-05-29T01:00:00.000Z',
    completedAt: '2026-05-29T01:01:00.000Z',
    fileName: 'arena-account-live_user_1-90d.json',
    walletAddress: 'wallet...1234',
    overview: {
      ...overview,
      rewards: [
        {
          ledgerId: 'reward-live-1',
          propositionId: 'prop-live-1',
          propositionTitle: 'Live export reward',
          responseId: 'response-live-1',
          sourceType: 'response',
          status: 'finalized',
          pendingAmount: '0.00',
          finalAmount: '42.00',
          reviewStatus: 'valid',
          reasonCode: 'review_valid',
          createdAt: '2026-05-20T08:00:00.000Z',
          finalizedAt: '2026-05-21T08:00:00.000Z',
          voidedAt: null,
          reversedAt: null,
          ledgerVersion: 1,
          isCurrent: true,
        },
      ],
      resultOverview: {
        ...overview.resultOverview,
        settledResults: {
          ...overview.resultOverview.settledResults,
          totals: {
            ...overview.resultOverview.settledResults.totals,
            settledCount: 4,
          },
        },
        openPositions: {
          ...overview.resultOverview.openPositions,
          totalCount: 2,
        },
        recentActivity: [
          {
            activityType: 'reward_finalized',
            propositionId: 'prop-live-1',
            propositionTitle: 'Live export reward',
            category: 'ai',
            occurredAt: '2026-05-29T00:30:00.000Z',
            amount: '42.00',
            direction: 'positive',
            detail: 'Reward finalized',
          },
        ],
      },
    },
    preferences: buildPreferences(),
    settlementAttachment: {
      generatedAt: '2026-05-29T01:01:00.000Z',
      settledResultCount: 4,
      openPositionCount: 2,
      recentActivityCount: 1,
    },
  }
}

function buildHistoricalExportArtifact(): RespondentAccountExportArtifactViewModel {
  const overview = buildOverview()

  return {
    exportId: 'account_export_older',
    userId: 'live_user_1',
    status: 'completed',
    format: 'json',
    period: '30d',
    includeSettlementAttachment: false,
    maskWalletAddress: true,
    requestedAt: '2026-05-28T01:00:00.000Z',
    completedAt: '2026-05-28T01:01:00.000Z',
    fileName: 'arena-account-live_user_1-30d.json',
    walletAddress: 'wallet...older',
    overview: {
      ...overview,
      rewards: [
        {
          ledgerId: 'reward-live-older-1',
          propositionId: 'prop-live-older-1',
          propositionTitle: 'Historical export reward',
          responseId: 'response-live-older-1',
          sourceType: 'response',
          status: 'finalized',
          pendingAmount: '0.00',
          finalAmount: '8.00',
          reviewStatus: 'valid',
          reasonCode: 'review_valid',
          createdAt: '2026-05-18T08:00:00.000Z',
          finalizedAt: '2026-05-19T08:00:00.000Z',
          voidedAt: null,
          reversedAt: null,
          ledgerVersion: 1,
          isCurrent: true,
        },
      ],
      resultOverview: {
        ...overview.resultOverview,
        settledResults: {
          ...overview.resultOverview.settledResults,
          totals: {
            ...overview.resultOverview.settledResults.totals,
            settledCount: 1,
          },
        },
        recentActivity: [
          {
            activityType: 'reward_finalized',
            propositionId: 'prop-live-older-1',
            propositionTitle: 'Historical export reward',
            category: 'ai',
            occurredAt: '2026-05-28T00:30:00.000Z',
            amount: '8.00',
            direction: 'positive',
            detail: 'Historical reward finalized',
          },
        ],
      },
    },
    preferences: buildPreferences(),
    settlementAttachment: null,
  }
}

function buildAccountData(overrides: Partial<ReturnType<typeof useArenaAccountData>>) {
  return {
    overview: null,
    rewards: [],
    reputation: null,
    tags: null,
    rewardSummary: {
      currentCount: 0,
      pendingAmount: '0.00',
      finalizedAmount: '0.00',
    },
    preferences: null,
    exports: null,
    latestExport: null,
    preferencesErrorMessage: null,
    exportsErrorMessage: null,
    isPreferencesLoading: false,
    isPreferencesSaving: false,
    isExportsLoading: false,
    isExporting: false,
    sourceMode: 'live' as const,
    isLoading: false,
    errorMessage: null,
    refresh: vi.fn(),
    updatePreferences: vi.fn(),
    loadExport: vi.fn(),
    createExport: vi.fn(),
    ...overrides,
  }
}

describe('AccountActivityPage', () => {
  beforeEach(() => {
    mockedUseRulesIntro.mockReturnValue(buildRulesIntro() as never)
  })

  it('shows an honest unavailable state instead of interactive settings when the real account surface failed to load', () => {
    mockedUseArenaAccountData.mockReturnValue(buildAccountData({
      sourceMode: 'unavailable',
      errorMessage: 'Backend account overview unavailable',
    }) as never)

    renderPage()

    expect(screen.getByText('暂不可用')).toBeInTheDocument()
    expect(screen.getByText('账户设置暂不可用')).toBeInTheDocument()
    expect(screen.getByText('Backend account overview unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试加载账户数据' })).toBeInTheDocument()
    expect(screen.queryByLabelText('账户设置导航')).not.toBeInTheDocument()
  })

  it('retries the real account read model from the unavailable state', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    mockedUseArenaAccountData.mockReturnValue(buildAccountData({
      sourceMode: 'unavailable',
      errorMessage: 'Backend account overview unavailable',
      refresh,
    }) as never)

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '重试加载账户数据' }))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('renders the settings shell when live account data is available', () => {
    mockedUseArenaAccountData.mockReturnValue(buildAccountData({
      sourceMode: 'live',
      overview: buildOverview(),
      preferences: buildPreferences(),
    }) as never)

    renderPage()

    expect(screen.getByLabelText('账户设置导航')).toBeInTheDocument()
    expect(screen.queryByText('账户设置暂不可用')).not.toBeInTheDocument()
    expect(screen.queryByText('暂不可用')).not.toBeInTheDocument()
  })

  it('shows latest export artifact details in the exports section when a real artifact is available', async () => {
    mockedUseArenaAccountData.mockReturnValue(buildAccountData({
      sourceMode: 'live',
      overview: buildOverview(),
      preferences: buildPreferences(),
      exports: buildExportList(),
      latestExport: buildLatestExportArtifact(),
    }) as never)

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '数据导出' }))

    expect(screen.getAllByText('arena-account-live_user_1-90d.json').length).toBeGreaterThan(0)
    expect(screen.getByText('wallet...1234')).toBeInTheDocument()
    expect(screen.getByText('90d')).toBeInTheDocument()
    expect(screen.getByText('4 条已结算记录')).toBeInTheDocument()
    expect(screen.getByText('2 个持仓')).toBeInTheDocument()
    expect(screen.getByText('1 条最近活动')).toBeInTheDocument()
  })

  it('keeps the exports section honest when only list metadata exists and no artifact detail is available yet', async () => {
    mockedUseArenaAccountData.mockReturnValue(buildAccountData({
      sourceMode: 'live',
      overview: buildOverview(),
      preferences: buildPreferences(),
      exports: buildExportList(),
      latestExport: null,
    }) as never)

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '数据导出' }))

    expect(screen.getAllByText('arena-account-live_user_1-90d.json').length).toBeGreaterThan(0)
    expect(screen.getAllByText('导出详情尚未加载').length).toBeGreaterThan(0)
    expect(screen.queryByText('wallet...1234')).not.toBeInTheDocument()
  })

  it('loads and shows the selected historical export artifact detail in the exports section', async () => {
    const loadExport = vi.fn().mockResolvedValue(buildHistoricalExportArtifact())
    mockedUseArenaAccountData.mockReturnValue(buildAccountData({
      sourceMode: 'live',
      overview: buildOverview(),
      preferences: buildPreferences(),
      exports: buildExportList(),
      latestExport: buildLatestExportArtifact(),
      loadExport,
    }) as never)

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '数据导出' }))
    await userEvent.click(screen.getByRole('button', { name: /arena-account-live_user_1-30d\.json/i }))

    expect(loadExport).toHaveBeenCalledWith('account_export_older')
    expect(screen.getByTestId('account-export-history-detail-panel')).toBeInTheDocument()
    expect(screen.getByText('wallet...older')).toBeInTheDocument()
    expect(screen.getAllByText('1 条已结算记录').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 条最近活动').length).toBeGreaterThan(0)
  })

  it('keeps historical export detail honest when the artifact reload fails and only list metadata remains', async () => {
    const loadExport = vi.fn().mockRejectedValue(new Error('Historical export unavailable'))
    mockedUseArenaAccountData.mockReturnValue(buildAccountData({
      sourceMode: 'live',
      overview: buildOverview(),
      preferences: buildPreferences(),
      exports: buildExportList(),
      latestExport: buildLatestExportArtifact(),
      loadExport,
      exportsErrorMessage: 'Historical export unavailable',
    }) as never)

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '数据导出' }))
    await userEvent.click(screen.getByRole('button', { name: /arena-account-live_user_1-30d\.json/i }))

    expect(loadExport).toHaveBeenCalledWith('account_export_older')
    expect(screen.getByTestId('account-export-history-detail-panel')).toBeInTheDocument()
    expect(screen.getAllByText('导出详情尚未加载').length).toBeGreaterThan(0)
    expect(screen.queryByText('wallet...older')).not.toBeInTheDocument()
  })
})
