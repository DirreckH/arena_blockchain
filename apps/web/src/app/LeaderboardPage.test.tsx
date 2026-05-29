import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicRespondentLeaderboardViewModel } from '@arena/shared'
import { renderApp } from '../test/render-app'

const {
  useAuthSession,
  useDiscoveryData,
} = vi.hoisted(() => ({
  useAuthSession: vi.fn(),
  useDiscoveryData: vi.fn(),
}))

vi.mock('../features/auth/auth-session', async () => {
  const actual = await vi.importActual<typeof import('../features/auth/auth-session')>(
    '../features/auth/auth-session',
  )

  return {
    ...actual,
    useAuthSession,
  }
})

vi.mock('../features/arena/discovery-data', async () => {
  const actual = await vi.importActual<typeof import('../features/arena/discovery-data')>(
    '../features/arena/discovery-data',
  )

  return {
    ...actual,
    useDiscoveryData,
  }
})

function buildRespondentLeaderboard(): PublicRespondentLeaderboardViewModel {
  return {
    categories: [
      {
        id: 'public-policy',
        label: '公共政策',
        description: '公共政策、公共服务、舆情类命题的回答率排行。',
        rows: [
          {
            userId: '0x1111111111111111111111111111111111111111',
            handle: 'respondent-1111',
            walletShort: '0x1111…1111',
            responseRatePercent: 100,
            reviewedCount: 2,
            acceptedCount: 2,
            reputationScore: 880,
            topTag: '公共政策',
          },
        ],
      },
      {
        id: 'ai-research',
        label: 'AI 调研',
        description: 'AI 工具链、模型调研、开发者工作流类命题的回答率排行。',
        rows: [
          {
            userId: '0x2222222222222222222222222222222222222222',
            handle: 'respondent-2222',
            walletShort: '0x2222…2222',
            responseRatePercent: 96.5,
            reviewedCount: 3,
            acceptedCount: 3,
            reputationScore: 910,
            topTag: 'AI 调研',
          },
        ],
      },
    ],
  }
}

describe('leaderboard route', () => {
  beforeEach(() => {
    useAuthSession.mockReturnValue({
      sessionMode: 'real',
    })
    useDiscoveryData.mockReturnValue({
      hot: null,
      respondentLeaderboard: buildRespondentLeaderboard(),
      sourceMode: 'live',
      isLoading: false,
      errorMessage: null,
    })
  })

  it('renders /zh/leaderboard with topic response-rate rankings only', () => {
    renderApp(['/zh/leaderboard'])

    expect(screen.getByRole('heading', { level: 1, name: '排行榜' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '各话题回答率排行' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /筛选.*公共政策/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '公共政策 用户排行表' })).toBeInTheDocument()
  })

  it('does not render the hot proposition section', () => {
    renderApp(['/zh/leaderboard'])

    expect(screen.queryByRole('heading', { level: 2, name: '受欢迎的热点命题' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('热点命题排行')).not.toBeInTheDocument()
  })
})
