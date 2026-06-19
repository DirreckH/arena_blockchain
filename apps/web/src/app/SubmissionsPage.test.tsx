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

    expect(await screen.findByText('已提交命题加载错误')).toBeInTheDocument()
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

  it('renders readable sample-constraint labels and an explicit empty state for submissions', async () => {
    demoBackend.updateDraft('draft-demo-consensus-window', {
      sampleConstraints: ['experienced_user', 'interested_in_ai'],
    })

    renderApp(['/zh/submissions'])

    const populatedCard = await screen.findByTestId('submission-card-draft-demo-consensus-window')
    expect(within(populatedCard).getByText('资深答题人')).toBeInTheDocument()
    expect(within(populatedCard).getByText('AI 兴趣')).toBeInTheDocument()
    expect(within(populatedCard).queryByText('experienced_user')).not.toBeInTheDocument()

    demoBackend.updateDraft('draft-demo-consensus-window', {
      sampleConstraints: [],
    })

    renderApp(['/zh/submissions'])

    expect(
      await screen.findByTestId('submission-sample-constraints-empty-draft-demo-consensus-window'),
    ).toHaveTextContent('暂无样本约束')
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
    ).toHaveTextContent('已提交')
    expect(
      screen.getByTestId('proposition-status-draft-demo-consensus-window'),
    ).toHaveTextContent('草稿')
    expect(
      screen.getByTestId('sample-progress-draft-demo-consensus-window'),
    ).toHaveTextContent('0 / 6')
    expect(screen.getByText('预算台账')).toBeInTheDocument()
    expect(
      screen.getByTestId('submission-budget-summary-draft-demo-consensus-window'),
    ).toHaveTextContent('剩余')
    expect(
      screen.getByTestId('submission-budget-ledger-draft-demo-consensus-window'),
    ).toHaveTextContent('暂未生成可展示给发起方的预算记录。')
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
    expect(screen.getByText('Settled only 预设，范围：settled。')).toBeInTheDocument()
    expect(screen.getByText('预设生成')).toBeInTheDocument()
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
      '手动快照',
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
      .find((row) => row.textContent?.includes('手动快照'))
    expect(manualHistoryRow).toBeDefined()

    await user.click(
      within(manualHistoryRow as HTMLElement).getByTestId(
        'requester-comparison-export-history-open',
      ),
    )

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      '手动快照',
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
      '已启用',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-health-open'))

    expect(
      await screen.findByTestId('requester-comparison-delivery-health-panel'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-status')).toHaveTextContent(
      '已排期',
    )
    expect(
      screen.getByTestId('requester-comparison-delivery-health-transport'),
    ).toHaveTextContent('就绪')
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
    ).toHaveTextContent('绑定正常')
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

    expect(screen.getByLabelText('凭据 Key')).toHaveValue('')
    expect(
      screen.getByTestId('requester-comparison-delivery-credential-status'),
    ).toHaveTextContent('无凭据')

    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-credential-binding-select'),
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )

    expect(screen.getByLabelText('凭据 Key')).toHaveValue(
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(
      screen.getByTestId('requester-comparison-delivery-credential-status'),
    ).toHaveTextContent('绑定正常')
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
      ).toHaveTextContent('保留导出 comparison-export-demo-core')
      return row as HTMLElement
    })

    expect(
      within(dailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('当前这一行引用的是保留导出 comparison-export-demo-core')
    expect(
      within(dailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('快照检查于')
    expect(
      within(dailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('打开该策略的健康面板')
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
      '策略手动执行',
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
      '聚焦摘要与当前保留导出一致：comparison-export-demo-core',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-health-detail')).toHaveTextContent(
      '快照检查于',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-transport-detail')).toHaveTextContent(
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      '健康快照检查于',
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
        '保留导出',
      )
      expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).not.toHaveTextContent(
        '聚焦摘要与当前保留导出一致：comparison-export-demo-core',
      )
    })

    const latestRunText =
      screen.getByTestId('requester-comparison-delivery-focus-latest-run').textContent ?? ''
    const latestExportId = latestRunText.match(/保留导出 (\S+)/)?.[1]

    expect(latestExportId).toBeTruthy()
    expect(latestExportId).not.toBe('comparison-export-demo-core')
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      `聚焦摘要引用的是保留导出 ${latestExportId}，而当前健康面板引用的是 comparison-export-demo-core`,
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      '健康快照',
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
      '当前这一行与已打开健康面板的保留导出一致：comparison-export-demo-core',
    )
    expect(
      within(dailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('健康快照检查于')

    await user.click(within(dailyRow).getByTestId('requester-comparison-delivery-run'))

    const refreshedDailyRow = await waitFor(() => {
      const row = findPolicyRow('Daily settled delivery')
      expect(row).toBeDefined()
      expect(
        within(row as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-latest-run-detail',
        ),
      ).toHaveTextContent('保留导出')
      expect(
        within(row as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-export-agreement',
        ),
      ).not.toHaveTextContent(
        '当前这一行与已打开健康面板的保留导出一致：comparison-export-demo-core',
      )
      return row as HTMLElement
    })

    const latestRunText =
      within(refreshedDailyRow).getByTestId('requester-comparison-delivery-policy-latest-run-detail')
        .textContent ?? ''
    const latestExportId = latestRunText.match(/保留导出 (\S+)/)?.[1]

    expect(latestExportId).toBeTruthy()
    expect(latestExportId).not.toBe('comparison-export-demo-core')
    expect(
      within(refreshedDailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent(
      `当前这一行引用的是保留导出 ${latestExportId}，而已打开的健康面板引用的是 comparison-export-demo-core`,
    )
    expect(
      within(refreshedDailyRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('健康快照')
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
    ).toHaveTextContent('当前这一行暂无保留导出记录')
    expect(
      within(createdRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('快照检查于')
    expect(
      within(createdRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('打开该策略的健康面板可对比保留导出记录。')

    await user.click(within(createdRow).getByTestId('requester-comparison-delivery-health-open'))

    expect(
      await screen.findByTestId('requester-comparison-delivery-health-panel'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      '聚焦摘要与健康面板当前都暂无保留导出记录',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      '健康快照检查于',
    )

    await user.click(within(createdRow).getByTestId('requester-comparison-delivery-run'))

    const refreshedRow = await waitFor(() => {
      const row = findPolicyRow('Fresh export after empty snapshot')
      expect(row).toBeDefined()
      expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
        '保留导出',
      )
      expect(
        within(row as HTMLElement).getByTestId(
          'requester-comparison-delivery-policy-latest-run-detail',
        ),
      ).toHaveTextContent('保留导出')
      return row as HTMLElement
    })

    const latestRunText =
      screen.getByTestId('requester-comparison-delivery-focus-latest-run').textContent ?? ''
    const latestExportId = latestRunText.match(/保留导出 (\S+)/)?.[1]

    expect(latestExportId).toBeTruthy()
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      `聚焦摘要仍引用保留导出 ${latestExportId}，但当前健康面板暂无保留导出记录`,
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      '健康快照',
    )
    expect(
      within(refreshedRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent(
      `当前这一行仍引用保留导出 ${latestExportId}，但已打开的健康面板暂无保留导出记录`,
    )
    expect(
      within(refreshedRow).getByTestId('requester-comparison-delivery-policy-export-agreement'),
    ).toHaveTextContent('健康快照')
  })

  it('runs and pauses or resumes requester comparison set delivery policies from the submissions flow', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-health-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-health-panel')).toBeInTheDocument()

    expect(await screen.findByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
      '已启用',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-run'))

    expect(await screen.findByTestId('requester-comparison-delivery-run-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-run-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-status')).toHaveTextContent(
      '已完成',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-provenance')).toHaveTextContent(
      '保留导出',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-panel')).toHaveTextContent(
      'HTTP 202',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-panel')).toHaveTextContent(
      'Bearer 凭据 ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      '手动运行 · 已完成',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-open-export')).toBeEnabled()
    expect(screen.getByTestId('requester-comparison-delivery-focus-open-export')).toBeEnabled()

    await user.click(screen.getByTestId('requester-comparison-delivery-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
        '已暂停',
      )
    })

    await user.click(screen.getByTestId('requester-comparison-delivery-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-policy-item')).toHaveTextContent(
        '已启用',
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
      '已失败',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      'transport credential missing',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      '保留导出',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[1]).toHaveTextContent(
      '手动投递',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[1]).toHaveTextContent(
      'HTTP 202',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[1]).toHaveTextContent(
      '暂无下游鉴权',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[1]).toHaveTextContent(
      '保留导出 comparison-export-demo-core',
    )
  })

  it('refreshes an open requester comparison set delivery run history after a successful manual run', async () => {
    const user = userEvent.setup()
    renderApp(['/zh/submissions'])

    await user.click(await screen.findByTestId('requester-comparison-set-open-delivery'))
    await user.click(screen.getByTestId('requester-comparison-delivery-runs-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-run-history-summary')).toHaveTextContent(
      '全部保留投递记录 · 共 2 条已保存记录',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      '已失败',
    )

    await user.click(screen.getByTestId('requester-comparison-delivery-run'))

    await waitFor(() => {
      expect(screen.getByTestId('requester-comparison-delivery-run-history-summary')).toHaveTextContent(
        '全部保留投递记录 · 共 3 条已保存记录',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(3)
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        '已完成',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        '手动投递',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        'HTTP 202',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        '保留导出',
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
        '保留 1',
      )
    })

    await user.click(screen.getByTestId('requester-comparison-delivery-policy-open-export'))

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      '策略手动执行',
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
      '策略手动执行',
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
        '保留 1',
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
    ).toHaveTextContent('导出已被清理')
    expect(
      within(prunedFailedRun as HTMLElement).getByTestId(
        'requester-comparison-delivery-run-retry',
      ),
    ).toBeDisabled()
    expect(prunedFailedRun).toHaveTextContent(
      '保留导出 comparison-export-demo-core 已不可用',
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
        '导出已被清理',
      )
      expect(screen.getByTestId('requester-comparison-delivery-health-open-export')).toBeDisabled()
      expect(screen.getByTestId('requester-comparison-delivery-health-open-export')).toHaveTextContent(
        '导出已被清理',
      )
      expect(screen.getByTestId('requester-comparison-delivery-retry-open-export')).toBeDisabled()
      expect(screen.getByTestId('requester-comparison-delivery-retry-open-export')).toHaveTextContent(
        '导出已被清理',
      )
    })

    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      '保留导出 comparison-export-demo-core 已被清理',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-export-agreement')).toHaveTextContent(
      '都引用了导出 comparison-export-demo-core，但该导出已不再保留',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-provenance')).toHaveTextContent(
      '保留导出 comparison-export-demo-core 已不可用',
    )

    const refreshedRunRows = screen.getAllByTestId('requester-comparison-delivery-run-item')
    expect(refreshedRunRows[0]).toHaveTextContent(
      '保留导出 comparison-export-demo-core 已不可用',
    )
    expect(refreshedRunRows[0]).toHaveTextContent(
      '复用的保留导出 comparison-export-demo-core 已不可用',
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
      '全部保留投递记录 · 共 2 条已保存记录',
    )

    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-run-status-filter'),
      'completed',
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(1)
    })

    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      '已完成',
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
      '触发：手动 · 显示 1 / 2 条已保存记录',
    )

    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-run-replay-filter'),
      'replayed_only',
    )

    await waitFor(() => {
      expect(screen.queryAllByTestId('requester-comparison-delivery-run-item')).toHaveLength(0)
    })

    expect(screen.getByTestId('requester-comparison-delivery-run-history-summary')).toHaveTextContent(
      '触发：手动 · 仅重试运行 · 显示 0 / 2 条已保存记录',
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
      '全部保留投递记录 · 显示 1 / 2 条已保存记录',
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
      '已完成',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-provenance')).toHaveTextContent(
      '重试失败运行 delivery-run-demo-failed',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      '复用保留导出',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'HTTP 202',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'Bearer 凭据 ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    await waitFor(() => {
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        '重试失败运行 delivery-run-demo-failed',
      )
      expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
        '复用保留导出 comparison-export-demo-core',
      )
    })
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      '重试失败运行 delivery-run-demo-failed',
    )
    expect(
      screen
        .getAllByTestId('requester-comparison-delivery-policy-item')[0]
        ?.querySelector('[data-testid=\"requester-comparison-delivery-policy-latest-run-detail\"]'),
    ).toHaveTextContent('重试失败运行 delivery-run-demo-failed')

    await user.click(screen.getByTestId('requester-comparison-delivery-retry-open-export'))

    expect(await screen.findByTestId('requester-comparison-export-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-export-origin')).toHaveTextContent(
      '策略手动执行',
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
      '保留 2',
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
      '已启用',
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
      '已排期',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-count')).toHaveTextContent(
      '2',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-breakdown')).toHaveTextContent(
      '1 次已完成',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-breakdown')).toHaveTextContent(
      '1 次失败',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-timing')).toHaveTextContent(
      '最近完成于',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-timing')).toHaveTextContent(
      '最近失败于',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      '手动运行 · 已完成',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      '保留导出 comparison-export-demo-core',
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
      '已排期',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-count')).toHaveTextContent(
      '0',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-run-breakdown')).toHaveTextContent(
      '暂无投递运行',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      '最近运行信息暂未生成',
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
        '待执行',
      )
    })

    expect(screen.getByTestId('requester-comparison-delivery-focus-scheduler-detail')).toHaveTextContent(
      '已逾期',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-scheduler-detail')).toHaveTextContent(
      '490 分',
    )

    const dueRow = screen
      .getAllByTestId('requester-comparison-delivery-policy-item')
      .find((row) => within(row).queryByText('Daily settled delivery'))
    expect(dueRow).toBeDefined()
    expect(
      within(dueRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-health-summary',
      ),
    ).toHaveTextContent('待执行')
    expect(
      within(dueRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-scheduler-detail',
      ),
    ).toHaveTextContent('已逾期')
    expect(
      within(dueRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-scheduler-detail',
      ),
    ).toHaveTextContent('490 分')
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
      '策略手动执行',
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
      '策略手动执行',
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
    ).toHaveTextContent('最近运行：已完成')
    expect(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-latest-run-detail',
      ),
    ).toHaveTextContent('手动运行 · 已完成')
    expect(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-latest-run-detail',
      ),
    ).toHaveTextContent('保留导出')

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
    ).toHaveTextContent('尚未运行')

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
      ).toHaveTextContent('已排期')
    })

    const dailyRow = findPolicyRow('Daily settled delivery')
    expect(dailyRow).toBeDefined()
    expect(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-health-detail',
      ),
    ).toHaveTextContent('2 次运行')
    expect(
      within(dailyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-health-detail',
      ),
    ).toHaveTextContent('传输就绪')

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
      ).toHaveTextContent('已排期')
    })

    const weeklyRow = findPolicyRow('Weekly unresolved digest')
    expect(weeklyRow).toBeDefined()
    expect(
      within(weeklyRow as HTMLElement).getByTestId(
        'requester-comparison-delivery-policy-health-detail',
      ),
    ).toHaveTextContent('暂无投递运行')

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
      ).toHaveTextContent('已停用')
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
    await user.clear(screen.getByLabelText('凭据 Key'))
    await user.type(screen.getByLabelText('凭据 Key'), 'missing_key')
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
    ).toHaveTextContent('已排期')
    expect(
      within(blockedRow).getByTestId('requester-comparison-delivery-policy-health-detail'),
    ).toHaveTextContent('暂无投递运行')
    expect(
      within(blockedRow).getByTestId('requester-comparison-delivery-policy-health-detail'),
    ).toHaveTextContent('传输受阻')

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-run'))
    expect(await screen.findByText('已提交命题加载错误')).toBeInTheDocument()

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
    ).toHaveTextContent('异常中')
    expect(
      within(refreshedBlockedRow).getByTestId(
        'requester-comparison-delivery-policy-run-summary',
      ),
    ).toHaveTextContent('最近运行：已失败')
    expect(
      within(refreshedBlockedRow).getByTestId(
        'requester-comparison-delivery-policy-failure-streak',
      ),
    ).toHaveTextContent('连续 1 次失败')
    expect(
      within(refreshedBlockedRow).getByTestId(
        'requester-comparison-delivery-policy-last-error',
      ),
    ).toHaveTextContent('最近失败：Requester comparison set delivery credential is not configured')
    expect(screen.getByTestId('requester-comparison-delivery-focus-failure-streak')).toHaveTextContent(
      '连续 1 次失败',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-health-detail')).toHaveTextContent(
      '传输受阻',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-health-detail')).toHaveTextContent(
      '缺少凭据绑定',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-last-error')).toHaveTextContent(
      '最近失败：Requester comparison set delivery credential is not configured',
    )

    await user.click(within(refreshedBlockedRow).getByTestId('requester-comparison-delivery-health-open'))

    expect(await screen.findByTestId('requester-comparison-delivery-health-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-transport')).toHaveTextContent(
      '受阻',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-transport-detail')).toHaveTextContent(
      '缺少凭据绑定',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-credential-options')).toHaveTextContent(
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-failure-streak')).toHaveTextContent(
      '连续 1 次失败',
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
    await user.clear(screen.getByLabelText('凭据 Key'))
    await user.type(screen.getByLabelText('凭据 Key'), 'missing_key')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    const blockedRow = await waitFor(() => {
      const row = screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((entry) => within(entry).queryByText('Recoverable blocked delivery policy'))
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-run'))
    expect(await screen.findByText('已提交命题加载错误')).toBeInTheDocument()

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-runs-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-run-item')).toHaveTextContent(
      'Requester comparison set delivery credential is not configured',
    )
    expect(screen.getByTestId('requester-comparison-delivery-run-item')).toHaveTextContent(
      '保留导出',
    )
    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-health-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-health-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-health-transport')).toHaveTextContent(
      '受阻',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-credential-options')).toHaveTextContent(
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-edit-open'))
    await user.selectOptions(
      screen.getByTestId('requester-comparison-delivery-credential-binding-select'),
      'ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByLabelText('凭据 Key')).toHaveValue('ARENA_REQUESTER_WEBHOOK_BEARER')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    await user.click(screen.getByTestId('requester-comparison-delivery-run-retry'))

    expect(await screen.findByTestId('requester-comparison-delivery-retry-panel')).toBeInTheDocument()
    expect(screen.getByTestId('requester-comparison-delivery-retry-status')).toHaveTextContent(
      '已完成',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-file-name')).toHaveTextContent(
      'arena-requester-comparison-demo-user-',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-provenance')).toHaveTextContent(
      '重试失败运行',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      '复用保留导出',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'HTTP 202',
    )
    expect(screen.getByTestId('requester-comparison-delivery-retry-panel')).toHaveTextContent(
      'Bearer 凭据 ARENA_REQUESTER_WEBHOOK_BEARER',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      '重试失败运行',
    )
    expect(within(blockedRow).getByTestId('requester-comparison-delivery-policy-latest-run-detail')).toHaveTextContent(
      '重试失败运行',
    )
    expect(screen.getByTestId('requester-comparison-delivery-health-transport')).toHaveTextContent(
      '就绪',
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
    await user.clear(screen.getByLabelText('凭据 Key'))
    await user.type(screen.getByLabelText('凭据 Key'), 'missing_key')
    await user.click(screen.getByTestId('requester-comparison-delivery-save'))

    const blockedRow = await waitFor(() => {
      const row = screen
        .getAllByTestId('requester-comparison-delivery-policy-item')
        .find((entry) => within(entry).queryByText('Retry fails again policy'))
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-run'))
    expect(await screen.findByText('已提交命题加载错误')).toBeInTheDocument()

    await user.click(within(blockedRow).getByTestId('requester-comparison-delivery-runs-open'))
    expect(await screen.findByTestId('requester-comparison-delivery-runs-panel')).toBeInTheDocument()

    await user.click(screen.getByTestId('requester-comparison-delivery-run-retry'))

    expect(await screen.findByText('已提交命题加载错误')).toBeInTheDocument()
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      '重试失败运行',
    )
    expect(screen.getAllByTestId('requester-comparison-delivery-run-item')[0]).toHaveTextContent(
      'Requester comparison set delivery credential is not configured',
    )
    expect(screen.getByTestId('requester-comparison-delivery-focus-latest-run')).toHaveTextContent(
      '重试失败运行',
    )
    expect(within(blockedRow).getByTestId('requester-comparison-delivery-policy-latest-run-detail')).toHaveTextContent(
      '重试失败运行',
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
    expect(screen.getByTestId('requester-settled-report-result-kind')).toHaveTextContent('已判定')
    expect(screen.getByTestId('requester-settled-report-winning-option')).toHaveTextContent(
      'Will continue improving',
    )
    expect(screen.getByTestId('requester-settled-report-sample')).toHaveTextContent('12')
    expect(screen.getByText('预算台账')).toBeInTheDocument()
    expect(screen.getByTestId('requester-settled-report-budget-summary')).toHaveTextContent(
      '剩余',
    )
    expect(screen.getByTestId('requester-settled-report-budget-ledger')).toHaveTextContent(
      '已支出',
    )
  })
})
