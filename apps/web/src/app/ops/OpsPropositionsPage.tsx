import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { arenaApi } from '../../features/api/arena-api'
import {
  useOpsPropositions,
  useOpsReviewQueue,
} from '../../features/arena/ops-console-data'
import type {
  InternalListSortDirection,
  InternalPropositionListSortBy,
  OpsPropositionStatusFilter,
} from '../../features/arena/internal-ops.types'
import { fmtBadgeClass } from '../../features/arena/ops-format'
import { opsCopy } from '../../features/arena/ops-copy'
import { statusLabel } from '../../features/arena/ops-status-labels'
import { OpsConfirmDialog } from '../OpsConfirmDialog'
import { type ActionFeedbackOverride, useOpsActionDialog } from './ops-action-dialog'
import type { SearchUpdater } from './ops-shared'
import {
  OpsEmpty,
  OpsError,
  OpsFeedback,
  OpsInlineMetric,
  OpsLoading,
} from './ops-shared-ui'

type SearchNumberReader = (
  search: URLSearchParams,
  key: string,
  fallback: number,
) => number

type OpsPropositionsPageProps = {
  token: string
  defaultPageLimit: number
  pageSizeOptions: readonly number[]
  updateSearch: SearchUpdater
  readPositiveSearchNumber: SearchNumberReader
  readNonNegativeSearchNumber: SearchNumberReader
  readOptionalBoolean: (value: string | null) => boolean | undefined
}

export function OpsPropositionsPage({
  token,
  defaultPageLimit,
  pageSizeOptions,
  updateSearch,
  readPositiveSearchNumber,
  readNonNegativeSearchNumber,
  readOptionalBoolean,
}: OpsPropositionsPageProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const search = new URLSearchParams(location.search)
  const reviewQueueOnly = search.get('reviewQueueOnly') === 'true'
  const status = (search.get('status') || undefined) as OpsPropositionStatusFilter | undefined
  const category = search.get('category') || undefined
  const marketEnabled = readOptionalBoolean(search.get('marketEnabled'))
  const searchTerm = search.get('search') ?? ''
  const sortBy = (search.get('sortBy') || undefined) as InternalPropositionListSortBy | undefined
  const sortDirection = (search.get('sortDirection') || undefined) as InternalListSortDirection | undefined
  const limit = readPositiveSearchNumber(search, 'limit', defaultPageLimit)
  const offset = readNonNegativeSearchNumber(search, 'offset', 0)

  const reviewQueue = useOpsReviewQueue(token, {
    category,
    marketEnabled,
    search: searchTerm || undefined,
    sortBy,
    sortDirection,
    limit,
    offset,
  })
  const propositions = useOpsPropositions(token, {
    status,
    category,
    marketEnabled,
    search: searchTerm || undefined,
    sortBy,
    sortDirection,
    limit,
    offset,
  })

  const source = reviewQueueOnly ? reviewQueue : propositions
  const sourcePage = source.state.status === 'ok' ? source.state.data : null
  const filteredItems = sourcePage
    ? sourcePage.items.filter((item) => !reviewQueueOnly || !status || item.status === status)
    : []
  const totalCount = sourcePage
    ? (reviewQueueOnly && status ? filteredItems.length : sourcePage.totalCount)
    : 0
  const [actions, pendingAction, busy, feedback, setPendingAction, confirmAction] = useOpsActionDialog()
  const [selectedPropositionIds, setSelectedPropositionIds] = useState<string[]>([])
  const hasPreviousPage = offset > 0
  const hasNextPage = sourcePage ? offset + filteredItems.length < totalCount : false
  const visibleSelectedPropositionIds = filteredItems
    .filter((item) => selectedPropositionIds.includes(item.propositionId))
    .map((item) => item.propositionId)
  const allVisibleSelected = filteredItems.length > 0 && visibleSelectedPropositionIds.length === filteredItems.length
  const hasVisibleSelection = visibleSelectedPropositionIds.length > 0

  useEffect(() => {
    setSelectedPropositionIds((current) => {
      const next = current.filter((propositionId) =>
        filteredItems.some((item) => item.propositionId === propositionId),
      )
      return next.length === current.length ? current : next
    })
  }, [filteredItems])

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedPropositionIds((current) => {
      const visibleIds = filteredItems.map((item) => item.propositionId)
      const retained = current.filter((propositionId) => !visibleIds.includes(propositionId))
      return checked ? [...retained, ...visibleIds] : retained
    })
  }

  async function runPropositionReviewBatch(
    kind: 'approve' | 'reject',
    propositionIds: string[],
    note: string,
    reason: string,
  ) {
    const completed: string[] = []
    const failed: Array<{ propositionId: string; message: string }> = []
    const now = new Date().toISOString()

    for (const propositionId of propositionIds) {
      try {
        if (kind === 'approve') {
          await arenaApi.approveOpsProposition(
            propositionId,
            { publishedAt: now, reason, note: note || undefined },
            token,
          )
        } else {
          await arenaApi.rejectOpsProposition(
            propositionId,
            { rejectedAt: now, reason, note: note || undefined },
            token,
          )
        }
        completed.push(propositionId)
      } catch (error) {
        failed.push({
          propositionId,
          message: String((error as Error).message ?? error),
        })
      }
    }

    reviewQueue.refresh()
    propositions.refresh()
    setSelectedPropositionIds((current) => current.filter((propositionId) => !completed.includes(propositionId)))

    const actionLabel = kind === 'approve'
      ? opsCopy.propositions.actionLabels.approve
      : opsCopy.propositions.actionLabels.reject
    const receipt = [
      `selectedCount: ${propositionIds.length}`,
      `processedCount: ${completed.length}`,
      `failedCount: ${failed.length}`,
    ]
    failed.slice(0, 3).forEach((item) => {
      receipt.push(`failed ${item.propositionId}: ${item.message}`)
    })

    return {
      feedback: {
        tone: failed.length > 0 ? 'error' : 'success',
        message: failed.length > 0
          ? opsCopy.propositions.batchResultFail(actionLabel, failed.length)
          : opsCopy.propositions.batchResultOk(actionLabel, completed.length),
        receipt,
      },
    } satisfies ActionFeedbackOverride
  }

  function queuePropositionBatchAction(kind: 'approve' | 'reject') {
    if (!hasVisibleSelection) {
      return
    }

    const defaultReason = kind === 'approve' ? 'ops_approved' : 'ops_rejected'
    setPendingAction({
      title: kind === 'approve'
        ? opsCopy.propositions.dialogApproveTitle
        : opsCopy.propositions.dialogRejectTitle,
      description: opsCopy.propositions.selectedCount(visibleSelectedPropositionIds.length),
      danger: kind !== 'approve',
      withNote: true,
      withReason: true,
      requireReason: true,
      reasonLabel: opsCopy.propositions.reasonLabel,
      reasonPlaceholder: defaultReason,
      reasonDefaultValue: defaultReason,
      successMessage: kind === 'approve'
        ? opsCopy.propositions.approveSuccess
        : opsCopy.propositions.rejectSuccess,
      run: ({ note, reason }) => runPropositionReviewBatch(kind, visibleSelectedPropositionIds, note, reason),
    })
  }

  return (
    <>
      <div className="detail-layout">
        <div className="detail-main-stack">
          <section className="detail-panel">
            <div className="ops-filter-row">
              <label>
                <span>{opsCopy.propositions.filters.reviewQueueOnly}</span>
                <input
                  checked={reviewQueueOnly}
                  onChange={(event) => updateSearch(navigate, location, { reviewQueueOnly: event.target.checked ? 'true' : undefined, offset: '0' })}
                  type="checkbox"
                />
              </label>
              <label>
                <span>{opsCopy.propositions.filters.status}</span>
                <select
                  value={status ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { status: event.target.value || undefined, offset: '0' })}
                >
                  <option value="">{opsCopy.filters.all}</option>
                  <option value="draft">{statusLabel('proposition', 'draft')}</option>
                  <option value="scheduled">{statusLabel('proposition', 'scheduled')}</option>
                  <option value="live">{statusLabel('proposition', 'live')}</option>
                  <option value="frozen">{statusLabel('proposition', 'frozen')}</option>
                  <option value="revealing">{statusLabel('proposition', 'revealing')}</option>
                  <option value="settled">{statusLabel('proposition', 'settled')}</option>
                  <option value="closed">{statusLabel('proposition', 'closed')}</option>
                  <option value="archived">{statusLabel('proposition', 'archived')}</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.propositions.filters.category}</span>
                <select
                  value={category ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { category: event.target.value || undefined, offset: '0' })}
                >
                  <option value="">{opsCopy.filters.all}</option>
                  <option value="general">{statusLabel('category', 'general')}</option>
                  <option value="dao">{statusLabel('category', 'dao')}</option>
                  <option value="sports">{statusLabel('category', 'sports')}</option>
                  <option value="ai">{statusLabel('category', 'ai')}</option>
                  <option value="brand_research">{statusLabel('category', 'brand_research')}</option>
                  <option value="politics">{statusLabel('category', 'politics')}</option>
                  <option value="entertainment">{statusLabel('category', 'entertainment')}</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.propositions.filters.market}</span>
                <select
                  value={search.get('marketEnabled') ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { marketEnabled: event.target.value || undefined, offset: '0' })}
                >
                  <option value="">{opsCopy.filters.all}</option>
                  <option value="true">{opsCopy.propositions.marketEnabledOption}</option>
                  <option value="false">{opsCopy.propositions.marketDisabledOption}</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.propositions.filters.search}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { search: event.target.value || undefined, offset: '0' })}
                  placeholder={opsCopy.propositions.filters.searchPlaceholder}
                  value={searchTerm}
                />
              </label>
              <label>
                <span>{opsCopy.propositions.filters.sort}</span>
                <select
                  value={sortBy ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { sortBy: event.target.value || undefined, offset: '0' })}
                >
                  <option value="">createdAt</option>
                  <option value="submittedAt">submittedAt</option>
                  <option value="title">title</option>
                  <option value="effectiveSampleCount">effectiveSampleCount</option>
                  <option value="pendingReviewCount">pendingReviewCount</option>
                  <option value="sampleShortageCount">sampleShortageCount</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.propositions.filters.direction}</span>
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
                <span>{opsCopy.propositions.filters.pageSize}</span>
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
                <p className="ops-section-title">
                  {reviewQueueOnly ? opsCopy.propositions.queueTitle : opsCopy.propositions.listTitle}
                </p>
                <button className="ops-refresh-btn" onClick={source.refresh} type="button">{opsCopy.actions.refresh}</button>
              </div>
              <OpsFeedback feedback={feedback} />
              {source.state.status === 'loading' || source.state.status === 'idle' ? <OpsLoading /> : null}
              {source.state.status === 'error' ? <OpsError kind={source.state.kind} message={source.state.message} onRetry={source.refresh} statusCode={source.state.statusCode} /> : null}
              {source.state.status === 'ok' && filteredItems.length === 0 ? <OpsEmpty message={opsCopy.propositions.empty} /> : null}
              {source.state.status === 'ok' && filteredItems.length > 0 ? (
                <>
                  <div className="ops-section-head">
                    <p className="ops-muted">
                      {opsCopy.queue.showingRange(offset + 1, offset + filteredItems.length, totalCount)}
                    </p>
                    <div className="ops-actions">
                      {reviewQueueOnly ? (
                        <>
                          <label className="ops-inline-toggle">
                            <input
                              aria-label={opsCopy.propositions.selectAllAria}
                              checked={allVisibleSelected}
                              onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                              type="checkbox"
                            />
                            <span>{opsCopy.propositions.selectVisible}</span>
                          </label>
                          <button
                            className="ops-btn ops-btn-ghost"
                            disabled={!hasVisibleSelection}
                            onClick={() => setSelectedPropositionIds([])}
                            type="button"
                          >
                            {opsCopy.actions.clearSelection}
                          </button>
                          <button
                            className="ops-btn ops-btn-primary"
                            disabled={busy || !hasVisibleSelection}
                            onClick={() => queuePropositionBatchAction('approve')}
                            type="button"
                          >
                            {opsCopy.propositions.batchApprove}
                          </button>
                          <button
                            className="ops-btn ops-btn-ghost"
                            disabled={busy || !hasVisibleSelection}
                            onClick={() => queuePropositionBatchAction('reject')}
                            type="button"
                          >
                            {opsCopy.propositions.batchReject}
                          </button>
                        </>
                      ) : null}
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
                  {reviewQueueOnly ? (
                    <>
                      <p className="ops-muted">{opsCopy.queue.selectedOnPage(visibleSelectedPropositionIds.length)}</p>
                      <div className="ops-table-scroll">
                        <table className="ops-table">
                          <thead>
                            <tr>
                              <th>{opsCopy.propositions.table.select}</th>
                              <th>{opsCopy.propositions.table.proposition}</th>
                              <th>{opsCopy.propositions.table.category}</th>
                              <th>{opsCopy.propositions.table.submission}</th>
                              <th>{opsCopy.propositions.table.status}</th>
                              <th>{opsCopy.propositions.table.samples}</th>
                              <th>{opsCopy.propositions.table.pendingReview}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredItems.map((item) => (
                              <tr key={item.propositionId}>
                                <td>
                                  <input
                                    aria-label={opsCopy.propositions.selectPropositionAria(item.propositionId)}
                                    checked={selectedPropositionIds.includes(item.propositionId)}
                                    onChange={(event) => {
                                      setSelectedPropositionIds((current) => {
                                        if (event.target.checked) {
                                          return current.includes(item.propositionId)
                                            ? current
                                            : [...current, item.propositionId]
                                        }
                                        return current.filter((propositionId) => propositionId !== item.propositionId)
                                      })
                                    }}
                                    type="checkbox"
                                  />
                                </td>
                                <td>
                                  <Link to={`/zh/ops/propositions/${item.propositionId}`}>{item.title}</Link>
                                </td>
                                <td>{item.category}</td>
                                <td>{statusLabel('submission', item.submissionStatus)}</td>
                                <td>{statusLabel('proposition', item.status)}</td>
                                <td>{item.effectiveSampleCount}/{item.minEffectiveSample}</td>
                                <td>{item.pendingReviewCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="ops-list-stack">
                      {filteredItems.map((item) => (
                        <Link
                          key={item.propositionId}
                          className="ops-list-card"
                          to={`/zh/ops/propositions/${item.propositionId}`}
                        >
                          <div className="ops-list-row">
                            <div>
                              <strong>{item.title}</strong>
                              <p className="ops-muted">{item.category}</p>
                            </div>
                            <div className="ops-inline-meta">
                              <span className={`ops-badge ${fmtBadgeClass(item.submissionStatus)}`}>{statusLabel('submission', item.submissionStatus)}</span>
                              <span className={`ops-badge ${fmtBadgeClass(item.status)}`}>{statusLabel('proposition', item.status)}</span>
                            </div>
                          </div>
                          <div className="ops-card-grid ops-card-grid-compact">
                            <OpsInlineMetric label={opsCopy.propositions.inlineMetric.effectiveSample} value={`${item.effectiveSampleCount}/${item.minEffectiveSample}`} />
                            <OpsInlineMetric label={opsCopy.propositions.inlineMetric.pendingReview} value={String(item.pendingReviewCount)} />
                            <OpsInlineMetric label={opsCopy.propositions.inlineMetric.sampleShortage} value={String(item.sampleShortageCount)} />
                            <OpsInlineMetric label={opsCopy.propositions.inlineMetric.marketEnabled} value={item.marketEnabled ? opsCopy.propositions.marketEnabledOption : opsCopy.propositions.marketDisabledOption} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="detail-side-panel ops-side-panel">
          <div className="ops-section">
            <p className="ops-section-title">{opsCopy.propositions.queueNotesTitle}</p>
            <p className="ops-muted">
              {opsCopy.propositions.queueNotesBody}
            </p>
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
