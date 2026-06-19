import type {
  RespondentAccountOverviewViewModel,
  RespondentReputationSummaryViewModel,
  RespondentRewardLedgerViewModel,
  RespondentTagSummaryViewModel,
} from '@arena/shared'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RewardsPage } from './RewardsPage'
import { useRulesIntro } from '../components/shared/RulesIntroContext'
import { useArenaAccountData } from '../features/arena/account-data'

vi.mock('../components/shared/RulesIntroContext', async () => {
  const actual = await vi.importActual('../components/shared/RulesIntroContext')

  return {
    ...actual,
    useRulesIntro: vi.fn(),
  }
})

vi.mock('../features/arena/account-data', async () => {
  const actual = await vi.importActual('../features/arena/account-data')

  return {
    ...actual,
    useArenaAccountData: vi.fn(),
  }
})

const mockedUseRulesIntro = vi.mocked(useRulesIntro)
const mockedUseArenaAccountData = vi.mocked(useArenaAccountData)

function buildRewards(): RespondentRewardLedgerViewModel[] {
  return [
    {
      ledgerId: 'reward-live-1',
      propositionId: 'prop-live-1',
      propositionTitle: '真实市场奖励一',
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
      payoutStatus: 'completed',
      payoutMethod: 'wallet_transfer',
      payoutAmount: '42.00',
      payoutAssetSymbol: 'USDC',
      payoutDestinationAddress: '0xRewardLive000000000000000000000000000001',
      payoutRequestedAt: '2026-05-21T08:00:00.000Z',
      payoutCompletedAt: '2026-05-21T09:00:00.000Z',
      payoutFailureReason: null,
    },
    {
      ledgerId: 'reward-live-2',
      propositionId: 'prop-live-2',
      propositionTitle: '真实市场奖励二',
      responseId: 'response-live-2',
      sourceType: 'response',
      status: 'pending',
      pendingAmount: '18.50',
      finalAmount: null,
      reviewStatus: 'pending_review',
      reasonCode: 'review_partial_valid',
      createdAt: '2026-05-22T08:00:00.000Z',
      finalizedAt: null,
      voidedAt: null,
      reversedAt: null,
      ledgerVersion: 1,
      isCurrent: true,
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

function buildReputation(): RespondentReputationSummaryViewModel {
  return {
    reputationScore: 88,
    reputationLevel: 'trusted',
    metrics: {
      completionRate: 0.91,
      validRate: 0.77,
      partialValidRate: 0.15,
      invalidRate: 0.08,
      anomalyRate: 0.01,
      fraudFlagCount: 0,
      reviewedResponseCount: 52,
    },
    computedAt: '2026-05-22T12:00:00.000Z',
  }
}

function buildTags(): RespondentTagSummaryViewModel {
  return {
    tags: [
      {
        tagKey: 'high_signal_reviewer',
        tagType: 'quality_reputation',
        confidenceScore: 0.91,
        activatedAt: '2026-05-10T08:00:00.000Z',
      },
      {
        tagKey: 'ai_research',
        tagType: 'interest',
        confidenceScore: 0.83,
        activatedAt: '2026-05-09T08:00:00.000Z',
      },
    ],
  }
}

function buildOverview(): RespondentAccountOverviewViewModel {
  return {
    rewards: buildRewards(),
    rewardSummary: {
      currentCount: 2,
      pendingAmount: '18.50',
      finalizedAmount: '42.00',
    },
    reputation: buildReputation(),
    tags: buildTags(),
    resultOverview: {
      settledResults: {
        totals: {
          settledCount: 3,
          resolvedCount: 3,
          voidCount: 0,
          wonCount: 0,
          lostCount: 0,
          refundCount: 0,
          finalizedRewardAmount: '42.00',
          pendingRewardAmount: '18.50',
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
        trackedEntryCount: 3,
        settledSharePercent: 100,
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
          trackedAmount: '60.50',
          settledGrossPayoutAmount: '0.00',
          openStakeAmount: '0.00',
          rewardAmount: '60.50',
          finalizedRewardAmount: '42.00',
          pendingRewardAmount: '18.50',
          settledGrossPayoutSharePercent: 0,
          openStakeSharePercent: 0,
          rewardSharePercent: 100,
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

function renderRewardsPage() {
  return render(
    <MemoryRouter>
      <RewardsPage />
    </MemoryRouter>,
  )
}

describe('rewards page', () => {
  beforeEach(() => {
    mockedUseRulesIntro.mockReturnValue({
      isAuthenticated: false,
      openAuthModal: vi.fn(),
    } as never)

    mockedUseArenaAccountData.mockReturnValue({
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
      sourceMode: 'unavailable',
      isLoading: false,
      errorMessage: null,
      refresh: vi.fn(),
      updatePreferences: vi.fn(),
      loadExport: vi.fn(),
      createExport: vi.fn(),
    })
  })

  it('shows a login gate when the reward account is not authenticated', () => {
    renderRewardsPage()

    expect(screen.getByRole('heading', { name: '参与激励' })).toBeInTheDocument()
    expect(screen.getByText('登录后查看真实奖励流水')).toBeInTheDocument()
    expect(screen.getByText('暂不可用')).toBeInTheDocument()
  })

  it('renders live reward summary, reputation, tags, and ledger rows for an authenticated account', () => {
    const overview = buildOverview()

    mockedUseRulesIntro.mockReturnValue({
      isAuthenticated: true,
      openAuthModal: vi.fn(),
    } as never)

    mockedUseArenaAccountData.mockReturnValue({
      overview,
      rewards: overview.rewards,
      reputation: overview.reputation,
      tags: overview.tags,
      rewardSummary: overview.rewardSummary,
      preferences: null,
      exports: null,
      latestExport: null,
      preferencesErrorMessage: null,
      exportsErrorMessage: null,
      isPreferencesLoading: false,
      isPreferencesSaving: false,
      isExportsLoading: false,
      isExporting: false,
      sourceMode: 'live',
      isLoading: false,
      errorMessage: null,
      refresh: vi.fn(),
      updatePreferences: vi.fn(),
      loadExport: vi.fn(),
      createExport: vi.fn(),
    })

    renderRewardsPage()

    expect(screen.getByText('当前账户奖励概览')).toBeInTheDocument()
    expect(screen.getAllByText('18.50 USDC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('42.00 USDC').length).toBeGreaterThan(0)
    expect(screen.getByText(/Trusted \/ 88/)).toBeInTheDocument()
    expect(screen.getByText('high_signal_reviewer')).toBeInTheDocument()
    expect(screen.getByText('真实市场奖励一')).toBeInTheDocument()
    expect(screen.getByText('真实市场奖励二')).toBeInTheDocument()
    expect(screen.getByText('已到账')).toBeInTheDocument()
    expect(
      screen.getByText((content) => content.includes('到账地址') && content.includes('0xReward')),
    ).toBeInTheDocument()
  })

  it('keeps the authenticated demo path honest without showing a degraded source badge', () => {
    const overview = buildOverview()

    mockedUseRulesIntro.mockReturnValue({
      isAuthenticated: true,
      openAuthModal: vi.fn(),
    } as never)

    mockedUseArenaAccountData.mockReturnValue({
      overview,
      rewards: overview.rewards,
      reputation: overview.reputation,
      tags: overview.tags,
      rewardSummary: overview.rewardSummary,
      preferences: null,
      exports: null,
      latestExport: null,
      preferencesErrorMessage: null,
      exportsErrorMessage: null,
      isPreferencesLoading: false,
      isPreferencesSaving: false,
      isExportsLoading: false,
      isExporting: false,
      sourceMode: 'demo',
      isLoading: false,
      errorMessage: null,
      refresh: vi.fn(),
      updatePreferences: vi.fn(),
      loadExport: vi.fn(),
      createExport: vi.fn(),
    })

    renderRewardsPage()

    expect(screen.getByText('当前账户奖励概览')).toBeInTheDocument()
    expect(screen.queryByText('暂不可用')).not.toBeInTheDocument()
    expect(screen.queryByText('混合数据')).not.toBeInTheDocument()
  })

  it('surfaces authenticated load failures instead of masking them as a normal rewards shell', () => {
    mockedUseRulesIntro.mockReturnValue({
      isAuthenticated: true,
      openAuthModal: vi.fn(),
    } as never)

    mockedUseArenaAccountData.mockReturnValue({
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
      sourceMode: 'unavailable',
      isLoading: false,
      errorMessage: 'Backend account overview unavailable',
      refresh: vi.fn(),
      updatePreferences: vi.fn(),
      loadExport: vi.fn(),
      createExport: vi.fn(),
    })

    renderRewardsPage()

    expect(screen.getByText('奖励账户读取失败')).toBeInTheDocument()
    expect(screen.getByText('Backend account overview unavailable')).toBeInTheDocument()
    expect(screen.getByText('暂不可用')).toBeInTheDocument()
  })
})
