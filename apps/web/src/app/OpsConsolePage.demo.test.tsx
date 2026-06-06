import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
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
})
