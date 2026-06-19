import type { RespondentResultOverviewViewModel } from '@arena/shared'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultsPage } from './ResultsPage'
import { useRulesIntro } from '../components/shared/RulesIntroContext'
import { useResultOverviewData } from '../features/arena/result-overview-data'

vi.mock('../components/shared/RulesIntroContext', async () => {
  const actual = await vi.importActual('../components/shared/RulesIntroContext')
  return {
    ...actual,
    useRulesIntro: vi.fn(),
  }
})

vi.mock('../features/arena/result-overview-data', async () => {
  const actual = await vi.importActual('../features/arena/result-overview-data')
  return {
    ...actual,
    useResultOverviewData: vi.fn(),
  }
})

const mockedUseRulesIntro = vi.mocked(useRulesIntro)
const mockedUseResultOverviewData = vi.mocked(useResultOverviewData)

function buildEmptyLiveOverview(): RespondentResultOverviewViewModel {
  return {
    settledResults: {
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
  }
}

function renderResultsPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ResultsPage />
    </MemoryRouter>,
  )
}

describe('results page live empty states', () => {
  beforeEach(() => {
    mockedUseRulesIntro.mockReturnValue({
      isAuthenticated: true,
      user: {
        displayName: '0x1234...abcd',
        avatarInitial: '1',
        email: 'live_user_1@wallet.arena.local',
        walletAddress: '0x1234567890abcdef1234567890abcdef1234abcd',
      },
      openAuthModal: vi.fn(),
    } as never)

    mockedUseResultOverviewData.mockReturnValue({
      overview: buildEmptyLiveOverview(),
      sourceMode: 'live',
      isLoading: false,
      errorMessage: null,
      refresh: vi.fn(),
    })
  })

  it('shows an explicit live empty state instead of seeded performance charts when settled history is missing', () => {
    renderResultsPage('/zh/results?tab=performance')

    expect(screen.getByTestId('results-performance-chart-empty')).toBeInTheDocument()
    expect(screen.queryByLabelText('累计收益曲线')).not.toBeInTheDocument()
  })

  it('shows an explicit live empty state instead of a seeded fund-flow chart when account activity is missing', () => {
    renderResultsPage('/zh/results?tab=records')

    expect(screen.getByTestId('results-fund-flow-empty')).toBeInTheDocument()
    expect(screen.queryByText('净流入 +2,680')).not.toBeInTheDocument()
  })
})
