import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../../test/render-app'
import { buildDemoIdentity, DEMO_SESSION_TOKEN } from '../../features/demo/demo-auth'

const AUTH_TOKEN_STORAGE_KEY = 'arena.auth.token'
const AUTH_IDENTITY_STORAGE_KEY = 'arena.auth.identity'

function seedDemoSession() {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, DEMO_SESSION_TOKEN)
  window.localStorage.setItem(
    AUTH_IDENTITY_STORAGE_KEY,
    JSON.stringify(buildDemoIdentity(1)),
  )
}

describe('adjudication detail page', () => {
  beforeEach(() => {
    seedDemoSession()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('renders the adjudication interface with options and submit action for a task', async () => {
    renderApp(['/zh/adjudicate/demo-task-1'])

    expect(await screen.findByRole('button', { name: /提交真实裁决/ })).toBeInTheDocument()
    expect(screen.getByLabelText('裁决命题')).toBeInTheDocument()
    expect(screen.getByLabelText('裁决选项')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /返回裁决层/ })).toHaveAttribute('href', '/zh/adjudication')
  })

  it('does not render the betting position panel from the market detail page', async () => {
    renderApp(['/zh/adjudicate/demo-task-1'])

    await screen.findByRole('button', { name: /提交真实裁决/ })
    expect(screen.queryByText('建立持仓')).not.toBeInTheDocument()
    expect(screen.queryByText('下注金额')).not.toBeInTheDocument()
  })

  it('shows a not-found state for an unknown task id', async () => {
    renderApp(['/zh/adjudicate/unknown-task'])

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /提交真实裁决/ })).not.toBeInTheDocument()
    })
  })
})
