import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render-app'

const {
  getDiscoveryClosingSoonFeed,
  getPublicMarketsFeed,
} = vi.hoisted(() => ({
  getDiscoveryClosingSoonFeed: vi.fn(),
  getPublicMarketsFeed: vi.fn(),
}))

vi.mock('../features/api/arena-api', async () => {
  const actual = await vi.importActual<typeof import('../features/api/arena-api')>('../features/api/arena-api')

  return {
    ...actual,
    arenaApi: {
      ...actual.arenaApi,
      getDiscoveryClosingSoonFeed,
      getPublicMarketsFeed,
    },
  }
})

describe('closing soon page', () => {
  beforeEach(() => {
    getDiscoveryClosingSoonFeed.mockReset()
    getPublicMarketsFeed.mockReset()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('renders backend-provided urgent and upcoming buckets from the public discovery feed', async () => {
    getPublicMarketsFeed.mockResolvedValue({
      sourceMode: 'live',
      data: [
        {
          marketId: 'urgent-market-1',
          propositionId: 'urgent-proposition-1',
          title: '真实即将开奖命题 A',
          category: 'politics',
          options: ['支持', '反对'],
          minBetAmount: '5',
          marketStatus: 'live',
          timeProgressPercent: 88,
          bettingClosesAt: '2026-05-27T10:00:00.000Z',
          canBet: true,
          publicProgress: {
            propositionId: 'urgent-proposition-1',
            title: '真实即将开奖命题 A',
            status: 'live',
            marketEnabled: true,
            progress: {
              totalRequired: 100,
              currentEffectiveSample: 87,
              reviewedCount: 62,
              progressPercent: 87,
            },
            timing: {
              startedAt: '2026-05-24T10:00:00.000Z',
              minDurationSeconds: 3600,
              maxDurationSeconds: 86400,
              minDurationEndsAt: '2026-05-24T11:00:00.000Z',
              deadlineAt: '2026-05-27T10:00:00.000Z',
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
        {
          marketId: 'upcoming-market-1',
          propositionId: 'upcoming-proposition-1',
          title: '真实即将开奖命题 B',
          category: 'ai',
          options: ['会', '不会'],
          minBetAmount: '5',
          marketStatus: 'live',
          timeProgressPercent: 65,
          bettingClosesAt: '2026-05-27T16:00:00.000Z',
          canBet: true,
          publicProgress: {
            propositionId: 'upcoming-proposition-1',
            title: '真实即将开奖命题 B',
            status: 'live',
            marketEnabled: true,
            progress: {
              totalRequired: 100,
              currentEffectiveSample: 63,
              reviewedCount: 44,
              progressPercent: 63,
            },
            timing: {
              startedAt: '2026-05-24T10:00:00.000Z',
              minDurationSeconds: 3600,
              maxDurationSeconds: 86400,
              minDurationEndsAt: '2026-05-24T11:00:00.000Z',
              deadlineAt: '2026-05-27T16:00:00.000Z',
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

    getDiscoveryClosingSoonFeed.mockResolvedValue({
      sourceMode: 'live',
      data: {
        generatedAt: '2026-05-27T08:00:00.000Z',
        urgentWindowMs: 10800000,
        urgent: [
          {
            marketId: 'urgent-market-1',
            revealAt: '2026-05-27T10:00:00.000Z',
            differenceMs: 7200000,
          },
        ],
        upcoming: [
          {
            marketId: 'upcoming-market-1',
            revealAt: '2026-05-27T16:00:00.000Z',
            differenceMs: 28800000,
          },
        ],
      },
    })

    renderApp(['/zh/predictions/closing-soon'])

    expect(await screen.findByRole('heading', { name: '即将开奖' })).toBeInTheDocument()
    expect(await screen.findByText('真实即将开奖命题 A')).toBeInTheDocument()
    expect(await screen.findByText('真实即将开奖命题 B')).toBeInTheDocument()
    expect(await screen.findByText('约 2 小时后开奖')).toBeInTheDocument()
    expect(await screen.findByText('约 8 小时后开奖')).toBeInTheDocument()
    expect(await screen.findByText('即将进入 1 个')).toBeInTheDocument()
  })

  it('shows a degraded source badge when closing-soon data falls back to demo-backed feeds', async () => {
    getPublicMarketsFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: [
        {
          marketId: 'upcoming-only-market',
          propositionId: 'upcoming-only-proposition',
          title: '演示即将开奖命题',
          category: 'general',
          options: ['会', '不会'],
          minBetAmount: '5',
          marketStatus: 'live',
          timeProgressPercent: 54,
          bettingClosesAt: '2026-05-27T14:00:00.000Z',
          canBet: true,
          publicProgress: {
            propositionId: 'upcoming-only-proposition',
            title: '演示即将开奖命题',
            status: 'live',
            marketEnabled: true,
            progress: {
              totalRequired: 100,
              currentEffectiveSample: 52,
              reviewedCount: 36,
              progressPercent: 52,
            },
            timing: {
              startedAt: '2026-05-24T10:00:00.000Z',
              minDurationSeconds: 3600,
              maxDurationSeconds: 86400,
              minDurationEndsAt: '2026-05-24T11:00:00.000Z',
              deadlineAt: '2026-05-27T14:00:00.000Z',
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

    getDiscoveryClosingSoonFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: {
        generatedAt: '2026-05-27T08:00:00.000Z',
        urgentWindowMs: 10800000,
        urgent: [],
        upcoming: [
          {
            marketId: 'upcoming-only-market',
            revealAt: '2026-05-27T14:00:00.000Z',
            differenceMs: 21600000,
          },
        ],
      },
    })

    renderApp(['/zh/predictions/closing-soon'])

    expect(await screen.findByText('演示即将开奖命题')).toBeInTheDocument()
    expect(screen.getByText('混合数据')).toBeInTheDocument()
    expect(screen.queryByText('3 小时内暂时没有进入裁决窗口的命题')).not.toBeInTheDocument()
    expect(screen.queryByText('下面列出的是接下来最近几个即将进入裁决窗口的命题，可作为提前关注。')).not.toBeInTheDocument()
  })
})
