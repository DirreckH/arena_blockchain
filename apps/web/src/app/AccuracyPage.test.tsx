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
            title: '真实公开结果命题',
            category: 'politics',
            winningOptionLabel: '支持',
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

    expect(await screen.findByRole('heading', { name: '公开结果复核' })).toBeInTheDocument()
    expect(await screen.findByText('近期已结算命题')).toBeInTheDocument()
    expect(await screen.findByText('真实公开结果命题')).toBeInTheDocument()
    expect(await screen.findByText('支持')).toBeInTheDocument()
    expect(await screen.findByText('0xabc123')).toBeInTheDocument()
    expect(await screen.findByText('胜出占比 62.5%')).toBeInTheDocument()
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
            title: '演示公开结果命题',
            category: 'ai',
            winningOptionLabel: '会改善',
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

    expect(await screen.findByText('演示公开结果命题')).toBeInTheDocument()
    expect(screen.getByText('混合数据')).toBeInTheDocument()
  })
})
