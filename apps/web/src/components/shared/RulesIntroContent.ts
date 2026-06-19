import {
  VALIDATION_PRE_REVEAL_ALLOWED_FIELDS,
  VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS,
} from '../../features/arena-information-boundary'

export type RulesIntroVisualVariant = 'browse' | 'judge' | 'boundary' | 'settled'

type RulesIntroMetric = {
  label: string
  value: string
}

export type RulesIntroStep = {
  title: string
  description: string
  visualVariant: RulesIntroVisualVariant
  primaryButtonLabel: string
  eyebrow: string
  panelTitle: string
  panelNote: string
  chips: string[]
  metrics: RulesIntroMetric[]
}

const FIELD_LABELS: Record<string, string> = {
  status: '公开状态',
  timeProgressPercent: '时间进度',
  effectiveSampleProgressPercent: '有效样本进度',
  probability: '概率',
  leadingOption: '领先方向',
  responseRatio: '回答占比',
}

const visibleHighlights = VALIDATION_PRE_REVEAL_ALLOWED_FIELDS
  .filter((field) => ['status', 'timeProgressPercent', 'effectiveSampleProgressPercent'].includes(field))
  .map((field) => FIELD_LABELS[field])

const hiddenHighlights = VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS
  .filter((field) => ['probability', 'leadingOption', 'responseRatio'].includes(field))
  .map((field) => FIELD_LABELS[field])

export const RULES_INTRO_STEPS: RulesIntroStep[] = [
  {
    title: '选择一个话题市场',
    description: '先浏览命题标题、公开状态和时间窗口，确认这是你想参与判断的话题，再进入详情页查看选项。',
    visualVariant: 'browse',
    primaryButtonLabel: '下一页',
    eyebrow: '玩法 01',
    panelTitle: '从目录页进入一个公开命题',
    panelNote: '先看清楚题目、时间和是否公开，再决定要不要参与。',
    chips: ['市场公开中', '话题目录', '时间窗口'],
    metrics: [
      { label: '页面入口', value: '市场 / 发现' },
      { label: '公开状态', value: '可见' },
      { label: '查看重点', value: '命题与期限' },
    ],
  },
  {
    title: '做出你的判断',
    description: '进入命题后先阅读选项，再选择你支持的结果。连接钱包后即可提交判断或下注，并在公开后看到结算。',
    visualVariant: 'judge',
    primaryButtonLabel: '下一页',
    eyebrow: '玩法 02',
    panelTitle: '阅读选项，再做出你的判断',
    panelNote: '你会先看到选项结构和进度信息，而不是会提前暴露方向的交易型字段。',
    chips: ['阅读选项', '选择结果', '连接钱包提交'],
    metrics: [
      { label: '判断方式', value: '选择结果' },
      { label: '参与前提', value: '连接钱包' },
      { label: '提交后', value: '等待公开' },
    ],
  },
  {
    title: '结果公开前能看到什么',
    description: `公开前只展示 ${visibleHighlights.join('、')}；不会展示 ${hiddenHighlights.join('、')} 这类会提前暴露方向的信息。`,
    visualVariant: 'boundary',
    primaryButtonLabel: '下一页',
    eyebrow: '玩法 03',
    panelTitle: '公开前保持信息边界',
    panelNote: 'Arena 公开前只保留玩法判断所需的公开字段，不提前暴露趋势。',
    chips: visibleHighlights,
    metrics: [
      { label: '隐藏字段', value: hiddenHighlights[0] },
      { label: '隐藏字段', value: hiddenHighlights[1] },
      { label: '隐藏字段', value: hiddenHighlights[2] },
    ],
  },
  {
    title: '结果公开后看什么',
    description: '结果公开后再去看结算、收益、历史记录和主页。那时页面才承担复盘和对账的作用。',
    visualVariant: 'settled',
    primaryButtonLabel: '我知道了',
    eyebrow: '玩法 04',
    panelTitle: '公开后查看主页与记录',
    panelNote: '结算完成后，主页和记录区才是复盘入口。',
    chips: ['主页', '结算记录', '收益复盘'],
    metrics: [
      { label: '公开后查看', value: '结算结果' },
      { label: '公开后查看', value: '收益记录' },
      { label: '公开后查看', value: '历史明细' },
    ],
  },
]
