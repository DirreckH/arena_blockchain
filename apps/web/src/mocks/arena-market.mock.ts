import { Sparkles } from 'lucide-react'

export const ARENA_LOGO_SRC = '/brand-assets/arena-logo.png'

export type NavigationItem = {
  label: string
  href: string
  icon?: typeof Sparkles
  exact?: boolean
}

export type ArenaOption = {
  label: string
  caption?: string
}

export type ArenaMarketCard = {
  id: string
  href: string
  title: string
  category: string
  categoryHref: string
  image: string
  statusLabel: string
  timeProgressLabel: string
  timeProgressPercent: number
  sampleProgressLabel: string
  sampleProgressPercent: number
  options: ArenaOption[]
  reward?: boolean
  phaseLabel?: string
  previousResult?: string
}

export type FeaturedMarket = ArenaMarketCard & {
  topic: string
  topicHref: string
  closeDate: string
  news: Array<{ source: string; age: string; headline: string; href: string }>
}

export type TrendingItem = {
  rank: number
  title: string
  href: string
  statusLabel?: string
  metaLabel?: string
}

export type UserBetItem = {
  href: string
  title: string
  positionLabel: string
  stakeLabel: string
  statusLabel: string
  resultLabel?: string
  resultTone?: 'neutral' | 'positive' | 'negative'
}

export const eventHref = (marketId: string) => `/zh/event/${marketId}`

export const productNavItems: NavigationItem[] = [
  { label: '发现', href: '/zh', exact: true },
  { label: '市场', href: '/zh/markets' },
  { label: '裁决', href: '/zh/adjudication' },
  { label: '发布命题', href: '/zh/challenges' },
  { label: '我的结果', href: '/zh/results' },
]

export const navItems: NavigationItem[] = [
  { label: '热门', href: '/zh', icon: Sparkles, exact: true },
  { label: '突发', href: '/zh/breaking' },
  { label: '最新', href: '/zh/new' },
  { label: '公共政策', href: '/zh/politics' },
  { label: '体育', href: '/zh/sports/live' },
  { label: '加密', href: '/zh/crypto' },
  { label: '科技', href: '/zh/tech' },
  { label: '地缘', href: '/zh/geopolitics' },
  { label: '金融', href: '/zh/finance' },
  { label: '文化', href: '/zh/pop-culture' },
  { label: '经济', href: '/zh/economy' },
  { label: '天气', href: '/zh/weather' },
  { label: '调研', href: '/zh/surveys' },
  { label: '滚动命题', href: '/zh/rolling' },
]

export const filters: NavigationItem[] = [
  { label: '全部', href: '/zh', exact: true },
  { label: '公共议题', href: '/zh/predictions/public-policy' },
  { label: '地缘事件', href: '/zh/predictions/geopolitics' },
  { label: 'AI 调研', href: '/zh/predictions/ai' },
  { label: '金融观察', href: '/zh/predictions/finance' },
  { label: '体育结果', href: '/zh/predictions/sports' },
  { label: '滚动命题', href: '/zh/predictions/rolling' },
  { label: '有效样本优先', href: '/zh/predictions/effective-sample' },
  { label: '即将开奖', href: '/zh/predictions/closing-soon' },
]

export const featuredMarkets: FeaturedMarket[] = [
  {
    id: 'public-trust',
    href: eventHref('public-trust'),
    title: '公众是否认为本季度公共服务响应速度有所改善？',
    category: '裁决层命题',
    categoryHref: '/zh/politics',
    image: '/arena-assets/kash-patel.jpg',
    statusLabel: '收集中',
    phaseLabel: '开奖前隔离',
    timeProgressLabel: '距离开奖 6 天',
    timeProgressPercent: 62,
    sampleProgressLabel: '有效样本 420 / 600',
    sampleProgressPercent: 70,
    options: [
      { label: '改善明显', caption: '选项 A' },
      { label: '变化不明显', caption: '选项 B' },
      { label: '尚不能判断', caption: '选项 C' },
    ],
    topic: '公共政策',
    topicHref: '/zh/predictions/public-policy',
    closeDate: '2026-04-30 开奖',
    news: [
      { source: 'Arena', age: '1 天前', headline: '当前演示仅展示时间与有效样本进度', href: '/zh/news/public-trust-boundary' },
      { source: 'Arena', age: '3 天前', headline: '裁决层实时方向在开奖前不会出现在验证层页面', href: '/zh/news/adjudication-boundary' },
    ],
  },
  {
    id: 'ai-model-review',
    href: eventHref('ai-model-review'),
    title: '开发者对下一代 AI 工具链的可验证满意度调研',
    category: '调研网络',
    categoryHref: '/zh/tech',
    image: '/arena-assets/ai-model.jpg',
    statusLabel: '样本校验中',
    phaseLabel: '开奖前隔离',
    timeProgressLabel: '距离开奖 11 天',
    timeProgressPercent: 48,
    sampleProgressLabel: '有效样本 310 / 800',
    sampleProgressPercent: 39,
    options: [
      { label: '满意度提升', caption: '选项 A' },
      { label: '满意度持平', caption: '选项 B' },
      { label: '满意度下降', caption: '选项 C' },
    ],
    topic: 'AI 调研',
    topicHref: '/zh/predictions/ai',
    closeDate: '2026-05-08 开奖',
    news: [
      { source: 'Arena', age: '2 天前', headline: '滚动命题仅可展示上一期公开结果', href: '/zh/news/rolling-result-rule' },
      { source: 'Arena', age: '5 天前', headline: '有效样本进度不包含内部样本分布', href: '/zh/news/sample-progress-rule' },
    ],
  },
]

export const marketCards: ArenaMarketCard[] = [
  {
    id: 'public-trust',
    href: eventHref('public-trust'),
    title: '公众是否认为本季度公共服务响应速度有所改善？',
    category: '公共政策',
    categoryHref: '/zh/politics',
    image: '/arena-assets/kash-patel.jpg',
    statusLabel: '收集中',
    phaseLabel: '开奖前隔离',
    timeProgressLabel: '距离开奖 6 天',
    timeProgressPercent: 62,
    sampleProgressLabel: '有效样本 420 / 600',
    sampleProgressPercent: 70,
    options: [
      { label: '改善明显', caption: '选项 A' },
      { label: '变化不明显', caption: '选项 B' },
    ],
    reward: true,
  },
  {
    id: 'btc-network-fee',
    href: eventHref('btc-network-fee'),
    title: '比特币网络手续费是否会在本月维持高拥堵状态？',
    category: '加密观察',
    categoryHref: '/zh/crypto',
    image: '/arena-assets/btc.png',
    statusLabel: '验证层观察',
    phaseLabel: '公开结果待定',
    timeProgressLabel: '距离公开结果 5 天',
    timeProgressPercent: 68,
    sampleProgressLabel: '有效样本 260 / 500',
    sampleProgressPercent: 52,
    options: [
      { label: '高拥堵', caption: '选项 A' },
      { label: '非高拥堵', caption: '选项 B' },
    ],
  },
  {
    id: 'ai-model-review',
    href: eventHref('ai-model-review'),
    title: '开发者对下一代 AI 工具链的可验证满意度调研',
    category: '科技调研',
    categoryHref: '/zh/tech',
    image: '/arena-assets/ai-model.jpg',
    statusLabel: '样本校验中',
    phaseLabel: '开奖前隔离',
    timeProgressLabel: '距离开奖 11 天',
    timeProgressPercent: 48,
    sampleProgressLabel: '有效样本 310 / 800',
    sampleProgressPercent: 39,
    options: [
      { label: '满意度提升', caption: '选项 A' },
      { label: '满意度持平', caption: '选项 B' },
    ],
  },
  {
    id: 'regional-dialogue',
    href: eventHref('regional-dialogue'),
    title: '区域外交会谈是否会在公开窗口内形成可验证结果？',
    category: '地缘事件',
    categoryHref: '/zh/geopolitics',
    image: '/arena-assets/iran-meeting.jpg',
    statusLabel: '等待公开结果',
    phaseLabel: '验证层',
    timeProgressLabel: '公开窗口剩余 9 天',
    timeProgressPercent: 55,
    sampleProgressLabel: '有效样本 540 / 700',
    sampleProgressPercent: 77,
    options: [
      { label: '形成公开结果', caption: '选项 A' },
      { label: '未形成公开结果', caption: '选项 B' },
    ],
    reward: true,
  },
  {
    id: 'ceasefire-durability',
    href: eventHref('ceasefire-durability'),
    title: '停火安排是否会在观察期内保持公开可验证状态？',
    category: '地缘事件',
    categoryHref: '/zh/geopolitics',
    image: '/arena-assets/iran-peace.jpg',
    statusLabel: '观察期',
    phaseLabel: '开奖前隔离',
    timeProgressLabel: '观察期剩余 14 天',
    timeProgressPercent: 41,
    sampleProgressLabel: '有效样本 360 / 650',
    sampleProgressPercent: 55,
    options: [
      { label: '保持可验证状态', caption: '选项 A' },
      { label: '未保持可验证状态', caption: '选项 B' },
    ],
  },
  {
    id: 'nba-final-consensus',
    href: eventHref('nba-final-consensus'),
    title: '球迷对 2026 总决赛公开结果的赛前共识调研',
    category: '体育结果',
    categoryHref: '/zh/sports/live',
    image: '/arena-assets/nba.jpg',
    statusLabel: '收集中',
    phaseLabel: '样本门槛未满',
    timeProgressLabel: '距离开奖 18 天',
    timeProgressPercent: 30,
    sampleProgressLabel: '有效样本 190 / 500',
    sampleProgressPercent: 38,
    options: [
      { label: '西部球队', caption: '选项 A' },
      { label: '东部球队', caption: '选项 B' },
    ],
    reward: true,
  },
  {
    id: 'f1-season-result',
    href: eventHref('f1-season-result'),
    title: 'F1 赛季公开积分结果的验证层观察命题',
    category: '体育结果',
    categoryHref: '/zh/sports/live',
    image: '/arena-assets/f1.jpg',
    statusLabel: '长期观察',
    phaseLabel: '验证层',
    timeProgressLabel: '赛季窗口进行中',
    timeProgressPercent: 24,
    sampleProgressLabel: '有效样本 280 / 900',
    sampleProgressPercent: 31,
    options: [
      { label: '结果达到阈值', caption: '选项 A' },
      { label: '结果未达阈值', caption: '选项 B' },
    ],
  },
  {
    id: 'rolling-temperature',
    href: eventHref('rolling-temperature'),
    title: '城市日温度滚动命题的上一期公开结果复核',
    category: '滚动命题',
    categoryHref: '/zh/weather',
    image: '/arena-assets/ai-model.jpg',
    statusLabel: '滚动更新',
    phaseLabel: '上一期结果公开',
    previousResult: '上一期公开结果已归档',
    timeProgressLabel: '本期开奖剩余 20 小时',
    timeProgressPercent: 83,
    sampleProgressLabel: '有效样本 145 / 200',
    sampleProgressPercent: 73,
    options: [
      { label: '达到阈值', caption: '选项 A' },
      { label: '未达阈值', caption: '选项 B' },
    ],
  },
]

export const breakingNews: TrendingItem[] = [
  { rank: 1, href: eventHref('public-trust'), title: '公共服务响应命题进入最后样本校验窗口', statusLabel: '收集中' },
  { rank: 2, href: eventHref('regional-dialogue'), title: '区域外交会谈观察窗口等待公开结果', statusLabel: '待公开' },
  { rank: 3, href: eventHref('rolling-temperature'), title: '滚动温度命题上一期结果完成归档', statusLabel: '已归档' },
]

export const hotTopics: TrendingItem[] = [
  { rank: 1, href: '/zh/predictions/public-policy', title: '公共政策', metaLabel: '裁决层命题' },
  { rank: 2, href: '/zh/predictions/ai', title: 'AI 调研', metaLabel: '样本校验' },
  { rank: 3, href: '/zh/predictions/geopolitics', title: '地缘事件', metaLabel: '公开结果' },
  { rank: 4, href: '/zh/predictions/rolling', title: '滚动命题', metaLabel: '上一期结果' },
  { rank: 5, href: '/zh/predictions/effective-sample', title: '有效样本', metaLabel: '进度视图' },
]

export const userOpenBets: UserBetItem[] = [
  {
    href: eventHref('btc-network-fee'),
    title: '比特币网络手续费是否会在本月维持高拥堵状态？',
    positionLabel: '已押 高拥堵',
    stakeLabel: '12.5 USDC',
    statusLabel: '待开奖',
    resultTone: 'neutral',
  },
  {
    href: eventHref('ceasefire-durability'),
    title: '停火安排是否会在观察期内保持公开可验证状态？',
    positionLabel: '已押 保持可验证状态',
    stakeLabel: '8.0 USDC',
    statusLabel: '观察中',
    resultTone: 'neutral',
  },
  {
    href: eventHref('f1-season-result'),
    title: 'F1 赛季公开积分结果的验证层观察命题',
    positionLabel: '已押 结果达到阈值',
    stakeLabel: '10.0 USDC',
    statusLabel: '长期',
    resultTone: 'neutral',
  },
]

export const userSettledBets: UserBetItem[] = [
  {
    href: eventHref('regional-dialogue'),
    title: '区域外交会谈是否会在公开窗口内形成可验证结果？',
    positionLabel: '已押 形成公开结果',
    stakeLabel: '6.5 USDC',
    statusLabel: '命中',
    resultLabel: '+4.2 USDC',
    resultTone: 'positive',
  },
  {
    href: eventHref('rolling-temperature'),
    title: '城市日温度滚动命题的上一期公开结果复核',
    positionLabel: '已押 达到阈值',
    stakeLabel: '5.0 USDC',
    statusLabel: '未中',
    resultLabel: '-5.0 USDC',
    resultTone: 'negative',
  },
]

export const footerTopics: NavigationItem[] = [
  { label: '公共政策', href: '/zh/predictions/public-policy' },
  { label: 'AI 调研', href: '/zh/predictions/ai' },
  { label: '地缘事件', href: '/zh/predictions/geopolitics' },
  { label: '金融观察', href: '/zh/predictions/finance' },
  { label: '体育结果', href: '/zh/predictions/sports' },
  { label: '滚动命题', href: '/zh/predictions/rolling' },
  { label: '有效样本', href: '/zh/predictions/effective-sample' },
  { label: '即将开奖', href: '/zh/predictions/closing-soon' },
  { label: '公开结果', href: '/zh/predictions/public-results' },
]

export const knownPageTitles: Record<string, string> = {
  '/zh/breaking': '突发命题',
  '/zh/new': '最新命题',
  '/zh/politics': '公共政策',
  '/zh/sports/live': '体育结果',
  '/zh/crypto': '加密观察',
  '/zh/tech': '科技调研',
  '/zh/geopolitics': '地缘事件',
  '/zh/finance': '金融观察',
  '/zh/pop-culture': '文化调研',
  '/zh/economy': '经济观察',
  '/zh/weather': '天气滚动命题',
  '/zh/surveys': '调研网络',
  '/zh/rolling': '滚动命题',
  '/zh/markets': '全部命题',
  '/zh/adjudication': '裁决层',
  '/zh/challenges': '挑战',
  '/zh/results': '主页',
  '/zh/rewards': '参与激励',
  '/zh/leaderboard': '贡献排行',
  '/zh/accuracy': '公开结果复核',
  '/zh/activity': '账户活动',
  '/zh/brand': 'Arena 品牌',
  '/zh/docs': '开发文档',
  '/zh/contact': '联系 Arena',
  '/zh/market-integrity': '信息隔离边界',
}
