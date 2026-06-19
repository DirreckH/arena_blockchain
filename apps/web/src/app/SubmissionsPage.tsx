import { ChevronDown, ChevronLeft, ChevronUp, Download, FileClock, LogIn, Pencil, Play, Plus, Search, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { WalletStatusCard } from '../components/shared/WalletStatusCard'
import {
  buildDraftTags,
  formatSampleConstraintLabel,
  formatCategoryLabel,
  formatRelativeTime,
} from '../features/arena/arena-ui-mappers'
import {
  arenaApi,
  type CreateRequesterComparisonSetDeliveryPolicyInputRecord,
  type RequesterDeliveryCredentialDirectoryRecord,
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
  type RequesterPropositionBudgetLedgerRecord,
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

type RequesterBudgetSummaryRecord = RequesterOwnedPropositionDetailRecord['budgetSummary']
type RequesterBudgetLedgerEntryRecord = RequesterPropositionBudgetLedgerRecord['items'][number]

function toSubmissionCardRecord(draft: PropositionDraftRecord): SubmissionCardRecord {
  return {
    propositionId: draft.propositionId,
    title: draft.title,
    summary: draft.summary,
    categoryLabel: formatCategoryLabel(draft.category),
    tags: buildDraftTags(draft),
    submittedAtLabel: draft.submittedAt ? formatRelativeTime(draft.submittedAt) : '刚刚',
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
      return '已提交'
    case 'approved':
      return '已通过'
    case 'rejected':
      return '已驳回'
    case 'withdrawn':
      return '已撤回'
    case 'archived':
      return '已归档'
    case 'draft':
    default:
      return '草稿'
  }
}

function formatLifecycleStatus(status: string) {
  switch (status) {
    case 'draft':
      return '草稿'
    case 'scheduled':
      return '待开始'
    case 'live':
      return '进行中'
    case 'frozen':
      return '已冻结'
    case 'revealing':
      return '揭晓中'
    case 'settled':
      return '已开奖'
    case 'archived':
      return '已归档'
    default:
      return status
  }
}

function formatClosureReason(reason: string) {
  switch (reason) {
    case 'min_duration_and_sample_reached':
      return '达到最短持续时间和样本门槛后，即可进入冻结或结算。'
    case 'max_duration_reached':
      return '已达到最长持续时间，可进入冻结或结算。'
    case 'not_ready':
    default:
      return '暂未满足冻结或结算条件。'
  }
}

export function formatExportTime(isoTimestamp: string) {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatResultKindLabel(resultKind: string) {
  switch (resultKind) {
    case 'resolved':
      return '已判定'
    case 'void':
      return '作废'
    default:
      return resultKind
  }
}

function BudgetLedgerPanel({
  summary,
  ledger,
  summaryTestId,
  ledgerTestId,
}: {
  summary: RequesterBudgetSummaryRecord
  ledger: RequesterPropositionBudgetLedgerRecord | null
  summaryTestId: string
  ledgerTestId: string
}) {
  const visibleItems = ledger?.items.slice(0, 4) ?? []

  return (
    <>
      <div className="account-menu-status-row">
        <div>
          <strong>预算台账</strong>
          <span data-testid={summaryTestId}>
            {formatBudgetSummary(summary)} · 已配置 {formatBudgetAmount(summary.configuredAmount)}
          </span>
        </div>
        <em className="account-menu-value">
          <span>剩余 {formatBudgetAmount(summary.remainingAmount)}</span>
        </em>
      </div>
      <div className="account-menu-status-row">
        <div className="submission-detail-stack" data-testid={ledgerTestId}>
          {visibleItems.length ? (
            visibleItems.map((entry) => (
              <div className="submission-detail-stack-row" key={entry.entryId}>
                <strong>{formatBudgetEntryType(entry.entryType)}</strong>
                <span>{formatBudgetEntryDetail(entry)}</span>
                <small>{formatRelativeTime(entry.effectiveAt)}</small>
              </div>
            ))
          ) : (
            <span>暂未生成可展示给发起方的预算记录。</span>
          )}
        </div>
        <em className="account-menu-value">
          <span>
            {summary.currentEntryCount} 条当前记录 · {summary.adjustedEntryCount} 条调整记录
          </span>
        </em>
      </div>
    </>
  )
}

function formatTopCategoryLabel(
  analytics: RequesterOwnedPropositionExportRecord['analytics'],
) {
  const topCategory = analytics.categoryHistory[0]
  if (!topCategory) {
    return '暂无分类数据'
  }

  return formatCategoryLabel(topCategory.category)
}

function formatDeliveryHealthStatus(status: string) {
  switch (status) {
    case 'scheduled':
      return '已排期'
    case 'due':
      return '待执行'
    case 'failing':
      return '异常中'
    case 'disabled':
      return '已停用'
    default:
      return status
  }
}

function formatDeliveryRunStatus(status: string | null) {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'failed':
      return '已失败'
    default:
      return '尚未运行'
  }
}

function formatDeliveryHealthDetail(
  health: RequesterComparisonSetDeliveryPolicyHealthRecord['health'],
) {
  const transportSummary =
    health.transport.status === 'ready' ? '传输就绪' : '传输受阻'
  const snapshotSummary = `快照检查于 ${formatExportTime(health.checkedAt)}`

  if (health.runCounts.totalCount > 0) {
    return `${health.runCounts.totalCount} 次运行 · ${transportSummary} · ${snapshotSummary}`
  }

  return health.transport.status === 'blocked'
    ? `暂无投递运行 · ${transportSummary} · ${snapshotSummary}`
    : `暂无投递运行 · ${snapshotSummary}`
}

function formatDeliveryRunArtifactDetail(exportId: string | null) {
  return exportId
    ? `保留导出 ${exportId}`
    : '暂无保留导出产物'
}

function formatRetainedExportActionLabel(
  available: boolean,
  fallback: string,
) {
  return available ? fallback : '导出已被清理'
}

function formatDeliveryRetryArtifactDetail(
  exportId: string,
  retainedExportAvailable = true,
) {
  return retainedExportAvailable
    ? `复用保留导出 ${exportId}`
    : `复用的保留导出 ${exportId} 已不可用`
}

function formatDeliveryRunProvenanceDetail(
  run: RequesterComparisonSetDeliveryRunListRecord['items'][number],
) {
  return run.retriedRunId
    ? run.exportId && !run.retainedExportAvailable
      ? `重试失败运行 ${run.retriedRunId} · 保留导出 ${run.exportId} 已不可用`
      : `重试失败运行 ${run.retriedRunId}`
    : run.exportId && !run.retainedExportAvailable
      ? `保留导出 ${run.exportId} 已不可用`
      : `${formatDeliveryRunArtifactDetail(run.exportId)}`
}

function formatDeliveryTransportAuthenticationDetail(
  delivery: RequesterComparisonSetDeliveryPolicyRunRecord['delivery']
    | RequesterComparisonSetDeliveryRunRetryRecord['delivery']
    | RequesterComparisonSetDeliveryRunListRecord['items'][number]['delivery'],
) {
  if (!delivery) {
    return '暂无下游传输'
  }

  if (delivery.authentication.kind === 'bearer') {
    return delivery.authentication.credentialKey
      ? `Bearer 凭据 ${delivery.authentication.credentialKey}`
      : 'Bearer 投递未绑定凭据'
  }

  return '暂无下游鉴权'
}

function formatDeliveryRunTransportSummary(
  delivery: RequesterComparisonSetDeliveryRunListRecord['items'][number]['delivery'],
) {
  if (!delivery) {
    return '暂无下游传输'
  }

  return `HTTP ${delivery.statusCode} · ${formatDeliveryTransportAuthenticationDetail(delivery)}`
}

function formatDeliveryTransportBlockingReason(
  blockingReason: RequesterComparisonSetDeliveryPolicyHealthRecord['health']['transport']['blockingReason'],
) {
  switch (blockingReason) {
    case 'transport_credential_missing':
      return '缺少凭据绑定'
    default:
      return '无传输阻塞'
  }
}

function formatDeliveryFailureStreak(count: number) {
  return count === 1 ? '连续 1 次失败' : `连续 ${count} 次失败`
}

function formatDeliveryLastError(
  error: RequesterComparisonSetDeliveryPolicyHealthRecord['policy']['lastRunError'],
) {
  return error?.message ?? '暂无最近运行错误'
}

function formatDeliveryRunTimingSummary(
  health: RequesterComparisonSetDeliveryPolicyHealthRecord['health'],
) {
  const completedSummary = health.lastCompletedRunAt
    ? `最近完成于 ${formatExportTime(health.lastCompletedRunAt)}`
    : '最近完成时间暂未生成'
  const failedSummary = health.lastFailedRunAt
    ? `最近失败于 ${formatExportTime(health.lastFailedRunAt)}`
    : '最近失败时间暂未生成'

  return `${completedSummary} · ${failedSummary}`
}

function formatDeliveryLagSeconds(lagSeconds: number) {
  if (lagSeconds < 60) {
    return `${lagSeconds} 秒`
  }

  const minutes = Math.floor(lagSeconds / 60)
  const seconds = lagSeconds % 60
  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`
}

function formatDeliverySchedulerDetail(
  policy: RequesterComparisonSetDeliveryPolicyHealthRecord['policy'],
  health: RequesterComparisonSetDeliveryPolicyHealthRecord['health'],
) {
  const nextRunSummary = `下次运行 ${formatExportTime(policy.nextRunAt)}`
  if (!health.isDue) {
    return nextRunSummary
  }

  return `${nextRunSummary} · 已逾期 ${formatDeliveryLagSeconds(health.lagSeconds)}`
}

function formatDeliveryRunTriggerType(
  triggerType: NonNullable<
    RequesterComparisonSetDeliveryPolicyHealthRecord['health']['latestRun']
  >['triggerType'],
) {
  switch (triggerType) {
    case 'manual':
      return '手动'
    case 'automation':
      return '自动'
    default:
      return triggerType
  }
}

function formatDeliveryRunReplayFilter(
  replay: RequesterComparisonSetDeliveryRunReplayFilterRecord,
) {
  switch (replay) {
    case 'fresh_only':
      return '仅新运行'
    case 'replayed_only':
      return '仅重试运行'
    default:
      return '全部来源'
  }
}

function formatDeliveryRunHistorySummary(
  runs: RequesterComparisonSetDeliveryRunListRecord,
) {
  const scopeParts: string[] = []
  if (runs.appliedFilters.status) {
    scopeParts.push(`状态：${formatDeliveryRunStatus(runs.appliedFilters.status)}`)
  }
  if (runs.appliedFilters.triggerType) {
    scopeParts.push(`触发：${formatDeliveryRunTriggerType(runs.appliedFilters.triggerType)}`)
  }
  if (runs.appliedFilters.replay !== 'all') {
    scopeParts.push(formatDeliveryRunReplayFilter(runs.appliedFilters.replay))
  }

  const scopeLabel =
    scopeParts.length > 0 ? scopeParts.join(' · ') : '全部保留投递记录'

  if (runs.totalCount < runs.storedCount) {
    return `${scopeLabel} · 显示 ${runs.totalCount} / ${runs.storedCount} 条已保存记录`
  }

  return `${scopeLabel} · 共 ${runs.totalCount} 条已保存记录`
}

function formatDeliveryLatestRunDetail(
  health: RequesterComparisonSetDeliveryPolicyHealthRecord['health'],
) {
  if (!health.latestRun) {
    return '最近运行信息暂未生成'
  }

  const latestRunSummary = health.latestRun.retriedRunId
    ? `已重试失败运行 ${health.latestRun.retriedRunId}`
    : `${formatDeliveryRunTriggerType(health.latestRun.triggerType)}运行 · ${formatDeliveryRunStatus(
        health.latestRun.status,
      )}`

  const artifactSummary =
    health.latestRun.exportId && !health.latestRun.retainedExportAvailable
      ? `保留导出 ${health.latestRun.exportId} 已被清理`
      : formatDeliveryRunArtifactDetail(health.latestRun.exportId)

  return `${latestRunSummary} · ${artifactSummary}`
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
    return `聚焦摘要与健康面板当前都暂无保留导出记录 · 健康快照检查于 ${formatExportTime(selectedCheckedAt)}`
  }

  if (focusedExportId && selectedExportId && focusedExportId === selectedExportId) {
    if (!focusedExportAvailable && !selectedExportAvailable) {
      return `聚焦摘要与健康面板都引用了导出 ${selectedExportId}，但该导出已不再保留 · 健康快照检查于 ${formatExportTime(selectedCheckedAt)}`
    }

    if (!focusedExportAvailable && selectedExportAvailable) {
      const freshnessDetail = selectedIsFresher
        ? `当前健康面板比 ${formatExportTime(focusedCheckedAt)} 的聚焦摘要快照更新`
        : `当前健康快照检查于 ${formatExportTime(selectedCheckedAt)}`

      return `健康面板仍可访问保留导出 ${selectedExportId}，但聚焦摘要中已不可用 · ${freshnessDetail}`
    }

    if (focusedExportAvailable && !selectedExportAvailable) {
      return `聚焦摘要仍可访问保留导出 ${selectedExportId}，但当前健康面板中已不可用 · 当前健康快照检查于 ${formatExportTime(selectedCheckedAt)}`
    }

    return `聚焦摘要与当前保留导出一致：${selectedExportId} · 健康快照检查于 ${formatExportTime(selectedCheckedAt)}`
  }

  if (!focusedExportId && selectedExportId) {
    if (!selectedExportAvailable) {
      return `健康面板仍引用导出 ${selectedExportId}，但该导出已不再保留，且聚焦摘要暂无保留导出记录 · 当前健康快照检查于 ${formatExportTime(selectedCheckedAt)}`
    }

    const freshnessDetail = selectedIsFresher
      ? `当前健康面板比 ${formatExportTime(focusedCheckedAt)} 的聚焦摘要快照更新`
      : `当前健康快照检查于 ${formatExportTime(selectedCheckedAt)}`

    return `健康面板已有保留导出 ${selectedExportId}，但聚焦摘要尚未刷新到该记录 · ${freshnessDetail}`
  }

  if (focusedExportId && !selectedExportId) {
    return focusedExportAvailable
      ? `聚焦摘要仍引用保留导出 ${focusedExportId}，但当前健康面板暂无保留导出记录 · 当前健康快照检查于 ${formatExportTime(selectedCheckedAt)}`
      : `聚焦摘要仍引用导出 ${focusedExportId}，但该导出已不再保留，且当前健康面板暂无保留导出记录 · 当前健康快照检查于 ${formatExportTime(selectedCheckedAt)}`
  }

  const freshnessDetail = focusedIsFresher
    ? `聚焦摘要比 ${formatExportTime(selectedCheckedAt)} 的健康快照更新`
    : `当前健康快照检查于 ${formatExportTime(selectedCheckedAt)}`

  return `聚焦摘要引用的是保留导出 ${focusedExportId}，而当前健康面板引用的是 ${selectedExportId} · ${freshnessDetail}`
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
      return '正在刷新保留导出一致性信息。'
    }

    const rowSnapshotSummary = `快照检查于 ${formatExportTime(rowHealth.checkedAt)}`

    return rowExportId
      ? rowExportAvailable
        ? `当前这一行引用的是保留导出 ${rowExportId} · ${rowSnapshotSummary} · 打开该策略的健康面板可对比保留导出记录。`
        : `当前这一行仍引用导出 ${rowExportId}，但该导出已不再保留 · ${rowSnapshotSummary} · 打开该策略的健康面板可对比保留导出记录。`
      : `当前这一行暂无保留导出记录 · ${rowSnapshotSummary} · 打开该策略的健康面板可对比保留导出记录。`
  }

  if (!rowExportId && !selectedExportId) {
    return `当前这一行与已打开的健康面板都暂无保留导出记录 · 健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`
  }

  if (rowExportId && selectedExportId && rowExportId === selectedExportId) {
    if (!rowExportAvailable && !selectedExportAvailable) {
      return `当前这一行与已打开的健康面板都引用了导出 ${selectedExportId}，但该导出已不再保留 · 健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`
    }

    if (!rowExportAvailable && selectedExportAvailable) {
      const freshnessDetail = selectedIsFresher
        ? `已打开的健康面板比 ${formatExportTime(rowCheckedAt)} 的列表快照更新`
        : `已打开的健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`

      return `已打开的健康面板仍可访问保留导出 ${selectedExportId}，但当前这一行中已不可用 · ${freshnessDetail}`
    }

    if (rowExportAvailable && !selectedExportAvailable) {
      return `当前这一行仍可访问保留导出 ${selectedExportId}，但已打开的健康面板中已不可用 · 已打开的健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`
    }

    return `当前这一行与已打开健康面板的保留导出一致：${selectedExportId} · 健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`
  }

  if (!rowExportId && selectedExportId) {
    if (!selectedExportAvailable) {
      return `已打开的健康面板仍引用导出 ${selectedExportId}，但该导出已不再保留，且当前这一行暂无保留导出记录 · 已打开的健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`
    }

    const freshnessDetail = selectedIsFresher
      ? `已打开的健康面板比 ${formatExportTime(rowCheckedAt)} 的列表快照更新`
      : `已打开的健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`

    return `已打开的健康面板已有保留导出 ${selectedExportId}，但当前这一行尚未刷新到该记录 · ${freshnessDetail}`
  }

  if (rowExportId && !selectedExportId) {
    return rowExportAvailable
      ? `当前这一行仍引用保留导出 ${rowExportId}，但已打开的健康面板暂无保留导出记录 · 已打开的健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`
      : `当前这一行仍引用导出 ${rowExportId}，但该导出已不再保留，且已打开的健康面板暂无保留导出记录 · 已打开的健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`
  }

  const freshnessDetail = rowIsFresher
    ? `当前这一行比 ${formatExportTime(selectedHealth.checkedAt)} 的健康快照更新`
    : `已打开的健康快照检查于 ${formatExportTime(selectedHealth.checkedAt)}`

  return `当前这一行引用的是保留导出 ${rowExportId}，而已打开的健康面板引用的是 ${selectedExportId} · ${freshnessDetail}`
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

function normalizeDeliveryCredentialKey(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : ''
}

function isSavedDeliveryCredential(
  credentials: RequesterDeliveryCredentialDirectoryRecord | null,
  credentialKey: string,
) {
  const normalizedCredentialKey = normalizeDeliveryCredentialKey(credentialKey)
  return (
    normalizedCredentialKey.length > 0
    && (credentials?.items ?? []).some((item) => item.credentialKey === normalizedCredentialKey)
  )
}

function buildDeliveryCredentialBindingOptions(
  credentials: RequesterDeliveryCredentialDirectoryRecord | null,
  credentialKey: string,
) {
  const normalizedCredentialKey = normalizeDeliveryCredentialKey(credentialKey)
  const options = (credentials?.items ?? []).map((item) => ({
    value: item.credentialKey,
    label: item.label,
  }))

  if (
    normalizedCredentialKey.length > 0
    && !options.some((item) => item.value === normalizedCredentialKey)
  ) {
    return [
      {
        value: normalizedCredentialKey,
        label: `不可用绑定：${normalizedCredentialKey}`,
      },
      ...options,
    ]
  }

  return options
}

function formatDeliveryCredentialBindingStatus(
  credentials: RequesterDeliveryCredentialDirectoryRecord | null,
  credentialKey: string,
) {
  const normalizedCredentialKey = normalizeDeliveryCredentialKey(credentialKey)
  if (normalizedCredentialKey.length === 0) {
    return '无凭据'
  }

  return isSavedDeliveryCredential(credentials, normalizedCredentialKey)
    ? '绑定正常'
    : '缺少绑定'
}

function formatDeliveryCredentialBindingDetail(
  credentials: RequesterDeliveryCredentialDirectoryRecord | null,
  credentialKey: string,
) {
  const normalizedCredentialKey = normalizeDeliveryCredentialKey(credentialKey)
  if (normalizedCredentialKey.length === 0) {
    return '不会附加下游 Bearer 令牌'
  }

  return isSavedDeliveryCredential(credentials, normalizedCredentialKey)
    ? `已绑定已保存的 Bearer 凭据 ${normalizedCredentialKey}`
    : `当前环境中不存在已保存的 Bearer 凭据 ${normalizedCredentialKey}`
}

function formatDeliveryCredentialDirectorySummary(
  credentials: RequesterDeliveryCredentialDirectoryRecord | null,
) {
  if (!credentials || credentials.totalCount === 0) {
    return '当前未配置已保存的 Webhook 凭据'
  }

  return credentials.totalCount === 1
    ? `1 个已保存绑定 · ${credentials.items[0]?.label ?? '未知绑定'}`
    : `${credentials.totalCount} 个已保存绑定 · ${credentials.items.map((item) => item.label).join('、')}`
}

function buildCreateComparisonDeliveryFormState(
  comparisonSetId: string,
  defaultCredentialKey = '',
): ComparisonDeliveryFormState {
  return {
    comparisonSetId,
    policyId: null,
    name: '发起方每日摘要',
    description: '将发起方对比导出投递到下游报表流程。',
    nextRunAt: toDeliveryDatetimeInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
    enabled: true,
    retainedExportCount: '5',
    targetUrl: 'https://example.arena.test/requester-deliveries',
    credentialKey: defaultCredentialKey,
  }
}

function formatBudgetAmount(amount: string) {
  const numeric = Number(amount)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : amount
}

function formatBudgetSummary(summary: RequesterBudgetSummaryRecord) {
  return `剩余 ${formatBudgetAmount(summary.remainingAmount)} · 已预留 ${formatBudgetAmount(
    summary.reservedAmount,
  )} · 已花费 ${formatBudgetAmount(summary.spentAmount)}`
}

function formatBudgetEntryType(type: RequesterBudgetLedgerEntryRecord['entryType']) {
  switch (type) {
    case 'reserved':
      return '已预留'
    case 'spent':
      return '已支出'
    case 'released':
      return '已释放'
    case 'adjusted':
    default:
      return '已调整'
  }
}

function formatBudgetEntryDetail(entry: RequesterBudgetLedgerEntryRecord) {
  switch (entry.entryType) {
    case 'reserved':
      return `已预留 ${formatBudgetAmount(entry.reservedAmount)}，待评审结果确认`
    case 'spent':
      return entry.releasedAmount !== '0'
        ? `已支出 ${formatBudgetAmount(entry.spentAmount)} · 已释放 ${formatBudgetAmount(entry.releasedAmount)}`
        : `已支出 ${formatBudgetAmount(entry.spentAmount)}`
    case 'released':
      return `已释放 ${formatBudgetAmount(entry.releasedAmount)} 回到剩余预算`
    case 'adjusted':
    default:
      return `已调整 ${formatBudgetAmount(entry.adjustedAmount)} · ${entry.reasonCode ?? '历史修正'}`
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
  const navigate = useNavigate()
  const [submissions, setSubmissions] = useState<SubmissionCardRecord[]>([])
  const [overview, setOverview] = useState<RequesterOwnedPropositionOverviewRecord | null>(null)
  const [detailById, setDetailById] = useState<Record<string, RequesterOwnedPropositionDetailRecord>>({})
  const [budgetLedgerById, setBudgetLedgerById] =
    useState<Record<string, RequesterPropositionBudgetLedgerRecord>>({})
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
  const [requesterDeliveryCredentials, setRequesterDeliveryCredentials] =
    useState<RequesterDeliveryCredentialDirectoryRecord | null>(null)
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
  const [topLevelLoadErrorMessage, setTopLevelLoadErrorMessage] = useState<string | null>(null)
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
      setBudgetLedgerById({})
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
      setRequesterDeliveryCredentials(null)
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
      setTopLevelLoadErrorMessage(null)

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
        setBudgetLedgerById({})
        setExportsView(exportRecords)
        setReportPresets(presetRecords)
        setComparisonSets(comparisonSetRecords)
        setSelectedPresetId((current) => current || presetRecords.items[0]?.presetId || '')
        setSelectedExport(null)
        setSelectedComparisonAnalytics(null)
        setSelectedComparisonExports(null)
        setSelectedComparisonExport(null)
        setSelectedComparisonDeliveryPolicies(null)
        setRequesterDeliveryCredentials(null)
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

        const nextErrorMessage =
          error instanceof Error ? error.message : '加载已提交命题失败'
        setErrorMessage(nextErrorMessage)
        setTopLevelLoadErrorMessage(nextErrorMessage)
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
        label: '已提交',
        value: String(overview.submissionSummary.submittedCount),
        detail: '已进入真实的发起方审核队列。',
      },
      {
        label: '已启用验证市场',
        value: String(overview.marketSummary.enabledCount),
        detail: '保留后续开启验证市场的能力。',
      },
      {
        label: '未揭晓',
        value: String(overview.resultSummary.unresolvedHiddenCount),
        detail: '在结算前仍不会展示方向性结果。',
      },
      {
        label: '剩余预算',
        value: formatBudgetAmount(overview.budgetSummary.remainingAmount),
        detail: `已预留 ${formatBudgetAmount(overview.budgetSummary.reservedAmount)} · 已花费 ${formatBudgetAmount(
          overview.budgetSummary.spentAmount,
        )}.`,
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

  const comparisonDeliveryCredentialBindingOptions = useMemo(
    () =>
      comparisonDeliveryForm
        ? buildDeliveryCredentialBindingOptions(
            requesterDeliveryCredentials,
            comparisonDeliveryForm.credentialKey,
          )
        : [],
    [comparisonDeliveryForm, requesterDeliveryCredentials],
  )

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
          setErrorMessage(error instanceof Error ? error.message : '加载当前投递策略健康状态失败')
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
        throw new Error('撤回后返回了异常的提交状态')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '撤回已提交命题失败')
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

    if (!detailById[propositionId] || !budgetLedgerById[propositionId]) {
      setPendingDetailId(propositionId)
      try {
        const [detail, budgetLedger] = await Promise.all([
          detailById[propositionId]
            ? Promise.resolve(detailById[propositionId])
            : arenaApi.getOwnedPropositionDetail(propositionId, token),
          budgetLedgerById[propositionId]
            ? Promise.resolve(budgetLedgerById[propositionId])
            : arenaApi.getOwnedPropositionBudgetLedger(propositionId, token),
        ])
        setDetailById((current) => ({
          ...current,
          [propositionId]: detail,
        }))
        setBudgetLedgerById((current) => ({
          ...current,
          [propositionId]: budgetLedger,
        }))
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '加载命题详情失败')
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
        totalCount: (current?.totalCount ?? 0) + 1,
        items: [
          {
            exportId: created.exportId,
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
      setErrorMessage(error instanceof Error ? error.message : '创建发起方导出失败')
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
      setErrorMessage(error instanceof Error ? error.message : '加载发起方导出失败')
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
      const [report, budgetLedger] = await Promise.all([
        arenaApi.getOwnedPropositionReport(propositionId, token),
        budgetLedgerById[propositionId]
          ? Promise.resolve(budgetLedgerById[propositionId])
          : arenaApi.getOwnedPropositionBudgetLedger(propositionId, token),
      ])
      setSelectedSettledReport(report)
      setBudgetLedgerById((current) => ({
        ...current,
        [propositionId]: budgetLedger,
      }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '加载已开奖报告失败')
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
      setErrorMessage(error instanceof Error ? error.message : '加载发起方对比统计失败')
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
      setErrorMessage(error instanceof Error ? error.message : '创建发起方对比导出失败')
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
      setErrorMessage(error instanceof Error ? error.message : '加载发起方对比导出失败')
    } finally {
      setPendingComparisonExportId(null)
    }
  }

  const handleOpenDeliveryRetainedExport = async (
    comparisonSetId: string,
    exportId: string | null,
  ) => {
    if (!exportId) {
      setErrorMessage('当前投递运行没有可打开的保留对比导出')
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
      setErrorMessage(error instanceof Error ? error.message : '删除发起方对比导出失败')
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
      const [policies, credentialDirectory] = await Promise.all([
        arenaApi.listRequesterComparisonSetDeliveryPolicies(comparisonSetId, token),
        arenaApi.listRequesterDeliveryCredentials(token).catch(() => null),
      ])
      setSelectedComparisonDeliveryPolicies(policies)
      setRequesterDeliveryCredentials(credentialDirectory)
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
      setErrorMessage(error instanceof Error ? error.message : '加载发起方对比投递失败')
    }
  }

  const handleOpenCreateComparisonDeliveryPolicy = (comparisonSetId: string) => {
    setComparisonDeliveryForm(
      buildCreateComparisonDeliveryFormState(
        comparisonSetId,
        requesterDeliveryCredentials?.items[0]?.credentialKey ?? '',
      ),
    )
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
      setErrorMessage(error instanceof Error ? error.message : '加载投递健康状态失败')
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
      setErrorMessage(error instanceof Error ? error.message : '保存投递策略失败')
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
      setErrorMessage(error instanceof Error ? error.message : '删除投递策略失败')
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
      setErrorMessage(error instanceof Error ? error.message : '执行投递策略失败')
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
      setErrorMessage(error instanceof Error ? error.message : '加载投递运行记录失败')
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
      setErrorMessage(error instanceof Error ? error.message : '重试投递运行失败')
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
      setErrorMessage(error instanceof Error ? error.message : '筛选发起方对比导出失败')
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
      setErrorMessage(error instanceof Error ? error.message : '筛选投递运行记录失败')
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
      setErrorMessage(error instanceof Error ? error.message : '更新投递策略失败')
    } finally {
      setPendingComparisonPolicyId(null)
    }
  }

  const sourceMode = !isAuthenticated
    ? 'unavailable'
    : sessionMode === 'demo'
      ? 'demo'
      : topLevelLoadErrorMessage
        ? 'unavailable'
        : 'live'

  return (
    <section className="route-page utility-page">
      <button className="page-back-button" type="button" onClick={() => navigate(-1)}>
        <ChevronLeft size={16} />
        <span>返回上一页</span>
      </button>
      <div className="route-header compact">
        <span>Arena</span>
        <h1>已提交命题</h1>
        <p>
          在不改动既有产品流程形状的前提下，继续追踪发起方已提交命题的审核状态、真实详情与导出能力。
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
              <strong>登录后查看已提交命题</strong>
              <p>
                钱包会话认证后，Arena 会展示真实的发起方提交记录、详情进度与导出操作。
              </p>
              <div className="account-summary-actions">
                <Link className="primary-action" to="/zh/challenges">
                  创建命题
                </Link>
                <Link className="secondary-action" to="/zh/drafts">
                  打开草稿箱
                </Link>
              </div>
            </section>
            <WalletStatusCard />
          </>
        ) : null}

        {isAuthenticated && errorMessage ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>已提交命题加载错误</h2>
              <span>{errorMessage}</span>
            </div>
          </section>
        ) : null}

        {isAuthenticated && isLoading ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>正在加载已提交命题</h2>
              <span>正在同步真实概览、提交详情与导出历史。</span>
            </div>
          </section>
        ) : null}

        {isAuthenticated && !isLoading && summaryCards.length > 0 ? (
          <section
            className="submissions-summary-grid"
            aria-label="已提交概览"
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
              <h2>发起方导出快照</h2>
              <span>
                无需离开已提交命题流程，即可从当前命题组合生成真实导出快照。
              </span>
            </div>

            <div className="submissions-actions">
              <label className="field-shell">
                <span className="field-label">导出预设</span>
                <select
                  data-testid="requester-export-preset-select"
                  value={selectedPresetId}
                  onChange={(event) => setSelectedPresetId(event.target.value)}
                >
                  <option value="">直接快照</option>
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
                <span>{pendingExport ? '正在生成导出...' : '生成导出快照'}</span>
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
                      {formatExportTime(item.completedAt)} · {item.metrics.openLifecycleCount} 条进行中流程项
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
                        {pendingExportId === item.exportId ? '打开中...' : '查看导出'}
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
                    <span>文件名</span>
                    <strong data-testid="requester-export-detail-file-name">
                      {selectedExport.fileName}
                    </strong>
                    <small>{formatExportTime(selectedExport.completedAt)} 已生成</small>
                  </article>
                  <article className="account-summary-item">
                    <span>已开奖报告</span>
                    <strong data-testid="requester-export-detail-settled-count">
                      {selectedExport.metrics.settledReportCount}
                    </strong>
                    <small>该导出产物中收录的已开奖命题报告。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>进行中流程项</span>
                    <strong data-testid="requester-export-detail-open-count">
                      {selectedExport.metrics.openLifecycleCount}
                    </strong>
                    <small>尚未结束的命题流程记录。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>报告条数</span>
                    <strong data-testid="requester-export-detail-report-count">
                      {selectedExport.reports.length}
                    </strong>
                    <small>
                      该导出产物中包含结算后的发起方报告。
                    </small>
                  </article>
                  <article className="account-summary-item">
                    <span>统计窗口</span>
                    <strong data-testid="requester-export-detail-window-days">
                      {selectedExport.analytics.windowDays}
                    </strong>
                    <small>此快照记录的滚动统计窗口。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>已创建命题数</span>
                    <strong data-testid="requester-export-detail-created-count">
                      {selectedExport.analytics.totals.createdCount}
                    </strong>
                    <small>导出统计窗口中纳入的命题数量。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>可开验证市场数</span>
                    <strong data-testid="requester-export-detail-market-enabled-count">
                      {selectedExport.analytics.totals.marketEnabledCount}
                    </strong>
                    <small>仍保留验证市场能力的命题数量。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>最高频分类</span>
                    <strong data-testid="requester-export-detail-top-category">
                      {formatTopCategoryLabel(selectedExport.analytics)}
                    </strong>
                    <small>统计窗口中占比最高的命题分类。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>已捕获导出数</span>
                    <strong data-testid="requester-export-detail-latest-export-count">
                      {selectedExport.analytics.delivery.exportCount}
                    </strong>
                    <small>由后端投递摘要统计到的发起方导出历史数量。</small>
                  </article>
                </div>

                <div className="account-menu-status-list">
                  <div className="account-menu-status-row">
                    <div>
                      <strong>概览快照</strong>
                      <span>
                        已提交 {selectedExport.overview.submissionSummary.submittedCount} · 草稿{' '}
                        {selectedExport.overview.submissionSummary.draftCount} · 已启用验证市场{' '}
                        {selectedExport.overview.marketSummary.enabledCount}
                      </span>
                    </div>
                    <em className="account-menu-value">
                      <span>{selectedExport.format.toUpperCase()}</span>
                    </em>
                  </div>
                  <div className="account-menu-status-row">
                    <div>
                      <strong>统计投递</strong>
                      <span>
                        窗口开始于 {formatExportTime(selectedExport.analytics.windowStartedAt)} · 最近导出{' '}
                        {selectedExport.analytics.delivery.latestExportAt
                          ? formatExportTime(selectedExport.analytics.delivery.latestExportAt)
                          : '未记录'}
                      </span>
                    </div>
                    <em className="account-menu-value">
                      <span>{selectedExport.analytics.totals.settledCount} 条已开奖</span>
                    </em>
                  </div>
                  <div className="account-menu-status-row">
                    <div>
                      <strong>预设范围</strong>
                      <span>
                        {selectedExport.preset
                          ? `${selectedExport.preset.name} 预设，范围：${selectedExport.preset.statusScope}。`
                          : '未附加已保存预设；这是直接生成的导出快照。'}
                      </span>
                    </div>
                    <em className="account-menu-value">
                      <span>{selectedExport.preset ? '预设生成' : '直接快照'}</span>
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
                            {formatResultKindLabel(report.result.resultKind)} · 样本{' '}
                            {report.sample.effectiveSampleCount}
                          </span>
                        </div>
                        <em className="account-menu-value">
                          <span data-testid="requester-export-report-winning-option">
                            {report.result.winningOptionLabel ?? '暂无获胜选项'}
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
              <h2>发起方对比集合</h2>
              <span>
                已保存的发起方分组可以在当前已提交命题流程中重新打开、对比并导出。
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
                    <span>{item.presetIds.length} 个预设分组</span>
                  </div>
                  <div className="submissions-export-row-actions">
                    <button
                      className="secondary-action"
                      data-testid="requester-comparison-set-open"
                      onClick={() => void handleOpenComparisonSet(item.comparisonSetId)}
                      type="button"
                    >
                      <Search size={14} />
                      <span>打开统计</span>
                    </button>
                    <button
                      className="secondary-action"
                      data-testid="requester-comparison-set-create-export"
                      onClick={() => void handleCreateComparisonExport(item.comparisonSetId)}
                      type="button"
                    >
                      <Download size={14} />
                      <span>创建对比导出</span>
                    </button>
                    <button
                      className="secondary-action"
                      data-testid="requester-comparison-set-open-delivery"
                      onClick={() => void handleOpenComparisonDelivery(item.comparisonSetId)}
                      type="button"
                    >
                      <FileClock size={14} />
                      <span>投递策略</span>
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
                    <span>对比集合</span>
                    <strong>{selectedComparisonAnalytics.comparisonSet?.name ?? '已保存对比'}</strong>
                    <small>已包含 {selectedComparisonAnalytics.summary.presetCount} 个预设分组。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>分组总数</span>
                    <strong data-testid="requester-comparison-set-total-count">
                      {selectedComparisonAnalytics.totalCount}
                    </strong>
                    <small>该已保存对比中可用的预设统计行数量。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>最高排名预设</span>
                    <strong data-testid="requester-comparison-set-top-preset">
                      {selectedComparisonAnalytics.items[0]?.preset.name ?? '暂无预设'}
                    </strong>
                    <small>已保存对比中排名最高的预设统计行。</small>
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
                    <span>对比导出</span>
                    <strong data-testid="requester-comparison-export-file-name">
                      {selectedComparisonExport.fileName}
                    </strong>
                    <small>{formatExportTime(selectedComparisonExport.completedAt)} 已生成</small>
                  </article>
                  <article className="account-summary-item">
                    <span>预设数量</span>
                    <strong data-testid="requester-comparison-export-preset-count">
                      {selectedComparisonExport.report.presetCount}
                    </strong>
                    <small>已写入该对比导出产物的预设分组数量。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>导出来源</span>
                    <strong data-testid="requester-comparison-export-origin">
                      {selectedComparisonExport.origin.type === 'manual'
                        ? '手动快照'
                        : selectedComparisonExport.origin.type === 'delivery_policy_manual'
                          ? '策略手动执行'
                          : '策略自动执行'}
                    </strong>
                    <small>
                      {selectedComparisonExport.origin.policyName
                        ? selectedComparisonExport.origin.policyName
                        : '未关联到周期策略。'}
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
                          已创建 {row.createdCount} · 已开奖 {row.settledCount} · 未揭晓{' '}
                          {row.unresolvedCount}
                        </span>
                      </div>
                      <em className="account-menu-value">
                        <span>排名 {row.rank}</span>
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
                    <span className="field-label">来源</span>
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
                      <option value="">全部来源</option>
                      <option value="manual">手动</option>
                      <option value="delivery_policy_manual">策略手动</option>
                      <option value="delivery_policy_automation">策略自动</option>
                    </select>
                  </label>
                  <label className="field-shell">
                    <span className="field-label">数量</span>
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
                    <span>已保存导出</span>
                    <strong data-testid="requester-comparison-export-history-count">
                      {selectedComparisonExports.totalCount}
                    </strong>
                    <small>
                      此已保存分组仍可用的保留对比导出产物。
                    </small>
                  </article>
                  <article className="account-summary-item">
                    <span>保留规则</span>
                    <strong data-testid="requester-comparison-export-history-retention">
                      策略保留仅会清理同来源的策略导出
                    </strong>
                    <small>
                      手动快照会一直保留，除非你在这里主动删除。
                    </small>
                  </article>
                  <article className="account-summary-item">
                    <span>当前筛选</span>
                    <strong data-testid="requester-comparison-export-history-filter-summary">
                      {comparisonExportFilters?.policyId
                        ? selectedComparisonDeliveryPolicies?.items.find(
                            (item) => item.policyId === comparisonExportFilters.policyId,
                          )?.name ?? comparisonExportFilters.policyId
                        : comparisonExportFilters?.origin
                          ? comparisonExportFilters.origin
                          : '全部保留导出'}
                    </strong>
                    <small>
                      {comparisonExportFilters?.policyId
                        ? '仅查看单个投递策略历史。'
                        : '正在显示该对比集合的全部保留导出产物。'}
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
                            ? '手动快照'
                            : item.origin.policyName
                              ? `${item.origin.policyName}`
                              : '策略导出'}
                        </span>
                        <small>
                          {item.origin.type === 'manual'
                            ? '不受策略保留清理影响。'
                            : `保留规则仅在策略 ${item.origin.policyName ?? item.origin.policyId ?? '当前范围'} 内生效。`}
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
                            {pendingComparisonExportId === item.exportId ? '打开中...' : '打开'}
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
                            {pendingComparisonExportId === item.exportId ? '删除中...' : '删除'}
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
                      <span>当前聚焦策略</span>
                      <strong>{focusedComparisonDeliveryPolicy.name}</strong>
                      <small>
                        下方的操作与面板都将围绕这个投递策略展示。
                      </small>
                      <small data-testid="requester-comparison-delivery-focus-run-timing">
                        {focusedComparisonDeliveryHealthSummary
                          ? formatDeliveryRunTimingSummary(focusedComparisonDeliveryHealthSummary.health)
                          : '正在刷新当前运行时间。'}
                      </small>
                      <small data-testid="requester-comparison-delivery-focus-scheduler-detail">
                        {focusedComparisonDeliveryHealthSummary
                          ? formatDeliverySchedulerDetail(
                            focusedComparisonDeliveryHealthSummary.policy,
                            focusedComparisonDeliveryHealthSummary.health,
                          )
                          : '正在刷新调度状态。'}
                      </small>
                      <small data-testid="requester-comparison-delivery-focus-latest-run">
                        {focusedComparisonDeliveryHealthSummary
                          ? formatDeliveryLatestRunDetail(focusedComparisonDeliveryHealthSummary.health)
                          : '正在刷新最近运行记录。'}
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
                            ? '打开中...'
                            : formatRetainedExportActionLabel(
                              focusedComparisonDeliveryHealthSummary?.health.latestRun
                                ?.retainedExportAvailable ?? false,
                              '打开最近导出',
                            )}
                        </span>
                      </button>
                    </article>
                    <article className="account-summary-item">
                      <span>状态</span>
                      <strong data-testid="requester-comparison-delivery-focus-status">
                        {focusedComparisonDeliveryPolicy.enabled ? '已启用' : '已暂停'}
                      </strong>
                      <small>
                        保留 {focusedComparisonDeliveryPolicy.retainedExportCount} 份已完成导出。
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>健康状态</span>
                      <strong data-testid="requester-comparison-delivery-focus-health-status">
                        {focusedComparisonDeliveryHealthSummary
                          ? formatDeliveryHealthStatus(focusedComparisonDeliveryHealthSummary.health.status)
                          : '加载中...'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-focus-health-detail">
                        {focusedComparisonDeliveryHealthSummary
                          ? `${focusedComparisonDeliveryHealthSummary.health.transport.status === 'ready'
                              ? '传输就绪'
                              : `传输受阻 · ${formatDeliveryTransportBlockingReason(
                                focusedComparisonDeliveryHealthSummary.health.transport.blockingReason,
                              )}`} · 快照检查于 ${formatExportTime(
                              focusedComparisonDeliveryHealthSummary.health.checkedAt,
                            )}`
                          : '正在刷新当前策略健康状态。'}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>运行次数</span>
                      <strong data-testid="requester-comparison-delivery-focus-run-count">
                        {focusedComparisonDeliveryHealthSummary
                          ? focusedComparisonDeliveryHealthSummary.health.runCounts.totalCount
                          : '...'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-focus-run-breakdown">
                        {focusedComparisonDeliveryHealthSummary
                          ? focusedComparisonDeliveryHealthSummary.health.runCounts.totalCount > 0
                            ? `${focusedComparisonDeliveryHealthSummary.health.runCounts.completedCount} 次已完成 · ${focusedComparisonDeliveryHealthSummary.health.runCounts.failedCount} 次失败`
                            : '暂无投递运行'
                          : '正在刷新当前运行摘要。'}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>失败情况</span>
                      <strong data-testid="requester-comparison-delivery-focus-failure-streak">
                        {focusedComparisonDeliveryHealthSummary
                          ? focusedComparisonDeliveryHealthSummary.health.consecutiveFailureCount > 0
                            ? formatDeliveryFailureStreak(
                              focusedComparisonDeliveryHealthSummary.health.consecutiveFailureCount,
                            )
                            : '当前无连续失败'
                          : '正在刷新连续失败信息。'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-focus-last-error">
                        {focusedComparisonDeliveryHealthSummary
                          ? focusedComparisonDeliveryHealthSummary.policy.lastRunError
                            ? `最近失败：${formatDeliveryLastError(
                              focusedComparisonDeliveryHealthSummary.policy.lastRunError,
                            )}`
                            : '暂无最近运行错误'
                          : '正在刷新最近错误。'}
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
                    <span>创建投递策略</span>
                  </button>
                </div>

                {comparisonDeliveryForm ? (
                  <div
                    className="submission-detail-grid submissions-export-detail-grid"
                    data-testid="requester-comparison-delivery-form"
                  >
                    <label className="field-shell">
                      <span className="field-label">策略名称</span>
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
                      <span className="field-label">描述</span>
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
                      <span className="field-label">下次运行</span>
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
                      <span className="field-label">保留导出数</span>
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
                      <span className="field-label">Webhook 目标地址</span>
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
                      <span className="field-label">已保存凭据绑定</span>
                      <select
                        data-testid="requester-comparison-delivery-credential-binding-select"
                        value={normalizeDeliveryCredentialKey(comparisonDeliveryForm.credentialKey)}
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
                      >
                        <option value="">无凭据绑定</option>
                        {comparisonDeliveryCredentialBindingOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-shell">
                      <span className="field-label">凭据 Key</span>
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
                      <span className="field-label">是否启用</span>
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
                        <option value="enabled">已启用</option>
                        <option value="paused">已暂停</option>
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
                        <span>{pendingComparisonDeliverySave ? '保存中...' : '保存策略'}</span>
                      </button>
                      <button
                        className="secondary-action"
                        data-testid="requester-comparison-delivery-clear-credential"
                        disabled={normalizeDeliveryCredentialKey(comparisonDeliveryForm.credentialKey).length === 0}
                        onClick={() =>
                          setComparisonDeliveryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  credentialKey: '',
                                }
                              : current,
                          )
                        }
                        type="button"
                      >
                        <Undo2 size={16} />
                        <span>清空绑定</span>
                      </button>
                    </div>
                    <article className="account-summary-item">
                      <span>凭据绑定</span>
                      <strong data-testid="requester-comparison-delivery-credential-status">
                        {formatDeliveryCredentialBindingStatus(
                          requesterDeliveryCredentials,
                          comparisonDeliveryForm.credentialKey,
                        )}
                      </strong>
                      <small data-testid="requester-comparison-delivery-credential-detail">
                        {formatDeliveryCredentialBindingDetail(
                          requesterDeliveryCredentials,
                          comparisonDeliveryForm.credentialKey,
                        )}
                      </small>
                      <small data-testid="requester-comparison-delivery-available-credentials">
                        {formatDeliveryCredentialDirectorySummary(requesterDeliveryCredentials)}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>保留策略</span>
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
                          {policy.enabled ? '已启用' : '已暂停'} · 下次运行{' '}
                          {formatExportTime(policy.nextRunAt)}
                        </span>
                        <small>保留 {policy.retainedExportCount} 份已完成导出</small>
                        <small data-testid="requester-comparison-delivery-policy-run-summary">
                          {policy.lastRunStatus
                            ? `最近运行：${formatDeliveryRunStatus(policy.lastRunStatus)}`
                            : '尚未运行'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-latest-run-detail">
                          {policyHealth
                            ? formatDeliveryLatestRunDetail(policyHealth.health)
                            : '正在刷新最近运行记录。'}
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
                            : '加载中...'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-health-detail">
                          {policyHealth
                            ? formatDeliveryHealthDetail(policyHealth.health)
                            : '正在刷新健康摘要。'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-scheduler-detail">
                          {policyHealth
                            ? formatDeliverySchedulerDetail(policy, policyHealth.health)
                            : '正在刷新调度状态。'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-failure-streak">
                          {policyHealth
                            ? policyHealth.health.consecutiveFailureCount > 0
                              ? formatDeliveryFailureStreak(policyHealth.health.consecutiveFailureCount)
                              : '当前无连续失败'
                            : '正在刷新连续失败信息。'}
                        </small>
                        <small data-testid="requester-comparison-delivery-policy-last-error">
                          {policy.lastRunError
                            ? `最近失败：${formatDeliveryLastError(policy.lastRunError)}`
                            : '暂无最近运行错误'}
                        </small>
                        {focusedComparisonDeliveryPolicy?.policyId === policy.policyId ? (
                          <small data-testid="requester-comparison-delivery-policy-focus-tag">
                            当前聚焦
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
                          <span>聚焦</span>
                        </button>
                        <button
                          className="secondary-action"
                          data-testid="requester-comparison-delivery-edit-open"
                          disabled={pendingComparisonPolicyId === policy.policyId}
                          onClick={() => void handleOpenEditComparisonDeliveryPolicy(policy)}
                          type="button"
                        >
                          <Pencil size={14} />
                          <span>编辑</span>
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
                          <span>健康状态</span>
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
                              ? '打开中...'
                              : formatRetainedExportActionLabel(
                                policyHealth?.health.latestRun?.retainedExportAvailable ?? false,
                                '打开最近导出',
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
                          <span>导出</span>
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
                          <span>运行记录</span>
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
                          <span>立即执行</span>
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
                          <span>{policy.enabled ? '暂停' : '恢复'}</span>
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
                          <span>删除</span>
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
                    <strong>该对比集合尚未配置投递策略</strong>
                    <p>
                      创建周期投递策略后，就能在当前页面内保留对比导出并推送到下游报表流程。
                    </p>
                  </section>
                ) : null}

                {selectedComparisonDeliveryHealth ? (
                  <div
                    className="submission-detail-grid submissions-export-detail-grid"
                    data-testid="requester-comparison-delivery-health-panel"
                  >
                    <article className="account-summary-item">
                      <span>策略状态</span>
                      <strong data-testid="requester-comparison-delivery-health-status">
                        {formatDeliveryHealthStatus(selectedComparisonDeliveryHealth.health.status)}
                      </strong>
                      <small data-testid="requester-comparison-delivery-health-scope">
                        {selectedComparisonDeliveryHealth.policy.name}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>传输</span>
                      <strong data-testid="requester-comparison-delivery-health-transport">
                        {selectedComparisonDeliveryHealth.health.transport.status === 'ready'
                          ? '就绪'
                          : '受阻'}
                      </strong>
                      <small data-testid="requester-comparison-delivery-health-transport-detail">
                        {selectedComparisonDeliveryHealth.health.transport.status === 'ready'
                          ? (selectedComparisonDeliveryHealth.health.transport.credentialKey ?? '无凭据绑定')
                          : formatDeliveryTransportBlockingReason(
                            selectedComparisonDeliveryHealth.health.transport.blockingReason,
                          )}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>已保存绑定</span>
                      <strong data-testid="requester-comparison-delivery-health-credential-count">
                        {requesterDeliveryCredentials?.totalCount ?? 0}
                      </strong>
                      <small data-testid="requester-comparison-delivery-health-credential-options">
                        {formatDeliveryCredentialDirectorySummary(requesterDeliveryCredentials)}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>最近保留导出</span>
                      <strong>
                        {selectedComparisonDeliveryHealth.health.latestRun?.exportId ?? '暂无保留导出'}
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
                            ? '打开中...'
                            : formatRetainedExportActionLabel(
                              selectedComparisonDeliveryHealth.health.latestRun
                                ?.retainedExportAvailable ?? false,
                              '打开保留导出',
                            )}
                        </span>
                      </button>
                    </article>
                    <article className="account-summary-item">
                      <span>连续失败</span>
                      <strong data-testid="requester-comparison-delivery-health-failure-streak">
                        {selectedComparisonDeliveryHealth.health.consecutiveFailureCount > 0
                          ? formatDeliveryFailureStreak(
                            selectedComparisonDeliveryHealth.health.consecutiveFailureCount,
                          )
                          : '当前无连续失败'}
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
                      <span>最近运行导出</span>
                      <strong data-testid="requester-comparison-delivery-run-file-name">
                        {selectedComparisonDeliveryRun.export.fileName}
                      </strong>
                      <small>{formatExportTime(selectedComparisonDeliveryRun.export.completedAt)} 已投递</small>
                    </article>
                    <article className="account-summary-item">
                      <span>运行状态</span>
                      <strong data-testid="requester-comparison-delivery-run-status">
                        {formatDeliveryRunStatus(selectedComparisonDeliveryRun.policy.lastRunStatus)}
                      </strong>
                      <small data-testid="requester-comparison-delivery-run-provenance">
                        {formatDeliveryRunProvenanceDetail(selectedComparisonDeliveryRun.run)}
                      </small>
                      <small>
                        {selectedComparisonDeliveryRun.run.delivery
                          ? `HTTP ${selectedComparisonDeliveryRun.run.delivery.statusCode}`
                          : '暂无下游传输'}
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
                        <span>运行历史</span>
                        <strong data-testid="requester-comparison-delivery-run-history-summary">
                          {formatDeliveryRunHistorySummary(selectedComparisonDeliveryRuns)}
                        </strong>
                        <small>
                          {selectedComparisonDeliveryRuns.totalCount < selectedComparisonDeliveryRuns.storedCount
                            ? '即使筛选缩小了可见范围，有限历史仍会明确保留。'
                            : '当前已显示该策略下全部保留的发起方投递运行记录。'}
                        </small>
                      </article>
                    </div>
                    <div className="submissions-actions">
                      <label className="field-shell">
                        <span className="field-label">运行状态</span>
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
                          <option value="">全部运行</option>
                          <option value="completed">已完成</option>
                          <option value="failed">已失败</option>
                        </select>
                      </label>
                      <label className="field-shell">
                        <span className="field-label">触发方式</span>
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
                          <option value="">全部触发方式</option>
                          <option value="manual">手动</option>
                          <option value="automation">自动</option>
                        </select>
                      </label>
                      <label className="field-shell">
                        <span className="field-label">来源</span>
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
                          <option value="all">全部来源</option>
                          <option value="fresh_only">仅新运行</option>
                          <option value="replayed_only">仅重试</option>
                        </select>
                      </label>
                      <label className="field-shell">
                        <span className="field-label">数量</span>
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
                            {formatExportTime(run.completedAt)} · {run.origin.policyName ?? '未命名策略'}
                          </span>
                          <small>
                            {`${formatDeliveryRunTriggerType(run.triggerType)}投递 · ${formatDeliveryRunTransportSummary(run.delivery)}`}
                          </small>
                          <small>{formatDeliveryRunProvenanceDetail(run)}</small>
                          {run.retriedRunId ? (
                            <small>
                              {formatDeliveryRetryArtifactDetail(
                                run.exportId ?? '未知导出',
                                run.retainedExportAvailable,
                              )}
                            </small>
                          ) : null}
                          {run.error ? (
                            <>
                              <small>{run.error.message}</small>
                            </>
                          ) : (
                            <small>暂无投递错误</small>
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
                                ? '打开中...'
                                : formatRetainedExportActionLabel(
                                  run.retainedExportAvailable,
                                  '打开保留导出',
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
                              <span>重试</span>
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
                      <span>重试状态</span>
                      <strong data-testid="requester-comparison-delivery-retry-status">
                        {formatDeliveryRunStatus(selectedComparisonDeliveryRetry.policy.lastRunStatus)}
                      </strong>
                      <small data-testid="requester-comparison-delivery-retry-provenance">
                        {formatDeliveryRunProvenanceDetail(selectedComparisonDeliveryRetry.run)}
                      </small>
                    </article>
                    <article className="account-summary-item">
                      <span>重试导出</span>
                      <strong data-testid="requester-comparison-delivery-retry-file-name">
                        {selectedComparisonDeliveryRetry.export.fileName}
                      </strong>
                      <small>{formatExportTime(selectedComparisonDeliveryRetry.export.completedAt)} 已投递</small>
                      <small>
                        {formatDeliveryRetryArtifactDetail(
                          selectedComparisonDeliveryRetry.export.exportId,
                          selectedComparisonDeliveryRetry.run.retainedExportAvailable,
                        )}
                      </small>
                      <small>
                        {selectedComparisonDeliveryRetry.run.delivery
                          ? `HTTP ${selectedComparisonDeliveryRetry.run.delivery.statusCode}`
                          : '暂无下游传输'}
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
                            ? '打开中...'
                            : formatRetainedExportActionLabel(
                              selectedComparisonDeliveryRetry.run.retainedExportAvailable,
                              '打开保留导出',
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
            <strong>当前暂无进入发起方审核队列的命题</strong>
            <p>
              草稿提交后会出现在这里。撤回后会回到草稿箱，方便你在不丢失上下文的情况下继续编辑。
            </p>
            <div className="account-summary-actions">
              <Link className="primary-action" to="/zh/challenges">
                创建命题
              </Link>
              <Link className="secondary-action" to="/zh/drafts">
                打开草稿箱
              </Link>
            </div>
          </section>
        ) : null}

        {isAuthenticated && !isLoading && submissions.length > 0 ? (
          <section className="account-menu-panel">
            <div className="account-menu-panel-head">
              <h2>审核中的候选命题</h2>
              <span>
                这些命题已经进入真实提交流程，现在可以在不破坏现有产品形态的前提下展示真实详情。
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
                        {detail ? formatSubmissionStatus(detail.submission.status) : '审核中'}
                      </span>
                    </div>

                    <div className="submissions-meta-row">
                      <span>{submission.categoryLabel}</span>
                      <span>最低有效样本 {submission.minEffectiveSample}</span>
                      <span>
                        {submission.marketEnabled
                          ? '保留验证市场能力'
                          : '未预留验证市场'}
                      </span>
                    </div>

                    <div className="drafts-tags-row">
                      {submission.tags.length > 0 ? (
                        submission.tags.map((tag) => (
                          <span className="drafts-tag" key={`${submission.propositionId}-${tag}`}>
                            {formatSampleConstraintLabel(tag)}
                          </span>
                        ))
                      ) : (
                        <span
                          className="drafts-tag drafts-tag--empty"
                          data-testid={`submission-sample-constraints-empty-${submission.propositionId}`}
                        >
                          暂无样本约束
                        </span>
                      )}
                    </div>

                    <div className="submissions-foot">
                      <div className="submissions-time-copy">
                        <span>提交于 {submission.submittedAtLabel}</span>
                        <span>更新于 {submission.updatedAtLabel}</span>
                      </div>
                      <div className="submissions-actions">
                        <button
                          className="secondary-action"
                          data-testid={`submission-detail-toggle-${submission.propositionId}`}
                          onClick={() => void handleToggleDetail(submission.propositionId)}
                          type="button"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          <span>{isExpanded ? '收起详情' : '展开详情'}</span>
                        </button>
                        <Link className="secondary-action" to={`/zh/challenges?draft=${submission.propositionId}`}>
                          继续查看
                        </Link>
                        <button
                          className="primary-action submissions-withdraw-button"
                          data-testid={`withdraw-submission-${submission.propositionId}`}
                          disabled={isPendingWithdraw}
                          onClick={() => void handleWithdraw(submission.propositionId)}
                          type="button"
                        >
                          <Undo2 size={16} />
                          <span>{isPendingWithdraw ? '撤回中...' : '撤回到草稿箱'}</span>
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
                            <span>提交状态</span>
                            <strong data-testid={`submission-status-${submission.propositionId}`}>
                              {formatSubmissionStatus(detail.submission.status)}
                            </strong>
                            <small>{detail.submission.submissionNote ?? '未附带备注。'}</small>
                          </article>
                          <article className="account-summary-item">
                            <span>流程状态</span>
                            <strong data-testid={`proposition-status-${submission.propositionId}`}>
                              {formatLifecycleStatus(detail.proposition.status)}
                            </strong>
                            <small>{formatClosureReason(detail.closureReadiness.triggerReason)}</small>
                          </article>
                          <article className="account-summary-item">
                            <span>有效样本</span>
                            <strong data-testid={`sample-progress-${submission.propositionId}`}>
                              {detail.sampleCounter.effectiveSampleCount} / {detail.proposition.minEffectiveSample}
                            </strong>
                            <small>当前已完成 {detail.reviewSummary.finalizedCount} 条评审。</small>
                          </article>
                          <article className="account-summary-item">
                            <span>分发覆盖</span>
                            <strong>
                              {detail.dispatchSummary.submittedCount} / {detail.dispatchSummary.totalTasks}
                            </strong>
                            <small>{detail.dispatchSummary.uniqueAssignedUsers} 位唯一分配用户。</small>
                          </article>
                        </div>

                        <div className="account-menu-status-list">
                          <div className="account-menu-status-row">
                            <div>
                              <strong>揭晓与结算约束</strong>
                              <span>
                                {detail.revealSettlement.resultKind
                                  ? `结果：${detail.revealSettlement.resultKind}`
                                  : '结算前不会展示方向性结果。'}
                              </span>
                            </div>
                            <em className="account-menu-value">
                              <FileClock size={14} />
                              <span>{detail.market ? detail.market.status : '暂无市场'}</span>
                            </em>
                          </div>
                          <BudgetLedgerPanel
                            summary={detail.budgetSummary}
                            ledger={budgetLedgerById[submission.propositionId] ?? null}
                            summaryTestId={`submission-budget-summary-${submission.propositionId}`}
                            ledgerTestId={`submission-budget-ledger-${submission.propositionId}`}
                          />
                        </div>
                      </div>
                    ) : null}

                    {isPendingDetail ? (
                      <div className="submission-detail-loading">
                        <span>正在加载详情...</span>
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
              <h2>最近提交记录</h2>
              <span>来自真实概览接口的最近发起方命题记录。</span>
            </div>

            <div className="account-menu-status-list">
              {overview.recent.map((item) => (
                <div className="account-menu-status-row" key={item.propositionId}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {formatCategoryLabel(item.category)} ·{' '}
                      {item.status === 'settled'
                        ? `已开奖 ${item.settledAt ? formatRelativeTime(item.settledAt) : '刚刚'}`
                        : `已提交 ${item.submittedAt ? formatRelativeTime(item.submittedAt) : '刚刚'}`}
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
                          {pendingReportId === item.propositionId ? '打开中...' : '查看已开奖报告'}
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
                    <span>已开奖命题</span>
                    <strong data-testid="requester-settled-report-title">
                      {selectedSettledReport.proposition.title}
                    </strong>
                    <small>
                      {formatCategoryLabel(selectedSettledReport.proposition.category)} · 已开奖{' '}
                      {formatExportTime(selectedSettledReport.result.settledAt)}
                    </small>
                  </article>
                  <article className="account-summary-item">
                    <span>结果类型</span>
                    <strong data-testid="requester-settled-report-result-kind">
                      {formatResultKindLabel(selectedSettledReport.result.resultKind)}
                    </strong>
                    <small>来自 Arena 发起方接口的已结算结果。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>获胜选项</span>
                    <strong data-testid="requester-settled-report-winning-option">
                      {selectedSettledReport.result.winningOptionLabel ?? '暂无获胜选项'}
                    </strong>
                    <small>仅在结算完成后展示方向性结果。</small>
                  </article>
                  <article className="account-summary-item">
                    <span>有效样本</span>
                    <strong data-testid="requester-settled-report-sample">
                      {selectedSettledReport.sample.effectiveSampleCount}
                    </strong>
                    <small>已完成 {selectedSettledReport.reviewSummary.finalizedCount} 条评审。</small>
                  </article>
                </div>

                <div className="account-menu-status-list">
                  <div className="account-menu-status-row">
                    <div>
                      <strong>分发覆盖</strong>
                      <span>
                        {selectedSettledReport.dispatchSummary.submittedCount} /{' '}
                        {selectedSettledReport.dispatchSummary.totalTasks} 条已提交任务 ·{' '}
                        {selectedSettledReport.dispatchSummary.uniqueAssignedUsers} 位唯一用户
                      </span>
                    </div>
                    <em className="account-menu-value">
                      <span>{selectedSettledReport.result.marketStatus ?? '暂无市场'}</span>
                    </em>
                  </div>
                  <BudgetLedgerPanel
                    summary={selectedSettledReport.budgetSummary}
                    ledger={budgetLedgerById[selectedSettledReport.proposition.id] ?? null}
                    summaryTestId="requester-settled-report-budget-summary"
                    ledgerTestId="requester-settled-report-budget-ledger"
                  />
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  )
}
