import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render-app'

const { getPublicSettledResultsFeed } = vi.hoisted(() => ({
  getPublicSettledResultsFeed: vi.fn(),
}))

vi.mock('../features/api/arena-api', async () => {
  const actual = await vi.importActual<typeof import('../features/api/arena-api')>('../features/api/arena-api')

  return {
    ...actual,
    arenaApi: {
      ...actual.arenaApi,
      getPublicSettledResultsFeed,
    },
  }
})

describe('accuracy page', () => {
  beforeEach(() => {
    getPublicSettledResultsFeed.mockReset()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('renders live public settled results from the real feed', async () => {
    getPublicSettledResultsFeed.mockResolvedValue({
      sourceMode: 'live',
      data: {
        totalCount: 1,
        items: [
          {
            propositionId: 'settled-proposition-1',
            marketId: 'settled-market-1',
            title: 'Live settled proposition',
            category: 'politics',
            winningOptionLabel: 'Affirmative',
            resultKind: 'resolved',
            winningOption: 0,
            voidReason: null,
            validSampleCount: 128,
            winMarginPercent: 62.5,
            settledAt: '2026-05-01T08:00:00.000Z',
            settlementTxHash: '0xabc123',
            onChain: true,
          },
        ],
      },
    })

    renderApp(['/zh/accuracy'])

    expect(await screen.findByText('Live settled proposition')).toBeInTheDocument()
    expect(await screen.findByText('Affirmative')).toBeInTheDocument()
    expect(await screen.findByText('0xabc123')).toBeInTheDocument()
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'SMALL' && (element.textContent?.includes('128') ?? false),
      ),
    ).toBeInTheDocument()
  })

  it('shows a degraded source badge when the feed falls back to demo-backed archive data', async () => {
    getPublicSettledResultsFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: {
        totalCount: 1,
        items: [
          {
            propositionId: 'demo-settled-proposition-1',
            marketId: 'demo-settled-market-1',
            title: 'Demo fallback settled proposition',
            category: 'ai',
            winningOptionLabel: 'Improves',
            resultKind: 'resolved',
            winningOption: 0,
            voidReason: null,
            validSampleCount: 64,
            winMarginPercent: 54.7,
            settledAt: '2026-04-01T08:00:00.000Z',
            settlementTxHash: '0xdemo',
            onChain: true,
          },
        ],
      },
    })

    renderApp(['/zh/accuracy'])

    expect(await screen.findByText('Demo fallback settled proposition')).toBeInTheDocument()
    expect(screen.getByText('混合数据')).toBeInTheDocument()
  })

  it('surfaces a fully unavailable source state when the public settled-results feed cannot be loaded at all', async () => {
    getPublicSettledResultsFeed.mockRejectedValue(new Error('Public settled results unavailable'))

    renderApp(['/zh/accuracy'])

    expect(await screen.findByText('Public settled results unavailable')).toBeInTheDocument()
    expect(screen.getByText('暂不可用')).toBeInTheDocument()
    expect(screen.queryByText('混合数据')).not.toBeInTheDocument()
  })
})
