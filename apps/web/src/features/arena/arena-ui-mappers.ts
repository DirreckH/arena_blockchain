import type {
  AdjudicationTaskViewModel,
  PropositionCategory,
  RespondentReputationSummaryViewModel,
  RespondentRewardLedgerViewModel,
  RespondentTagSummaryViewModel,
  RewardLedgerStatus,
  RewardPayoutStatus,
  ValidationMarketViewModel,
} from '@arena/shared'
import type { PropositionDraftRecord } from '../api/arena-api'

const SAMPLE_CONSTRAINT_LABELS: Record<string, string> = {
  experienced_user: '资深答题人',
  wallet_signed: '已绑定钱包',
  high_completion: '高完成率',
  high_quality: '高质量',
  low_anomaly: '低异常率',
  stable_responder: '稳定答题人',
  risky_responder: '高风险样本',
  interested_in_sports: '体育兴趣',
  interested_in_ai: 'AI 兴趣',
  interested_in_brand_research: '品牌调研兴趣',
  interested_in_politics: '公共政策兴趣',
  interested_in_entertainment: '娱乐兴趣',
}

export function formatRelativeTime(isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp).getTime()
  const diffMs = Date.now() - timestamp

  if (!Number.isFinite(timestamp) || diffMs < 0) {
    return '刚刚'
  }

  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) {
    return '刚刚'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) {
    return `${diffDays} 天前`
  }

  return new Date(isoTimestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCategoryLabel(category: PropositionCategory | string) {
  switch (category) {
    case 'ai':
      return 'AI / Technology'
    case 'sports':
      return 'Sports / Competition'
    case 'politics':
      return 'Public Policy'
    case 'brand_research':
      return 'Consumer Research'
    case 'entertainment':
      return 'Entertainment'
    case 'general':
    default:
      return 'General'
  }
}

export function computeDraftCompletion(draft: PropositionDraftRecord) {
  const checks = [
    draft.title.trim().length >= 12,
    draft.summary.trim().length >= 60,
    draft.optionA.trim().length > 0 && draft.optionB.trim().length > 0,
    draft.sampleConstraints.length >= 1,
  ]

  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function buildDraftTags(draft: PropositionDraftRecord) {
  return [...draft.sampleConstraints]
}

export function formatSampleConstraintLabel(value: string) {
  return SAMPLE_CONSTRAINT_LABELS[value] ?? value
}

export function buildDraftReferenceLink() {
  return 'https://'
}

export function summarizeRewardStatus(status: RewardLedgerStatus | null) {
  switch (status) {
    case 'finalized':
      return '已结算'
    case 'pending':
      return '待结算'
    case 'voided':
      return '已作废'
    case 'reversed':
      return '已冲销'
    default:
      return '未开始'
  }
}

export type PayoutStatusTone = 'positive' | 'progress' | 'negative' | 'neutral'

export function summarizePayoutStatus(status: RewardPayoutStatus | null): {
  label: string
  tone: PayoutStatusTone
} {
  switch (status) {
    case 'requested':
      return { label: '已申请发放', tone: 'progress' }
    case 'approved':
      return { label: '已审核待执行', tone: 'progress' }
    case 'executing':
      return { label: '发放执行中', tone: 'progress' }
    case 'completed':
      return { label: '已到账', tone: 'positive' }
    case 'failed':
      return { label: '发放失败', tone: 'negative' }
    case 'cancelled':
      return { label: '发放已取消', tone: 'neutral' }
    default:
      return { label: '尚未发起发放', tone: 'neutral' }
  }
}

export function formatTokenAmount(value: string | null | undefined) {
  if (!value) {
    return '0 USDC'
  }

  return `${value} USDC`
}

export function formatCountdown(seconds: number) {
  if (seconds <= 0) {
    return '00:00:00'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export function pickLeadTask(tasks: AdjudicationTaskViewModel[]) {
  return [...tasks].sort((left, right) => left.timeRemainingSeconds - right.timeRemainingSeconds)[0] ?? null
}

export function filterUserOpenMarkets(markets: ValidationMarketViewModel[]) {
  return markets.filter((market) => market.currentUserPosition && market.marketStatus !== 'settled')
}

export function filterUserSettledMarkets(markets: ValidationMarketViewModel[]) {
  return markets.filter((market) => market.currentUserPosition && market.marketStatus === 'settled')
}

export function aggregateRewardSummary(rewards: RespondentRewardLedgerViewModel[]) {
  const pending = rewards
    .filter((reward) => reward.status === 'pending')
    .reduce((sum, reward) => sum + Number(reward.pendingAmount), 0)

  const finalized = rewards
    .filter((reward) => reward.status === 'finalized')
    .reduce((sum, reward) => sum + Number(reward.finalAmount ?? '0'), 0)

  return {
    pending: pending.toFixed(2),
    finalized: finalized.toFixed(2),
    totalCount: rewards.length,
  }
}

export function summarizeReputationLevel(reputation: RespondentReputationSummaryViewModel | null) {
  if (!reputation) {
    return '未生成'
  }

  switch (reputation.reputationLevel) {
    case 'trusted':
      return 'Trusted'
    case 'risky':
      return 'Risky'
    case 'normal':
      return 'Normal'
    case 'new':
    default:
      return 'New'
  }
}

export function summarizeTags(tags: RespondentTagSummaryViewModel | null) {
  return tags?.tags.map((tag) => tag.tagKey) ?? []
}
