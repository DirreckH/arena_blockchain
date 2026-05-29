import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDemoIdentity, DEMO_SESSION_TOKEN } from '../features/demo/demo-auth'
import { demoBackend } from '../features/demo/demo-backend'
import { renderApp } from '../test/render-app'

const AUTH_TOKEN_STORAGE_KEY = 'arena.auth.token'
const AUTH_IDENTITY_STORAGE_KEY = 'arena.auth.identity'

describe('results page', () => {
  beforeEach(() => {
    demoBackend.reset()
  })

  afterEach(() => {
    window.localStorage.clear()
    demoBackend.reset()
  })

  it('hides the demo source badge for an authenticated demo session', async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, DEMO_SESSION_TOKEN)
    window.localStorage.setItem(AUTH_IDENTITY_STORAGE_KEY, JSON.stringify(buildDemoIdentity(31337)))

    renderApp(['/zh/results'])

    expect(await screen.findByRole('main')).toBeInTheDocument()
    expect(screen.queryByText('体验')).not.toBeInTheDocument()
  })

  it('opens the login modal when the user is not authenticated', async () => {
    renderApp(['/zh/results'])

    expect(await screen.findByRole('dialog', { name: '钱包登录' })).toBeInTheDocument()
    expect(screen.getByLabelText('结果页')).toBeInTheDocument()
  })
})
