import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FilterStrip } from './FilterStrip'
import { TopNavigation } from './TopNavigation'

vi.mock('../../features/auth/auth-session', () => ({
  useAuthSession: () => ({
    sessionMode: 'demo',
  }),
}))

vi.mock('../shared/RulesIntroContext', () => ({
  useRulesIntro: () => ({
    isAuthenticated: false,
    user: null,
    openAuthModal: vi.fn(),
    openRulesIntro: vi.fn(),
  }),
}))

vi.mock('../shared/QuickMenuContext', () => ({
  useQuickMenu: () => ({
    activeQuickMenuTrigger: null,
    isQuickMenuOpen: false,
    registerQuickMenuTrigger: () => () => undefined,
    toggleQuickMenu: vi.fn(),
  }),
}))

vi.mock('../../features/arena/discovery-data', () => ({
  useOptionalDiscoveryData: () => ({
    categoryIndex: new Map([
      ['/zh/politics', {
        slug: 'politics',
        pathname: '/zh/politics',
        label: '公共政策',
        title: '政治',
        directoryLabel: '公共政策',
        description: '政府、立法与公共治理',
      }],
      ['/zh/sports/live', {
        slug: 'sports-live',
        pathname: '/zh/sports/live',
        label: '体育',
        title: '体育',
        directoryLabel: '体育结果',
        description: '赛事结果与运动员表现',
      }],
    ]),
  }),
}))

describe('more dropdown positioning', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
    })
  })

  it('positions the top navigation More dropdown below the trigger with computed layout styles', async () => {
    render(
      <MemoryRouter>
        <TopNavigation />
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    const moreButton = screen.getByRole('button', { name: 'More pages' })

    Object.defineProperty(moreButton, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 240,
        bottom: 72,
      }),
    })

    await user.click(moreButton)

    const dropdown = document.querySelector('.more-dropdown') as HTMLDivElement | null
    expect(dropdown).not.toBeNull()

    Object.defineProperty(dropdown as HTMLDivElement, 'offsetWidth', {
      configurable: true,
      value: 180,
    })

    window.dispatchEvent(new Event('resize'))

    await waitFor(() => {
      expect(dropdown).toHaveStyle({ top: '76px' })
      expect(dropdown).toHaveStyle({ left: '240px' })
      expect(dropdown).toHaveStyle({ maxHeight: '812px' })
    })
  })

  it('renders the top navigation More dropdown with only the leaderboard entry', async () => {
    render(
      <MemoryRouter>
        <TopNavigation />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'More pages' }))

    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: '排行榜' })).toBeInTheDocument()
  })

  it('positions the filter-strip More dropdown below the trigger with computed layout styles', async () => {
    render(
      <MemoryRouter initialEntries={['/zh/markets']}>
        <FilterStrip />
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    const moreButton = screen.getByRole('button', { name: 'More categories' })

    Object.defineProperty(moreButton, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 1180,
        bottom: 178,
      }),
    })

    await user.click(moreButton)

    const dropdown = document.querySelector('.more-dropdown') as HTMLDivElement | null
    expect(dropdown).not.toBeNull()

    Object.defineProperty(dropdown as HTMLDivElement, 'offsetWidth', {
      configurable: true,
      value: 220,
    })

    window.dispatchEvent(new Event('resize'))

    await waitFor(() => {
      expect(dropdown).toHaveStyle({ top: '182px' })
      expect(dropdown).toHaveStyle({ left: '1048px' })
      expect(dropdown).toHaveStyle({ maxHeight: '706px' })
    })
  })

  it('renders the filter-strip More dropdown with only the requested topic entries', async () => {
    render(
      <MemoryRouter initialEntries={['/zh/markets']}>
        <FilterStrip />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'More categories' }))

    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(screen.getByRole('menuitem', { name: '公开结果' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '即将开奖' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '收藏' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '滚动命题' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '公共政策' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'AI 调研' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '地缘事件' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '金融观察' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '体育结果' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '有效样本' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '热门' })).not.toBeInTheDocument()
  })
  it('renders category navigation chips from the discovery index contract instead of only the local nav mock list', async () => {
    render(
      <MemoryRouter initialEntries={['/zh/markets']}>
        <FilterStrip />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: '公共政策' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '体育' })).toBeInTheDocument()
  })
})
