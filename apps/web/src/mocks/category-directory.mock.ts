export type CategorySidebarItem = {
  label: string
  count: string
}

export type CategoryDirectoryConfig = {
  title: string
  sidebarItems: CategorySidebarItem[]
  featuredMarketId: string
  marketIds: string[]
}

export const CATEGORY_DIRECTORY_CONFIGS: Record<string, CategoryDirectoryConfig> = {
  '/zh/politics': {
    title: '政治',
    sidebarItems: [
      { label: '全部', count: '1.7K' },
      { label: '特朗普', count: '301' },
      { label: '特朗普日报', count: '14' },
      { label: '中期', count: '547' },
      { label: '全球选举', count: '161' },
      { label: '主要', count: '202' },
      { label: '国会', count: '39' },
      { label: '特朗普内阁', count: '11' },
      { label: '法院', count: '31' },
      { label: '爱泼斯坦', count: '24' },
      { label: '政府关闭', count: '5' },
      { label: '印度选举', count: '6' },
      { label: '哥伦比亚选举', count: '6' },
    ],
    featuredMarketId: 'public-trust',
    marketIds: [
      'public-trust',
      'regional-dialogue',
      'ceasefire-durability',
      'ai-model-review',
      'btc-network-fee',
      'rolling-temperature',
    ],
  },
  '/zh/sports/live': {
    title: '体育',
    sidebarItems: [
      { label: '全部', count: '942' },
      { label: '足球', count: '221' },
      { label: '篮球', count: '187' },
      { label: 'F1', count: '76' },
      { label: '网球', count: '64' },
      { label: '电竞', count: '55' },
      { label: '高尔夫', count: '23' },
      { label: '奥运', count: '18' },
    ],
    featuredMarketId: 'nba-final-consensus',
    marketIds: [
      'nba-final-consensus',
      'f1-season-result',
      'public-trust',
      'btc-network-fee',
      'rolling-temperature',
      'regional-dialogue',
    ],
  },
  '/zh/crypto': {
    title: '加密',
    sidebarItems: [
      { label: '全部', count: '1.2K' },
      { label: 'BTC', count: '284' },
      { label: 'ETH', count: '168' },
      { label: 'ETF', count: '74' },
      { label: '监管', count: '37' },
      { label: 'DeFi', count: '91' },
      { label: '稳定币', count: '43' },
      { label: 'Layer 2', count: '62' },
    ],
    featuredMarketId: 'btc-network-fee',
    marketIds: [
      'btc-network-fee',
      'ai-model-review',
      'rolling-temperature',
      'public-trust',
      'regional-dialogue',
      'f1-season-result',
    ],
  },
  '/zh/tech': {
    title: '科技',
    sidebarItems: [
      { label: '全部', count: '836' },
      { label: 'AI 模型', count: '242' },
      { label: 'AI 搜索', count: '108' },
      { label: '芯片', count: '67' },
      { label: '自动驾驶', count: '44' },
      { label: '社交平台', count: '59' },
      { label: '开发者工具', count: '32' },
      { label: '机器人', count: '18' },
    ],
    featuredMarketId: 'ai-model-review',
    marketIds: [
      'ai-model-review',
      'btc-network-fee',
      'public-trust',
      'f1-season-result',
      'regional-dialogue',
      'rolling-temperature',
    ],
  },
  '/zh/geopolitics': {
    title: '地缘',
    sidebarItems: [
      { label: '全部', count: '688' },
      { label: '中东', count: '124' },
      { label: '欧洲', count: '81' },
      { label: '美中', count: '76' },
      { label: '印太', count: '53' },
      { label: '制裁', count: '31' },
      { label: '停火', count: '22' },
      { label: '峰会', count: '18' },
    ],
    featuredMarketId: 'regional-dialogue',
    marketIds: [
      'regional-dialogue',
      'ceasefire-durability',
      'public-trust',
      'rolling-temperature',
      'btc-network-fee',
      'ai-model-review',
    ],
  },
  '/zh/finance': {
    title: '金融',
    sidebarItems: [
      { label: '全部', count: '903' },
      { label: '美联储', count: '144' },
      { label: '国债', count: '66' },
      { label: '银行', count: '42' },
      { label: '黄金', count: '73' },
      { label: '原油', count: '58' },
      { label: '风险偏好', count: '39' },
      { label: '外汇', count: '27' },
    ],
    featuredMarketId: 'btc-network-fee',
    marketIds: [
      'btc-network-fee',
      'public-trust',
      'ai-model-review',
      'regional-dialogue',
      'rolling-temperature',
      'nba-final-consensus',
    ],
  },
  '/zh/pop-culture': {
    title: '文化',
    sidebarItems: [
      { label: '全部', count: '512' },
      { label: '流媒体', count: '86' },
      { label: '电影', count: '74' },
      { label: '音乐', count: '59' },
      { label: '创作者', count: '21' },
      { label: '社交热词', count: '42' },
      { label: '颁奖季', count: '16' },
      { label: '现场活动', count: '11' },
    ],
    featuredMarketId: 'ai-model-review',
    marketIds: [
      'ai-model-review',
      'rolling-temperature',
      'public-trust',
      'btc-network-fee',
      'nba-final-consensus',
      'f1-season-result',
    ],
  },
  '/zh/economy': {
    title: '经济',
    sidebarItems: [
      { label: '全部', count: '771' },
      { label: '就业', count: '112' },
      { label: '通胀', count: '96' },
      { label: '消费', count: '63' },
      { label: '住房', count: '34' },
      { label: '供应链', count: '28' },
      { label: '制造业', count: '41' },
      { label: '增长', count: '55' },
    ],
    featuredMarketId: 'public-trust',
    marketIds: [
      'public-trust',
      'btc-network-fee',
      'rolling-temperature',
      'regional-dialogue',
      'ai-model-review',
      'f1-season-result',
    ],
  },
  '/zh/weather': {
    title: '天气',
    sidebarItems: [
      { label: '全部', count: '284' },
      { label: '气温', count: '101' },
      { label: '降雨', count: '46' },
      { label: '风暴', count: '28' },
      { label: '农业', count: '17' },
      { label: '用电负荷', count: '22' },
      { label: '能源', count: '19' },
      { label: '滚动命题', count: '51' },
    ],
    featuredMarketId: 'rolling-temperature',
    marketIds: [
      'rolling-temperature',
      'public-trust',
      'btc-network-fee',
      'regional-dialogue',
      'ceasefire-durability',
      'ai-model-review',
    ],
  },
  '/zh/surveys': {
    title: '调研',
    sidebarItems: [
      { label: '全部', count: '624' },
      { label: '开发者', count: '118' },
      { label: '消费者', count: '94' },
      { label: '品牌', count: '37' },
      { label: '社区', count: '61' },
      { label: 'AI 使用习惯', count: '73' },
      { label: '满意度', count: '44' },
      { label: '样本观察', count: '18' },
    ],
    featuredMarketId: 'ai-model-review',
    marketIds: [
      'ai-model-review',
      'public-trust',
      'rolling-temperature',
      'btc-network-fee',
      'nba-final-consensus',
      'regional-dialogue',
    ],
  },
  '/zh/rolling': {
    title: '滚动命题',
    sidebarItems: [
      { label: '全部', count: '346' },
      { label: '日更', count: '129' },
      { label: '周更', count: '78' },
      { label: '天气', count: '51' },
      { label: '市场观察', count: '34' },
      { label: '事件归档', count: '21' },
      { label: '上期结果', count: '18' },
      { label: '即将更新', count: '15' },
    ],
    featuredMarketId: 'rolling-temperature',
    marketIds: [
      'rolling-temperature',
      'public-trust',
      'btc-network-fee',
      'regional-dialogue',
      'ai-model-review',
      'f1-season-result',
    ],
  },
}

export const CATEGORY_DIRECTORY_PATHS = Object.keys(CATEGORY_DIRECTORY_CONFIGS)

export function isCategoryDirectoryPath(pathname: string) {
  return pathname in CATEGORY_DIRECTORY_CONFIGS
}

export function getCategoryDirectoryConfig(pathname: string) {
  return CATEGORY_DIRECTORY_CONFIGS[pathname]
}
