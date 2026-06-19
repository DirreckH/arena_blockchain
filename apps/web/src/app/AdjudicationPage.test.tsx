import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { AdjudicationTaskViewModel } from '@arena/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdjudicationPage } from './AdjudicationPage'
import { arenaApi } from '../features/api/arena-api'
import { useAuthSession } from '../features/auth/auth-session'
import { useValidationMarketData } from '../features/validation/validation-market-data'

vi.mock('../features/auth/auth-session', async () => {
  const actual = await vi.importActual('../features/auth/auth-session')

  return {
    ...actual,
    useAuthSession: vi.fn(),
  }
})

vi.mock('../features/validation/validation-market-data', async () => {
  const actual = await vi.importActual('../features/validation/validation-market-data')

  return {
    ...actual,
    useValidationMarketData: vi.fn(),
  }
})

vi.mock('../components/shared/RulesIntroContext', async () => {
  const actual = await vi.importActual('../components/shared/RulesIntroContext')

  return {
    ...actual,
    useRulesIntro: vi.fn(() => ({
      openRulesIntro: vi.fn(),
      openAuthModal: vi.fn(),
      isAuthenticated: true,
    })),
  }
})

vi.mock('../features/api/arena-api', async () => {
  const actual = await vi.importActual<typeof import('../features/api/arena-api')>('../features/api/arena-api')

  return {
    ...actual,
    arenaApi: {
      ...actual.arenaApi,
      listAdjudicationTasks: vi.fn(),
      startAdjudicationTask: vi.fn(),
      skipAdjudicationTask: vi.fn(),
      submitAdjudicationResponse: vi.fn(),
    },
  }
})

const mockedUseAuthSession = vi.mocked(useAuthSession)
const mockedUseValidationMarketData = vi.mocked(useValidationMarketData)
const TEST_SESSION_TOKEN = 'test-session-token'

const buildTask = (
  overrides: Partial<AdjudicationTaskViewModel> = {},
): AdjudicationTaskViewModel => ({
  taskId: 'task-1',
  propositionId: 'prop-1',
  title: 'Assigned task',
  description: 'Choose the better supported side.',
  options: ['Option A', 'Option B'],
  propositionStatus: 'live',
  taskStatus: 'assigned',
  assignedAt: '2026-06-04T08:00:00.000Z',
  startedAt: null,
  submittedAt: null,
  expiresAt: '2026-06-04T20:00:00.000Z',
  skipReason: null,
  expiryReason: null,
  cooldownUntil: null,
  hasSubmitted: false,
  timeRemainingSeconds: 7200,
  latestResponseStatus: null,
  rewardStatus: null,
  rewardPendingAmount: null,
  rewardFinalAmount: null,
  publicProgress: {
    propositionId: 'prop-1',
    title: 'Assigned task',
    status: 'live',
    marketEnabled: true,
    progress: {
      totalRequired: 10,
      currentEffectiveSample: 3,
      reviewedCount: 3,
      progressPercent: 30,
    },
    timing: {
      startedAt: '2026-06-04T08:00:00.000Z',
      minDurationSeconds: 600,
      maxDurationSeconds: 7200,
      minDurationEndsAt: '2026-06-04T08:10:00.000Z',
      deadlineAt: '2026-06-04T20:00:00.000Z',
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
  ...overrides,
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AdjudicationPage />
    </MemoryRouter>,
  )
}

describe('AdjudicationPage lifecycle integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedUseAuthSession.mockReturnValue({
      token: TEST_SESSION_TOKEN,
      isAuthenticated: true,
    } as never)

    mockedUseValidationMarketData.mockReturnValue({
      markets: [],
      rawMarkets: [
        {
          marketId: 'market-1',
          propositionId: 'prop-1',
        },
        {
          marketId: 'market-2',
          propositionId: 'prop-2',
        },
      ],
      refresh: vi.fn(),
    } as never)
  })

  afterEach(() => {
    cleanup()
  })

  it('starts an assigned task before the first submit', async () => {
    const listAdjudicationTasks = vi.mocked(arenaApi.listAdjudicationTasks)
    const startAdjudicationTask = vi.mocked((arenaApi as any).startAdjudicationTask)
    const submitAdjudicationResponse = vi.mocked(arenaApi.submitAdjudicationResponse)

    const assignedTask = buildTask()
    const startedTask = buildTask({
      taskStatus: 'started',
      startedAt: '2026-06-04T09:00:00.000Z',
    })
    const submittedTask = buildTask({
      taskStatus: 'submitted',
      startedAt: '2026-06-04T09:00:00.000Z',
      submittedAt: '2026-06-04T09:05:00.000Z',
      hasSubmitted: true,
      latestResponseStatus: 'pending_review',
    })
    let taskFeed = [assignedTask]

    listAdjudicationTasks.mockImplementation(async () => taskFeed)
    startAdjudicationTask.mockResolvedValue(startedTask)
    submitAdjudicationResponse.mockImplementation(async () => {
      taskFeed = [submittedTask]
      return {
        taskView: submittedTask,
        responseId: 'response-1',
        duplicateRetry: false,
        reviewRequested: true,
        counterRebuildRequired: true,
      }
    })

    renderPage()

    expect(await screen.findAllByText('Assigned task')).toHaveLength(3)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Option A/i }))
    await user.click(screen.getByRole('button', { name: /提交真实回答/i }))

    await waitFor(() => {
      expect(startAdjudicationTask).toHaveBeenCalledTimes(1)
      expect(submitAdjudicationResponse).toHaveBeenCalledTimes(1)
    })

    expect(startAdjudicationTask.mock.invocationCallOrder[0]).toBeLessThan(
      submitAdjudicationResponse.mock.invocationCallOrder[0],
    )
  })

  it('moves a skipped task out of pending and into 已结束 with reason and cooldown metadata', async () => {
    const listAdjudicationTasks = vi.mocked(arenaApi.listAdjudicationTasks)
    const skipAdjudicationTask = vi.mocked((arenaApi as any).skipAdjudicationTask)

    const activeTask = buildTask({
      title: 'Skip me',
    })
    const skippedTask = buildTask({
      title: 'Skip me',
      taskStatus: 'skipped',
      skipReason: 'user_declined',
      cooldownUntil: '2026-06-04T21:00:00.000Z',
      timeRemainingSeconds: 0,
    })
    let taskFeed = [activeTask]

    listAdjudicationTasks.mockImplementation(async () => taskFeed)
    skipAdjudicationTask.mockImplementation(async () => {
      taskFeed = [skippedTask]
      return skippedTask
    })

    renderPage()

    expect(await screen.findAllByText('Skip me')).toHaveLength(3)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /跳过本任务/i }))

    await waitFor(() => {
      expect(skipAdjudicationTask).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /跳过本任务/i })).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /已结束/i }))

    expect(await screen.findByText('Skip me')).toBeInTheDocument()
    expect(screen.getByText(/结束原因/i)).toBeInTheDocument()
    expect(screen.getByText(/冷却到/i)).toBeInTheDocument()
  })

  it('keeps expired tasks out of the active lead slot and pending tab', async () => {
    const listAdjudicationTasks = vi.mocked(arenaApi.listAdjudicationTasks)

    const expiredTask = buildTask({
      taskId: 'task-expired',
      propositionId: 'prop-2',
      title: 'Expired task',
      taskStatus: 'expired',
      expiryReason: 'ttl_elapsed',
      cooldownUntil: '2026-06-05T00:00:00.000Z',
      timeRemainingSeconds: 0,
    })
    const activeTask = buildTask({
      taskId: 'task-started',
      title: 'Started task',
      taskStatus: 'started',
      startedAt: '2026-06-04T09:10:00.000Z',
      timeRemainingSeconds: 1800,
    })

    listAdjudicationTasks.mockResolvedValue([expiredTask, activeTask])

    renderPage()

    expect(await screen.findAllByText('Started task')).toHaveLength(3)
    expect(screen.queryByText('Expired task')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /已结束/i }))

    expect(await screen.findByText('Expired task')).toBeInTheDocument()
  })

  it('limits the highlight queue to the top ten active tasks', async () => {
    const listAdjudicationTasks = vi.mocked(arenaApi.listAdjudicationTasks)

    const activeTasks = Array.from({ length: 12 }, (_, index) => buildTask({
      taskId: `task-${index + 1}`,
      propositionId: `prop-${index + 1}`,
      title: `Active task ${index + 1}`,
      taskStatus: index % 2 === 0 ? 'assigned' : 'started',
      startedAt: index % 2 === 0 ? null : '2026-06-04T09:10:00.000Z',
      timeRemainingSeconds: (index + 1) * 3600,
    }))

    listAdjudicationTasks.mockResolvedValue(activeTasks)

    renderPage()

    const queue = await screen.findByLabelText('更多近期热门事件')

    await waitFor(() => {
      expect(within(queue).getAllByRole('link')).toHaveLength(10)
    })

    expect(within(queue).queryByText('Active task 11')).not.toBeInTheDocument()
    expect(within(queue).queryByText('Active task 12')).not.toBeInTheDocument()
  })

  it('shows hovered queue topic details in the preview panel', async () => {
    const listAdjudicationTasks = vi.mocked(arenaApi.listAdjudicationTasks)

    listAdjudicationTasks.mockResolvedValue([
      buildTask({
        taskId: 'task-1',
        propositionId: 'prop-1',
        title: 'Public service response speed',
        description: 'Track whether quarterly public service response times continue improving.',
        publicProgress: {
          propositionId: 'prop-1',
          title: 'Public service response speed',
          status: 'live',
          marketEnabled: true,
          progress: {
            totalRequired: 10,
            currentEffectiveSample: 3,
            reviewedCount: 3,
            progressPercent: 30,
          },
          timing: {
            startedAt: '2026-06-04T08:00:00.000Z',
            minDurationSeconds: 600,
            maxDurationSeconds: 7200,
            minDurationEndsAt: '2026-06-04T08:10:00.000Z',
            deadlineAt: '2026-06-04T20:00:00.000Z',
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
      }),
      buildTask({
        taskId: 'task-2',
        propositionId: 'prop-2',
        title: 'AI toolchain verification survey',
        description: 'Review the satisfaction survey for the next AI toolchain verification workflow.',
        timeRemainingSeconds: 5400,
        publicProgress: {
          propositionId: 'prop-2',
          title: 'AI toolchain verification survey',
          status: 'live',
          marketEnabled: true,
          progress: {
            totalRequired: 12,
            currentEffectiveSample: 7,
            reviewedCount: 7,
            progressPercent: 58,
          },
          timing: {
            startedAt: '2026-06-04T08:30:00.000Z',
            minDurationSeconds: 600,
            maxDurationSeconds: 7200,
            minDurationEndsAt: '2026-06-04T08:40:00.000Z',
            deadlineAt: '2026-06-04T21:00:00.000Z',
            frozenAt: null,
            revealStartedAt: null,
            settledAt: null,
          },
          publicState: {
            phase: 'live',
            reachedSampleThreshold: true,
            reachedMinDuration: true,
          },
          lastPublishedResult: null,
        },
      }),
    ])

    renderPage()

    const detailPanel = await screen.findByLabelText('近期热门事件详情')
    expect(within(detailPanel).getByRole('heading', { name: 'AI toolchain verification survey' })).toBeInTheDocument()

    const user = userEvent.setup()
    await user.hover(screen.getByRole('link', { name: /Public service response speed/i }))

    await waitFor(() => {
      expect(within(detailPanel).getByRole('heading', { name: 'Public service response speed' })).toBeInTheDocument()
    })
    expect(within(detailPanel).getByText('3/10')).toBeInTheDocument()
  })
})
