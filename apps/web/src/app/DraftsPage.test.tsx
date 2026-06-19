import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEMO_SESSION_TOKEN, buildDemoIdentity } from '../features/demo/demo-auth'
import { demoBackend } from '../features/demo/demo-backend'
import { renderApp } from '../test/render-app'

const AUTH_TOKEN_STORAGE_KEY = 'arena.auth.token'
const AUTH_IDENTITY_STORAGE_KEY = 'arena.auth.identity'

describe('drafts page', () => {
  beforeEach(() => {
    demoBackend.reset()
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, DEMO_SESSION_TOKEN)
    window.localStorage.setItem(AUTH_IDENTITY_STORAGE_KEY, JSON.stringify(buildDemoIdentity(31337)))
  })

  afterEach(() => {
    window.localStorage.clear()
    demoBackend.reset()
  })

  it('renders readable sample-constraint labels inside the draft detail panel', async () => {
    demoBackend.updateDraft('draft-demo-search-quality', {
      sampleConstraints: ['experienced_user', 'interested_in_ai'],
    })

    renderApp(['/zh/drafts?draft=draft-demo-search-quality'])

    const detailPanel = await screen.findByText('资深答题人')
    expect(detailPanel).toBeInTheDocument()
    expect(screen.getByText('AI 兴趣')).toBeInTheDocument()
    expect(screen.queryByText('experienced_user')).not.toBeInTheDocument()
  })

  it('shows an explicit empty state when a draft has no sample constraints', async () => {
    demoBackend.updateDraft('draft-demo-search-quality', {
      sampleConstraints: [],
    })

    renderApp(['/zh/drafts?draft=draft-demo-search-quality'])

    const emptyBadge = await screen.findByTestId('draft-sample-constraints-empty')
    expect(emptyBadge).toHaveTextContent('暂无样本约束')

    const detailArticle = emptyBadge.closest('.drafts-detail-card')
    expect(detailArticle).not.toBeNull()
    expect(within(detailArticle as HTMLElement).queryByText('AI 兴趣')).not.toBeInTheDocument()
  })
})
