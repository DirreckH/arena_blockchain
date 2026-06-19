import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildDemoIdentity, DEMO_SESSION_TOKEN } from '../features/demo/demo-auth'
import { demoBackend } from '../features/demo/demo-backend'
import { renderApp } from '../test/render-app'

const AUTH_TOKEN_STORAGE_KEY = 'arena.auth.token'
const AUTH_IDENTITY_STORAGE_KEY = 'arena.auth.identity'

describe('submissions page export creation', () => {
  beforeEach(() => {
    demoBackend.reset()
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, DEMO_SESSION_TOKEN)
    window.localStorage.setItem(
      AUTH_IDENTITY_STORAGE_KEY,
      JSON.stringify(buildDemoIdentity(31337)),
    )
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
    demoBackend.reset()
  })

  it('creates requester export snapshots without relying on deprecated userId fields', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    expect(screen.queryAllByTestId('requester-export-item')).toHaveLength(0)

    await user.click(await screen.findByTestId('create-requester-export'))

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-export-item')).toHaveLength(1)
    })

    expect(screen.getByTestId('requester-export-item')).toHaveTextContent(
      'arena-requester-demo-user-',
    )
  })
})
