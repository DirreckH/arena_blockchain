import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from 'react'
import { hasAnySystemRole, SystemRole } from '@arena/shared'
import { Link } from 'react-router-dom'
import { arenaApi } from '../../features/api/arena-api'
import {
  useOpsAnomalies,
  useOpsLifecycleDrift,
  useOpsQueueOverview,
  useOpsRuntimeContract,
  useOpsSampleShortage,
  useOpsValidationChainHealth,
  useOpsValidationChainReadiness,
} from '../../features/arena/ops-console-data'
import type {
  BackendRuntimeContractChecklistItemViewModel,
  BackendRuntimeContractCommandSetViewModel,
  InternalAuditEventViewModel,
  OperatorSummaryEvidenceViewModel,
  ValidationChainHealthAlertViewModel,
  ValidationChainUnsyncedBetBacklogItemViewModel,
} from '../../features/arena/internal-ops.types'
import { useAuthSession } from '../../features/auth/auth-session'
import { opsCopy } from '../../features/arena/ops-copy'
import { statusLabel } from '../../features/arena/ops-status-labels'
import { OpsConfirmDialog } from '../OpsConfirmDialog'
import { OpsHealthQueueOverviewPanel } from './OpsHealthQueueOverviewPanel'
import { OpsHealthRuntimeContractPanel } from './OpsHealthRuntimeContractPanel'
import {
  attentionSeverityRank,
  buildAnomalyAttentionItem,
  buildDriftAttentionItem,
  buildShortageAttentionItem,
  type HealthAttentionItem,
  type PersistedHealthAttentionState,
  OpsHealthAttentionInbox,
  persistHealthAttentionState,
  readPersistedHealthAttentionState,
} from './ops-health-attention'
import type {
  ActionPayload,
  ErrorStateKind,
  Feedback,
  PendingAction,
} from './ops-shared'
import {
  appendTrendSnapshot,
  buildHealthTrendSnapshot,
  computeSampleCompletion,
  type OpsHealthTrendSnapshot,
  OpsHealthTrendsPanel,
  persistHealthTrendHistory,
  readPersistedHealthTrendHistory,
} from './ops-health-trends'

type OpsHealthPageProps = {
  token: string
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
  InlineMetricComponent: ComponentType<{ label: string; value: string }>
  StringListComponent: ComponentType<{ title: string; items: string[] }>
  CommandSequenceComponent: ComponentType<{ title: string; items: string[] }>
  HealthAlertListComponent: ComponentType<{
    title: string
    items: ValidationChainHealthAlertViewModel[]
    emptyMessage: string
  }>
  RecentChainEventsComponent: ComponentType<{
    title: string
    items: Array<{ primary: string; secondary: string }>
    emptyMessage: string
  }>
  CommandGroupsComponent: ComponentType<{ commands: BackendRuntimeContractCommandSetViewModel }>
  ChecklistListComponent: ComponentType<{ items: BackendRuntimeContractChecklistItemViewModel[] }>
  AuditListComponent: ComponentType<{
    title: string
    items: InternalAuditEventViewModel[]
    emptyMessage: string
  }>
  buildOpsAuditThreadRoute: (
    input: Pick<OperatorSummaryEvidenceViewModel, 'entityType' | 'entityId' | 'action'>,
  ) => string
  buildOpsWorkspaceLink: (
    input: Pick<OperatorSummaryEvidenceViewModel, 'entityType' | 'entityId'> & { metadata?: unknown },
  ) => { to: string; label: string } | null
  formatDate: (value: unknown) => string
}

export function OpsHealthPage({
  token,
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
  InlineMetricComponent,
  StringListComponent,
  CommandSequenceComponent,
  HealthAlertListComponent,
  RecentChainEventsComponent,
  CommandGroupsComponent,
  ChecklistListComponent,
  AuditListComponent,
  buildOpsAuditThreadRoute,
  buildOpsWorkspaceLink,
  formatDate,
}: OpsHealthPageProps) {
  const { identity } = useAuthSession()
  const isAdmin = identity
    ? hasAnySystemRole(identity.roles, [SystemRole.Admin, SystemRole.System])
    : false
  const overview = useOpsQueueOverview(token)
  const health = useOpsValidationChainHealth(token)
  const readiness = useOpsValidationChainReadiness(token)
  const contract = useOpsRuntimeContract(token)
  const anomalies = useOpsAnomalies(token)
  const shortages = useOpsSampleShortage(token)
  const drift = useOpsLifecycleDrift(token)
  const [attentionState, setAttentionState] = useState<PersistedHealthAttentionState>(() => readPersistedHealthAttentionState())
  const [trendHistory, setTrendHistory] = useState<OpsHealthTrendSnapshot[]>(() => readPersistedHealthTrendHistory())
  const [selectedBacklogBetIds, setSelectedBacklogBetIds] = useState<string[]>([])
  const backlogItems = health.state.status === 'ok' && health.state.data
    ? health.state.data.projection.unsyncedBetBacklog
    : []
  const visibleSelectedBacklogItems = backlogItems.filter((item) => selectedBacklogBetIds.includes(item.betId))
  const allVisibleBacklogSelected = backlogItems.length > 0 && visibleSelectedBacklogItems.length === backlogItems.length
  const hasVisibleBacklogSelection = visibleSelectedBacklogItems.length > 0

  useEffect(() => {
    persistHealthAttentionState(attentionState)
  }, [attentionState])

  useEffect(() => {
    persistHealthTrendHistory(trendHistory)
  }, [trendHistory])

  useEffect(() => {
    setSelectedBacklogBetIds((current) => {
      const next = current.filter((betId) => backlogItems.some((item) => item.betId === betId))
      return next.length === current.length ? current : next
    })
  }, [backlogItems])

  function reconcileBet(item: ValidationChainUnsyncedBetBacklogItemViewModel) {
    setPendingAction({
      title: opsCopy.health.reconcileTitle,
      description: opsCopy.health.reconcileDescription(item.marketId, item.userId),
      withNote: true,
      withReason: true,
      requireReason: true,
      reasonLabel: opsCopy.health.reconcileReasonLabel,
      reasonPlaceholder: 'reconcile_validation_bet',
      reasonDefaultValue: 'reconcile_validation_bet',
      successMessage: opsCopy.health.reconcileSuccess,
      run: async ({ note, reason }) => {
        const result = await arenaApi.reconcileOpsValidationChainBet(
          item.marketId,
          item.userId,
          { reason, note: note || undefined },
          token,
        )
        health.refresh()
        return result
      },
    })
  }

  function requeueFailedQueue(queueName: string) {
    setPendingAction({
      title: opsCopy.health.requeueTitle,
      description: opsCopy.health.requeueDescription(queueName),
      withNote: false,
      withReason: false,
      successMessage: opsCopy.health.requeueSuccess,
      run: async () => {
        const result = await arenaApi.requeueFailedOpsQueue(queueName, token)
        overview.refresh()
        return result
      },
    })
  }

  function toggleBacklogSelection(betId: string, checked: boolean) {
    setSelectedBacklogBetIds((current) => {
      if (checked) {
        return current.includes(betId) ? current : [...current, betId]
      }
      return current.filter((item) => item !== betId)
    })
  }

  function toggleSelectAllVisibleBacklog(checked: boolean) {
    setSelectedBacklogBetIds(checked ? backlogItems.map((item) => item.betId) : [])
  }

  async function runBacklogBatchReconcile(
    items: ValidationChainUnsyncedBetBacklogItemViewModel[],
    note: string,
    reason: string,
  ) {
    const completed: string[] = []
    const failed: Array<{ betId: string; message: string }> = []

    for (const item of items) {
      try {
        await arenaApi.reconcileOpsValidationChainBet(
          item.marketId,
          item.userId,
          { reason, note: note || undefined },
          token,
        )
        completed.push(item.betId)
      } catch (error) {
        failed.push({
          betId: item.betId,
          message: String((error as Error).message ?? error),
        })
      }
    }

    health.refresh()
    setSelectedBacklogBetIds((current) => current.filter((betId) => !completed.includes(betId)))

    const receipt = [
      `selectedCount: ${items.length}`,
      `processedCount: ${completed.length}`,
      `failedCount: ${failed.length}`,
    ]
    failed.slice(0, 3).forEach((item) => {
      receipt.push(`failed ${item.betId}: ${item.message}`)
    })

    return {
      feedback: {
        tone: failed.length > 0 ? 'error' : 'success',
        message: failed.length > 0
          ? opsCopy.health.batchReconcileResultFail(failed.length)
          : opsCopy.health.batchReconcileResultOk(completed.length),
        receipt,
      },
    }
  }

  function batchReconcileBacklog() {
    if (!hasVisibleBacklogSelection) {
      return
    }

    setPendingAction({
      title: opsCopy.health.batchReconcileTitle,
      description: opsCopy.health.batchReconcileDescription(visibleSelectedBacklogItems.length),
      withNote: true,
      withReason: true,
      requireReason: true,
      reasonLabel: opsCopy.health.batchReconcileReasonLabel,
      reasonPlaceholder: 'reconcile_validation_bet',
      reasonDefaultValue: 'reconcile_validation_bet',
      successMessage: opsCopy.health.batchReconcileSubmitted,
      run: ({ note, reason }) => runBacklogBatchReconcile(visibleSelectedBacklogItems, note, reason),
    })
  }

  const runtimeSummary = contract.state.status === 'ok' ? contract.state.data.operatorSummary : null
  const chainSummary = health.state.status === 'ok' ? health.state.data?.operatorSummary ?? null : null
  const summary = runtimeSummary?.requiresActionNow
    ? runtimeSummary
    : chainSummary?.requiresActionNow
      ? chainSummary
      : runtimeSummary ?? chainSummary
  const summarySource = runtimeSummary?.requiresActionNow
    ? 'runtime contract'
    : chainSummary?.requiresActionNow
      ? 'validation chain'
      : runtimeSummary
        ? 'runtime contract'
        : chainSummary
          ? 'validation chain'
          : null
  const summaryEvidence = summary?.latestRelevantEvidence ?? null
  const summaryAuditThread = summaryEvidence ? buildOpsAuditThreadRoute(summaryEvidence) : null
  const summaryWorkspaceLink = summaryEvidence ? buildOpsWorkspaceLink(summaryEvidence) : null
  const trendSnapshot = useMemo(() => buildHealthTrendSnapshot({
    queueTimestamp: overview.state.status === 'ok' ? overview.state.data.timestamp : null,
    queueWaiting: overview.state.status === 'ok'
      ? overview.state.data.queues.reduce((sum, item) => sum + (item.counts?.waiting ?? 0), 0)
      : null,
    healthTimestamp: health.state.status === 'ok' && health.state.data ? health.state.data.cursorUpdatedAt : null,
    alertCount: health.state.status === 'ok' && health.state.data ? health.state.data.recentAlerts.length : null,
    runtimeTimestamp: contract.state.status === 'ok' ? contract.state.data.generatedAt : null,
    runtimeAlertCount: contract.state.status === 'ok' ? contract.state.data.recentAlerts.length : null,
    peakAnomalyRate: anomalies.state.status === 'ok'
      ? anomalies.state.data.reduce((peak, item) => Math.max(peak, item.anomalyRate), 0)
      : null,
    sampleCompletion: shortages.state.status === 'ok'
      ? computeSampleCompletion(shortages.state.data)
      : null,
  }), [anomalies.state, contract.state, health.state, overview.state, shortages.state])

  useEffect(() => {
    if (!trendSnapshot) {
      return
    }

    setTrendHistory((current) => appendTrendSnapshot(current, trendSnapshot))
  }, [trendSnapshot])

  const waitingTrendPoints = trendHistory.map((item) => item.totalWaiting)
  const alertTrendPoints = trendHistory.map((item) => item.totalAlerts)
  const anomalyTrendPoints = trendHistory.map((item) => item.peakAnomalyRate)
  const sampleProgressTrendPoints = trendHistory.map((item) => item.sampleCompletion)
  const attentionItems = useMemo(() => {
    const next: HealthAttentionItem[] = []

    if (anomalies.state.status === 'ok') {
      next.push(...anomalies.state.data.map((item) => buildAnomalyAttentionItem(item, attentionState[item.propositionId])))
    }
    if (shortages.state.status === 'ok') {
      next.push(...shortages.state.data.map((item) => buildShortageAttentionItem(item, attentionState[`shortage:${item.propositionId}`])))
    }
    if (drift.state.status === 'ok') {
      next.push(...drift.state.data.map((item) => buildDriftAttentionItem(item, attentionState[`drift:${item.propositionId}:${item.driftReason}`])))
    }

    return next.sort((left, right) => attentionSeverityRank(right.severity) - attentionSeverityRank(left.severity))
  }, [anomalies.state, attentionState, drift.state, shortages.state])
  const unreadAttentionCount = attentionItems.filter((item) => item.unread && !item.handled).length
  const criticalUnreadAttentionCount = attentionItems.filter((item) => item.unread && !item.handled && item.severity === 'critical').length
  const handledAttentionCount = attentionItems.filter((item) => item.handled).length

  function markAttentionRead(key: string, nextRead: boolean) {
    setAttentionState((current) => {
      const existing = current[key] ?? {}
      const nextEntry = nextRead
        ? { ...existing, lastSeenAt: existing.lastSeenAt ?? new Date().toISOString() }
        : { ...existing, lastSeenAt: undefined }

      return {
        ...current,
        [key]: nextEntry,
      }
    })
  }

  function markAttentionHandled(key: string, nextHandled: boolean) {
    setAttentionState((current) => {
      const existing = current[key] ?? {}
      return {
        ...current,
        [key]: {
          ...existing,
          lastSeenAt: existing.lastSeenAt ?? new Date().toISOString(),
          handledAt: nextHandled ? new Date().toISOString() : undefined,
        },
      }
    })
  }

  return (
    <>
      <div className="detail-layout">
        <div className="detail-main-stack">
          <section className="detail-panel">
            <div className="ops-section-head">
              <p className="ops-section-title">{opsCopy.health.summaryTitle}</p>
              <div className="ops-actions">
                <button className="ops-refresh-btn" onClick={overview.refresh} type="button">{opsCopy.health.refreshQueues}</button>
                <button className="ops-refresh-btn" onClick={health.refresh} type="button">{opsCopy.health.refreshChain}</button>
                <button className="ops-refresh-btn" onClick={contract.refresh} type="button">{opsCopy.health.refreshContract}</button>
              </div>
            </div>
            <FeedbackComponent feedback={feedback} />
            {summary ? (
              <>
                <div className="ops-kv-grid">
                  <span className="ops-kv-label">{opsCopy.health.summaryKv.status}</span><span>{summary.status}</span>
                  <span className="ops-kv-label">{opsCopy.health.summaryKv.currentLane}</span><span>{summarySource === 'runtime contract' ? opsCopy.health.laneRuntimeContract : summarySource === 'validation chain' ? opsCopy.health.laneValidationChain : opsCopy.health.laneNone}</span>
                  <span className="ops-kv-label">{opsCopy.health.summaryKv.focusArea}</span><span>{summary.focusArea}</span>
                  <span className="ops-kv-label">{opsCopy.health.summaryKv.summary}</span><span>{summary.summary}</span>
                  <span className="ops-kv-label">{opsCopy.health.summaryKv.latestEvidence}</span><span>{summaryEvidence ? opsCopy.health.latestEvidenceValue(summaryEvidence.action, summaryEvidence.reason) : opsCopy.health.none}</span>
                </div>
                <StringListComponent title={opsCopy.health.blockers} items={summary.blockers} />
                <StringListComponent title={opsCopy.health.operatorActions} items={summary.operatorActions} />
                {summaryAuditThread || summaryWorkspaceLink ? (
                  <div className="ops-actions">
                    {summaryAuditThread ? (
                      <Link className="ops-btn ops-btn-ghost" to={summaryAuditThread}>{opsCopy.health.currentAuditThread}</Link>
                    ) : null}
                    {summaryWorkspaceLink ? (
                      <Link className="ops-btn ops-btn-ghost" to={summaryWorkspaceLink.to}>{summaryWorkspaceLink.label}</Link>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyComponent message={opsCopy.health.summaryEmpty} />
            )}
          </section>

          <OpsHealthTrendsPanel
            alertTrendPoints={alertTrendPoints}
            anomalyTrendPoints={anomalyTrendPoints}
            sampleProgressTrendPoints={sampleProgressTrendPoints}
            waitingTrendPoints={waitingTrendPoints}
          />

          <OpsHealthQueueOverviewPanel
            busy={busy}
            ErrorComponent={ErrorComponent}
            isAdmin={isAdmin}
            LoadingComponent={LoadingComponent}
            onRequeueFailedQueue={requeueFailedQueue}
            overview={overview}
          />

          <section className="detail-panel">
            <div className="ops-section">
              <p className="ops-section-title">{opsCopy.health.chainHealthTitle}</p>
              {health.state.status === 'loading' || health.state.status === 'idle' ? <LoadingComponent /> : null}
              {health.state.status === 'error' ? <ErrorComponent kind={health.state.kind} message={health.state.message} onRetry={health.refresh} statusCode={health.state.statusCode} /> : null}
              {health.state.status === 'ok' && !health.state.data ? <EmptyComponent message={opsCopy.health.chainHealthEmpty} /> : null}
              {health.state.status === 'ok' && health.state.data ? (
                <>
                  <div className="ops-card-grid ops-card-grid-compact">
                    <InlineMetricComponent label={opsCopy.health.metrics.recentAlerts} value={String(health.state.data.recentAlerts.length)} />
                    <InlineMetricComponent label={opsCopy.health.metrics.duplicateRows} value={String(health.state.data.eventLedger.duplicateRows.length)} />
                    <InlineMetricComponent label={opsCopy.health.metrics.recentEvents} value={String(health.state.data.eventLedger.recentEvents.length)} />
                    <InlineMetricComponent label={opsCopy.health.metrics.unsyncedBacklog} value={String(health.state.data.projection.unsyncedBetBacklog.length)} />
                  </div>
                  <div className="ops-kv-grid">
                    <span className="ops-kv-label">{opsCopy.health.chainKv.syncStatus}</span><span>{statusLabel('sync', health.state.data.syncStatus)}</span>
                    <span className="ops-kv-label">{opsCopy.health.chainKv.stream}</span><span>{health.state.data.streamKey}</span>
                    <span className="ops-kv-label">{opsCopy.health.chainKv.lastBlock}</span><span>{health.state.data.lastProcessedBlock ?? '-'}</span>
                    <span className="ops-kv-label">{opsCopy.health.chainKv.lastTx}</span><span>{health.state.data.lastProcessedTxHash ?? '-'}</span>
                    <span className="ops-kv-label">{opsCopy.health.chainKv.lastLogIndex}</span><span>{health.state.data.lastProcessedLogIndex ?? '-'}</span>
                    <span className="ops-kv-label">{opsCopy.health.chainKv.cursorUpdated}</span><span>{formatDate(health.state.data.cursorUpdatedAt)}</span>
                    <span className="ops-kv-label">{opsCopy.health.chainKv.schedulerWorker}</span><span>{health.state.data.schedulerWorker?.status ?? opsCopy.health.none}</span>
                  </div>
                  <CommandSequenceComponent title={opsCopy.health.dependencyActions} items={health.state.data.operatorSummary.operatorActions} />
                  <div className="ops-list-stack">
                    <div className="ops-list-card">
                      <strong>{opsCopy.health.schedulerWorkerTitle}</strong>
                      {health.state.data.schedulerWorker ? (
                        <>
                          <div className="ops-kv-grid">
                            <span className="ops-kv-label">{opsCopy.health.schedulerWorkerKv.checked}</span><span>{formatDate(health.state.data.schedulerWorker.checkedAt)}</span>
                            <span className="ops-kv-label">{opsCopy.health.schedulerWorkerKv.started}</span><span>{formatDate(health.state.data.schedulerWorker.startedAt)}</span>
                            <span className="ops-kv-label">{opsCopy.health.schedulerWorkerKv.lastSeen}</span><span>{formatDate(health.state.data.schedulerWorker.lastSeenAt)}</span>
                            <span className="ops-kv-label">{opsCopy.health.schedulerWorkerKv.lastJob}</span><span>{health.state.data.schedulerWorker.lastJobName ?? opsCopy.health.none}</span>
                            <span className="ops-kv-label">{opsCopy.health.schedulerWorkerKv.lastProcessed}</span><span>{formatDate(health.state.data.schedulerWorker.lastJobProcessedAt)}</span>
                            <span className="ops-kv-label">{opsCopy.health.schedulerWorkerKv.lastError}</span><span>{health.state.data.schedulerWorker.lastWorkerErrorMessage ?? opsCopy.health.none}</span>
                          </div>
                          <CommandSequenceComponent title={opsCopy.health.workerOperatorActions} items={health.state.data.schedulerWorker.operatorActions} />
                        </>
                      ) : (
                        <EmptyComponent message={opsCopy.health.schedulerWorkerEmpty} />
                      )}
                    </div>
                    <div className="ops-list-card">
                      <strong>{opsCopy.health.eventLedgerTitle}</strong>
                      <HealthAlertListComponent
                        emptyMessage={opsCopy.health.recentAlertsEmpty}
                        items={health.state.data.recentAlerts}
                        title={opsCopy.health.recentAlertsTitle}
                      />
                      <RecentChainEventsComponent
                        emptyMessage={opsCopy.health.duplicateRowsEmpty}
                        items={health.state.data.eventLedger.duplicateRows.map((item) => ({
                          primary: opsCopy.health.duplicateRowPrimary(item.transactionHash, String(item.logIndex)),
                          secondary: opsCopy.health.duplicateRowSecondary(String(item.chainId), String(item.count)),
                        }))}
                        title={opsCopy.health.duplicateRowsTitle}
                      />
                      <RecentChainEventsComponent
                        emptyMessage={opsCopy.health.recentEventsEmpty}
                        items={health.state.data.eventLedger.recentEvents.map((item) => ({
                          primary: item.eventName,
                          secondary: opsCopy.health.recentEventSecondary(String(item.blockNumber), item.transactionHash, formatDate(item.processedAt)),
                        }))}
                        title={opsCopy.health.recentEventsTitle}
                      />
                    </div>
                    <div className="ops-list-card">
                      <strong>{opsCopy.health.latestProjectionTitle}</strong>
                      <div className="ops-kv-grid">
                        <span className="ops-kv-label">{opsCopy.health.projectionKv.latestMarket}</span><span>{health.state.data.projection.latestMarket?.marketId ?? opsCopy.health.none}</span>
                        <span className="ops-kv-label">{opsCopy.health.projectionKv.marketStatus}</span><span>{health.state.data.projection.latestMarket?.chainStatus ? statusLabel('chainMarket', health.state.data.projection.latestMarket.chainStatus) : opsCopy.health.none}</span>
                        <span className="ops-kv-label">{opsCopy.health.projectionKv.latestBet}</span><span>{health.state.data.projection.latestBet?.betId ?? opsCopy.health.none}</span>
                        <span className="ops-kv-label">{opsCopy.health.projectionKv.betSettlement}</span><span>{health.state.data.projection.latestBet?.settlementOutcome ?? opsCopy.health.none}</span>
                        <span className="ops-kv-label">{opsCopy.health.projectionKv.marketSynced}</span><span>{formatDate(health.state.data.projection.latestMarket?.chainSyncedAt ?? null)}</span>
                        <span className="ops-kv-label">{opsCopy.health.projectionKv.betSynced}</span><span>{formatDate(health.state.data.projection.latestBet?.chainSyncedAt ?? null)}</span>
                      </div>
                    </div>
                  </div>
                  <AuditListComponent
                    emptyMessage={opsCopy.health.recentFailuresEmpty}
                    items={health.state.data.failures.recentFailures.map((item) => ({
                      id: `${item.entityType}-${item.entityId}-${item.createdAt}`,
                      entityType: item.entityType,
                      entityId: item.entityId,
                      action: item.action,
                      actorUserId: null,
                      reason: item.reason,
                      note: null,
                      metadata: item.metadata,
                      createdAt: item.createdAt,
                    }))}
                    title={opsCopy.health.recentFailuresTitle}
                  />
                  <div className="ops-list-stack">
                    {health.state.data.stalePayoutMarkets.map((item) => (
                      <div className="ops-list-card" key={item.marketId}>
                        <div className="ops-list-row">
                          <strong>{item.marketId}</strong>
                          <span className="ops-badge ops-badge-yellow">{opsCopy.health.stalePayoutBadge}</span>
                        </div>
                        <p className="ops-muted">
                          {opsCopy.health.stalePayoutDetail(item.propositionId, String(item.unclaimedBetCount))}
                        </p>
                        <div className="ops-actions">
                          <Link className="ops-btn ops-btn-ghost" to={`/zh/ops/propositions/${item.propositionId}`}>{opsCopy.health.openProposition}</Link>
                          <Link className="ops-btn ops-btn-ghost" to={`/zh/ops/takeover?propositionId=${item.propositionId}&marketId=${item.marketId}`}>{opsCopy.health.openTakeover}</Link>
                        </div>
                      </div>
                    ))}
                    {backlogItems.length > 0 ? (
                      <div className="ops-list-card">
                        <div className="ops-section-head">
                          <strong>{opsCopy.health.backlogActionsTitle}</strong>
                          <div className="ops-actions">
                            <label className="ops-inline-toggle">
                              <input
                                aria-label={opsCopy.health.selectAllBacklogAria}
                                checked={allVisibleBacklogSelected}
                                onChange={(event) => toggleSelectAllVisibleBacklog(event.target.checked)}
                                type="checkbox"
                              />
                              <span>{opsCopy.health.selectVisible}</span>
                            </label>
                            <button
                              className="ops-btn ops-btn-ghost"
                              disabled={!hasVisibleBacklogSelection}
                              onClick={() => setSelectedBacklogBetIds([])}
                              type="button"
                            >
                              {opsCopy.health.clearSelection}
                            </button>
                            <button
                              className="ops-btn ops-btn-primary"
                              disabled={busy || !hasVisibleBacklogSelection}
                              onClick={batchReconcileBacklog}
                              type="button"
                            >
                              {opsCopy.health.batchReconcile}
                            </button>
                          </div>
                        </div>
                        <p className="ops-muted">{opsCopy.health.selectedInBacklog(visibleSelectedBacklogItems.length)}</p>
                      </div>
                    ) : null}
                    {backlogItems.map((item) => (
                      <div
                        className={selectedBacklogBetIds.includes(item.betId) ? 'ops-list-card ops-list-card-selected' : 'ops-list-card'}
                        key={item.betId}
                      >
                        <div className="ops-list-row">
                          <div>
                            <strong>{item.betId}</strong>
                            <div>
                              <span className="ops-badge ops-badge-blue">{opsCopy.health.backlogBadge}</span>
                            </div>
                          </div>
                          <label className="ops-inline-toggle">
                            <input
                              aria-label={opsCopy.health.selectBacklogAria(item.betId)}
                              checked={selectedBacklogBetIds.includes(item.betId)}
                              onChange={(event) => toggleBacklogSelection(item.betId, event.target.checked)}
                              type="checkbox"
                            />
                            <span>{opsCopy.health.select}</span>
                          </label>
                        </div>
                        <p className="ops-muted">
                          {opsCopy.health.backlogItemDetail(item.marketId, item.userId, Math.round(item.oldestUnsyncedAgeMs / 1000))}
                        </p>
                        <div className="ops-actions">
                          <button className="ops-btn ops-btn-primary" disabled={busy} onClick={() => reconcileBet(item)} type="button">{opsCopy.health.reconcileBet}</button>
                          <Link className="ops-btn ops-btn-ghost" to={`/zh/ops/takeover?marketId=${item.marketId}&userId=${item.userId}`}>{opsCopy.health.openTakeover}</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <OpsHealthRuntimeContractPanel
            AuditListComponent={AuditListComponent}
            ChecklistListComponent={ChecklistListComponent}
            CommandGroupsComponent={CommandGroupsComponent}
            CommandSequenceComponent={CommandSequenceComponent}
            contract={contract}
            ErrorComponent={ErrorComponent}
            formatDate={formatDate}
            LoadingComponent={LoadingComponent}
            readiness={readiness}
            StringListComponent={StringListComponent}
          />
        </div>

        <OpsHealthAttentionInbox
          EmptyComponent={EmptyComponent}
          attentionItems={attentionItems}
          criticalUnreadAttentionCount={criticalUnreadAttentionCount}
          handledAttentionCount={handledAttentionCount}
          onMarkHandled={markAttentionHandled}
          onMarkRead={markAttentionRead}
          unreadAttentionCount={unreadAttentionCount}
        />
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
