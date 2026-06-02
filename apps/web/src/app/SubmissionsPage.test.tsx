import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemRole } from '@arena/shared'
import { arenaApi } from '../features/api/arena-api'
import { buildDemoIdentity, DEMO_SESSION_TOKEN } from '../features/demo/demo-auth'
import { demoBackend } from '../features/demo/demo-backend'
import { renderApp } from '../test/render-app'

const AUTH_TOKEN_STORAGE_KEY = 'arena.auth.token'
const AUTH_IDENTITY_STORAGE_KEY = 'arena.auth.identity'

describe('submissions page', () => {
  beforeEach(() => {
    demoBackend.reset()
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, DEMO_SESSION_TOKEN)
    window.localStorage.setItem(AUTH_IDENTITY_STORAGE_KEY, JSON.stringify(buildDemoIdentity(31337)))
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
    demoBackend.reset()
  })

  it('renders submitted propositions for an authenticated demo requester', async () => {
    renderApp(['/zh/submissions'])

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(await screen.findByTestId('submission-card-draft-demo-consensus-window')).toBeInTheDocument()
    expect(await screen.findByTestId('submission-overview-section')).toBeInTheDocument()
    expect(await screen.findByTestId('submission-recent-section')).toBeInTheDocument()
  })

  it('surfaces authenticated top-level requester load failures as unavailable instead of live', async () => {
    const realIdentity = {
      sub: 'real-requester-user',
      walletAddress: '0x123400000000000000000000000000000000abcd',
      chainId: 31337,
      roles: [SystemRole.User],
    }

    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'real-session-token')
    window.localStorage.setItem(AUTH_IDENTITY_STORAGE_KEY, JSON.stringify(realIdentity))

    vi.spyOn(arenaApi, 'getAuthProfile').mockResolvedValue(realIdentity)
    vi.spyOn(arenaApi, 'listSubmissions').mockRejectedValue(new Error('Requester submissions unavailable'))
    vi.spyOn(arenaApi, 'getRequesterOverview').mockResolvedValue(demoBackend.getRequesterOverview())
    vi.spyOn(arenaApi, 'listOwnedPropositionExports').mockResolvedValue(
      demoBackend.listOwnedPropositionExports(),
    )
    vi.spyOn(arenaApi, 'listRequesterReportPresets').mockResolvedValue(
      demoBackend.listRequesterReportPresets(),
    )
    vi.spyOn(arenaApi, 'listRequesterComparisonSets').mockResolvedValue(
      demoBackend.listRequesterComparisonSets(),
    )

    const { container } = renderApp(['/zh/submissions'])

    expect(await screen.findByText('Requester flow error')).toBeInTheDocument()
    expect(screen.getByText('Requester submissions unavailable')).toBeInTheDocument()
    expect(container.querySelector('.data-source-badge.unavailable')).not.toBeNull()
  })

  it('withdraws a submission back to drafts', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    const withdrawButton = await screen.findByTestId('withdraw-submission-draft-demo-consensus-window')
    await user.click(withdrawButton)

    await waitFor(() => {
      expect(
        screen.queryByTestId('withdraw-submission-draft-demo-consensus-window'),
      ).not.toBeInTheDocument()
    })

    expect(await screen.findByTestId('submission-empty-state')).toBeInTheDocument()
  })

  it('expands a submission into requester detail data', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(
      await screen.findByTestId('submission-detail-toggle-draft-demo-consensus-window'),
    )

    expect(
      await screen.findByTestId('submission-detail-panel-draft-demo-consensus-window'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('submission-status-draft-demo-consensus-window'),
    ).toHaveTextContent('Submitted')
    expect(
      screen.getByTestId('proposition-status-draft-demo-consensus-window'),
    ).toHaveTextContent('Draft')
    expect(
      screen.getByTestId('sample-progress-draft-demo-consensus-window'),
    ).toHaveTextContent('0 / 6')
    expect(screen.getByText('Budget ledger')).toBeInTheDocument()
    expect(
      screen.getByTestId('submission-budget-summary-draft-demo-consensus-window'),
    ).toHaveTextContent('Remaining')
    expect(
      screen.getByTestId('submission-budget-ledger-draft-demo-consensus-window'),
    ).toHaveTextContent('No requester-visible budget entries yet')
  })

  it('creates requester export snapshots from the submissions flow', async () => {
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

  it('opens a requester export artifact from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('create-requester-export'))

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-export-item')).toHaveLength(1)
    })

    await user.click(screen.getByTestId('requester-export-open'))

    expect(await screen.findByTestId('requester-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-export-detail-file-name')).toHaveTextContent(
      'arena-requester-demo-user-',
    )
    expect(screen.getByTestId('requester-export-detail-settled-count')).toHaveTextContent('1')
    expect(screen.getByTestId('requester-export-detail-open-count')).toHaveTextContent('3')
    expect(screen.getByTestId('requester-export-detail-report-count')).toHaveTextContent('1')
    expect(screen.getByTestId('requester-export-detail-window-days')).toHaveTextContent('30')
    expect(screen.getByTestId('requester-export-detail-created-count')).toHaveTextContent('4')
    expect(screen.getByTestId('requester-export-detail-market-enabled-count')).toHaveTextContent('4')
    expect(screen.getByTestId('requester-export-detail-top-category')).toHaveTextContent('AI')
    expect(screen.getByTestId('requester-export-detail-latest-export-count')).toHaveTextContent('1')
  })

  it('shows settled requester reports captured inside an export artifact', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('create-requester-export'))
    await waitFor(() => {
      expect(screen.getAllByTestId('requester-export-item')).toHaveLength(1)
    })

    await user.click(screen.getByTestId('requester-export-open'))

    expect(await screen.findByTestId('requester-export-report-item')).toBeInTheDocument()
    expect(screen.getByTestId('requester-export-report-title')).toHaveTextContent(
      'What is the recent public service satisfaction trend?',
    )
    expect(screen.getByTestId('requester-export-report-winning-option')).toHaveTextContent(
      'Will continue improving',
    )
  })

  it('creates a preset-backed requester export from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    expect(await screen.findByTestId('requester-export-preset-select')).toBeInTheDocument()
    expect(screen.getByTestId('requester-export-preset-select')).toHaveTextContent(
      'Settled only',
    )

    await user.selectOptions(screen.getByTestId('requester-export-preset-select'), 'preset-demo-settled')
    await user.click(screen.getByTestId('create-requester-export'))

    expect(await screen.findByTestId('requester-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-export-detail-report-count')).toHaveTextContent('1')
    expect(screen.getByText('Settled only preset scoped to settled.')).toBeInTheDocument()
    expect(screen.getByText('Preset-backed')).toBeInTheDocument()
  })

  it('opens requester comparison set analytics and export artifacts from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    expect(await screen.findByTestId('requester-comparison-set-section')).toBeInTheDocument()
    expect(await screen.findByTestId('requester-comparison-set-item')).toHaveTextContent(
      'Core requester mix',
    )

    await user.click(screen.getByTestId('requester-comparison-set-open'))

    expect(await screen.findByTestId('requester-comparison-set-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-set-total-count')).toHaveTextContent('2')
    expect(screen.getByTestId('requester-comparison-set-top-preset')).toHaveTextContent(
      'Settled only',
    )

    await user.click(screen.getByTestId('requester-comparison-set-create-export'))

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-export-preset-count')).toHaveTextContent('2')
    expect(screen.getAllByTestId('requester-comparison-export-row')[0]).toHaveTextContent(
      'Settled only',
    )
    expect(screen.getByTestId('requester-comparison-export-history-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-history-count')).toHaveTextContent('2')
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      'Manual snapshot',
    )
  })

  it('reopens and deletes retained requester comparison exports from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open'))
    await user.click(screen.getByTestId('requester-comparison-set-create-export'))

    expect(await screen.findByTestId('requester-comparison-export-history-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-history-count')).toHaveTextContent('2')

    const manualHistoryRow = screen
      .getAllByTestId('requester-comparison-export-history-item')
      .find((row) => row.textContent?.includes('Manual snapshot'))
    expect(manualHistoryRow).toBeDefined()

    await user.click(
      within(manualHistoryRow as HTMLElement).getByTestId(
        'requester-comparison-export-history-open',
      ),
    )

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      'Manual snapshot',
    )

    await user.click(
      within(manualHistoryRow as HTMLElement).getByTestId(
        'requester-comparison-export-history-delete',
      ),
    )

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-export-history-count')).toHaveTextContent('1')
    })

    expect(screen.queryByTestId('requester-comparison-export-detail-panel')).not.toBeInTheDocument()
  })

  it('scopes requester comparison export history to a delivery policy inside the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open'))
    await user.click(screen.getByTestId('requester-comparison-set-create-export'))
    expect(await screen.findByTestId('requester-comparison-export-history-count')).toHaveTextContent('2')

    await user.click(screen.getByTestId('requester-comparison-set-open-delivery'))
    await user.click(await screen.findByTestId('requester-comparison-delivery-run'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-export-history-count')).toHaveTextContent('3')
    })

    await user.click(screen.getByTestId('requester-comparison-delivery-exports-open'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-export-history-count')).toHaveTextContent('2')
    })

    expect(screen.getByTestId('requester-comparison-export-history-filter-summary')).toHaveTextContent(
      'Daily settled delivery',
    )
    expect(screen.getAllByTestId('requester-comparison-export-history-item')[0]).toHaveTextContent(
      'Daily settled delivery',
    )
  })

  it('shows requester comparison set delivery policies and health inside the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    expect(await screen.findByTestId('requester-comparison-delivery-section')).toBeInTheDocument()
    expect(await screen.findByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
      'Daily settled delivery',
    )
    expect(screen.getByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
      'Enabled',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-health-open'))

    expect(
      await screen.findByTestId('requester-comparison-delivery-health-panel'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-status')).toHaveTextContent(
      'Scheduled',
    )
    expect(
      screen.getByTestId('requester-comparison-delivery-health-transport'),
    ).toHaveTextContent('Ready')
    expect(
      screen.getByTestId('requester-comparison-delivery-health-credential-count'),
    ).toHaveTextContent('1')
    expect(
      screen.getByTestId('requester-comparison-delivery-health-credential-options'),
    ).toHaveTextContent('ARENA_REQUESTER_WEBHOOK_BEARER')
  })

  it('shows saved requester delivery bindings in the form and supports clearing or reapplying them', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))

    expect(
      await screen.findByTestId('requester-comparison-delivery-credential-status'),
    ).toHaveTextContent('Ready binding')
    expect(
      screen.getByTestId('requester-comparison-delivery-credential-detail'),
    ).toHaveTextContent('ARENA_REQUESTER_WEBHOOK_BEARER')
    expect(
      screen.getByTestId('requester-comparison-delivery-available-credentials'),
    ).toHaveTextContent('ARENA_REQUESTER_WEBHOOK_BEARER')
    expect(
      screen.getByTestId('requester-comparison-delivery-credential-binding-select'),
    ).toHaveValue('ARENA_REQUESTER_WEBHOOK_BEARER')

    await user.click(screen.getByTestId('requester-comparison-delivery-clear-credential'))

    expect(screen.getByLabelText('Credential key')).toHaveValue('')
    expect(
      screen.getByTestId('requester-comparison-delivery-credential-status'),
    ).toHaveTextContent('No credential')

    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-credential-binding-select'),
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )

    expect(screen.getByLabelText('Credential key')).toHaveValue(
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(
      screen.getByTestId('requester-comparison-delivery-credential-status'),
    ).toHaveTextContent('Ready binding')
  })

  it('surfaces row-side retained-export evidence before a health panel is opened', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    const dailyRow = await waitFor(() => {
      const row = screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((entry) => within(entry).queryByText('Daily settled delivery'))
      expect(row).toBeDefined()
      expect(
        within(row as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-latest-run-detail',
        ),
      ).toHaveTextContent('Retained export comparison-export-demo-core')
      return row as HTMLElement
    })

    expect(
      within(dailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('This row currently references retained export comparison-export-demo-core')
    expect(
      within(dailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('Snapshot checked')
    expect(
      within(dailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('Open this policy health panel')
  })

  it('opens the latest retained comparison export from the delivery health panel', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-health-open'))

    expect(
      await screen.findByTestId('requester-comparison-delivery-health-panel'),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId('requester-comparison-delivery-health-open-export'))

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      'Policy manual run',
    )
  })

  it('makes retained export agreement between the focused summary and health panel explicit', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-health-open'))

    expect(
      await screen.findByTestId('requester-comparison-delivery-health-panel'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      'Focused summary matches this retained export: comparison-export-demo-core',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-health-detail')).toHaveTextContent(
      'Snapshot checked',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-transport-detail')).toHaveTextContent(
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      'Health snapshot checked',
    )
  })

  it('surfaces retained export mismatch when the focused summary refreshes ahead of the open health panel', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-health-open'))

    expect(
      await screen.findByTestId('requester-comparison-delivery-health-panel'),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId('requester-comparison-delivery-run'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-run-panel')).toBeInTheDocument()
      expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
        'Retained export',
      )
      expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).not.toHaveTextContent(
        'Focused summary matches this retained export: comparison-export-demo-core',
      )
    })

    const latestRunText =
      screen.getByTestId('requester-comparison-delivery-focus-latest-run').textContent ?? ''
    const latestExportId = latestRunText.match(/Retained export (\S+)/)?.[1]

    expect(latestExportId).toBeTruthy()
    expect(latestExportId).not.toBe('comparison-export-demo-core')
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      `Focused summary references retained export ${latestExportId}, while this health panel references comparison-export-demo-core`,
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      'health snapshot',
    )
  })

  it('shows when a delivery-policy row has refreshed ahead of the open health panel retained-export snapshot', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    const findPolicyRow = (policyName: string) =>
      screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((row) => within(row).queryByText(policyName))

    const dailyRow = await waitFor(() => {
      const row = findPolicyRow('Daily settled delivery')
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    await user.click(within(dailyRow).getByTestId('requester-comparison-delivery-health-open'))

    expect(
      await screen.findByTestId('requester-comparison-delivery-health-panel'),
    ).toBeInTheDocument()
    expect(
      within(dailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent(
      'This row matches the open health panel retained export: comparison-export-demo-core',
    )
    expect(
      within(dailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('Health snapshot checked')

    await user.click(within(dailyRow).getByTestId('requester-comparison-delivery-run'))

    const refreshedDailyRow = await waitFor(() => {
      const row = findPolicyRow('Daily settled delivery')
      expect(row).toBeDefined()
      expect(
        within(row as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-latest-run-detail',
        ),
      ).toHaveTextContent('Retained export')
      expect(
        within(row as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-export-agreement',
        ),
      ).not.toHaveTextContent(
        'This row matches the open health panel retained export: comparison-export-demo-core',
      )
      return row as HTMLElement
    })

    const latestRunText =
      within(refreshedDailyRow).getByTestId('requester-comparison-delivery-policy-latest-run-detail')
        .textContent ?? ''
    const latestExportId = latestRunText.match(/Retained export (\S+)/)?.[1]

    expect(latestExportId).toBeTruthy()
    expect(latestExportId).not.toBe('comparison-export-demo-core')
    expect(
      within(refreshedDailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent(
      `This row references retained export ${latestExportId}, while the open health panel references comparison-export-demo-core`,
    )
    expect(
      within(refreshedDailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('open health snapshot')
  })

  it('keeps snapshot timing visible when a preserved empty health panel lags behind refreshed retained-export evidence', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-form')).toBeInTheDocument()

    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-name-input'),
      'Fresh export after empty snapshot',
    )
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    const findPolicyRow = (policyName: string) =>
      screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((row) => within(row).queryByText(policyName))

    const createdRow = await waitFor(() => {
      const row = findPolicyRow('Fresh export after empty snapshot')
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    expect(
      within(createdRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('This row has no retained export evidence yet')
    expect(
      within(createdRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('Snapshot checked')
    expect(
      within(createdRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('Open this policy health panel to compare retained-export evidence.')

    await user.click(within(createdRow).getByTestId('requester-comparison-delivery-health-open'))

    expect(
      await screen.findByTestId('requester-comparison-delivery-health-panel'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      'Focused summary and health panel both have no retained export evidence yet',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      'Health snapshot checked',
    )

    await user.click(within(createdRow).getByTestId('requester-comparison-delivery-run'))

    const refreshedRow = await waitFor(() => {
      const row = findPolicyRow('Fresh export after empty snapshot')
      expect(row).toBeDefined()
      expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
        'Retained export',
      )
      expect(
        within(row as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-latest-run-detail',
        ),
      ).toHaveTextContent('Retained export')
      return row as HTMLElement
    })

    const latestRunText =
      screen.getByTestId('requester-comparison-delivery-focus-latest-run').textContent ?? ''
    const latestExportId = latestRunText.match(/Retained export (\S+)/)?.[1]

    expect(latestExportId).toBeTruthy()
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      `Focused summary still references retained export ${latestExportId}, but this health panel has no retained export evidence`,
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      'health snapshot',
    )
    expect(
      within(refreshedRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent(
      `This row still references retained export ${latestExportId}, but the open health panel has no retained export evidence`,
    )
    expect(
      within(refreshedRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('open health snapshot')
  })

  it('runs and pauses or resumes requester comparison set delivery policies from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-health-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-health-panel')).toBeInTheDocument()

    expect(await screen.findByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
      'Enabled',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-run'))

    expect(await screen.findByTestId('requester-comparison-delivery-run-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-run-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-status')).toHaveTextContent(
      'Completed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-provenance')).toHaveTextContent(
      'Retained export',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-panel')).toHaveTextContent(
      'HTTP 202',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-panel')).toHaveTextContent(
      'Bearer credential ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      'Manual run completed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-open-export')).toBeEnabled()
    expect(screen.getByTestId('requester-comparison-delivery-focus-open-export')).toBeEnabled()

    await user.click(screen.getByTestId('requester-comparison-delivery-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
        'Paused',
      )
    })

    await user.click(screen.getByTestId('requester-comparison-delivery-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
        'Enabled',
      )
    })
  })

  it('shows requester comparison set delivery run history inside the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-runs-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      'Failed',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      'transport credential missing',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      'Retained export',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[1]).toHaveTextContent(
      'Manual delivery',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[1]).toHaveTextContent(
      'HTTP 202',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[1]).toHaveTextContent(
      'No downstream authentication',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[1]).toHaveTextContent(
      'Retained export comparison-export-demo-core',
    )
  })

  it('refreshes an open requester comparison set delivery run history after a successful manual run', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-runs-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-run-history-summary')).toHaveTextContent(
      'All retained delivery runs · 2 stored runs',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      'Failed',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-run'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-run-history-summary')).toHaveTextContent(
        'All retained delivery runs · 3 stored runs',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(3)
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        'Completed',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        'Manual delivery',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        'HTTP 202',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        'Retained export',
      )
    })
  })

  it('clears a pruned retained comparison export detail after a tighter delivery retention run', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    expect(await screen.findByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
      'Daily settled delivery',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-edit-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-form')).toBeInTheDocument()
    await user.clear(screen.getByTestId('requester-comparison-delivery-retained-count-input'))
    await user.type(screen.getByTestId('requester-comparison-delivery-retained-count-input'), '1')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
        'Retain 1',
      )
    })

    await user.click(screen.getByTestId('requester-comparison-delivery-policy-open-export'))

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      'Policy manual run',
    )

    const previousExportFileName =
      screen.getByTestId('requester-comparison-export-file-name').textContent ?? ''

    await user.click(screen.getByTestId('requester-comparison-delivery-run'))

    await waitFor(() => {
      expect(screen.queryByTestId('requester-comparison-export-detail-panel')).not.toBeInTheDocument()
    })

    await user.click(screen.getByTestId('requester-comparison-delivery-exports-open'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-export-history-count')).toHaveTextContent('1')
      expect(screen.getAllByTestId('requester-comparison-export-history-item')).toHaveLength(1)
    })

    expect(screen.getByTestId('requester-comparison-export-history-filter-summary')).toHaveTextContent(
      'Daily settled delivery',
    )
    expect(screen.getAllByTestId('requester-comparison-export-history-item')[0]).toHaveTextContent(
      'Daily settled delivery',
    )
    expect(screen.getAllByTestId('requester-comparison-export-history-item')[0]).not.toHaveTextContent(
      previousExportFileName,
    )
  })

  it('opens a retained export directly from a completed delivery run history row', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-runs-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()

    const completedRunRow = screen.getAllByTestId('requester-comparison-delivery-run-item')[1]
    await user.click(
      within(completedRunRow).getByTestId('requester-comparison-delivery-run-open-export'),
    )

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      'Policy manual run',
    )
  })

  it('disables pruned retained-export actions in delivery run history after tighter retention', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    expect(await screen.findByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
      'Daily settled delivery',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-edit-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-form')).toBeInTheDocument()
    await user.clear(screen.getByTestId('requester-comparison-delivery-retained-count-input'))
    await user.type(screen.getByTestId('requester-comparison-delivery-retained-count-input'), '1')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
        'Retain 1',
      )
    })

    await user.click(screen.getByTestId('requester-comparison-delivery-run'))
    await user.click(screen.getByTestId('requester-comparison-delivery-runs-open'))

    const runRows = await screen.findAllByTestId('requester-comparison-delivery-run-item')
    const prunedFailedRun = runRows.find((row) => row.textContent?.includes('transport credential missing'))
    expect(prunedFailedRun).toBeDefined()

    expect(
      within(prunedFailedRun as HTMLElement).getByTestId(
        'requester-comparison-delivery-run-open-export',
      ),
    ).toBeDisabled()
    expect(
      within(prunedFailedRun as HTMLElement).getByTestId(
        'requester-comparison-delivery-run-open-export',
      ),
    ).toHaveTextContent('Export pruned')
    expect(
      within(prunedFailedRun as HTMLElement).getByTestId(
        'requester-comparison-delivery-run-retry',
      ),
    ).toBeDisabled()
    expect(prunedFailedRun).toHaveTextContent(
      'Retained export comparison-export-demo-core is no longer available',
    )
  })

  it('refreshes open delivery panels after deleting the retained comparison export from scoped history', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-health-open'))
    await user.click(screen.getByTestId('requester-comparison-delivery-runs-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-health-panel')).toBeInTheDocument()
    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()

    await user.click(screen.getByTestId('requester-comparison-delivery-run-retry'))

    expect(await screen.findByTestId('requester-comparison-delivery-retry-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-open-export')).toBeEnabled()
    expect(screen.getByTestId('requester-comparison-delivery-focus-open-export')).toBeEnabled()
    expect(screen.getByTestId('requester-comparison-delivery-retry-open-export')).toBeEnabled()

    await user.click(screen.getByTestId('requester-comparison-delivery-exports-open'))

    const retainedHistoryRow = await waitFor(() => {
      const row = screen
        .getAllByTestId('requester-comparison-export-history-item')
        .find((entry) => entry.textContent?.includes('Daily settled delivery'))
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    await user.click(
      within(retainedHistoryRow).getByTestId('requester-comparison-export-history-delete'),
    )

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-focus-open-export')).toBeDisabled()
      expect(screen.getByTestId('requester-comparison-delivery-focus-open-export')).toHaveTextContent(
        'Export pruned',
      )
      expect(screen.getByTestId('requester-comparison-delivery-health-open-export')).toBeDisabled()
      expect(screen.getByTestId('requester-comparison-delivery-health-open-export')).toHaveTextContent(
        'Export pruned',
      )
      expect(screen.getByTestId('requester-comparison-delivery-retry-open-export')).toBeDisabled()
      expect(screen.getByTestId('requester-comparison-delivery-retry-open-export')).toHaveTextContent(
        'Export pruned',
      )
    })

    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      'Retained export comparison-export-demo-core was pruned',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      'both reference export comparison-export-demo-core, but it is no longer retained',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-provenance')).toHaveTextContent(
      'Retained export comparison-export-demo-core is no longer available',
    )

    const refreshedRunRows = screen.getAllByTestId('requester-comparison-delivery-run-item')
    expect(refreshedRunRows[0]).toHaveTextContent(
      'Retained export comparison-export-demo-core is no longer available',
    )
    expect(refreshedRunRows[0]).toHaveTextContent(
      'Reused retained export comparison-export-demo-core is no longer available',
    )
    expect(
      within(refreshedRunRows[0]).getByTestId('requester-comparison-delivery-run-open-export'),
    ).toBeDisabled()
  })

  it('filters requester comparison set delivery run history by status, trigger, provenance, and limit', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-runs-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(2)
    expect(screen.getByTestId('requester-comparison-delivery-run-history-summary')).toHaveTextContent(
      'All retained delivery runs · 2 stored runs',
    )

    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-run-status-filter'),
      'completed',
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(1)
    })

    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      'Completed',
    )

    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-run-status-filter'),
      '',
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(2)
    })

    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-run-trigger-filter'),
      'manual',
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(1)
    })

    expect(screen.getByTestId('requester-comparison-delivery-run-history-summary')).toHaveTextContent(
      'Manual only · Showing 1 of 2 stored runs',
    )

    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-run-replay-filter'),
      'replayed_only',
    )

    await waitFor(() => {
      expect(screen.queryAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(0)
    })

    expect(screen.getByTestId('requester-comparison-delivery-run-history-summary')).toHaveTextContent(
      'Manual only · Replay runs only · Showing 0 of 2 stored runs',
    )

    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-run-trigger-filter'),
      '',
    )
    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-run-replay-filter'),
      'all',
    )
    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-run-limit-filter'),
      '1',
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(1)
    })

    expect(screen.getByTestId('requester-comparison-delivery-run-history-summary')).toHaveTextContent(
      'All retained delivery runs · Showing 1 of 2 stored runs',
    )
  })

  it('retries a failed requester comparison set delivery run from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-runs-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()

    await user.click(screen.getByTestId('requester-comparison-delivery-run-retry'))

    expect(await screen.findByTestId('requester-comparison-delivery-retry-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-retry-status')).toHaveTextContent(
      'Completed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-provenance')).toHaveTextContent(
      'Retried failed run delivery-run-demo-failed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'Reused retained export',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'HTTP 202',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'Bearer credential ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        'Retried failed run delivery-run-demo-failed',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        'Reused retained export comparison-export-demo-core',
      )
    })
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      'Retried failed run delivery-run-demo-failed',
    )
    expect(
      screen
        .getAllByTestId('requester-comparison-delivery-policy-item')[0]
        ?.querySelector('[data-testid=\"requester-comparison-delivery-policy-latest-run-detail\"]'),
    ).toHaveTextContent('Retried failed run delivery-run-demo-failed')

    await user.click(screen.getByTestId('requester-comparison-delivery-retry-open-export'))

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      'Policy manual run',
    )
  })

  it('creates a requester comparison set delivery policy from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-form')).toBeInTheDocument()

    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.paste('Weekly unresolved digest')
    await user.clear(screen.getByTestId('requester-comparison-delivery-retained-count-input'))
    await user.paste('3')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-policy-item')).toHaveLength(2)
    })

    expect(screen.getAllByTestId('requester-comparison-delivery-policy-item')[0]).toHaveTextContent(
      'Weekly unresolved digest',
    )
    expect(screen.getByTestId('requester-comparison-delivery-form-retained-count')).toHaveTextContent('3')
  })

  it('updates requester comparison set delivery policy retention from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    expect(await screen.findByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
      'Daily settled delivery',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-edit-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-form')).toBeInTheDocument()

    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.type(screen.getByTestId('requester-comparison-delivery-name-input'), 'Daily delivery (tight retention)')
    await user.clear(screen.getByTestId('requester-comparison-delivery-retained-count-input'))
    await user.type(screen.getByTestId('requester-comparison-delivery-retained-count-input'), '2')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
        'Daily delivery (tight retention)',
      )
    })

    expect(screen.getByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
      'Retain 2',
    )
    expect(screen.getByTestId('requester-comparison-delivery-form-retained-count')).toHaveTextContent('2')
  })

  it('keeps multi-policy delivery focus explicit inside the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    expect(await screen.findByTestId('requester-comparison-delivery-focus-panel')).toHaveTextContent(
      'Daily settled delivery',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-status')).toHaveTextContent(
      'Enabled',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-form')).toBeInTheDocument()

    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-name-input'),
      'Weekly unresolved digest',
    )
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-policy-item')).toHaveLength(2)
    })

    expect(screen.getByTestId('requester-comparison-delivery-focus-panel')).toHaveTextContent(
      'Weekly unresolved digest',
    )
    expect(screen.getByTestId('requester-comparison-delivery-form-scope')).toHaveTextContent(
      'Weekly unresolved digest',
    )

    const weeklyRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Weekly unresolved digest'))
    expect(weeklyRow).toBeDefined()
    expect(
      within(weeklyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-focus-tag',
      ),
    ).toBeInTheDocument()

    const dailyRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Daily settled delivery'))
    expect(dailyRow).toBeDefined()

    await user.click(
      within(dailyRow as HTMLElement).getByTestId('requester-comparison-delivery-health-open'),
    )

    expect(await screen.findByTestId('requester-comparison-delivery-health-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-focus-panel')).toHaveTextContent(
      'Daily settled delivery',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-scope')).toHaveTextContent(
      'Daily settled delivery',
    )

    const refreshedDailyRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Daily settled delivery'))
    expect(refreshedDailyRow).toBeDefined()
    expect(
      within(refreshedDailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-focus-tag',
      ),
    ).toBeInTheDocument()
  })

  it('loads focused delivery summaries and collapses stale policy panels when focus changes', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    expect(await screen.findByTestId('requester-comparison-delivery-focus-health-status')).toHaveTextContent(
      'Scheduled',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-count')).toHaveTextContent(
      '2',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-breakdown')).toHaveTextContent(
      '1 completed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-breakdown')).toHaveTextContent(
      '1 failed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-timing')).toHaveTextContent(
      'Last completed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-timing')).toHaveTextContent(
      'Last failed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      'Manual run completed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      'Retained export comparison-export-demo-core',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))
    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-name-input'),
      'Weekly unresolved digest',
    )
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-policy-item')).toHaveLength(2)
    })

    const dailyRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Daily settled delivery'))
    expect(dailyRow).toBeDefined()

    await user.click(
      within(dailyRow as HTMLElement).getByTestId('requester-comparison-delivery-health-open'),
    )
    expect(await screen.findByTestId('requester-comparison-delivery-health-panel')).toBeInTheDocument()

    const weeklyRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Weekly unresolved digest'))
    expect(weeklyRow).toBeDefined()

    await user.click(
      within(weeklyRow as HTMLElement).getByTestId('requester-comparison-delivery-focus'),
    )

    await waitFor(() => {
      expect(
        screen.queryByTestId('requester-comparison-delivery-health-panel'),
      ).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('requester-comparison-delivery-focus-panel')).toHaveTextContent(
      'Weekly unresolved digest',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-health-status')).toHaveTextContent(
      'Scheduled',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-count')).toHaveTextContent(
      '0',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-breakdown')).toHaveTextContent(
      'No delivery runs yet',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      'Latest run not yet available',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-open-export')).toBeDisabled()
  })

  it('surfaces due scheduler state and overdue timing inside the focused delivery summary', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-edit-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-form')).toBeInTheDocument()

    await user.clear(screen.getByTestId('requester-comparison-delivery-next-run-input'))
    await user.type(screen.getByTestId('requester-comparison-delivery-next-run-input'), '2026-05-08T09:20')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-focus-health-status')).toHaveTextContent(
        'Due',
      )
    })

    expect(screen.getByTestId('requester-comparison-delivery-focus-scheduler-detail')).toHaveTextContent(
      'Overdue by',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-scheduler-detail')).toHaveTextContent(
      '490m',
    )

    const dueRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Daily settled delivery'))
    expect(dueRow).toBeDefined()
    expect(
      within(dueRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-health-summary',
      ),
    ).toHaveTextContent('Due')
    expect(
      within(dueRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-scheduler-detail',
      ),
    ).toHaveTextContent('Overdue by')
    expect(
      within(dueRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-scheduler-detail',
      ),
    ).toHaveTextContent('490m')
  })

  it('opens the latest retained export directly from the focused delivery summary', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    await user.click(screen.getByTestId('requester-comparison-delivery-focus-open-export'))

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      'Policy manual run',
    )
  })

  it('opens the latest retained export directly from a delivery policy row', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    const dailyRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Daily settled delivery'))
    expect(dailyRow).toBeDefined()

    await user.click(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-open-export',
      ),
    )

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      'Policy manual run',
    )
  })

  it('shows inline policy run summaries and clears stale policy-scoped exports on focus changes', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    const dailyRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Daily settled delivery'))
    expect(dailyRow).toBeDefined()
    expect(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-run-summary',
      ),
    ).toHaveTextContent('Last run Completed')
    expect(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-latest-run-detail',
      ),
    ).toHaveTextContent('Manual run completed')
    expect(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-latest-run-detail',
      ),
    ).toHaveTextContent('Retained export')

    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))
    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-name-input'),
      'Weekly unresolved digest',
    )
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-policy-item')).toHaveLength(2)
    })

    const weeklyRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Weekly unresolved digest'))
    expect(weeklyRow).toBeDefined()
    expect(
      within(weeklyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-run-summary',
      ),
    ).toHaveTextContent('Not run yet')

    await user.click(
      within(dailyRow as HTMLElement).getByTestId('requester-comparison-delivery-exports-open'),
    )
    expect(await screen.findByTestId('requester-comparison-export-history-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-history-filter-summary')).toHaveTextContent(
      'Daily settled delivery',
    )

    await user.click(
      within(weeklyRow as HTMLElement).getByTestId('requester-comparison-delivery-focus'),
    )

    await waitFor(() => {
      expect(
        screen.queryByTestId('requester-comparison-export-history-panel'),
      ).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('requester-comparison-delivery-focus-panel')).toHaveTextContent(
      'Weekly unresolved digest',
    )
  })

  it('shows policy-level health triage summaries inline in the delivery list', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    const findPolicyRow = (policyName: string) =>
      screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((row) => within(row).queryByText(policyName))

    await waitFor(() => {
      const dailyRow = findPolicyRow('Daily settled delivery')
      expect(dailyRow).toBeDefined()
      expect(
        within(dailyRow as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-health-summary',
        ),
      ).toHaveTextContent('Scheduled')
    })

    const dailyRow = findPolicyRow('Daily settled delivery')
    expect(dailyRow).toBeDefined()
    expect(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-health-detail',
      ),
    ).toHaveTextContent('2 runs')
    expect(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-health-detail',
      ),
    ).toHaveTextContent('Transport ready')

    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))
    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-name-input'),
      'Weekly unresolved digest',
    )
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await waitFor(() => {
      const weeklyRow = findPolicyRow('Weekly unresolved digest')
      expect(weeklyRow).toBeDefined()
      expect(
        within(weeklyRow as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-health-summary',
        ),
      ).toHaveTextContent('Scheduled')
    })

    const weeklyRow = findPolicyRow('Weekly unresolved digest')
    expect(weeklyRow).toBeDefined()
    expect(
      within(weeklyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-health-detail',
      ),
    ).toHaveTextContent('No delivery runs yet')

    await user.click(
      within(dailyRow as HTMLElement).getByTestId('requester-comparison-delivery-toggle'),
    )

    await waitFor(() => {
      const refreshedDailyRow = findPolicyRow('Daily settled delivery')
      expect(refreshedDailyRow).toBeDefined()
      expect(
        within(refreshedDailyRow as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-health-summary',
        ),
      ).toHaveTextContent('Disabled')
    })
  }, 15000)

  it('surfaces failing and transport-blocked delivery health semantics inline', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))
    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-name-input'),
      'Blocked delivery policy',
    )
    await user.clear(screen.getByTestId('requester-comparison-delivery-target-url-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-target-url-input'),
      'https://ops.arena.test/blocked-delivery',
    )
    await user.clear(screen.getByLabelText('Credential key'))
    await user.type(screen.getByLabelText('Credential key'), 'missing_key')
    await user.clear(screen.getByTestId('requester-comparison-delivery-retained-count-input'))
    await user.type(screen.getByTestId('requester-comparison-delivery-retained-count-input'), '2')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    const blockedRow = await waitFor(() => {
      const row = screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((entry) => within(entry).queryByText('Blocked delivery policy'))
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    expect(
      within(blockedRow).getByTestId('requester-comparison-delivery-policy-health-summary'),
    ).toHaveTextContent('Scheduled')
    expect(
      within(blockedRow).getByTestId('requester-comparison-delivery-policy-health-detail'),
    ).toHaveTextContent('No delivery runs yet')
    expect(
      within(blockedRow).getByTestId('requester-comparison-delivery-policy-health-detail'),
    ).toHaveTextContent('Transport blocked')

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-run'))
    expect(await screen.findByText('Requester flow error')).toBeInTheDocument()

    const refreshedBlockedRow = await waitFor(() => {
      const row = screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((entry) => within(entry).queryByText('Blocked delivery policy'))
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    expect(
      within(refreshedBlockedRow).getByTestId(
        'requester-comparison-delivery-policy-health-summary',
      ),
    ).toHaveTextContent('Failing')
    expect(
      within(refreshedBlockedRow).getByTestId(
        'requester-comparison-delivery-policy-run-summary',
      ),
    ).toHaveTextContent('Last run Failed')
    expect(
      within(refreshedBlockedRow).getByTestId(
        'requester-comparison-delivery-policy-failure-streak',
      ),
    ).toHaveTextContent('1 consecutive failure')
    expect(
      within(refreshedBlockedRow).getByTestId(
        'requester-comparison-delivery-policy-last-error',
      ),
    ).toHaveTextContent('Latest failure: Requester comparison set delivery credential is not configured')
    expect(screen.getByTestId('requester-comparison-delivery-focus-failure-streak')).toHaveTextContent(
      '1 consecutive failure',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-health-detail')).toHaveTextContent(
      'Transport blocked',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-health-detail')).toHaveTextContent(
      'Missing credential binding',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-last-error')).toHaveTextContent(
      'Latest failure: Requester comparison set delivery credential is not configured',
    )

    await user.click(within(refreshedBlockedRow).getByTestId('requester-comparison-delivery-health-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-health-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-transport')).toHaveTextContent(
      'Blocked',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-transport-detail')).toHaveTextContent(
      'Missing credential binding',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-credential-options')).toHaveTextContent(
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-failure-streak')).toHaveTextContent(
      '1 consecutive failure',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-last-error')).toHaveTextContent(
      'Requester comparison set delivery credential is not configured',
    )
  }, 15000)

  it('retries a transport-blocked delivery run after fixing the policy credential', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))
    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-name-input'),
      'Recoverable blocked delivery policy',
    )
    await user.clear(screen.getByTestId('requester-comparison-delivery-target-url-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-target-url-input'),
      'https://ops.arena.test/recoverable-blocked-delivery',
    )
    await user.clear(screen.getByLabelText('Credential key'))
    await user.type(screen.getByLabelText('Credential key'), 'missing_key')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    const blockedRow = await waitFor(() => {
      const row = screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((entry) => within(entry).queryByText('Recoverable blocked delivery policy'))
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-run'))
    expect(await screen.findByText('Requester flow error')).toBeInTheDocument()

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-runs-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-run-item')).toHaveTextContent(
      'Requester comparison set delivery credential is not configured',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-item')).toHaveTextContent(
      'Retained export',
    )
    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-health-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-health-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-transport')).toHaveTextContent(
      'Blocked',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-credential-options')).toHaveTextContent(
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-edit-open'))
    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-credential-binding-select'),
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByLabelText('Credential key')).toHaveValue('ARENA_REQUESTER_WEBHOOK_BEARER')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await user.click(screen.getByTestId('requester-comparison-delivery-run-retry'))

    expect(await screen.findByTestId('requester-comparison-delivery-retry-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-retry-status')).toHaveTextContent(
      'Completed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-provenance')).toHaveTextContent(
      'Retried failed run',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'Reused retained export',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'HTTP 202',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'Bearer credential ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      'Retried failed run',
    )
    expect(within(blockedRow).getByTestId('requester-comparison-delivery-policy-latest-run-detail')).toHaveTextContent(
      'Retried failed run',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-transport')).toHaveTextContent(
      'Ready',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-open-export')).toBeEnabled()
    expect(screen.getByTestId('requester-comparison-delivery-focus-open-export')).toBeEnabled()
  }, 15000)

  it('keeps retry provenance visible when a preserved-export replay fails again', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))

    await user.click(screen.getByTestId('requester-comparison-delivery-create-open'))
    await user.clear(screen.getByTestId('requester-comparison-delivery-name-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-name-input'),
      'Retry fails again policy',
    )
    await user.clear(screen.getByTestId('requester-comparison-delivery-target-url-input'))
    await user.type(
      screen.getByTestId('requester-comparison-delivery-target-url-input'),
      'https://ops.arena.test/retry-fails-again',
    )
    await user.clear(screen.getByLabelText('Credential key'))
    await user.type(screen.getByLabelText('Credential key'), 'missing_key')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    const blockedRow = await waitFor(() => {
      const row = screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((entry) => within(entry).queryByText('Retry fails again policy'))
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-run'))
    expect(await screen.findByText('Requester flow error')).toBeInTheDocument()

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-runs-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()

    await user.click(screen.getByTestId('requester-comparison-delivery-run-retry'))

    expect(await screen.findByText('Requester flow error')).toBeInTheDocument()
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      'Retried failed run',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      'Requester comparison set delivery credential is not configured',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      'Retried failed run',
    )
    expect(within(blockedRow).getByTestId('requester-comparison-delivery-policy-latest-run-detail')).toHaveTextContent(
      'Retried failed run',
    )
  }, 15000)

  it('deletes a requester comparison set delivery policy from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    expect(await screen.findByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
      'Daily settled delivery',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-delete'))

    await waitFor(() => {
      expect(
        screen.queryByTestId('requester-comparison-delivery-policy-item'),
      ).not.toBeInTheDocument()
    })

    expect(await screen.findByTestId('requester-comparison-delivery-empty-state')).toBeInTheDocument()
  })

  it('opens a settled requester report from the recent owner overview flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    expect(await screen.findByTestId('submission-recent-section')).toBeInTheDocument()

    await user.click(await screen.findByTestId('recent-settled-report-open'))

    expect(await screen.findByTestId('requester-settled-report-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-settled-report-title')).toHaveTextContent(
      'What is the recent public service satisfaction trend?',
    )
    expect(screen.getByTestId('requester-settled-report-result-kind')).toHaveTextContent('Resolved')
    expect(screen.getByTestId('requester-settled-report-winning-option')).toHaveTextContent(
      'Will continue improving',
    )
    expect(screen.getByTestId('requester-settled-report-sample')).toHaveTextContent('12')
    expect(screen.getByText('Budget ledger')).toBeInTheDocument()
    expect(screen.getByTestId('requester-settled-report-budget-summary')).toHaveTextContent(
      'Remaining',
    )
    expect(screen.getByTestId('requester-settled-report-budget-ledger')).toHaveTextContent(
      'Spent',
    )
  })
})
