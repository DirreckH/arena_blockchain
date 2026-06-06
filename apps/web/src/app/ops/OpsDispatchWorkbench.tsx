import { type ComponentType, useState } from 'react'
import { Link } from 'react-router-dom'
import { arenaApi } from '../../features/api/arena-api'
import type {
  OpsDispatchPreviewViewModel,
  PropositionDispatchSummaryViewModel,
} from '../../features/arena/internal-ops.types'
import { fmtDate } from '../../features/arena/ops-format'
import { opsCopy } from '../../features/arena/ops-copy'

type Feedback = {
  tone: 'success' | 'error'
  message: string
  receipt?: string[] | null
}

type DispatchWorkbenchDraft = {
  userIds: string
  assignedAt: string
  expiresAt: string
  maxAssignments: string
}

type DispatchPayload =
  | {
      userIds: string[]
      assignedAt: string
      expiresAt?: string
      maxAssignments?: number
    }
  | { message: string }

type OpsDispatchWorkbenchProps = {
  propositionId: string
  token: string
  dispatchSummary: PropositionDispatchSummaryViewModel
  onCompleted: () => void
  buildRespondentRoute: (userId: string) => string
  FeedbackComponent: ComponentType<{ feedback: Feedback | null }>
  InlineMetricComponent: ComponentType<{ label: string; value: string }>
}

export function OpsDispatchWorkbench({
  propositionId,
  token,
  dispatchSummary,
  onCompleted,
  buildRespondentRoute,
  FeedbackComponent,
  InlineMetricComponent,
}: OpsDispatchWorkbenchProps) {
  const [draft, setDraft] = useState<DispatchWorkbenchDraft>(() => createDispatchWorkbenchDraft())
  const [preview, setPreview] = useState<OpsDispatchPreviewViewModel | null>(null)
  const [busyMode, setBusyMode] = useState<'preview' | 'create' | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  function updateDraft(patch: Partial<DispatchWorkbenchDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setPreview(null)
    setFeedback(null)
  }

  async function previewDispatch() {
    const payload = buildDispatchPayload(draft, false)
    if ('message' in payload) {
      setFeedback({ tone: 'error', message: payload.message })
      return
    }

    setBusyMode('preview')
    setFeedback(null)
    try {
      const result = await arenaApi.previewOpsDispatchCandidates(propositionId, payload, token)
      setPreview(result)
      setFeedback({
        tone: 'success',
        message: opsCopy.dispatch.previewReady(result.selectedUserIds.length),
      })
    } catch (error) {
      setFeedback({ tone: 'error', message: String((error as Error).message ?? error) })
    } finally {
      setBusyMode(null)
    }
  }

  async function createDispatch() {
    const payload = buildDispatchPayload(draft, true)
    if ('message' in payload) {
      setFeedback({ tone: 'error', message: payload.message })
      return
    }
    if (!payload.expiresAt) {
      setFeedback({ tone: 'error', message: opsCopy.dispatch.errorExpiresAtRequired })
      return
    }

    setBusyMode('create')
    setFeedback(null)
    try {
      const result = await arenaApi.createOpsDispatchTasks(
        propositionId,
        {
          userIds: payload.userIds,
          assignedAt: payload.assignedAt,
          expiresAt: payload.expiresAt,
          maxAssignments: payload.maxAssignments,
        },
        token,
      )
      setPreview(null)
      setFeedback({
        tone: 'success',
        message: opsCopy.dispatch.created(result.length),
        receipt: result.slice(0, 3).map((item) => `${item.userId} / ${item.status}`),
      })
      onCompleted()
    } catch (error) {
      setFeedback({ tone: 'error', message: String((error as Error).message ?? error) })
    } finally {
      setBusyMode(null)
    }
  }

  return (
    <section className="detail-panel">
      <div className="ops-section">
        <div className="ops-section-head">
          <p className="ops-section-title">{opsCopy.dispatch.title}</p>
          <span className="ops-muted">
            {opsCopy.dispatch.summary(dispatchSummary.assignedCount, dispatchSummary.submittedCount)}
          </span>
        </div>
        <div className="ops-card-grid ops-card-grid-compact">
          <InlineMetricComponent label={opsCopy.dispatch.metricActiveTasks} value={String(dispatchSummary.assignedCount + dispatchSummary.startedCount)} />
          <InlineMetricComponent label={opsCopy.dispatch.metricUniqueRespondents} value={String(dispatchSummary.uniqueAssignedUsers)} />
          <InlineMetricComponent label={opsCopy.dispatch.metricExpired} value={String(dispatchSummary.expiredCount)} />
          <InlineMetricComponent label={opsCopy.dispatch.metricLastAssigned} value={fmtDate(dispatchSummary.lastAssignedAt)} />
        </div>
        <div className="ops-form-grid" style={{ marginTop: 16 }}>
          <label className="ops-form-block">
            <span>{opsCopy.dispatch.candidateUserIds}</span>
            <textarea
              aria-label={opsCopy.dispatch.candidateUserIds}
              className="ops-textarea"
              onChange={(event) => updateDraft({ userIds: event.target.value })}
              placeholder="respondent_1&#10;respondent_2"
              value={draft.userIds}
            />
          </label>
          <div className="ops-panel-stack">
            <div className="ops-filter-row">
              <label>
                <span>{opsCopy.dispatch.assignedAt}</span>
                <input
                  aria-label={opsCopy.dispatch.assignedAt}
                  onChange={(event) => updateDraft({ assignedAt: event.target.value })}
                  type="datetime-local"
                  value={draft.assignedAt}
                />
              </label>
              <label>
                <span>{opsCopy.dispatch.expiresAt}</span>
                <input
                  aria-label={opsCopy.dispatch.expiresAt}
                  onChange={(event) => updateDraft({ expiresAt: event.target.value })}
                  type="datetime-local"
                  value={draft.expiresAt}
                />
              </label>
              <label>
                <span>{opsCopy.dispatch.maxAssignments}</span>
                <input
                  aria-label={opsCopy.dispatch.maxAssignments}
                  min={1}
                  onChange={(event) => updateDraft({ maxAssignments: event.target.value })}
                  type="number"
                  value={draft.maxAssignments}
                />
              </label>
            </div>
            <div className="ops-actions">
              <button className="ops-btn ops-btn-ghost" disabled={busyMode !== null} onClick={() => void previewDispatch()} type="button">
                {opsCopy.dispatch.previewDispatch}
              </button>
              <button className="ops-btn ops-btn-primary" disabled={busyMode !== null} onClick={() => void createDispatch()} type="button">
                {opsCopy.dispatch.createDispatch}
              </button>
            </div>
          </div>
        </div>
        <FeedbackComponent feedback={feedback} />
        {preview ? (
          <div className="ops-list-stack" style={{ marginTop: 16 }}>
            <div className="ops-list-card">
              <div className="ops-kv-grid">
                <span className="ops-kv-label">{opsCopy.dispatch.previewKv.ruleVersion}</span><span>{preview.ruleVersion}</span>
                <span className="ops-kv-label">{opsCopy.dispatch.previewKv.maxAssignments}</span><span>{preview.maxAssignments}</span>
                <span className="ops-kv-label">{opsCopy.dispatch.previewKv.generalReserve}</span><span>{preview.generalReserveCount}</span>
                <span className="ops-kv-label">{opsCopy.dispatch.previewKv.selectedUsers}</span><span>{preview.selectedUserIds.join(', ') || opsCopy.dispatch.selectedNone}</span>
              </div>
            </div>
            <div className="ops-table-scroll">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>{opsCopy.dispatch.previewHead.user}</th>
                    <th>{opsCopy.dispatch.previewHead.eligible}</th>
                    <th>{opsCopy.dispatch.previewHead.selected}</th>
                    <th>{opsCopy.dispatch.previewHead.priority}</th>
                    <th>{opsCopy.dispatch.previewHead.score}</th>
                    <th>{opsCopy.dispatch.previewHead.blockReason}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.candidates.map((candidate) => (
                    <tr key={candidate.userId}>
                      <td>
                        <Link to={buildRespondentRoute(candidate.userId)}>
                          {candidate.userId}
                        </Link>
                      </td>
                      <td>{candidate.eligible ? opsCopy.dispatch.yes : opsCopy.dispatch.no}</td>
                      <td>{candidate.selected ? opsCopy.dispatch.yes : opsCopy.dispatch.no}</td>
                      <td>{candidate.priorityBucket}</td>
                      <td>{candidate.finalScore ?? '-'}</td>
                      <td>{candidate.blockReason ?? candidate.reasons.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function createDispatchWorkbenchDraft(): DispatchWorkbenchDraft {
  const assignedAt = formatDateTimeLocalValue(new Date())
  const expiresAt = formatDateTimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000))
  return {
    userIds: '',
    assignedAt,
    expiresAt,
    maxAssignments: '1',
  }
}

function buildDispatchPayload(
  draft: DispatchWorkbenchDraft,
  includeExpiry: boolean,
): DispatchPayload {
  const userIds = parseUserIds(draft.userIds)
  if (userIds.length === 0) {
    return { message: opsCopy.dispatch.errorNoUserIds }
  }

  const assignedAt = parseDateTimeLocalValue(draft.assignedAt)
  if (!assignedAt) {
    return { message: opsCopy.dispatch.errorAssignedAtRequired }
  }

  const maxAssignments = parseOptionalPositiveInteger(draft.maxAssignments)
  if (draft.maxAssignments.trim() && maxAssignments === null) {
    return { message: opsCopy.dispatch.errorMaxAssignments }
  }

  if (!includeExpiry) {
    return {
      userIds,
      assignedAt,
      maxAssignments: maxAssignments ?? undefined,
    }
  }

  const expiresAt = parseDateTimeLocalValue(draft.expiresAt)
  if (!expiresAt) {
    return { message: opsCopy.dispatch.errorExpiresAtRequired }
  }

  return {
    userIds,
    assignedAt,
    expiresAt,
    maxAssignments: maxAssignments ?? undefined,
  }
}

function formatDateTimeLocalValue(value: Date): string {
  return value.toISOString().slice(0, 16)
}

function parseDateTimeLocalValue(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00.000Z`
    : null
}

function parseUserIds(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  ))
}

function parseOptionalPositiveInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number.parseInt(trimmed, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
