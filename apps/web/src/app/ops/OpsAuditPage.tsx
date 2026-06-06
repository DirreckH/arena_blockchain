import type { ComponentType } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useOpsAuditEvents } from '../../features/arena/ops-console-data'
import type {
  InternalAuditEventViewModel,
  InternalListSortDirection,
  OpsAuditFilters,
} from '../../features/arena/internal-ops.types'
import { fmtDate } from '../../features/arena/ops-format'
import { opsCopy } from '../../features/arena/ops-copy'
import { useAuthSession } from '../../features/auth/auth-session'

type ErrorStateKind = 'not_found' | 'unauthorized' | 'forbidden' | 'network' | 'unknown'

type SearchUpdater = (
  navigate: ReturnType<typeof useNavigate>,
  location: ReturnType<typeof useLocation>,
  updates: Record<string, string | undefined>,
) => void

type OpsAuditPageProps = {
  token: string
  defaultPageLimit: number
  pageSizeOptions: number[]
  updateSearch: SearchUpdater
  readPositiveSearchNumber: (search: URLSearchParams, key: string, fallback: number) => number
  readNonNegativeSearchNumber: (search: URLSearchParams, key: string, fallback: number) => number
  buildAuditEventWorkspaceLink: (
    item: InternalAuditEventViewModel,
  ) => { to: string; label: string } | null
  EmptyComponent: ComponentType<{ message: string }>
  ErrorComponent: ComponentType<{
    kind: ErrorStateKind
    message: string
    onRetry?: () => void
    statusCode?: number
  }>
}

export function OpsAuditPage({
  token,
  defaultPageLimit,
  pageSizeOptions,
  updateSearch,
  readPositiveSearchNumber,
  readNonNegativeSearchNumber,
  buildAuditEventWorkspaceLink,
  EmptyComponent,
  ErrorComponent,
}: OpsAuditPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { identity } = useAuthSession()
  const search = new URLSearchParams(location.search)
  const searchTerm = search.get('search') ?? ''
  const entityType = search.get('entityType') ?? ''
  const entityId = search.get('entityId') ?? ''
  const actorUserId = search.get('actorUserId') ?? ''
  const action = search.get('action') ?? ''
  const sortDirection = (search.get('sortDirection') || undefined) as InternalListSortDirection | undefined
  const limit = readPositiveSearchNumber(search, 'limit', defaultPageLimit)
  const offset = readNonNegativeSearchNumber(search, 'offset', 0)
  const currentUserId = identity?.sub ?? ''
  const isCurrentActorFilter = currentUserId.length > 0 && actorUserId === currentUserId

  const filters: OpsAuditFilters = {
    search: searchTerm || undefined,
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    actorUserId: actorUserId || undefined,
    action: action || undefined,
    sortDirection,
    limit,
    offset,
  }

  const audits = useOpsAuditEvents(token, filters)

  return (
    <div className="detail-layout">
      <div className="detail-main-stack">
        <section className="detail-panel">
          <div className="ops-panel-stack">
            <div className="ops-list-row">
              <div>
                <p className="ops-section-title">{opsCopy.audit.title}</p>
                <p className="ops-muted">{opsCopy.audit.description}</p>
              </div>
              <div className="ops-actions">
                <button
                  className="ops-btn ops-btn-ghost"
                  disabled={!currentUserId}
                  onClick={() => updateSearch(navigate, location, {
                    actorUserId: isCurrentActorFilter ? undefined : currentUserId || undefined,
                    offset: '0',
                  })}
                  type="button"
                >
                  {isCurrentActorFilter ? opsCopy.audit.showAllActors : opsCopy.audit.myRecentOperations}
                </button>
                <button
                  className="ops-btn ops-btn-ghost"
                  onClick={() => updateSearch(navigate, location, {
                    search: undefined,
                    entityType: undefined,
                    entityId: undefined,
                    actorUserId: undefined,
                    action: undefined,
                    sortDirection: undefined,
                    limit: String(defaultPageLimit),
                    offset: '0',
                  })}
                  type="button"
                >
                  {opsCopy.audit.clearFilters}
                </button>
              </div>
            </div>

            <div className="ops-filter-row">
              <label>
                <span>{opsCopy.audit.filterSearch}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { search: event.target.value || undefined, offset: '0' })}
                  placeholder={opsCopy.audit.filterSearchPlaceholder}
                  value={searchTerm}
                />
              </label>
              <label>
                <span>{opsCopy.audit.filterEntityType}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { entityType: event.target.value || undefined, offset: '0' })}
                  placeholder="proposition"
                  value={entityType}
                />
              </label>
              <label>
                <span>{opsCopy.audit.filterEntityId}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { entityId: event.target.value || undefined, offset: '0' })}
                  placeholder="prop_123"
                  value={entityId}
                />
              </label>
              <label>
                <span>{opsCopy.audit.filterActor}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { actorUserId: event.target.value || undefined, offset: '0' })}
                  placeholder="ops_user_1"
                  value={actorUserId}
                />
              </label>
              <label>
                <span>{opsCopy.audit.filterAction}</span>
                <input
                  onChange={(event) => updateSearch(navigate, location, { action: event.target.value || undefined, offset: '0' })}
                  placeholder="runtime_contract.alert.release_ready"
                  value={action}
                />
              </label>
              <label>
                <span>{opsCopy.audit.filterDirection}</span>
                <select
                  value={sortDirection ?? ''}
                  onChange={(event) => updateSearch(navigate, location, { sortDirection: event.target.value || undefined, offset: '0' })}
                >
                  <option value="">{opsCopy.audit.directionDesc}</option>
                  <option value="desc">{opsCopy.audit.directionDesc}</option>
                  <option value="asc">{opsCopy.audit.directionAsc}</option>
                </select>
              </label>
              <label>
                <span>{opsCopy.audit.filterPageSize}</span>
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

            {audits.state.status === 'loading' || audits.state.status === 'idle' ? <div className="ops-loading">加载中…</div> : null}
            {audits.state.status === 'error' ? <ErrorComponent kind={audits.state.kind} message={audits.state.message} onRetry={audits.refresh} statusCode={audits.state.statusCode} /> : null}
            {audits.state.status === 'ok' ? (
              <div className="ops-panel-stack">
                <div className="ops-list-row">
                  <p className="ops-section-title">{opsCopy.audit.resultsTitle}</p>
                  <span className="ops-muted">{opsCopy.audit.resultsCount(audits.state.data.totalCount)}</span>
                </div>
                {audits.state.data.items.length === 0 ? <EmptyComponent message={opsCopy.audit.empty} /> : null}
                {audits.state.data.items.length > 0 ? (
                  <div className="ops-list-stack">
                    {audits.state.data.items.map((item) => {
                      const workspaceLink = buildAuditEventWorkspaceLink(item)
                      return (
                        <div className="ops-list-card" key={item.id}>
                          <div className="ops-list-row">
                            <strong>{item.action}</strong>
                            <span className="ops-muted">{fmtDate(item.createdAt)}</span>
                          </div>
                          <div className="ops-kv-grid">
                            <span className="ops-kv-label">{opsCopy.audit.kvEntity}</span><span>{item.entityType} / {item.entityId}</span>
                            <span className="ops-kv-label">{opsCopy.audit.kvActor}</span><span>{item.actorUserId ?? opsCopy.audit.actorSystem}</span>
                          </div>
                          <p className="ops-muted">{item.reason}</p>
                          {item.note ? <p className="ops-muted">{item.note}</p> : null}
                          <div className="ops-actions">
                            <button
                              className="ops-btn ops-btn-ghost"
                              onClick={() => updateSearch(navigate, location, {
                                entityType: item.entityType,
                                entityId: item.entityId,
                                offset: '0',
                              })}
                              type="button"
                            >
                              {opsCopy.audit.filterEntityAction}
                            </button>
                            {item.actorUserId ? (
                              <button
                                className="ops-btn ops-btn-ghost"
                                onClick={() => updateSearch(navigate, location, {
                                  actorUserId: item.actorUserId || undefined,
                                  offset: '0',
                                })}
                                type="button"
                              >
                                {opsCopy.audit.filterActorAction}
                              </button>
                            ) : null}
                            {workspaceLink ? (
                              <Link className="ops-btn ops-btn-ghost" to={workspaceLink.to}>{workspaceLink.label}</Link>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
                <div className="ops-actions">
                  <button
                    className="ops-btn ops-btn-ghost"
                    disabled={offset === 0}
                    onClick={() => updateSearch(navigate, location, { offset: String(Math.max(0, offset - limit)) })}
                    type="button"
                  >
                    {opsCopy.audit.previous}
                  </button>
                  <button
                    className="ops-btn ops-btn-ghost"
                    disabled={offset + audits.state.data.items.length >= audits.state.data.totalCount}
                    onClick={() => updateSearch(navigate, location, { offset: String(offset + limit) })}
                    type="button"
                  >
                    {opsCopy.audit.next}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <aside className="detail-side-panel ops-side-panel">
        <div className="ops-section">
          <p className="ops-section-title">{opsCopy.audit.tipsTitle}</p>
          <div className="ops-side-stack">
            <p className="ops-muted">{opsCopy.audit.tipActorAction}</p>
            <p className="ops-muted">{opsCopy.audit.tipSearchCoverage}</p>
          </div>
        </div>
      </aside>
    </div>
  )
}
