import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import type {
  QualityAnomalyMonitoringItemViewModel,
  SampleShortageMonitoringItemViewModel,
  ValidationLifecycleDriftMonitoringItemViewModel,
} from '../../features/arena/internal-ops.types'
import { opsCopy } from '../../features/arena/ops-copy'
import { statusLabel } from '../../features/arena/ops-status-labels'
import { formatHealthPercent } from './ops-health-trends'

export type HealthAttentionSeverity = 'critical' | 'high' | 'medium'

export type PersistedHealthAttentionState = Record<string, { lastSeenAt?: string; handledAt?: string }>

export type HealthAttentionItem = {
  key: string
  href: string
  label: string
  summary: string
  severity: HealthAttentionSeverity
  unread: boolean
  handled: boolean
}

const OPS_HEALTH_ATTENTION_STORAGE_KEY = 'arena.ops.healthAttentionState'

export function OpsHealthAttentionInbox({
  attentionItems,
  unreadAttentionCount,
  criticalUnreadAttentionCount,
  handledAttentionCount,
  onMarkRead,
  onMarkHandled,
  EmptyComponent,
}: {
  attentionItems: HealthAttentionItem[]
  unreadAttentionCount: number
  criticalUnreadAttentionCount: number
  handledAttentionCount: number
  onMarkRead: (key: string, nextRead: boolean) => void
  onMarkHandled: (key: string, nextHandled: boolean) => void
  EmptyComponent: ComponentType<{ message: string }>
}) {
  return (
    <aside className="detail-side-panel ops-side-panel">
      <div className="ops-section">
        <div className="ops-section-head">
          <p className="ops-section-title">{opsCopy.attention.title}</p>
          <div className="ops-inline-meta">
            <span className={`ops-badge ${attentionSeverityBadgeClass('critical')}`}>{opsCopy.attention.criticalUnread(criticalUnreadAttentionCount)}</span>
            <span className="ops-badge ops-badge-yellow">{opsCopy.attention.unread(unreadAttentionCount)}</span>
            <span className="ops-badge ops-badge-green">{opsCopy.attention.handled(handledAttentionCount)}</span>
          </div>
        </div>
        <p className="ops-muted">
          {opsCopy.attention.intro}
        </p>
        {attentionItems.length === 0 ? <EmptyComponent message={opsCopy.attention.empty} /> : null}
        {attentionItems.length > 0 ? (
          <div className="ops-list-stack">
            {attentionItems.slice(0, 8).map((item) => (
              <div className="ops-list-card" key={item.key}>
                <div className="ops-list-row">
                  <strong>{item.label}</strong>
                  <div className="ops-inline-meta">
                    <span className={`ops-badge ${attentionSeverityBadgeClass(item.severity)}`}>{statusLabel('severity', item.severity)}</span>
                    <span className={`ops-badge ${item.handled ? 'ops-badge-green' : item.unread ? 'ops-badge-yellow' : 'ops-badge-blue'}`}>
                      {item.handled ? opsCopy.attention.statusHandled : item.unread ? opsCopy.attention.statusUnread : opsCopy.attention.statusRead}
                    </span>
                  </div>
                </div>
                <p className="ops-muted">{item.summary}</p>
                <div className="ops-actions">
                  <Link
                    className="ops-btn ops-btn-ghost"
                    onClick={() => onMarkRead(item.key, true)}
                    to={item.href}
                  >
                    {opsCopy.attention.openWorkspace}
                  </Link>
                  <button className="ops-btn ops-btn-ghost" onClick={() => onMarkRead(item.key, item.unread)} type="button">
                    {item.unread ? opsCopy.attention.markRead : opsCopy.attention.markUnread}
                  </button>
                  <button
                    className={item.handled ? 'ops-btn ops-btn-ghost' : 'ops-btn ops-btn-primary'}
                    onClick={() => onMarkHandled(item.key, !item.handled)}
                    type="button"
                  >
                    {item.handled ? opsCopy.attention.markUnresolved : opsCopy.attention.markHandled}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  )
}

export function buildAnomalyAttentionItem(
  item: QualityAnomalyMonitoringItemViewModel,
  state: PersistedHealthAttentionState[string] | undefined,
): HealthAttentionItem {
  return {
    key: item.propositionId,
    href: `/zh/ops/propositions/${item.propositionId}`,
    label: opsCopy.attention.anomalyLabel(item.title),
    summary: opsCopy.attention.anomalySummary(formatHealthPercent(item.anomalyRate), formatHealthPercent(item.invalidRate), item.riskyRespondentCount),
    severity: item.anomalyRate >= 0.35 || item.fraudSuspectedCount > 0
      ? 'critical'
      : item.anomalyRate >= 0.2 || item.flaggedCount >= 2
        ? 'high'
        : 'medium',
    unread: !state?.lastSeenAt,
    handled: !!state?.handledAt,
  }
}

export function buildShortageAttentionItem(
  item: SampleShortageMonitoringItemViewModel,
  state: PersistedHealthAttentionState[string] | undefined,
): HealthAttentionItem {
  return {
    key: `shortage:${item.propositionId}`,
    href: `/zh/ops/propositions/${item.propositionId}`,
    label: opsCopy.attention.shortageLabel(item.title),
    summary: opsCopy.attention.shortageSummary(item.effectiveSampleCount, item.minEffectiveSample, item.shortageCount, item.nearingDeadline ? opsCopy.attention.deadlineNearing : opsCopy.attention.timeBuffer),
    severity: item.nearingDeadline && item.shortageCount >= 3
      ? 'critical'
      : item.nearingDeadline || item.shortageCount >= 3
        ? 'high'
        : 'medium',
    unread: !state?.lastSeenAt,
    handled: !!state?.handledAt,
  }
}

export function buildDriftAttentionItem(
  item: ValidationLifecycleDriftMonitoringItemViewModel,
  state: PersistedHealthAttentionState[string] | undefined,
): HealthAttentionItem {
  return {
    key: `drift:${item.propositionId}:${item.driftReason}`,
    href: `/zh/ops/takeover?propositionId=${item.propositionId}${item.marketId ? `&marketId=${item.marketId}` : ''}`,
    label: opsCopy.attention.driftLabel(item.title),
    summary: opsCopy.attention.driftSummary(item.driftReason, item.marketStatus ? statusLabel('market', item.marketStatus) : '无', item.chainStatus ? statusLabel('chainMarket', item.chainStatus) : '无'),
    severity: item.propositionStatus === 'settled' || item.marketStatus === 'settled' || item.chainStatus === 'resolved'
      ? 'critical'
      : item.propositionStatus === 'live' || item.marketStatus === 'live'
        ? 'high'
        : 'medium',
    unread: !state?.lastSeenAt,
    handled: !!state?.handledAt,
  }
}

export function readPersistedHealthAttentionState(): PersistedHealthAttentionState {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(OPS_HEALTH_ATTENTION_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as PersistedHealthAttentionState
      : {}
  } catch {
    return {}
  }
}

export function persistHealthAttentionState(state: PersistedHealthAttentionState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(OPS_HEALTH_ATTENTION_STORAGE_KEY, JSON.stringify(state))
}

export function attentionSeverityRank(value: HealthAttentionSeverity): number {
  switch (value) {
    case 'critical':
      return 3
    case 'high':
      return 2
    default:
      return 1
  }
}

function attentionSeverityBadgeClass(value: HealthAttentionSeverity): string {
  switch (value) {
    case 'critical':
      return 'ops-badge-red'
    case 'high':
      return 'ops-badge-yellow'
    default:
      return 'ops-badge-blue'
  }
}
