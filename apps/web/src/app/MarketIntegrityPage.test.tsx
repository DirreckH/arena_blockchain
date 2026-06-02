import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render-app'

const { getPublicIntegrityOverviewFeed } = vi.hoisted(() => ({
  getPublicIntegrityOverviewFeed: vi.fn(),
}))

vi.mock('../features/api/arena-api', async () => {
  const actual = await vi.importActual<typeof import('../features/api/arena-api')>('../features/api/arena-api')

  return {
    ...actual,
    arenaApi: {
      ...actual.arenaApi,
      getPublicIntegrityOverviewFeed,
    },
  }
})

describe('market integrity page', () => {
  beforeEach(() => {
    getPublicIntegrityOverviewFeed.mockReset()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('renders live public integrity overview data from the real feed', async () => {
    getPublicIntegrityOverviewFeed.mockResolvedValue({
      sourceMode: 'live',
      data: {
        generatedAt: '2026-05-29T10:00:00.000Z',
        live: {
          totalCount: 2,
          reachedSampleThresholdCount: 1,
          marketEnabledCount: 2,
          phaseBreakdown: [
            { phase: 'live', label: 'Collecting', count: 1 },
            { phase: 'revealing', label: 'Revealing', count: 1 },
          ],
          items: [
            {
              propositionId: 'integrity-live-1',
              title: 'Live integrity proposition',
              category: 'ai',
              phase: 'live',
              effectiveSampleCount: 96,
              requiredSampleCount: 120,
              progressPercent: 80,
              reachedSampleThreshold: false,
              marketEnabled: true,
              deadlineAt: '2026-05-30T10:00:00.000Z',
            },
            {
              propositionId: 'integrity-live-2',
              title: 'Revealing integrity proposition',
              category: 'politics',
              phase: 'revealing',
              effectiveSampleCount: 180,
              requiredSampleCount: 180,
              progressPercent: 100,
              reachedSampleThreshold: true,
              marketEnabled: true,
              deadlineAt: '2026-05-29T16:00:00.000Z',
            },
          ],
        },
        archive: {
          settledCount: 4,
          onChainCount: 3,
          averageValidSampleCount: 188,
          latestSettledAt: '2026-05-28T08:00:00.000Z',
        },
      },
    })

    renderApp(['/zh/market-integrity'])

    expect(await screen.findByText('Live integrity proposition')).toBeInTheDocument()
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'SPAN' && (element.textContent?.includes('96/120') ?? false),
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        (_, element) => element?.tagName === 'EM' && element.textContent?.trim() === '188',
      ),
    ).toBeInTheDocument()
  })

  it('shows a degraded source badge when the feed falls back to demo-backed integrity data', async () => {
    getPublicIntegrityOverviewFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: {
        generatedAt: '2026-05-29T10:00:00.000Z',
        live: {
          totalCount: 1,
          reachedSampleThresholdCount: 0,
          marketEnabledCount: 1,
          phaseBreakdown: [
            { phase: 'live', label: 'Collecting', count: 1 },
          ],
          items: [
            {
              propositionId: 'integrity-demo-1',
              title: 'Demo fallback integrity proposition',
              category: 'sports',
              phase: 'live',
              effectiveSampleCount: 24,
              requiredSampleCount: 60,
              progressPercent: 40,
              reachedSampleThreshold: false,
              marketEnabled: true,
              deadlineAt: '2026-05-31T10:00:00.000Z',
            },
          ],
        },
        archive: {
          settledCount: 1,
          onChainCount: 1,
          averageValidSampleCount: 64,
          latestSettledAt: '2026-05-01T08:00:00.000Z',
        },
      },
    })

    renderApp(['/zh/market-integrity'])

    expect(await screen.findByText('Demo fallback integrity proposition')).toBeInTheDocument()
    expect(screen.getByText('混合数据')).toBeInTheDocument()
  })

  it('surfaces a fully unavailable source state when the integrity overview feed cannot be loaded at all', async () => {
    getPublicIntegrityOverviewFeed.mockRejectedValue(new Error('Public integrity overview unavailable'))

    renderApp(['/zh/market-integrity'])

    expect(await screen.findByText('Public integrity overview unavailable')).toBeInTheDocument()
    expect(screen.getByText('暂不可用')).toBeInTheDocument()
    expect(screen.queryByText('混合数据')).not.toBeInTheDocument()
  })
})
