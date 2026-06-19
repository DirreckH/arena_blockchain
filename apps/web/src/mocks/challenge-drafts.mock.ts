export type ChallengeDraftStatus = 'draft' | 'submitted'

export type ChallengeDraft = {
  id: string
  title: string
  summary: string
  optionA: string
  optionB: string
  category: string
  tags: string[]
  referenceLink: string
  completion: number
  status: ChallengeDraftStatus
  updatedAt: string
}

const STORAGE_KEY = 'arena.challenge.drafts'

const DEFAULT_DRAFTS: ChallengeDraft[] = [
  {
    id: 'draft-ai-search',
    title: '哪款 AI 搜索产品在日常使用中更有帮助？',
    summary: '比较 Perplexity 与 ChatGPT Search 在日常信息检索、答案质量、易用性和效率方面的综合表现。选择你认为在真实使用场景中更有帮助的一款产品。',
    optionA: 'Perplexity',
    optionB: 'ChatGPT Search',
    category: 'AI / Technology',
    tags: ['experienced_user', 'interested_in_ai'],
    referenceLink: 'https://',
    completion: 100,
    status: 'draft',
    updatedAt: '刚刚',
  },
  {
    id: 'draft-policy-housing',
    title: '未来 12 个月内，哪个公共政策方向更可能显著改善青年住房可负担性？',
    summary: '围绕保障性住房供给、租赁补贴与土地制度优化三类方向，比较哪一类政策更可能在真实城市环境中带来可验证改善。',
    optionA: '供给侧扩张',
    optionB: '需求侧补贴',
    category: 'Public Policy',
    tags: ['wallet_signed', 'interested_in_politics'],
    referenceLink: 'https://policy.example.com',
    completion: 78,
    status: 'draft',
    updatedAt: '18 分钟前',
  },
  {
    id: 'draft-consumer-payment',
    title: '哪种移动支付入口在跨境旅行中更容易被用户优先选择？',
    summary: '比较聚合钱包与银行卡直连两种方案在旅行支付便利性、接受度与失败率上的综合体验。',
    optionA: '聚合钱包',
    optionB: '银行卡直连',
    category: 'Consumer Research',
    tags: ['experienced_user', 'interested_in_brand_research'],
    referenceLink: 'https://travel.example.com',
    completion: 64,
    status: 'submitted',
    updatedAt: '今天 09:20',
  },
]

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function cloneDrafts(drafts: ChallengeDraft[]) {
  return drafts.map((draft) => ({
    ...draft,
    tags: [...draft.tags],
  }))
}

export function getChallengeDrafts(): ChallengeDraft[] {
  if (!canUseStorage()) {
    return cloneDrafts(DEFAULT_DRAFTS)
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DRAFTS))
    return cloneDrafts(DEFAULT_DRAFTS)
  }

  try {
    const parsed = JSON.parse(raw) as ChallengeDraft[]
    return Array.isArray(parsed) && parsed.length > 0 ? cloneDrafts(parsed) : cloneDrafts(DEFAULT_DRAFTS)
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DRAFTS))
    return cloneDrafts(DEFAULT_DRAFTS)
  }
}

export function saveChallengeDrafts(drafts: ChallengeDraft[]) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
}

export function upsertChallengeDraft(draft: ChallengeDraft) {
  const drafts = getChallengeDrafts()
  const nextDrafts = [draft, ...drafts.filter((item) => item.id !== draft.id)]
  saveChallengeDrafts(nextDrafts)
  return nextDrafts
}

export function removeChallengeDraft(id: string) {
  const drafts = getChallengeDrafts().filter((draft) => draft.id !== id)
  saveChallengeDrafts(drafts)
  return drafts
}

export function getChallengeDraftById(id: string) {
  return getChallengeDrafts().find((draft) => draft.id === id) ?? null
}
