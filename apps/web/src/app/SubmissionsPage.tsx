import { ChevronDown, ChevronUp, Download, FileClock, LogIn, Pencil, Play, Plus, Search, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { WalletStatusCard } from '../components/shared/WalletStatusCard'
import {
  buildDraftTags,
  formatCategoryLabel,
  formatRelativeTime,
} from '../features/arena/arena-ui-mappers'
import {
  arenaApi,
  type CreateRequesterComparisonSetDeliveryPolicyInputRecord,
  type RequesterComparisonSetDeliveryRunReplayFilterRecord,
  type RequesterComparisonSetDeliveryRunStatusFilterRecord,
  type RequesterComparisonSetDeliveryRunTriggerTypeFilterRecord,
  type RequesterComparisonSetExportListRecord,
  type RequesterComparisonSetExportOriginFilterRecord,
  type RequesterComparisonSetDeliveryPolicyHealthRecord,
  type RequesterComparisonSetDeliveryPolicyListRecord,
  type RequesterComparisonSetDeliveryRunListRecord,
  type RequesterComparisonSetDeliveryPolicyRunRecord,
  type RequesterComparisonSetDeliveryRunRetryRecord,
  type RequesterComparisonSetAnalyticsRecord,
  type RequesterComparisonSetExportRecord,
  type RequesterComparisonSetListRecord,
  type PropositionDraftRecord,
  type RequesterOwnedPropositionDetailRecord,
  type RequesterOwnedPropositionExportRecord,
  type RequesterOwnedPropositionExportListRecord,
  type RequesterOwnedPropositionOverviewRecord,
  type RequesterReportPresetListRecord,
  type RequesterOwnedSettledPropositionReportRecord,
  type UpdateRequesterComparisonSetDeliveryPolicyInputRecord,
} from '../features/api/arena-api'
import { useAuthSession } from '../features/auth/auth-session'

type SubmissionCardRecord = {
  propositionId: string
  title: string
  summary: string
  categoryLabel: string
  tags: string[]
  submittedAtLabel: string
  updatedAtLabel: string
  minEffectiveSample: number
  marketEnabled: boolean
}

function toSubmissionCardRecord(draft: PropositionDraftRecord): SubmissionCardRecord {
  return {
    propositionId: draft.propositionId,
    title: draft.title,
    summary: draft.summary,
    categoryLabel: formatCategoryLabel(draft.category),
    tags: buildDraftTags(draft),
    submittedAtLabel: draft.submittedAt ? formatRelativeTime(draft.submittedAt) : 'Just now',
    updatedAtLabel: formatRelativeTime(draft.updatedAt),
    minEffectiveSample: draft.minEffectiveSample,
    marketEnabled: draft.marketEnabled,
  }
}

function buildSourceDetail(_sessionMode: 'real' | 'demo' | 'anonymous', _isAuthenticated: boolean) {
  return undefined
}

function formatSubmissionStatus(status: string) {
  switch (status) {
    case 'submitted':
      return 'Submitted'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'withdrawn':
      return 'Withdrawn'
    case 'archived':
      return 'Archived'
    case 'draft':
    default:
      return 'Draft'
  }
}

function formatLifecycleStatus(status: string) {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'scheduled':
      return 'Scheduled'
    case 'live':
      return 'Live'
    case 'frozen':
      return 'Frozen'
    case 'revealing':
      return 'Revealing'
    case 'settled':
      return 'Settled'
    case 'archived':
      return 'Archived'
    default:
      return status
  }
}

function formatClosureReason(reason: string) {
  switch (reason) {
    case 'min_duration_and_sample_reached':
      return 'Ready when minimum duration and sample threshold are both satisfied.'
    case 'max_duration_reached':
      return 'Ready because the maximum run duration has been reached.'
    case 'not_ready':
    default:
      return 'Not ready for freeze or settlement yet.'
  }
}

export function formatExportTime(isoTimestamp: string) {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatResultKindLabel(resultKind: string) {
  switch (resultKind) {
    case 'resolved':
      return 'Resolved'
    case 'void':
      return 'Void'
    default:
      return resultKind
  }
}

function formatTopCategoryLabel(
  analytics: RequesterOwnedPropositionExportRecord['analytics'],
) {
  const topCategory = analytics.categoryHistory[0]
  if (!topCategory) {
    return 'No category data'
  }

  return formatCategoryLabel(topCategory.category)
}

function formatDeliveryHealthStatus(status: string) {
  switch (status) {
    case 'scheduled':
      return 'Scheduled'
    case 'due':
      return 'Due'
    case 'failing':
      return 'Failing'
    case 'disabled':
      return 'Disabled'
    default:
      return status
  }
}

function formatDeliveryRunStatus(status: string | null) {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    default:
      return 'Not run yet'
  }
}

function formatDeliveryHealthDetail(
  health: RequesterComparisonSetDeliveryPolicyHealthRecord['health'],
) {
  const transportSummary =
    health.transport.status === 'ready' ? 'Transport ready' : 'Transport blocked'
  const snapshotSummary = `Snapshot checked ${formatExportTime(health.checkedAt)}`

  if (health.runCounts.totalCount > 0) {
    return `${health.runCounts.totalCount} runs · ${transportSummary} · ${snapshotSummary}`
  }

  return health.transport.status === 'blocked'
    ? `No delivery runs yet · ${transportSummary} · ${snapshotSummary}`
    : `No delivery runs yet · ${snapshotSummary}`
}

function formatDeliveryRunArtifactDetail(exportId: string | null) {
  return exportId
    ? `Retained export ${exportId}`
    : 'No retained export artifact'
}

function formatRetainedExportActionLabel(
  available: boolean,
  fallback: 'Open latest export' | 'Open retained export',
) {
  return available ? fallback : 'Export pruned'
}

function formatDeliveryRetryArtifactDetail(
  exportId: string,
  retainedExportAvailable = true,
) {
  return retainedExportAvailable
    ? `Reused retained export ${exportId}`
    : `Reused retained export ${exportId} is no longer available`
}

function formatDeliveryRunProvenanceDetail(
  run: RequesterComparisonSetDeliveryRunListRecord['items'][number],
) {
  return run.retriedRunId
    ? run.exportId && !run.retainedExportAvailable
      ? `Retried failed run ${run.retriedRunId} · Retained export ${run.exportId} is no longer available`
      : `Retried failed run ${run.retriedRunId}`
    : run.exportId && !run.retainedExportAvailable
      ? `Retained export ${run.exportId} is no longer available`
      : `${formatDeliveryRunArtifactDetail(run.exportId)}`
}

function formatDeliveryTransportAuthenticationDetail(
  delivery: RequesterComparisonSetDeliveryPolicyRunRecord['delivery']
    | RequesterComparisonSetDeliveryRunRetryRecord['delivery']
    | RequesterComparisonSetDeliveryRunListRecord['items'][number]['delivery'],
) {
  if (!delivery) {
    return 'No downstream transport'
  }

  if (delivery.authentication.kind === 'bearer') {
    return delivery.authentication.credentialKey
      ? `Bearer credential ${delivery.authentication.credentialKey}`
      : 'Bearer delivery without a credential binding'
  }

  return 'No downstream authentication'
}

function formatDeliveryRunTransportSummary(
  delivery: RequesterComparisonSetDeliveryRunListRecord['items'][number]['delivery'],
) {
  if (!delivery) {
    return 'No downstream transport'
  }

  return `HTTP ${delivery.statusCode} 路 ${formatDeliveryTransportAuthenticationDetail(delivery)}`
}

function formatDeliveryTransportBlockingReason(
  blockingReason: RequesterComparisonSetDeliveryPolicyHealthRecord['health']['transport']['blockingReason'],
) {
  switch (blockingReason) {
    case 'transport_credential_missing':
      return 'Missing credential binding'
    default:
      return 'No transport block'
  }
}

function formatDeliveryFailureStreak(count: number) {
  return count === 1 ? '1 consecutive failure' : `${count} consecutive failures`
}

function formatDeliveryLastError(
  error: RequesterComparisonSetDeliveryPolicyHealthRecord['policy']['lastRunError'],
) {
  return error?.message ?? 'No recent run error'
}

function formatDeliveryRunTimingSummary(
  health: RequesterComparisonSetDeliveryPolicyHealthRecord['health'],
) {
  const completedSummary = health.lastCompletedRunAt
    ? `Last completed ${formatExportTime(health.lastCompletedRunAt)}`
    : 'Last completed not yet available'
  const failedSummary = health.lastFailedRunAt
    ? `Last failed ${formatExportTime(health.lastFailedRunAt)}`
    : 'Last failed not yet available'

  return `${completedSummary} · ${failedSummary}`
}

function formatDeliveryLagSeconds(lagSeconds: number) {
  if (lagSeconds < 60) {
    return `${lagSeconds}s`
  }

  const minutes = Math.floor(lagSeconds / 60)
  const seconds = lagSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function formatDeliverySchedulerDetail(
  policy: RequesterComparisonSetDeliveryPolicyHealthRecord['policy'],
  health: RequesterComparisonSetDeliveryPolicyHealthRecord['health'],
) {
  const nextRunSummary = `Next run ${formatExportTime(policy.nextRunAt)}`
  if (!health.isDue) {
    return nextRunSummary
  }

  return `${nextRunSummary} · Overdue by ${formatDeliveryLagSeconds(health.lagSeconds)}`
}

function formatDeliveryRunTriggerType(
  triggerType: NonNullable<
    RequesterComparisonSetDeliveryPolicyHealthRecord['health']['latestRun']
  >['triggerType'],
) {
  switch (triggerType) {
    case 'manual':
      return 'Manual'
    case 'automation':
      return 'Automation'
    default:
      return triggerType
  }
}

function formatDeliveryRunReplayFilter(
  replay: RequesterComparisonSetDeliveryRunReplayFilterRecord,
) {
  switch (replay) {
    case 'fresh_only':
      return 'Fresh runs only'
    case 'replayed_only':
      return 'Replay runs only'
    default:
      return 'All provenance'
  }
}

function formatDeliveryRunHistorySummary(
  runs: RequesterComparisonSetDeliveryRunListRecord,
) {
  const scopeParts: string[] = []
  if (runs.appliedFilters.status) {
    scopeParts.push(`${formatDeliveryRunStatus(runs.appliedFilters.status)} only`)
  }
  if (runs.appliedFilters.triggerType) {
    scopeParts.push(`${formatDeliveryRunTriggerType(runs.appliedFilters.triggerType)} only`)
  }
  if (runs.appliedFilters.replay !== 'all') {
    scopeParts.push(formatDeliveryRunReplayFilter(runs.appliedFilters.replay))
  }

  const scopeLabel =
    scopeParts.length > 0 ? scopeParts.join(' · ') : 'All retained delivery runs'

  if (runs.totalCount < runs.storedCount) {
    return `${scopeLabel} · Showing ${runs.totalCount} of ${runs.storedCount} stored runs`
  }

  return `${scopeLabel} · ${runs.totalCount} stored runs`
}

function formatDeliveryLatestRunDetail(
  health: RequesterComparisonSetDeliveryPolicyHealthRecord['health'],
) {
  if (!health.latestRun) {
    return 'Latest run not yet available'
  }

  const latestRunSummary = health.latestRun.retriedRunId
    ? `Retried failed run ${health.latestRun.retriedRunId}`
    : `${formatDeliveryRunTriggerType(health.latestRun.triggerType)} run ${formatDeliveryRunStatus(
        health.latestRun.status,
      ).toLowerCase()}`

  const artifactSummary =
    health.latestRun.exportId && !health.latestRun.retainedExportAvailable
      ? `Retained export ${health.latestRun.exportId} was pruned`
      : formatDeliveryRunArtifactDetail(health.latestRun.exportId)

  return `${latestRunSummary} 路 ${artifactSummary}`
}

export function formatDeliveryLatestExportAgreementDetail(
  focusedHealth: RequesterComparisonSetDeliveryPolicyHealthRecord['health'] | null,
  selectedHealth: RequesterComparisonSetDeliveryPolicyHealthRecord['health'],
) {
  const focusedRun = focusedHealth?.latestRun ?? null
  const selectedRun = selectedHealth.latestRun ?? null
  const focusedExportId = focusedRun?.exportId ?? null
  const selectedExportId = selectedRun?.exportId ?? null
  const focusedExportAvailable = focusedRun?.retainedExportAvailable ?? false
  const selectedExportAvailable = selectedRun?.retainedExportAvailable ?? false
  const focusedCheckedAt = focusedHealth?.checkedAt ?? null
  const selectedCheckedAt = selectedHealth.checkedAt
  const focusedIsFresher =
    focusedCheckedAt !== null
    && Date.parse(focusedCheckedAt) > Date.parse(selectedCheckedAt)
  const selectedIsFresher =
    focusedCheckedAt !== null
    && Date.parse(selectedCheckedAt) > Date.parse(focusedCheckedAt)

  if (!focusedExportId && !selectedExportId) {
    return `Focused summary and health panel both have no retained export evidence yet · Health snapshot checked ${formatExportTime(selectedCheckedAt)}`
  }

  if (focusedExportId && selectedExportId && focusedExportId === selectedExportId) {
    if (!focusedExportAvailable && !selectedExportAvailable) {
      return `Focused summary and health panel both reference export ${selectedExportId}, but it is no longer retained · Health snapshot checked ${formatExportTime(selectedCheckedAt)}`
    }

    if (!focusedExportAvailable && selectedExportAvailable) {
      const freshnessDetail = selectedIsFresher
        ? `this health panel is fresher than the focused summary snapshot from ${formatExportTime(focusedCheckedAt)}`
        : `this health snapshot was checked ${formatExportTime(selectedCheckedAt)}`

      return `Health panel still has retained export ${selectedExportId} available, but the focused summary no longer has this retained export available · ${freshnessDetail}`
    }

    if (focusedExportAvailable && !selectedExportAvailable) {
      return `Focused summary still has retained export ${selectedExportId} available, but this health panel no longer has this retained export available · this health snapshot was checked ${formatExportTime(selectedCheckedAt)}`
    }

    return `Focused summary matches this retained export: ${selectedExportId} · Health snapshot checked ${formatExportTime(selectedCheckedAt)}`
  }

  if (!focusedExportId && selectedExportId) {
    if (!selectedExportAvailable) {
      return `Health panel still references export ${selectedExportId}, but it is no longer retained while the focused summary has no retained export evidence · this health snapshot was checked ${formatExportTime(selectedCheckedAt)}`
    }

    const freshnessDetail = selectedIsFresher
      ? `this health panel is fresher than the focused summary snapshot from ${formatExportTime(focusedCheckedAt)}`
      : `this health snapshot was checked ${formatExportTime(selectedCheckedAt)}`

    return `Health panel has retained export ${selectedExportId}, but the focused summary has not refreshed yet · ${freshnessDetail}`
  }

  if (focusedExportId && !selectedExportId) {
    return focusedExportAvailable
      ? `Focused summary still references retained export ${focusedExportId}, but this health panel has no retained export evidence · this health snapshot was checked ${formatExportTime(selectedCheckedAt)}`
      : `Focused summary still references export ${focusedExportId}, but it is no longer retained and this health panel has no retained export evidence · this health snapshot was checked ${formatExportTime(selectedCheckedAt)}`
  }

  const freshnessDetail = focusedIsFresher
    ? `the focused summary is fresher than this health snapshot from ${formatExportTime(selectedCheckedAt)}`
    : `this health snapshot was checked ${formatExportTime(selectedCheckedAt)}`

  return `Focused summary references retained export ${focusedExportId}, while this health panel references ${selectedExportId} · ${freshnessDetail}`
}

export function formatDeliveryRowExportAgreementDetail(
  rowHealth: RequesterComparisonSetDeliveryPolicyHealthRecord['health'] | null,
  selectedHealth: RequesterComparisonSetDeliveryPolicyHealthRecord['health'] | null,
) {
  const rowRun = rowHealth?.latestRun ?? null
  const selectedRun = selectedHealth?.latestRun ?? null
  const rowExportId = rowRun?.exportId ?? null
  const selectedExportId = selectedRun?.exportId ?? null
  const rowExportAvailable = rowRun?.retainedExportAvailable ?? false
  const selectedExportAvailable = selectedRun?.retainedExportAvailable ?? false
  const rowCheckedAt = rowHealth?.checkedAt ?? null
  const selectedCheckedAt = selectedHealth?.checkedAt ?? null
  const rowIsFresher =
    rowCheckedAt !== null
    && selectedCheckedAt !== null
    && Date.parse(rowCheckedAt) > Date.parse(selectedCheckedAt)
  const selectedIsFresher =
    rowCheckedAt !== null
    && selectedCheckedAt !== null
    && Date.parse(selectedCheckedAt) > Date.parse(rowCheckedAt)

  if (!selectedHealth) {
    if (!rowHealth) {
      return 'Refreshing retained-export agreement.'
    }

    const rowSnapshotSummary = `Snapshot checked ${formatExportTime(rowHealth.checkedAt)}`

    return rowExportId
      ? rowExportAvailable
        ? `This row currently references retained export ${rowExportId} · ${rowSnapshotSummary} · Open this policy health panel to compare retained-export evidence.`
        : `This row still references export ${rowExportId}, but it is no longer retained · ${rowSnapshotSummary} · Open this policy health panel to compare retained-export evidence.`
      : `This row has no retained export evidence yet · ${rowSnapshotSummary} · Open this policy health panel to compare retained-export evidence.`
  }

  if (!rowExportId && !selectedExportId) {
    return `This row and the open health panel both have no retained export evidence yet · Health snapshot checked ${formatExportTime(selectedHealth.checkedAt)}`
  }

  if (rowExportId && selectedExportId && rowExportId === selectedExportId) {
    if (!rowExportAvailable && !selectedExportAvailable) {
      return `This row and the open health panel both reference export ${selectedExportId}, but it is no longer retained · Health snapshot checked ${formatExportTime(selectedHealth.checkedAt)}`
    }

    if (!rowExportAvailable && selectedExportAvailable) {
      const freshnessDetail = selectedIsFresher
        ? `this open health panel is fresher than the row snapshot from ${formatExportTime(rowCheckedAt)}`
        : `the open health snapshot was checked ${formatExportTime(selectedHealth.checkedAt)}`

      return `The open health panel still has retained export ${selectedExportId} available, but this row no longer has this retained export available · ${freshnessDetail}`
    }

    if (rowExportAvailable && !selectedExportAvailable) {
      return `This row still has retained export ${selectedExportId} available, but the open health panel no longer has this retained export available · the open health snapshot was checked ${formatExportTime(selectedHealth.checkedAt)}`
    }

    return `This row matches the open health panel retained export: ${selectedExportId} · Health snapshot checked ${formatExportTime(selectedHealth.checkedAt)}`
  }

  if (!rowExportId && selectedExportId) {
    if (!selectedExportAvailable) {
      return `The open health panel still references export ${selectedExportId}, but it is no longer retained while this row has no retained export evidence · the open health snapshot was checked ${formatExportTime(selectedHealth.checkedAt)}`
    }

    const freshnessDetail = selectedIsFresher
      ? `this open health panel is fresher than the row snapshot from ${formatExportTime(rowCheckedAt)}`
      : `the open health snapshot was checked ${formatExportTime(selectedHealth.checkedAt)}`

    return `The open health panel has retained export ${selectedExportId}, but this row has not refreshed yet · ${freshnessDetail}`
  }

  if (rowExportId && !selectedExportId) {
    return rowExportAvailable
      ? `This row still references retained export ${rowExportId}, but the open health panel has no retained export evidence · the open health snapshot was checked ${formatExportTime(selectedHealth.checkedAt)}`
      : `This row still references export ${rowExportId}, but it is no longer retained and the open health panel has no retained export evidence · the open health snapshot was checked ${formatExportTime(selectedHealth.checkedAt)}`
  }

  const freshnessDetail = rowIsFresher
    ? `this row is fresher than the open health snapshot from ${formatExportTime(selectedHealth.checkedAt)}`
    : `the open health snapshot was checked ${formatExportTime(selectedHealth.checkedAt)}`

  return `This row references retained export ${rowExportId}, while the open health panel references ${selectedExportId} · ${freshnessDetail}`
}

type ComparisonDeliveryFormState = {
  comparisonSetId: string
  policyId: string | null
  name: string
  description: string
  nextRunAt: string
  enabled: boolean
  retainedExportCount: string
  targetUrl: string
  credentialKey: string
}

type ComparisonExportFiltersState = {
  comparisonSetId: string
  origin: '' | RequesterComparisonSetExportOriginFilterRecord
  policyId: string
  limit: '5' | '10' | '20'
}

type ComparisonRunFiltersState = {
  comparisonSetId: string
  policyId: string
  status: '' | RequesterComparisonSetDeliveryRunStatusFilterRecord
  triggerType: '' | RequesterComparisonSetDeliveryRunTriggerTypeFilterRecord
  replay: RequesterComparisonSetDeliveryRunReplayFilterRecord
  limit: '1' | '5' | '10'
}

type ComparisonDeliveryFocusState = {
  comparisonSetId: string
  policyId: string | null
}

function buildComparisonDeliveryHealthKey(comparisonSetId: string, policyId: string) {
  return `${comparisonSetId}:${policyId}`
}

function toDeliveryDatetimeInputValue(isoTimestamp: string) {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp.slice(0, 16)
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return offsetDate.toISOString().slice(0, 16)
}

function fromDeliveryDatetimeInputValue(value: string) {
  return new Date(value).toISOString()
}

function buildCreateComparisonDeliveryFormState(
  comparisonSetId: string,
): ComparisonDeliveryFormState {
  return {
    comparisonSetId,
    policyId: null,
    name: 'Daily requester digest',
    description: 'Deliver requester comparison exports into the downstream reporting pipeline.',
    nextRunAt: toDeliveryDatetimeInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
    enabled: true,
    retainedExportCount: '5',
    targetUrl: 'https://example.arena.test/requester-deliveries',
    credentialKey: 'ARENA_REQUESTER_WEBHOOK_BEARER',
  }
}

function buildEditComparisonDeliveryFormState(
  policy: RequesterComparisonSetDeliveryPolicyListRecord['items'][number],
): ComparisonDeliveryFormState {
  return {
    comparisonSetId: policy.comparisonSetId,
    policyId: policy.policyId,
    name: policy.name,
    description: policy.description ?? '',
    nextRunAt: toDeliveryDatetimeInputValue(policy.nextRunAt),
    enabled: policy.enabled,
    retainedExportCount: String(policy.retainedExportCount),
    targetUrl: policy.transport?.type === 'webhook' ? policy.transport.targetUrl : '',
    credentialKey:
      policy.transport?.type === 'webhook' ? (policy.transport.credentialKey ?? '') : '',
  }
}

export function SubmissionsPage() {
  const { token, isAuthenticated, sessionMode } = useAuthSession()
  const [submissions, setSubmissions] = useState<SubmissionCardRecord[]>([])
  const [overview, setOverview] = useState<RequesterOwnedPropositionOverviewRecord | null>(null)
  const [detailById, setDetailById] = useState<Record<string, RequesterOwnedPropositionDetailRecord>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exportsView, setExportsView] = useState<RequesterOwnedPropositionExportListRecord | null>(null)
  const [reportPresets, setReportPresets] = useState<RequesterReportPresetListRecord | null>(null)
  const [comparisonSets, setComparisonSets] = useState<RequesterComparisonSetListRecord | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const [selectedExport, setSelectedExport] = useState<RequesterOwnedPropositionExportRecord | null>(null)
  const [selectedComparisonAnalytics, setSelectedComparisonAnalytics] =
    useState<RequesterComparisonSetAnalyticsRecord | null>(null)
  const [selectedComparisonExports, setSelectedComparisonExports] =
    useState<RequesterComparisonSetExportListRecord | null>(null)
  const [selectedComparisonExport, setSelectedComparisonExport] =
    useState<RequesterComparisonSetExportRecord | null>(null)
  const [selectedComparisonDeliveryPolicies, setSelectedComparisonDeliveryPolicies] =
    useState<RequesterComparisonSetDeliveryPolicyListRecord | null>(null)
  const [selectedComparisonDeliveryHealth, setSelectedComparisonDeliveryHealth] =
    useState<RequesterComparisonSetDeliveryPolicyHealthRecord | null>(null)
  const [selectedComparisonDeliveryRun, setSelectedComparisonDeliveryRun] =
    useState<RequesterComparisonSetDeliveryPolicyRunRecord | null>(null)
  const [selectedComparisonDeliveryRuns, setSelectedComparisonDeliveryRuns] =
    useState<RequesterComparisonSetDeliveryRunListRecord | null>(null)
  const [selectedComparisonDeliveryRetry, setSelectedComparisonDeliveryRetry] =
    useState<RequesterComparisonSetDeliveryRunRetryRecord | null>(null)
  const [focusedComparisonDeliveryHealth, setFocusedComparisonDeliveryHealth] =
    useState<RequesterComparisonSetDeliveryPolicyHealthRecord | null>(null)
  const [comparisonDeliveryHealthByPolicyId, setComparisonDeliveryHealthByPolicyId] =
    useState<Record<string, RequesterComparisonSetDeliveryPolicyHealthRecord>>({})
  const [comparisonDeliveryForm, setComparisonDeliveryForm] =
    useState<ComparisonDeliveryFormState | null>(null)
  const [comparisonDeliveryFocus, setComparisonDeliveryFocus] =
    useState<ComparisonDeliveryFocusState | null>(null)
  const [comparisonDeliveryHealthRefreshNonce, setComparisonDeliveryHealthRefreshNonce] =
    useState(0)
  const [comparisonExportFilters, setComparisonExportFilters] =
    useState<ComparisonExportFiltersState | null>(null)
  const [comparisonRunFilters, setComparisonRunFilters] =
    useState<ComparisonRunFiltersState | null>(null)
  const [selectedSettledReport, setSelectedSettledReport] =
    useState<RequesterOwnedSettledPropositionReportRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingWithdrawId, setPendingWithdrawId] = useState<string | null>(null)
  const [pendingDetailId, setPendingDetailId] = useState<string | null>(null)
  const [pendingExport, setPendingExport] = useState(false)
  const [pendingExportId, setPendingExportId] = useState<string | null>(null)
  const [pendingReportId, setPendingReportId] = useState<string | null>(null)
  const [pendingComparisonExportId, setPendingComparisonExportId] = useState<string | null>(null)
  const [pendingComparisonPolicyId, setPendingComparisonPolicyId] = useState<string | null>(null)
  const [pendingComparisonDeliverySave, setPendingComparisonDeliverySave] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setSubmissions([])
      setOverview(null)
      setDetailById({})
      setExpandedId(null)
      setExportsView(null)
      setReportPresets(null)
      setComparisonSets(null)
      setSelectedPresetId('')
      setSelectedExport(null)
      setSelectedComparisonAnalytics(null)
      setSelectedComparisonExports(null)
      setSelectedComparisonExport(null)
      setSelectedComparisonDeliveryPolicies(null)
      setSelectedComparisonDeliveryHealth(null)
      setSelectedComparisonDeliveryRun(null)
      setSelectedComparisonDeliveryRuns(null)
      setSelectedComparisonDeliveryRetry(null)
      setFocusedComparisonDeliveryHealth(null)
      setComparisonDeliveryHealthByPolicyId({})
      setComparisonDeliveryForm(null)
      setComparisonDeliveryFocus(null)
      setComparisonExportFilters(null)
      setComparisonRunFilters(null)
      setSelectedSettledReport(null)
      setIsLoading(false)
      return
    }

    let disposed = false

    void (async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const [submissionRecords, overviewRecord, exportRecords, presetRecords, comparisonSetRecords] = await Promise.all([
          arenaApi.listSubmissions(token),
          arenaApi.getRequesterOverview(token),
          arenaApi.listOwnedPropositionExports(token),
          arenaApi.listRequesterReportPresets(token),
          arenaApi.listRequesterComparisonSets(token),
        ])

        if (disposed) {
          return
        }

        setSubmissions(submissionRecords.map(toSubmissionCardRecord))
        setOverview(overviewRecord)
        setExportsView(exportRecords)
        setReportPresets(presetRecords)
        setComparisonSets(comparisonSetRecords)
        setSelectedPresetId((current) => current || presetRecords.items[0]?.presetId || '')
        setSelectedExport(null)
        setSelectedComparisonAnalytics(null)
        setSelectedComparisonExports(null)
        setSelectedComparisonExport(null)
        setSelectedComparisonDeliveryPolicies(null)
        setSelectedComparisonDeliveryHealth(null)
        setSelectedComparisonDeliveryRun(null)
        setSelectedComparisonDeliveryRuns(null)
        setSelectedComparisonDeliveryRetry(null)
        setFocusedComparisonDeliveryHealth(null)
        setComparisonDeliveryHealthByPolicyId({})
        setComparisonDeliveryForm(null)
        setComparisonDeliveryFocus(null)
        setComparisonExportFilters(null)
        setComparisonRunFilters(null)
        setSelectedSettledReport(null)
      } catch (error) {
        if (disposed) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Failed to load requester submissions')
      } finally {
        if (!disposed) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [isAuthenticated, token])

  const summaryCards = useMemo(() => {
    if (!overview) {
      return []
    }

    return [
      {
        label: 'Submitted',
        value: String(overview.submissionSummary.submittedCount),
        detail: 'Already handed off into the real requester review queue.',
      },
      {
        label: 'Drafts',
        value: String(overview.submissionSummary.draftCount),
        detail: 'Can still be edited, expanded, and submitted again later.',
      },
      {
        label: 'Market-enabled',
        value: String(overview.marketSummary.enabledCount),
        detail: 'Retain the capability to later open a validation market.',
      },
      {
        label: 'Unresolved',
        value: String(overview.resultSummary.unresolvedHiddenCount),
        detail: 'Still hidden from directional result disclosure before settlement.',
      },
    ]
  }, [overview])

  const focusedComparisonDeliveryPolicy = useMemo(() => {
    if (!selectedComparisonDeliveryPolicies) {
      return null
    }

    const fallbackPolicy = selectedComparisonDeliveryPolicies.items[0] ?? null

    if (
      !comparisonDeliveryFocus
      || comparisonDeliveryFocus.comparisonSetId !== selectedComparisonDeliveryPolicies.comparisonSetId
    ) {
      return fallbackPolicy
    }

    return (
      selectedComparisonDeliveryPolicies.items.find(
        (item) => item.policyId === comparisonDeliveryFocus.policyId,
      ) ?? fallbackPolicy
    )
  }, [comparisonDeliveryFocus, selectedComparisonDeliveryPolicies])

  const focusedComparisonDeliveryHealthSummary = useMemo(() => {
    if (!focusedComparisonDeliveryPolicy) {
      return null
    }

    const focusedKey = buildComparisonDeliveryHealthKey(
      focusedComparisonDeliveryPolicy.comparisonSetId,
      focusedComparisonDeliveryPolicy.policyId,
    )

    if (
      focusedComparisonDeliveryHealth
      && focusedComparisonDeliveryHealth.policy.policyId === focusedComparisonDeliveryPolicy.policyId
      && focusedComparisonDeliveryHealth.policy.comparisonSetId === focusedComparisonDeliveryPolicy.comparisonSetId
    ) {
      return focusedComparisonDeliveryHealth
    }

    return comparisonDeliveryHealthByPolicyId[focusedKey] ?? null
  }, [
    comparisonDeliveryHealthByPolicyId,
    focusedComparisonDeliveryHealth,
    focusedComparisonDeliveryPolicy,
  ])

  const requestComparisonDeliveryHealthRefresh = () => {
    setComparisonDeliveryHealthRefreshNonce((current) => current + 1)
  }

  const syncComparisonDeliveryHealth = (
    health: RequesterComparisonSetDeliveryPolicyHealthRecord,
    options?: {
      openPanel?: boolean
      preserveSelectedPanelSnapshot?: boolean
    },
  ) => {
    const key = buildComparisonDeliveryHealthKey(
      health.policy.comparisonSetId,
      health.policy.policyId,
    )

    setComparisonDeliveryHealthByPolicyId((current) => ({
      ...current,
      [key]: health,
    }))
    setFocusedComparisonDeliveryHealth((current) =>
      current
      && current.policy.comparisonSetId === health.policy.comparisonSetId
      && current.policy.policyId === health.policy.policyId
        ? health
        : current,
    )
    setSelectedComparisonDeliveryHealth((current) =>
      options?.openPanel
      || (
        !options?.preserveSelectedPanelSnapshot
        && current
        && current.policy.comparisonSetId === health.policy.comparisonSetId
        && current.policy.policyId === health.policy.policyId
      )
        ? health
        : current,
    )
  }

  const loadComparisonDeliveryPolicyHealthSummaries = async (
    policies: RequesterComparisonSetDeliveryPolicyListRecord,
    authToken: string,
  ) => {
    const results = await Promise.allSettled(
      policies.items.map(async (policy) => {
        const health = await arenaApi.getRequesterComparisonSetDeliveryPolicyHealth(
          policy.comparisonSetId,
          policy.policyId,
          authToken,
        )

        return [
          buildComparisonDeliveryHealthKey(policy.comparisonSetId, policy.policyId),
          health,
        ] as const
      }),
    )

    const nextHealthByPolicyId = results.reduce<Record<string, RequesterComparisonSetDeliveryPolicyHealthRecord>>(
      (record, result) => {
        if (result.status === 'fulfilled') {
          const [key, health] = result.value
          record[key] = health
        }

        return record
      },
      {},
    )

    setComparisonDeliveryHealthByPolicyId(nextHealthByPolicyId)
  }

  const focusComparisonDeliveryPolicy = (
    comparisonSetId: string,
    policyId: string,
    options?: {
      preserveHealthPanel?: boolean
      preserveLatestRunPanel?: boolean
      preserveRunsPanel?: boolean
      preserveRetryPanel?: boolean
      preserveForm?: boolean
      preserveScopedExports?: boolean
    },
  ) => {
    setComparisonDeliveryFocus({
      comparisonSetId,
      policyId,
    })
    setSelectedComparisonDeliveryHealth((current) =>
      options?.preserveHealthPanel
      || (current?.policy.comparisonSetId === comparisonSetId && current.policy.policyId === policyId)
        ? current
        : null,
    )
    setSelectedComparisonDeliveryRun((current) =>
      options?.preserveLatestRunPanel
      || (current?.policy.comparisonSetId === comparisonSetId && current.policy.policyId === policyId)
        ? current
        : null,
    )
    setSelectedComparisonDeliveryRuns((current) =>
      options?.preserveRunsPanel
      || (current?.comparisonSetId === comparisonSetId && current.policyId === policyId)
        ? current
        : null,
    )
    setSelectedComparisonDeliveryRetry((current) =>
      options?.preserveRetryPanel
      || (current?.policy.comparisonSetId === comparisonSetId && current.policy.policyId === policyId)
        ? current
        : null,
    )
    setComparisonDeliveryForm((current) => {
      if (!current) {
        return current
      }

      if (options?.preserveForm) {
        return current
      }

      return current.comparisonSetId === comparisonSetId && current.policyId === policyId
        ? current
        : null
    })
    setSelectedComparisonExports((current) =>
      options?.preserveScopedExports
      || !comparisonExportFilters?.policyId
      || (
        current?.comparisonSet.comparisonSetId === comparisonSetId
        && comparisonExportFilters.policyId === policyId
      )
        ? current
        : null,
    )
    setComparisonExportFilters((current) =>
      options?.preserveScopedExports
      || !current?.policyId
      || (current.comparisonSetId === comparisonSetId && current.policyId === policyId)
        ? current
        : null,
    )
  }

  useEffect(() => {
    if (!token || !focusedComparisonDeliveryPolicy) {
      setFocusedComparisonDeliveryHealth(null)
      return
    }

    let disposed = false

    void (async () => {
      try {
        const health = await arenaApi.getRequesterComparisonSetDeliveryPolicyHealth(
          focusedComparisonDeliveryPolicy.comparisonSetId,
          focusedComparisonDeliveryPolicy.policyId,
          token,
        )

        if (!disposed) {
          syncComparisonDeliveryHealth(health, {
            preserveSelectedPanelSnapshot: true,
          })
        }
      } catch (error) {
        if (!disposed) {
          setFocusedComparisonDeliveryHealth(null)
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load focused delivery policy health')
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [comparisonDeliveryHealthRefreshNonce, focusedComparisonDeliveryPolicy, token])

  const handleWithdraw = async (propositionId: string) => {
    if (!token) {
      return
    }

    setPendingWithdrawId(propositionId)
    setErrorMessage(null)

    try {
      const nextDraft = await arenaApi.withdrawSubmission(propositionId, undefined, token)
      setSubmissions((current) => current.filter((item) => item.propositionId !== propositionId))
      setDetailById((current) => {
        const next = { ...current }
        delete next[propositionId]
        return next
      })
      setOverview((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          totals: {
            ...current.totals,
            draftCount: current.totals.draftCount + 1,
          },
          submissionSummary: {
            ...current.submissionSummary,
            draftCount: current.submissionSummary.draftCount + 1,
            submittedCount: Math.max(0, current.submissionSummary.submittedCount - 1),
          },
          recent: current.recent.filter((item) => item.propositionId !== propositionId),
        }
      })
      if (expandedId === propositionId) {
        setExpandedId(null)
      }

      if (nextDraft.submissionStatus !== 'draft') {
        throw new Error('Submission returned an unexpected status after withdraw')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to withdraw submission')
    } finally {
      setPendingWithdrawId(null)
    }
  }

  const handleToggleDetail = async (propositionId: string) => {
    if (expandedId === propositionId) {
      setExpandedId(null)
      return
    }

    if (!token) {
      return
    }

    setErrorMessage(null)

    if (!detailById[propositionId]) {
      setPendingDetailId(propositionId)
      try {
        const detail = await arenaApi.getOwnedPropositionDetail(propositionId, token)
        setDetailById((current) => ({
          ...current,
          [propositionId]: detail,
        }))
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load submission detail')
        setPendingDetailId(null)
        return
      } finally {
        setPendingDetailId(null)
      }
    }

    setExpandedId(propositionId)
  }

  const handleCreateExport = async () => {
    if (!token || pendingExport) {
      return
    }

    setPendingExport(true)
    setErrorMessage(null)

    try {
      const created = await arenaApi.createOwnedPropositionExport(
        selectedPresetId ? { presetId: selectedPresetId } : {},
        token,
      )
      setExportsView((current) => ({
        userId: created.userId,
        totalCount: (current?.totalCount ?? 0) + 1,
        items: [
          {
            exportId: created.exportId,
            userId: created.userId,
            status: created.status,
            format: created.format,
            requestedAt: created.requestedAt,
            completedAt: created.completedAt,
            fileName: created.fileName,
            preset: created.preset
              ? {
                  presetId: created.preset.presetId,
                  name: created.preset.name,
                }
              : null,
            metrics: created.metrics,
          },
          ...(current?.items ?? []),
        ],
      }))
      setSelectedExport(created)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create requester export')
    } finally {
      setPendingExport(false)
    }
  }

  const handleOpenExport = async (exportId: string) => {
    if (!token || pendingExportId === exportId) {
      return
    }

    setPendingExportId(exportId)
    setErrorMessage(null)

    try {
      const artifact = await arenaApi.getOwnedPropositionExport(exportId, token)
      setSelectedExport(artifact)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load requester export')
    } finally {
      setPendingExportId(null)
    }
  }

  const handleOpenSettledReport = async (propositionId: string) => {
    if (!token || pendingReportId === propositionId) {
      return
    }

    setPendingReportId(propositionId)
    setErrorMessage(null)

    try {
      const report = await arenaApi.getOwnedPropositionReport(propositionId, token)
      setSelectedSettledReport(report)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load settled requester report')
    } finally {
      setPendingReportId(null)
    }
  }

  const handleOpenComparisonSet = async (comparisonSetId: string) => {
    if (!token) {
      return
    }

    setErrorMessage(null)

    try {
      const analytics = await arenaApi.getRequesterComparisonSetAnalytics(comparisonSetId, token)
      const exports = await arenaApi.listRequesterComparisonSetExports(comparisonSetId, token)
      setSelectedComparisonAnalytics(analytics)
      setSelectedComparisonExports(exports)
      setSelectedComparisonExport(null)
      setComparisonExportFilters({
        comparisonSetId,
        origin: '',
        policyId: '',
        limit: '10',
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load requester comparison analytics')
    }
  }

  const handleCreateComparisonExport = async (comparisonSetId: string) => {
    if (!token) {
      return
    }

    setErrorMessage(null)

    try {
      const artifact = await arenaApi.createRequesterComparisonSetExport(comparisonSetId, token)
      const exports = await arenaApi.listRequesterComparisonSetExports(comparisonSetId, token, {
        origin: comparisonExportFilters?.comparisonSetId === comparisonSetId && comparisonExportFilters.origin
          ? comparisonExportFilters.origin
          : undefined,
        policyId:
          comparisonExportFilters?.comparisonSetId === comparisonSetId
          && comparisonExportFilters.policyId.trim().length > 0
            ? comparisonExportFilters.policyId.trim()
            : undefined,
        limit:
          comparisonExportFilters?.comparisonSetId === comparisonSetId
            ? Number.parseInt(comparisonExportFilters.limit, 10)
            : 10,
      })
      setSelectedComparisonExports(exports)
      setSelectedComparisonExport(artifact)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create requester comparison export')
    }
  }

  const reloadComparisonExports = async (
    comparisonSetId: string,
    filters: ComparisonExportFiltersState | null,
  ) => {
    if (!token) {
      return null
    }

    const nextExports = await arenaApi.listRequesterComparisonSetExports(comparisonSetId, token, {
      origin: filters?.origin || undefined,
      policyId: filters?.policyId.trim().length ? filters.policyId.trim() : undefined,
      limit: Number.parseInt(filters?.limit ?? '10', 10),
    })
    setSelectedComparisonExports(nextExports)
    return nextExports
  }

  const handleOpenComparisonExport = async (
    comparisonSetId: string,
    exportId: string,
  ) => {
    if (!token || pendingComparisonExportId === exportId) {
      return
    }

    setPendingComparisonExportId(exportId)
    setErrorMessage(null)

    try {
      const artifact = await arenaApi.getRequesterComparisonSetExport(comparisonSetId, exportId, token)
      setSelectedComparisonExport(artifact)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load requester comparison export')
    } finally {
      setPendingComparisonExportId(null)
    }
  }

  const handleOpenDeliveryRetainedExport = async (
    comparisonSetId: string,
    exportId: string | null,
  ) => {
    if (!exportId) {
      setErrorMessage('No retained comparison export is available for this delivery run')
      return
    }

    await handleOpenComparisonExport(comparisonSetId, exportId)
  }

  const handleDeleteComparisonExport = async (
    comparisonSetId: string,
    exportId: string,
  ) => {
    if (!token || pendingComparisonExportId === exportId) {
      return
    }

    setPendingComparisonExportId(exportId)
    setErrorMessage(null)

    try {
      await arenaApi.deleteRequesterComparisonSetExport(comparisonSetId, exportId, token)
      await reloadComparisonExports(
        comparisonSetId,
        comparisonExportFilters?.comparisonSetId === comparisonSetId ? comparisonExportFilters : null,
      )
      if (selectedComparisonDeliveryPolicies?.comparisonSetId === comparisonSetId) {
        const [updatedPolicies, updatedHealthEntries, updatedRuns] = await Promise.all([
          arenaApi.listRequesterComparisonSetDeliveryPolicies(comparisonSetId, token),
          Promise.all(
            selectedComparisonDeliveryPolicies.items.map(async (policy) => {
              const health = await arenaApi.getRequesterComparisonSetDeliveryPolicyHealth(
                comparisonSetId,
                policy.policyId,
                token,
              )
              return [
                buildComparisonDeliveryHealthKey(comparisonSetId, policy.policyId),
                health,
              ] as const
            }),
          ),
          selectedComparisonDeliveryRuns?.comparisonSetId === comparisonSetId
            ? arenaApi.listRequesterComparisonSetDeliveryRuns(
                selectedComparisonDeliveryRuns.comparisonSetId,
                selectedComparisonDeliveryRuns.policyId,
                token,
                comparisonRunFilters?.comparisonSetId === selectedComparisonDeliveryRuns.comparisonSetId
                && comparisonRunFilters.policyId === selectedComparisonDeliveryRuns.policyId
                  ? {
                      status: comparisonRunFilters.status || undefined,
                      triggerType: comparisonRunFilters.triggerType || undefined,
                      replay: comparisonRunFilters.replay,
                      limit: Number.parseInt(comparisonRunFilters.limit, 10),
                    }
                  : undefined,
              )
            : Promise.resolve(null),
        ])

        setSelectedComparisonDeliveryPolicies(updatedPolicies)
        setComparisonDeliveryHealthByPolicyId(
          updatedHealthEntries.reduce<Record<string, RequesterComparisonSetDeliveryPolicyHealthRecord>>(
            (record, [key, health]) => {
              record[key] = health
              return record
            },
            {},
          ),
        )
        setFocusedComparisonDeliveryHealth((current) =>
          current?.policy.comparisonSetId === comparisonSetId
            ? updatedHealthEntries.find(([, health]) => health.policy.policyId === current.policy.policyId)?.[1]
              ?? null
            : current,
        )
        setSelectedComparisonDeliveryHealth((current) =>
          current?.policy.comparisonSetId === comparisonSetId
            ? updatedHealthEntries.find(([, health]) => health.policy.policyId === current.policy.policyId)?.[1]
              ?? null
            : current,
        )
        setSelectedComparisonDeliveryRun((current) =>
          current?.policy.comparisonSetId === comparisonSetId
            ? (() => {
                const matchingHealth =
                  updatedHealthEntries.find(([, health]) => health.policy.policyId === current.policy.policyId)?.[1]
                  ?? null

                if (!matchingHealth || !matchingHealth.health.latestRun || current.run.runId !== matchingHealth.health.latestRun.runId) {
                  return current
                }

                return {
                  ...current,
                  run: structuredClone(matchingHealth.health.latestRun),
                }
              })()
            : current,
        )
        setSelectedComparisonDeliveryRetry((current) =>
          current?.policy.comparisonSetId === comparisonSetId
            ? (() => {
                const matchingRuns =
                  updatedRuns && updatedRuns.policyId === current.policy.policyId
                    ? updatedRuns
                    : null
                const matchingRun =
                  matchingRuns?.items.find((item) => item.runId === current.run.runId)
                  ?? null

                return matchingRun
                  ? {
                      ...current,
                      run: structuredClone(matchingRun),
                    }
                  : current.export.exportId === exportId
                    ? {
                        ...current,
                        run: {
                          ...structuredClone(current.run),
                          retainedExportAvailable: false,
                        },
                      }
                    : current
              })()
            : current,
        )
        if (updatedRuns) {
          setSelectedComparisonDeliveryRuns(updatedRuns)
        }
      }
      setSelectedComparisonExport((current) =>
        current?.exportId === exportId ? null : current,
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete requester comparison export')
    } finally {
      setPendingComparisonExportId(null)
    }
  }

  const handleOpenComparisonDelivery = async (comparisonSetId: string) => {
    if (!token) {
      return
    }

    setErrorMessage(null)

    try {
      const policies = await arenaApi.listRequesterComparisonSetDeliveryPolicies(comparisonSetId, token)
      setSelectedComparisonDeliveryPolicies(policies)
      setFocusedComparisonDeliveryHealth(null)
      void loadComparisonDeliveryPolicyHealthSummaries(policies, token)
      setComparisonDeliveryFocus({
        comparisonSetId,
        policyId: policies.items[0]?.policyId ?? null,
      })
      setSelectedComparisonDeliveryHealth(null)
      setSelectedComparisonDeliveryRun(null)
      setSelectedComparisonDeliveryRuns(null)
      setSelectedComparisonDeliveryRetry(null)
      setComparisonDeliveryForm(null)
      setComparisonRunFilters(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load requester comparison deliveries')
    }
  }

  const handleOpenCreateComparisonDeliveryPolicy = (comparisonSetId: string) => {
    setComparisonDeliveryForm(buildCreateComparisonDeliveryFormState(comparisonSetId))
    setSelectedComparisonDeliveryRetry(null)
  }

  const handleOpenEditComparisonDeliveryPolicy = (
    policy: RequesterComparisonSetDeliveryPolicyListRecord['items'][number],
  ) => {
    focusComparisonDeliveryPolicy(policy.comparisonSetId, policy.policyId, {
      preserveForm: true,
    })
    setComparisonDeliveryForm(buildEditComparisonDeliveryFormState(policy))
    setSelectedComparisonDeliveryRetry(null)
  }

  const handleOpenComparisonDeliveryHealth = async (
    comparisonSetId: string,
    policyId: string,
  ) => {
    if (!token || pendingComparisonPolicyId === policyId) {
      return
    }

    setPendingComparisonPolicyId(policyId)
    setErrorMessage(null)
    focusComparisonDeliveryPolicy(comparisonSetId, policyId, {
      preserveHealthPanel: true,
    })

    try {
      const health = await arenaApi.getRequesterComparisonSetDeliveryPolicyHealth(
        comparisonSetId,
        policyId,
        token,
      )
      syncComparisonDeliveryHealth(health, {
        openPanel: true,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load delivery health')
    } finally {
      setPendingComparisonPolicyId(null)
    }
  }

  const handleSaveComparisonDeliveryPolicy = async () => {
    if (!token || !comparisonDeliveryForm || pendingComparisonDeliverySave) {
      return
    }

    setPendingComparisonDeliverySave(true)
    setErrorMessage(null)

    const retainedExportCount = Number.parseInt(comparisonDeliveryForm.retainedExportCount, 10)
    const transport =
      comparisonDeliveryForm.targetUrl.trim().length > 0
        ? {
            type: 'webhook' as const,
            targetUrl: comparisonDeliveryForm.targetUrl.trim(),
            credentialKey: comparisonDeliveryForm.credentialKey.trim() || null,
          }
        : null

    try {
      const payload: CreateRequesterComparisonSetDeliveryPolicyInputRecord = {
        name: comparisonDeliveryForm.name.trim(),
        description: comparisonDeliveryForm.description.trim() || undefined,
        cadence: 'daily',
        nextRunAt: fromDeliveryDatetimeInputValue(comparisonDeliveryForm.nextRunAt),
        enabled: comparisonDeliveryForm.enabled,
        retainedExportCount,
        transport,
      }

      const updatedPolicy = comparisonDeliveryForm.policyId
        ? await arenaApi.updateRequesterComparisonSetDeliveryPolicy(
            comparisonDeliveryForm.comparisonSetId,
            comparisonDeliveryForm.policyId,
            payload satisfies UpdateRequesterComparisonSetDeliveryPolicyInputRecord,
            token,
          )
        : await arenaApi.createRequesterComparisonSetDeliveryPolicy(
            comparisonDeliveryForm.comparisonSetId,
            payload,
            token,
          )

      setSelectedComparisonDeliveryPolicies((current) => {
        if (!current) {
          return current
        }

        const nextItems = comparisonDeliveryForm.policyId
          ? current.items.map((item) => (item.policyId === updatedPolicy.policyId ? updatedPolicy : item))
          : [updatedPolicy, ...current.items]

        return {
          ...current,
          totalCount: nextItems.length,
          items: nextItems,
        }
      })
      setSelectedComparisonDeliveryHealth((current) =>
        current && current.policy.policyId === updatedPolicy.policyId
          ? {
              ...current,
              policy: updatedPolicy,
            }
          : current,
      )
      focusComparisonDeliveryPolicy(updatedPolicy.comparisonSetId, updatedPolicy.policyId, {
        preserveForm: true,
      })
      requestComparisonDeliveryHealthRefresh()
      setComparisonDeliveryForm(buildEditComparisonDeliveryFormState(updatedPolicy))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save delivery policy')
    } finally {
      setPendingComparisonDeliverySave(false)
    }
  }

  const handleDeleteComparisonDeliveryPolicy = async (
    comparisonSetId: string,
    policyId: string,
  ) => {
    if (!token || pendingComparisonPolicyId === policyId) {
      return
    }

    setPendingComparisonPolicyId(policyId)
    setErrorMessage(null)

    try {
      await arenaApi.deleteRequesterComparisonSetDeliveryPolicy(comparisonSetId, policyId, token)
      setSelectedComparisonDeliveryPolicies((current) => {
        if (!current) {
          return current
        }

        const nextItems = current.items.filter((item) => item.policyId !== policyId)
        return {
          ...current,
          totalCount: nextItems.length,
          items: nextItems,
        }
      })
      setSelectedComparisonDeliveryHealth((current) =>
        current?.policy.policyId === policyId ? null : current,
      )
      setSelectedComparisonDeliveryRun((current) =>
        current?.policy.policyId === policyId ? null : current,
      )
      setSelectedComparisonDeliveryRuns((current) =>
        current?.policyId === policyId ? null : current,
      )
      setSelectedComparisonDeliveryRetry((current) =>
        current?.policy.policyId === policyId ? null : current,
      )
      setComparisonDeliveryForm((current) =>
        current?.policyId === policyId ? null : current,
      )
      setComparisonExportFilters((current) =>
        current?.comparisonSetId === comparisonSetId && current.policyId === policyId
          ? {
              ...current,
              policyId: '',
            }
          : current,
      )
      setComparisonDeliveryFocus((current) =>
        current?.comparisonSetId === comparisonSetId && current.policyId === policyId
          ? {
              comparisonSetId,
              policyId: null,
            }
          : current,
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete delivery policy')
    } finally {
      setPendingComparisonPolicyId(null)
    }
  }

  const handleRunComparisonDeliveryPolicy = async (
    comparisonSetId: string,
    policyId: string,
  ) => {
    if (!token || pendingComparisonPolicyId === policyId) {
      return
    }

    setPendingComparisonPolicyId(policyId)
    setErrorMessage(null)
    focusComparisonDeliveryPolicy(comparisonSetId, policyId, {
      preserveLatestRunPanel: true,
    })

    try {
      const run = await arenaApi.runRequesterComparisonSetDeliveryPolicy(
        comparisonSetId,
        policyId,
        token,
      )
      const shouldRefreshOpenRunHistory =
        selectedComparisonDeliveryRuns?.comparisonSetId === comparisonSetId
        && selectedComparisonDeliveryRuns.policyId === policyId
      const runHistoryFilters =
        comparisonRunFilters?.comparisonSetId === comparisonSetId
        && comparisonRunFilters.policyId === policyId
          ? {
              status: comparisonRunFilters.status || undefined,
              triggerType: comparisonRunFilters.triggerType || undefined,
              replay: comparisonRunFilters.replay,
              limit: Number.parseInt(comparisonRunFilters.limit, 10),
            }
          : undefined
      setSelectedComparisonDeliveryRun(run)
      setSelectedComparisonDeliveryRetry(null)
      setSelectedComparisonDeliveryPolicies((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          items: current.items.map((item) =>
            item.policyId === policyId
              ? {
                  ...item,
                  lastRunAt: run.policy.lastRunAt,
                  lastRunStatus: run.policy.lastRunStatus,
                  lastRunError: run.policy.lastRunError,
                }
              : item,
          ),
        }
      })
      if (shouldRefreshOpenRunHistory) {
        const runs = await arenaApi.listRequesterComparisonSetDeliveryRuns(
          comparisonSetId,
          policyId,
          token,
          runHistoryFilters,
        )
        setSelectedComparisonDeliveryRuns(runs)
      }
      requestComparisonDeliveryHealthRefresh()
      const refreshedExports = await reloadComparisonExports(
        comparisonSetId,
        comparisonExportFilters?.comparisonSetId === comparisonSetId ? comparisonExportFilters : null,
      )
      setSelectedComparisonExport((current) => {
        if (!current || current.comparisonSet.comparisonSetId !== comparisonSetId) {
          return current
        }

        return refreshedExports?.items.some((item) => item.exportId === current.exportId)
          ? current
          : null
      })
    } catch (error) {
      const [updatedPolicies, updatedRuns, updatedHealth] = await Promise.all([
        arenaApi.listRequesterComparisonSetDeliveryPolicies(comparisonSetId, token),
        arenaApi.listRequesterComparisonSetDeliveryRuns(
          comparisonSetId,
          policyId,
          token,
          comparisonRunFilters?.comparisonSetId === comparisonSetId
          && comparisonRunFilters.policyId === policyId
            ? {
                status: comparisonRunFilters.status || undefined,
                triggerType: comparisonRunFilters.triggerType || undefined,
                replay: comparisonRunFilters.replay,
                limit: Number.parseInt(comparisonRunFilters.limit, 10),
              }
            : undefined,
        ),
        arenaApi.getRequesterComparisonSetDeliveryPolicyHealth(
          comparisonSetId,
          policyId,
          token,
        ),
      ])
      setSelectedComparisonDeliveryPolicies(updatedPolicies)
      setSelectedComparisonDeliveryRuns(updatedRuns)
      syncComparisonDeliveryHealth(updatedHealth)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to run delivery policy')
    } finally {
      setPendingComparisonPolicyId(null)
    }
  }

  const handleOpenComparisonDeliveryRuns = async (
    comparisonSetId: string,
    policyId: string,
  ) => {
    if (!token || pendingComparisonPolicyId === policyId) {
      return
    }

    setPendingComparisonPolicyId(policyId)
    setErrorMessage(null)
    focusComparisonDeliveryPolicy(comparisonSetId, policyId, {
      preserveRunsPanel: true,
    })

    try {
      const runs = await arenaApi.listRequesterComparisonSetDeliveryRuns(
        comparisonSetId,
        policyId,
        token,
        comparisonRunFilters?.comparisonSetId === comparisonSetId
        && comparisonRunFilters.policyId === policyId
          ? {
              status: comparisonRunFilters.status || undefined,
              triggerType: comparisonRunFilters.triggerType || undefined,
              replay: comparisonRunFilters.replay,
              limit: Number.parseInt(comparisonRunFilters.limit, 10),
            }
          : undefined,
      )
      setSelectedComparisonDeliveryRuns(runs)
      setComparisonRunFilters((current) =>
        current?.comparisonSetId === comparisonSetId && current.policyId === policyId
          ? current
          : {
              comparisonSetId,
              policyId,
              status: '',
              triggerType: '',
              replay: 'all',
              limit: '10',
            },
      )
      setSelectedComparisonDeliveryRetry(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load delivery runs')
    } finally {
      setPendingComparisonPolicyId(null)
    }
  }

  const handleRetryComparisonDeliveryRun = async (
    comparisonSetId: string,
    policyId: string,
    runId: string,
  ) => {
    if (!token || pendingComparisonPolicyId === policyId) {
      return
    }

    setPendingComparisonPolicyId(policyId)
    setErrorMessage(null)
    focusComparisonDeliveryPolicy(comparisonSetId, policyId, {
      preserveLatestRunPanel: true,
      preserveRunsPanel: true,
      preserveRetryPanel: true,
    })

    try {
      const retry = await arenaApi.retryRequesterComparisonSetDeliveryRun(
        comparisonSetId,
        policyId,
        runId,
        token,
      )
      setSelectedComparisonDeliveryRetry(retry)
      setSelectedComparisonDeliveryRun(retry)
      const [runs, updatedHealth] = await Promise.all([
        arenaApi.listRequesterComparisonSetDeliveryRuns(
          comparisonSetId,
          policyId,
          token,
          comparisonRunFilters?.comparisonSetId === comparisonSetId
          && comparisonRunFilters.policyId === policyId
            ? {
                status: comparisonRunFilters.status || undefined,
                triggerType: comparisonRunFilters.triggerType || undefined,
                replay: comparisonRunFilters.replay,
                limit: Number.parseInt(comparisonRunFilters.limit, 10),
              }
            : undefined,
        ),
        arenaApi.getRequesterComparisonSetDeliveryPolicyHealth(
          comparisonSetId,
          policyId,
          token,
        ),
      ])
      setSelectedComparisonDeliveryRuns(runs)
      setSelectedComparisonDeliveryPolicies((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          items: current.items.map((item) =>
            item.policyId === policyId
              ? {
                  ...item,
                  lastRunAt: retry.policy.lastRunAt,
                  lastRunStatus: retry.policy.lastRunStatus,
                  lastRunError: retry.policy.lastRunError,
                }
              : item,
          ),
        }
      })
      syncComparisonDeliveryHealth(updatedHealth)
      requestComparisonDeliveryHealthRefresh()
      await reloadComparisonExports(
        comparisonSetId,
        comparisonExportFilters?.comparisonSetId === comparisonSetId ? comparisonExportFilters : null,
      )
    } catch (error) {
      const [updatedPolicies, updatedRuns, updatedHealth] = await Promise.all([
        arenaApi.listRequesterComparisonSetDeliveryPolicies(comparisonSetId, token),
        arenaApi.listRequesterComparisonSetDeliveryRuns(
          comparisonSetId,
          policyId,
          token,
          comparisonRunFilters?.comparisonSetId === comparisonSetId
          && comparisonRunFilters.policyId === policyId
            ? {
                status: comparisonRunFilters.status || undefined,
                triggerType: comparisonRunFilters.triggerType || undefined,
                replay: comparisonRunFilters.replay,
                limit: Number.parseInt(comparisonRunFilters.limit, 10),
              }
            : undefined,
        ),
        arenaApi.getRequesterComparisonSetDeliveryPolicyHealth(
          comparisonSetId,
          policyId,
          token,
        ),
      ])
      setSelectedComparisonDeliveryPolicies(updatedPolicies)
      setSelectedComparisonDeliveryRuns(updatedRuns)
      syncComparisonDeliveryHealth(updatedHealth)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to retry delivery run')
    } finally {
      setPendingComparisonPolicyId(null)
    }
  }

  const handleApplyComparisonExportFilters = async (
    nextFilters: ComparisonExportFiltersState,
  ) => {
    if (!token) {
      return
    }

    setErrorMessage(null)
    setComparisonExportFilters(nextFilters)

    try {
      await reloadComparisonExports(nextFilters.comparisonSetId, nextFilters)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to filter requester comparison exports')
    }
  }

  const handleOpenPolicyScopedComparisonExports = async (
    comparisonSetId: string,
    policyId: string,
    policyName: string | null,
  ) => {
    const nextFilters: ComparisonExportFiltersState = {
      comparisonSetId,
      origin: '',
      policyId,
      limit: '10',
    }

    focusComparisonDeliveryPolicy(comparisonSetId, policyId, {
      preserveScopedExports: true,
    })
    await handleApplyComparisonExportFilters(nextFilters)
    setSelectedComparisonExport(null)
    if (policyName) {
      setErrorMessage(null)
    }
  }

  const handleApplyComparisonRunFilters = async (
    comparisonSetId: string,
    policyId: string,
    nextFilters: ComparisonRunFiltersState,
  ) => {
    if (!token) {
      return
    }

    setErrorMessage(null)
    setComparisonRunFilters(nextFilters)

    try {
      const runs = await arenaApi.listRequesterComparisonSetDeliveryRuns(
        comparisonSetId,
        policyId,
        token,
        {
          status: nextFilters.status || undefined,
          triggerType: nextFilters.triggerType || undefined,
          replay: nextFilters.replay,
          limit: Number.parseInt(nextFilters.limit, 10),
        },
      )
      setSelectedComparisonDeliveryRuns(runs)
      setSelectedComparisonDeliveryRetry(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to filter delivery runs')
    }
  }

  const handleToggleComparisonDeliveryPolicy = async (
    comparisonSetId: string,
    policyId: string,
    enabled: boolean,
  ) => {
    if (!token || pendingComparisonPolicyId === policyId) {
      return
    }

    setPendingComparisonPolicyId(policyId)
    setErrorMessage(null)
    focusComparisonDeliveryPolicy(comparisonSetId, policyId)

    try {
      const updated = enabled
        ? await arenaApi.pauseRequesterComparisonSetDeliveryPolicy(comparisonSetId, policyId, token)
        : await arenaApi.resumeRequesterComparisonSetDeliveryPolicy(comparisonSetId, policyId, token)

      setSelectedComparisonDeliveryPolicies((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          items: current.items.map((item) => (item.policyId === policyId ? updated : item)),
        }
      })
      setSelectedComparisonDeliveryHealth((current) =>
        current && current.policy.policyId === policyId
          ? {
              ...current,
              policy: updated,
              health: {
                ...current.health,
                status: updated.enabled ? 'scheduled' : 'disabled',
              },
            }
          : current,
      )
      requestComparisonDeliveryHealthRefresh()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update delivery policy')
    } finally {
      setPendingComparisonPolicyId(null)
    }
  }

  const sourceMode = !isAuthenticated
    ? 'unavailable'
    : sessionMode === 'demo'
      ? 'demo'
      : 'live'

  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>已提交命题</h1>
        <p>
          在不改动既有产品流程形状的前提下，继续追踪 requester 已提交命题的审核状态、真实 owner 详情与导出能力。
        </p>
      </div>

      <div className="utility-stack">
        <DataSourceBadge mode={sourceMode} detail={buildSourceDetail(sessionMode, isAuthenticated)} />

        {!isAuthenticated ? (
          <>
            <section className="account-empty-card">
              <div className="account-empty-icon" aria-hidden="true">
                <LogIn size={28} />
              </div>
              <strong>Sign in to inspect requester submissions</strong>
              <p>
                Arena can show real requester submission records, owner-side progress, and export actions
                once the wallet session is authenticated.
              </p>
              <div className="account-summary-actions">
                <Link className="primary-action" to="/zh/challenges">
                  Create a proposition
                </Link>
                <Link className="secondary-action" to="/zh/drafts">
                  Open drafts
                </Link>
              </div>
            </section>
            <WalletStatusCard />
          </>
        ) : null}

        {isAuthenticated && errorMessage ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>Requester flow error</h2>
              <span>{errorMessage}</span>
            </div>
          </section>
        ) : null}

        {isAuthenticated && isLoading ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>Loading requester submissions</h2>
              <span>Syncing the real owner overview, submission detail, and export history.</span>
            </div>
          </section>
        ) : null}

        {isAuthenticated && !isLoading && summaryCards.length > 0 ? (
          <section
            className="submissions-summary-grid"
            aria-label="Submission overview"
            data-testid="submission-overview-section"
          >
            {summaryCards.map((card) => (
              <article className="account-summary-item submissions-summary-card" key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.detail}</small>
              </article>
            ))}
          </section>
        ) : null}

        {isAuthenticated && !isLoading ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>Requester export snapshots</h2>
              <span>
                Generate a real owner-scoped snapshot from the current proposition portfolio without leaving
                the submissions flow.
              </span>
            </div>

            <div className="submissions-actions">
              <label className="field-shell">
                <span className="field-label">Export preset</span>
                <select
                  data-testid="requester-export-preset-select"
                  value={selectedPresetId}
                  onChange={(event) => setSelectedPresetId(event.target.value)}
                >
                  <option value="">Direct snapshot</option>
                  {(reportPresets?.items ?? []).map((preset) => (
                    <option key={preset.presetId} value={preset.presetId}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary-action"
                data-testid="create-requester-export"
                disabled={pendingExport}
                onClick={() => void handleCreateExport()}
                type="button"
              >
                <Download size={16} />
                <span>{pendingExport ? 'Generating export...' : 'Generate export snapshot'}</span>
              </button>
            </div>

            <div className="account-menu-status-list">
              {(exportsView?.items ?? []).map((item) => (
                <div
                  className="account-menu-status-row"
                  data-testid="requester-export-item"
                  key={item.exportId}
                >
                  <div>
                    <strong>{item.fileName}</strong>
                    <span>
                      {formatExportTime(item.completedAt)} · {item.metrics.openLifecycleCount} open lifecycle
                      items
                    </span>
                  </div>
                  <div className="submissions-export-row-actions">
                    <button
                      className="secondary-action"
                      data-testid="requester-export-open"
                      disabled={pendingExportId === item.exportId}
                      onClick={() => void handleOpenExport(item.exportId)}
                      type="button"
                    >
                      <Search size={14} />
                      <span>
                        {pendingExportId === item.exportId ? 'Opening...' : 'Inspect export'}
                      </span>
                    </button>
                    <em className="account-menu-value">
                      <Download size={14} />
                      <span>{item.status}</span>
                    </em>
                  </div>
                </div>
              ))}
            </div>

            {selectedExport ? (
              <div
                className="submission-detail-panel submissions-export-detail-panel"
                data-testid="requester-export-detail-panel"
              >
                <div className="submission-detail-grid submissions-export-detail-grid">
                  <article className="account-summary-item">
                    <span>File name</span>
                    <strong data-testid="requester-export-detail-file-name">
                      {selectedExport.fileName}
                    </strong>
                    <small>{formatExportTime(selectedExport.completedAt)} generated</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Settled reports</span>
                    <strong data-testid="requester-export-detail-settled-count">
                      {selectedExport.metrics.settledReportCount}
                    </strong>
                    <small>Settled proposition reports captured in this artifact.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Open lifecycle items</span>
                    <strong data-testid="requester-export-detail-open-count">
                      {selectedExport.metrics.openLifecycleCount}
                    </strong>
                    <small>Unresolved owner-side proposition lifecycle records still in flight.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Report payload count</span>
                    <strong data-testid="requester-export-detail-report-count">
                      {selectedExport.reports.length}
                    </strong>
                    <small>
                      Settled requester reports included in this export artifact after settlement.
                    </small>
                  </article>
                  <article className="account-summary-item">
                    <span>Analytics window</span>
                    <strong data-testid="requester-export-detail-window-days">
                      {selectedExport.analytics.windowDays}
                    </strong>
                    <small>Rolling requester analytics window captured in this snapshot.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Created propositions</span>
                    <strong data-testid="requester-export-detail-created-count">
                      {selectedExport.analytics.totals.createdCount}
                    </strong>
                    <small>Owner-side propositions included in the export analytics window.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Market-enabled count</span>
                    <strong data-testid="requester-export-detail-market-enabled-count">
                      {selectedExport.analytics.totals.marketEnabledCount}
                    </strong>
                    <small>How many tracked propositions retained validation-market capability.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Top category</span>
                    <strong data-testid="requester-export-detail-top-category">
                      {formatTopCategoryLabel(selectedExport.analytics)}
                    </strong>
                    <small>Most represented proposition category across the analytics window.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Captured exports</span>
                    <strong data-testid="requester-export-detail-latest-export-count">
                      {selectedExport.analytics.delivery.exportCount}
                    </strong>
                    <small>Requester export history counted by the backend delivery summary.</small>
                  </article>
                </div>

                <div className="account-menu-status-list">
                  <div className="account-menu-status-row">
                    <div>
                      <strong>Overview snapshot</strong>
                      <span>
                        Submitted {selectedExport.overview.submissionSummary.submittedCount} · Drafts{' '}
                        {selectedExport.overview.submissionSummary.draftCount} · Market-enabled{' '}
                        {selectedExport.overview.marketSummary.enabledCount}
                      </span>
                    </div>
                    <em className="account-menu-value">
                      <span>{selectedExport.format.toUpperCase()}</span>
                    </em>
                  </div>
                  <div className="account-menu-status-row">
                    <div>
                      <strong>Analytics delivery</strong>
                      <span>
                        Window start {formatExportTime(selectedExport.analytics.windowStartedAt)} 路 latest
                        export {selectedExport.analytics.delivery.latestExportAt
                          ? formatExportTime(selectedExport.analytics.delivery.latestExportAt)
                          : 'not captured'}
                      </span>
                    </div>
                    <em className="account-menu-value">
                      <span>{selectedExport.analytics.totals.settledCount} settled</span>
                    </em>
                  </div>
                  <div className="account-menu-status-row">
                    <div>
                      <strong>Preset scope</strong>
                      <span>
                        {selectedExport.preset
                          ? `${selectedExport.preset.name} preset scoped to ${selectedExport.preset.statusScope}.`
                          : 'No saved preset was attached; this is a direct owner export snapshot.'}
                      </span>
                    </div>
                    <em className="account-menu-value">
                      <span>{selectedExport.preset ? 'Preset-backed' : 'Direct snapshot'}</span>
                    </em>
                  </div>
                </div>

                {selectedExport.reports.length ? (
                  <div className="account-menu-status-list">
                    {selectedExport.reports.map((report) => (
                      <div
                        className="account-menu-status-row"
                        data-testid="requester-export-report-item"
                        key={report.proposition.id}
                      >
                        <div>
                          <strong data-testid="requester-export-report-title">
                            {report.proposition.title}
                          </strong>
                          <span>
                            {formatResultKindLabel(report.result.resultKind)} 路 sample{' '}
                            {report.sample.effectiveSampleCount}
                          </span>
                        </div>
                        <em className="account-menu-value">
                          <span data-testid="requester-export-report-winning-option">
                            {report.result.winningOptionLabel ?? 'No winning option'}
                          </span>
                        </em>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {isAuthenticated && !isLoading && comparisonSets?.items.length ? (
          <section className="account-menu-panel" data-testid="requester-comparison-set-section">
            <div className="account-menu-panel-head">
              <h2>Requester comparison sets</h2>
              <span>
                Saved requester cohorts can now be reopened, compared, and exported inside the same
                shaped submissions flow.
              </span>
            </div>

            <div className="account-menu-status-list">
              {comparisonSets.items.map((item) => (
                <div
                  className="account-menu-status-row"
                  data-testid="requester-comparison-set-item"
                  key={item.comparisonSetId}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.presetIds.length} preset cohorts</span>
                  </div>
                  <div className="submissions-export-row-actions">
                    <button
                      className="secondary-action"
                      data-testid="requester-comparison-set-open"
                      onClick={() => void handleOpenComparisonSet(item.comparisonSetId)}
                      type="button"
                    >
                      <Search size={14} />
                      <span>Open analytics</span>
                    </button>
                    <button
                      className="secondary-action"
                      data-testid="requester-comparison-set-create-export"
                      onClick={() => void handleCreateComparisonExport(item.comparisonSetId)}
                      type="button"
                    >
                      <Download size={14} />
                      <span>Create comparison export</span>
                    </button>
                    <button
                      className="secondary-action"
                      data-testid="requester-comparison-set-open-delivery"
                      onClick={() => void handleOpenComparisonDelivery(item.comparisonSetId)}
                      type="button"
                    >
                      <FileClock size={14} />
                      <span>Delivery policies</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {selectedComparisonAnalytics ? (
              <div
                className="submission-detail-panel submissions-export-detail-panel"
                data-testid="requester-comparison-set-detail-panel"
              >
                <div className="submission-detail-grid submissions-export-detail-grid">
                  <article className="account-summary-item">
                    <span>Comparison set</span>
                    <strong>{selectedComparisonAnalytics.comparisonSet?.name ?? 'Saved comparison'}</strong>
                    <small>{selectedComparisonAnalytics.summary.presetCount} preset cohorts included.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Total cohorts</span>
                    <strong data-testid="requester-comparison-set-total-count">
                      {selectedComparisonAnalytics.totalCount}
                    </strong>
                    <small>Preset-backed requester analytics rows available in this saved comparison.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Top preset</span>
                    <strong data-testid="requester-comparison-set-top-preset">
                      {selectedComparisonAnalytics.items[0]?.preset.name ?? 'No preset'}
                    </strong>
                    <small>Highest-ranked preset row from the saved requester comparison.</small>
                  </article>
                </div>
              </div>
            ) : null}

            {selectedComparisonExport ? (
              <div
                className="submission-detail-panel submissions-export-detail-panel"
                data-testid="requester-comparison-export-detail-panel"
              >
                <div className="submission-detail-grid submissions-export-detail-grid">
                  <article className="account-summary-item">
                    <span>Comparison export</span>
                    <strong data-testid="requester-comparison-export-file-name">
                      {selectedComparisonExport.fileName}
                    </strong>
                    <small>{formatExportTime(selectedComparisonExport.completedAt)} generated</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Preset count</span>
                    <strong data-testid="requester-comparison-export-preset-count">
                      {selectedComparisonExport.report.presetCount}
                    </strong>
                    <small>Preset cohorts materialized into this comparison export artifact.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Export origin</span>
                    <strong data-testid="requester-comparison-export-origin">
                      {selectedComparisonExport.origin.type === 'manual'
                        ? 'Manual snapshot'
                        : selectedComparisonExport.origin.type === 'delivery_policy_manual'
                          ? 'Policy manual run'
                          : 'Policy automation'}
                    </strong>
                    <small>
                      {selectedComparisonExport.origin.policyName
                        ? selectedComparisonExport.origin.policyName
                        : 'Not attached to a recurring policy.'}
                    </small>
                  </article>
                </div>

                <div className="account-menu-status-list">
                  {selectedComparisonExport.report.rows.map((row) => (
                    <div
                      className="account-menu-status-row"
                      data-testid="requester-comparison-export-row"
                      key={row.preset.presetId}
                    >
                      <div>
                        <strong>{row.preset.name}</strong>
                        <span>
                          Created {row.createdCount} 路 Settled {row.settledCount} 路 Unresolved{' '}
                          {row.unresolvedCount}
                        </span>
                      </div>
                      <em className="account-menu-value">
                        <span>Rank {row.rank}</span>
                      </em>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedComparisonExports ? (
              <div
                className="submission-detail-panel submissions-export-detail-panel"
                data-testid="requester-comparison-export-history-panel"
              >
                <div className="submissions-actions">
                  <label className="field-shell">
                    <span className="field-label">Origin</span>
                    <select
                      data-testid="requester-comparison-export-history-origin-filter"
                      value={comparisonExportFilters?.origin ?? ''}
                      onChange={(event) => {
                        const nextFilters: ComparisonExportFiltersState = {
                          comparisonSetId: selectedComparisonExports.comparisonSet.comparisonSetId,
                          origin: event.target.value as ComparisonExportFiltersState['origin'],
                          policyId: comparisonExportFilters?.policyId ?? '',
                          limit: comparisonExportFilters?.limit ?? '10',
                        }
                        void handleApplyComparisonExportFilters(nextFilters)
                      }}
                    >
                      <option value="">All origins</option>
                      <option value="manual">Manual</option>
                      <option value="delivery_policy_manual">Policy manual</option>
                      <option value="delivery_policy_automation">Policy automation</option>
                    </select>
                  </label>
                  <label className="field-shell">
                    <span className="field-label">Limit</span>
                    <select
                      value={comparisonExportFilters?.limit ?? '10'}
                      onChange={(event) => {
                        const nextFilters: ComparisonExportFiltersState = {
                          comparisonSetId: selectedComparisonExports.comparisonSet.comparisonSetId,
                          origin: comparisonExportFilters?.origin ?? '',
                          policyId: comparisonExportFilters?.policyId ?? '',
                          limit: event.target.value as ComparisonExportFiltersState['limit'],
                        }
                        void handleApplyComparisonExportFilters(nextFilters)
                      }}
                    >
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="20">20</option>
                    </select>
                  </label>
                </div>

                <div className="submission-detail-grid submissions-export-detail-grid">
                  <article className="account-summary-item">
                    <span>Stored exports</span>
                    <strong data-testid="requester-comparison-export-history-count">
                      {selectedComparisonExports.totalCount}
                    </strong>
                    <small>
                      Retained comparison export artifacts still available for this saved cohort.
                    </small>
                  </article>
                  <article className="account-summary-item">
                    <span>Retention semantics</span>
                    <strong data-testid="requester-comparison-export-history-retention">
                      Policy retention prunes only matching policy-origin exports
                    </strong>
                    <small>
                      Manual snapshots stay available unless you explicitly delete them here.
                    </small>
                  </article>
                  <article className="account-summary-item">
                    <span>Active filter</span>
                    <strong data-testid="requester-comparison-export-history-filter-summary">
                      {comparisonExportFilters?.policyId
                        ? selectedComparisonDeliveryPolicies?.items.find(
                            (item) => item.policyId === comparisonExportFilters.policyId,
                          )?.name ?? comparisonExportFilters.policyId
                        : comparisonExportFilters?.origin
                          ? comparisonExportFilters.origin
                          : 'All retained exports'}
                    </strong>
                    <small>
                      {comparisonExportFilters?.policyId
                        ? 'Scoped to one delivery policy history.'
                        : 'Showing all retained comparison artifacts for this saved comparison set.'}
                    </small>
                  </article>
                </div>

                <div className="account-menu-status-list">
                  {selectedComparisonExports.items.map((item) => (
                    <div
                      className="account-menu-status-row"
                      data-testid="requester-comparison-export-history-item"
                      key={item.exportId}
                    >
                      <div>
                        <strong>{item.fileName}</strong>
                        <span>
                          {formatExportTime(item.completedAt)} ·{' '}
                          {item.origin.type === 'manual'
                            ? 'Manual snapshot'
                            : item.origin.policyName
                              ? `${item.origin.policyName}`
                              : 'Policy export'}
                        </span>
                        <small>
                          {item.origin.type === 'manual'
                            ? 'Not subject to policy retention pruning.'
                            : `Retention applies only within policy ${item.origin.policyName ?? item.origin.policyId ?? 'scope'}.`}
                        </small>
                      </div>
                      <div className="submissions-export-row-actions">
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-export-history-open"
                          disabled={pendingComparisonExportId === item.exportId}
                          onClick={() =>
                            void handleOpenComparisonExport(
                              item.comparisonSet.comparisonSetId,
                              item.exportId,
                            )
                          }
                          type="button"
                        >
                          <Search size={14} />
                          <span>
                            {pendingComparisonExportId === item.exportId ? 'Opening...' : 'Open'}
                          </span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-export-history-delete"
                          disabled={pendingComparisonExportId === item.exportId}
                          onClick={() =>
                            void handleDeleteComparisonExport(
                              item.comparisonSet.comparisonSetId,
                              item.exportId,
                            )
                          }
                          type="button"
                        >
                          <Trash2 size={14} />
                          <span>
                            {pendingComparisonExportId === item.exportId ? 'Deleting...' : 'Delete'}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedComparisonDeliveryPolicies ? (
              <div
                className="submission-detail-panel submissions-export-detail-panel"
                data-testid="requester-comparison-delivery-section"
              >
                {focusedComparisonDeliveryPolicy ? (
                  <div
                    className="submission-detail-grid submissions-export-detail-grid"
                    data-testid="requester-comparison-delivery-focus-panel"
                  >
                    <article className="account-summary-item">
                      <span>Focused policy</span>
                      <strong>{focusedComparisonDeliveryPolicy.name}</strong>
                      <small>
                        Actions and scoped panels below now follow this delivery policy.
                      </small>
                      <small data-testid="requester-comparison-delivery-focus-run-timing">
                        {focusedComparisonDeliveryHealthSummary
                          ? formatDeliveryRunTimingSummary(focusedComparisonDeliveryHealthSummary.health)
                          : 'Refreshing focused run timing.'}
                      </small>
                      <small data-testid="requester-comparison-delivery-focus-scheduler-detail">
                        {focusedComparisonDeliveryHealthSummary
                          ? formatDeliverySchedulerDetail(
                            focusedComparisonDeliveryHealthSummary.policy,
                            focusedComparisonDeliveryHealthSummary.health,
                          )
                          : 'Refreshing scheduler state.'}
                      </small>
                      <small data-testid="requester-comparison-delivery-focus-latest-run">
                        {focusedComparisonDeliveryHealthSummary
                          ? formatDeliveryLatestRunDetail(focusedComparisonDeliveryHealthSummary.health)
                          : 'Refreshing latest run evidence.'}
                      </small>
                      <button
                        className="secondary-action"
                        data-testid="requester-comparison-delivery-focus-open-export"
                        disabled={
                          !focusedComparisonDeliveryHealthSummary?.health.latestRun?.exportId
                          || !focusedComparisonDeliveryHealthSummary.health.latestRun.retainedExportAvailable
                          || pendingComparisonExportId
                            === focusedComparisonDeliveryHealthSummary.health.latestRun.exportId
                        }
                        onClick={() =>
                          void handleOpenDeliveryRetainedExport(
                            focusedComparisonDeliveryPolicy.comparisonSetId,
                            focusedComparisonDeliveryHealthSummary?.health.latestRun?.exportId ?? null,
                          )
                        }
                        type="button"
                      >
                        <Search size={14} />
                        <span>
                          {pendingComparisonExportId
                            === focusedComparisonDeliveryHealthSummary?.health.latestRun?.exportId
                            ? 'Opening...'
                            : formatRetainedExportActionLabel(
                              focusedComparisonDeliveryHealthSummary?.health.latestRun
                                ?.retainedExportAvailable ?? false,
                              'Open latest export',
                            )}
                        </span>
                      </button>
                    </article>
                    <article className="account-summary-item">
                      <span>Status</span>
                      <strong data-testid="requester-comparison-delivery-focus-status">
                        {focusedComparisonDeliveryPolicy.enabled ? 'Enabled' : 'Paused'}
                      </strong>
                      <small>
                        Retain {focusedComparisonDeliveryPolicy.retainedExportCount} completed exports.
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>Health</span>
                      <strong data-testid="requester-comparison-delivery-focus-health-status">
                        {focusedComparisonDeliveryHealthSummary
                          ? formatDeliveryHealthStatus(focusedComparisonDeliveryHealthSummary.health.status)
                          : 'Loading...'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-focus-health-detail">
                        {focusedComparisonDeliveryHealthSummary
                          ? `${focusedComparisonDeliveryHealthSummary.health.transport.status === 'ready'
                              ? 'Transport ready'
                              : `Transport blocked · ${formatDeliveryTransportBlockingReason(
                                focusedComparisonDeliveryHealthSummary.health.transport.blockingReason,
                              )}`} · Snapshot checked ${formatExportTime(
                              focusedComparisonDeliveryHealthSummary.health.checkedAt,
                            )}`
                          : 'Refreshing focused policy health.'}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>Runs</span>
                      <strong data-testid="requester-comparison-delivery-focus-run-count">
                        {focusedComparisonDeliveryHealthSummary
                          ? focusedComparisonDeliveryHealthSummary.health.runCounts.totalCount
                          : '...'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-focus-run-breakdown">
                        {focusedComparisonDeliveryHealthSummary
                          ? focusedComparisonDeliveryHealthSummary.health.runCounts.totalCount > 0
                            ? `${focusedComparisonDeliveryHealthSummary.health.runCounts.completedCount} completed · ${focusedComparisonDeliveryHealthSummary.health.runCounts.failedCount} failed`
                            : 'No delivery runs yet'
                          : 'Refreshing focused run summary.'}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>Failures</span>
                      <strong data-testid="requester-comparison-delivery-focus-failure-streak">
                        {focusedComparisonDeliveryHealthSummary
                          ? focusedComparisonDeliveryHealthSummary.health.consecutiveFailureCount > 0
                            ? formatDeliveryFailureStreak(
                              focusedComparisonDeliveryHealthSummary.health.consecutiveFailureCount,
                            )
                            : 'No active failure streak'
                          : 'Refreshing failure streak.'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-focus-last-error">
                        {focusedComparisonDeliveryHealthSummary
                          ? focusedComparisonDeliveryHealthSummary.policy.lastRunError
                            ? `Latest failure: ${formatDeliveryLastError(
                              focusedComparisonDeliveryHealthSummary.policy.lastRunError,
                            )}`
                            : 'No recent run error'
                          : 'Refreshing latest error.'}
                      </small>
                    </article>
                  </div>
                ) : null}

                <div className="submissions-actions">
                  <button
                    className="primary-action"
                    data-testid="requester-comparison-delivery-create-open"
                    onClick={() =>
                      void handleOpenCreateComparisonDeliveryPolicy(
                        selectedComparisonDeliveryPolicies.comparisonSetId,
                      )
                    }
                    type="button"
                  >
                    <Plus size={16} />
                    <span>Create delivery policy</span>
                  </button>
                </div>

                {comparisonDeliveryForm ? (
                  <div
                    className="submission-detail-grid submissions-export-detail-grid"
                    data-testid="requester-comparison-delivery-form"
                  >
                    <label className="field-shell">
                      <span className="field-label">Policy name</span>
                      <input
                        data-testid="requester-comparison-delivery-name-input"
                        value={comparisonDeliveryForm.name}
                        onChange={(event) =>
                          setComparisonDeliveryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  name: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="field-shell">
                      <span className="field-label">Description</span>
                      <input
                        value={comparisonDeliveryForm.description}
                        onChange={(event) =>
                          setComparisonDeliveryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  description: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="field-shell">
                      <span className="field-label">Next run</span>
                      <input
                        data-testid="requester-comparison-delivery-next-run-input"
                        type="datetime-local"
                        value={comparisonDeliveryForm.nextRunAt}
                        onChange={(event) =>
                          setComparisonDeliveryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  nextRunAt: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="field-shell">
                      <span className="field-label">Retained exports</span>
                      <input
                        data-testid="requester-comparison-delivery-retained-count-input"
                        inputMode="numeric"
                        value={comparisonDeliveryForm.retainedExportCount}
                        onChange={(event) =>
                          setComparisonDeliveryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  retainedExportCount: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="field-shell">
                      <span className="field-label">Webhook target</span>
                      <input
                        data-testid="requester-comparison-delivery-target-url-input"
                        value={comparisonDeliveryForm.targetUrl}
                        onChange={(event) =>
                          setComparisonDeliveryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  targetUrl: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="field-shell">
                      <span className="field-label">Credential key</span>
                      <input
                        value={comparisonDeliveryForm.credentialKey}
                        onChange={(event) =>
                          setComparisonDeliveryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  credentialKey: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="field-shell">
                      <span className="field-label">Enabled</span>
                      <select
                        value={comparisonDeliveryForm.enabled ? 'enabled' : 'paused'}
                        onChange={(event) =>
                          setComparisonDeliveryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  enabled: event.target.value === 'enabled',
                                }
                              : current,
                          )
                        }
                      >
                        <option value="enabled">Enabled</option>
                        <option value="paused">Paused</option>
                      </select>
                    </label>
                    <div className="account-summary-actions">
                      <button
                        className="primary-action"
                        data-testid="requester-comparison-delivery-save"
                        disabled={pendingComparisonDeliverySave}
                        onClick={() => void handleSaveComparisonDeliveryPolicy()}
                        type="button"
                      >
                        <Download size={16} />
                        <span>{pendingComparisonDeliverySave ? 'Saving...' : 'Save policy'}</span>
                      </button>
                    </div>
                    <article className="account-summary-item">
                      <span>Retention policy</span>
                      <strong data-testid="requester-comparison-delivery-form-retained-count">
                        {comparisonDeliveryForm.retainedExportCount}
                      </strong>
                      <small data-testid="requester-comparison-delivery-form-scope">
                        {comparisonDeliveryForm.policyId
                          ? comparisonDeliveryForm.name
                          : focusedComparisonDeliveryPolicy?.name ?? comparisonDeliveryForm.name}
                      </small>
                    </article>
                  </div>
                ) : null}

                <div className="account-menu-status-list">
                  {selectedComparisonDeliveryPolicies.items.map((policy) => (
                    (() => {
                      const policyHealth =
                        comparisonDeliveryHealthByPolicyId[
                          buildComparisonDeliveryHealthKey(
                            policy.comparisonSetId,
                            policy.policyId,
                          )
                        ] ?? null

                      return (
                    <div
                      className="account-menu-status-row"
                      data-testid="requester-comparison-delivery-policy-item"
                      key={policy.policyId}
                    >
                      <div>
                        <strong>{policy.name}</strong>
                        <span>
                          {policy.enabled ? 'Enabled' : 'Paused'} 路 Next run{' '}
                          {formatExportTime(policy.nextRunAt)}
                        </span>
                        <small>Retain {policy.retainedExportCount} completed exports</small>
                        <small data-testid="requester-comparison-delivery-policy-run-summary">
                          {policy.lastRunStatus
                            ? `Last run ${formatDeliveryRunStatus(policy.lastRunStatus)}`
                            : 'Not run yet'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-latest-run-detail">
                          {policyHealth
                            ? formatDeliveryLatestRunDetail(policyHealth.health)
                            : 'Refreshing latest run evidence.'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-export-agreement">
                          {formatDeliveryRowExportAgreementDetail(
                            policyHealth?.health ?? null,
                            selectedComparisonDeliveryHealth?.policy.policyId === policy.policyId
                            && selectedComparisonDeliveryHealth.policy.comparisonSetId === policy.comparisonSetId
                              ? selectedComparisonDeliveryHealth.health
                              : null,
                          )}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-health-summary">
                          {policyHealth
                            ? formatDeliveryHealthStatus(policyHealth.health.status)
                            : 'Loading...'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-health-detail">
                          {policyHealth
                            ? formatDeliveryHealthDetail(policyHealth.health)
                            : 'Refreshing health summary.'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-scheduler-detail">
                          {policyHealth
                            ? formatDeliverySchedulerDetail(policy, policyHealth.health)
                            : 'Refreshing scheduler state.'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-failure-streak">
                          {policyHealth
                            ? policyHealth.health.consecutiveFailureCount > 0
                              ? formatDeliveryFailureStreak(policyHealth.health.consecutiveFailureCount)
                              : 'No active failure streak'
                            : 'Refreshing failure streak.'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-last-error">
                          {policy.lastRunError
                            ? `Latest failure: ${formatDeliveryLastError(policy.lastRunError)}`
                            : 'No recent run error'}
                        </small>
                        {focusedComparisonDeliveryPolicy?.policyId === policy.policyId ? (
                          <small data-testid="requester-comparison-delivery-policy-focus-tag">
                            Current focus
                          </small>
                        ) : null}
                      </div>
                      <div className="submissions-export-row-actions">
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-focus"
                          disabled={pendingComparisonPolicyId === policy.policyId}
                          onClick={() =>
                            focusComparisonDeliveryPolicy(
                              policy.comparisonSetId,
                              policy.policyId,
                            )
                          }
                          type="button"
                        >
                          <ChevronDown size={14} />
                          <span>Focus</span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-edit-open"
                          disabled={pendingComparisonPolicyId === policy.policyId}
                          onClick={() => void handleOpenEditComparisonDeliveryPolicy(policy)}
                          type="button"
                        >
                          <Pencil size={14} />
                          <span>Edit</span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-health-open"
                          disabled={pendingComparisonPolicyId === policy.policyId}
                          onClick={() =>
                            void handleOpenComparisonDeliveryHealth(
                              policy.comparisonSetId,
                              policy.policyId,
                            )
                          }
                          type="button"
                        >
                          <Search size={14} />
                          <span>Health</span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-policy-open-export"
                          disabled={
                            pendingComparisonPolicyId === policy.policyId
                            || !policyHealth?.health.latestRun?.exportId
                            || !policyHealth?.health.latestRun?.retainedExportAvailable
                            || pendingComparisonExportId === policyHealth.health.latestRun.exportId
                          }
                          onClick={() =>
                            void handleOpenDeliveryRetainedExport(
                              policy.comparisonSetId,
                              policyHealth?.health.latestRun?.exportId ?? null,
                            )
                          }
                          type="button"
                        >
                          <Search size={14} />
                          <span>
                            {pendingComparisonExportId === policyHealth?.health.latestRun?.exportId
                              ? 'Opening...'
                              : formatRetainedExportActionLabel(
                                policyHealth?.health.latestRun?.retainedExportAvailable ?? false,
                                'Open latest export',
                              )}
                          </span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-exports-open"
                          disabled={pendingComparisonPolicyId === policy.policyId}
                          onClick={() =>
                            void handleOpenPolicyScopedComparisonExports(
                              policy.comparisonSetId,
                              policy.policyId,
                              policy.name,
                            )
                          }
                          type="button"
                        >
                          <Download size={14} />
                          <span>Exports</span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-runs-open"
                          disabled={pendingComparisonPolicyId === policy.policyId}
                          onClick={() =>
                            void handleOpenComparisonDeliveryRuns(
                              policy.comparisonSetId,
                              policy.policyId,
                            )
                          }
                          type="button"
                        >
                          <FileClock size={14} />
                          <span>Runs</span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-run"
                          disabled={pendingComparisonPolicyId === policy.policyId}
                          onClick={() =>
                            void handleRunComparisonDeliveryPolicy(
                              policy.comparisonSetId,
                              policy.policyId,
                            )
                          }
                          type="button"
                        >
                          <Play size={14} />
                          <span>Run now</span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-toggle"
                          disabled={pendingComparisonPolicyId === policy.policyId}
                          onClick={() =>
                            void handleToggleComparisonDeliveryPolicy(
                              policy.comparisonSetId,
                              policy.policyId,
                              policy.enabled,
                            )
                          }
                          type="button"
                        >
                          <Undo2 size={14} />
                          <span>{policy.enabled ? 'Pause' : 'Resume'}</span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-delete"
                          disabled={pendingComparisonPolicyId === policy.policyId}
                          onClick={() =>
                            void handleDeleteComparisonDeliveryPolicy(
                              policy.comparisonSetId,
                              policy.policyId,
                            )
                          }
                          type="button"
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                      )
                    })()
                  ))}
                </div>

                {selectedComparisonDeliveryPolicies.items.length === 0 ? (
                  <section
                    className="account-empty-card"
                    data-testid="requester-comparison-delivery-empty-state"
                  >
                    <div className="account-empty-icon" aria-hidden="true">
                      <FileClock size={28} />
                    </div>
                    <strong>No delivery policies are configured for this comparison set</strong>
                    <p>
                      Create a recurring delivery policy to retain comparison exports and push them
                      into the downstream reporting workflow without leaving this submissions page.
                    </p>
                  </section>
                ) : null}

                {selectedComparisonDeliveryHealth ? (
                  <div
                    className="submission-detail-grid submissions-export-detail-grid"
                    data-testid="requester-comparison-delivery-health-panel"
                  >
                    <article className="account-summary-item">
                      <span>Policy status</span>
                      <strong data-testid="requester-comparison-delivery-health-status">
                        {formatDeliveryHealthStatus(selectedComparisonDeliveryHealth.health.status)}
                      </strong>
                      <small data-testid="requester-comparison-delivery-health-scope">
                        {selectedComparisonDeliveryHealth.policy.name}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>Transport</span>
                      <strong data-testid="requester-comparison-delivery-health-transport">
                        {selectedComparisonDeliveryHealth.health.transport.status === 'ready'
                          ? 'Ready'
                          : 'Blocked'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-health-transport-detail">
                        {selectedComparisonDeliveryHealth.health.transport.status === 'ready'
                          ? (selectedComparisonDeliveryHealth.health.transport.credentialKey ?? 'No credential binding')
                          : formatDeliveryTransportBlockingReason(
                            selectedComparisonDeliveryHealth.health.transport.blockingReason,
                          )}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>Latest retained export</span>
                      <strong>
                        {selectedComparisonDeliveryHealth.health.latestRun?.exportId ?? 'No retained export'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-health-export-agreement">
                        {formatDeliveryLatestExportAgreementDetail(
                          focusedComparisonDeliveryHealthSummary?.health ?? null,
                          selectedComparisonDeliveryHealth.health,
                        )}
                      </small>
                      <button
                        className="secondary-action"
                        data-testid="requester-comparison-delivery-health-open-export"
                        disabled={
                          !selectedComparisonDeliveryHealth.health.latestRun?.exportId
                          || !selectedComparisonDeliveryHealth.health.latestRun.retainedExportAvailable
                          || pendingComparisonExportId
                            === selectedComparisonDeliveryHealth.health.latestRun.exportId
                        }
                        onClick={() =>
                          void handleOpenDeliveryRetainedExport(
                            selectedComparisonDeliveryHealth.policy.comparisonSetId,
                            selectedComparisonDeliveryHealth.health.latestRun?.exportId ?? null,
                          )
                        }
                        type="button"
                      >
                        <Search size={14} />
                        <span>
                          {pendingComparisonExportId
                            === selectedComparisonDeliveryHealth.health.latestRun?.exportId
                            ? 'Opening...'
                            : formatRetainedExportActionLabel(
                              selectedComparisonDeliveryHealth.health.latestRun
                                ?.retainedExportAvailable ?? false,
                              'Open retained export',
                            )}
                        </span>
                      </button>
                    </article>
                    <article className="account-summary-item">
                      <span>Failure streak</span>
                      <strong data-testid="requester-comparison-delivery-health-failure-streak">
                        {selectedComparisonDeliveryHealth.health.consecutiveFailureCount > 0
                          ? formatDeliveryFailureStreak(
                            selectedComparisonDeliveryHealth.health.consecutiveFailureCount,
                          )
                          : 'No active failure streak'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-health-last-error">
                        {formatDeliveryLastError(selectedComparisonDeliveryHealth.policy.lastRunError)}
                      </small>
                    </article>
                  </div>
                ) : null}

                {selectedComparisonDeliveryRun ? (
                  <div
                    className="submission-detail-grid submissions-export-detail-grid"
                    data-testid="requester-comparison-delivery-run-panel"
                  >
                    <article className="account-summary-item">
                      <span>Latest run export</span>
                      <strong data-testid="requester-comparison-delivery-run-file-name">
                        {selectedComparisonDeliveryRun.export.fileName}
                      </strong>
                      <small>{formatExportTime(selectedComparisonDeliveryRun.export.completedAt)} delivered</small>
                    </article>
                    <article className="account-summary-item">
                      <span>Run status</span>
                      <strong data-testid="requester-comparison-delivery-run-status">
                        {formatDeliveryRunStatus(selectedComparisonDeliveryRun.policy.lastRunStatus)}
                      </strong>
                      <small data-testid="requester-comparison-delivery-run-provenance">
                        {formatDeliveryRunProvenanceDetail(selectedComparisonDeliveryRun.run)}
                      </small>
                      <small>
                        {selectedComparisonDeliveryRun.run.delivery
                          ? `HTTP ${selectedComparisonDeliveryRun.run.delivery.statusCode}`
                          : 'No downstream transport'}
                      </small>
                      <small>
                        {formatDeliveryTransportAuthenticationDetail(
                          selectedComparisonDeliveryRun.run.delivery,
                        )}
                      </small>
                    </article>
                  </div>
                ) : null}

                {selectedComparisonDeliveryRuns ? (
                  <>
                    <div className="account-summary-grid">
                      <article className="account-summary-item">
                        <span>Run history</span>
                        <strong data-testid="requester-comparison-delivery-run-history-summary">
                          {formatDeliveryRunHistorySummary(selectedComparisonDeliveryRuns)}
                        </strong>
                        <small>
                          {selectedComparisonDeliveryRuns.totalCount < selectedComparisonDeliveryRuns.storedCount
                            ? 'Limited history stays explicit even when filters narrow the visible run list.'
                            : 'All retained requester delivery runs for this policy are currently visible.'}
                        </small>
                      </article>
                    </div>
                    <div className="submissions-actions">
                      <label className="field-shell">
                        <span className="field-label">Run status</span>
                        <select
                          data-testid="requester-comparison-delivery-run-status-filter"
                          value={comparisonRunFilters?.status ?? ''}
                          onChange={(event) => {
                            const nextFilters: ComparisonRunFiltersState = {
                              comparisonSetId: selectedComparisonDeliveryRuns.comparisonSetId,
                              policyId: selectedComparisonDeliveryRuns.policyId,
                              status: event.target.value as ComparisonRunFiltersState['status'],
                              triggerType: comparisonRunFilters?.triggerType ?? '',
                              replay: comparisonRunFilters?.replay ?? 'all',
                              limit: comparisonRunFilters?.limit ?? '10',
                            }
                            void handleApplyComparisonRunFilters(
                              selectedComparisonDeliveryRuns.comparisonSetId,
                              selectedComparisonDeliveryRuns.policyId,
                              nextFilters,
                            )
                          }}
                        >
                          <option value="">All runs</option>
                          <option value="completed">Completed</option>
                          <option value="failed">Failed</option>
                        </select>
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Trigger</span>
                        <select
                          data-testid="requester-comparison-delivery-run-trigger-filter"
                          value={comparisonRunFilters?.triggerType ?? ''}
                          onChange={(event) => {
                            const nextFilters: ComparisonRunFiltersState = {
                              comparisonSetId: selectedComparisonDeliveryRuns.comparisonSetId,
                              policyId: selectedComparisonDeliveryRuns.policyId,
                              status: comparisonRunFilters?.status ?? '',
                              triggerType: event.target.value as ComparisonRunFiltersState['triggerType'],
                              replay: comparisonRunFilters?.replay ?? 'all',
                              limit: comparisonRunFilters?.limit ?? '10',
                            }
                            void handleApplyComparisonRunFilters(
                              selectedComparisonDeliveryRuns.comparisonSetId,
                              selectedComparisonDeliveryRuns.policyId,
                              nextFilters,
                            )
                          }}
                        >
                          <option value="">All triggers</option>
                          <option value="manual">Manual</option>
                          <option value="automation">Automation</option>
                        </select>
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Provenance</span>
                        <select
                          data-testid="requester-comparison-delivery-run-replay-filter"
                          value={comparisonRunFilters?.replay ?? 'all'}
                          onChange={(event) => {
                            const nextFilters: ComparisonRunFiltersState = {
                              comparisonSetId: selectedComparisonDeliveryRuns.comparisonSetId,
                              policyId: selectedComparisonDeliveryRuns.policyId,
                              status: comparisonRunFilters?.status ?? '',
                              triggerType: comparisonRunFilters?.triggerType ?? '',
                              replay: event.target.value as ComparisonRunFiltersState['replay'],
                              limit: comparisonRunFilters?.limit ?? '10',
                            }
                            void handleApplyComparisonRunFilters(
                              selectedComparisonDeliveryRuns.comparisonSetId,
                              selectedComparisonDeliveryRuns.policyId,
                              nextFilters,
                            )
                          }}
                        >
                          <option value="all">All provenance</option>
                          <option value="fresh_only">Fresh only</option>
                          <option value="replayed_only">Replay only</option>
                        </select>
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Limit</span>
                        <select
                          data-testid="requester-comparison-delivery-run-limit-filter"
                          value={comparisonRunFilters?.limit ?? '10'}
                          onChange={(event) => {
                            const nextFilters: ComparisonRunFiltersState = {
                              comparisonSetId: selectedComparisonDeliveryRuns.comparisonSetId,
                              policyId: selectedComparisonDeliveryRuns.policyId,
                              status: comparisonRunFilters?.status ?? '',
                              triggerType: comparisonRunFilters?.triggerType ?? '',
                              replay: comparisonRunFilters?.replay ?? 'all',
                              limit: event.target.value as ComparisonRunFiltersState['limit'],
                            }
                            void handleApplyComparisonRunFilters(
                              selectedComparisonDeliveryRuns.comparisonSetId,
                              selectedComparisonDeliveryRuns.policyId,
                              nextFilters,
                            )
                          }}
                        >
                          <option value="1">1</option>
                          <option value="5">5</option>
                          <option value="10">10</option>
                        </select>
                      </label>
                    </div>
                    <div
                      className="account-menu-status-list"
                      data-testid="requester-comparison-delivery-runs-panel"
                    >
                    {selectedComparisonDeliveryRuns.items.map((run) => (
                      <div
                        className="account-menu-status-row"
                        data-testid="requester-comparison-delivery-run-item"
                        key={run.runId}
                      >
                        <div>
                          <strong>{formatDeliveryRunStatus(run.status)}</strong>
                          <span>
                            {formatExportTime(run.completedAt)} · {run.origin.policyName ?? 'Unnamed policy'}
                          </span>
                          <small>
                            {`${formatDeliveryRunTriggerType(run.triggerType)} delivery 路 ${formatDeliveryRunTransportSummary(run.delivery)}`}
                          </small>
                          <small>{formatDeliveryRunProvenanceDetail(run)}</small>
                          {run.retriedRunId ? (
                            <small>
                              {formatDeliveryRetryArtifactDetail(
                                run.exportId ?? 'unknown export',
                                run.retainedExportAvailable,
                              )}
                            </small>
                          ) : null}
                          {run.error ? (
                            <>
                              <small>{run.error.message}</small>
                            </>
                          ) : (
                            <small>No delivery error</small>
                          )}
                        </div>
                        <div className="submissions-export-row-actions">
                          <button
                            className="secondary-action"
                            data-testid="requester-comparison-delivery-run-open-export"
                            disabled={
                              !run.exportId
                              || !run.retainedExportAvailable
                              || pendingComparisonExportId === run.exportId
                            }
                            onClick={() =>
                              void handleOpenDeliveryRetainedExport(
                                run.comparisonSetId,
                                run.exportId,
                              )
                            }
                            type="button"
                          >
                            <Search size={14} />
                            <span>
                              {pendingComparisonExportId === run.exportId
                                ? 'Opening...'
                                : formatRetainedExportActionLabel(
                                  run.retainedExportAvailable,
                                  'Open retained export',
                                )}
                            </span>
                          </button>
                          {run.status === 'failed' ? (
                            <button
                              className="secondary-action"
                              data-testid="requester-comparison-delivery-run-retry"
                              disabled={
                                pendingComparisonPolicyId === run.policyId
                                || !run.retainedExportAvailable
                              }
                              onClick={() =>
                                void handleRetryComparisonDeliveryRun(
                                  run.comparisonSetId,
                                  run.policyId,
                                  run.runId,
                                )
                              }
                              type="button"
                            >
                              <Undo2 size={14} />
                              <span>Retry</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    </div>
                  </>
                ) : null}

                {selectedComparisonDeliveryRetry ? (
                  <div
                    className="submission-detail-grid submissions-export-detail-grid"
                    data-testid="requester-comparison-delivery-retry-panel"
                  >
                    <article className="account-summary-item">
                      <span>Retry status</span>
                      <strong data-testid="requester-comparison-delivery-retry-status">
                        {formatDeliveryRunStatus(selectedComparisonDeliveryRetry.policy.lastRunStatus)}
                      </strong>
                      <small data-testid="requester-comparison-delivery-retry-provenance">
                        {formatDeliveryRunProvenanceDetail(selectedComparisonDeliveryRetry.run)}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>Retry export</span>
                      <strong data-testid="requester-comparison-delivery-retry-file-name">
                        {selectedComparisonDeliveryRetry.export.fileName}
                      </strong>
                      <small>{formatExportTime(selectedComparisonDeliveryRetry.export.completedAt)} delivered</small>
                      <small>
                        {formatDeliveryRetryArtifactDetail(
                          selectedComparisonDeliveryRetry.export.exportId,
                          selectedComparisonDeliveryRetry.run.retainedExportAvailable,
                        )}
                      </small>
                      <small>
                        {selectedComparisonDeliveryRetry.run.delivery
                          ? `HTTP ${selectedComparisonDeliveryRetry.run.delivery.statusCode}`
                          : 'No downstream transport'}
                      </small>
                      <small>
                        {formatDeliveryTransportAuthenticationDetail(
                          selectedComparisonDeliveryRetry.run.delivery,
                        )}
                      </small>
                      <button
                        className="secondary-action"
                        data-testid="requester-comparison-delivery-retry-open-export"
                        disabled={
                          !selectedComparisonDeliveryRetry.run.retainedExportAvailable
                          || pendingComparisonExportId === selectedComparisonDeliveryRetry.export.exportId
                        }
                        onClick={() =>
                          void handleOpenDeliveryRetainedExport(
                            selectedComparisonDeliveryRetry.policy.comparisonSetId,
                            selectedComparisonDeliveryRetry.export.exportId,
                          )
                        }
                        type="button"
                      >
                        <Search size={14} />
                        <span>
                          {pendingComparisonExportId === selectedComparisonDeliveryRetry.export.exportId
                            ? 'Opening...'
                            : formatRetainedExportActionLabel(
                              selectedComparisonDeliveryRetry.run.retainedExportAvailable,
                              'Open retained export',
                            )}
                        </span>
                      </button>
                    </article>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {isAuthenticated && !isLoading && submissions.length === 0 ? (
          <section className="account-empty-card" data-testid="submission-empty-state">
            <div className="account-empty-icon" aria-hidden="true">
              <Search size={28} />
            </div>
            <strong>No propositions are currently in the requester review queue</strong>
            <p>
              Once a draft is submitted, it appears here. Withdrawing moves it back to drafts so the same
              shaped proposition flow can continue without losing context.
            </p>
            <div className="account-summary-actions">
              <Link className="primary-action" to="/zh/challenges">
                Create a proposition
              </Link>
              <Link className="secondary-action" to="/zh/drafts">
                Open drafts
              </Link>
            </div>
          </section>
        ) : null}

        {isAuthenticated && !isLoading && submissions.length > 0 ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>审核中的候选命题</h2>
              <span>
                These propositions have already entered the real submit contract and can now expose owner-side
                detail without breaking the existing product shape.
              </span>
            </div>

            <div className="submissions-list">
              {submissions.map((submission) => {
                const isPendingWithdraw = pendingWithdrawId === submission.propositionId
                const isPendingDetail = pendingDetailId === submission.propositionId
                const detail = detailById[submission.propositionId]
                const isExpanded = expandedId === submission.propositionId

                return (
                  <article
                    className="submissions-card"
                    data-testid={`submission-card-${submission.propositionId}`}
                    key={submission.propositionId}
                  >
                    <div className="submissions-card-top">
                      <div className="submissions-card-copy">
                        <strong>{submission.title}</strong>
                        <p>{submission.summary}</p>
                      </div>
                      <span className="submissions-status-pill">
                        {detail ? formatSubmissionStatus(detail.submission.status) : 'Under review'}
                      </span>
                    </div>

                    <div className="submissions-meta-row">
                      <span>{submission.categoryLabel}</span>
                      <span>Minimum effective sample {submission.minEffectiveSample}</span>
                      <span>
                        {submission.marketEnabled
                          ? 'Validation-market capability retained'
                          : 'No validation market reserved'}
                      </span>
                    </div>

                    <div className="drafts-tags-row">
                      {submission.tags.map((tag) => (
                        <span className="drafts-tag" key={`${submission.propositionId}-${tag}`}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="submissions-foot">
                      <div className="submissions-time-copy">
                        <span>Submitted {submission.submittedAtLabel}</span>
                        <span>Updated {submission.updatedAtLabel}</span>
                      </div>
                      <div className="submissions-actions">
                        <button
                          className="secondary-action"
                          data-testid={`submission-detail-toggle-${submission.propositionId}`}
                          onClick={() => void handleToggleDetail(submission.propositionId)}
                          type="button"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          <span>{isExpanded ? 'Hide owner detail' : 'Open owner detail'}</span>
                        </button>
                        <Link className="secondary-action" to={`/zh/challenges?draft=${submission.propositionId}`}>
                          Continue viewing
                        </Link>
                        <button
                          className="primary-action submissions-withdraw-button"
                          data-testid={`withdraw-submission-${submission.propositionId}`}
                          disabled={isPendingWithdraw}
                          onClick={() => void handleWithdraw(submission.propositionId)}
                          type="button"
                        >
                          <Undo2 size={16} />
                          <span>{isPendingWithdraw ? 'Withdrawing...' : 'Withdraw to drafts'}</span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && detail ? (
                      <div
                        className="submission-detail-panel"
                        data-testid={`submission-detail-panel-${submission.propositionId}`}
                      >
                        <div className="submission-detail-grid">
                          <article className="account-summary-item">
                            <span>Submission status</span>
                            <strong data-testid={`submission-status-${submission.propositionId}`}>
                              {formatSubmissionStatus(detail.submission.status)}
                            </strong>
                            <small>{detail.submission.submissionNote ?? 'No owner note was attached.'}</small>
                          </article>
                          <article className="account-summary-item">
                            <span>Lifecycle status</span>
                            <strong data-testid={`proposition-status-${submission.propositionId}`}>
                              {formatLifecycleStatus(detail.proposition.status)}
                            </strong>
                            <small>{formatClosureReason(detail.closureReadiness.triggerReason)}</small>
                          </article>
                          <article className="account-summary-item">
                            <span>Effective sample</span>
                            <strong data-testid={`sample-progress-${submission.propositionId}`}>
                              {detail.sampleCounter.effectiveSampleCount} / {detail.proposition.minEffectiveSample}
                            </strong>
                            <small>{detail.reviewSummary.finalizedCount} finalized reviews so far.</small>
                          </article>
                          <article className="account-summary-item">
                            <span>Dispatch coverage</span>
                            <strong>
                              {detail.dispatchSummary.submittedCount} / {detail.dispatchSummary.totalTasks}
                            </strong>
                            <small>{detail.dispatchSummary.uniqueAssignedUsers} unique assigned users.</small>
                          </article>
                        </div>

                        <div className="account-menu-status-list">
                          <div className="account-menu-status-row">
                            <div>
                              <strong>Reveal and settlement guardrail</strong>
                              <span>
                                {detail.revealSettlement.resultKind
                                  ? `Result ${detail.revealSettlement.resultKind}`
                                  : 'No directional result is exposed before settlement.'}
                              </span>
                            </div>
                            <em className="account-menu-value">
                              <FileClock size={14} />
                              <span>{detail.market ? detail.market.status : 'No market yet'}</span>
                            </em>
                          </div>
                          <div className="account-menu-status-row">
                            <div>
                              <strong>Requester budget</strong>
                              <span>
                                Reward budget {detail.proposition.rewardBudget} · base response reward{' '}
                                {detail.proposition.baseResponseReward}
                              </span>
                            </div>
                            <em className="account-menu-value">
                              <span>{detail.proposition.marketEnabled ? 'Market-enabled' : 'Market-disabled'}</span>
                            </em>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {isPendingDetail ? (
                      <div className="submission-detail-loading">
                        <span>Loading owner detail...</span>
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

{isAuthenticated && overview?.recent.length ? (
          <section className="account-menu-panel" data-testid="submission-recent-section">
            <div className="account-menu-panel-head">
              <h2>Recent submission handoff</h2>
              <span>Recent requester-owned proposition records from the real owner overview contract.</span>
            </div>

            <div className="account-menu-status-list">
              {overview.recent.map((item) => (
                <div className="account-menu-status-row" key={item.propositionId}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {formatCategoryLabel(item.category)} ·{' '}
                      {item.status === 'settled'
                        ? `settled ${item.settledAt ? formatRelativeTime(item.settledAt) : 'recently'}`
                        : `submitted ${item.submittedAt ? formatRelativeTime(item.submittedAt) : 'just now'}`}
                    </span>
                  </div>
                  <div className="submissions-export-row-actions">
                    {item.status === 'settled' ? (
                      <button
                        className="secondary-action"
                        data-testid="recent-settled-report-open"
                        disabled={pendingReportId === item.propositionId}
                        onClick={() => void handleOpenSettledReport(item.propositionId)}
                        type="button"
                      >
                        <Search size={14} />
                        <span>
                          {pendingReportId === item.propositionId ? 'Opening...' : 'View settled report'}
                        </span>
                      </button>
                    ) : null}
                    <em className="account-menu-value">
                      <FileClock size={14} />
                      <span>{formatSubmissionStatus(item.submissionStatus)}</span>
                    </em>
                  </div>
                </div>
              ))}
            </div>

            {selectedSettledReport ? (
              <div
                className="submission-detail-panel submissions-export-detail-panel"
                data-testid="requester-settled-report-panel"
              >
                <div className="submission-detail-grid submissions-export-detail-grid">
                  <article className="account-summary-item">
                    <span>Settled proposition</span>
                    <strong data-testid="requester-settled-report-title">
                      {selectedSettledReport.proposition.title}
                    </strong>
                    <small>
                      {formatCategoryLabel(selectedSettledReport.proposition.category)} · settled{' '}
                      {formatExportTime(selectedSettledReport.result.settledAt)}
                    </small>
                  </article>
                  <article className="account-summary-item">
                    <span>Result kind</span>
                    <strong data-testid="requester-settled-report-result-kind">
                      {formatResultKindLabel(selectedSettledReport.result.resultKind)}
                    </strong>
                    <small>Owner-side settled result contract from Arena requester APIs.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Winning option</span>
                    <strong data-testid="requester-settled-report-winning-option">
                      {selectedSettledReport.result.winningOptionLabel ?? 'No winning option'}
                    </strong>
                    <small>Directional result only appears after settlement completes.</small>
                  </article>
                  <article className="account-summary-item">
                    <span>Effective sample</span>
                    <strong data-testid="requester-settled-report-sample">
                      {selectedSettledReport.sample.effectiveSampleCount}
                    </strong>
                    <small>{selectedSettledReport.reviewSummary.finalizedCount} finalized reviews.</small>
                  </article>
                </div>

                <div className="account-menu-status-list">
                  <div className="account-menu-status-row">
                    <div>
                      <strong>Dispatch coverage</strong>
                      <span>
                        {selectedSettledReport.dispatchSummary.submittedCount} /{' '}
                        {selectedSettledReport.dispatchSummary.totalTasks} submitted tasks ·{' '}
                        {selectedSettledReport.dispatchSummary.uniqueAssignedUsers} unique users
                      </span>
                    </div>
                    <em className="account-menu-value">
                      <span>{selectedSettledReport.result.marketStatus ?? 'No market'}</span>
                    </em>
                  </div>
                  <div className="account-menu-status-row">
                    <div>
                      <strong>Requester budget</strong>
                      <span>
                        Reward budget {selectedSettledReport.proposition.rewardBudget} · base response reward{' '}
                        {selectedSettledReport.proposition.baseResponseReward}
                      </span>
                    </div>
                    <em className="account-menu-value">
                      <span>
                        {selectedSettledReport.proposition.marketEnabled ? 'Market-enabled' : 'Market-disabled'}
                      </span>
                    </em>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  )
}
