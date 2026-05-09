import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleCheck,
  Trophy,
  TrendingUp,
  Wallet,
} from 'lucide-react'

export type MockUser = {
  displayName: string
  avatarInitial: string
  email: string
}

export type AccountTone = 'positive' | 'negative' | 'neutral'

export type AccountSummaryStat = {
  label: string
  value: string
  delta: string
  detail: string
  tone: AccountTone
  icon: LucideIcon
}

export type AccountSummaryItem = {
  label: string
  value: string
  detail: string
  tone?: AccountTone
}

export type AccountTimelineItem = {
  time: string
  title: string
  detail: string
  amount?: string
  tone?: AccountTone
}

export type AccountPositionRow = {
  direction: 'long' | 'short'
  contract: string
  amount: string
  averageCost: string
  settlePrice: string
  pnl: string
  pnlPercent: string
  status: string
}

export type AccountRecordRow = {
  time: string
  type: string
  reference: string
  change: string
  balance: string
  status: string
}

export type AccountShortcutLink = {
  label: string
  caption: string
  href: string
}

export const DEFAULT_MOCK_USER: MockUser = {
  displayName: 'Arena 用户',
  avatarInitial: 'A',
  email: 'arena.user@example.com',
}

export const ACCOUNT_SUMMARY_STATS: AccountSummaryStat[] = [
  {
    label: '累计收益 (USDC)',
    value: '12,480',
    delta: '+2,480 (+24.81%)',
    detail: '',
    tone: 'positive',
    icon: Wallet,
  },
  {
    label: 'ROI',
    value: '+38.0%',
    delta: '年化 124.7%',
    detail: '',
    tone: 'positive',
    icon: TrendingUp,
  },
  {
    label: '胜率',
    value: '58%',
    delta: '总结算 87 / 150',
    detail: '',
    tone: 'neutral',
    icon: Trophy,
  },
  {
    label: '平均持仓收益',
    value: '+0.83 USDC',
    delta: '平均 +2.31%',
    detail: '',
    tone: 'positive',
    icon: ArrowUpRight,
  },
  {
    label: '最大回撤',
    value: '-9.72%',
    delta: '发生于 05-14 15:30',
    detail: '',
    tone: 'negative',
    icon: ArrowDownRight,
  },
  {
    label: '结算完成率',
    value: '98.6%',
    delta: '已结算 1,436 / 1,456',
    detail: '',
    tone: 'neutral',
    icon: CircleCheck,
  },
]

export const ACCOUNT_HEADER_METRICS: AccountSummaryItem[] = [
  { label: '账户总资产', value: '18,426 USDC', detail: '已结算与进行中资产合计', tone: 'positive' },
  { label: '近 7 天收益', value: '+2,480 USDC', detail: '与主页收益表现同步', tone: 'positive' },
  { label: '可用余额', value: '5,820 USDC', detail: '可继续配置新的命题仓位' },
  { label: '进行中仓位', value: '14', detail: '待公开 6 / 观察中 8' },
]

export const ACCOUNT_SETTINGS_HEADER_METRICS: AccountSummaryItem[] = [
  { label: '通知偏好', value: '4 项已启用', detail: '邮件 1 项 / 站内 3 项' },
  { label: '默认落地页', value: '总览', detail: '进入主页后默认展示账户总览' },
  { label: 'Relayer API', value: '未生成', detail: '当前仅保留密钥管理壳' },
  { label: '钱包连接', value: '未连接', detail: '签名与导出能力仍保持关闭' },
]

export const ACCOUNT_ASSET_SUMMARY_ITEMS: AccountSummaryItem[] = [
  { label: '账户总资产', value: '18,426 USDC', detail: '含已结算与进行中仓位', tone: 'positive' },
  { label: '可用余额', value: '5,820 USDC', detail: '可继续配置新的命题仓位' },
  { label: '待结算资金', value: '3,940 USDC', detail: '等待公开结果后的入账处理' },
  { label: '奖励余额', value: '2,000 USDC', detail: '来自参与激励与平台补贴', tone: 'positive' },
]

export const ACCOUNT_POSITIONS: AccountPositionRow[] = [
  {
    direction: 'long',
    contract: 'Perplexity',
    amount: '2,480',
    averageCost: '0.582',
    settlePrice: '0.723',
    pnl: '+349.84',
    pnlPercent: '+24.19%',
    status: '已结算',
  },
  {
    direction: 'short',
    contract: 'ChatGPT Search',
    amount: '1,860',
    averageCost: '0.421',
    settlePrice: '0.318',
    pnl: '-191.58',
    pnlPercent: '-24.44%',
    status: '已结算',
  },
  {
    direction: 'long',
    contract: 'Perplexity',
    amount: '1,240',
    averageCost: '0.615',
    settlePrice: '0.702',
    pnl: '+107.88',
    pnlPercent: '+14.15%',
    status: '已结算',
  },
  {
    direction: 'short',
    contract: 'ChatGPT Search',
    amount: '1,000',
    averageCost: '0.530',
    settlePrice: '0.661',
    pnl: '+135.22',
    pnlPercent: '+39.99%',
    status: '已结算',
  },
  {
    direction: 'long',
    contract: 'Perplexity',
    amount: '820',
    averageCost: '0.601',
    settlePrice: '0.723',
    pnl: '+207.13',
    pnlPercent: '+20.31%',
    status: '已结算',
  },
]

export const ACCOUNT_OVERVIEW_TIMELINE_ITEMS: AccountTimelineItem[] = [
  { time: '05-18 20:35', title: '导出收益报告', detail: '来自主页 / 收益表现', amount: '7 天' },
  { time: '05-18 20:00', title: 'Perplexity 仓位结算入账', detail: '收益已计入账户总资产', amount: '+349.84 USDC', tone: 'positive' },
  { time: '05-18 18:20', title: '参与激励到账', detail: '平台补贴发放完成', amount: '+200.00 USDC', tone: 'positive' },
  { time: '05-17 11:05', title: '提现申请完成', detail: '资金已划转至外部地址', amount: '-1,500.00 USDC', tone: 'negative' },
]

export const ACCOUNT_RECORDS: AccountRecordRow[] = [
  { time: '05-18 20:00', type: '结算入账', reference: 'Perplexity', change: '+349.84', balance: '18,426.12', status: '已入账' },
  { time: '05-18 18:20', type: '奖励补贴', reference: '参与激励', change: '+200.00', balance: '18,076.28', status: '已入账' },
  { time: '05-17 11:05', type: '提现', reference: '外部地址 0x8f2a', change: '-1,500.00', balance: '17,876.28', status: '已完成' },
  { time: '05-16 09:30', type: '充值', reference: '外部地址 0x3c91', change: '+2,000.00', balance: '19,376.28', status: '已确认' },
  { time: '05-15 22:10', type: '手续费', reference: '结算批次 2025-05-15', change: '-18.32', balance: '17,376.28', status: '已扣除' },
  { time: '05-14 15:30', type: '结算亏损', reference: 'ChatGPT Search', change: '-191.58', balance: '17,394.60', status: '已入账' },
]

export const ACCOUNT_MENU_PRIMARY_LINKS: AccountShortcutLink[] = [
  { label: '主页总览', caption: '查看账户总览与最近结算动态', href: '/zh/results?tab=overview' },
  { label: '收益表现', caption: '继续查看累计收益、回撤与热力分布', href: '/zh/results?tab=performance' },
  { label: '持仓明细', caption: '进入重点仓位、暴露分布与持仓表格', href: '/zh/results?tab=positions' },
  { label: '账户记录', caption: '回看近 30 天结算、充值、提现与奖励流水', href: '/zh/results?tab=records' },
]

export const ACCOUNT_MENU_SUPPORT_LINKS: AccountShortcutLink[] = [
  { label: '账户设置', caption: '管理通知、显示偏好、API 占位与签名入口', href: '/zh/activity' },
  { label: '语言', caption: '当前演示语言为中文', href: '/zh/language' },
  { label: '搜索', caption: '搜索命题与公开结果', href: '/zh/search' },
  { label: '收藏', caption: '查看已收藏命题占位', href: '/zh/watchlist' },
  { label: '参与激励', caption: '查看参与奖励占位', href: '/zh/rewards' },
  { label: '开发文档', caption: '产品与接口说明占位', href: '/zh/docs' },
  { label: '帮助中心', caption: '帮助与支持入口占位', href: '/zh/help' },
  { label: '联系 Arena', caption: '联系与反馈入口占位', href: '/zh/contact' },
]

export const ACCOUNT_MENU_STATUS_ITEMS: AccountSummaryItem[] = [
  { label: '本周已结算命题', value: '9', detail: '完成公开验证并已计入账户资产' },
  { label: '待公开窗口', value: '6', detail: '仍在等待公开结果的命题数量' },
  { label: '奖励进度', value: '4 / 6', detail: '本周期激励任务完成情况', tone: 'positive' },
  { label: '导出报告', value: '7 次', detail: '最近一次发生在 05-18 20:35' },
]
