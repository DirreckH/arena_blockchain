import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { arenaApi } from '../../features/api/arena-api'
import {
  useOpsResponseDetail,
  useOpsResponseQueue,
} from '../../features/arena/ops-console-data'
import type {
  InternalListSortDirection,
  OpsResponseQueueSortBy,
  ResponseReviewStatus,
  ResponseReviewWorkflowState,
} from '../../features/arena/internal-ops.types'
import { fmtBadgeClass, fmtDate } from '../../features/arena/ops-format'
import { opsCopy } from '../../features/arena/ops-copy'
import { statusLabel } from '../../features/arena/ops-status-labels'
import { OpsConfirmDialog } from '../OpsConfirmDialog'
import { type ActionFeedbackOverride, useOpsActionDialog } from './ops-action-dialog'
import type { SearchUpdater } from './ops-shared'
import {
  buildRespondentRoute,
  OpsEmpty,
  OpsError,
  OpsFeedback,
  OpsLoading,
  OpsNotFoundDetail,
  OpsStringList,
} from './ops-shared-ui'

type SearchNumberReader = (
  search: URLSearchParams,
  key: string,
  fallback: number,
) => number

type OpsResponsesPageProps = {
  token: string
  defaultPageLimit: number
  pageSizeOptions: readonly number[]
  updateSearch: SearchUpdater
  readPositiveSearchNumber: SearchNumberReader
  readNonNegativeSearchNumber: SearchNumberReader
}

export function OpsResponsesPage({
  token,
  defaultPageLimit,
  pageSizeOptions,
  updateSearch,
  readPositiveSearchNumber,
  readNonNegativeSearchNumber,
}: OpsResponsesPageProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const search = new URLSearchParams(location.search)
  const workflowState = (search.get('workflowState') || undefined) as ResponseReviewWorkflowState | undefined
  const propositionId = search.get('propositionId') || undefined
  const claimStaleOnly = search.get('claimStaleOnly') === 'true'
  const claimedByUserId = search.get('claimedByUserId') || undefined
  const reviewStatus = (search.get('reviewStatus') || undefined) as ResponseReviewStatus | undefined
  const selectedResponseId = search.get('responseId')
  const searchTerm = search.get('search') ?? ''
  const sortBy = (search.get('sortBy') || undefined) as OpsResponseQueueSortBy | undefined
  const sortDirection = (search.get('sortDirection') || undefined) as InternalListSortDirection | undefined
  const limit = readPositiveSearchNumber(search, 'limit', defaultPageLimit)
  const offset = readNonNegativeSearchNumber(search, 'offset', 0)

  const queue = useOpsResponseQueue(token, {
    workflowState,
    propositionId,
    claimStaleOnly: claimStaleOnly || undefined,
    claimedByUserId,
    reviewStatus,
    search: searchTerm || undefined,
    sortBy,
    sortDirection,
    limit,
    offset,
  })
  const detail = useOpsResponseDetail(token, selectedResponseId)
  const [actions, pendingAction, busy, feedback, setPendingAction, confirmAction] = useOpsActionDialog()
  const detailData = selectedResponseId && detail.state.status === 'ok' ? detail.state.data : null
  const queuePage = queue.state.status === 'ok' ? queue.state.data : null
  const queueItems = queuePage?.items ?? []
  const [selectedResponseIds, setSelectedResponseIds] = useState<string[]>([])
  const hasPreviousPage = offset > 0
  const hasNextPage = queuePage ? offset + queueItems.length < queuePage.totalCount : false
  const visibleSelectedResponseIds = queueItems
    .filter((item) => selectedResponseIds.includes(item.responseId))
    .map((item) => item.responseId)
  const allVisibleSelected = queueItems.length > 0 && visibleSelectedResponseIds.length === queueItems.length
  const hasVisibleSelection = visibleSelectedResponseIds.length > 0

  useEffect(() => {
    setSelectedResponseIds((current) => {
      const next = current.filter((responseId) =>
        queueItems.some((item) => item.responseId === responseId),
      )
      return next.length === current.length ? current : next
    })
  }, [queueItems])

  function selectResponse(responseId: string) {
    updateSearch(navigate, location, { responseId })
  }

  function toggleResponseSelection(responseId: string, checked: boolean) {
    setSelectedResponseIds((current) => {
      if (checked) {
        return current.includes(responseId) ? current : [...current, responseId]
      }
      return current.filter((item) => item !== responseId)
    })
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedResponseIds(checked ? queueItems.map((item) => item.responseId) : [])
  }

  async function runQueueWorkflow(
    kind: 'claim' | 'release' | 'review',
    responseIds: string[],
    note: string,
  ) {
    const completed: string[] = []
    const failed: Array<{ responseId: string; message: string }> = []

    for (const responseId of responseIds) {
      try {
        const now = new Date().toISOString()
        if (kind === 'claim') {
          await arenaApi.claimOpsResponseReview(responseId, { claimedAt: now, note: note || undefined }, token)
        } else if (kind === 'release') {
          await arenaApi.releaseOpsResponseReview(responseId, { releasedAt: now, note: note || undefined }, token)
        } else {
          await arenaApi.reviewOpsResponse(responseId, { reviewedAt: now }, token)
        }
        completed.push(responseId)
      } catch (error) {
        failed.push({
          responseId,
          message: String((error as Error).message ?? error),
        })
      }
    }

    queue.refresh()
    detail.refresh()
    setSelectedResponseIds((current) => current.filter((responseId) => !completed.includes(responseId)))

    const actionLabel = kind === 'claim'
      ? opsCopy.responses.actionLabels.claim
      : kind === 'release'
        ? opsCopy.responses.actionLabels.release
        : opsCopy.responses.actionLabels.review
    const receipt = [
      `selectedCount: ${responseIds.length}`,
      `processedCount: ${completed.length}`,
      `failedCount: ${failed.length}`,
    ]
    failed.slice(0, 3).forEach((item) => {
      receipt.push(`failed ${item.responseId}: ${item.message}`)
    })

    return {
      feedback: {
        tone: failed.length > 0 ? 'error' : 'success',
        message: failed.length > 0
          ? opsCopy.responses.batchResultFail(actionLabel, failed.length)
          : opsCopy.responses.batchResultOk(actionLabel, completed.length),
        receipt,
      },
    } satisfies ActionFeedbackOverride
  }

  function queueWorkflowAction(kind: 'claim' | 'release' | 'review', responseId: string) {
    setPendingAction({
      title: kind === 'claim' ? opsCopy.responses.dialogClaimTitle : kind === 'release' ? opsCopy.responses.dialogReleaseTitle : opsCopy.responses.dialogReviewTitle,
      description: opsCopy.responses.responseIdLabel(responseId),
      withNote: kind !== 'review',
      successMessage: kind === 'claim' ? opsCopy.responses.claimedMsg : kind === 'release' ? opsCopy.responses.releasedMsg : opsCopy.responses.reviewedMsg,
      run: ({ note }) => runQueueWorkflow(kind, [responseId], note),
    })
  }

  function queueWorkflowBatchAction(kind: 'claim' | 'release' | 'review') {
    if (!hasVisibleSelection) {
      return
    }

    setPendingAction({
      title: kind === 'claim' ? opsCopy.responses.batchClaimTitle : kind === 'release' ? opsCopy.responses.batchReleaseTitle : opsCopy.responses.batchReviewTitle,
      description: opsCopy.responses.selectedCount(visibleSelectedResponseIds.length),
      withNote: kind !== 'review',
      successMessage: kind === 'claim' ? opsCopy.responses.batchClaimTitle : kind === 'release' ? opsCopy.responses.batchReleaseTitle : opsCopy.responses.batchReviewTitle,
      run: ({ note }) => runQueueWorkflow(kind, visibleSelectedResponseIds, note),
    })
  }

  return (
    <>
      <div className="detail-layout">
        <div className="detail-main-stack">
          <section className="detail-panel">
            <div className="ops-filter-row">
              <label>
                <span>{opsCopy.responses.filters.workflow}</span>
                <select
                  value={workflowState ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { workflowState: event.target.value || undefined })}
                >
                  <option value="">{opsCopy.filters.all}</option>
                  <option value="unclaimed">{statusLabel('workflow', 'unclaimed')}</option>
                  <option value="claimed">{statusLabel('workflow', 'claimed')}</option>
                  <option value="released">{statusLabel('workflow', 'released')}</option>
                  <option value="expired">{statusLabel('workflow', 'expired')}</option>
                  <option value="finalized">{statusLabel('workflow', 'finalized')}</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.responses.filters.review}</span>
                <select
                  value={reviewStatus ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { reviewStatus: event.target.value || undefined })}
                >
                  <option value="">{opsCopy.filters.all}</option>
                  <option value="pending_review">{statusLabel('review', 'pending_review')}</option>
                  <option value="valid">{statusLabel('review', 'valid')}</option>
                  <option value="partial_valid">{statusLabel('review', 'partial_valid')}</option>
                  <option value="invalid">{statusLabel('review', 'invalid')}</option>
                  <option value="fraud_suspected">{statusLabel('review', 'fraud_suspected')}</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.responses.filters.proposition}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { propositionId: event.target.value || undefined })}
                  placeholder={opsCopy.responses.filters.propositionPlaceholder}
                  value={propositionId ?? ''}
                />
              </label>
              <label>
                <span>{opsCopy.responses.filters.claimedBy}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { claimedByUserId: event.target.value || undefined })}
                  placeholder={opsCopy.responses.filters.claimedByPlaceholder}
                  value={claimedByUserId ?? ''}
                />
              </label>
              <label>
                <span>{opsCopy.responses.filters.claimStaleOnly}</span>
                <input
                  checked={claimStaleOnly}
                  onChange={(event) => updateSearch(navigate, location, { claimStaleOnly: event.target.checked ? 'true' : undefined })}
                  type="checkbox"
                />
              </label>
              <label>
                <span>{opsCopy.responses.filters.search}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { search: event.target.value || undefined, offset: '0' })}
                  placeholder={opsCopy.responses.filters.searchPlaceholder}
                  value={searchTerm}
                />
              </label>
              <label>
                <span>{opsCopy.responses.filters.sort}</span>
                <select
                  value={sortBy ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { sortBy: event.target.value || undefined, offset: '0' })}
                >
                  <option value="">submittedAt</option>
                  <option value="claimedAt">claimedAt</option>
                  <option value="propositionTitle">propositionTitle</option>
                  <option value="userId">userId</option>
                  <option value="workflowState">workflowState</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.responses.filters.direction}</span>
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
                <span>{opsCopy.responses.filters.pageSize}</span>
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
                <p className="ops-section-title">{opsCopy.responses.queueTitle}</p>
                <button className="ops-refresh-btn" onClick={queue.refresh} type="button">{opsCopy.actions.refresh}</button>
              </div>
              <OpsFeedback feedback={feedback} />
              {queue.state.status === 'loading' || queue.state.status === 'idle' ? <OpsLoading /> : null}
              {queue.state.status === 'error' ? <OpsError kind={queue.state.kind} message={queue.state.message} onRetry={queue.refresh} statusCode={queue.state.statusCode} /> : null}
              {queue.state.status === 'ok' && queueItems.length === 0 ? <OpsEmpty message={opsCopy.responses.empty} /> : null}
              {queue.state.status === 'ok' && queueItems.length > 0 ? (
                <>
                  <div className="ops-section-head">
                    <p className="ops-muted">
                      {opsCopy.queue.showingRange(offset + 1, offset + queueItems.length, queuePage?.totalCount ?? queueItems.length)}
                    </p>
                    <div className="ops-actions">
                      <label className="ops-inline-toggle">
                        <input
                          aria-label={opsCopy.responses.selectAllAria}
                          checked={allVisibleSelected}
                          onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                          type="checkbox"
                        />
                        <span>{opsCopy.actions.selectVisible}</span>
                      </label>
                      <button
                        className="ops-btn ops-btn-ghost"
                        disabled={!hasVisibleSelection}
                        onClick={() => setSelectedResponseIds([])}
                        type="button"
                      >
                        {opsCopy.actions.clearSelection}
                      </button>
                      <button
                        className="ops-btn ops-btn-primary"
                        disabled={busy || !hasVisibleSelection}
                        onClick={() => queueWorkflowBatchAction('claim')}
                        type="button"
                      >
                        {opsCopy.responses.batchClaim}
                      </button>
                      <button
                        className="ops-btn ops-btn-ghost"
                        disabled={busy || !hasVisibleSelection}
                        onClick={() => queueWorkflowBatchAction('release')}
                        type="button"
                      >
                        {opsCopy.responses.batchRelease}
                      </button>
                      <button
                        className="ops-btn ops-btn-primary"
                        disabled={busy || !hasVisibleSelection}
                        onClick={() => queueWorkflowBatchAction('review')}
                        type="button"
                      >
                        {opsCopy.responses.batchReview}
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
                  <p className="ops-muted">{opsCopy.queue.selectedOnPage(visibleSelectedResponseIds.length)}</p>
                  <div className="ops-table-scroll">
                    <table className="ops-table">
                      <thead>
                        <tr><th>{opsCopy.responses.table.select}</th><th>{opsCopy.responses.table.proposition}</th><th>{opsCopy.responses.table.response}</th><th>{opsCopy.responses.table.user}</th><th>{opsCopy.responses.table.review}</th><th>{opsCopy.responses.table.workflow}</th><th>{opsCopy.responses.table.submitted}</th></tr>
                      </thead>
                      <tbody>
                        {queueItems.map((item) => (
                          <tr
                            className={selectedResponseId === item.responseId ? 'ops-row-selected' : undefined}
                            key={item.responseId}
                            onClick={() => selectResponse(item.responseId)}
                          >
                            <td onClick={(event) => event.stopPropagation()}>
                              <input
                                aria-label={opsCopy.responses.selectResponseAria(item.responseId)}
                                checked={selectedResponseIds.includes(item.responseId)}
                                onChange={(event) => toggleResponseSelection(item.responseId, event.target.checked)}
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
                            <td>{statusLabel('review', item.reviewStatus)}</td>
                            <td>
                              <span className={`ops-badge ${fmtBadgeClass(item.workflowState)}`}>{statusLabel('workflow', item.workflowState)}</span>
                              {item.isClaimStale ? <span className="ops-inline-warning">{opsCopy.responses.stale}</span> : null}
                            </td>
                            <td>{fmtDate(item.submittedAt)}</td>
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
            <p className="ops-section-title">{opsCopy.responses.detailTitle}</p>
            {!selectedResponseId ? <OpsEmpty message={opsCopy.responses.detailEmpty} /> : null}
            {selectedResponseId && (detail.state.status === 'loading' || detail.state.status === 'idle') ? <OpsLoading /> : null}
            {selectedResponseId && detail.state.status === 'error'
              ? (detail.state.kind === 'not_found'
                ? <OpsNotFoundDetail message={opsCopy.responses.notFound} />
                : <OpsError kind={detail.state.kind} message={detail.state.message} onRetry={detail.refresh} statusCode={detail.state.statusCode} />)
              : null}
            {detailData ? (
              <>
                <div className="ops-kv-grid">
                  <span className="ops-kv-label">{opsCopy.responses.kv.response}</span><span>{detailData.response.id}</span>
                  <span className="ops-kv-label">{opsCopy.responses.kv.proposition}</span><span>{detailData.proposition.title}</span>
                  <span className="ops-kv-label">{opsCopy.responses.kv.user}</span><span><Link to={buildRespondentRoute(detailData.response.userId)}>{detailData.response.userId}</Link></span>
                  <span className="ops-kv-label">{opsCopy.responses.kv.workflow}</span><span>{statusLabel('workflow', detailData.workflow.workflowState)}</span>
                  <span className="ops-kv-label">{opsCopy.responses.kv.review}</span><span>{statusLabel('review', detailData.workflow.reviewStatus)}</span>
                  <span className="ops-kv-label">{opsCopy.responses.kv.submitted}</span><span>{fmtDate(detailData.response.submittedAt)}</span>
                </div>
                <div className="ops-actions">
                  <button className="ops-btn ops-btn-primary" disabled={busy} onClick={() => queueWorkflowAction('claim', detailData.response.id)} type="button">{opsCopy.responses.claim}</button>
                  <button className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => queueWorkflowAction('release', detailData.response.id)} type="button">{opsCopy.responses.release}</button>
                  <button className="ops-btn ops-btn-primary" disabled={busy} onClick={() => queueWorkflowAction('review', detailData.response.id)} type="button">{opsCopy.responses.review}</button>
                </div>
                <OpsStringList
                  items={detailData.currentReview?.flags ?? []}
                  title={opsCopy.responses.flags}
                />
                <OpsStringList
                  items={detailData.currentReview?.reasonCodes ?? []}
                  title={opsCopy.responses.reasonCodes}
                />
                <pre className="ops-code-block">
                  {JSON.stringify(detailData.response.responsePayload, null, 2)}
                </pre>
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
