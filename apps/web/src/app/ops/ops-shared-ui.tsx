import { Link } from 'react-router-dom'
import type {
  BackendRuntimeContractChecklistItemViewModel,
  BackendRuntimeContractCommandSetViewModel,
  InternalAuditEventViewModel,
  OperatorSummaryEvidenceViewModel,
  ValidationChainHealthAlertViewModel,
} from '../../features/arena/internal-ops.types'
import { fmtBadgeClass, fmtDate } from '../../features/arena/ops-format'
import { opsCopy } from '../../features/arena/ops-copy'
import type { ErrorStateKind, Feedback } from './ops-shared'

export function OpsMetricLinkCard({
  href,
  label,
  value,
  detail,
}: {
  href: string
  label: string
  value: string
  detail: string
}) {
  return (
    <Link className="ops-workspace-card" to={href}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Link>
  )
}

export function OpsInlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="ops-inline-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function OpsStringList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="ops-string-list">
      <strong>{title}</strong>
      <ul className="ops-bullet-list">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

export function OpsCommandSequence({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="ops-string-list">
      <strong>{title}</strong>
      <ol className="ops-command-list">
        {items.map((item) => (
          <li className="ops-command-item" key={`${title}-${item}`}>
            <code>{item}</code>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function OpsHealthAlertList({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items: ValidationChainHealthAlertViewModel[]
  emptyMessage: string
}) {
  return (
    <div className="ops-string-list">
      <strong>{title}</strong>
      {items.length === 0 ? <p className="ops-muted">{emptyMessage}</p> : null}
      {items.length > 0 ? (
        <div className="ops-list-stack">
          {items.map((item) => {
            const auditThread = buildOpsAuditThreadRoute(item)
            const workspaceLink = buildOpsWorkspaceLink(item)
            return (
              <div className="ops-list-card" key={`${item.entityType}-${item.entityId}-${item.createdAt}`}>
                <div className="ops-list-row">
                  <strong>{item.action}</strong>
                  <span className="ops-muted">{fmtDate(item.createdAt)}</span>
                </div>
                <p className="ops-muted">
                  {item.entityType} {item.entityId} / {item.reason}
                </p>
                <div className="ops-actions">
                  <Link className="ops-btn ops-btn-ghost" to={auditThread}>{opsCopy.shared.auditThread}</Link>
                  {workspaceLink ? (
                    <Link className="ops-btn ops-btn-ghost" to={workspaceLink.to}>{workspaceLink.label}</Link>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function OpsRecentChainEvents({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items: Array<{ primary: string; secondary: string }>
  emptyMessage: string
}) {
  return (
    <div className="ops-string-list">
      <strong>{title}</strong>
      {items.length === 0 ? <p className="ops-muted">{emptyMessage}</p> : null}
      {items.length > 0 ? (
        <div className="ops-list-stack">
          {items.map((item) => (
            <div className="ops-list-card" key={`${title}-${item.primary}-${item.secondary}`}>
              <strong>{item.primary}</strong>
              <p className="ops-muted">{item.secondary}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function OpsCommandGroups({ commands }: { commands: BackendRuntimeContractCommandSetViewModel }) {
  const entries = Object.entries(commands).filter(([, items]) => items.length > 0)
  if (entries.length === 0) {
    return null
  }

  return (
    <div className="ops-list-stack">
      {entries.map(([group, items]) => (
        <div className="ops-list-card" key={group}>
          <strong>{formatCommandGroupLabel(group)}</strong>
          <OpsCommandSequence title={opsCopy.shared.commands} items={items} />
        </div>
      ))}
    </div>
  )
}

export function OpsChecklistList({ items }: { items: BackendRuntimeContractChecklistItemViewModel[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="ops-list-stack">
      {items.map((item) => (
        <div className="ops-list-card" key={item.id}>
          <div className="ops-list-row">
            <strong>{item.id}</strong>
            <span className={`ops-badge ${fmtBadgeClass(item.status)}`}>{item.status}</span>
          </div>
          <p className="ops-muted">{item.summary}</p>
          <OpsStringList title={opsCopy.shared.blockingDependencies} items={item.blockingDependencies} />
          <OpsCommandSequence title={opsCopy.shared.commands} items={item.commands} />
          <OpsCommandSequence title={opsCopy.shared.operatorActions} items={item.operatorActions} />
        </div>
      ))}
    </div>
  )
}

export function OpsAuditList({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items: InternalAuditEventViewModel[]
  emptyMessage: string
}) {
  return (
    <div className="ops-string-list">
      <strong>{title}</strong>
      {items.length === 0 ? <p className="ops-muted">{emptyMessage}</p> : null}
      {items.length > 0 ? (
        <div className="ops-list-stack">
          {items.map((item) => {
            const auditThread = buildOpsAuditThreadRoute(item)
            const workspaceLink = buildAuditEventWorkspaceLink(item)
            return (
              <div className="ops-list-card" key={item.id}>
                <div className="ops-list-row">
                  <strong>{item.action}</strong>
                  <span className="ops-muted">{fmtDate(item.createdAt)}</span>
                </div>
                <p className="ops-muted">{item.reason}</p>
                <div className="ops-actions">
                  <Link className="ops-btn ops-btn-ghost" to={auditThread}>{opsCopy.shared.auditThread}</Link>
                  {workspaceLink ? (
                    <Link className="ops-btn ops-btn-ghost" to={workspaceLink.to}>{workspaceLink.label}</Link>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function OpsLoading() {
  return (
    <div aria-busy="true" aria-label={opsCopy.shared.loadingAria} className="ops-loading ops-loading-skeleton">
      <span className="skeleton-line medium" />
      <span className="skeleton-line full" />
      <span className="skeleton-line short" />
    </div>
  )
}

export function OpsEmpty({ message }: { message: string }) {
  return <div className="ops-empty">{message}</div>
}

export function OpsError({
  message,
  kind = 'unknown',
  statusCode,
  onRetry,
}: {
  message: string
  kind?: ErrorStateKind
  statusCode?: number | null
  onRetry?: () => void
}) {
  const summary = kind === 'unauthorized'
    ? opsCopy.states.authExpired
    : kind === 'forbidden'
      ? opsCopy.states.permissionDenied
      : kind === 'network'
        ? opsCopy.states.networkError
        : message
  const showDetail = summary !== message

  return (
    <div className="ops-error">
      <span>{summary}</span>
      {statusCode ? <span className="ops-muted">HTTP {statusCode}</span> : null}
      {showDetail ? <p className="ops-muted">{message}</p> : null}
      {onRetry ? <button className="ops-refresh-btn" onClick={onRetry} type="button">{opsCopy.actions.retry}</button> : null}
    </div>
  )
}

export function OpsFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null
  return (
    <div className={feedback.tone === 'error' ? 'ops-error' : 'ops-success'}>
      <span>{feedback.message}</span>
      {feedback.receipt && feedback.receipt.length > 0 ? (
        <ul className="ops-feedback-receipt">
          {feedback.receipt.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

export function OpsNotFoundDetail({ message }: { message: string }) {
  return (
    <section className="detail-panel">
      <h2>{opsCopy.states.notFound}</h2>
      <p>{message}</p>
    </section>
  )
}

export function buildRespondentRoute(userId: string): string {
  return `/zh/ops/respondents/${encodeURIComponent(userId)}`
}

export function buildOpsAuditThreadRoute(
  input: Pick<OperatorSummaryEvidenceViewModel, 'entityType' | 'entityId' | 'action'>,
) {
  const search = new URLSearchParams()
  search.set('entityType', input.entityType)
  search.set('entityId', input.entityId)
  search.set('action', input.action)
  return `/zh/ops/audit?${search.toString()}`
}

function buildTakeoverRoute(input: {
  propositionId?: string | null
  marketId?: string | null
  userId?: string | null
}) {
  const search = new URLSearchParams()
  if (input.propositionId) {
    search.set('propositionId', input.propositionId)
  }
  if (input.marketId) {
    search.set('marketId', input.marketId)
  }
  if (input.userId) {
    search.set('userId', input.userId)
  }
  const query = search.toString()
  return query ? `/zh/ops/takeover?${query}` : '/zh/ops/takeover'
}

function readMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function buildOpsWorkspaceLink(
  input: Pick<OperatorSummaryEvidenceViewModel, 'entityType' | 'entityId'> & { metadata?: unknown },
) {
  const propositionId = readMetadataString(input.metadata, 'propositionId')
  const marketId = readMetadataString(input.metadata, 'marketId')
  const userId = readMetadataString(input.metadata, 'userId')
  const responseId = readMetadataString(input.metadata, 'responseId')
  const resolvedMarketId = marketId ?? input.entityId
  const takeoverLink = {
    label: opsCopy.shared.openTakeover,
    to: buildTakeoverRoute({
      propositionId,
      marketId: resolvedMarketId,
      userId,
    }),
  }

  switch (input.entityType) {
    case 'proposition':
      return {
        label: opsCopy.shared.openProposition,
        to: `/zh/ops/propositions/${encodeURIComponent(input.entityId)}`,
      }
    case 'validation_proposition':
    case 'validation_chain_command': {
      const resolvedPropositionId = propositionId ?? input.entityId
      return {
        label: opsCopy.shared.openProposition,
        to: `/zh/ops/propositions/${encodeURIComponent(resolvedPropositionId)}`,
      }
    }
    case 'reward_ledger':
      return {
        label: opsCopy.shared.openReward,
        to: `/zh/ops/rewards?ledgerId=${encodeURIComponent(input.entityId)}`,
      }
    case 'response':
    case 'response_review': {
      const resolvedResponseId = responseId ?? input.entityId
      return {
        label: opsCopy.shared.openResponse,
        to: `/zh/ops/responses?responseId=${encodeURIComponent(resolvedResponseId)}`,
      }
    }
    case 'respondent':
    case 'user_reputation':
    case 'respondent_tag':
      return {
        label: opsCopy.shared.openRespondent,
        to: buildRespondentRoute(input.entityId),
      }
    case 'market':
    case 'validation_market':
      return takeoverLink
    case 'validation_chain_stream':
    case 'validation_chain_event':
      if (marketId) {
        return takeoverLink
      }
      if (propositionId) {
        return {
          label: opsCopy.shared.openProposition,
          to: `/zh/ops/propositions/${encodeURIComponent(propositionId)}`,
        }
      }
      return {
        label: opsCopy.shared.openHealth,
        to: '/zh/ops/health',
      }
    case 'runtime_contract':
      return {
        label: opsCopy.shared.openHealth,
        to: '/zh/ops/health',
      }
    default:
      if (marketId) {
        return takeoverLink
      }
      if (propositionId) {
        return {
          label: opsCopy.shared.openProposition,
          to: `/zh/ops/propositions/${encodeURIComponent(propositionId)}`,
        }
      }
      if (userId) {
        return {
          label: opsCopy.shared.openRespondent,
          to: buildRespondentRoute(userId),
        }
      }
      return null
  }
}

export function buildAuditEventWorkspaceLink(item: InternalAuditEventViewModel) {
  return buildOpsWorkspaceLink(item)
}

function formatCommandGroupLabel(group: string): string {
  switch (group) {
    case 'e2eOrSmoke':
      return 'e2e / smoke'
    case 'validationLocalPrepare':
      return 'validation local prepare'
    case 'databaseMigrate':
      return 'database migrate'
    default:
      return group.replace(/([A-Z])/g, ' $1').trim()
  }
}
