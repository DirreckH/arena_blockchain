import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { arenaApi } from '../../features/api/arena-api'
import {
  useOpsRewardDetail,
  useOpsRewards,
} from '../../features/arena/ops-console-data'
import type {
  InternalListSortDirection,
  OpsRewardSortBy,
  RewardLedgerSourceType,
  RewardLedgerStatus,
} from '../../features/arena/internal-ops.types'
import { fmtBadgeClass, fmtDate } from '../../features/arena/ops-format'
import { opsCopy } from '../../features/arena/ops-copy'
import { statusLabel } from '../../features/arena/ops-status-labels'
import { OpsConfirmDialog } from '../OpsConfirmDialog'
import { type ActionFeedbackOverride, useOpsActionDialog } from './ops-action-dialog'
import type { SearchUpdater } from './ops-shared'
import {
  buildRespondentRoute,
  OpsAuditList,
  OpsEmpty,
  OpsError,
  OpsFeedback,
  OpsLoading,
  OpsNotFoundDetail,
} from './ops-shared-ui'

type SearchNumberReader = (
  search: URLSearchParams,
  key: string,
  fallback: number,
) => number

type OpsRewardsPageProps = {
  token: string
  defaultPageLimit: number
  pageSizeOptions: readonly number[]
  updateSearch: SearchUpdater
  readPositiveSearchNumber: SearchNumberReader
  readNonNegativeSearchNumber: SearchNumberReader
}

export function OpsRewardsPage({
  token,
  defaultPageLimit,
  pageSizeOptions,
  updateSearch,
  readPositiveSearchNumber,
  readNonNegativeSearchNumber,
}: OpsRewardsPageProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const search = new URLSearchParams(location.search)
  const propositionId = search.get('propositionId') || undefined
  const userId = search.get('userId') || undefined
  const responseId = search.get('responseId') || undefined
  const status = (search.get('status') || undefined) as RewardLedgerStatus | undefined
  const sourceType = (search.get('sourceType') || undefined) as RewardLedgerSourceType | undefined
  const ledgerId = search.get('ledgerId')
  const searchTerm = search.get('search') ?? ''
  const sortBy = (search.get('sortBy') || undefined) as OpsRewardSortBy | undefined
  const sortDirection = (search.get('sortDirection') || undefined) as InternalListSortDirection | undefined
  const limit = readPositiveSearchNumber(search, 'limit', defaultPageLimit)
  const offset = readNonNegativeSearchNumber(search, 'offset', 0)

  const list = useOpsRewards(token, {
    propositionId,
    userId,
    responseId,
    status,
    sourceType,
    search: searchTerm || undefined,
    sortBy,
    sortDirection,
    limit,
    offset,
  })
  const detail = useOpsRewardDetail(token, ledgerId)
  const [actions, pendingAction, busy, feedback, setPendingAction, confirmAction] = useOpsActionDialog()
  const detailData = ledgerId && detail.state.status === 'ok' ? detail.state.data : null
  const listPage = list.state.status === 'ok' ? list.state.data : null
  const listItems = listPage?.items ?? []
  const [selectedLedgerIds, setSelectedLedgerIds] = useState<string[]>([])
  const hasPreviousPage = offset > 0
  const hasNextPage = listPage ? offset + listItems.length < listPage.totalCount : false
  const visibleSelectedLedgerIds = listItems
    .filter((item) => selectedLedgerIds.includes(item.ledgerId))
    .map((item) => item.ledgerId)
  const allVisibleSelected = listItems.length > 0 && visibleSelectedLedgerIds.length === listItems.length
  const hasVisibleSelection = visibleSelectedLedgerIds.length > 0

  useEffect(() => {
    setSelectedLedgerIds((current) => {
      const next = current.filter((selectedLedgerId) =>
        listItems.some((item) => item.ledgerId === selectedLedgerId),
      )
      return next.length === current.length ? current : next
    })
  }, [listItems])

  function selectLedger(nextLedgerId: string) {
    updateSearch(navigate, location, { ledgerId: nextLedgerId })
  }

  function toggleLedgerSelection(nextLedgerId: string, checked: boolean) {
    setSelectedLedgerIds((current) => {
      if (checked) {
        return current.includes(nextLedgerId) ? current : [...current, nextLedgerId]
      }
      return current.filter((ledgerIdValue) => ledgerIdValue !== nextLedgerId)
    })
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedLedgerIds(checked ? listItems.map((item) => item.ledgerId) : [])
  }

  async function runRewardBatchRetrigger(
    ledgerIds: string[],
    note: string,
    reason: string,
  ) {
    const completed: string[] = []
    const failed: Array<{ ledgerId: string; message: string }> = []

    for (const ledgerIdValue of ledgerIds) {
      try {
        await arenaApi.retriggerOpsRewardResolution(
          ledgerIdValue,
          {
            resolvedAt: new Date().toISOString(),
            reason,
            note: note || undefined,
          },
          token,
        )
        completed.push(ledgerIdValue)
      } catch (error) {
        failed.push({
          ledgerId: ledgerIdValue,
          message: String((error as Error).message ?? error),
        })
      }
    }

    list.refresh()
    detail.refresh()
    setSelectedLedgerIds((current) => current.filter((ledgerIdValue) => !completed.includes(ledgerIdValue)))

    const receipt = [
      `selectedCount: ${ledgerIds.length}`,
      `processedCount: ${completed.length}`,
      `failedCount: ${failed.length}`,
    ]
    failed.slice(0, 3).forEach((item) => {
      receipt.push(`failed ${item.ledgerId}: ${item.message}`)
    })

    return {
      feedback: {
        tone: failed.length > 0 ? 'error' : 'success',
        message: failed.length > 0
          ? opsCopy.rewards.batchResultFail(failed.length)
          : opsCopy.rewards.batchResultOk(completed.length),
        receipt,
      },
    } satisfies ActionFeedbackOverride
  }

  function retrigger(ledgerIdValue: string) {
    setPendingAction({
      title: opsCopy.rewards.dialogRetriggerTitle,
      description: opsCopy.rewards.ledgerIdLabel(ledgerIdValue),
      withNote: true,
      withReason: true,
      requireReason: true,
      reasonLabel: opsCopy.rewards.retryReasonLabel,
      reasonPlaceholder: 'retrigger_reward_resolution',
      reasonDefaultValue: 'retrigger_reward_resolution',
      successMessage: opsCopy.rewards.retriggerSuccess,
      run: async ({ note, reason }) => {
        const result = await arenaApi.retriggerOpsRewardResolution(
          ledgerIdValue,
          {
            resolvedAt: new Date().toISOString(),
            reason,
            note: note || undefined,
          },
          token,
        )
        list.refresh()
        detail.refresh()
        return result
      },
    })
  }

  function batchRetrigger() {
    if (!hasVisibleSelection) {
      return
    }

    setPendingAction({
      title: opsCopy.rewards.dialogBatchTitle,
      description: opsCopy.rewards.selectedCount(visibleSelectedLedgerIds.length),
      withNote: true,
      withReason: true,
      requireReason: true,
      reasonLabel: opsCopy.rewards.retryReasonLabel,
      reasonPlaceholder: 'retrigger_reward_resolution',
      reasonDefaultValue: 'retrigger_reward_resolution',
      successMessage: opsCopy.rewards.batchSuccess,
      run: ({ note, reason }) => runRewardBatchRetrigger(visibleSelectedLedgerIds, note, reason),
    })
  }

  return (
    <>
      <div className="detail-layout">
        <div className="detail-main-stack">
          <section className="detail-panel">
            <div className="ops-filter-row">
              <label>
                <span>{opsCopy.rewards.filters.proposition}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { propositionId: event.target.value || undefined })}
                  placeholder={opsCopy.rewards.filters.propositionPlaceholder}
                  value={propositionId ?? ''}
                />
              </label>
              <label>
                <span>{opsCopy.rewards.filters.response}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { responseId: event.target.value || undefined })}
                  placeholder={opsCopy.rewards.filters.responsePlaceholder}
                  value={responseId ?? ''}
                />
              </label>
              <label>
                <span>{opsCopy.rewards.filters.user}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { userId: event.target.value || undefined })}
                  placeholder={opsCopy.rewards.filters.userPlaceholder}
                  value={userId ?? ''}
                />
              </label>
              <label>
                <span>{opsCopy.rewards.filters.status}</span>
                <select
                  value={status ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { status: event.target.value || undefined })}
                >
                  <option value="">{opsCopy.filters.all}</option>
                  <option value="pending">{statusLabel('reward', 'pending')}</option>
                  <option value="finalized">{statusLabel('reward', 'finalized')}</option>
                  <option value="voided">{statusLabel('reward', 'voided')}</option>
                  <option value="reversed">{statusLabel('reward', 'reversed')}</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.rewards.filters.source}</span>
                <select
                  value={sourceType ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { sourceType: event.target.value || undefined })}
                >
                  <option value="">{opsCopy.filters.all}</option>
                  <option value="response">{opsCopy.rewards.sourceResponse}</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.rewards.filters.search}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { search: event.target.value || undefined, offset: '0' })}
                  placeholder={opsCopy.rewards.filters.searchPlaceholder}
                  value={searchTerm}
                />
              </label>
              <label>
                <span>{opsCopy.rewards.filters.sort}</span>
                <select
                  value={sortBy ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { sortBy: event.target.value || undefined, offset: '0' })}
                >
                  <option value="">createdAt</option>
                  <option value="finalizedAt">finalizedAt</option>
                  <option value="propositionTitle">propositionTitle</option>
                  <option value="userId">userId</option>
                  <option value="amount">amount</option>
                  <option value="ledgerVersion">ledgerVersion</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.rewards.filters.direction}</span>
                <select
                  value={sortDirection ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { sortDirection: event.target.value || undefined, offset: '0' })}
                >
                  <option value="">desc</option>
                  <option value="desc">desc</option>
                  <option value="asc">asc</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.rewards.filters.pageSize}</span>
                <select
                  value={String(limit)}
                  onChange={(event) => updateSearch(navigate, location, { limit: event.target.value, offset: '0' })}
                >
                  {pageSizeOptions.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section">
              <div className="ops-section-head">
                <p className="ops-section-title">{opsCopy.rewards.queueTitle}</p>
                <button className="ops-refresh-btn" onClick={list.refresh} type="button">{opsCopy.actions.refresh}</button>
              </div>
              <OpsFeedback feedback={feedback} />
              {list.state.status === 'loading' || list.state.status === 'idle' ? <OpsLoading /> : null}
              {list.state.status === 'error' ? <OpsError kind={list.state.kind} message={list.state.message} onRetry={list.refresh} statusCode={list.state.statusCode} /> : null}
              {list.state.status === 'ok' && listItems.length === 0 ? <OpsEmpty message={opsCopy.rewards.empty} /> : null}
              {list.state.status === 'ok' && listItems.length > 0 ? (
                <>
                  <div className="ops-section-head">
                    <p className="ops-muted">
                      {opsCopy.queue.showingRange(offset + 1, offset + listItems.length, listPage?.totalCount ?? listItems.length)}
                    </p>
                    <div className="ops-actions">
                      <label className="ops-inline-toggle">
                        <input
                          aria-label={opsCopy.rewards.selectAllAria}
                          checked={allVisibleSelected}
                          onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                          type="checkbox"
                        />
                        <span>{opsCopy.rewards.selectVisible}</span>
                      </label>
                      <button
                        className="ops-btn ops-btn-ghost"
                        disabled={!hasVisibleSelection}
                        onClick={() => setSelectedLedgerIds([])}
                        type="button"
                      >
                        {opsCopy.actions.clearSelection}
                      </button>
                      <button
                        className="ops-btn ops-btn-primary"
                        disabled={busy || !hasVisibleSelection}
                        onClick={batchRetrigger}
                        type="button"
                      >
                        {opsCopy.rewards.batchRetrigger}
                      </button>
                      <button
                        className="ops-btn ops-btn-ghost"
                        disabled={!hasPreviousPage}
                        onClick={() => updateSearch(navigate, location, { offset: String(Math.max(0, offset - limit)) })}
                        type="button"
                      >
                        {opsCopy.actions.previous}
                      </button>
                      <button
                        className="ops-btn ops-btn-ghost"
                        disabled={!hasNextPage}
                        onClick={() => updateSearch(navigate, location, { offset: String(offset + limit) })}
                        type="button"
                      >
                        {opsCopy.actions.next}
                      </button>
                    </div>
                  </div>
                  <p className="ops-muted">{opsCopy.queue.selectedOnPage(visibleSelectedLedgerIds.length)}</p>
                  <div className="ops-table-scroll">
                    <table className="ops-table">
                      <thead>
                        <tr><th>{opsCopy.rewards.table.select}</th><th>{opsCopy.rewards.table.proposition}</th><th>{opsCopy.rewards.table.response}</th><th>{opsCopy.rewards.table.user}</th><th>{opsCopy.rewards.table.ledgerStatus}</th><th>{opsCopy.rewards.table.review}</th><th>{opsCopy.rewards.table.amount}</th><th>{opsCopy.rewards.table.version}</th><th>{opsCopy.rewards.table.created}</th><th>{opsCopy.rewards.table.finalized}</th></tr>
                      </thead>
                      <tbody>
                        {listItems.map((item) => (
                          <tr
                            className={ledgerId === item.ledgerId ? 'ops-row-selected' : undefined}
                            key={item.ledgerId}
                            onClick={() => selectLedger(item.ledgerId)}
                          >
                            <td onClick={(event) => event.stopPropagation()}>
                              <input
                                aria-label={opsCopy.rewards.selectRewardAria(item.ledgerId)}
                                checked={selectedLedgerIds.includes(item.ledgerId)}
                                onChange={(event) => toggleLedgerSelection(item.ledgerId, event.target.checked)}
                                type="checkbox"
                              />
                            </td>
                            <td>{item.propositionTitle}</td>
                            <td>{item.responseId}</td>
                            <td>
                              <Link to={buildRespondentRoute(item.userId)}>
                                {item.userId}
                              </Link>
                            </td>
                            <td>
                              <span className={`ops-badge ${fmtBadgeClass(item.status)}`}>{statusLabel('reward', item.status)}</span>
                            </td>
                            <td>{item.reviewStatus ? statusLabel('review', item.reviewStatus) : opsCopy.rewards.noReview}</td>
                            <td>{item.finalAmount ?? item.pendingAmount}</td>
                            <td>{item.ledgerVersion}</td>
                            <td>{fmtDate(item.createdAt)}</td>
                            <td>{fmtDate(item.finalizedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="detail-side-panel ops-side-panel">
          <div className="ops-section">
            <p className="ops-section-title">{opsCopy.rewards.detailTitle}</p>
            {!ledgerId ? <OpsEmpty message={opsCopy.rewards.detailEmpty} /> : null}
            {ledgerId && (detail.state.status === 'loading' || detail.state.status === 'idle') ? <OpsLoading /> : null}
            {ledgerId && detail.state.status === 'error'
              ? (detail.state.kind === 'not_found'
                ? <OpsNotFoundDetail message={opsCopy.rewards.notFound} />
                : <OpsError kind={detail.state.kind} message={detail.state.message} onRetry={detail.refresh} statusCode={detail.state.statusCode} />)
              : null}
            {detailData ? (
              <>
                <div className="ops-kv-grid">
                  <span className="ops-kv-label">{opsCopy.rewards.kv.ledger}</span><span>{detailData.ledgerId}</span>
                  <span className="ops-kv-label">{opsCopy.rewards.kv.proposition}</span><span>{detailData.proposition.title}</span>
                  <span className="ops-kv-label">{opsCopy.rewards.kv.response}</span><span>{detailData.response.id}</span>
                  <span className="ops-kv-label">{opsCopy.rewards.kv.user}</span><span><Link to={buildRespondentRoute(detailData.response.userId)}>{detailData.response.userId}</Link></span>
                  <span className="ops-kv-label">{opsCopy.rewards.kv.review}</span><span>{detailData.currentReview?.status ? statusLabel('review', detailData.currentReview.status) : opsCopy.rewards.noReview}</span>
                </div>
                <div className="ops-actions">
                  <button className="ops-btn ops-btn-primary" disabled={busy} onClick={() => retrigger(detailData.ledgerId)} type="button">
                    <span className="ops-cmd-label">{opsCopy.rewards.retriggerCmdLabel}</span>
                    <span className="ops-cmd-chip">retrigger-review-resolution</span>
                  </button>
                </div>
                <OpsAuditList
                  emptyMessage={opsCopy.rewards.auditEmpty}
                  items={detailData.auditEvents}
                  title={opsCopy.rewards.auditTitle}
                />
                <div className="ops-list-stack">
                  {detailData.chain.map((item) => (
                    <div className="ops-list-card" key={item.ledgerId}>
                      <div className="ops-list-row">
                        <strong>{item.ledgerId}</strong>
                        <span className={`ops-badge ${fmtBadgeClass(item.status)}`}>{statusLabel('reward', item.status)}</span>
                      </div>
                      <p className="ops-muted">
                        {opsCopy.rewards.chainItem(item.ledgerVersion, item.reviewStatus ? statusLabel('review', item.reviewStatus) : opsCopy.rewards.chainNoReview, fmtDate(item.createdAt))}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </aside>
      </div>

      {actions}
      {pendingAction ? (
        <OpsConfirmDialog
          danger={pendingAction.danger}
          description={pendingAction.description}
          onCancel={() => setPendingAction(null)}
          onConfirm={(payload) => void confirmAction(payload)}
          reasonDefaultValue={pendingAction.reasonDefaultValue}
          reasonLabel={pendingAction.reasonLabel}
          reasonPlaceholder={pendingAction.reasonPlaceholder}
          requireReason={pendingAction.requireReason}
          title={pendingAction.title}
          withNote={pendingAction.withNote}
          withReason={pendingAction.withReason}
        />
      ) : null}
    </>
  )
}
