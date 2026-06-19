// 运营台状态码 → 中文展示映射。
// 原则:UI 显示中文,传给后端 API 的 enum 原值保持不变(本文件只负责"读"的展示层)。
// 未收录的码原样回退,保证不会因为后端新增枚举而崩。

type LabelMap = Record<string, string>

const PROPOSITION_STATUS: LabelMap = {
  draft: '草稿',
  scheduled: '已排期',
  live: '进行中',
  frozen: '已冻结',
  revealing: '揭晓中',
  settled: '已结算',
  closed: '已关闭',
  archived: '已归档',
}

const SUBMISSION_STATUS: LabelMap = {
  unsubmitted: '未提交',
  submitted: '待审核',
  withdrawn: '已撤回',
  approved: '已通过',
  rejected: '已驳回',
}

const REVIEW_STATUS: LabelMap = {
  pending_review: '待复核',
  valid: '有效',
  partial_valid: '部分有效',
  invalid: '无效',
  fraud_suspected: '疑似作弊',
}

const WORKFLOW_STATE: LabelMap = {
  unclaimed: '待认领',
  claimed: '已认领',
  released: '已释放',
  expired: '已超时',
  finalized: '已定档',
}

const REWARD_STATUS: LabelMap = {
  pending: '待发放',
  finalized: '已发放',
  voided: '已作废',
  reversed: '已冲正',
}

const PAYOUT_STATUS: LabelMap = {
  requested: '待审核',
  approved: '已审核',
  executing: '执行中',
  completed: '已到账',
  failed: '失败待重试',
  cancelled: '已取消',
}

const MARKET_STATUS: LabelMap = {
  pending: '待开盘',
  live: '交易中',
  frozen: '已冻结',
  settling: '结算中',
  settled: '已结算',
  cancelled: '已取消',
}

const CHAIN_MARKET_STATUS: LabelMap = {
  pre_live: '待上线',
  live: '交易中',
  frozen: '已冻结',
  resolved: '已敲定',
  cancelled: '已取消',
}

const SYNC_STATUS: LabelMap = {
  idle: '空闲',
  syncing: '同步中',
  error: '异常',
  missing: '缺失',
}

const BET_STATUS: LabelMap = {
  open: '持仓中',
  settled: '已结算',
  refunded: '已退款',
  void: '已作废',
}

const SEVERITY: LabelMap = {
  critical: '紧急',
  high: '高',
  medium: '中',
}

const REHEARSAL_STEP_STATUS: LabelMap = {
  pending: '待执行',
  complete: '已完成',
  blocked: '受阻',
}

const REHEARSAL_STEP_ID: LabelMap = {
  preflight: '预检',
  publish_and_open: '发布并开盘',
  local_bet_and_sync: '本地下注与同步',
  freeze_and_resolve: '冻结并敲定',
  projection_and_settlement: '投影与结算',
}

const CATEGORY: LabelMap = {
  general: '综合',
  sports: '体育竞技',
  ai: 'AI / 科技',
  brand_research: '消费者调研',
  politics: '公共政策',
  entertainment: '娱乐',
}

const KIND_MAPS = {
  proposition: PROPOSITION_STATUS,
  submission: SUBMISSION_STATUS,
  review: REVIEW_STATUS,
  workflow: WORKFLOW_STATE,
  reward: REWARD_STATUS,
  payout: PAYOUT_STATUS,
  market: MARKET_STATUS,
  chainMarket: CHAIN_MARKET_STATUS,
  sync: SYNC_STATUS,
  bet: BET_STATUS,
  severity: SEVERITY,
  rehearsalStatus: REHEARSAL_STEP_STATUS,
  rehearsalStep: REHEARSAL_STEP_ID,
  category: CATEGORY,
} as const

export type StatusLabelKind = keyof typeof KIND_MAPS

/**
 * 把后端状态码映射为中文展示文案。
 * @param kind 状态码分类
 * @param code 后端原始码(可能为 null/undefined)
 * @returns 中文文案;未收录或空值时回退为原码或 '—'
 */
export function statusLabel(kind: StatusLabelKind, code: string | null | undefined): string {
  if (!code) return '—'
  return KIND_MAPS[kind][code] ?? code
}
