export type LatestTopicItem = {
  id: string
  label: string
  marketIds: string[]
}

const ALL_LATEST_MARKET_IDS = [
  'sports-messi-ronaldo-goat',
  'culture-concert-ticket-chaos',
  'tech-ai-search-habit',
  'crypto-meme-vs-ai-coins',
  'finance-fed-one-liner',
  'sports-hamilton-ferrari-spotlight',
  'politics-short-video-turnout',
  'geo-summit-photo-signal',
  'culture-red-carpet-over-awards',
  'tech-robot-videos-viral',
  'rolling-one-episode-viral',
  'economy-county-consumption-upgrade',
  'dao-founder-thread-sway',
  'surveys-friend-vs-kol',
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
    id: 'messi-vs-ronaldo-goat',
    label: '梅西 vs C 罗 GOAT',
    marketIds: buildTopicMarketIds(
      'sports-messi-ronaldo-goat',
      'sports-hamilton-ferrari-spotlight',
      'culture-red-carpet-over-awards',
      'rolling-one-episode-viral',
    ),
  },
  {
    id: 'ticket-chaos',
    label: '抢票比演出更抓马',
    marketIds: buildTopicMarketIds(
      'culture-concert-ticket-chaos',
      'culture-red-carpet-over-awards',
      'rolling-one-episode-viral',
      'surveys-friend-vs-kol',
    ),
  },
  {
    id: 'ai-search-habit',
    label: 'AI 搜索会不会真替代谷歌',
    marketIds: buildTopicMarketIds(
      'tech-ai-search-habit',
      'tech-robot-videos-viral',
      'surveys-friend-vs-kol',
      'dao-founder-thread-sway',
    ),
  },
  {
    id: 'meme-vs-ai-coins',
    label: 'Meme 币大战 AI 币',
    marketIds: buildTopicMarketIds(
      'crypto-meme-vs-ai-coins',
      'finance-fed-one-liner',
      'dao-founder-thread-sway',
      'tech-ai-search-habit',
    ),
  },
  {
    id: 'fed-one-liner',
    label: '一句话带崩市场',
    marketIds: buildTopicMarketIds(
      'finance-fed-one-liner',
      'crypto-meme-vs-ai-coins',
      'economy-county-consumption-upgrade',
      'geo-summit-photo-signal',
    ),
  },
  {
    id: 'hamilton-ferrari',
    label: '汉密尔顿法拉利宇宙',
    marketIds: buildTopicMarketIds(
      'sports-hamilton-ferrari-spotlight',
      'sports-messi-ronaldo-goat',
      'culture-red-carpet-over-awards',
      'rolling-one-episode-viral',
    ),
  },
  {
    id: 'short-video-politics',
    label: '短视频问政上头',
    marketIds: buildTopicMarketIds(
      'politics-short-video-turnout',
      'tech-ai-search-habit',
      'geo-summit-photo-signal',
      'surveys-friend-vs-kol',
    ),
  },
  {
    id: 'summit-photo-signal',
    label: '峰会合影比公报更有戏',
    marketIds: buildTopicMarketIds(
      'geo-summit-photo-signal',
      'politics-short-video-turnout',
      'finance-fed-one-liner',
      'culture-red-carpet-over-awards',
    ),
  },
  {
    id: 'red-carpet-wins',
    label: '红毯永远比获奖名单能打',
    marketIds: buildTopicMarketIds(
      'culture-red-carpet-over-awards',
      'culture-concert-ticket-chaos',
      'rolling-one-episode-viral',
      'sports-hamilton-ferrari-spotlight',
    ),
  },
  {
    id: 'robot-viral',
    label: '机器人视频比发布会更会火',
    marketIds: buildTopicMarketIds(
      'tech-robot-videos-viral',
      'tech-ai-search-habit',
      'rolling-one-episode-viral',
      'crypto-meme-vs-ai-coins',
    ),
  },
  {
    id: 'one-episode-viral',
    label: '一集封神瞬间',
    marketIds: buildTopicMarketIds(
      'rolling-one-episode-viral',
      'culture-red-carpet-over-awards',
      'culture-concert-ticket-chaos',
      'sports-messi-ronaldo-goat',
    ),
  },
  {
    id: 'county-consumption-upgrade',
    label: '县城消费升级',
    marketIds: buildTopicMarketIds(
      'economy-county-consumption-upgrade',
      'finance-fed-one-liner',
      'surveys-friend-vs-kol',
      'culture-concert-ticket-chaos',
    ),
  },
]

export function getLatestTopicItem(topicId: string) {
  return LATEST_TOPIC_ITEMS.find((item) => item.id === topicId)
}
