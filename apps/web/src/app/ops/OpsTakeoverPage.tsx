import type { ComponentType, ReactNode } from 'react'
import { hasAnySystemRole, SystemRole } from '@arena/shared'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { arenaApi } from '../../features/api/arena-api'
import {
  useOpsProposition,
  useOpsRuntimeContract,
  useOpsValidationChainHealth,
} from '../../features/arena/ops-console-data'
import { useAuthSession } from '../../features/auth/auth-session'
import { opsCommandLabel, opsCopy } from '../../features/arena/ops-copy'
import { statusLabel } from '../../features/arena/ops-status-labels'
import { OpsConfirmDialog } from '../OpsConfirmDialog'
import type {
  ActionPayload,
  ErrorStateKind,
  Feedback,
  PendingAction,
  SearchUpdater,
} from './ops-shared'

type OpsTakeoverPageProps = {
  token: string
  updateSearch: SearchUpdater
  actions: ReactNode
  pendingAction: PendingAction | null
  busy: boolean
  feedback: Feedback | null
  setPendingAction: (action: PendingAction | null) => void
  confirmAction: (payload: ActionPayload) => Promise<void>
  FeedbackComponent: ComponentType<{ feedback: Feedback | null }>
  LoadingComponent: ComponentType
  ErrorComponent: ComponentType<{
    kind: ErrorStateKind
    message: string
    onRetry?: () => void
    statusCode?: number | null
  }>
  EmptyComponent: ComponentType<{ message: string }>
  CommandSequenceComponent: ComponentType<{ title: string; items: string[] }>
}

export function OpsTakeoverPage({
  token,
  updateSearch,
  actions,
  pendingAction,
  busy,
  feedback,
  setPendingAction,
  confirmAction,
  FeedbackComponent,
  LoadingComponent,
  ErrorComponent,
  EmptyComponent,
  CommandSequenceComponent,
}: OpsTakeoverPageProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const search = new URLSearchParams(location.search)
  const propositionId = search.get('propositionId') ?? ''
  const marketId = search.get('marketId') ?? ''
  const userId = search.get('userId') ?? ''
  const cancelReasonCode = search.get('cancelReasonCode') ?? ''
  const { identity } = useAuthSession()
  const isAdmin = identity
    ? hasAnySystemRole(identity.roles, [SystemRole.Admin, SystemRole.System])
    : false
  const canRunHighRiskPropositionActions = isAdmin

  const proposition = useOpsProposition(token, propositionId || null)
  const health = useOpsValidationChainHealth(token)
  const contract = useOpsRuntimeContract(token)
  const propositionData = proposition.state.status === 'ok' ? proposition.state.data : null
  const healthData = health.state.status === 'ok' ? health.state.data : null
  const matchedStaleMarket = healthData?.stalePayoutMarkets.find((item) => item.marketId === marketId) ?? null
  const matchedBacklog = healthData?.projection.unsyncedBetBacklog.find(
    (item) => item.marketId === marketId && (!userId || item.userId === userId),
  ) ?? null
  const latestAudit = propositionData?.validationOperatorSummary.latestRelevantAudit
    ?? propositionData?.auditEvents[0]
    ?? null
  const latestRewardAudit = propositionData?.rewardAuditEvents[0] ?? null
  const globalEvidence = contract.state.status === 'ok'
    ? contract.state.data.operatorSummary.latestRelevantEvidence
    : healthData?.operatorSummary.latestRelevantEvidence ?? null

  function setContext(values: Record<string, string | undefined>) {
    updateSearch(navigate, location, values)
  }

  function propositionCommand(
    title: string,
    run: (payload: ActionPayload) => Promise<unknown>,
    options?: { danger?: boolean; withNote?: boolean; reasonDefaultValue?: string; reasonLabel?: string },
  ) {
    setPendingAction({
      title,
      description: opsCopy.takeover.propositionDescription(propositionId),
      danger: options?.danger,
      withNote: options?.withNote ?? true,
      withReason: true,
      requireReason: true,
      reasonLabel: options?.reasonLabel ?? opsCopy.takeover.reasonLabel,
      reasonPlaceholder: options?.reasonDefaultValue ?? 'operator_proposition_action',
      reasonDefaultValue: options?.reasonDefaultValue ?? 'operator_proposition_action',
      successMessage: opsCopy.takeover.submitted(title),
      run,
    })
  }

  function marketCommand(
    title: string,
    run: (payload: ActionPayload) => Promise<unknown>,
    options?: { danger?: boolean; withNote?: boolean; reasonDefaultValue?: string; reasonLabel?: string },
  ) {
    setPendingAction({
      title,
      description: opsCopy.takeover.marketDescription(marketId, userId),
      danger: options?.danger,
      withNote: options?.withNote ?? true,
      withReason: true,
      requireReason: true,
      reasonLabel: options?.reasonLabel ?? opsCopy.takeover.reasonLabel,
      reasonPlaceholder: options?.reasonDefaultValue ?? 'operator_market_action',
      reasonDefaultValue: options?.reasonDefaultValue ?? 'operator_market_action',
      successMessage: opsCopy.takeover.submitted(title),
      run,
    })
  }

  function globalCommand(
    title: string,
    run: (payload: ActionPayload) => Promise<unknown>,
    options?: { danger?: boolean; withNote?: boolean; reasonDefaultValue?: string; reasonLabel?: string },
  ) {
    setPendingAction({
      title,
      description: opsCopy.takeover.globalDescription,
      danger: options?.danger,
      withNote: options?.withNote ?? true,
      withReason: true,
      requireReason: true,
      reasonLabel: options?.reasonLabel ?? opsCopy.takeover.reasonLabel,
      reasonPlaceholder: options?.reasonDefaultValue ?? 'operator_global_action',
      reasonDefaultValue: options?.reasonDefaultValue ?? 'operator_global_action',
      successMessage: opsCopy.takeover.submitted(title),
      run,
    })
  }

  return (
    <>
      <div className="detail-layout">
        <div className="detail-main-stack">
          <section className="detail-panel">
            <div className="ops-section">
              <p className="ops-section-title">{opsCopy.takeover.contextSummaryTitle}</p>
              <FeedbackComponent feedback={feedback} />
              <div className="ops-kv-grid">
                <span className="ops-kv-label">{opsCopy.takeover.contextKv.proposition}</span><span>{propositionId || '-'}</span>
                <span className="ops-kv-label">{opsCopy.takeover.contextKv.market}</span><span>{marketId || '-'}</span>
                <span className="ops-kv-label">{opsCopy.takeover.contextKv.userOwner}</span><span>{userId || '-'}</span>
                <span className="ops-kv-label">{opsCopy.takeover.contextKv.cancelReasonCode}</span><span>{cancelReasonCode || '-'}</span>
              </div>
              {proposition.state.status === 'loading' || proposition.state.status === 'idle' ? <LoadingComponent /> : null}
              {proposition.state.status === 'error' && propositionId ? <ErrorComponent kind={proposition.state.kind} message={proposition.state.message} onRetry={proposition.refresh} statusCode={proposition.state.statusCode} /> : null}
              {propositionData ? (
                <>
                  <p className="ops-muted">
                    {opsCopy.takeover.summaryLine(propositionData.proposition.title, statusLabel('proposition', propositionData.proposition.status), propositionData.validationLifecycle.marketStatus ? statusLabel('market', propositionData.validationLifecycle.marketStatus) : opsCopy.takeover.none)}
                  </p>
                  <div className="ops-kv-grid">
                    <span className="ops-kv-label">{opsCopy.takeover.driftKv.driftReason}</span><span>{propositionData.validationLifecycle.driftReason ?? opsCopy.takeover.none}</span>
                    <span className="ops-kv-label">{opsCopy.takeover.driftKv.chainState}</span><span>{propositionData.validationLifecycle.onChainState ?? opsCopy.takeover.none}</span>
                    <span className="ops-kv-label">{opsCopy.takeover.driftKv.operatorSummary}</span><span>{propositionData.validationOperatorSummary.summary}</span>
                    <span className="ops-kv-label">{opsCopy.takeover.driftKv.runbook}</span><span>{propositionData.validationRehearsal.runbookPath}</span>
                  </div>
                  <CommandSequenceComponent
                    title={opsCopy.takeover.guidedActions}
                    items={propositionData.validationLifecycle.operatorGuidance?.operatorActions ?? propositionData.validationOperatorSummary.operatorActions}
                  />
                  <CommandSequenceComponent
                    title={opsCopy.takeover.plannedCommands}
                    items={propositionData.validationLifecycle.operatorGuidance?.plannedCommands ?? propositionData.validationOperatorSummary.plannedCommands}
                  />
                </>
              ) : null}
              <div className="ops-actions">
                {propositionId ? <Link className="ops-btn ops-btn-ghost" to={`/zh/ops/propositions/${propositionId}`}>{opsCopy.takeover.openPropositionWorkspace}</Link> : null}
                {propositionId ? <Link className="ops-btn ops-btn-ghost" to={`/zh/ops/rewards?propositionId=${propositionId}`}>{opsCopy.takeover.openRewardsWorkspace}</Link> : null}
                {propositionId ? <Link className="ops-btn ops-btn-ghost" to={`/zh/ops/responses?propositionId=${propositionId}`}>{opsCopy.takeover.openResponseQueue}</Link> : null}
                <button className="ops-refresh-btn" onClick={health.refresh} type="button">{opsCopy.takeover.refreshHealth}</button>
                <button className="ops-refresh-btn" onClick={contract.refresh} type="button">{opsCopy.takeover.refreshContract}</button>
              </div>
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section">
              <p className="ops-section-title">{opsCopy.takeover.propositionScopedTitle}</p>
              <p className="ops-muted">
                {opsCopy.takeover.propositionScopedHint}
              </p>
              <div className="ops-filter-row">
                <label>
                  <span>{opsCopy.takeover.propositionIdLabel}</span>
                  <input onChange={(event) => setContext({ propositionId: event.target.value || undefined })} value={propositionId} />
                </label>
                <label>
                  <span>{opsCopy.takeover.cancelReasonInputLabel}</span>
                  <input onChange={(event) => setContext({ cancelReasonCode: event.target.value || undefined })} value={cancelReasonCode} />
                </label>
              </div>
              <div className="ops-actions">
                <button className="ops-btn ops-btn-ghost" disabled={busy || !propositionId} onClick={() => propositionCommand(opsCommandLabel('create-market'), ({ note, reason }) => arenaApi.runOpsValidationChainPropositionCommand('create-market', propositionId, { reason, note: note || undefined }, token), { reasonDefaultValue: 'create_market' })} type="button">
                  <span className="ops-cmd-label">{opsCommandLabel('create-market')}</span>
                  <span className="ops-cmd-chip">create-market</span>
                </button>
                <button className="ops-btn ops-btn-ghost" disabled={busy || !propositionId} onClick={() => propositionCommand(opsCommandLabel('open-market'), ({ note, reason }) => arenaApi.runOpsValidationChainPropositionCommand('open-market', propositionId, { reason, note: note || undefined }, token), { reasonDefaultValue: 'open_market' })} type="button">
                  <span className="ops-cmd-label">{opsCommandLabel('open-market')}</span>
                  <span className="ops-cmd-chip">open-market</span>
                </button>
                {canRunHighRiskPropositionActions ? (
                  <>
                    <button className="ops-btn ops-btn-danger" disabled={busy || !propositionId} onClick={() => propositionCommand(opsCommandLabel('freeze-market'), ({ note, reason }) => arenaApi.runOpsValidationChainPropositionCommand('freeze-market', propositionId, { reason, note: note || undefined }, token), { danger: true, reasonDefaultValue: 'freeze_market' })} type="button">
                      <span className="ops-cmd-label">{opsCommandLabel('freeze-market')}</span>
                      <span className="ops-cmd-chip">freeze-market</span>
                    </button>
                    <button className="ops-btn ops-btn-danger" disabled={busy || !propositionId} onClick={() => propositionCommand(opsCommandLabel('resolve-market'), ({ note, reason }) => arenaApi.runOpsValidationChainPropositionCommand('resolve-market', propositionId, { reason, note: note || undefined }, token), { danger: true, reasonDefaultValue: 'resolve_market' })} type="button">
                      <span className="ops-cmd-label">{opsCommandLabel('resolve-market')}</span>
                      <span className="ops-cmd-chip">resolve-market</span>
                    </button>
                    <button className="ops-btn ops-btn-danger" disabled={busy || !propositionId || !cancelReasonCode} onClick={() => propositionCommand(opsCommandLabel('cancel-market'), ({ note, reason }) => arenaApi.cancelOpsValidationChainMarket(propositionId, { reason, note: note || undefined, reasonCode: cancelReasonCode }, token), { danger: true, reasonDefaultValue: 'cancel_market', reasonLabel: opsCopy.takeover.cancelReasonLabel })} type="button">
                      <span className="ops-cmd-label">{opsCommandLabel('cancel-market')}</span>
                      <span className="ops-cmd-chip">cancel-market</span>
                    </button>
                  </>
                ) : null}
                <button className="ops-btn ops-btn-ghost" disabled={busy || !propositionId} onClick={() => propositionCommand(opsCommandLabel('recover-command'), ({ note, reason }) => arenaApi.recoverOpsValidationChainCommand(propositionId, { reason, note: note || undefined }, token), { reasonDefaultValue: 'recover_validation_command' })} type="button">
                  <span className="ops-cmd-label">{opsCommandLabel('recover-command')}</span>
                  <span className="ops-cmd-chip">recover-command</span>
                </button>
              </div>
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section">
              <p className="ops-section-title">{opsCopy.takeover.marketScopedTitle}</p>
              <p className="ops-muted">
                {opsCopy.takeover.marketScopedHint}
              </p>
              <div className="ops-filter-row">
                <label>
                  <span>{opsCopy.takeover.marketIdLabel}</span>
                  <input onChange={(event) => setContext({ marketId: event.target.value || undefined })} value={marketId} />
                </label>
                <label>
                  <span>{opsCopy.takeover.userIdLabel}</span>
                  <input onChange={(event) => setContext({ userId: event.target.value || undefined })} value={userId} />
                </label>
              </div>
              {matchedStaleMarket ? (
                <div className="ops-list-card">
                  <strong>{opsCopy.takeover.stalePayoutSnapshotTitle}</strong>
                  <p className="ops-muted">
                    {opsCopy.takeover.stalePayoutSnapshotDetail(matchedStaleMarket.propositionId, String(matchedStaleMarket.unclaimedBetCount), statusLabel('chainMarket', matchedStaleMarket.chainStatus))}
                  </p>
                  <CommandSequenceComponent title={opsCopy.takeover.operatorActions} items={matchedStaleMarket.operatorActions} />
                </div>
              ) : null}
              {matchedBacklog ? (
                <div className="ops-list-card">
                  <strong>{opsCopy.takeover.backlogSnapshotTitle}</strong>
                  <p className="ops-muted">
                    {opsCopy.takeover.backlogSnapshotDetail(matchedBacklog.betId, statusLabel('bet', matchedBacklog.status), Math.round(matchedBacklog.oldestUnsyncedAgeMs / 1000))}
                  </p>
                  <CommandSequenceComponent title={opsCopy.takeover.operatorActions} items={matchedBacklog.operatorActions} />
                </div>
              ) : null}
              <div className="ops-actions">
                <button className="ops-btn ops-btn-ghost" disabled={busy || !marketId} onClick={() => marketCommand(opsCommandLabel('replay-projection'), ({ note, reason }) => arenaApi.replayOpsValidationChainProjection(marketId, { reason, note: note || undefined }, token), { reasonDefaultValue: 'replay_projection' })} type="button">
                  <span className="ops-cmd-label">{opsCommandLabel('replay-projection')}</span>
                  <span className="ops-cmd-chip">replay-projection</span>
                </button>
                <button className="ops-btn ops-btn-primary" disabled={busy || !marketId || !userId} onClick={() => marketCommand(opsCommandLabel('reconcile-bet'), ({ note, reason }) => arenaApi.reconcileOpsValidationChainBet(marketId, userId, { reason, note: note || undefined }, token), { reasonDefaultValue: 'reconcile_validation_bet' })} type="button">
                  <span className="ops-cmd-label">{opsCommandLabel('reconcile-bet')}</span>
                  <span className="ops-cmd-chip">reconcile-bet</span>
                </button>
              </div>
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section">
              <p className="ops-section-title">{opsCopy.takeover.globalTitle}</p>
              <p className="ops-muted">
                {opsCopy.takeover.globalHint}
              </p>
              <div className="ops-kv-grid">
                <span className="ops-kv-label">{opsCopy.takeover.globalKv.runtimeSummary}</span><span>{contract.state.status === 'ok' ? contract.state.data.operatorSummary.summary : opsCopy.takeover.loading}</span>
                <span className="ops-kv-label">{opsCopy.takeover.globalKv.runbook}</span><span>{contract.state.status === 'ok' ? contract.state.data.validationRehearsal.runbookPath : '-'}</span>
                <span className="ops-kv-label">{opsCopy.takeover.globalKv.scheduler}</span><span>{healthData?.schedulerWorker?.status ?? opsCopy.takeover.none}</span>
                <span className="ops-kv-label">{opsCopy.takeover.globalKv.latestEvidence}</span><span>{globalEvidence ? opsCopy.takeover.latestEvidenceValue(globalEvidence.action, globalEvidence.reason) : opsCopy.takeover.none}</span>
              </div>
              <div className="ops-actions">
                <button className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => globalCommand(opsCommandLabel('sync'), ({ note, reason }) => arenaApi.syncOpsValidationChain({ reason, note: note || undefined }, token), { reasonDefaultValue: 'sync_validation_chain' })} type="button">
                  <span className="ops-cmd-label">{opsCommandLabel('sync')}</span>
                  <span className="ops-cmd-chip">sync</span>
                </button>
                <button className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => globalCommand(opsCommandLabel('reconcile-backlog'), ({ note, reason }) => arenaApi.reconcileOpsValidationChainBacklog({ reason, note: note || undefined }, token), { reasonDefaultValue: 'reconcile_validation_backlog' })} type="button">
                  <span className="ops-cmd-label">{opsCommandLabel('reconcile-backlog')}</span>
                  <span className="ops-cmd-chip">reconcile-backlog</span>
                </button>
                {isAdmin ? (
                  <>
                    <button className="ops-btn ops-btn-danger" disabled={busy} onClick={() => globalCommand(opsCommandLabel('pause'), ({ note, reason }) => arenaApi.pauseOpsValidationChain({ reason, note: note || undefined }, token), { danger: true, reasonDefaultValue: 'pause_validation_chain' })} type="button">
                      <span className="ops-cmd-label">{opsCommandLabel('pause')}</span>
                      <span className="ops-cmd-chip">pause</span>
                    </button>
                    <button className="ops-btn ops-btn-primary" disabled={busy} onClick={() => globalCommand(opsCommandLabel('unpause'), ({ note, reason }) => arenaApi.unpauseOpsValidationChain({ reason, note: note || undefined }, token), { reasonDefaultValue: 'unpause_validation_chain' })} type="button">
                      <span className="ops-cmd-label">{opsCommandLabel('unpause')}</span>
                      <span className="ops-cmd-chip">unpause</span>
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <aside className="detail-side-panel ops-side-panel">
          <div className="ops-section">
            <p className="ops-section-title">{opsCopy.takeover.latestEvidenceTitle}</p>
            {latestAudit ? (
              <div className="ops-list-card">
                <strong>{latestAudit.action}</strong>
                <p className="ops-muted">{latestAudit.reason}</p>
              </div>
            ) : null}
            {latestRewardAudit ? (
              <div className="ops-list-card">
                <strong>{latestRewardAudit.action}</strong>
                <p className="ops-muted">{latestRewardAudit.reason}</p>
              </div>
            ) : null}
            {!latestAudit && !latestRewardAudit ? <EmptyComponent message={opsCopy.takeover.recentEvidenceEmpty} /> : null}
          </div>
          <div className="ops-section">
            <p className="ops-section-title">{opsCopy.takeover.usageGuidanceTitle}</p>
            <ul className="ops-bullet-list">
              {opsCopy.takeover.usageGuidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
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
