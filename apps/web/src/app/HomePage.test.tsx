import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render-app'

const {
  getPublicMarketsFeed,
  getDiscoveryHomeFeed,
  getDiscoveryRankingFeed,
  getLatestTopicsFeed,
  getPublicRespondentLeaderboardFeed,
  getCategoryDirectoryIndexFeed,
  getCategoryDirectoryFeed,
} = vi.hoisted(() => ({
  getPublicMarketsFeed: vi.fn(),
  getDiscoveryHomeFeed: vi.fn(),
  getDiscoveryRankingFeed: vi.fn(),
  getLatestTopicsFeed: vi.fn(),
  getPublicRespondentLeaderboardFeed: vi.fn(),
  getCategoryDirectoryIndexFeed: vi.fn(),
  getCategoryDirectoryFeed: vi.fn(),
}))

vi.mock('../features/api/arena-api', async () => {
  const actual = await vi.importActual<typeof import('../features/api/arena-api')>('../features/api/arena-api')

  return {
    ...actual,
    arenaApi: {
      ...actual.arenaApi,
      getPublicMarketsFeed,
      getDiscoveryHomeFeed,
      getDiscoveryRankingFeed,
      getLatestTopicsFeed,
      getPublicRespondentLeaderboardFeed,
      getCategoryDirectoryIndexFeed,
      getCategoryDirectoryFeed,
    },
  }
})

function buildPublicMarket(marketId: string, title: string) {
  return {
    marketId,
    propositionId: `${marketId}-proposition`,
    title,
    category: 'politics',
    options: ['Option A', 'Option B'],
    minBetAmount: '5',
    marketStatus: 'live',
    timeProgressPercent: 82,
    bettingClosesAt: '2026-05-30T10:00:00.000Z',
    canBet: true,
    publicProgress: {
      propositionId: `${marketId}-proposition`,
      title,
      status: 'live',
      marketEnabled: true,
      progress: {
        totalRequired: 100,
        currentEffectiveSample: 82,
        reviewedCount: 58,
        progressPercent: 82,
      },
      timing: {
        startedAt: '2026-05-27T10:00:00.000Z',
        minDurationSeconds: 3600,
        maxDurationSeconds: 86400,
        minDurationEndsAt: '2026-05-27T11:00:00.000Z',
        deadlineAt: '2026-05-30T10:00:00.000Z',
        frozenAt: null,
        revealStartedAt: null,
        settledAt: null,
      },
      publicState: {
        phase: 'live',
        reachedSampleThreshold: false,
        reachedMinDuration: true,
      },
      lastPublishedResult: null,
    },
    currentUserPosition: null,
  }
}

function primeHomePageFeeds(featuredMarketIds: string[], markets = featuredMarketIds.map((marketId, index) => buildPublicMarket(marketId, `Featured market ${index + 1}`))) {
  getPublicMarketsFeed.mockResolvedValue({
    sourceMode: 'mixed',
    data: markets,
  })

  getDiscoveryHomeFeed.mockResolvedValue({
    sourceMode: 'mixed',
    data: {
      featuredMarketIds,
      sections: [
        {
          href: '/zh',
          label: '发现',
          marketIds: featuredMarketIds,
          moreHref: '/zh/markets',
        },
      ],
    },
  })
  getDiscoveryRankingFeed.mockResolvedValue({
    sourceMode: 'mixed',
    data: {
      generatedAt: '2026-05-29T08:00:00.000Z',
      items: [],
    },
  })
  getLatestTopicsFeed.mockResolvedValue({
    sourceMode: 'mixed',
    data: {
      items: [],
    },
  })
  getPublicRespondentLeaderboardFeed.mockResolvedValue({
    sourceMode: 'mixed',
    data: {
      generatedAt: '2026-05-29T08:00:00.000Z',
      items: [],
    },
  })
  getCategoryDirectoryIndexFeed.mockResolvedValue({
    sourceMode: 'mixed',
    data: {
      items: [],
    },
  })
  getCategoryDirectoryFeed.mockResolvedValue({
    sourceMode: 'mixed',
    data: null,
  })
}

describe('home page source visibility', () => {
  beforeEach(() => {
    getPublicMarketsFeed.mockReset()
    getDiscoveryHomeFeed.mockReset()
    getDiscoveryRankingFeed.mockReset()
    getLatestTopicsFeed.mockReset()
    getPublicRespondentLeaderboardFeed.mockReset()
    getCategoryDirectoryIndexFeed.mockReset()
    getCategoryDirectoryFeed.mockReset()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('shows a degraded source badge when anonymous feeds fall back to demo-backed public data', async () => {
    getPublicMarketsFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: [
        {
          marketId: 'public-trust',
          propositionId: 'public-trust-proposition',
          title: '演示回退命题',
          category: 'politics',
          options: ['支持', '反对'],
          minBetAmount: '5',
          marketStatus: 'live',
          timeProgressPercent: 82,
          bettingClosesAt: '2026-05-30T10:00:00.000Z',
          canBet: true,
          publicProgress: {
            propositionId: 'public-trust-proposition',
            title: '演示回退命题',
            status: 'live',
            marketEnabled: true,
            progress: {
              totalRequired: 100,
              currentEffectiveSample: 82,
              reviewedCount: 58,
              progressPercent: 82,
            },
            timing: {
              startedAt: '2026-05-27T10:00:00.000Z',
              minDurationSeconds: 3600,
              maxDurationSeconds: 86400,
              minDurationEndsAt: '2026-05-27T11:00:00.000Z',
              deadlineAt: '2026-05-30T10:00:00.000Z',
              frozenAt: null,
              revealStartedAt: null,
              settledAt: null,
            },
            publicState: {
              phase: 'live',
              reachedSampleThreshold: false,
              reachedMinDuration: true,
            },
            lastPublishedResult: null,
          },
          currentUserPosition: null,
        },
      ],
    })

    getDiscoveryHomeFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: {
        featuredMarketIds: ['public-trust'],
        sections: [
          {
            href: '/zh',
            label: '发现',
            marketIds: ['public-trust'],
            moreHref: '/zh/markets',
          },
        ],
      },
    })
    getDiscoveryRankingFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: {
        generatedAt: '2026-05-29T08:00:00.000Z',
        items: [],
      },
    })
    getLatestTopicsFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: {
        items: [],
      },
    })
    getPublicRespondentLeaderboardFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: {
        generatedAt: '2026-05-29T08:00:00.000Z',
        items: [],
      },
    })
    getCategoryDirectoryIndexFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: {
        items: [],
      },
    })
    getCategoryDirectoryFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: null,
    })

    renderApp(['/zh'])

    expect(await screen.findByText('混合数据')).toBeInTheDocument()
  })

  it('renders a ten-slot featured pager and moves the active slot to the selected page', async () => {
    primeHomePageFeeds(['market-1', 'market-2', 'market-3'])

    renderApp(['/zh'])

    const pagerButtons = await screen.findAllByRole('button', { name: /^精选命题第 \d+ 页/ })
    expect(pagerButtons).toHaveLength(10)
    expect(screen.getByRole('button', { name: /^精选命题第 1 页/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^精选命题第 2 页/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^精选命题第 4 页/ })).toBeDisabled()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^精选命题第 2 页/ }))

    expect(screen.getByRole('button', { name: /^精选命题第 1 页/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^精选命题第 2 页/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
