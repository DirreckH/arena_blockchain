import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { arenaApi } from '../features/api/arena-api'
import {
  useOpsAuditEvents,
  useOpsAnomalies,
  useOpsLifecycleDrift,
  useOpsProposition,
  useOpsPropositions,
  useOpsResponseDetail,
  useOpsResponseQueue,
  useOpsReviewQueue,
  useOpsRewardDetail,
  useOpsRewards,
  useOpsRuntimeContract,
  useOpsSampleShortage,
  useOpsValidationChainHealth,
} from '../features/arena/ops-console-data'
import type {
  InternalListSortDirection,
  InternalPropositionEvidenceBundleViewModel,
  OperatorCurrentSummaryViewModel,
  InternalPropositionListSortBy,
  OpsPropositionStatusFilter,
  OpsResponseQueueSortBy,
  OpsRewardSortBy,
  PropositionDispatchSummaryViewModel,
  PropositionValidationRehearsalCheckpointViewModel,
  PropositionValidationRehearsalStepId,
  PropositionValidationRehearsalStepStatus,
  ResponseReviewStatus,
  ResponseReviewWorkflowState,
  RewardLedgerStatus,
  RewardLedgerSourceType,
} from '../features/arena/internal-ops.types'
import { fmtBadgeClass, fmtDate } from '../features/arena/ops-format'
import { opsCopy } from '../features/arena/ops-copy'
import { useAuthSession } from '../features/auth/auth-session'
import { readPersistedOpsActionReceipts, useOpsActionDialog } from './ops/ops-action-dialog'
import { OpsAuditPage as StandaloneOpsAuditPage } from './ops/OpsAuditPage'
import { OpsHealthPage as StandaloneOpsHealthPage } from './ops/OpsHealthPage'
import { OpsPropositionDetailPage as StandaloneOpsPropositionDetailPage } from './ops/OpsPropositionDetailPage'
import { OpsPropositionsPage as StandaloneOpsPropositionsPage } from './ops/OpsPropositionsPage'
import { OpsRespondentProfilePage as StandaloneOpsRespondentProfilePage } from './ops/OpsRespondentProfilePage'
import { OpsResponsesPage as StandaloneOpsResponsesPage } from './ops/OpsResponsesPage'
import { OpsRewardsPage as StandaloneOpsRewardsPage } from './ops/OpsRewardsPage'
import {
  buildAuditEventWorkspaceLink,
  buildOpsAuditThreadRoute,
  buildOpsWorkspaceLink,
  buildRespondentRoute,
  OpsAuditList,
  OpsChecklistList,
  OpsCommandGroups,
  OpsCommandSequence,
  OpsEmpty,
  OpsError,
  OpsFeedback,
  OpsHealthAlertList,
  OpsInlineMetric,
  OpsLoading,
  OpsMetricLinkCard,
  OpsNotFoundDetail,
  OpsRecentChainEvents,
  OpsStringList,
} from './ops/ops-shared-ui'
import { OpsTakeoverPage as StandaloneOpsTakeoverPage } from './ops/OpsTakeoverPage'
import { OpsConfirmDialog } from './OpsConfirmDialog'

type Feedback = {
  tone: 'success' | 'error'
  message: string
  receipt?: string[] | null
}

type PersistedOpsActionReceipt = {
  id: string
  actorUserId: string | null
  title: string
  description: string
  tone: Feedback['tone']
  message: string
  receipt: string[] | null
  createdAt: string
}

type ActionPayload = {
  note: string
  reason: string
}

type PendingAction = {
  title: string
  description: string
  danger?: boolean
  withNote?: boolean
  withReason?: boolean
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  reasonDefaultValue?: string
  successMessage: string
  run: (payload: ActionPayload) => Promise<unknown>
}

type ActionFeedbackOverride = {
  feedback: Feedback
}

type RehearsalCheckpointDraft = {
  stepId: PropositionValidationRehearsalStepId
  status: PropositionValidationRehearsalStepStatus
  reason: string
  note: string
  evidence: string
  txHash: string
  blockNumber: string
}

const DEFAULT_OPS_PAGE_LIMIT = 25
const OPS_PAGE_SIZE_OPTIONS = [10, 25, 50]
const OPS_RECENT_ACTION_RECEIPTS_STORAGE_KEY = 'arena.ops.recentActionReceipts'

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

type OpsRoute =
  | { kind: 'overview' }
  | { kind: 'propositions' }
  | { kind: 'proposition-detail'; propositionId: string }
  | { kind: 'respondent-detail'; userId: string }
  | { kind: 'responses' }
  | { kind: 'rewards' }
  | { kind: 'audit' }
  | { kind: 'health' }
  | { kind: 'takeover' }
  | { kind: 'not-found' }

const OPS_NAV_ITEMS = [
  { href: '/zh/ops', label: opsCopy.nav.overview },
  { href: '/zh/ops/propositions', label: opsCopy.nav.propositions },
  { href: '/zh/ops/responses', label: opsCopy.nav.responses },
  { href: '/zh/ops/rewards', label: opsCopy.nav.rewards },
  { href: '/zh/ops/audit', label: opsCopy.nav.audit },
  { href: '/zh/ops/health', label: opsCopy.nav.health },
  { href: '/zh/ops/takeover', label: opsCopy.nav.takeover },
] as const

export function OpsWorkspaceView({ token }: { token: string }) {
  const location = useLocation()
  const route = parseOpsRoute(location.pathname)
  const { identity } = useAuthSession()
  const operatorName = identity?.sub ?? null
  const operatorRoles = identity?.roles ?? []

  return (
    <main className="ops-console ops-workspace">
      <header className="ops-header">
        <div className="ops-header-main">
          <p className="ops-eyebrow">{opsCopy.shell.eyebrow}</p>
          <h1>{opsCopy.shell.title}</h1>
        </div>
        {operatorName ? (
          <div className="ops-header-aside">
            <span className="ops-header-identity">
              <span className="ops-identity-sub">{operatorName}</span>
            </span>
            {operatorRoles.map((role) => (
              <span className="ops-header-role" key={role}>{role}</span>
            ))}
          </div>
        ) : null}
      </header>

      <nav className="ops-subnav" aria-label={opsCopy.shell.navAria}>
        {OPS_NAV_ITEMS.map((item) => {
          const isActive = route.kind === 'proposition-detail'
            ? item.href === '/zh/ops/propositions'
            : location.pathname === item.href
          return (
            <Link
              key={item.href}
              className={`ops-subnav-link${isActive ? ' active' : ''}`}
              to={item.href}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="ops-breadcrumbs">
        {buildBreadcrumbs(route).map((crumb, index) => (
          <span key={`${crumb.label}-${index}`}>
            {index > 0 ? <span className="ops-breadcrumb-sep">/</span> : null}
            {crumb.href ? <Link to={crumb.href}>{crumb.label}</Link> : crumb.label}
          </span>
        ))}
      </div>

      {route.kind === 'overview' ? <OpsOverviewPage token={token} /> : null}
      {route.kind === 'propositions' ? <OpsPropositionsPage token={token} /> : null}
      {route.kind === 'proposition-detail' ? (
        <OpsPropositionDetailPage propositionId={route.propositionId} token={token} />
      ) : null}
      {route.kind === 'respondent-detail' ? (
        <OpsRespondentProfilePage token={token} userId={route.userId} />
      ) : null}
      {route.kind === 'responses' ? <OpsResponsesPage token={token} /> : null}
      {route.kind === 'rewards' ? <OpsRewardsPage token={token} /> : null}
      {route.kind === 'audit' ? <OpsAuditPage token={token} /> : null}
      {route.kind === 'health' ? <OpsHealthPage token={token} /> : null}
      {route.kind === 'takeover' ? <OpsTakeoverPage token={token} /> : null}
      {route.kind === 'not-found' ? (
        <section className="detail-panel">
          <h2>{opsCopy.shell.notFoundTitle}</h2>
          <p>{opsCopy.shell.notFoundBody}</p>
        </section>
      ) : null}
    </main>
  )
}

function OpsOverviewPage({ token }: { token: string }) {
  const { identity } = useAuthSession()
  const currentUserId = identity?.sub ?? ''
  const reviewQueue = useOpsReviewQueue(token)
  const responses = useOpsResponseQueue(token, { reviewStatus: 'pending_review', limit: 100 })
  const myClaimedReviews = useOpsResponseQueue(
    currentUserId ? token : null,
    currentUserId
      ? { workflowState: 'claimed', claimedByUserId: currentUserId, limit: 100 }
      : undefined,
  )
  const staleClaimQueue = useOpsResponseQueue(token, { claimStaleOnly: true, limit: 100 })
  const rewards = useOpsRewards(token, { status: 'pending' })
  const myAuditLog = useOpsAuditEvents(
    currentUserId ? token : null,
    currentUserId ? { actorUserId: currentUserId, limit: 100 } : undefined,
  )
  const anomalies = useOpsAnomalies(token)
  const shortages = useOpsSampleShortage(token)
  const drift = useOpsLifecycleDrift(token)
  const health = useOpsValidationChainHealth(token)
  const contract = useOpsRuntimeContract(token)
  const recentReceipts = readPersistedOpsActionReceipts(currentUserId).slice(0, 5)

  const runtimeSummary: OperatorCurrentSummaryViewModel | null = contract.state.status === 'ok'
    ? contract.state.data.operatorSummary
    : null
  const chainSummary: OperatorCurrentSummaryViewModel | null = health.state.status === 'ok'
    ? health.state.data?.operatorSummary ?? null
    : null
  const activeSummary = runtimeSummary?.requiresActionNow
    ? runtimeSummary
    : chainSummary?.requiresActionNow
      ? chainSummary
      : runtimeSummary ?? chainSummary
  const todayThroughputCount = myAuditLog.state.status === 'ok'
    ? countTodayIsoItems(myAuditLog.state.data.items)
    : null
  const myActiveReviewCount = myClaimedReviews.state.status === 'ok'
    ? myClaimedReviews.state.data.totalCount
    : null
  const staleClaimCount = staleClaimQueue.state.status === 'ok'
    ? staleClaimQueue.state.data.totalCount
    : null
  const oldestClaimSlaBreachMs = staleClaimQueue.state.status === 'ok'
    ? readOldestClaimSlaBreachMs(staleClaimQueue.state.data.items)
    : null

  return (
    <div className="detail-layout">
      <div className="detail-main-stack">
        <section className="detail-panel">
          <div className="ops-card-grid">
            <OpsMetricLinkCard
              href="/zh/ops/propositions?reviewQueueOnly=true"
              label={opsCopy.overview.propositionsAwaitingReview}
              value={readCount(reviewQueue.state)}
              detail={opsCopy.overview.propositionsAwaitingReviewDetail}
            />
            <OpsMetricLinkCard
              href="/zh/ops/responses?reviewStatus=pending_review"
              label={opsCopy.overview.responsesAwaitingReview}
              value={readCount(responses.state)}
              detail={opsCopy.overview.responsesAwaitingReviewDetail}
            />
            <OpsMetricLinkCard
              href="/zh/ops/rewards?status=pending"
              label={opsCopy.overview.pendingRewards}
              value={readCount(rewards.state)}
              detail={opsCopy.overview.pendingRewardsDetail}
            />
            <OpsMetricLinkCard
              href="/zh/ops/health"
              label={opsCopy.overview.healthAlerts}
              value={sumCounts([
                readCount(anomalies.state),
                readCount(shortages.state),
                readCount(drift.state),
              ])}
              detail={opsCopy.overview.healthAlertsDetail}
            />
            <OpsMetricLinkCard
              href="/zh/ops/health"
              label={opsCopy.overview.releaseReadiness}
              value={
                contract.state.status === 'ok'
                  ? `${contract.state.data.releaseReadiness.completedGateCount}/${contract.state.data.releaseReadiness.totalGateCount}`
                  : '...'
              }
              detail={
                contract.state.status === 'ok'
                  ? contract.state.data.releaseReadiness.status
                  : opsCopy.overview.loading
              }
            />
            <OpsMetricLinkCard
              href="/zh/ops/health"
              label={opsCopy.overview.validationRehearsal}
              value={
                contract.state.status === 'ok'
                  ? contract.state.data.validationRehearsal.status
                  : '...'
              }
              detail={opsCopy.overview.validationRehearsalDetail}
            />
          </div>
        </section>

        <section className="detail-panel">
          <div className="ops-card-grid">
            <OpsMetricLinkCard
              href={currentUserId ? `/zh/ops/audit?actorUserId=${encodeURIComponent(currentUserId)}` : '/zh/ops/audit'}
              label={opsCopy.overview.todayThroughput}
              value={todayThroughputCount === null ? '...' : String(todayThroughputCount)}
              detail={todayThroughputCount === null ? opsCopy.overview.todayThroughputLoading : opsCopy.overview.todayThroughputDetail(todayThroughputCount)}
            />
            <OpsMetricLinkCard
              href={currentUserId ? `/zh/ops/responses?workflowState=claimed&claimedByUserId=${encodeURIComponent(currentUserId)}` : '/zh/ops/responses?workflowState=claimed'}
              label={opsCopy.overview.myActiveReviewLoad}
              value={myActiveReviewCount === null ? '...' : String(myActiveReviewCount)}
              detail={myActiveReviewCount === null ? opsCopy.overview.myActiveReviewLoading : opsCopy.overview.myActiveReviewDetail(myActiveReviewCount)}
            />
            <OpsMetricLinkCard
              href="/zh/ops/responses?claimStaleOnly=true"
              label={opsCopy.overview.claimSlaBreaches}
              value={staleClaimCount === null ? '...' : String(staleClaimCount)}
              detail={
                staleClaimCount === null
                  ? opsCopy.overview.claimSlaLoading
                  : staleClaimCount === 0 || oldestClaimSlaBreachMs === null
                    ? opsCopy.overview.claimSlaNoOverdue
                    : opsCopy.overview.claimSlaOldestOverdue(formatDurationCompact(oldestClaimSlaBreachMs))
              }
            />
          </div>
        </section>

        <section className="detail-panel">
          <div className="ops-section">
            <p className="ops-section-title">{opsCopy.overview.highestPriorityLane}</p>
            {activeSummary ? (
              <div className="ops-summary-card">
                <div className="ops-summary-topline">
                  <span className={`ops-badge ${fmtBadgeClass(activeSummary.status)}`}>{activeSummary.status}</span>
                  <strong>{activeSummary.focusArea}</strong>
                </div>
                <p>{activeSummary.summary}</p>
                {activeSummary.blockers.length > 0 ? (
                  <div>
                    <strong>{opsCopy.overview.blockers}</strong>
                    <ul className="ops-bullet-list">
                      {activeSummary.blockers.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                {activeSummary.operatorActions.length > 0 ? (
                  <div>
                    <strong>{opsCopy.overview.operatorActions}</strong>
                    <ul className="ops-bullet-list">
                      {activeSummary.operatorActions.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                {activeSummary.latestRelevantEvidence ? (
                  <p className="ops-muted">
                    {opsCopy.overview.latestEvidence(activeSummary.latestRelevantEvidence.action, activeSummary.latestRelevantEvidence.reason)}
                  </p>
                ) : null}
              </div>
            ) : (
              <OpsEmpty message={opsCopy.overview.noActivePriorityLane} />
            )}
          </div>
        </section>
      </div>

      <aside className="detail-side-panel ops-side-panel">
        <div className="ops-section">
          <p className="ops-section-title">{opsCopy.overview.quickLinks}</p>
          <div className="ops-side-stack">
            <Link className="ops-pill-link" to="/zh/ops/propositions">{opsCopy.overview.reviewPropositions}</Link>
            <Link className="ops-pill-link" to="/zh/ops/responses?claimStaleOnly=true">{opsCopy.overview.claimStaleResponses}</Link>
            <Link className="ops-pill-link" to="/zh/ops/rewards?status=pending">{opsCopy.overview.checkPendingRewards}</Link>
            <Link className="ops-pill-link" to="/zh/ops/audit">{opsCopy.overview.openAuditLog}</Link>
            {identity?.sub ? (
              <Link className="ops-pill-link" to={`/zh/ops/audit?actorUserId=${encodeURIComponent(identity.sub)}`}>{opsCopy.overview.viewMyAuditTrail}</Link>
            ) : null}
            <Link className="ops-pill-link" to="/zh/ops/takeover">{opsCopy.overview.openTakeoverDesk}</Link>
          </div>
        </div>
        <div className="ops-section">
          <p className="ops-section-title">{opsCopy.overview.myRecentOperations}</p>
          {recentReceipts.length === 0 ? <OpsEmpty message={opsCopy.overview.noRecentOperations} /> : null}
          {recentReceipts.length > 0 ? (
            <div className="ops-list-stack">
              {recentReceipts.map((item) => (
                <div className="ops-list-card" key={item.id}>
                  <div className="ops-list-row">
                    <strong>{item.title}</strong>
                    <span className={`ops-badge ${fmtBadgeClass(item.tone === 'error' ? 'failed' : 'ready')}`}>{item.tone === 'error' ? opsCopy.overview.toneError : opsCopy.overview.toneSuccess}</span>
                  </div>
                  <p className="ops-muted">{item.message}</p>
                  <p className="ops-muted">{fmtDate(item.createdAt)}</p>
                  {item.receipt && item.receipt.length > 0 ? (
                    <ul className="ops-feedback-receipt">
                      {item.receipt.slice(0, 3).map((receiptLine) => <li key={`${item.id}-${receiptLine}`}>{receiptLine}</li>)}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {currentUserId ? (
            <Link className="ops-pill-link" to={`/zh/ops/audit?actorUserId=${encodeURIComponent(currentUserId)}`}>{opsCopy.overview.openFullAuditTrail}</Link>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function OpsPropositionsPage({ token }: { token: string }) {
  return (
    <StandaloneOpsPropositionsPage
      defaultPageLimit={DEFAULT_OPS_PAGE_LIMIT}
      pageSizeOptions={OPS_PAGE_SIZE_OPTIONS}
      readNonNegativeSearchNumber={readNonNegativeSearchNumber}
      readOptionalBoolean={readOptionalBoolean}
      readPositiveSearchNumber={readPositiveSearchNumber}
      token={token}
      updateSearch={updateSearch}
    />
  )
}
function OpsPropositionDetailPage({ propositionId, token }: { propositionId: string; token: string }) {
  return (
    <StandaloneOpsPropositionDetailPage
      propositionId={propositionId}
      token={token}
    />
  )
}

function OpsRespondentProfilePage({ token, userId }: { token: string; userId: string }) {
  return (
    <StandaloneOpsRespondentProfilePage
      EmptyComponent={OpsEmpty}
      ErrorComponent={OpsError}
      InlineMetricComponent={OpsInlineMetric}
      LoadingComponent={OpsLoading}
      formatPercent={formatPercent}
      token={token}
      userId={userId}
    />
  )
}

function OpsResponsesPage({ token }: { token: string }) {
  return (
    <StandaloneOpsResponsesPage
      defaultPageLimit={DEFAULT_OPS_PAGE_LIMIT}
      pageSizeOptions={OPS_PAGE_SIZE_OPTIONS}
      readNonNegativeSearchNumber={readNonNegativeSearchNumber}
      readPositiveSearchNumber={readPositiveSearchNumber}
      token={token}
      updateSearch={updateSearch}
    />
  )
}

function OpsRewardsPage({ token }: { token: string }) {
  return (
    <StandaloneOpsRewardsPage
      defaultPageLimit={DEFAULT_OPS_PAGE_LIMIT}
      pageSizeOptions={OPS_PAGE_SIZE_OPTIONS}
      readNonNegativeSearchNumber={readNonNegativeSearchNumber}
      readPositiveSearchNumber={readPositiveSearchNumber}
      token={token}
      updateSearch={updateSearch}
    />
  )
}

function OpsAuditPage({ token }: { token: string }) {
  return (
    <StandaloneOpsAuditPage
      EmptyComponent={OpsEmpty}
      ErrorComponent={OpsError}
      buildAuditEventWorkspaceLink={buildAuditEventWorkspaceLink}
      defaultPageLimit={DEFAULT_OPS_PAGE_LIMIT}
      pageSizeOptions={OPS_PAGE_SIZE_OPTIONS}
      readNonNegativeSearchNumber={readNonNegativeSearchNumber}
      readPositiveSearchNumber={readPositiveSearchNumber}
      token={token}
      updateSearch={updateSearch}
    />
  )
}

function OpsHealthPage({ token }: { token: string }) {
  const [actions, pendingAction, busy, feedback, setPendingAction, confirmAction] = useOpsActionDialog()

  return (
    <StandaloneOpsHealthPage
      AuditListComponent={OpsAuditList}
      ChecklistListComponent={OpsChecklistList}
      CommandGroupsComponent={OpsCommandGroups}
      CommandSequenceComponent={OpsCommandSequence}
      EmptyComponent={OpsEmpty}
      ErrorComponent={OpsError}
      FeedbackComponent={OpsFeedback}
      HealthAlertListComponent={OpsHealthAlertList}
      InlineMetricComponent={OpsInlineMetric}
      LoadingComponent={OpsLoading}
      RecentChainEventsComponent={OpsRecentChainEvents}
      StringListComponent={OpsStringList}
      actions={actions}
      buildOpsAuditThreadRoute={buildOpsAuditThreadRoute}
      buildOpsWorkspaceLink={buildOpsWorkspaceLink}
      busy={busy}
      confirmAction={confirmAction}
      feedback={feedback}
      formatDate={fmtDate}
      pendingAction={pendingAction}
      setPendingAction={setPendingAction}
      token={token}
    />
  )
}
function OpsTakeoverPage({ token }: { token: string; }) {
  const [actions, pendingAction, busy, feedback, setPendingAction, confirmAction] = useOpsActionDialog()

  return (
    <StandaloneOpsTakeoverPage
      CommandSequenceComponent={OpsCommandSequence}
      EmptyComponent={OpsEmpty}
      ErrorComponent={OpsError}
      FeedbackComponent={OpsFeedback}
      LoadingComponent={OpsLoading}
      actions={actions}
      busy={busy}
      confirmAction={confirmAction}
      feedback={feedback}
      pendingAction={pendingAction}
      setPendingAction={setPendingAction}
      token={token}
      updateSearch={updateSearch}
    />
  )
}

function buildBreadcrumbs(route: OpsRoute): Array<{ label: string; href?: string }> {
  switch (route.kind) {
    case 'audit':
      return [{ label: opsCopy.crumbs.ops, href: '/zh/ops' }, { label: opsCopy.crumbs.audit }]
    case 'overview':
      return [{ label: opsCopy.crumbs.ops }]
    case 'propositions':
      return [{ label: opsCopy.crumbs.ops, href: '/zh/ops' }, { label: opsCopy.crumbs.propositions }]
    case 'proposition-detail':
      return [
        { label: opsCopy.crumbs.ops, href: '/zh/ops' },
        { label: opsCopy.crumbs.propositions, href: '/zh/ops/propositions' },
        { label: route.propositionId },
      ]
    case 'respondent-detail':
      return [
        { label: opsCopy.crumbs.ops, href: '/zh/ops' },
        { label: opsCopy.crumbs.respondents },
        { label: route.userId },
      ]
    case 'responses':
      return [{ label: opsCopy.crumbs.ops, href: '/zh/ops' }, { label: opsCopy.crumbs.responses }]
    case 'rewards':
      return [{ label: opsCopy.crumbs.ops, href: '/zh/ops' }, { label: opsCopy.crumbs.rewards }]
    case 'health':
      return [{ label: opsCopy.crumbs.ops, href: '/zh/ops' }, { label: opsCopy.crumbs.health }]
    case 'takeover':
      return [{ label: opsCopy.crumbs.ops, href: '/zh/ops' }, { label: opsCopy.crumbs.takeover }]
    default:
      return [{ label: opsCopy.crumbs.ops, href: '/zh/ops' }, { label: opsCopy.crumbs.notFound }]
  }
}

function parseOpsRoute(pathname: string): OpsRoute {
  if (pathname === '/zh/ops') return { kind: 'overview' }
  if (pathname === '/zh/ops/propositions') return { kind: 'propositions' }
  if (pathname.startsWith('/zh/ops/respondents/')) {
    const userId = pathname.slice('/zh/ops/respondents/'.length)
    return userId ? { kind: 'respondent-detail', userId } : { kind: 'not-found' }
  }
  if (pathname === '/zh/ops/responses') return { kind: 'responses' }
  if (pathname === '/zh/ops/rewards') return { kind: 'rewards' }
  if (pathname === '/zh/ops/audit') return { kind: 'audit' }
  if (pathname === '/zh/ops/health') return { kind: 'health' }
  if (pathname === '/zh/ops/takeover') return { kind: 'takeover' }
  if (pathname.startsWith('/zh/ops/propositions/')) {
    const propositionId = pathname.slice('/zh/ops/propositions/'.length)
    return propositionId ? { kind: 'proposition-detail', propositionId } : { kind: 'not-found' }
  }
  return { kind: 'not-found' }
}

function updateSearch(
  navigate: ReturnType<typeof useNavigate>,
  location: ReturnType<typeof useLocation>,
  values: Record<string, string | undefined>,
) {
  const next = new URLSearchParams(location.search)
  Object.entries(values).forEach(([key, value]) => {
    if (!value) {
      next.delete(key)
    } else {
      next.set(key, value)
    }
  })
  navigate({
    pathname: location.pathname,
    search: next.size > 0 ? `?${next.toString()}` : '',
  })
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function countTodayIsoItems(items: Array<{ createdAt: string }>): number {
  const now = new Date()
  return items.filter((item) => {
    const value = new Date(item.createdAt)
    return value.getFullYear() === now.getFullYear()
      && value.getMonth() === now.getMonth()
      && value.getDate() === now.getDate()
  }).length
}

function readOldestClaimSlaBreachMs(
  items: Array<{ submittedAt: string; claimStaleAfterSeconds: number }>,
): number | null {
  const now = Date.now()
  const overdueDurations = items
    .map((item) => now - (new Date(item.submittedAt).getTime() + item.claimStaleAfterSeconds * 1000))
    .filter((value) => Number.isFinite(value) && value > 0)

  if (overdueDurations.length === 0) {
    return null
  }

  return Math.max(...overdueDurations)
}

function formatDurationCompact(valueMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(valueMs / 60_000))
  if (totalMinutes < 1) {
    return '<1m'
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) {
    return `${minutes}m`
  }
  if (minutes === 0) {
    return `${hours}h`
  }
  return `${hours}h ${minutes}m`
}

function readOptionalBoolean(value: string | null): boolean | undefined {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function readCount(state: { status: string; data?: unknown }): string {
  if (state.status !== 'ok' || state.data === undefined || state.data === null) {
    return '...'
  }

  if (Array.isArray(state.data)) {
    return String(state.data.length)
  }

  if (typeof state.data === 'object' && state.data !== null && 'items' in state.data) {
    const page = state.data as { items?: unknown[]; totalCount?: number }
    if (typeof page.totalCount === 'number') {
      return String(page.totalCount)
    }
    return Array.isArray(page.items) ? String(page.items.length) : '...'
  }

  return '...'
}

function readPositiveSearchNumber(
  search: URLSearchParams,
  key: string,
  fallback: number,
): number {
  const raw = search.get(key)
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return Math.trunc(parsed)
}

function readNonNegativeSearchNumber(
  search: URLSearchParams,
  key: string,
  fallback: number,
): number {
  const raw = search.get(key)
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return Math.trunc(parsed)
}

function sumCounts(values: string[]): string {
  if (values.some((value) => value === '...')) return '...'
  return String(values.reduce((sum, value) => sum + Number(value), 0))
}

