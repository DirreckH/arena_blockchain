import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render-app'

const { getAuthProfile } = vi.hoisted(() => ({
  getAuthProfile: vi.fn(),
}))

vi.mock('../features/api/arena-api', async () => {
  const actual = await vi.importActual<typeof import('../features/api/arena-api')>(
    '../features/api/arena-api',
  )

  return {
    ...actual,
    arenaApi: {
      ...actual.arenaApi,
      getAuthProfile,
    },
  }
})

describe('dev session seed page', () => {
  afterEach(() => {
    getAuthProfile.mockReset()
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('stores the verified identity and requests a redirect reload', async () => {
    getAuthProfile.mockResolvedValue({
      sub: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      walletAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      chainId: 1337,
      roles: ['admin', 'operator', 'user'],
    })

    renderApp([
      '/zh/dev/session-seed?token=test-token&redirect=%2Fzh%2Fresults',
    ])

    expect(await screen.findByRole('heading', { name: 'Preparing local Arena session' })).toBeInTheDocument()

    await waitFor(() => {
      expect(window.localStorage.getItem('arena.auth.token')).toBe('test-token')
    })

    expect(JSON.parse(window.localStorage.getItem('arena.auth.identity') ?? '{}')).toMatchObject({
      walletAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      chainId: 1337,
    })
  })

  it('shows a clear error when the token is missing', async () => {
    renderApp(['/zh/dev/session-seed'])

    expect(await screen.findByText('Missing token query parameter.')).toBeInTheDocument()
  })
})
