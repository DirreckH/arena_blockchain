import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/render-app'

const {
  getMarketDiscussionThread,
} = vi.hoisted(() => ({
  getMarketDiscussionThread: vi.fn(),
}))

vi.mock('../../features/api/arena-api', async () => {
  const actual = await vi.importActual<typeof import('../../features/api/arena-api')>('../../features/api/arena-api')

  return {
    ...actual,
    arenaApi: {
      ...actual.arenaApi,
      getMarketDiscussionThread,
    },
  }
})

describe('market detail discussion boundary', () => {
  beforeEach(() => {
    getMarketDiscussionThread.mockReset()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('shows a pre-settlement hidden notice instead of live directional discussion', async () => {
    getMarketDiscussionThread.mockResolvedValue({
      marketId: 'public-trust',
      propositionId: 'public-trust-proposition',
      availability: 'pre_settlement_hidden',
      totalCount: 0,
      comments: [],
    })

    renderApp(['/zh/event/public-trust'])

    expect(await screen.findByTestId('discussion-pre-settlement-hidden')).toBeInTheDocument()
    expect(screen.getByText('开奖前隐藏讨论方向')).toBeInTheDocument()
  })

  it('shows a dedicated discussion load failure state when the live thread cannot be loaded', async () => {
    getMarketDiscussionThread.mockRejectedValue(new Error('Discussion service unavailable'))

    renderApp(['/zh/event/public-trust'])

    expect(await screen.findByTestId('discussion-load-error')).toBeInTheDocument()
    expect(screen.getByText('讨论区暂时不可用')).toBeInTheDocument()
    expect(screen.getByText('Discussion service unavailable')).toBeInTheDocument()
  })
})
