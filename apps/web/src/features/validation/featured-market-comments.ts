import type { FeaturedMarketComment } from './validation-market.types'

const comment = (
  id: string,
  handle: string,
  body: string,
  tone: FeaturedMarketComment['tone'],
  lane: number,
  delayMs: number,
  durationMs: number,
): FeaturedMarketComment => ({
  id,
  handle,
  body,
  tone,
  lane,
  delayMs,
  durationMs,
})

const FEATURED_MARKET_COMMENTS: Record<string, FeaturedMarketComment[]> = {
  'sports-messi-ronaldo-goat': [
    comment('comment-1', '@northstand', '梅西的比赛观感太像把难题写成标准答案了。', 'support', 0, -1200, 18000),
    comment('comment-2', '@ucl_nights', 'C 罗的巅峰压迫感和关键战故事线真的没法忽视。', 'oppose', 2, -4200, 21000),
    comment('comment-3', '@halfspacefm', '这题本质是在投“天才感”还是“征服感”。', 'meta', 1, -7600, 19500),
    comment('comment-4', '@awaydays', '如果只看让人重复回放的瞬间，我还是会把票给梅西。', 'support', 3, -9800, 22000),
  ],
  'culture-concert-ticket-chaos': [
    comment('comment-1', '@frontrow404', '每次抢票都像在参加一场全民压力测试。', 'support', 0, -800, 17600),
    comment('comment-2', '@chorusline', '舞台值不值先不说，抢票过程已经够朋友群聊聊一周了。', 'support', 2, -3600, 20800),
    comment('comment-3', '@stadiumcam', '真抢到票的人，发朋友圈的主角常常不是演出而是付款页。', 'meta', 1, -6100, 19200),
    comment('comment-4', '@vinylclub', '如果现场真的炸裂，最后还是舞台本身会赢回来。', 'oppose', 3, -9300, 21600),
  ],
  'tech-ai-search-habit': [
    comment('comment-1', '@searchtab', '我现在确实先问 AI，再去搜链接补证据。', 'support', 0, -1500, 18400),
    comment('comment-2', '@openmanytabs', '真要找靠谱来源，最后还得回传统搜索自己筛。', 'oppose', 2, -4300, 20600),
    comment('comment-3', '@promptdaily', 'AI 更像带路的人，搜索还是那个查房本的人。', 'meta', 1, -6900, 19400),
    comment('comment-4', '@nightshiftpm', '先问后查这件事一旦形成习惯，真的很难再退回去。', 'support', 3, -9800, 22000),
  ],
  'crypto-meme-vs-ai-coins': [
    comment('comment-1', '@onchainvibes', '散户真上头的时候，先跑起来的通常还是 Meme。', 'support', 0, -900, 18200),
    comment('comment-2', '@modelalpha', 'AI 币至少还有一点像未来叙事，不只是情绪烟花。', 'oppose', 2, -4200, 21000),
    comment('comment-3', '@gaswar', '这题其实在比谁更会讲一个今晚就能转发的故事。', 'meta', 1, -7000, 19600),
    comment('comment-4', '@bagholderlog', 'FOMO 来的时候，大家买的不是逻辑，是群体速度。', 'support', 3, -9800, 22400),
  ],
  'finance-fed-one-liner': [
    comment('comment-1', '@macrodesk', '点阵图能研究半天，但市场经常只记住那一句话。', 'support', 0, -1300, 18600),
    comment('comment-2', '@bondwatch', '真做判断还是得看整份材料，单句更像情绪开关。', 'oppose', 2, -4500, 21200),
    comment('comment-3', '@terminalhumor', '鲍威尔每次最贵的内容往往只有十几个字。', 'support', 1, -7600, 19800),
    comment('comment-4', '@carrytradecat', '大家嘴上说看全套，手上先交易的是语气。', 'meta', 3, -9900, 22200),
  ],
  'sports-hamilton-ferrari-spotlight': [
    comment('comment-1', '@paddockclub', '汉密尔顿穿上红衣那一刻，剧情感已经拉满了。', 'support', 0, -1000, 18000),
    comment('comment-2', '@apexsector', '如果冠军争夺突然咬住，流量还是会回到赛道本身。', 'oppose', 2, -3900, 20500),
    comment('comment-3', '@pitwallradio', '这像把顶流演员丢进老牌豪门，谁不想围观。', 'support', 1, -6400, 19200),
    comment('comment-4', '@latebraking', '现在每张照片都像预告片，竞技结果反而成了第二标题。', 'meta', 3, -9600, 21800),
  ],
  'politics-short-video-turnout': [
    comment('comment-1', '@campusfeed', '很多人根本不会看完整场辩论，但会刷到剪好的 30 秒。', 'support', 0, -1400, 18400),
    comment('comment-2', '@civicnotes', '真正改变判断的还是辩论全场的稳定表现。', 'oppose', 2, -4700, 21400),
    comment('comment-3', '@scrollthenvote', '传播效率和说服深度不是一回事，但短视频先赢了入口。', 'meta', 1, -7300, 19800),
    comment('comment-4', '@nightclassics', '年轻人讨论谁“像样”，往往先从被切出来的片段开始。', 'support', 3, -10000, 22400),
  ],
  'geo-summit-photo-signal': [
    comment('comment-1', '@summitwatch', '合影一出来，市场和社媒都会先读肢体语言。', 'support', 0, -1200, 18200),
    comment('comment-2', '@briefingroom', '真正有分量的还是公报文本，照片只是情绪封面。', 'oppose', 2, -4200, 21000),
    comment('comment-3', '@seatingchart', '站位、笑容、握手时长，围观群众真的会逐帧分析。', 'support', 1, -7100, 19600),
    comment('comment-4', '@aftermeeting', '这题像在问大家更相信“画面”还是“措辞”。', 'meta', 3, -9800, 22000),
  ],
  'culture-red-carpet-over-awards': [
    comment('comment-1', '@flashbulb', '红毯是全民开麦，获奖名单更像第二天复盘。', 'support', 0, -900, 17800),
    comment('comment-2', '@screenersociety', '真正决定行业讨论层级的还是谁拿奖。', 'oppose', 2, -4000, 20600),
    comment('comment-3', '@gowntracker', '没开奖前大家已经把造型、状态、互动聊完一轮了。', 'support', 1, -6500, 19400),
    comment('comment-4', '@acceptancespeech', '这类场合最真实的流量结论通常写在热搜词条里。', 'meta', 3, -9400, 21800),
  ],
  'tech-robot-videos-viral': [
    comment('comment-1', '@loopclip', '机器人能在 15 秒里把“未来感”直接拍到你脸上。', 'support', 0, -1100, 18100),
    comment('comment-2', '@autonomybrief', '真正改行业的还是自动驾驶发布会，不是短视频热闹。', 'oppose', 2, -4300, 20900),
    comment('comment-3', '@feedrefresh', '出圈这件事要的是可转发惊讶值，机器人太占便宜了。', 'support', 1, -6900, 19500),
    comment('comment-4', '@edgecompute', '技术含金量和传播爽感，本来就是两套评分体系。', 'meta', 3, -9700, 22100),
  ],
}

export function getFeaturedMarketComments(
  marketId: string,
): FeaturedMarketComment[] | undefined {
  const comments = FEATURED_MARKET_COMMENTS[marketId]
  return comments?.map((entry) => ({ ...entry }))
}
