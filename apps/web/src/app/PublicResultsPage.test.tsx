import userEvent from '@testing-library/user-event'
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

describe('public results page', () => {
  beforeEach(() => {
    getPublicSettledResultsFeed.mockReset()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('renders public result cards from the settled archive feed', async () => {
    getPublicSettledResultsFeed.mockResolvedValue({
      sourceMode: 'live',
      data: {
        totalCount: 2,
        items: [
          {
            propositionId: 'settled-proposition-1',
            marketId: 'settled-market-1',
            title: '真实公开结果命题 A',
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
          {
            propositionId: 'settled-proposition-2',
            marketId: null,
            title: '真实公开结果命题 B',
            category: 'ai',
            winningOptionLabel: '会改善',
            resultKind: 'resolved',
            winningOption: 0,
            voidReason: null,
            validSampleCount: 64,
            winMarginPercent: 54.7,
            settledAt: '2026-04-01T08:00:00.000Z',
            settlementTxHash: null,
            onChain: false,
          },
        ],
      },
    })

    renderApp(['/zh/predictions/public-results'])

    expect(await screen.findByRole('heading', { name: '公开结果' })).toBeInTheDocument()
    expect(screen.getByTestId('public-result-card-settled-proposition-1')).toBeInTheDocument()
    expect(screen.getByTestId('public-result-card-settled-proposition-2')).toBeInTheDocument()
    expect(screen.getByText('支持')).toBeInTheDocument()
    expect(screen.getByText('会改善')).toBeInTheDocument()
    expect(screen.getByText('62.5%')).toBeInTheDocument()
    expect(screen.getByText('未附链上证据')).toBeInTheDocument()
  })

  it('filters public result cards by topic from the top-right filter button', async () => {
    getPublicSettledResultsFeed.mockResolvedValue({
      sourceMode: 'live',
      data: {
        totalCount: 3,
        items: [
          {
            propositionId: 'settled-proposition-1',
            marketId: 'settled-market-1',
            title: '公共政策公开结果',
            category: 'politics',
            winningOptionLabel: '改善明显',
            resultKind: 'resolved',
            winningOption: 0,
            voidReason: null,
            validSampleCount: 128,
            winMarginPercent: 62.5,
            settledAt: '2026-05-01T08:00:00.000Z',
            settlementTxHash: '0xabc123',
            onChain: true,
          },
          {
            propositionId: 'settled-proposition-2',
            marketId: 'settled-market-2',
            title: 'AI 公开结果一',
            category: 'ai',
            winningOptionLabel: '支持自律规范',
            resultKind: 'resolved',
            winningOption: 0,
            voidReason: null,
            validSampleCount: 64,
            winMarginPercent: 54.7,
            settledAt: '2026-04-01T08:00:00.000Z',
            settlementTxHash: '0xdef456',
            onChain: true,
          },
          {
            propositionId: 'settled-proposition-3',
            marketId: null,
            title: 'AI 公开结果二',
            category: 'ai',
            winningOptionLabel: '满意度提升',
            resultKind: 'resolved',
            winningOption: 0,
            voidReason: null,
            validSampleCount: 72,
            winMarginPercent: 56.1,
            settledAt: '2026-03-21T08:00:00.000Z',
            settlementTxHash: null,
            onChain: false,
          },
        ],
      },
    })

    const user = userEvent.setup()

    renderApp(['/zh/predictions/public-results'])

    const filterButton = await screen.findByRole('button', { name: /筛选/i })
    await user.click(filterButton)

    const aiOption = await screen.findByRole('menuitemradio', { name: /AI \/ Technology/i })
    await user.click(aiOption)

    expect(screen.getByText('AI 公开结果一')).toBeInTheDocument()
    expect(screen.getByText('AI 公开结果二')).toBeInTheDocument()
    expect(screen.queryByText('公共政策公开结果')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /筛选 AI \/ Technology/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看复核流程' })).toBeInTheDocument()
  })

  it('shows a degraded source badge when the settled archive feed falls back to mixed data', async () => {
    getPublicSettledResultsFeed.mockResolvedValue({
      sourceMode: 'mixed',
      data: {
        totalCount: 1,
        items: [
          {
            propositionId: 'demo-settled-proposition-1',
            marketId: 'demo-settled-market-1',
            title: '演示公开结果命题',
            category: 'general',
            winningOptionLabel: '保持不变',
            resultKind: 'resolved',
            winningOption: 0,
            voidReason: null,
            validSampleCount: 40,
            winMarginPercent: 51.2,
            settledAt: '2026-04-12T08:00:00.000Z',
            settlementTxHash: '0xdemo',
            onChain: true,
          },
        ],
      },
    })

    renderApp(['/zh/predictions/public-results'])

    expect(await screen.findByText('演示公开结果命题')).toBeInTheDocument()
    expect(screen.getByText('混合数据')).toBeInTheDocument()
  })
})
