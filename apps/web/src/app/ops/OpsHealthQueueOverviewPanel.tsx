import type { ComponentType } from 'react'
import type { QueueOverviewSnapshot } from '@arena/shared'
import type { LoadState } from '../../features/arena/ops-console-data'
import { opsCopy } from '../../features/arena/ops-copy'
import type { ErrorStateKind } from './ops-shared'

type OpsHealthQueueOverviewPanelProps = {
  busy: boolean
  isAdmin: boolean
  overview: { state: LoadState<QueueOverviewSnapshot>; refresh: () => void }
  onRequeueFailedQueue: (queueName: string) => void
  LoadingComponent: ComponentType
  ErrorComponent: ComponentType<{
    kind: ErrorStateKind
    message: string
    onRetry?: () => void
    statusCode?: number | null
  }>
}

export function OpsHealthQueueOverviewPanel({
  busy,
  isAdmin,
  overview,
  onRequeueFailedQueue,
  LoadingComponent,
  ErrorComponent,
}: OpsHealthQueueOverviewPanelProps) {
  return (
    <section className="detail-panel">
      <div className="ops-section">
        <p className="ops-section-title">{opsCopy.queueOverview.title}</p>
        {overview.state.status === 'loading' || overview.state.status === 'idle' ? <LoadingComponent /> : null}
        {overview.state.status === 'error' ? <ErrorComponent kind={overview.state.kind} message={overview.state.message} onRetry={overview.refresh} statusCode={overview.state.statusCode} /> : null}
        {overview.state.status === 'ok' ? (
          <div className="ops-table-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>{opsCopy.queueOverview.table.queue}</th>
                  <th>{opsCopy.queueOverview.table.status}</th>
                  <th>{opsCopy.queueOverview.table.waiting}</th>
                  <th>{opsCopy.queueOverview.table.active}</th>
                  <th>{opsCopy.queueOverview.table.delayed}</th>
                  <th>{opsCopy.queueOverview.table.completed}</th>
                  <th>{opsCopy.queueOverview.table.failed}</th>
                  <th>{opsCopy.queueOverview.table.actions}</th>
                </tr>
              </thead>
              <tbody>
                {overview.state.data.queues.map((queueItem) => (
                  <tr key={queueItem.name}>
                    <td>{queueItem.name}</td>
                    <td>{queueItem.paused ? opsCopy.queueOverview.paused : queueItem.status}</td>
                    <td>{queueItem.counts?.waiting ?? '-'}</td>
                    <td>{queueItem.counts?.active ?? '-'}</td>
                    <td>{queueItem.counts?.delayed ?? '-'}</td>
                    <td>{queueItem.counts?.completed ?? '-'}</td>
                    <td>{queueItem.counts?.failed ?? '-'}</td>
                    <td>
                      {isAdmin && queueItem.policy.retryable && (queueItem.counts?.failed ?? 0) > 0 ? (
                        <button className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => onRequeueFailedQueue(queueItem.name)} type="button">{opsCopy.queueOverview.requeueFailed}</button>
                      ) : <span className="ops-muted">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  )
}
