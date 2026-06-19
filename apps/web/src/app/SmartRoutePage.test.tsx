import { screen, waitFor } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { arenaApi } from '../features/api/arena-api'
import { buildDemoIdentity, DEMO_SESSION_TOKEN } from '../features/demo/demo-auth'
import { demoBackend } from '../features/demo/demo-backend'
import { renderApp } from '../test/render-app'

const AUTH_TOKEN_STORAGE_KEY = 'arena.auth.token'
const AUTH_IDENTITY_STORAGE_KEY = 'arena.auth.identity'

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="current-path">{location.pathname}</div>
}

describe('smart route page routes', () => {
  beforeEach(() => {
    demoBackend.reset()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redirects /zh/menu to /zh and renders the main shell', async () => {
    renderApp(['/zh/menu'], <LocationProbe />)

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/zh')
    })

    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument()
  })

  it('renders requester submissions page on /zh/submissions', async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, DEMO_SESSION_TOKEN)
    window.localStorage.setItem(AUTH_IDENTITY_STORAGE_KEY, JSON.stringify(buildDemoIdentity(31337)))

    renderApp(['/zh/submissions'])

    expect(await screen.findByRole('heading', { name: '已提交命题' })).toBeInTheDocument()
    expect(await screen.findByText('审核中的候选命题')).toBeInTheDocument()
  })

  it.each([
    ['/zh/predictions/public-results', '公开结果'],
    ['/zh/predictions/closing-soon', '即将开奖'],
  ])('renders %s as the productized topic page', (pathname, title) => {
    renderApp([pathname])

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it.each([
    '/zh/predictions/rolling',
    '/zh/predictions/public-policy',
    '/zh/predictions/geopolitics',
    '/zh/predictions/ai',
    '/zh/predictions/finance',
    '/zh/predictions/sports',
    '/zh/predictions/effective-sample',
  ])('renders %s as not found after removal', (pathname) => {
    renderApp([pathname])

    expect(screen.getByRole('heading', { name: '页面未找到' })).toBeInTheDocument()
  })
  it('resolves category directory routes from the discovery index contract instead of the local pathname mock list', async () => {
    vi.spyOn(arenaApi, 'getCategoryDirectoryIndexFeed').mockResolvedValue({
      sourceMode: 'live',
      data: {
        items: [
          {
            slug: 'signal-lab',
            pathname: '/zh/signal-lab',
            label: 'Signal Lab',
            title: 'Signal Lab',
            directoryLabel: 'Signal Lab',
            description: 'Signal Lab description',
          },
        ],
      },
    })
    vi.spyOn(arenaApi, 'getCategoryDirectoryFeed').mockImplementation(async (slug: string) => ({
      sourceMode: 'live',
      data: slug === 'signal-lab'
        ? {
            title: 'Signal Lab',
            featuredMarketId: 'public-trust',
            marketIds: ['public-trust'],
            sidebarItems: [
              {
                label: 'All',
                count: '1',
              },
            ],
          }
        : null,
    }))

    renderApp(['/zh/signal-lab'])

    expect(await screen.findByRole('heading', { level: 1, name: 'Signal Lab' })).toBeInTheDocument()
  })
})
