import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SystemRole } from '@arena/shared'
import { DEMO_SESSION_TOKEN } from '../features/demo/demo-auth'
import { opsCopy } from '../features/arena/ops-copy'

describe('OpsConsolePage demo operator flow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('backend offline'))))
    window.localStorage.setItem('arena.auth.token', DEMO_SESSION_TOKEN)
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('renders the overview workspace without a live operator backend', async () => {
    const [{ renderApp }, { demoBackend }] = await Promise.all([
      import('../test/render-app'),
      import('../features/demo/demo-backend'),
    ])
    demoBackend.reset()

    renderApp(['/zh/ops'])

    expect(await screen.findByText(opsCopy.shell.eyebrow)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.releaseReadiness)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.validationRehearsal)).toBeInTheDocument()
  }, 20000)

  it('renders proposition detail and respondent profile from demo operator data', async () => {
    const [{ renderApp }, { demoBackend }] = await Promise.all([
      import('../test/render-app'),
      import('../features/demo/demo-backend'),
    ])
    demoBackend.reset()

    renderApp(['/zh/ops/propositions/prop_list_1'])
    expect(await screen.findByText(opsCopy.dispatch.title)).toBeInTheDocument()

    window.localStorage.setItem('arena.auth.token', DEMO_SESSION_TOKEN)
    renderApp(['/zh/ops/respondents/respondent_1'])
    expect(await screen.findByText(opsCopy.respondent.title)).toBeInTheDocument()
  }, 20000)

  it('renders the discovery-config workspace in demo mode with writable demo controls', async () => {
    const [{ renderApp }, { demoBackend }] = await Promise.all([
      import('../test/render-app'),
      import('../features/demo/demo-backend'),
    ])
    demoBackend.reset()
    window.localStorage.setItem('arena.auth.identity', JSON.stringify({
      sub: 'stale-demo-operator',
      walletAddress: 'demo',
      chainId: 31337,
      roles: [SystemRole.Operator],
    }))

    const opsView = renderApp(['/zh/ops/discovery-config'])

    expect(await screen.findByRole('heading', { name: '分类配置' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('导航文案')).not.toBeInTheDocument()
      expect(screen.queryByText('目录文案')).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: '隐藏' }).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('button', { name: '删除' }).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: '保存全局配置' })).toBeEnabled()
    })

    const user = userEvent.setup()
    const politicsRow = screen.getAllByText('politics')[0]?.closest('tr')
    expect(politicsRow).not.toBeNull()
    await user.click(within(politicsRow!).getByRole('button', { name: '隐藏' }))

    await waitFor(() => {
      expect(within(politicsRow!).getByRole('button', { name: '显示' })).toBeInTheDocument()
    })

    opsView.unmount()
    renderApp(['/zh/politics'])
    expect(await screen.findByRole('heading', { name: '页面未找到' })).toBeInTheDocument()
  }, 20000)

  it('reflects demo discovery-config updates on ops and public routes without a live backend', async () => {
    const [{ renderApp }, { arenaApi }, { demoBackend }] = await Promise.all([
      import('../test/render-app'),
      import('../features/api/arena-api'),
      import('../features/demo/demo-backend'),
    ])
    demoBackend.reset()
    window.localStorage.setItem('arena.auth.identity', JSON.stringify({
      sub: 'admin-demo-user',
      walletAddress: 'demo',
      chainId: 31337,
      roles: [SystemRole.Admin],
    }))

    await arenaApi.updateOpsDiscoveryGlobalConfig({
      categories: [
        {
          slug: 'politics',
          pathname: '/zh/politics',
          label: '政策雷达',
          title: '政策',
          directoryLabel: '政策目录',
          description: '政策议题与公共治理追踪',
          displayOrder: -9,
        },
      ],
      rankingCategoryLabels: {
        all: '全部赛道',
        general: '综合',
        dao: 'DAO',
        politics: '政策轨道',
        sports: '竞技赛道',
        tech: '科技',
        research: '研究',
        culture: '文化',
      },
    }, DEMO_SESSION_TOKEN)

    await arenaApi.updateOpsDiscoveryCategoryConfig('politics', {
      sidebarItems: [
        {
          id: 'policy-focus',
          label: '政策焦点',
          linkedMarketIds: ['public-trust'],
        },
      ],
    }, DEMO_SESSION_TOKEN)

    const opsView = renderApp(['/zh/ops/discovery-config/politics'])
    expect(await screen.findByText('政策焦点')).toBeInTheDocument()
    opsView.unmount()

    const breakingView = renderApp(['/zh/breaking'])
    expect(await screen.findByRole('tab', { name: '政策轨道' })).toBeInTheDocument()
    breakingView.unmount()

    const categoryView = renderApp(['/zh/politics'])
    expect(await screen.findByRole('link', { name: '政策雷达' })).toBeInTheDocument()
    expect(screen.getByText('政策焦点')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    categoryView.unmount()
  }, 20000)
})
