export type LatestTopicItem = {
  id: string
  label: string
  marketIds: string[]
}

const ALL_LATEST_MARKET_IDS = [
  'public-trust',
  'regional-dialogue',
  'ceasefire-durability',
  'ai-model-review',
  'btc-network-fee',
  'nba-final-consensus',
  'f1-season-result',
  'rolling-temperature',
] as const

function buildTopicMarketIds(...priorityIds: Array<(typeof ALL_LATEST_MARKET_IDS)[number]>) {
  const seen = new Set(priorityIds)

  return [
    ...priorityIds,
    ...ALL_LATEST_MARKET_IDS.filter((marketId) => !seen.has(marketId)),
  ]
}

export const LATEST_TOPIC_ITEMS: LatestTopicItem[] = [
  {
    id: 'james-comey',
    label: 'James Comey',
    marketIds: buildTopicMarketIds(
      'public-trust',
      'regional-dialogue',
      'ceasefire-durability',
      'ai-model-review',
    ),
  },
  {
    id: 'nba-finals-2026',
    label: '2026年NBA季后赛',
    marketIds: buildTopicMarketIds(
      'nba-final-consensus',
      'f1-season-result',
      'rolling-temperature',
      'public-trust',
    ),
  },
  {
    id: 'india-election',
    label: '印度选举',
    marketIds: buildTopicMarketIds(
      'public-trust',
      'regional-dialogue',
      'ceasefire-durability',
      'rolling-temperature',
    ),
  },
  {
    id: 'hormuz-strait',
    label: '霍尔木兹海峡',
    marketIds: buildTopicMarketIds(
      'regional-dialogue',
      'ceasefire-durability',
      'btc-network-fee',
      'public-trust',
    ),
  },
  {
    id: 'nhl-2026',
    label: '2026年NHL季后赛',
    marketIds: buildTopicMarketIds(
      'nba-final-consensus',
      'f1-season-result',
      'ai-model-review',
      'rolling-temperature',
    ),
  },
  {
    id: 'earnings',
    label: '收入',
    marketIds: buildTopicMarketIds(
      'btc-network-fee',
      'public-trust',
      'ai-model-review',
      'regional-dialogue',
    ),
  },
  {
    id: 'fed-chair',
    label: '美联储主席',
    marketIds: buildTopicMarketIds(
      'btc-network-fee',
      'public-trust',
      'rolling-temperature',
      'ai-model-review',
    ),
  },
  {
    id: 'nba',
    label: 'NBA',
    marketIds: buildTopicMarketIds(
      'nba-final-consensus',
      'f1-season-result',
      'public-trust',
      'rolling-temperature',
    ),
  },
  {
    id: 'iran-ceasefire',
    label: '伊朗停火',
    marketIds: buildTopicMarketIds(
      'regional-dialogue',
      'ceasefire-durability',
      'public-trust',
      'rolling-temperature',
    ),
  },
  {
    id: 'federal-reserve',
    label: '美联储',
    marketIds: buildTopicMarketIds(
      'btc-network-fee',
      'public-trust',
      'ai-model-review',
      'rolling-temperature',
    ),
  },
  {
    id: 'ice-man',
    label: '冰人',
    marketIds: buildTopicMarketIds(
      'f1-season-result',
      'rolling-temperature',
      'btc-network-fee',
      'ai-model-review',
    ),
  },
  {
    id: 'daily-temperature',
    label: '每日温度',
    marketIds: buildTopicMarketIds(
      'rolling-temperature',
      'ceasefire-durability',
      'public-trust',
      'btc-network-fee',
    ),
  },
  {
    id: 'tweet-markets',
    label: 'Tweet Markets',
    marketIds: buildTopicMarketIds(
      'ai-model-review',
      'btc-network-fee',
      'public-trust',
      'regional-dialogue',
    ),
  },
]

export function getLatestTopicItem(topicId: string) {
  return LATEST_TOPIC_ITEMS.find((item) => item.id === topicId)
}
