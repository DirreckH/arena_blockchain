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
  { label: 'DAO', href: '/zh/dao' },
  { label: '调研', href: '/zh/surveys' },
  { label: '滚动命题', href: '/zh/rolling' },
]

export const filters: NavigationItem[] = [
  { label: '全部', href: '/zh', exact: true },
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
    topicHref: '/zh/politics',
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
    topicHref: '/zh/tech',
    closeDate: '2026-05-08 开奖',
    news: [
      { source: 'Arena', age: '2 天前', headline: '滚动命题仅可展示上一期公开结果', href: '/zh/news/rolling-result-rule' },
      { source: 'Arena', age: '5 天前', headline: '有效样本进度不包含内部样本分布', href: '/zh/news/sample-progress-rule' },
    ],
  },
]

type CategorySeed = {
  id: string
  title: string
  optionA: string
  optionB: string
  image: string
  reward?: boolean
  statusLabel?: string
  phaseLabel?: string
  timeProgressLabel?: string
  timeProgressPercent?: number
  sampleProgressLabel?: string
  sampleProgressPercent?: number
}

type CategorySeedGroup = {
  category: string
  categoryHref: string
  phaseLabel: string
  timeLabelPrefix: string
  statusCycle?: string[]
}

function buildCategorySeedCards(group: CategorySeedGroup, seeds: CategorySeed[]): ArenaMarketCard[] {
  const statusCycle = group.statusCycle ?? ['采集中', '样本校验中', '观察中', '公开结果待定']

  return seeds.map((seed, index) => ({
    id: seed.id,
    href: eventHref(seed.id),
    title: seed.title,
    category: group.category,
    categoryHref: group.categoryHref,
    image: seed.image,
    statusLabel: seed.statusLabel ?? statusCycle[index % statusCycle.length],
    phaseLabel: seed.phaseLabel ?? group.phaseLabel,
    timeProgressLabel: seed.timeProgressLabel ?? `${group.timeLabelPrefix} ${index + 3} 天`,
    timeProgressPercent: seed.timeProgressPercent ?? 36 + index * 5,
    sampleProgressLabel: seed.sampleProgressLabel ?? `有效样本 ${168 + index * 17} / ${280 + index * 24}`,
    sampleProgressPercent: seed.sampleProgressPercent ?? 48 + index * 4,
    options: [
      { label: seed.optionA, caption: '选项 A' },
      { label: seed.optionB, caption: '选项 B' },
    ],
    reward: seed.reward,
  }))
}

const politicsSpotlightCards = buildCategorySeedCards(
  {
    category: '公共政策',
    categoryHref: '/zh/politics',
    phaseLabel: '公共叙事采样',
    timeLabelPrefix: '距离本轮观察截止',
    statusCycle: ['收集中', '样本校验中', '观察中', '公开结果待定'],
  },
  [
    {
      id: 'politics-short-video-turnout',
      title: '年轻选民是否会普遍认为，“短视频问政”比电视辩论更影响他们的投票印象？',
      optionA: '短视频问政更影响印象',
      optionB: '电视辩论仍更影响印象',
      image: '/arena-assets/kash-patel.jpg',
      reward: true,
    },
    {
      id: 'politics-strong-mayor-style',
      title: '城市选民是否会普遍认为，候选人的强势个人风格比政策细节更决定支持度？',
      optionA: '个人风格更决定支持度',
      optionB: '政策细节更决定支持度',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'politics-tax-cut-middle-voters',
      title: '政策观察者是否会普遍认为，“减税口号”比“增加福利”更容易打动中间选民？',
      optionA: '减税口号更容易打动',
      optionB: '增加福利更容易打动',
      image: '/arena-assets/btc.png',
    },
    {
      id: 'politics-commute-vs-housing',
      title: '通勤族是否会普遍认为，地铁票价争议比住房政策更能推高市长选战热度？',
      optionA: '地铁票价争议更能带热度',
      optionB: '住房政策更能带热度',
      image: '/arena-assets/nba.jpg',
    },
    {
      id: 'politics-podcast-trust',
      title: '公众是否会普遍认为，候选人在播客上的长访谈比辩论切片更能建立信任？',
      optionA: '播客长访谈更能建立信任',
      optionB: '辩论切片更能建立信任',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
    {
      id: 'politics-ai-regulation-spotlight',
      title: '舆论场是否会普遍认为，“AI 监管”会成为下一轮政策讨论里最容易出圈的话题？',
      optionA: '会成为最容易出圈的话题',
      optionB: '不会成为最容易出圈的话题',
      image: '/arena-assets/f1.jpg',
    },
    {
      id: 'politics-school-phone-ban',
      title: '家长群体是否会普遍认为，校园手机禁令比考试改革更容易获得支持？',
      optionA: '手机禁令更容易获得支持',
      optionB: '考试改革更容易获得支持',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'politics-safety-vs-inflation',
      title: '选民是否会普遍认为，地方治安议题比通胀叙事更能拉动实际投票动员？',
      optionA: '治安议题更能拉动动员',
      optionB: '通胀叙事更能拉动动员',
      image: '/arena-assets/kash-patel.jpg',
      reward: true,
    },
  ],
)

const sportsSpotlightCards = buildCategorySeedCards(
  {
    category: '体育结果',
    categoryHref: '/zh/sports/live',
    phaseLabel: '球迷共识采样',
    timeLabelPrefix: '距离本轮讨论封盘',
  },
  [
    {
      id: 'sports-messi-ronaldo-goat',
      title: '球迷是否会普遍认为，梅西比 C 罗更配得上现代足球 GOAT 的标签？',
      optionA: '梅西更配得上 GOAT',
      optionB: 'C 罗更配得上 GOAT',
      image: '/arena-assets/nba.jpg',
      reward: true,
    },
    {
      id: 'sports-mbappe-haaland-face',
      title: '足球迷是否会普遍认为，姆巴佩比哈兰德更像下一位全球足坛门面？',
      optionA: '姆巴佩更像全球门面',
      optionB: '哈兰德更像全球门面',
      image: '/arena-assets/f1.jpg',
    },
    {
      id: 'sports-wemby-hype-ceiling',
      title: 'NBA 观众是否会普遍认为，文班亚马的上限讨论已经超过同龄球星的历史热度？',
      optionA: '已经超过历史热度',
      optionB: '还没有超过历史热度',
      image: '/arena-assets/nba.jpg',
    },
    {
      id: 'sports-sinner-alcaraz-rivalry',
      title: '网球迷是否会普遍认为，辛纳和阿尔卡拉斯的 rivalry 已经接近新一代“费纳味道”？',
      optionA: '已经很接近新一代经典 rivalry',
      optionB: '还谈不上那种级别',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'sports-hamilton-ferrari-spotlight',
      title: 'F1 观众是否会普遍认为，汉密尔顿在法拉利的话题性已经超过冠军争夺本身？',
      optionA: '话题性已超过争冠本身',
      optionB: '争冠本身仍更重要',
      image: '/arena-assets/f1.jpg',
      reward: true,
    },
    {
      id: 'sports-esports-draw-hype',
      title: '电竞观众是否会普遍认为，世界赛抽签结果比版本更新更能带动整周讨论？',
      optionA: '抽签结果更能带动讨论',
      optionB: '版本更新更能带动讨论',
      image: '/arena-assets/ai-model.jpg',
    },
    {
      id: 'sports-penalty-drama',
      title: '足球迷是否会普遍认为，点球大战比加时绝杀更容易制造“宿命感”叙事？',
      optionA: '点球大战更有宿命感',
      optionB: '加时绝杀更有宿命感',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'sports-lakers-celtics-rivalry',
      title: '篮球迷是否会普遍认为，湖人与凯尔特人的宿敌感仍是 NBA 最强品牌叙事？',
      optionA: '仍是最强品牌叙事',
      optionB: '已经被其他叙事超过',
      image: '/arena-assets/nba.jpg',
      reward: true,
    },
  ],
)

const cryptoSpotlightCards = buildCategorySeedCards(
  {
    category: '加密观察',
    categoryHref: '/zh/crypto',
    phaseLabel: '链上情绪观察',
    timeLabelPrefix: '距离本轮样本截止',
  },
  [
    {
      id: 'crypto-meme-vs-ai-coins',
      title: '加密用户是否会普遍认为，Meme 币叙事比 AI 币叙事更能拉动新一轮散户情绪？',
      optionA: 'Meme 币更能拉动情绪',
      optionB: 'AI 币更能拉动情绪',
      image: '/arena-assets/btc.png',
      reward: true,
    },
    {
      id: 'crypto-solana-retail-story',
      title: '社区是否会普遍认为，Solana 比以太坊更像本轮最适合散户讲故事的公链？',
      optionA: 'Solana 更像散户故事主场',
      optionB: '以太坊仍更像主场',
      image: '/arena-assets/ai-model.jpg',
    },
    {
      id: 'crypto-etf-vs-onchain-yield',
      title: '观察者是否会普遍认为，比特币 ETF 的话题热度已经不如链上收益策略？',
      optionA: 'ETF 热度已不如链上收益',
      optionB: 'ETF 热度仍然更高',
      image: '/arena-assets/btc.png',
    },
    {
      id: 'crypto-stablecoin-real-adoption',
      title: '加密圈外用户是否会普遍认为，稳定币支付比 NFT 叙事更接近真实 adoption？',
      optionA: '稳定币支付更接近 adoption',
      optionB: 'NFT 叙事更接近 adoption',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'crypto-airdrop-fatigue',
      title: '撸毛用户是否会普遍认为，空投 farming 已经从机会游戏变成内卷劳动？',
      optionA: '已经更像内卷劳动',
      optionB: '仍然更像机会游戏',
      image: '/arena-assets/f1.jpg',
      reward: true,
    },
    {
      id: 'crypto-restaking-too-complex',
      title: 'DeFi 用户是否会普遍认为，再质押叙事对普通人来说已经过于复杂？',
      optionA: '已经过于复杂',
      optionB: '仍然足够易懂',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'crypto-founder-tweet-momentum',
      title: '交易员是否会普遍认为，创始人的一条推文比技术路线图更能带动短线情绪？',
      optionA: '推文更能带动短线情绪',
      optionB: '路线图更能带动短线情绪',
      image: '/arena-assets/kash-patel.jpg',
    },
    {
      id: 'crypto-ct-solana-marketing',
      title: 'Crypto Twitter 是否会普遍认为，本轮最会整活的公链营销仍然是 Solana？',
      optionA: '仍然是 Solana 最会整活',
      optionB: '已经换成其他公链',
      image: '/arena-assets/btc.png',
      reward: true,
    },
  ],
)

const techSpotlightCards = buildCategorySeedCards(
  {
    category: '科技调研',
    categoryHref: '/zh/tech',
    phaseLabel: '产品共识采样',
    timeLabelPrefix: '距离本轮采样结束',
  },
  [
    {
      id: 'tech-ai-search-habit',
      title: '重度网民是否会普遍认为，AI 搜索比传统搜索更适合“先问后查”的信息习惯？',
      optionA: 'AI 搜索更适合先问后查',
      optionB: '传统搜索仍更适合',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
    {
      id: 'tech-ai-ide-mainstream',
      title: '开发者是否会普遍认为，AI IDE 已经从加分项变成了真正的主战场？',
      optionA: '已经变成主战场',
      optionB: '还只是加分项',
      image: '/arena-assets/f1.jpg',
    },
    {
      id: 'tech-open-model-control',
      title: '开发者是否会普遍认为，开源模型的可控感比闭源模型的极致效果更有吸引力？',
      optionA: '可控感更有吸引力',
      optionB: '极致效果更有吸引力',
      image: '/arena-assets/btc.png',
    },
    {
      id: 'tech-apple-ai-expectation',
      title: '用户是否会普遍认为，苹果在 AI 上“来得晚”反而抬高了市场期待？',
      optionA: '反而抬高了期待',
      optionB: '反而消耗了期待',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'tech-robot-videos-viral',
      title: '围观者是否会普遍认为，人形机器人短视频比自动驾驶发布会更容易出圈？',
      optionA: '机器人短视频更容易出圈',
      optionB: '自动驾驶发布会更容易出圈',
      image: '/arena-assets/nba.jpg',
      reward: true,
    },
    {
      id: 'tech-wearable-ai-demand',
      title: '用户是否会普遍认为，可穿戴 AI 设备仍然没有找到真正的刚需场景？',
      optionA: '仍然没有找到刚需场景',
      optionB: '已经找到了刚需场景',
      image: '/arena-assets/kash-patel.jpg',
    },
    {
      id: 'tech-short-video-edit-tools',
      title: '创作者是否会普遍认为，短剧剪辑工具比长视频工具更值得单独付费？',
      optionA: '短剧剪辑工具更值得付费',
      optionB: '长视频工具更值得付费',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'tech-workflow-demo-influence',
      title: '开发者是否会普遍认为，看别人真实 workflow 演示比官网功能页更能决定是否试用新工具？',
      optionA: '真实 workflow 更能决定试用',
      optionB: '官网功能页更能决定试用',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
  ],
)

const geopoliticsSpotlightCards = buildCategorySeedCards(
  {
    category: '地缘事件',
    categoryHref: '/zh/geopolitics',
    phaseLabel: '国际舆情观察',
    timeLabelPrefix: '距离本轮观察收口',
  },
  [
    {
      id: 'geo-summit-photo-signal',
      title: '国际观察者是否会普遍认为，峰会合影比会后公报更能释放缓和信号？',
      optionA: '峰会合影更能释放缓和信号',
      optionB: '会后公报更能释放缓和信号',
      image: '/arena-assets/iran-meeting.jpg',
      reward: true,
    },
    {
      id: 'geo-leader-strong-remarks',
      title: '国际新闻受众是否会普遍认为，领导人的强势发言比正式文本更能左右舆论方向？',
      optionA: '强势发言更能左右舆论',
      optionB: '正式文本更能左右舆论',
      image: '/arena-assets/kash-patel.jpg',
    },
    {
      id: 'geo-shipping-risk-anxiety',
      title: '公众是否会普遍认为，航运风险话题比能源价格更能牵动地缘焦虑？',
      optionA: '航运风险更能牵动焦虑',
      optionB: '能源价格更能牵动焦虑',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'geo-sanction-symbolism',
      title: '观察者是否会普遍认为，制裁升级的象征意义已经大于执行细节本身？',
      optionA: '象征意义已经更大',
      optionB: '执行细节仍然更重要',
      image: '/arena-assets/btc.png',
    },
    {
      id: 'geo-first-response-importance',
      title: '国际新闻受众是否会普遍认为，冲突报道里“谁先表态”比表态内容本身更重要？',
      optionA: '谁先表态更重要',
      optionB: '表态内容本身更重要',
      image: '/arena-assets/f1.jpg',
      reward: true,
    },
    {
      id: 'geo-phone-call-sentiment',
      title: '围观者是否会普遍认为，元首通话消息比官员闭门会更能带来情绪反转？',
      optionA: '元首通话更能带来反转',
      optionB: '闭门会更能带来反转',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'geo-border-security-europe',
      title: '欧洲受众是否会普遍认为，边境安全议题已经压过气候议程成为更高优先级？',
      optionA: '边境安全议题优先级更高',
      optionB: '气候议程优先级仍更高',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'geo-drills-vs-trade-talks',
      title: '亚太观察者是否会普遍认为，军演新闻的传播热度高于贸易谈判消息？',
      optionA: '军演新闻热度更高',
      optionB: '贸易谈判热度更高',
      image: '/arena-assets/iran-meeting.jpg',
      reward: true,
    },
  ],
)

const financeSpotlightCards = buildCategorySeedCards(
  {
    category: '金融观察',
    categoryHref: '/zh/finance',
    phaseLabel: '市场情绪采样',
    timeLabelPrefix: '距离本轮观察结束',
  },
  [
    {
      id: 'finance-fed-one-liner',
      title: '投资者是否会普遍认为，美联储主席的一句话比整份点阵图更能带动市场情绪？',
      optionA: '一句话更能带动情绪',
      optionB: '点阵图更能带动情绪',
      image: '/arena-assets/btc.png',
      reward: true,
    },
    {
      id: 'finance-gold-safe-haven',
      title: '散户是否会普遍认为，黄金比美债更像今年的情绪避风港？',
      optionA: '黄金更像避风港',
      optionB: '美债更像避风港',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'finance-ai-earnings-night',
      title: '美股用户是否会普遍认为，AI 概念财报夜比非农数据夜更刺激？',
      optionA: 'AI 财报夜更刺激',
      optionB: '非农数据夜更刺激',
      image: '/arena-assets/ai-model.jpg',
    },
    {
      id: 'finance-oil-vs-forex-heat',
      title: '交易员是否会普遍认为，原油波动在社交平台上的话题性已经超过汇率？',
      optionA: '原油波动话题性更高',
      optionB: '汇率波动话题性更高',
      image: '/arena-assets/f1.jpg',
    },
    {
      id: 'finance-rate-cut-narrative',
      title: '投资圈是否会普遍认为，“降息交易”这四个字比实际数据更会带节奏？',
      optionA: '降息叙事更会带节奏',
      optionB: '实际数据更会带节奏',
      image: '/arena-assets/kash-patel.jpg',
      reward: true,
    },
    {
      id: 'finance-index-fund-safety',
      title: '年轻投资者是否会普遍认为，指数基金比热门个股更能带来长期安全感？',
      optionA: '指数基金更有安全感',
      optionB: '热门个股更有安全感',
      image: '/arena-assets/nba.jpg',
    },
    {
      id: 'finance-ceo-interview-confidence',
      title: '公众是否会普遍认为，银行风波时 CEO 采访比资产负债表更能影响市场信心？',
      optionA: 'CEO 采访更能影响信心',
      optionB: '资产负债表更能影响信心',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'finance-bond-king-story',
      title: '围观者是否会普遍认为，“新债王”叙事比真实收益率路径更有吸睛效果？',
      optionA: '债王叙事更吸睛',
      optionB: '收益率路径更吸睛',
      image: '/arena-assets/btc.png',
      reward: true,
    },
  ],
)

const cultureSpotlightCards = buildCategorySeedCards(
  {
    category: '文化调研',
    categoryHref: '/zh/pop-culture',
    phaseLabel: '流行文化采样',
    timeLabelPrefix: '距离本轮热度截止',
  },
  [
    {
      id: 'culture-concert-ticket-chaos',
      title: '观众是否会普遍认为，演唱会抢票难度比舞台本身更能制造社交话题？',
      optionA: '抢票难度更能制造话题',
      optionB: '舞台本身更能制造话题',
      image: '/arena-assets/nba.jpg',
      reward: true,
    },
    {
      id: 'culture-trailer-over-movie',
      title: '影迷是否会普遍认为，电影上映前的预告片讨论已经比正片口碑更热？',
      optionA: '预告片讨论更热',
      optionB: '正片口碑更热',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'culture-podcast-debut-hotsearch',
      title: '网友是否会普遍认为，流量明星的播客首秀比新专辑更容易冲上热搜？',
      optionA: '播客首秀更容易冲热搜',
      optionB: '新专辑更容易冲热搜',
      image: '/arena-assets/kash-patel.jpg',
    },
    {
      id: 'culture-cp-over-logic',
      title: '剧迷是否会普遍认为，“CP 感”比剧情逻辑更影响一部剧的传播？',
      optionA: 'CP 感更影响传播',
      optionB: '剧情逻辑更影响传播',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'culture-red-carpet-over-awards',
      title: '围观者是否会普遍认为，颁奖礼红毯比获奖名单更值得讨论？',
      optionA: '红毯更值得讨论',
      optionB: '获奖名单更值得讨论',
      image: '/arena-assets/f1.jpg',
      reward: true,
    },
    {
      id: 'culture-variety-cringe-moment',
      title: '网友是否会普遍认为，综艺里的尴尬名场面比冠军归属更有记忆点？',
      optionA: '尴尬名场面更有记忆点',
      optionB: '冠军归属更有记忆点',
      image: '/arena-assets/ai-model.jpg',
    },
    {
      id: 'culture-live-clip-remix',
      title: '音乐听众是否会普遍认为，live 现场片段比录音室版本更容易触发二创？',
      optionA: 'live 片段更容易触发二创',
      optionB: '录音室版本更容易触发二创',
      image: '/arena-assets/nba.jpg',
    },
    {
      id: 'culture-retro-filter-share',
      title: '短视频用户是否会普遍认为，复古滤镜内容比超高清大片更有分享欲？',
      optionA: '复古滤镜更有分享欲',
      optionB: '超高清大片更有分享欲',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
  ],
)

const economySpotlightCards = buildCategorySeedCards(
  {
    category: '经济观察',
    categoryHref: '/zh/economy',
    phaseLabel: '消费情绪采样',
    timeLabelPrefix: '距离本轮样本收口',
  },
  [
    {
      id: 'economy-emotional-spending',
      title: '年轻消费者是否会普遍认为，“情绪消费”比刚需消费更能解释当下的花钱冲动？',
      optionA: '情绪消费更能解释冲动',
      optionB: '刚需消费更能解释冲动',
      image: '/arena-assets/kash-patel.jpg',
      reward: true,
    },
    {
      id: 'economy-side-hustle-anxiety',
      title: '职场人是否会普遍认为，副业焦虑比裁员新闻更影响日常安全感？',
      optionA: '副业焦虑更影响安全感',
      optionB: '裁员新闻更影响安全感',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'economy-commute-cost-choice',
      title: '租房族是否会普遍认为，通勤成本比房租本身更影响居住选择？',
      optionA: '通勤成本更影响选择',
      optionB: '房租本身更影响选择',
      image: '/arena-assets/nba.jpg',
    },
    {
      id: 'economy-small-joy-recovery',
      title: '公众是否会普遍认为，“小确幸消费”会先于大件消费恢复？',
      optionA: '小确幸消费会先恢复',
      optionB: '大件消费会先恢复',
      image: '/arena-assets/f1.jpg',
    },
    {
      id: 'economy-ai-job-anxiety',
      title: '打工人是否会普遍认为，AI 替代焦虑已经超过通胀焦虑？',
      optionA: 'AI 替代焦虑更强',
      optionB: '通胀焦虑更强',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
    {
      id: 'economy-membership-retention',
      title: '消费者是否会普遍认为，折扣会员制比单次满减更能留住自己？',
      optionA: '折扣会员制更能留住人',
      optionB: '单次满减更能留住人',
      image: '/arena-assets/btc.png',
    },
    {
      id: 'economy-travel-vs-gadgets',
      title: '家庭用户是否会普遍认为，旅游预算正在挤压电子产品预算？',
      optionA: '旅游预算正在挤压电子产品',
      optionB: '并没有明显挤压',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'economy-county-consumption-upgrade',
      title: '观察者是否会普遍认为，“县城消费升级”比一线城市复苏更有话题性？',
      optionA: '县城消费升级更有话题性',
      optionB: '一线城市复苏更有话题性',
      image: '/arena-assets/kash-patel.jpg',
      reward: true,
    },
  ],
)

const daoSpotlightCards = buildCategorySeedCards(
  {
    category: 'DAO',
    categoryHref: '/zh/dao',
    phaseLabel: '治理情绪采样',
    timeLabelPrefix: '距离治理观察截止',
  },
  [
    {
      id: 'dao-founder-thread-sway',
      title: '治理参与者是否会普遍认为，创始人的一条长帖比正式提案更能改变投票氛围？',
      optionA: '长帖更能改变投票氛围',
      optionB: '正式提案更能改变投票氛围',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
    {
      id: 'dao-delegate-kolization',
      title: 'DAO 观察者是否会普遍认为，delegate 的 KOL 化正在增强而不是削弱治理参与？',
      optionA: 'KOL 化正在增强参与',
      optionB: 'KOL 化正在削弱参与',
      image: '/arena-assets/nba.jpg',
    },
    {
      id: 'dao-treasury-thread-vs-pdf',
      title: '社区成员是否会普遍认为，国库报告做成可视化线程比 PDF 更能建立信任？',
      optionA: '可视化线程更能建立信任',
      optionB: 'PDF 更能建立信任',
      image: '/arena-assets/btc.png',
    },
    {
      id: 'dao-grants-interview-weight',
      title: '活跃贡献者是否会普遍认为，Grants 面试环节比书面申请更决定项目能否过审？',
      optionA: '面试环节更决定过审',
      optionB: '书面申请更决定过审',
      image: '/arena-assets/kash-patel.jpg',
    },
    {
      id: 'dao-opposition-post-momentum',
      title: '治理论坛读者是否会普遍认为，反对意见写得好比支持意见更能带动讨论？',
      optionA: '反对意见更能带动讨论',
      optionB: '支持意见更能带动讨论',
      image: '/arena-assets/iran-meeting.jpg',
      reward: true,
    },
    {
      id: 'dao-multisig-visibility-confidence',
      title: '委托人是否会普遍认为，多签成员的公开露面频率会影响他们对 DAO 稳定性的判断？',
      optionA: '会明显影响稳定性判断',
      optionB: '不会明显影响稳定性判断',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'dao-revenue-screenshot-sentiment',
      title: '社区观察者是否会普遍认为，协议收入截图比完整财报更容易带来短线情绪提振？',
      optionA: '收入截图更容易提振情绪',
      optionB: '完整财报更容易提振情绪',
      image: '/arena-assets/f1.jpg',
    },
    {
      id: 'dao-collab-announcement-growth',
      title: '参与者是否会普遍认为，DAO 联名合作公告比路线图更新更能带来拉新效果？',
      optionA: '合作公告更能带来拉新',
      optionB: '路线图更新更能带来拉新',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
  ],
)

const surveySpotlightCards = buildCategorySeedCards(
  {
    category: '调研网络',
    categoryHref: '/zh/surveys',
    phaseLabel: '用户样本观察',
    timeLabelPrefix: '距离本轮调研截止',
  },
  [
    {
      id: 'surveys-friend-vs-kol',
      title: '消费者是否会普遍认为，朋友安利比 KOL 评测更值得相信？',
      optionA: '朋友安利更值得相信',
      optionB: 'KOL 评测更值得相信',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
    {
      id: 'surveys-seed-note-vs-ads',
      title: '数码用户是否会普遍认为，小红书种草笔记比品牌官方广告更能影响购买决定？',
      optionA: '种草笔记更能影响购买',
      optionB: '官方广告更能影响购买',
      image: '/arena-assets/kash-patel.jpg',
    },
    {
      id: 'surveys-workflow-demo-trial',
      title: '开发者是否会普遍认为，看别人 workflow 演示比看产品官网更能决定是否试用？',
      optionA: 'workflow 演示更能决定试用',
      optionB: '产品官网更能决定试用',
      image: '/arena-assets/f1.jpg',
    },
    {
      id: 'surveys-remote-tool-smoothness',
      title: '职场人是否会普遍认为，远程办公工具的“不卡顿”比“功能多”更重要？',
      optionA: '不卡顿更重要',
      optionB: '功能多更重要',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'surveys-ai-subscription-price',
      title: '学生群体是否会普遍认为，订阅制 AI 工具最难接受的是价格而不是学习成本？',
      optionA: '价格更难接受',
      optionB: '学习成本更难接受',
      image: '/arena-assets/btc.png',
      reward: true,
    },
    {
      id: 'surveys-game-update-retention',
      title: '游戏玩家是否会普遍认为，更新频率比首发品质更决定自己会不会长期留下？',
      optionA: '更新频率更决定留存',
      optionB: '首发品质更决定留存',
      image: '/arena-assets/nba.jpg',
    },
    {
      id: 'surveys-review-screenshot-trust',
      title: '旅行用户是否会普遍认为，真实评论截图比平台评分更有说服力？',
      optionA: '评论截图更有说服力',
      optionB: '平台评分更有说服力',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'surveys-easy-onboarding-retention',
      title: '用户是否会普遍认为，“无痛上手”比“功能全面”更能带来首周留存？',
      optionA: '无痛上手更能带来留存',
      optionB: '功能全面更能带来留存',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
  ],
)

const rollingSpotlightCards = buildCategorySeedCards(
  {
    category: '滚动命题',
    categoryHref: '/zh/rolling',
    phaseLabel: '滚动热度观察',
    timeLabelPrefix: '距离本轮更新',
    statusCycle: ['滚动更新', '观察中', '样本校验中', '收集中'],
  },
  [
    {
      id: 'rolling-celeb-response-drama',
      title: '今日热搜里，网友是否会普遍认为“名人回应”比事件本身更抓马？',
      optionA: '名人回应更抓马',
      optionB: '事件本身更抓马',
      image: '/arena-assets/kash-patel.jpg',
      reward: true,
    },
    {
      id: 'rolling-ai-meme-virality',
      title: '本周社交平台上，AI 生成梗图是否会被普遍认为比真人自拍更容易出圈？',
      optionA: 'AI 梗图更容易出圈',
      optionB: '真人自拍更容易出圈',
      image: '/arena-assets/ai-model.jpg',
    },
    {
      id: 'rolling-spoiler-comment-heat',
      title: '这一轮周末票房讨论中，观众是否会普遍认为“反转结局剧透”更带动评论区？',
      optionA: '剧透更带动评论区',
      optionB: '票房成绩更带动评论区',
      image: '/arena-assets/iran-meeting.jpg',
    },
    {
      id: 'rolling-postgame-interview-hype',
      title: '今日体育热榜中，球星赛后采访是否会被普遍认为比比赛数据更有传播力？',
      optionA: '赛后采访更有传播力',
      optionB: '比赛数据更有传播力',
      image: '/arena-assets/nba.jpg',
    },
    {
      id: 'rolling-launch-fail-clip',
      title: '本周科技圈讨论里，发布会翻车片段是否会被普遍认为比功能亮点更吸睛？',
      optionA: '翻车片段更吸睛',
      optionB: '功能亮点更吸睛',
      image: '/arena-assets/f1.jpg',
      reward: true,
    },
    {
      id: 'rolling-analyst-quote-mood',
      title: '每日市场热榜里，网友是否会普遍认为“分析师金句”比 K 线图更能带节奏？',
      optionA: '分析师金句更能带节奏',
      optionB: 'K 线图更能带节奏',
      image: '/arena-assets/btc.png',
    },
    {
      id: 'rolling-cold-front-sharing',
      title: '本轮出游话题中，用户是否会普遍认为“突然降温”比持续高温更值得发朋友圈？',
      optionA: '突然降温更值得发朋友圈',
      optionB: '持续高温更值得发朋友圈',
      image: '/arena-assets/iran-peace.jpg',
    },
    {
      id: 'rolling-one-episode-viral',
      title: '本周流媒体讨论里，观众是否会普遍认为“一集封神”比大结局更容易引爆安利？',
      optionA: '一集封神更容易引爆安利',
      optionB: '大结局更容易引爆安利',
      image: '/arena-assets/ai-model.jpg',
      reward: true,
    },
  ],
)

export const CATEGORY_PREPEND_MARKET_IDS: Record<string, string[]> = {
  '/zh/politics': politicsSpotlightCards.map((market) => market.id),
  '/zh/sports/live': sportsSpotlightCards.map((market) => market.id),
  '/zh/crypto': cryptoSpotlightCards.map((market) => market.id),
  '/zh/tech': techSpotlightCards.map((market) => market.id),
  '/zh/geopolitics': geopoliticsSpotlightCards.map((market) => market.id),
  '/zh/finance': financeSpotlightCards.map((market) => market.id),
  '/zh/pop-culture': cultureSpotlightCards.map((market) => market.id),
  '/zh/economy': economySpotlightCards.map((market) => market.id),
  '/zh/dao': daoSpotlightCards.map((market) => market.id),
  '/zh/surveys': surveySpotlightCards.map((market) => market.id),
  '/zh/rolling': rollingSpotlightCards.map((market) => market.id),
}

export const marketCards: ArenaMarketCard[] = [
  ...politicsSpotlightCards,
  ...sportsSpotlightCards,
  ...cryptoSpotlightCards,
  ...techSpotlightCards,
  ...geopoliticsSpotlightCards,
  ...financeSpotlightCards,
  ...cultureSpotlightCards,
  ...economySpotlightCards,
  ...daoSpotlightCards,
  ...surveySpotlightCards,
  ...rollingSpotlightCards,
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
    categoryHref: '/zh/rolling',
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
  {
    id: 'dao-voter-turnout',
    href: eventHref('dao-voter-turnout'),
    title: '活跃治理参与者是否会普遍认为，该头部 DAO 本轮提案的社区动员明显强于上轮？',
    category: 'DAO',
    categoryHref: '/zh/dao',
    image: '/arena-assets/ai-model.jpg',
    statusLabel: '采集中',
    phaseLabel: '治理观察窗口',
    timeProgressLabel: '距离观察截止 4 天',
    timeProgressPercent: 58,
    sampleProgressLabel: '有效样本 186 / 320',
    sampleProgressPercent: 58,
    options: [
      { label: '会被普遍认为动员更强', caption: '选项 A' },
      { label: '不会被普遍认为动员更强', caption: '选项 B' },
    ],
    reward: true,
  },
  {
    id: 'dao-treasury-diversification',
    href: eventHref('dao-treasury-diversification'),
    title: 'DAO 观察者是否会普遍认为，该 DAO 本季度的国库配置更偏向稳健防守而非风险扩张？',
    category: 'DAO',
    categoryHref: '/zh/dao',
    image: '/arena-assets/btc.png',
    statusLabel: '样本校验中',
    phaseLabel: '国库披露跟踪',
    timeProgressLabel: '距离季度窗口结束 18 天',
    timeProgressPercent: 36,
    sampleProgressLabel: '有效样本 224 / 420',
    sampleProgressPercent: 53,
    options: [
      { label: '会被视为更偏向稳健防守', caption: '选项 A' },
      { label: '不会被视为更偏向稳健防守', caption: '选项 B' },
    ],
  },
  {
    id: 'dao-delegate-concentration',
    href: eventHref('dao-delegate-concentration'),
    title: '委托人群体是否会普遍认为，该 DAO 的代理投票权分布正在变得更分散、更健康？',
    category: 'DAO',
    categoryHref: '/zh/dao',
    image: '/arena-assets/nba.jpg',
    statusLabel: '公开结果待定',
    phaseLabel: '委托权重监测',
    timeProgressLabel: '距离公开结果 7 天',
    timeProgressPercent: 64,
    sampleProgressLabel: '有效样本 198 / 300',
    sampleProgressPercent: 66,
    options: [
      { label: '会被普遍认为更分散健康', caption: '选项 A' },
      { label: '不会被普遍认为更分散健康', caption: '选项 B' },
    ],
    reward: true,
  },
  {
    id: 'dao-grants-approval',
    href: eventHref('dao-grants-approval'),
    title: '活跃贡献者是否会普遍认为，该 DAO Grants 计划本月对早期实验项目更友好？',
    category: 'DAO',
    categoryHref: '/zh/dao',
    image: '/arena-assets/kash-patel.jpg',
    statusLabel: '采集中',
    phaseLabel: '资助计划跟踪',
    timeProgressLabel: '距离月度统计截止 9 天',
    timeProgressPercent: 47,
    sampleProgressLabel: '有效样本 176 / 280',
    sampleProgressPercent: 63,
    options: [
      { label: '会被认为更友好', caption: '选项 A' },
      { label: '不会被认为更友好', caption: '选项 B' },
    ],
  },
  {
    id: 'dao-protocol-revenue',
    href: eventHref('dao-protocol-revenue'),
    title: '核心治理参与者是否会普遍认为，该协议型 DAO 当前收入质量足以支撑持续建设？',
    category: 'DAO',
    categoryHref: '/zh/dao',
    image: '/arena-assets/f1.jpg',
    statusLabel: '长期观察',
    phaseLabel: '协议收入复核',
    timeProgressLabel: '距离月度结算 12 天',
    timeProgressPercent: 42,
    sampleProgressLabel: '有效样本 210 / 360',
    sampleProgressPercent: 58,
    options: [
      { label: '足以支撑持续建设', caption: '选项 A' },
      { label: '仍不足以支撑持续建设', caption: '选项 B' },
    ],
  },
  {
    id: 'dao-forum-activity',
    href: eventHref('dao-forum-activity'),
    title: '社区观察者是否会普遍认为，新提案周明显带动了治理论坛的讨论热度？',
    category: 'DAO',
    categoryHref: '/zh/dao',
    image: '/arena-assets/iran-meeting.jpg',
    statusLabel: '观察中',
    phaseLabel: '论坛活跃监控',
    timeProgressLabel: '提案周统计剩余 3 天',
    timeProgressPercent: 72,
    sampleProgressLabel: '有效样本 162 / 240',
    sampleProgressPercent: 68,
    options: [
      { label: '会被认为明显带动热度', caption: '选项 A' },
      { label: '不会被认为明显带动热度', caption: '选项 B' },
    ],
  },
]

export const breakingNews: TrendingItem[] = [
  { rank: 1, href: eventHref('public-trust'), title: '公共服务响应命题进入最后样本校验窗口', statusLabel: '收集中' },
  { rank: 2, href: eventHref('regional-dialogue'), title: '区域外交会谈观察窗口等待公开结果', statusLabel: '待公开' },
  { rank: 3, href: eventHref('rolling-temperature'), title: '滚动温度命题上一期结果完成归档', statusLabel: '已归档' },
]

export const hotTopics: TrendingItem[] = [
  { rank: 1, href: '/zh/predictions/public-results', title: '公开结果', metaLabel: '结果归档' },
  { rank: 2, href: '/zh/predictions/closing-soon', title: '即将开奖', metaLabel: '即将进入窗口' },
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
  { label: '即将开奖', href: '/zh/predictions/closing-soon' },
  { label: '公开结果', href: '/zh/predictions/public-results' },
]

export const filterMoreTopics: NavigationItem[] = [
  { label: '公开结果', href: '/zh/predictions/public-results' },
  { label: '即将开奖', href: '/zh/predictions/closing-soon' },
  { label: '收藏', href: '/zh/watchlist' },
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
  '/zh/dao': 'DAO 命题',
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
