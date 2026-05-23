import { useState } from 'react'
import type {
  RespondentAccountActivityItemViewModel,
  RespondentResultOverviewViewModel,
} from '@arena/shared'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  CircleCheck,
  ExternalLink,
  Info,
  Trophy,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { AccountShellHeader } from '../components/shared/AccountShellHeader'
import { useRulesIntro } from '../components/shared/RulesIntroContext'
import { useResultOverviewData } from '../features/arena/result-overview-data'
import {
  ACCOUNT_ASSET_SUMMARY_ITEMS,
  ACCOUNT_HEADER_METRICS,
  ACCOUNT_OVERVIEW_TIMELINE_ITEMS,
  ACCOUNT_POSITIONS,
  ACCOUNT_RECORDS,
  ACCOUNT_SUMMARY_STATS,
} from '../mocks/account-shell.mock'

type ResultsTabId = 'overview' | 'performance' | 'positions' | 'records'
type SummaryStatTone = 'positive' | 'negative' | 'neutral'

type SummaryStat = {
  label: string
  value: string
  delta: string
  detail: string
  tone: SummaryStatTone
  icon: LucideIcon
}

type ResultsTab = {
  id: ResultsTabId
  label: string
}

type PositionRow = {
  direction: 'long' | 'short'
  contract: string
  amount: string
  averageCost: string
  settlePrice: string
  pnl: string
  pnlPercent: string
  status: string
  selectedOptionLabel?: string
  openedAt?: string
  publicResultLabel?: string
}

type SparkItem = {
  label: string
  value: string
  detail: string
  series: number[]
}

type RingSegment = {
  label: string
  value: number
  color: string
}

type OverviewHeroValue = {
  total: string
  delta: string
  stats: SummaryItem[]
}

type HeatmapCell = {
  day: string
  time: string
  value: number
}

type SummaryItem = {
  label: string
  value: string
  detail: string
  tone?: SummaryStatTone
}

type TimelineItem = {
  time: string
  title: string
  detail: string
  amount?: string
  tone?: SummaryStatTone
}

type ExposureItem = {
  label: string
  value: string
  detail: string
  width: number
}

type RecordRow = {
  time: string
  type: string
  reference: string
  change: string
  balance: string
  status: string
  detailText?: string
}

type PerformanceChartData = {
  labels: string[]
  cumulativePnlSeries: number[]
  positiveRateSeries: number[]
  settlementPnlSeries: number[]
  cumulativePnlLabel: string
  positiveRateLabel: string
  rangeLabel: string
}

type ActivityFlowData = {
  labels: string[]
  netSeries: number[]
  creditSeries: number[]
  committedSeries: number[]
  netLabel: string
  creditLabel: string
  committedLabel: string
  rangeLabel: string
}

function formatShortDateTime(isoTimestamp: string) {
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

function formatSignedAmount(value: string | null | undefined) {
  if (!value) {
    return '0.00'
  }

  if (value.startsWith('-')) {
    return `${value}.00`
  }

  if (value === '0') {
    return '0.00'
  }

  return `+${value}.00`
}

function formatPercent(part: number, total: number) {
  if (total <= 0) {
    return '0%'
  }

  return `${Math.round((part / total) * 100)}%`
}

function formatSegmentPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.max(1, Math.round(value))
}

function formatActivityAmount(
  amount: string | null | undefined,
  direction: 'positive' | 'negative' | 'neutral',
) {
  if (!amount) {
    return undefined
  }

  if (direction === 'positive' && !amount.startsWith('-') && amount !== '0') {
    return `+${amount}.00 USDC`
  }

  return `${amount}.00 USDC`
}

function formatResultAmount(amount: string | null | undefined) {
  if (!amount) {
    return undefined
  }

  if (amount.startsWith('-')) {
    return `${amount}.00 USDC`
  }

  if (amount === '0') {
    return '0.00 USDC'
  }

  return `+${amount}.00 USDC`
}

function formatUnsignedAmount(amount: string | null | undefined) {
  if (!amount) {
    return undefined
  }

  if (amount.startsWith('-')) {
    return `${amount.slice(1)}.00 USDC`
  }

  return `${amount}.00 USDC`
}

function parseAmountNumber(value: string | null | undefined) {
  if (!value) {
    return 0
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCompactAmount(value: number, suffix = '') {
  const absoluteValue = Math.abs(value)
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''

  if (absoluteValue >= 1000) {
    return `${sign}${(absoluteValue / 1000).toFixed(1)}k${suffix}`
  }

  return `${sign}${absoluteValue.toFixed(1)}${suffix}`
}

function formatAxisAmount(value: number) {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  }

  return `${value.toFixed(0)}`
}

function formatShortDateLabel(isoTimestamp: string) {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  })
}

function formatShortTimeLabel(isoTimestamp: string) {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp
  }

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatOptionLabel(option: 0 | 1 | null) {
  if (option === 0) {
    return '选项 1'
  }

  if (option === 1) {
    return '选项 2'
  }

  return '待公开'
}

function formatPublicResultLabel(
  publicResult: RespondentResultOverviewViewModel['openPositions']['items'][number]['publicResult'],
) {
  if (!publicResult) {
    return '待公开'
  }

  if (publicResult.resultKind === 'void') {
    return publicResult.voidReason ? `作废：${publicResult.voidReason}` : '作废结算'
  }

  if (typeof publicResult.winningOption === 'number') {
    return `公开结果：${formatOptionLabel(publicResult.winningOption)}`
  }

  return '公开结果已发布'
}

function ensureChartSeries(values: number[]) {
  if (values.length === 0) {
    return [0, 0]
  }

  if (values.length === 1) {
    return [values[0], values[0]]
  }

  return values
}

function ensureChartLabels(labels: string[]) {
  if (labels.length === 0) {
    return ['--', '--']
  }

  if (labels.length === 1) {
    return [labels[0], labels[0]]
  }

  return labels
}

function buildAxisTicks(min: number, max: number, steps: number) {
  if (steps <= 1) {
    return [formatAxisAmount(max)]
  }

  const range = max - min
  if (range === 0) {
    return Array.from({ length: steps }, () => formatAxisAmount(max))
  }

  return Array.from({ length: steps }, (_, index) => {
    const ratio = 1 - index / (steps - 1)
    return formatAxisAmount(min + range * ratio)
  })
}

function getHeatmapBucketHour(isoTimestamp: string) {
  const hour = new Date(isoTimestamp).getHours()
  if (Number.isNaN(hour)) {
    return '00:00'
  }

  if (hour < 6) {
    return '00:00'
  }

  if (hour < 12) {
    return '06:00'
  }

  if (hour < 18) {
    return '12:00'
  }

  return '18:00'
}

function getHeatmapDayLabel(isoTimestamp: string) {
  const day = new Date(isoTimestamp).getDay()
  if (Number.isNaN(day)) {
    return '周一'
  }

  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day] ?? '周一'
}

function buildPerformanceChartData(overview: RespondentResultOverviewViewModel | null): PerformanceChartData | null {
  if (!overview) {
    return null
  }

  const sourceItems = overview.settledResults.items
    .slice()
    .sort((left, right) => left.settledAt.localeCompare(right.settledAt))
    .slice(-8)

  if (sourceItems.length === 0) {
    return null
  }

  let cumulativePnl = 0
  const labels = sourceItems.map((item) => formatShortDateLabel(item.settledAt))
  const cumulativePnlSeries = sourceItems.map((item, index) => {
    cumulativePnl += parseAmountNumber(item.currentUserPnl)

    return cumulativePnl
  })
  const positiveRateSeries = sourceItems.map((item, index) => {
    const nextPositiveCount = sourceItems
      .slice(0, index + 1)
      .filter((entry) => parseAmountNumber(entry.currentUserPnl) > 0)
      .length

    return Math.round((nextPositiveCount / (index + 1)) * 100)
  })
  const settlementPnlSeries = sourceItems.map((item) => parseAmountNumber(item.currentUserPnl))

  return {
    labels,
    cumulativePnlSeries,
    positiveRateSeries,
    settlementPnlSeries,
    cumulativePnlLabel: formatCompactAmount(cumulativePnlSeries[cumulativePnlSeries.length - 1] ?? 0, ' USDC'),
    positiveRateLabel: `${positiveRateSeries[positiveRateSeries.length - 1] ?? 0}%`,
    rangeLabel: `${labels[0]} - ${labels[labels.length - 1]}`,
  }
}

function buildActivityHeatmapCells(
  activities: RespondentAccountActivityItemViewModel[],
): HeatmapCell[] {
  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const timeLabels = ['00:00', '06:00', '12:00', '18:00']
  const counters = new Map<string, number>()

  activities.forEach((activity) => {
    const day = getHeatmapDayLabel(activity.occurredAt)
    const time = getHeatmapBucketHour(activity.occurredAt)
    const key = `${day}-${time}`
    counters.set(key, (counters.get(key) ?? 0) + 1)
  })

  return timeLabels.flatMap((time) =>
    dayLabels.map((day) => ({
      day,
      time,
      value: counters.get(`${day}-${time}`) ?? 0,
    })),
  )
}

function buildActivityFlowData(overview: RespondentResultOverviewViewModel | null): ActivityFlowData | null {
  if (!overview) {
    return null
  }

  const groupedByDate = new Map<string, { net: number; credit: number; committed: number }>()
  const recentActivities = overview.recentActivity
    .slice()
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .slice(-8)

  if (recentActivities.length === 0) {
    return null
  }

  recentActivities.forEach((activity) => {
    const label = formatShortDateLabel(activity.occurredAt)
    const current = groupedByDate.get(label) ?? { net: 0, credit: 0, committed: 0 }
    const amount = parseAmountNumber(activity.amount)

    if (activity.activityType === 'position_opened') {
      current.committed += amount
      current.net -= amount
    } else if (activity.direction === 'positive') {
      current.credit += amount
      current.net += amount
    } else if (activity.direction === 'negative') {
      current.net -= Math.abs(amount)
    }

    groupedByDate.set(label, current)
  })

  const entries = [...groupedByDate.entries()].slice(-4)
  const labels = entries.map(([label]) => label)
  const netSeries = entries.map(([, value]) => value.net)
  const creditSeries = entries.map(([, value]) => value.credit)
  const committedSeries = entries.map(([, value]) => value.committed)

  return {
    labels,
    netSeries,
    creditSeries,
    committedSeries,
    netLabel: `净流入 ${formatCompactAmount(netSeries.reduce((sum, value) => sum + value, 0), ' USDC')}`,
    creditLabel: `入账 ${formatCompactAmount(creditSeries.reduce((sum, value) => sum + value, 0), ' USDC')}`,
    committedLabel: `已投入 ${formatCompactAmount(committedSeries.reduce((sum, value) => sum + value, 0), ' USDC')}`,
    rangeLabel: `${labels[0]} - ${labels[labels.length - 1]}`,
  }
}

function formatPublicPhaseLabel(phase: string) {
  switch (phase) {
    case 'live':
      return '进行中'
    case 'frozen':
      return '待公开'
    case 'revealing':
      return '揭示中'
    case 'settled':
      return '已结算'
    case 'scheduled':
      return '已排期'
    default:
      return phase
  }
}

const resultsTabs: ResultsTab[] = [
  { id: 'overview', label: '总览' },
  { id: 'performance', label: '收益表现' },
  { id: 'positions', label: '持仓明细' },
  { id: 'records', label: '账户记录' },
]

function getInitialResultsTab(tab: string | null): ResultsTabId {
  if (tab === 'performance' || tab === 'positions' || tab === 'records') {
    return tab
  }

  return 'overview'
}

const chartRanges = ['1小时', '1天', '3天', '7天', '全部']

const summaryStats: SummaryStat[] = ACCOUNT_SUMMARY_STATS

const overviewHeroStats: SummaryStat[] = [summaryStats[1], summaryStats[2], summaryStats[4], summaryStats[5]]

const positions: PositionRow[] = ACCOUNT_POSITIONS

const overviewBubbles: SparkItem[] = [
  {
    label: '波动率',
    value: '15.62%',
    detail: '近 7 天',
    series: [32, 34, 33, 31, 36, 38, 42, 39, 44, 41, 47, 46, 50, 52, 57],
  },
  {
    label: '成交活跃度',
    value: '1,436',
    detail: '近 7 天',
    series: [6, 7, 5, 8, 7, 9, 8, 11, 10, 8, 13, 12, 14, 15, 18],
  },
  {
    label: '资金净流入',
    value: '+8,520 USDC',
    detail: '近 7 天',
    series: [18, 20, 19, 22, 21, 24, 23, 25, 27, 26, 29, 31, 32, 34, 35],
  },
]

const chartLabels = ['05-12 20:00', '05-13 20:00', '05-14 20:00', '05-15 20:00', '05-16 20:00', '05-17 20:00', '05-18 20:00']
const lineSeries = [28, 31, 29, 33, 37, 34, 41, 45, 42, 48, 51, 49, 54, 58, 57, 61, 66, 62, 69, 71, 68, 74, 76, 78]
const benchmarkSeries = [10, 12, 11, 13, 14, 15, 16, 18, 17, 19, 21, 20, 23, 25, 24, 26, 28, 27, 30, 32, 31, 33, 35, 36]
const barSeries = [8, 12, 5, 18, 9, 22, 7, 14, 10, 27, 11, 30, 8, 16, 13, 9, 21, 12, 6, 19, 8, 11, 24, 10, 15, 17, 9, 13]

const assetDistributionSegments: RingSegment[] = [
  { label: '已结算', value: 54, color: '#2f6df6' },
  { label: '进行中', value: 28, color: '#22c55e' },
  { label: '待入账', value: 18, color: '#cbd5e1' },
]

const holdingStructureSegments: RingSegment[] = [
  { label: '短线仓位', value: 41, color: '#2f6df6' },
  { label: '中线仓位', value: 32, color: '#22c55e' },
  { label: '长期仓位', value: 17, color: '#f59e0b' },
  { label: '观察中', value: 10, color: '#8b5cf6' },
]

const flowLabels = ['05-12', '05-14', '05-16', '05-18']
const inflowSeries = [8, 10, 9, 12, 13, 14, 16, 18, 17, 21, 20, 24, 26, 25, 27, 29, 28, 31, 33, 34]
const netFlowSeries = [2, 3, 4, 5, 6, 5, 7, 8, 7, 10, 9, 12, 13, 14, 15, 14, 16, 18, 19, 20]
const outflowSeries = [1, 2, 2, 3, 2, 3, 4, 5, 4, 6, 6, 7, 8, 7, 8, 9, 10, 9, 10, 11]

const settlementBands = [
  { label: '> 75%', value: 30.2, width: 76 },
  { label: '51% - 75%', value: 40.7, width: 64 },
  { label: '26% - 50%', value: 20.1, width: 34 },
  { label: '0% - 25%', value: 5.9, width: 18 },
]

const heatmapDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const heatmapTimes = ['00:00', '06:00', '12:00', '18:00']
const heatmapValues: HeatmapCell[] = [
  { day: '周一', time: '00:00', value: 8 }, { day: '周二', time: '00:00', value: 10 }, { day: '周三', time: '00:00', value: 12 }, { day: '周四', time: '00:00', value: 10 }, { day: '周五', time: '00:00', value: 7 }, { day: '周六', time: '00:00', value: 5 }, { day: '周日', time: '00:00', value: 4 },
  { day: '周一', time: '06:00', value: 18 }, { day: '周二', time: '06:00', value: 26 }, { day: '周三', time: '06:00', value: 34 }, { day: '周四', time: '06:00', value: 40 }, { day: '周五', time: '06:00', value: 30 }, { day: '周六', time: '06:00', value: 24 }, { day: '周日', time: '06:00', value: 20 },
  { day: '周一', time: '12:00', value: 28 }, { day: '周二', time: '12:00', value: 46 }, { day: '周三', time: '12:00', value: 72 }, { day: '周四', time: '12:00', value: 80 }, { day: '周五', time: '12:00', value: 62 }, { day: '周六', time: '12:00', value: 38 }, { day: '周日', time: '12:00', value: 24 },
  { day: '周一', time: '18:00', value: 14 }, { day: '周二', time: '18:00', value: 18 }, { day: '周三', time: '18:00', value: 24 }, { day: '周四', time: '18:00', value: 30 }, { day: '周五', time: '18:00', value: 34 }, { day: '周六', time: '18:00', value: 28 }, { day: '周日', time: '18:00', value: 18 },
]

const accountAssetSummaryItems: SummaryItem[] = ACCOUNT_ASSET_SUMMARY_ITEMS

const overviewOperatingItems: SummaryItem[] = [
  { label: '本周已结算命题', value: '9', detail: '完成公开验证并已计入账户资产' },
  { label: '待公开窗口', value: '6', detail: '仍在等待公开结果的命题数量' },
  { label: '资金利用率', value: '68%', detail: '已配置到进行中与待结算仓位' },
  { label: '奖励进度', value: '4 / 6', detail: '本周期激励任务完成情况', tone: 'positive' },
]

const performanceBreakdownItems: SummaryItem[] = [
  { label: '最佳单日收益', value: '+1,482 USDC', detail: '05-16', tone: 'positive' },
  { label: '最差单日收益', value: '-638 USDC', detail: '05-14', tone: 'negative' },
  { label: '正收益结算占比', value: '63%', detail: '近 7 天共 38 次结算' },
  { label: '平均单笔结算', value: '+32.4 USDC', detail: '按近 30 笔已完成结算统计', tone: 'positive' },
]

const positionSnapshotItems: SummaryItem[] = [
  { label: '进行中仓位', value: '14', detail: '待公开 6 / 观察中 8' },
  { label: '已结算仓位', value: '24', detail: '本周完成 9 笔' },
  { label: '长仓占比', value: '61%', detail: '多空比 1.56' },
  { label: '平均持仓周期', value: '7.2 天', detail: '中位数 4.8 天' },
]

const recordSummaryItems: SummaryItem[] = [
  { label: '近 30 天流水', value: '86', detail: '含充值、提现、奖励与结算' },
  { label: '近 30 天充值', value: '18,940 USDC', detail: '共 12 笔', tone: 'positive' },
  { label: '近 30 天提现', value: '16,260 USDC', detail: '共 7 笔', tone: 'negative' },
  { label: '报告导出', value: '7 次', detail: '最近一次发生在 05-18 20:35' },
]

const overviewTimelineItems: TimelineItem[] = ACCOUNT_OVERVIEW_TIMELINE_ITEMS

const performanceTimelineItems: TimelineItem[] = [
  { time: '05-18 20:00', title: 'Perplexity 仓位结算入账', detail: '本轮结算贡献最大单笔正收益', amount: '+349.84 USDC', tone: 'positive' },
  { time: '05-17 18:15', title: '单日收益冲高', detail: '净收益刷新近 7 天高点', amount: '+1,482 USDC', tone: 'positive' },
  { time: '05-14 15:30', title: '回撤触发', detail: 'ChatGPT Search 结算带来最大回撤', amount: '-638 USDC', tone: 'negative' },
  { time: '05-12 20:00', title: '统计周期起点', detail: '开始记录本轮 7 天收益表现', amount: '起点' },
]

const positionTimelineItems: TimelineItem[] = [
  { time: '05-18 19:20', title: '减仓 ChatGPT Search 空仓', detail: '本次调整 320 USDC，释放部分风险敞口', amount: '+1.4%' },
  { time: '05-18 16:10', title: '补仓 Perplexity 多仓', detail: '追加 420 USDC，提升收益敞口', amount: '+420 USDC', tone: 'positive' },
  { time: '05-17 21:40', title: '区域外交会谈仓位转入待结算', detail: '等待公开结果后统一入账', amount: '待结算' },
  { time: '05-17 10:05', title: '滚动命题仓位结束观察', detail: '上一期结果已归档', amount: '已归档' },
]

const recordTimelineItems: TimelineItem[] = [
  { time: '05-18 18:20', title: '奖励补贴到账', detail: '账户记录新增一笔补贴流水', amount: '+200.00 USDC', tone: 'positive' },
  { time: '05-17 11:05', title: '提现申请完成', detail: '外部地址 0x8f2a 已完成出金', amount: '-1,500.00 USDC', tone: 'negative' },
  { time: '05-16 09:30', title: '充值确认', detail: '外部地址 0x3c91 充值入账', amount: '+2,000.00 USDC', tone: 'positive' },
  { time: '05-15 22:10', title: '手续费扣除', detail: '结算批次 2025-05-15 已记账', amount: '-18.32 USDC', tone: 'negative' },
]

const positionExposureItems: ExposureItem[] = [
  { label: 'AI 工具链与搜索', value: '34%', detail: 'Perplexity / ChatGPT Search / 开发者工具链', width: 34 },
  { label: '公共政策与调研', value: '27%', detail: '公众响应、公共服务与调研类命题', width: 27 },
  { label: '地缘与国际事件', value: '22%', detail: '区域外交、停火安排与公开验证窗口', width: 22 },
  { label: '加密与市场观察', value: '17%', detail: '网络手续费、链上活动与市场观察', width: 17 },
]

const accountRecords: RecordRow[] = ACCOUNT_RECORDS

const positionStatusItems: SummaryItem[] = [
  { label: '进行中', value: '14', detail: '仍在等待公开结果或观察期结束' },
  { label: '待结算', value: '9', detail: '已结束但尚未完成统一入账' },
  { label: '已归档', value: '24', detail: '已完成结算并收入口径统计' },
]

const recordStatusItems: SummaryItem[] = [
  { label: '结算记录', value: '1,436', detail: '已纳入账户结算明细' },
  { label: '充值记录', value: '12', detail: '近 30 天累计入金动作' },
  { label: '提现记录', value: '7', detail: '近 30 天累计出金动作' },
  { label: '奖励记录', value: '4', detail: '参与激励与补贴入账' },
]

const overviewStatusItems: SummaryItem[] = [
  { label: '已结算资产', value: '54%', detail: '当前已完成入账的资产占比' },
  { label: '进行中仓位', value: '28%', detail: '仍在等待公开结果或观察期结束' },
  { label: '待入账资金', value: '18%', detail: '结束后待统一记账的部分' },
]

const settlementSummaryItems: SummaryItem[] = [
  { label: '总收益', value: '+12,480.00', detail: '所有已完成结算的正向收入', tone: 'positive' },
  { label: '总亏损', value: '-7,832.00', detail: '所有已完成结算的负向结果', tone: 'negative' },
  { label: '净收益', value: '+4,648.00', detail: '收益与亏损相抵后的净额', tone: 'positive' },
  { label: '手续费', value: '-168.32', detail: '含结算与划转过程中的费用', tone: 'negative' },
  { label: '奖励补贴', value: '+2,000.00', detail: '来自平台激励与补贴', tone: 'positive' },
  { label: '结算金额', value: '12,480.00', detail: '已完成入账的结算合计' },
]

function getToneClassName(tone?: SummaryStatTone, value?: string) {
  if (tone === 'positive' || value?.startsWith('+')) {
    return 'results-positive'
  }

  if (tone === 'negative' || value?.startsWith('-')) {
    return 'results-negative'
  }

  return ''
}

function buildLinePath(series: number[], width: number, height: number, paddingX: number, paddingY: number) {
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  const points = series.map((value, index) => {
    const x = paddingX + (index * (width - paddingX * 2)) / (series.length - 1)
    const normalized = (value - min) / range
    const y = height - paddingY - normalized * (height - paddingY * 2)
    return { x, y }
  })
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  const area = [
    `M${points[0].x.toFixed(2)},${height - paddingY}`,
    ...points.map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`),
    `L${points[points.length - 1].x.toFixed(2)},${height - paddingY}`,
    'Z',
  ].join(' ')

  return { line, area }
}

function formatSparkPath(series: number[], width: number, height: number) {
  const paddingX = 2
  const paddingY = 3
  return buildLinePath(series, width, height, paddingX, paddingY)
}

function Sparkline({ series, className = '' }: { series: number[]; className?: string }) {
  const { line } = formatSparkPath(series, 76, 38)
  return (
    <svg className={className} viewBox="0 0 76 38" preserveAspectRatio="none" aria-hidden="true">
      <path d={line} className="results-sparkline" />
    </svg>
  )
}

function MiniLineChart({ width = 200, height = 96, labels, series }: { width?: number; height?: number; labels: string[]; series: number[][] }) {
  const paddingX = 22
  const paddingY = 12
  const sourceLabels = ensureChartLabels(labels)
  const sourceSeries = series.map((line) => ensureChartSeries(line))
  const allValues = sourceSeries.flat()
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const range = max - min || 1

  const toPath = (values: number[]) => {
    return values
      .map((value, index) => {
        const x = paddingX + (index * (width - paddingX * 2)) / (values.length - 1)
        const normalized = (value - min) / range
        const y = height - paddingY - normalized * (height - paddingY * 2)
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
  }

  return (
    <svg className="fund-flow-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => {
        const y = 12 + index * 24
        return <line key={index} x1={paddingX} x2={width - paddingX} y1={y} y2={y} className="mini-gridline" />
      })}
      {sourceSeries.map((line, index) => (
        <path key={`${index}-${line.length}`} d={toPath(line)} className={`mini-line ${index === 0 ? 'blue' : index === 1 ? 'green' : 'red'}`} />
      ))}
      {sourceLabels.map((label, index) => {
        const x = paddingX + (index * (width - paddingX * 2)) / (sourceLabels.length - 1)
        return (
          <text key={`${label}-${index}`} x={x} y={height - 1} textAnchor="middle" className="mini-axis-label">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

function RingChart({ segments }: { segments: RingSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const chartSegments = total > 0
    ? segments
    : [{ label: segments[0]?.label ?? 'No data', value: 100, color: segments[0]?.color ?? '#cbd5e1' }]
  let current = 0

  return (
    <div
      className="ring-chart"
      style={{
        background: `radial-gradient(circle at center, #ffffff 0 56%, transparent 56.5%), conic-gradient(${chartSegments
          .map((segment) => {
            const start = current
            const end = current + segment.value
            current = end
            return `${segment.color} ${start}% ${end}%`
          })
          .join(', ')})`,
      }}
    >
      <div className="ring-chart-core">
        <strong>{segments[0]?.value ?? 0}%</strong>
        <span>{segments[0]?.label ?? ''}</span>
      </div>
    </div>
  )
}

function MetricCard({ stat }: { stat: SummaryStat }) {
  const Icon = stat.icon

  return (
    <article className={`results-card metric-card ${stat.tone}`}>
      <div>
        <h3>{stat.label}</h3>
        <strong>{stat.value}</strong>
        <div className="delta">{stat.delta}</div>
        {stat.detail ? <div className="detail">{stat.detail}</div> : null}
      </div>
      <span className="icon" aria-hidden="true">
        <Icon size={17} strokeWidth={2.2} />
      </span>
    </article>
  )
}

function ResultsLineChart({ data }: { data?: PerformanceChartData | null }) {
  const width = 760
  const height = 160
  const paddingX = 40
  const paddingY = 16
  const sourceLabels = ensureChartLabels(data?.labels ?? chartLabels)
  const sourcePnlSeries = ensureChartSeries(data?.cumulativePnlSeries ?? lineSeries)
  const sourcePositiveRateSeries = ensureChartSeries(data?.positiveRateSeries ?? benchmarkSeries)
  const blue = buildLinePath(sourcePnlSeries, width, height, paddingX, paddingY)
  const green = buildLinePath(sourcePositiveRateSeries, width, height, paddingX, paddingY)

  const gridLines = [0, 1, 2, 3, 4]
  const xTickIndexes = sourcePnlSeries.map((_, index) => index)
  const yLabelLeft = buildAxisTicks(Math.min(...sourcePnlSeries), Math.max(...sourcePnlSeries), 4)
  const yLabelRight = buildAxisTicks(Math.min(...sourcePositiveRateSeries), Math.max(...sourcePositiveRateSeries), 5).map((label) => `${label}%`)

  return (
    <svg className="results-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="累计收益曲线">
      {gridLines.map((index) => {
        const y = 18 + index * 29
        return <line key={index} x1={paddingX} x2={width - paddingX} y1={y} y2={y} className="results-gridline" />
      })}

      <path d={blue.area} className="results-area-blue" />
      <path d={green.line} className="results-line-green" />
      <path d={blue.line} className="results-line-blue" />

      {xTickIndexes.map((index) => {
        const x = paddingX + (index * (width - paddingX * 2)) / (sourcePnlSeries.length - 1)
        return <line key={index} x1={x} x2={x} y1={18} y2={height - 22} className="results-gridline subtle" />
      })}

      {yLabelLeft.map((label, index) => (
        <text key={label} x={6} y={20 + index * 36} className="results-axis-left">
          {label}
        </text>
      ))}

      {yLabelRight.map((label, index) => (
        <text key={label} x={width - 10} y={20 + index * 30} textAnchor="end" className="results-axis-right">
          {label}
        </text>
      ))}

      {sourceLabels.map((label, index) => {
        const x = paddingX + (index * (width - paddingX * 2)) / (sourceLabels.length - 1)
        return (
          <text key={label} x={x} y={height - 4} textAnchor="middle" className="results-axis-x">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

function ResultsBarChart({ values }: { values?: number[] }) {
  const width = 760
  const height = 64
  const sourceValues = ensureChartSeries(values ?? barSeries)
  const max = Math.max(...sourceValues.map((value) => Math.abs(value)), 1)

  return (
    <svg className="results-bar-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="结算收益柱状图">
      {sourceValues.map((value, index) => {
        const barHeight = 4 + ((Math.abs(value) / max) * (height - 12))
        const x = 18 + (index * (width - 36)) / sourceValues.length
        return <rect key={`${index}-${value}`} x={x} y={height - barHeight - 2} width={10} height={barHeight} rx={2} className={value < 0 ? 'results-bar negative' : 'results-bar'} />
      })}
    </svg>
  )
}

function ResultsPanelSpark({ item }: { item: SparkItem }) {
  return (
    <article className="mini-stat">
      <div>
        <h3>{item.label}</h3>
        <strong>{item.value}</strong>
        <span>{item.detail || ' '}</span>
      </div>
      <Sparkline className="spark" series={item.series} />
    </article>
  )
}

function OverviewHeroCard({ value }: { value: OverviewHeroValue }) {
  const [accountAmount, accountUnit = ''] = value.total.split(' ')
  const heroDelta = value.delta

  return (
    <section className="results-card overview-hero-card" aria-label="账户净值快照">
      <div className="overview-hero-main">
        <div className="overview-hero-copy">
          <span className="overview-hero-label">账户净值</span>
          <strong className="overview-hero-value">
            {accountAmount}
            <small>{accountUnit}</small>
          </strong>
          <span className="overview-hero-delta">{heroDelta}</span>
          <p className="overview-hero-description">
            当前主页仅展示 Arena 站内已入账资产、进行中仓位与账户记录，不含链上钱包或外部账户。
          </p>
        </div>
      </div>

      <div className="overview-hero-stats">
        {value.stats.map((stat) => (
          <article key={`overview-hero-${stat.label}`} className="overview-hero-stat">
            <span>{stat.label}</span>
            <strong className={getToneClassName(stat.tone, stat.value)}>{stat.value}</strong>
            <small className={getToneClassName(stat.tone, stat.detail)}>{stat.detail}</small>
          </article>
        ))}
      </div>
    </section>
  )
}

function SummaryGridCard({
  title,
  items,
  note,
}: {
  title: string
  items: SummaryItem[]
  note?: string
}) {
  return (
    <article className="results-card results-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {note ? <span className="panel-head-note">{note}</span> : null}
      </div>

      <div className="results-summary-grid">
        {items.map((item) => (
          <article key={`${title}-${item.label}`} className="results-summary-item">
            <span>{item.label}</span>
            <strong className={getToneClassName(item.tone, item.value)}>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>
    </article>
  )
}

function TimelineCard({
  title,
  items,
  note,
}: {
  title: string
  items: TimelineItem[]
  note?: string
}) {
  return (
    <article className="results-card results-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {note ? <span className="panel-head-note">{note}</span> : null}
      </div>

      <div className="results-timeline-list">
        {items.map((item) => (
          <div key={`${item.time}-${item.title}`} className="results-timeline-row">
            <span className="results-timeline-time">{item.time}</span>
            <div className="results-timeline-copy">
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </div>
            {item.amount ? (
              <span className={`results-timeline-amount ${getToneClassName(item.tone, item.amount)}`}>{item.amount}</span>
            ) : (
              <span className="results-timeline-amount">-</span>
            )}
          </div>
        ))}
      </div>
    </article>
  )
}

function RecentPositionsCard({
  title,
  rows,
  note,
}: {
  title: string
  rows: PositionRow[]
  note?: string
}) {
  return (
    <article className="results-card results-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {note ? <span className="panel-head-note">{note}</span> : null}
      </div>

      <div className="results-compact-list">
        {rows.map((row) => (
          <div key={`${title}-${row.direction}-${row.contract}-${row.amount}`} className="results-compact-row">
            <div className="results-compact-main">
              <div className="results-compact-head">
                <span className={row.direction === 'long' ? 'direction-pill long' : 'direction-pill short'}>
                  {row.direction === 'long' ? '多' : '空'}
                </span>
                <strong className="results-compact-name">{row.contract}</strong>
              </div>
              <div className="results-compact-meta">
                <span>持仓 {row.amount} USDC</span>
                <span>{row.selectedOptionLabel ?? row.averageCost}</span>
                <span>{row.status}</span>
              </div>
            </div>
            <div className="results-compact-value">
              <strong>{row.publicResultLabel ?? row.pnl}</strong>
              <span>{row.openedAt ?? row.pnlPercent}</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

function PerformancePulseCard({ items = overviewBubbles }: { items?: SparkItem[] }) {
  return (
    <article className="results-card results-panel">
      <div className="panel-head">
        <h2>收益波动 (7D)</h2>
        <BarChart3 size={14} strokeWidth={2.2} />
      </div>

      <div className="mini-stats">
        {items.map((item) => (
          <ResultsPanelSpark key={item.label} item={item} />
        ))}
      </div>

      <div className="position-footer">
        <button type="button" className="panel-link">
          查看资金与成交分析
          <ChevronRight size={14} strokeWidth={2.2} />
        </button>
      </div>
    </article>
  )
}

function SettlementSummaryCard({
  title,
  note,
  items = settlementSummaryItems,
}: {
  title: string
  note: string
  items?: SummaryItem[]
}) {
  return (
    <article className="results-card results-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="panel-head-note">{note}</span>
      </div>

      <div className="settlement-list">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="settlement-row">
            <strong>{item.label}</strong>
            <em className={getToneClassName(item.tone, item.value)}>{item.value}</em>
          </div>
        ))}
      </div>
    </article>
  )
}

function PositionsTableCard({ rows = positions }: { rows?: PositionRow[] }) {
  return (
    <article className="results-card results-panel">
      <div className="panel-head">
        <h2>仓位表现</h2>
        <Info size={14} strokeWidth={2.2} />
      </div>

      <div className="position-table-wrap">
        <table className="position-table">
          <thead>
            <tr>
              <th>方向</th>
              <th>命题</th>
              <th>持仓金额 (USDC)</th>
              <th>所选方向</th>
              <th>建仓时间</th>
              <th>公开结果</th>
              <th>状态说明</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.direction}-${row.contract}-${row.amount}`}>
                <td>
                  <span className={row.direction === 'long' ? 'direction-pill long' : 'direction-pill short'}>
                    {row.direction === 'long' ? '多' : '空'}
                  </span>
                </td>
                <td>
                  <strong className="position-name">{row.contract}</strong>
                </td>
                <td>{row.amount}</td>
                <td>{row.selectedOptionLabel ?? row.averageCost}</td>
                <td>{row.openedAt ?? row.settlePrice}</td>
                <td>{row.publicResultLabel ?? row.pnl}</td>
                <td>{row.pnlPercent}</td>
                <td>
                  <span className="result-status-pill">{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="position-footer">
        <button type="button" className="panel-link">
          查看更多仓位
          <ChevronRight size={14} strokeWidth={2.2} />
        </button>
      </div>
    </article>
  )
}

function ExposureCard({
  title,
  items,
  note,
}: {
  title: string
  items: ExposureItem[]
  note?: string
}) {
  return (
    <article className="results-card results-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {note ? <span className="panel-head-note">{note}</span> : null}
      </div>

      <div className="results-exposure-list">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="results-exposure-row">
            <div className="results-exposure-top">
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
            <div className="results-exposure-track" aria-hidden="true">
              <span className="results-exposure-fill" style={{ width: `${item.width}%` }} />
            </div>
            <small>{item.detail}</small>
          </div>
        ))}
      </div>
    </article>
  )
}

function AccountRecordsCard({
  title,
  rows,
  note,
}: {
  title: string
  rows: RecordRow[]
  note?: string
}) {
  return (
    <article className="results-card results-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {note ? <span className="panel-head-note">{note}</span> : null}
      </div>

      <div className="results-records-table-wrap">
        <table className="results-records-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>类型</th>
              <th>关联项</th>
              <th>变动 (USDC)</th>
              <th>余额 (USDC)</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.time}-${row.type}-${row.reference}`}>
                <td>{row.time}</td>
                <td>{row.type}</td>
                <td>{row.reference}</td>
                <td className={getToneClassName(undefined, row.change)}>{row.change}</td>
                <td>{row.detailText ?? row.balance}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function StatusRailCard({
  title,
  items,
  note,
}: {
  title: string
  items: SummaryItem[]
  note: string
}) {
  return (
    <article className="results-card rail-card">
      <div className="rail-head">
        <h2>{title}</h2>
      </div>
      <div className="results-status-list">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="results-status-row">
            <div>
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </div>
            <strong className={getToneClassName(item.tone, item.value)}>{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="rail-foot">
        <span>{note}</span>
      </div>
    </article>
  )
}

function AssetDistributionCard({
  segments = assetDistributionSegments,
  total = '18,426 USDC',
  footnote = '含已结算与进行中仓位',
}: {
  segments?: RingSegment[]
  total?: string
  footnote?: string
}) {
  return (
    <article className="results-card rail-card">
      <div className="rail-head">
        <h2>资产分布</h2>
      </div>
      <div className="rail-grid split">
        <RingChart segments={segments} />
        <div className="rail-legend">
          {segments.map((segment) => (
            <div key={segment.label} className="rail-legend-row">
              <span className="legend-dot" style={{ background: segment.color }} />
              <span>{segment.label}</span>
              <strong>{segment.value}%</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="rail-foot">
        <span>账户总资产</span>
        <strong>{total}</strong>
        <span>{footnote}</span>
      </div>
    </article>
  )
}

function DataGapCard({
  title,
  note,
  message,
}: {
  title: string
  note?: string
  message: string
}) {
  return (
    <article className="results-card results-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {note ? <span className="panel-head-note">{note}</span> : null}
      </div>
      <p className="boundary-note">{message}</p>
    </article>
  )
}

function HoldingStructureCard({
  segments = holdingStructureSegments,
  total = '38',
}: {
  segments?: RingSegment[]
  total?: string
}) {
  return (
    <article className="results-card rail-card">
      <div className="rail-head">
        <h2>持仓结构</h2>
      </div>
      <div className="rail-grid split">
        <RingChart segments={segments} />
        <div className="rail-legend">
          {segments.map((segment) => (
            <div key={segment.label} className="rail-legend-row">
              <span className="legend-dot" style={{ background: segment.color }} />
              <span>{segment.label}</span>
              <strong>{segment.value}%</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="rail-foot">
        <span>当前持仓数</span>
        <strong>{total}</strong>
      </div>
    </article>
  )
}

function FundFlowCard({ data }: { data?: ActivityFlowData | null }) {
  const sourceLabels = data?.labels ?? flowLabels
  const sourceNetSeries = data?.netSeries ?? netFlowSeries
  const sourceCreditSeries = data?.creditSeries ?? inflowSeries
  const sourceCommittedSeries = data?.committedSeries ?? outflowSeries

  return (
    <article className="results-card rail-card">
      <div className="rail-head">
        <h2>资金流向 (USDC)</h2>
      </div>
      <div className="rail-flow">
        <div className="rail-flow-legend">
          <span><i className="swatch blue" />{data?.netLabel ?? '净流入 +2,680'}</span>
          <span><i className="swatch green" />{data?.creditLabel ?? '充值 18,940'}</span>
          <span><i className="swatch red" />{data?.committedLabel ?? '提现 16,260'}</span>
        </div>
        <MiniLineChart width={264} height={98} labels={sourceLabels} series={[sourceNetSeries, sourceCreditSeries, sourceCommittedSeries]} />
      </div>
      <div className="rail-foot row">
        <span>单位：USDC</span>
        <strong>{data?.rangeLabel ?? '05-12  05-14  05-16  05-18'}</strong>
      </div>
    </article>
  )
}

function SettlementDistributionCard({
  bands = settlementBands,
}: {
  bands?: Array<{ label: string; value: number; width: number }>
}) {
  return (
    <article className="results-card rail-card">
      <div className="rail-head">
        <h2>收益分布</h2>
      </div>
      <div className="distribution-list">
        {bands.map((band) => (
          <div key={band.label} className="distribution-row">
            <div className="distribution-bar-track">
              <span className="distribution-bar-fill" style={{ width: `${band.width}%` }} />
            </div>
            <span className="distribution-label">{band.label}</span>
            <strong>{band.value}%</strong>
          </div>
        ))}
      </div>
      <div className="rail-foot">
        <span>基于单笔收益区间的分布</span>
      </div>
    </article>
  )
}

function HeatmapCard({ cells }: { cells?: HeatmapCell[] }) {
  const sourceCells = cells ?? heatmapValues

  return (
    <article className="results-card rail-card heatmap-card">
      <div className="rail-head">
        <h2>活跃时段热力图（使用用户本地时间）</h2>
      </div>
      <div className="heatmap-wrap">
        <div className="heatmap-axis y">
          {heatmapTimes.map((time) => <span key={time}>{time}</span>)}
        </div>
        <div className="heatmap-grid" aria-hidden="true">
          {heatmapTimes.map((time) => heatmapDays.map((day) => {
            const cell = sourceCells.find((item) => item.day === day && item.time === time) ?? { day, time, value: 0 }
            return (
              <span
                key={`${day}-${time}`}
                className="heatmap-cell"
                style={{ background: `rgba(37, 99, 235, ${0.1 + (cell.value / 100) * 0.9})` }}
              />
            )
          }))}
        </div>
        <div className="heatmap-axis x">
          {heatmapDays.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="heatmap-scale">
          <span>高</span>
          <div className="heatmap-scale-bar">
            <span />
          </div>
          <span>低</span>
        </div>
      </div>
    </article>
  )
}

function ResultsPage() {
  const { isAuthenticated, mockUser, openAuthModal } = useRulesIntro()
  const {
    overview,
    isLoading: isOverviewLoading,
    errorMessage: overviewErrorMessage,
    refresh: refreshOverview,
  } = useResultOverviewData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<ResultsTabId>(() => getInitialResultsTab(searchParams.get('tab')))

  const handleTabChange = (tabId: ResultsTabId) => {
    setActiveTab(tabId)
    setSearchParams(tabId === 'overview' ? {} : { tab: tabId }, { replace: true })
  }

  const performanceChartData = buildPerformanceChartData(overview)
  const activityHeatmapCells = buildActivityHeatmapCells(overview?.recentActivity ?? [])
  const activityFlowData = buildActivityFlowData(overview)

  const liveHeaderMetrics = overview
    ? [
        {
          label: '已结算结果',
          value: String(overview.settledResults.totals.settledCount),
          detail: `已赢 ${overview.settledResults.totals.wonCount} / 已退款 ${overview.settledResults.totals.refundCount}`,
          tone: 'neutral' as const,
        },
        {
          label: '已结算净收益',
          value: `${overview.settledResults.totals.totalPnl} USDC`,
          detail: `总派彩 ${overview.settledResults.totals.totalGrossPayout} USDC`,
          tone: overview.settledResults.totals.totalPnl.startsWith('-') ? 'negative' as const : 'positive' as const,
        },
        {
          label: '进行中仓位',
          value: String(overview.openPositions.totalCount),
          detail: `总投入 ${overview.openPositions.totalStakeAmount} USDC`,
          tone: 'neutral' as const,
        },
        {
          label: '已结算奖励',
          value: `${overview.settledResults.totals.finalizedRewardAmount} USDC`,
          detail: `待结算奖励 ${overview.settledResults.totals.pendingRewardAmount} USDC`,
          tone: 'positive' as const,
        },
      ]
    : ACCOUNT_HEADER_METRICS

  const liveHeroValue: OverviewHeroValue = overview
    ? {
        total: `${overview.analytics.assetBreakdown.trackedAmount} USDC`,
        delta: `${overview.settledResults.totals.totalPnl.startsWith('-') ? '' : '+'}${overview.settledResults.totals.totalPnl} USDC net settled pnl`,
        stats: [
          {
            label: '已结算派彩',
            value: `${overview.analytics.assetBreakdown.settledGrossPayoutSharePercent}%`,
            detail: `${overview.analytics.assetBreakdown.settledGrossPayoutAmount} USDC`,
          },
          {
            label: '进行中仓位',
            value: `${overview.analytics.assetBreakdown.openStakeSharePercent}%`,
            detail: `${overview.analytics.assetBreakdown.openStakeAmount} USDC`,
          },
          {
            label: '奖励占比',
            value: `${overview.analytics.assetBreakdown.rewardSharePercent}%`,
            detail: `${overview.analytics.assetBreakdown.rewardAmount} USDC`,
            tone: Number(overview.analytics.assetBreakdown.rewardAmount) > 0 ? 'positive' : undefined,
          },
          {
            label: '最新活动',
            value: overview.summary.latestActivityAt ? formatShortDateTime(overview.summary.latestActivityAt) : '--',
            detail: overview.summary.latestActivityTitle ?? '暂无最近活动',
          },
        ],
      }
    : {
        total: accountAssetSummaryItems[0]?.value ?? '18,426 USDC',
        delta: summaryStats[0]?.delta ?? '',
        stats: overviewHeroStats.map((stat) => ({
          label: stat.label,
          value: stat.value,
          detail: stat.delta,
          tone: stat.tone,
        })),
      }

  const liveAccountAssetSummaryItems: SummaryItem[] = overview
    ? [
        {
          label: '追踪资产',
          value: `${overview.analytics.assetBreakdown.trackedAmount} USDC`,
          detail: `已结算支出 ${overview.analytics.assetBreakdown.settledGrossPayoutAmount} USDC`,
          tone: 'positive',
        },
        {
          label: '开仓质押',
          value: `${overview.analytics.assetBreakdown.openStakeAmount} USDC`,
          detail: `${overview.openPositions.totalCount} 个活跃仓位`,
        },
        {
          label: '奖励追踪',
          value: `${overview.analytics.assetBreakdown.rewardAmount} USDC`,
          detail: `${overview.analytics.assetBreakdown.pendingRewardAmount} 待结算 / ${overview.analytics.assetBreakdown.finalizedRewardAmount} 已完成`,
          tone: Number(overview.analytics.assetBreakdown.rewardAmount) > 0 ? 'positive' : undefined,
        },
        {
          label: '最新活动',
          value: overview.summary.latestActivityAt ? formatShortDateTime(overview.summary.latestActivityAt) : '--',
          detail: overview.summary.latestActivityTitle ?? '暂无最近活动',
        },
      ]
    : accountAssetSummaryItems

  const liveOverviewTimelineItems: TimelineItem[] = overview
    ? overview.recentActivity.slice(0, 4).map((item) => ({
        time: formatShortDateTime(item.occurredAt),
        title: item.propositionTitle,
        detail: item.detail,
        amount: formatActivityAmount(item.amount, item.direction),
        tone:
          item.direction === 'positive'
            ? 'positive'
            : item.direction === 'negative'
              ? 'negative'
              : 'neutral',
      }))
    : overviewTimelineItems

  const livePerformanceTimelineItems: TimelineItem[] = overview
    ? overview.settledResults.items.slice(0, 4).map((item) => ({
        time: formatShortDateTime(item.settledAt),
        title: item.propositionTitle,
        detail:
          item.resultKind === 'void'
            ? `作废结算${item.voidReason ? ` / ${item.voidReason}` : ''}`
            : item.currentUserSettlementOutcome === 'won'
              ? '已结算 — 胜出'
              : item.currentUserSettlementOutcome === 'lost'
                ? '已结算 — 落败'
                : item.currentUserSettlementOutcome === 'refund'
                  ? '结算退款'
                  : '结算结果已记录',
        amount:
          formatResultAmount(item.currentUserPnl)
          ?? formatResultAmount(item.currentUserRefundAmount)
          ?? formatResultAmount(item.currentUserRewardAmount),
        tone:
          item.currentUserSettlementOutcome === 'won'
            ? 'positive'
            : item.currentUserSettlementOutcome === 'lost'
              ? 'negative'
              : 'neutral',
      }))
    : performanceTimelineItems

  const livePositions: PositionRow[] = overview
    ? overview.openPositions.items.map((item) => ({
        direction: item.selectedOption === 0 ? 'long' : 'short',
        contract: item.propositionTitle,
        amount: item.stakeAmount,
        averageCost: item.selectedOptionLabel,
        settlePrice: formatShortDateTime(item.placedAt),
        pnl: formatPublicResultLabel(item.publicResult),
        pnlPercent: item.publicResult
          ? item.publicResult.resultKind === 'void'
            ? '作废结算'
            : typeof item.publicResult.winningOption === 'number'
              ? `胜出 ${formatOptionLabel(item.publicResult.winningOption)}`
              : '已发布结果'
          : '等待公开结果',
        status: formatPublicPhaseLabel(item.currentPublicPhase),
        selectedOptionLabel: item.selectedOptionLabel,
        openedAt: formatShortDateTime(item.placedAt),
        publicResultLabel: formatPublicResultLabel(item.publicResult),
      }))
    : positions

  const liveExposureItems: ExposureItem[] = overview
    ? overview.openPositions.categoryExposure.map((item) => ({
        label: item.category,
        value: formatPercent(item.positionCount, overview.openPositions.totalCount),
        detail: `${item.positionCount} 个仓位 / ${item.totalStakeAmount} USDC`,
        width: Math.max(8, Math.round((item.positionCount / Math.max(overview.openPositions.totalCount, 1)) * 100)),
      }))
    : positionExposureItems

  const liveRecordTimelineItems: TimelineItem[] = overview
    ? overview.recentActivity.slice(0, 4).map((item) => ({
        time: formatShortDateTime(item.occurredAt),
        title:
          item.activityType === 'position_opened'
            ? '仓位建立'
            : item.propositionTitle,
        detail: item.detail,
        amount: formatActivityAmount(item.amount, item.direction),
        tone:
          item.direction === 'positive'
            ? 'positive'
            : item.direction === 'negative'
              ? 'negative'
              : 'neutral',
      }))
    : recordTimelineItems

  const livePositionTimelineItems: TimelineItem[] = overview
    ? overview.openPositions.items.slice(0, 4).map((item) => ({
        time: formatShortDateTime(item.placedAt),
        title: item.propositionTitle,
        detail: `已选 ${item.selectedOptionLabel} / ${formatPublicPhaseLabel(item.currentPublicPhase)}`,
        amount: formatUnsignedAmount(item.stakeAmount),
        tone: 'neutral',
      }))
    : positionTimelineItems

  const livePositionStatusItems: SummaryItem[] = overview
    ? [
        {
          label: '进行中',
          value: String(overview.analytics.positionStructure.liveCount),
          detail: '仍在接受或持有风险敞口的仓位',
        },
        {
          label: '已冻结',
          value: String(overview.analytics.positionStructure.frozenCount),
          detail: '市场已冻结等待公开结果',
        },
        {
          label: '公开中',
          value: String(overview.analytics.positionStructure.revealingCount),
          detail: '临近公开窗口、等待结算的仓位',
        },
        {
          label: '追踪总计',
          value: String(overview.analytics.positionStructure.totalCount),
          detail: '总览中全部开仓应答者仓位',
        },
      ]
    : positionStatusItems

  const liveRecordStatusItems: SummaryItem[] = overview
    ? [
        {
          label: '近期活动',
          value: String(overview.recentActivity.length),
          detail: '最新捕获的账户事件',
        },
        {
          label: '已结算记录',
          value: String(overview.settledResults.totals.settledCount),
          detail: '已进入结果历史的条目',
        },
        {
          label: '待结算奖励',
          value: `${overview.settledResults.totals.pendingRewardAmount} USDC`,
          detail: '等待审核完成',
        },
        {
          label: '开放仓位',
          value: String(overview.openPositions.totalCount),
          detail: '仍在进行中或临近公开阶段',
        },
      ]
    : recordStatusItems

  const liveAccountRecords: RecordRow[] = overview
    ? overview.recentActivity.map((item) => ({
        time: formatShortDateTime(item.occurredAt),
        type:
          item.activityType === 'position_opened'
            ? '建仓'
            : item.activityType === 'reward_finalized'
              ? '奖励结算'
              : item.activityType === 'reward_pending'
                ? '奖励待结算'
                : '结果结算',
        reference: item.propositionTitle,
        change: formatActivityAmount(item.amount, item.direction)?.replace(' USDC', '') ?? '--',
        balance: '--',
        detailText: item.detail,
        status:
          item.activityType === 'position_opened'
            ? '进行中'
            : item.activityType === 'reward_pending'
              ? '待处理'
              : '已记录',
      }))
    : accountRecords

  const livePositionSnapshotItems: SummaryItem[] = overview
    ? [
        {
          label: '开放仓位',
          value: String(overview.openPositions.totalCount),
          detail: `质押 ${overview.openPositions.totalStakeAmount} USDC`,
        },
        {
          label: '已结算结果',
          value: String(overview.settledResults.totals.settledCount),
          detail: `胜出 ${overview.settledResults.totals.wonCount} / 退款 ${overview.settledResults.totals.refundCount}`,
        },
        {
          label: '最大敞口',
          value: overview.summary.largestExposure
            ? `${overview.summary.largestExposure.sharePercent}%`
            : '0%',
          detail: overview.summary.largestExposure
            ? `${overview.summary.largestExposure.category} / ${overview.summary.largestExposure.totalStakeAmount} USDC`
            : '暂无活跃敞口',
        },
        {
          label: '最新活动',
          value: overview.summary.latestActivityAt ? formatShortDateTime(overview.summary.latestActivityAt) : '--',
          detail: overview.summary.latestActivityTitle ?? '暂无最近活动',
        },
      ]
    : positionSnapshotItems

  const liveRecordSummaryItems: SummaryItem[] = overview
    ? [
        {
          label: '近期活动',
          value: String(overview.recentActivity.length),
          detail: '最新 12 条账户事件',
        },
        {
          label: '待结算奖励',
          value: `${overview.settledResults.totals.pendingRewardAmount} USDC`,
          detail: '等待审核完成',
          tone: Number(overview.settledResults.totals.pendingRewardAmount) > 0 ? 'positive' : undefined,
        },
        {
          label: '已完成奖励',
          value: `${overview.settledResults.totals.finalizedRewardAmount} USDC`,
          detail: '已入账奖励金额',
          tone: Number(overview.settledResults.totals.finalizedRewardAmount) > 0 ? 'positive' : undefined,
        },
        {
          label: '结算结果记录',
          value: String(overview.settledResults.items.length),
          detail: '源自应答者结果历史',
        },
      ]
    : recordSummaryItems

  const liveOverviewStatusItems: SummaryItem[] = overview
    ? [
        {
          label: '已结算占比',
          value: `${overview.summary.settledSharePercent}%`,
          detail: '已追踪结果条目中已完成结算的比例',
        },
        {
          label: '开仓占比',
          value: `${overview.summary.openPositionSharePercent}%`,
          detail: '仍处于进行中或临近公开阶段的仓位',
        },
        {
          label: '待结算奖励',
          value: overview.settledResults.totals.pendingRewardAmount === '0.00' ? '0%' : '进行中',
          detail: `${overview.settledResults.totals.pendingRewardAmount} USDC 待结算`,
        },
      ]
    : overviewStatusItems

  const liveOverviewOperatingItems: SummaryItem[] = overview
    ? [
        {
          label: '追踪条目',
          value: String(overview.summary.trackedEntryCount),
          detail: `${overview.settledResults.totals.settledCount} 已结算 / ${overview.openPositions.totalCount} 进行中`,
        },
        {
          label: '已结算结果',
          value: String(overview.settledResults.totals.settledCount),
          detail: '已完结入账历史的结果',
        },
        {
          label: '开仓质押',
          value: `${overview.openPositions.totalStakeAmount} USDC`,
          detail: '仍绑定在开仓应答者仓位的资金',
        },
        {
          label: '奖励进度',
          value: `${overview.settledResults.totals.finalizedRewardAmount} / ${overview.settledResults.totals.finalizedRewardAmount === '0.00' && overview.settledResults.totals.pendingRewardAmount === '0.00' ? '0.00' : `${Number(overview.settledResults.totals.finalizedRewardAmount) + Number(overview.settledResults.totals.pendingRewardAmount)}` } USDC`,
          detail: `${overview.settledResults.totals.pendingRewardAmount} USDC 待结算`,
          tone: Number(overview.settledResults.totals.finalizedRewardAmount) > 0 ? 'positive' : undefined,
        },
      ]
    : overviewOperatingItems

  const livePerformanceBreakdownItems: SummaryItem[] = overview
    ? [
        {
          label: '最佳结算盈亏',
          value: overview.performance.bestSettledPnl?.amount ?? '0.00',
          detail: overview.performance.bestSettledPnl
            ? `${overview.performance.bestSettledPnl.propositionTitle} / ${formatShortDateTime(overview.performance.bestSettledPnl.settledAt)}`
            : '暂无结算盈亏记录',
          tone: overview.performance.bestSettledPnl && overview.performance.bestSettledPnl.amount.startsWith('-') ? 'negative' : 'positive',
        },
        {
          label: '最差结算盈亏',
          value: overview.performance.worstSettledPnl?.amount ?? '0.00',
          detail: overview.performance.worstSettledPnl
            ? `${overview.performance.worstSettledPnl.propositionTitle} / ${formatShortDateTime(overview.performance.worstSettledPnl.settledAt)}`
            : '暂无结算盈亏记录',
          tone: overview.performance.worstSettledPnl?.amount.startsWith('-') ? 'negative' : undefined,
        },
        {
          label: '正收益结算占比',
          value: `${overview.performance.positiveSettledPnlRate}%`,
          detail: `${overview.performance.positiveSettledPnlCount} / ${overview.performance.trackedSettledPnlCount} 条结算盈亏`,
        },
        {
          label: '平均结算盈亏',
          value: overview.performance.averageSettledPnlAmount,
          detail: `${overview.performance.flatSettledPnlCount} 持平 / ${overview.performance.negativeSettledPnlCount} 亏损`,
          tone: overview.performance.averageSettledPnlAmount.startsWith('-') ? 'negative' : undefined,
        },
      ]
    : performanceBreakdownItems

  const liveSettlementSummaryItems: SummaryItem[] = overview
    ? [
        {
          label: '净盈亏',
          value: `${overview.settledResults.totals.totalPnl} USDC`,
          detail: '所有已结算应答者结果汇总',
          tone: overview.settledResults.totals.totalPnl.startsWith('-') ? 'negative' : 'positive',
        },
        {
          label: '总派彩',
          value: `${overview.settledResults.totals.totalGrossPayout} USDC`,
          detail: '结算引擎返还金额',
        },
        {
          label: '退款金额',
          value: `${overview.settledResults.totals.totalRefundAmount} USDC`,
          detail: '作废/平局结果的退款汇总',
        },
        {
          label: '已完成奖励',
          value: `${overview.settledResults.totals.finalizedRewardAmount} USDC`,
          detail: '已完结的应答者奖励',
          tone: Number(overview.settledResults.totals.finalizedRewardAmount) > 0 ? 'positive' : undefined,
        },
        {
          label: '待结算奖励',
          value: `${overview.settledResults.totals.pendingRewardAmount} USDC`,
          detail: '等待完结的应答者奖励',
        },
        {
          label: '已结算数量',
          value: String(overview.settledResults.totals.settledCount),
          detail: '结算结果条目总数',
        },
      ]
    : settlementSummaryItems

  const liveAssetDistributionSegments: RingSegment[] = overview
    ? [
        {
          label: '已结算派彩',
          value: formatSegmentPercent(overview.analytics.assetBreakdown.settledGrossPayoutSharePercent),
          color: '#2f6df6',
        },
        {
          label: '进行中',
          value: formatSegmentPercent(overview.analytics.assetBreakdown.openStakeSharePercent),
          color: '#22c55e',
        },
        {
          label: '奖励',
          value: formatSegmentPercent(overview.analytics.assetBreakdown.rewardSharePercent),
          color: '#cbd5e1',
        },
      ]
    : assetDistributionSegments

  const liveHoldingStructureSegments: RingSegment[] = overview
    ? (() => {
        const segments = [
        {
          label: '多头',
          value: formatSegmentPercent(overview.analytics.positionStructure.longSharePercent),
          color: '#2f6df6',
        },
        {
          label: '空头',
          value: formatSegmentPercent(overview.analytics.positionStructure.shortSharePercent),
          color: '#22c55e',
        },
        {
          label: '冻结中',
          value: formatSegmentPercent(overview.analytics.positionStructure.frozenSharePercent),
          color: '#f59e0b',
        },
        {
          label: '揭示中',
          value: formatSegmentPercent(overview.analytics.positionStructure.revealingSharePercent),
          color: '#8b5cf6',
        },
        ]
        const nonZeroSegments = segments.filter((segment) => segment.value > 0)

        return nonZeroSegments.length > 0 ? nonZeroSegments : segments.slice(0, 2)
      })()
    : holdingStructureSegments

  const liveSettlementBands = overview
    ? [
        {
          label: '正收益',
          value: overview.analytics.settlementDistribution.positiveSharePercent,
          width: Math.max(8, overview.analytics.settlementDistribution.positiveSharePercent),
        },
        {
          label: '持平',
          value: overview.analytics.settlementDistribution.flatSharePercent,
          width: Math.max(8, overview.analytics.settlementDistribution.flatSharePercent),
        },
        {
          label: '负收益',
          value: overview.analytics.settlementDistribution.negativeSharePercent,
          width: Math.max(8, overview.analytics.settlementDistribution.negativeSharePercent),
        },
      ]
    : settlementBands

  const livePerformancePulseItems: SparkItem[] = overview
    ? [
        {
          label: '正收益结算占比',
          value: `${overview.analytics.settlementDistribution.positiveSharePercent}%`,
          detail: `${overview.analytics.settlementDistribution.positiveCount} 条`,
          series: [12, 18, 24, 30, 36, 42, overview.analytics.settlementDistribution.positiveSharePercent || 0],
        },
        {
          label: '开仓占比',
          value: `${overview.summary.openPositionSharePercent}%`,
          detail: `${overview.openPositions.totalCount} 个进行中仓位`,
          series: [6, 10, 14, 18, 22, 26, overview.summary.openPositionSharePercent || 0],
        },
        {
          label: '奖励追踪',
          value: `${overview.analytics.assetBreakdown.rewardAmount} USDC`,
          detail: `${overview.analytics.assetBreakdown.pendingRewardAmount} 待结算`,
          series: [4, 8, 12, 16, 20, 24, overview.analytics.assetBreakdown.rewardSharePercent || 0],
        },
      ]
    : overviewBubbles

  if (isAuthenticated && !overview) {
    const loadingMetrics: SummaryItem[] = [
      {
        label: '账户总览',
        value: isOverviewLoading ? '加载中' : '不可用',
        detail: isOverviewLoading
          ? '正在从 Arena 读取真实应答者总览'
          : '无法加载真实账户数据',
      },
      {
        label: '结果历史',
        value: '--',
        detail: '需要结果总览层',
      },
      {
        label: '开放仓位',
        value: '--',
        detail: '需要验证/读模型层',
      },
      {
        label: '奖励',
        value: '--',
        detail: '需要奖励账本层',
      },
    ]

    return (
      <section className="route-page results-page">
        <div className="results-layout">
          <AccountShellHeader
            user={mockUser}
            title={mockUser?.displayName ?? 'Arena 用户'}
            description=""
            metrics={loadingMetrics}
            compactIdentity
          />

          <article className="results-card results-panel">
            <div className="panel-head">
              <h2>{isOverviewLoading ? '加载账户总览中' : '账户总览不可用'}</h2>
              {!isOverviewLoading ? <span className="panel-head-note">仅真实数据</span> : null}
            </div>
            <p className="boundary-note">
              {isOverviewLoading
                ? 'Arena 正在加载你的真实应答者结果、仓位和奖励汇总。'
                : overviewErrorMessage ?? 'Arena 无法加载真实账户总览。'}
            </p>
            {!isOverviewLoading ? (
              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  void refreshOverview()
                }}
              >
                重试加载总览
              </button>
            ) : null}
          </article>
        </div>
      </section>
    )
  }

  {
    const accountAssetSummaryItems = liveAccountAssetSummaryItems
    const overviewTimelineItems = liveOverviewTimelineItems
    const performanceTimelineItems = livePerformanceTimelineItems
    const positionTimelineItems = livePositionTimelineItems
    const positionSnapshotItems = livePositionSnapshotItems
    const recordSummaryItems = liveRecordSummaryItems
    const overviewStatusItems = liveOverviewStatusItems
    const overviewOperatingItems = liveOverviewOperatingItems
    const performanceBreakdownItems = livePerformanceBreakdownItems
    const settlementSummaryItems = liveSettlementSummaryItems
    const positionExposureItems = liveExposureItems
    const positionStatusItems = livePositionStatusItems
    const recordTimelineItems = liveRecordTimelineItems
    const recordStatusItems = liveRecordStatusItems
    const accountRecords = liveAccountRecords
    const positions = livePositions
    const assetDistributionSegments = liveAssetDistributionSegments
    const holdingStructureSegments = liveHoldingStructureSegments
    const settlementBands = liveSettlementBands

    return (
    <section className="route-page results-page">
      <div className="results-layout">
        <AccountShellHeader
          user={mockUser}
          title={mockUser?.displayName ?? 'Arena 用户'}
          description=""
          metrics={liveHeaderMetrics}
          compactIdentity={isAuthenticated}
          actions={!isAuthenticated ? (
            <button type="button" className="primary-action" onClick={() => openAuthModal('login')}>
              登录后查看账户壳
            </button>
          ) : undefined}
        />

        <nav className="results-tabs" aria-label="主页视图切换">
          {resultsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? 'results-tab active' : 'results-tab'}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' ? (
          <section className="results-workspace main-grid">
            <div className="results-slot results-slot-8">
              <OverviewHeroCard value={liveHeroValue} />
            </div>
            <div className="results-slot results-slot-4">
              <AssetDistributionCard
                segments={assetDistributionSegments}
                total={liveHeroValue.total}
                footnote={overview ? `${overview.analytics.assetBreakdown.pendingRewardAmount} USDC pending rewards included in tracked rewards` : '含已结算与进行中仓位'}
              />
            </div>
            <div className="results-slot results-slot-4">
              <SummaryGridCard title="账户资产概览" items={accountAssetSummaryItems} note="当前资金与待入账资产概览" />
            </div>
            <div className="results-slot results-slot-4">
              <SummaryGridCard title="账户运行摘要" items={overviewOperatingItems} note="本周账户节奏与运行状态" />
            </div>
            <div className="results-slot results-slot-4">
              <StatusRailCard title="账户状态" items={overviewStatusItems} note="当前资产口径与待入账状态" />
            </div>
            <div className="results-slot results-slot-6">
              <TimelineCard title="最近账户动态" items={overviewTimelineItems} note="最新 4 条" />
            </div>
            <div className="results-slot results-slot-6">
              <SettlementSummaryCard title="结算概览" note="近 7 天已结算汇总" items={settlementSummaryItems} />
            </div>
          </section>
        ) : null}

        {activeTab === 'performance' ? (
          <section className="results-workspace main-grid">
            <div className="results-slot results-slot-8">
              <section className="results-card chart-card">
                <div className="chart-header">
                  <div className="chart-title">
                    <span>累计收益曲线</span>
                    <Info size={14} strokeWidth={2.2} />
                  </div>

                  <div className="chart-controls" aria-label="图表时间范围">
                    {chartRanges.map((range) => (
                      <button key={range} type="button" className={range === '7天' ? 'range-chip active' : 'range-chip'}>
                        {range}
                      </button>
                    ))}
                    <button type="button" className="range-chip" aria-label="展开图表">
                      <ExternalLink size={13} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>

                <div className="chart-body">
                  <div className="chart-legend">
                    <span className="legend-item">
                      <span className="legend-swatch" />
                      {overview
                        ? `累计收益 ${performanceChartData?.cumulativePnlLabel ?? `${overview.settledResults.totals.totalPnl} USDC`}`
                        : '累计收益 (USDC) 12,480'}
                    </span>
                    <span className="legend-item">
                      <span className="legend-swatch green" />
                      {overview
                        ? `正收益结算占比 ${performanceChartData?.positiveRateLabel ?? `${overview.performance.positiveSettledPnlRate}%`}`
                        : '累计回撤率 +24.81%'}
                    </span>
                  </div>

                  <ResultsLineChart data={performanceChartData} />

                  <div className="chart-note">
                    <span className="chart-bar-title">结算收益 (USDC)</span>
                    <span>{performanceChartData?.rangeLabel ?? '05-12 20:00 至 05-18 20:00'}</span>
                  </div>

                  <ResultsBarChart values={performanceChartData?.settlementPnlSeries} />
                </div>
              </section>
            </div>
            <div className="results-slot results-slot-4">
              <HeatmapCard cells={overview ? activityHeatmapCells : undefined} />
            </div>
            <div className="results-slot results-slot-4">
              <PerformancePulseCard items={livePerformancePulseItems} />
            </div>
            <div className="results-slot results-slot-4">
              <SummaryGridCard title="收益拆解" items={performanceBreakdownItems} note="近 7 天表现拆解" />
            </div>
            <div className="results-slot results-slot-4">
              <SettlementDistributionCard bands={settlementBands} />
            </div>
            <div className="results-slot results-slot-12">
              <TimelineCard title="收益关键事件" items={performanceTimelineItems} note="影响收益曲线的关键节点" />
            </div>
          </section>
        ) : null}

        {activeTab === 'positions' ? (
          <section className="results-workspace main-grid">
            <div className="results-slot results-slot-4">
              <SummaryGridCard title="持仓状态概览" items={positionSnapshotItems} note="当前仓位结构与周期信息" />
            </div>
            <div className="results-slot results-slot-4">
              <TimelineCard title="最近仓位动态" items={positionTimelineItems} note="最近 4 次持仓动作" />
            </div>
            <div className="results-slot results-slot-4">
              <StatusRailCard title="仓位状态" items={positionStatusItems} note="当前可追踪仓位分层" />
            </div>
            <div className="results-slot results-slot-8">
              <PositionsTableCard rows={livePositions} />
            </div>
            <div className="results-slot results-slot-4">
              <HoldingStructureCard
                segments={liveHoldingStructureSegments}
                total={overview ? String(overview.analytics.positionStructure.totalCount) : '38'}
              />
            </div>
            <div className="results-slot results-slot-6">
              <ExposureCard title="仓位暴露分布" items={positionExposureItems} note="按主题与策略分层查看" />
            </div>
            <div className="results-slot results-slot-6">
              <RecentPositionsCard title="重点仓位" rows={livePositions.slice(0, 4)} note="按盈亏与持仓金额展示" />
            </div>
          </section>
        ) : null}

        {activeTab === 'records' ? (
          <section className="results-workspace main-grid">
            <div className="results-slot results-slot-4">
              <SummaryGridCard title="账户记录摘要" items={recordSummaryItems} note="近 30 天流水与导出统计" />
            </div>
            <div className="results-slot results-slot-4">
              <StatusRailCard title="记录状态" items={recordStatusItems} note="近 30 天账户流水分类" />
            </div>
            <div className="results-slot results-slot-4">
              <TimelineCard title="最近记账时间线" items={recordTimelineItems} note="最新 4 条记账动作" />
            </div>
            <div className="results-slot results-slot-8">
              <AccountRecordsCard title="账户流水明细" rows={accountRecords} note="近 30 天" />
            </div>
            <div className="results-slot results-slot-4">
              <FundFlowCard data={overview ? activityFlowData : undefined} />
            </div>
          </section>
        ) : null}
      </div>
    </section>
    )
  }
}

export { ResultsPage }
