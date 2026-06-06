import { hasAnySystemRole, SystemRole } from '@arena/shared'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { arenaApi } from '../../features/api/arena-api'
import {
  useOpsProposition,
  useOpsResponseQueue,
} from '../../features/arena/ops-console-data'
import { useAuthSession } from '../../features/auth/auth-session'
import type {
  InternalPropositionEvidenceBundleViewModel,
  PropositionDispatchSummaryViewModel,
  PropositionValidationRehearsalCheckpointViewModel,
  PropositionValidationRehearsalStepId,
  PropositionValidationRehearsalStepStatus,
} from '../../features/arena/internal-ops.types'
import { fmtBadgeClass, fmtDate } from '../../features/arena/ops-format'
import { opsCopy } from '../../features/arena/ops-copy'
import { statusLabel } from '../../features/arena/ops-status-labels'
import { OpsConfirmDialog } from '../OpsConfirmDialog'
import { useOpsActionDialog } from './ops-action-dialog'
import { OpsDispatchWorkbench as StandaloneOpsDispatchWorkbench } from './OpsDispatchWorkbench'
import type { Feedback } from './ops-shared'
import {
  buildRespondentRoute,
  OpsAuditList,
  OpsCommandSequence,
  OpsEmpty,
  OpsError,
  OpsFeedback,
  OpsInlineMetric,
  OpsLoading,
  OpsNotFoundDetail,
  OpsStringList,
} from './ops-shared-ui'

type RehearsalCheckpointDraft = {
  stepId: PropositionValidationRehearsalStepId
  status: PropositionValidationRehearsalStepStatus
  reason: string
  note: string
  evidence: string
  txHash: string
  blockNumber: string
}

const REHEARSAL_STEP_OPTIONS: PropositionValidationRehearsalStepId[] = [
  'preflight',
  'publish_and_open',
  'local_bet_and_sync',
  'freeze_and_resolve',
  'projection_and_settlement',
]

const REHEARSAL_STATUS_OPTIONS: PropositionValidationRehearsalStepStatus[] = [
  'pending',
  'complete',
  'blocked',
]

type OpsPropositionDetailPageProps = {
  propositionId: string
  token: string
}

export function OpsPropositionDetailPage({
  propositionId,
  token,
}: OpsPropositionDetailPageProps) {
  const { identity } = useAuthSession()
  const canRunEmergencyFreeze = identity
    ? hasAnySystemRole(identity.roles, [SystemRole.Admin, SystemRole.System])
    : false
  const detail = useOpsProposition(token, propositionId)
  const responseQueue = useOpsResponseQueue(token, {
    propositionId,
    reviewStatus: 'pending_review',
    limit: 8,
  })
  const [actions, pendingAction, busy, feedback, setPendingAction, confirmAction] = useOpsActionDialog()
  const [evidenceBundlePreview, setEvidenceBundlePreview] = useState<InternalPropositionEvidenceBundleViewModel | null>(null)
  const [evidencePreviewBusy, setEvidencePreviewBusy] = useState(false)
  const [evidencePreviewError, setEvidencePreviewError] = useState<string | null>(null)

  function refreshAll() {
    detail.refresh()
    responseQueue.refresh()
  }

  function queueAction(kind: 'approve' | 'reject' | 'freeze', title: string) {
    const defaultReason = kind === 'approve'
      ? 'ops_approved'
      : kind === 'reject'
        ? 'ops_rejected'
        : 'ops_emergency_freeze'
    setPendingAction({
      title,
      description: opsCopy.propositionDetail.propositionIdLabel(propositionId),
      danger: kind !== 'approve',
      withNote: true,
      withReason: true,
      requireReason: true,
      reasonLabel: opsCopy.propositionDetail.decisionReasonLabel,
      reasonPlaceholder: defaultReason,
      reasonDefaultValue: defaultReason,
      successMessage: opsCopy.propositionDetail.dialogCompleted(title),
      run: async ({ note, reason }) => {
        const now = new Date().toISOString()
        let result: unknown
        if (kind === 'approve') {
          result = await arenaApi.approveOpsProposition(
            propositionId,
            { publishedAt: now, reason, note: note || undefined },
            token,
          )
        } else if (kind === 'reject') {
          result = await arenaApi.rejectOpsProposition(
            propositionId,
            { rejectedAt: now, reason, note: note || undefined },
            token,
          )
        } else {
          result = await arenaApi.emergencyFreezeOpsProposition(
            propositionId,
            { frozenAt: now, reason, note: note || undefined },
            token,
          )
        }
        refreshAll()
        return result
      },
    })
  }

  async function downloadExport(kind: 'export-json' | 'export-csv' | 'bundle-json' | 'checkpoints-json' | 'checkpoints-csv') {
    if (kind === 'export-json') {
      const exportData = await arenaApi.getOpsPropositionExport(propositionId, token)
      downloadJson(`ops-proposition-${propositionId}-export.json`, exportData)
      return
    }
    if (kind === 'export-csv') {
      const exportData = await arenaApi.getOpsPropositionExport(propositionId, token)
      downloadCsv(
        `ops-proposition-${propositionId}-export.csv`,
        ['propositionId', 'title', 'submissionStatus', 'propositionStatus', 'marketStatus', 'effectiveSampleCount', 'pendingReviewCount', 'rewardEntryCount', 'driftReason', 'exportedAt'],
        [[
          exportData.proposition.id,
          exportData.proposition.title,
          exportData.submission.status,
          exportData.proposition.status,
          exportData.market?.status ?? '',
          exportData.sampleCounter.effectiveSampleCount,
          exportData.reviewSummary.pendingCount,
          exportData.rewardSummary.totalEntries,
          exportData.validationLifecycle.driftReason ?? '',
          exportData.exportedAt,
        ]],
      )
      return
    }
    if (kind === 'bundle-json') {
      const bundle = await arenaApi.getOpsPropositionEvidenceBundle(propositionId, token)
      downloadJson(`ops-proposition-${propositionId}-evidence-bundle.json`, bundle)
      return
    }
    const checkpoints = await arenaApi.getOpsPropositionRehearsalCheckpoints(propositionId, token)
    if (kind === 'checkpoints-json') {
      downloadJson(`ops-proposition-${propositionId}-rehearsal-checkpoints.json`, checkpoints)
      return
    }
    downloadCsv(
      `ops-proposition-${propositionId}-rehearsal-checkpoints.csv`,
      ['stepId', 'status', 'reason', 'recordedAt', 'recordedByUserId', 'txHash', 'blockNumber'],
      checkpoints.map((item) => [
        item.stepId,
        item.status,
        item.reason,
        item.recordedAt,
        item.recordedByUserId,
        item.txHash ?? '',
        item.blockNumber ?? '',
      ]),
    )
  }

  async function previewEvidenceBundle() {
    setEvidencePreviewBusy(true)
    setEvidencePreviewError(null)
    try {
      const bundle = await arenaApi.getOpsPropositionEvidenceBundle(propositionId, token)
      setEvidenceBundlePreview(bundle)
    } catch (error) {
      setEvidencePreviewError(String((error as Error).message ?? error))
    } finally {
      setEvidencePreviewBusy(false)
    }
  }

  if (detail.state.status === 'loading' || detail.state.status === 'idle') {
    return <OpsLoading />
  }

  if (detail.state.status === 'error') {
    return detail.state.kind === 'not_found'
      ? <OpsNotFoundDetail message={opsCopy.propositionDetail.notFound} />
      : <OpsError kind={detail.state.kind} message={detail.state.message} onRetry={detail.refresh} statusCode={detail.state.statusCode} />
  }

  const data = detail.state.data
  const latestRewardEvent = data.rewardAuditEvents[0] ?? null

  function downloadReadableReport() {
    downloadText(
      `ops-proposition-${propositionId}-report.md`,
      buildPropositionReadableReport(data),
      'text/markdown;charset=utf-8',
    )
  }

  return (
    <>
      <div className="detail-layout">
        <div className="detail-main-stack">
          <section className="detail-panel">
            <div className="ops-list-row">
              <div>
                <h2>{data.proposition.title}</h2>
                <p className="ops-muted">{data.proposition.description}</p>
              </div>
              <div className="ops-inline-meta">
                <span className={`ops-badge ${fmtBadgeClass(data.submission.status)}`}>{statusLabel('submission', data.submission.status)}</span>
                <span className={`ops-badge ${fmtBadgeClass(data.proposition.status)}`}>{statusLabel('proposition', data.proposition.status)}</span>
              </div>
            </div>
            <div className="ops-actions">
              <button className="ops-btn ops-btn-primary" onClick={() => queueAction('approve', opsCopy.propositionDetail.dialogTitles.approve)} type="button">{opsCopy.propositionDetail.actions.approve}</button>
              <button className="ops-btn ops-btn-ghost" onClick={() => queueAction('reject', opsCopy.propositionDetail.dialogTitles.reject)} type="button">{opsCopy.propositionDetail.actions.reject}</button>
              {canRunEmergencyFreeze ? (
                <button className="ops-btn ops-btn-danger" onClick={() => queueAction('freeze', opsCopy.propositionDetail.dialogTitles.freeze)} type="button">{opsCopy.propositionDetail.actions.freeze}</button>
              ) : null}
              <button className="ops-refresh-btn" onClick={refreshAll} type="button">{opsCopy.actions.refresh}</button>
            </div>
            <OpsFeedback feedback={feedback} />
          </section>

          <section className="detail-panel">
            <div className="ops-section">
              <p className="ops-section-title">{opsCopy.propositionDetail.lifecycle.title}</p>
              <div className="ops-kv-grid">
                <span className="ops-kv-label">{opsCopy.propositionDetail.lifecycle.category}</span><span>{data.proposition.category}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.lifecycle.createdAt}</span><span>{fmtDate(data.proposition.createdAt)}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.lifecycle.publishedAt}</span><span>{fmtDate(data.proposition.publishedAt)}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.lifecycle.liveAt}</span><span>{fmtDate(data.proposition.liveAt)}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.lifecycle.frozenAt}</span><span>{fmtDate(data.proposition.frozenAt)}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.lifecycle.settledAt}</span><span>{fmtDate(data.proposition.settledAt)}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.lifecycle.marketEnabled}</span><span>{data.proposition.marketEnabled ? opsCopy.propositionDetail.marketEnabledOn : opsCopy.propositionDetail.marketEnabledOff}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.lifecycle.submissionNote}</span><span>{data.submission.submissionNote ?? opsCopy.propositionDetail.none}</span>
              </div>
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-card-grid ops-card-grid-compact">
              <OpsInlineMetric label={opsCopy.propositionDetail.metrics.effectiveSample} value={`${data.sampleCounter.effectiveSampleCount}/${data.proposition.minEffectiveSample}`} />
              <OpsInlineMetric label={opsCopy.propositionDetail.metrics.pendingReview} value={String(data.reviewSummary.pendingCount)} />
              <OpsInlineMetric label={opsCopy.propositionDetail.metrics.finalizedReviews} value={String(data.reviewSummary.finalizedCount)} />
              <OpsInlineMetric label={opsCopy.propositionDetail.metrics.rewardEntries} value={String(data.rewardSummary.totalEntries)} />
            </div>
            <div className="ops-kv-grid" style={{ marginTop: 16 }}>
              <span className="ops-kv-label">{opsCopy.propositionDetail.stats.closureReadiness}</span><span>{data.closureReadiness.triggerReason}</span>
              <span className="ops-kv-label">{opsCopy.propositionDetail.stats.dispatchCoverage}</span><span>{data.dispatchSummary.submittedCount}/{data.dispatchSummary.totalTasks}</span>
              <span className="ops-kv-label">{opsCopy.propositionDetail.stats.revealSettlement}</span><span>{statusLabel('market', data.revealSettlement.marketStatus) === '—' ? opsCopy.propositionDetail.pending : statusLabel('market', data.revealSettlement.marketStatus)}</span>
              <span className="ops-kv-label">{opsCopy.propositionDetail.stats.resultKind}</span><span>{data.revealSettlement.resultKind ?? opsCopy.propositionDetail.pending}</span>
              <span className="ops-kv-label">{opsCopy.propositionDetail.stats.reviewInvalidRate}</span><span>{(data.reviewSummary.invalidRate * 100).toFixed(1)}%</span>
              <span className="ops-kv-label">{opsCopy.propositionDetail.stats.reviewAnomalyRate}</span><span>{(data.reviewSummary.anomalyRate * 100).toFixed(1)}%</span>
            </div>
          </section>

          <StandaloneOpsDispatchWorkbench
            FeedbackComponent={OpsFeedback}
            InlineMetricComponent={OpsInlineMetric}
            buildRespondentRoute={buildRespondentRoute}
            dispatchSummary={data.dispatchSummary}
            onCompleted={refreshAll}
            propositionId={propositionId}
            token={token}
          />

          <section className="detail-panel">
            <div className="ops-section">
              <p className="ops-section-title">{opsCopy.propositionDetail.validationChain.title}</p>
              <div className="ops-kv-grid">
                <span className="ops-kv-label">{opsCopy.propositionDetail.validationChain.driftReason}</span><span>{data.validationLifecycle.driftReason ?? opsCopy.propositionDetail.none}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.validationChain.chainState}</span><span>{data.validationLifecycle.onChainState ?? opsCopy.propositionDetail.unset}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.validationChain.marketStatus}</span><span>{data.validationLifecycle.marketStatus ?? opsCopy.propositionDetail.none}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.validationChain.operatorSummary}</span><span>{data.validationOperatorSummary.summary}</span>
              </div>
              <OpsCommandSequence title={opsCopy.propositionDetail.validationChain.driftGuidance} items={data.validationLifecycle.operatorGuidance?.operatorActions ?? []} />
              <OpsCommandSequence title={opsCopy.propositionDetail.validationChain.plannedCommands} items={data.validationOperatorSummary.plannedCommands} />
              <OpsCommandSequence title={opsCopy.propositionDetail.validationChain.operatorActions} items={data.validationOperatorSummary.operatorActions} />
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section">
              <p className="ops-section-title">{opsCopy.propositionDetail.rehearsal.title}</p>
              <div className="ops-kv-grid">
                <span className="ops-kv-label">{opsCopy.propositionDetail.rehearsal.status}</span><span>{statusLabel('rehearsalStatus', data.validationRehearsal.status)}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.rehearsal.targetOutcome}</span><span>{data.validationRehearsal.targetOutcome}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.rehearsal.runbook}</span><span>{data.validationRehearsal.runbookPath}</span>
                <span className="ops-kv-label">{opsCopy.propositionDetail.rehearsal.latestCheckpoint}</span><span>{fmtDate(data.validationRehearsal.summary.latestCheckpointAt)}</span>
              </div>
              <OpsStringList title={opsCopy.propositionDetail.rehearsal.nextCommands} items={data.validationRehearsal.summary.nextCommands} />
              <OpsStringList title={opsCopy.propositionDetail.rehearsal.blockingReasons} items={data.validationRehearsal.summary.blockingReasons} />
              <div className="ops-list-stack">
                {data.validationRehearsal.steps.map((step) => (
                  <div className="ops-list-card" key={step.id}>
                    <div className="ops-list-row">
                      <strong>{statusLabel('rehearsalStep', step.id)}</strong>
                      <span className={`ops-badge ${fmtBadgeClass(step.status)}`}>{statusLabel('rehearsalStatus', step.status)}</span>
                    </div>
                    <p className="ops-muted">{step.summary}</p>
                    <OpsStringList title={opsCopy.propositionDetail.rehearsal.commands} items={step.commands} />
                    <OpsStringList title={opsCopy.propositionDetail.rehearsal.evidence} items={step.evidence} />
                  </div>
                ))}
              </div>
              <OpsRehearsalCheckpointForm
                checkpoints={data.validationRehearsalCheckpoints}
                onCompleted={refreshAll}
                propositionId={propositionId}
                token={token}
              />
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section">
              <div className="ops-section-head">
                <p className="ops-section-title">{opsCopy.propositionDetail.evidence.title}</p>
                <div className="ops-actions">
                  <button className="ops-btn ops-btn-ghost" onClick={() => void downloadExport('export-json')} type="button">{opsCopy.propositionDetail.evidence.exportJson}</button>
                  <button className="ops-btn ops-btn-ghost" onClick={() => void downloadExport('export-csv')} type="button">{opsCopy.propositionDetail.evidence.exportCsv}</button>
                  <button className="ops-btn ops-btn-ghost" onClick={() => downloadReadableReport()} type="button">{opsCopy.propositionDetail.evidence.downloadReport}</button>
                  <button className="ops-btn ops-btn-ghost" onClick={() => void downloadExport('bundle-json')} type="button">{opsCopy.propositionDetail.evidence.downloadBundleJson}</button>
                  <button className="ops-btn ops-btn-ghost" disabled={evidencePreviewBusy} onClick={() => void previewEvidenceBundle()} type="button">{opsCopy.propositionDetail.evidence.previewBundle}</button>
                  <button className="ops-btn ops-btn-ghost" onClick={() => void downloadExport('checkpoints-json')} type="button">{opsCopy.propositionDetail.evidence.downloadCheckpointsJson}</button>
                  <button className="ops-btn ops-btn-ghost" onClick={() => void downloadExport('checkpoints-csv')} type="button">{opsCopy.propositionDetail.evidence.downloadCheckpointsCsv}</button>
                </div>
              </div>
              <OpsAuditList
                emptyMessage={opsCopy.propositionDetail.evidence.auditTimelineEmpty}
                items={data.auditEvents.slice(0, 6)}
                title={opsCopy.propositionDetail.evidence.auditTimeline}
              />
              <OpsAuditList
                emptyMessage={opsCopy.propositionDetail.evidence.rewardAuditEmpty}
                items={data.rewardAuditEvents.slice(0, 4)}
                title={opsCopy.propositionDetail.evidence.rewardAudit}
              />
              <OpsAuditList
                emptyMessage={opsCopy.propositionDetail.evidence.chainActivityEmpty}
                items={data.validationChainActivity.timeline.slice(0, 6)}
                title={opsCopy.propositionDetail.evidence.chainActivity}
              />
              {evidencePreviewBusy ? <OpsLoading /> : null}
              {evidencePreviewError ? <OpsError message={evidencePreviewError} /> : null}
              {evidenceBundlePreview ? (
                <div className="ops-list-card">
                  <div className="ops-list-row">
                    <strong>{opsCopy.propositionDetail.evidence.bundlePreview}</strong>
                    <span className="ops-muted">{fmtDate(evidenceBundlePreview.exportedAt)}</span>
                  </div>
                  <div className="ops-kv-grid">
                    <span className="ops-kv-label">{opsCopy.propositionDetail.evidence.bundleKv.proposition}</span><span>{evidenceBundlePreview.propositionId}</span>
                    <span className="ops-kv-label">{opsCopy.propositionDetail.evidence.bundleKv.runtimeReadiness}</span><span>{evidenceBundlePreview.runtimeContract.releaseReadiness.status}</span>
                    <span className="ops-kv-label">{opsCopy.propositionDetail.evidence.bundleKv.runtimeBlockers}</span><span>{evidenceBundlePreview.runtimeContract.releaseReadiness.blockingDependencies.length}</span>
                    <span className="ops-kv-label">{opsCopy.propositionDetail.evidence.bundleKv.validationSync}</span><span>{evidenceBundlePreview.validationChainHealth?.syncStatus ?? opsCopy.propositionDetail.none}</span>
                    <span className="ops-kv-label">{opsCopy.propositionDetail.evidence.bundleKv.validationAlerts}</span><span>{evidenceBundlePreview.validationChainHealth?.recentAlerts.length ?? 0}</span>
                    <span className="ops-kv-label">{opsCopy.propositionDetail.evidence.bundleKv.auditEvents}</span><span>{evidenceBundlePreview.propositionExport.auditEvents.length}</span>
                    <span className="ops-kv-label">{opsCopy.propositionDetail.evidence.bundleKv.rewardAudits}</span><span>{evidenceBundlePreview.propositionExport.rewardAuditEvents.length}</span>
                    <span className="ops-kv-label">{opsCopy.propositionDetail.evidence.bundleKv.checkpoints}</span><span>{evidenceBundlePreview.propositionExport.validationRehearsalCheckpoints.length}</span>
                  </div>
                  <OpsStringList title={opsCopy.propositionDetail.evidence.runtimeBlockersList} items={evidenceBundlePreview.runtimeContract.releaseReadiness.blockingDependencies} />
                  <OpsStringList title={opsCopy.propositionDetail.evidence.runtimeOperatorActions} items={evidenceBundlePreview.runtimeContract.operatorSummary.operatorActions} />
                  <OpsStringList
                    title={opsCopy.propositionDetail.evidence.validationAlertReasons}
                    items={(evidenceBundlePreview.validationChainHealth?.recentAlerts ?? []).map((item) => `${item.action}: ${item.reason}`)}
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section">
              <p className="ops-section-title">{opsCopy.propositionDetail.responseSubQueue.title}</p>
              {responseQueue.state.status === 'loading' || responseQueue.state.status === 'idle' ? <OpsLoading /> : null}
              {responseQueue.state.status === 'error' ? <OpsError kind={responseQueue.state.kind} message={responseQueue.state.message} onRetry={responseQueue.refresh} statusCode={responseQueue.state.statusCode} /> : null}
              {responseQueue.state.status === 'ok' && responseQueue.state.data.items.length === 0 ? <OpsEmpty message={opsCopy.propositionDetail.responseSubQueue.empty} /> : null}
              {responseQueue.state.status === 'ok' && responseQueue.state.data.items.length > 0 ? (
                <div className="ops-table-scroll">
                  <table className="ops-table">
                    <thead>
                      <tr><th>{opsCopy.propositionDetail.responseSubQueue.response}</th><th>{opsCopy.propositionDetail.responseSubQueue.user}</th><th>{opsCopy.propositionDetail.responseSubQueue.workflow}</th><th>{opsCopy.propositionDetail.responseSubQueue.submitted}</th></tr>
                    </thead>
                    <tbody>
                      {responseQueue.state.data.items.map((item) => (
                        <tr key={item.responseId}>
                          <td>
                            <Link to={`/zh/ops/responses?propositionId=${propositionId}&responseId=${item.responseId}`}>
                              {item.responseId}
                            </Link>
                          </td>
                          <td>
                            <Link to={buildRespondentRoute(item.userId)}>
                              {item.userId}
                            </Link>
                          </td>
                          <td><span className={`ops-badge ${fmtBadgeClass(item.workflowState)}`}>{statusLabel('workflow', item.workflowState)}</span></td>
                          <td>{fmtDate(item.submittedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="detail-side-panel ops-side-panel">
          <div className="ops-section">
            <p className="ops-section-title">{opsCopy.propositionDetail.reward.title}</p>
            <div className="ops-kv-grid">
              <span className="ops-kv-label">{opsCopy.propositionDetail.reward.pendingAmount}</span><span>{data.rewardSummary.totalPendingAmount}</span>
              <span className="ops-kv-label">{opsCopy.propositionDetail.reward.finalAmount}</span><span>{data.rewardSummary.totalFinalAmount}</span>
              <span className="ops-kv-label">{opsCopy.propositionDetail.reward.pendingEntries}</span><span>{data.rewardSummary.pendingCount}</span>
            </div>
            {latestRewardEvent ? (
              <p className="ops-muted">
                {opsCopy.propositionDetail.reward.latestEvent(latestRewardEvent.action, fmtDate(latestRewardEvent.createdAt))}
              </p>
            ) : null}
            <div className="ops-side-stack">
              <Link className="ops-pill-link" to={`/zh/ops/rewards?propositionId=${propositionId}`}>{opsCopy.propositionDetail.reward.openWorkspace}</Link>
              <Link
                className="ops-pill-link"
                to={`/zh/ops/takeover?propositionId=${propositionId}${data.market ? `&marketId=${data.market.id}` : ''}`}
              >
                {opsCopy.shared.openTakeover}
              </Link>
            </div>
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
      {busy ? <div className="ops-loading">{opsCopy.propositionDetail.working}</div> : null}
    </>
  )
}

function OpsRehearsalCheckpointForm({
  propositionId,
  token,
  checkpoints,
  onCompleted,
}: {
  propositionId: string
  token: string
  checkpoints: PropositionValidationRehearsalCheckpointViewModel[]
  onCompleted: () => void
}) {
  const [draft, setDraft] = useState<RehearsalCheckpointDraft>(() => createRehearsalCheckpointDraft())
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  function updateDraft(patch: Partial<RehearsalCheckpointDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setFeedback(null)
  }

  async function recordCheckpoint() {
    const payload = buildRehearsalCheckpointPayload(draft)
    if ('message' in payload) {
      setFeedback({ tone: 'error', message: payload.message })
      return
    }

    setBusy(true)
    setFeedback(null)
    try {
      const result = await arenaApi.recordOpsRehearsalCheckpoint(propositionId, payload, token)
      setFeedback({
        tone: 'success',
        message: opsCopy.propositionDetail.checkpointForm.recorded,
        receipt: [
          opsCopy.propositionDetail.checkpointForm.receiptStep(result.stepId),
          opsCopy.propositionDetail.checkpointForm.receiptStatus(result.status),
          opsCopy.propositionDetail.checkpointForm.receiptRecordedAt(result.recordedAt),
        ],
      })
      setDraft(createRehearsalCheckpointDraft())
      onCompleted()
    } catch (error) {
      setFeedback({ tone: 'error', message: String((error as Error).message ?? error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ops-panel-stack" style={{ marginTop: 16 }}>
      <div className="ops-list-card">
        <div className="ops-section-head">
          <strong>{opsCopy.propositionDetail.checkpointForm.title}</strong>
          <span className="ops-muted">{opsCopy.propositionDetail.checkpointForm.hint}</span>
        </div>
        <div className="ops-filter-row">
          <label>
            <span>{opsCopy.propositionDetail.checkpointForm.step}</span>
            <select aria-label={opsCopy.propositionDetail.checkpointForm.step} onChange={(event) => updateDraft({ stepId: event.target.value as PropositionValidationRehearsalStepId })} value={draft.stepId}>
              {REHEARSAL_STEP_OPTIONS.map((stepId) => <option key={stepId} value={stepId}>{statusLabel('rehearsalStep', stepId)}</option>)}
            </select>
          </label>
          <label>
            <span>{opsCopy.propositionDetail.checkpointForm.status}</span>
            <select aria-label={opsCopy.propositionDetail.checkpointForm.status} onChange={(event) => updateDraft({ status: event.target.value as PropositionValidationRehearsalStepStatus })} value={draft.status}>
              {REHEARSAL_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel('rehearsalStatus', status)}</option>)}
            </select>
          </label>
          <label>
            <span>{opsCopy.propositionDetail.checkpointForm.txHash}</span>
            <input aria-label={opsCopy.propositionDetail.checkpointForm.txHash} onChange={(event) => updateDraft({ txHash: event.target.value })} value={draft.txHash} />
          </label>
          <label>
            <span>{opsCopy.propositionDetail.checkpointForm.blockNumber}</span>
            <input aria-label={opsCopy.propositionDetail.checkpointForm.blockNumber} min={0} onChange={(event) => updateDraft({ blockNumber: event.target.value })} type="number" value={draft.blockNumber} />
          </label>
        </div>
        <div className="ops-form-grid">
          <label className="ops-form-block">
            <span>{opsCopy.propositionDetail.checkpointForm.reason}</span>
            <input aria-label={opsCopy.propositionDetail.checkpointForm.reason} onChange={(event) => updateDraft({ reason: event.target.value })} value={draft.reason} />
          </label>
          <label className="ops-form-block">
            <span>{opsCopy.propositionDetail.checkpointForm.note}</span>
            <textarea aria-label={opsCopy.propositionDetail.checkpointForm.note} className="ops-textarea" onChange={(event) => updateDraft({ note: event.target.value })} value={draft.note} />
          </label>
        </div>
        <label className="ops-form-block">
          <span>{opsCopy.propositionDetail.checkpointForm.evidence}</span>
          <textarea
            aria-label={opsCopy.propositionDetail.checkpointForm.evidence}
            className="ops-textarea"
            onChange={(event) => updateDraft({ evidence: event.target.value })}
            placeholder={opsCopy.propositionDetail.checkpointForm.evidencePlaceholder}
            value={draft.evidence}
          />
        </label>
        <div className="ops-actions">
          <button className="ops-btn ops-btn-primary" disabled={busy} onClick={() => void recordCheckpoint()} type="button">
            {opsCopy.propositionDetail.checkpointForm.submit}
          </button>
        </div>
        <OpsFeedback feedback={feedback} />
      </div>
      <div className="ops-list-card">
        <strong>{opsCopy.propositionDetail.checkpointForm.recentTitle}</strong>
        {checkpoints.length === 0 ? <OpsEmpty message={opsCopy.propositionDetail.checkpointForm.recentEmpty} /> : null}
        {checkpoints.length > 0 ? (
          <div className="ops-table-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>{opsCopy.propositionDetail.checkpointForm.tableStep}</th>
                  <th>{opsCopy.propositionDetail.checkpointForm.tableStatus}</th>
                  <th>{opsCopy.propositionDetail.checkpointForm.tableReason}</th>
                  <th>{opsCopy.propositionDetail.checkpointForm.tableRecorded}</th>
                </tr>
              </thead>
              <tbody>
                {checkpoints.slice(0, 6).map((checkpoint) => (
                  <tr key={`${checkpoint.stepId}-${checkpoint.recordedAt}`}>
                    <td>{statusLabel('rehearsalStep', checkpoint.stepId)}</td>
                    <td>{statusLabel('rehearsalStatus', checkpoint.status)}</td>
                    <td>{checkpoint.reason}</td>
                    <td>{fmtDate(checkpoint.recordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function createRehearsalCheckpointDraft(): RehearsalCheckpointDraft {
  return {
    stepId: 'preflight',
    status: 'complete',
    reason: '',
    note: '',
    evidence: '',
    txHash: '',
    blockNumber: '',
  }
}

function buildRehearsalCheckpointPayload(
  draft: RehearsalCheckpointDraft,
):
  | {
      stepId: string
      status: string
      reason: string
      note?: string
      evidence?: string[]
      txHash?: string
      blockNumber?: number
    }
  | { message: string } {
  const reason = draft.reason.trim()
  if (!reason) {
    return { message: opsCopy.propositionDetail.checkpointForm.reasonRequired }
  }

  const blockNumber = parseOptionalNonNegativeInteger(draft.blockNumber)
  if (draft.blockNumber.trim() && blockNumber === null) {
    return { message: opsCopy.propositionDetail.checkpointForm.blockNumberInvalid }
  }

  const evidence = parseEvidenceLines(draft.evidence)
  const note = draft.note.trim()
  const txHash = draft.txHash.trim()

  return {
    stepId: draft.stepId,
    status: draft.status,
    reason,
    note: note || undefined,
    evidence: evidence.length > 0 ? evidence : undefined,
    txHash: txHash || undefined,
    blockNumber: blockNumber ?? undefined,
  }
}

function parseEvidenceLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseOptionalNonNegativeInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number.parseInt(trimmed, 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | boolean | null>>) {
  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ]
  downloadText(filename, csvLines.join('\n'), 'text/csv;charset=utf-8')
}

function downloadText(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function escapeCsvCell(value: string | number | boolean | null): string {
  const normalized = value === null ? '' : String(value)
  const escaped = normalized.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

function buildPropositionReadableReport(data: {
  proposition: { id: string; title: string; status: string; category: string }
  submission: { status: string; submittedAt: string | null; submissionReason: string | null }
  market: { status: string; chainStatus: string | null } | null
  sampleCounter: { effectiveSampleCount: number }
  reviewSummary: { pendingCount: number; finalizedCount: number; invalidRate: number; anomalyRate: number }
  rewardSummary: { totalEntries: number; pendingCount: number }
  validationLifecycle: { driftReason: string | null; onChainState: string | null }
  validationOperatorSummary: { summary: string; operatorActions: string[] }
  validationRehearsal: { status: string; runbookPath: string; summary: { latestCheckpointAt: string | null }; steps: Array<{ id: string; status: string; summary: string }> }
  auditEvents: Array<{ action: string; reason: string; createdAt: string }>
  rewardAuditEvents: Array<{ action: string; reason: string; createdAt: string }>
}) {
  const lines = [
    `# Proposition Operations Report`,
    ``,
    `- Proposition: ${data.proposition.title} (${data.proposition.id})`,
    `- Category: ${data.proposition.category}`,
    `- Proposition status: ${data.proposition.status}`,
    `- Submission status: ${data.submission.status}`,
    `- Submitted at: ${fmtDate(data.submission.submittedAt)}`,
    `- Submission reason: ${data.submission.submissionReason ?? 'none'}`,
    `- Market status: ${data.market?.status ?? 'none'}`,
    `- Chain status: ${data.market?.chainStatus ?? 'none'}`,
    `- Effective samples: ${data.sampleCounter.effectiveSampleCount}`,
    `- Pending reviews: ${data.reviewSummary.pendingCount}`,
    `- Finalized reviews: ${data.reviewSummary.finalizedCount}`,
    `- Invalid rate: ${(data.reviewSummary.invalidRate * 100).toFixed(1)}%`,
    `- Anomaly rate: ${(data.reviewSummary.anomalyRate * 100).toFixed(1)}%`,
    `- Reward entries: ${data.rewardSummary.totalEntries}`,
    `- Pending rewards: ${data.rewardSummary.pendingCount}`,
    `- Drift reason: ${data.validationLifecycle.driftReason ?? 'none'}`,
    `- On-chain state: ${data.validationLifecycle.onChainState ?? 'unset'}`,
    `- Operator summary: ${data.validationOperatorSummary.summary}`,
    `- Rehearsal status: ${data.validationRehearsal.status}`,
    `- Runbook: ${data.validationRehearsal.runbookPath}`,
    `- Latest checkpoint: ${fmtDate(data.validationRehearsal.summary.latestCheckpointAt)}`,
    ``,
    `## Operator Actions`,
    ...(data.validationOperatorSummary.operatorActions.length > 0
      ? data.validationOperatorSummary.operatorActions.map((item) => `- ${item}`)
      : ['- none']),
    ``,
    `## Rehearsal Steps`,
    ...(data.validationRehearsal.steps.length > 0
      ? data.validationRehearsal.steps.map((step) => `- ${step.id}: ${step.status} - ${step.summary}`)
      : ['- none']),
    ``,
    `## Recent Audit Events`,
    ...(data.auditEvents.slice(0, 5).map((item) => `- ${fmtDate(item.createdAt)} | ${item.action} | ${item.reason}`)),
    ...(data.auditEvents.length === 0 ? ['- none'] : []),
    ``,
    `## Recent Reward Audit Events`,
    ...(data.rewardAuditEvents.slice(0, 5).map((item) => `- ${fmtDate(item.createdAt)} | ${item.action} | ${item.reason}`)),
    ...(data.rewardAuditEvents.length === 0 ? ['- none'] : []),
  ]
  return lines.join('\n')
}
