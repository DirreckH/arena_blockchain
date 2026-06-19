import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ARENA_EXECUTABLE_SAMPLE_CONSTRAINTS,
  type PropositionCategory,
} from '@arena/shared'
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FolderOpen,
  FileClock,
  Link2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { arenaApi, type PropositionDraftRecord } from '../features/api/arena-api'
import { AuthRequiredBlankGate } from '../components/shared/AuthRequiredBlankGate'
import {
  buildDraftReferenceLink,
  computeDraftCompletion,
  formatCategoryLabel,
} from '../features/arena/arena-ui-mappers'
import { useAuthSession } from '../features/auth/auth-session'

const categoryOptions = [
  'General',
  'AI / Technology',
  'Sports / Competition',
  'Public Policy',
  'Consumer Research',
  'Entertainment',
] as const

const categoryDisplayLabels: Record<(typeof categoryOptions)[number], string> = {
  General: '综合',
  'AI / Technology': 'AI / 科技',
  'Sports / Competition': '体育 / 竞技',
  'Public Policy': '公共政策',
  'Consumer Research': '消费调研',
  Entertainment: '娱乐',
}

function formatCategoryDisplayLabel(label: string) {
  return categoryDisplayLabels[label as (typeof categoryOptions)[number]] ?? label
}

const sampleConstraintOptions = [
  {
    key: 'experienced_user',
    label: '资深答题人',
    description: '至少已有 3 条已审核回答记录，适合需要基本历史样本的命题。',
    group: 'Eligibility',
  },
  {
    key: 'wallet_signed',
    label: '已绑定钱包',
    description: '要求答题人已经绑定主钱包地址，适合后续奖励或链上动作需要钱包能力的任务。',
    group: 'Eligibility',
  },
  {
    key: 'high_completion',
    label: '高完成率',
    description: '优先覆盖历史完成率更稳定的人群。',
    group: 'Quality',
  },
  {
    key: 'high_quality',
    label: '高质量',
    description: '优先覆盖历史有效回答占比更高的人群。',
    group: 'Quality',
  },
  {
    key: 'low_anomaly',
    label: '低异常率',
    description: '优先覆盖异常率更低的人群。',
    group: 'Quality',
  },
  {
    key: 'stable_responder',
    label: '稳定答题人',
    description: '优先覆盖长期表现稳定的答题人。',
    group: 'Quality',
  },
  {
    key: 'risky_responder',
    label: '高风险样本',
    description: '用于明确聚焦高风险样本；系统仍会自动阻断极高风险账号。',
    group: 'Quality',
  },
  {
    key: 'interested_in_sports',
    label: '体育兴趣',
    description: '偏向历史上持续参与体育类任务的人群。',
    group: 'Interest',
  },
  {
    key: 'interested_in_ai',
    label: 'AI 兴趣',
    description: '偏向历史上持续参与 AI 类任务的人群。',
    group: 'Interest',
  },
  {
    key: 'interested_in_brand_research',
    label: '品牌调研兴趣',
    description: '偏向历史上持续参与消费与品牌研究类任务的人群。',
    group: 'Interest',
  },
  {
    key: 'interested_in_politics',
    label: '公共政策兴趣',
    description: '偏向历史上持续参与公共政策类任务的人群。',
    group: 'Interest',
  },
  {
    key: 'interested_in_entertainment',
    label: '娱乐兴趣',
    description: '偏向历史上持续参与娱乐类任务的人群。',
    group: 'Interest',
  },
] as const satisfies ReadonlyArray<{
  key: (typeof ARENA_EXECUTABLE_SAMPLE_CONSTRAINTS)[number]
  label: string
  description: string
  group: 'Eligibility' | 'Quality' | 'Interest'
}>

const sampleConstraintGroups = [
  {
    group: 'Eligibility',
    title: '资格门槛',
    description: '这些条件会直接决定候选答题人能否进入派单池。',
  },
  {
    group: 'Quality',
    title: '质量画像',
    description: '这些标签来自历史完成率、有效率与异常率等质量信号。',
  },
  {
    group: 'Interest',
    title: '兴趣画像',
    description: '这些标签来自历史参与任务的类别偏好。',
  },
] as const

type SampleConstraintGroupId = (typeof sampleConstraintGroups)[number]['group']

const reviewChecklist = [
  '标题要能在一句话里表达清楚判断对象',
  '描述里要说明比较口径、时间窗口和真实场景',
  '选项必须互斥，不能出现语义重叠',
  '链接只作为补充资料，不直接决定结论',
] as const

const reviewSteps = [
  { title: '草稿保存', detail: '可以持续补充标题、描述和补充资料。', icon: FileClock },
  { title: '平台审核', detail: '检查信息边界、公开可验证性和选项质量。', icon: ShieldCheck },
  { title: '进入候选池', detail: '通过后才可能进入裁决层任务与验证层市场。', icon: Sparkles },
] as const

const auditNotes = [
  {
    title: '信息边界',
    detail: '公开前只展示时间进度、有效样本和公开状态，不展示概率、赔率或方向性结论。',
  },
  {
    title: '公开可验证',
    detail: '补充资料只用于提供背景，不直接决定结果，最终仍以可验证事实作为审核依据。',
  },
  {
    title: '候选提交',
    detail: '当前前端只承接候选提交；审核通过后，才可能进入候选池与后续市场流程。',
  },
] as const

const modalProgressSteps = [
  { label: '提交检查', short: '01' },
  { label: '审核边界', short: '02' },
  { label: '提交完成', short: '03' },
] as const

type SubmitModalStep = 0 | 1 | 2
type RewardCurrency = 'USDC' | 'USDT'

type DraftFormState = {
  propositionId: string | null
  title: string
  summary: string
  optionA: string
  optionB: string
  category: string
  rewardBudget: string
  rewardCurrency: RewardCurrency
  tags: string[]
  referenceLink: string
  submissionStatus: 'draft' | 'submitted'
}

function parseRewardBudgetValue(value: string | null | undefined): { amount: string; currency: RewardCurrency } {
  const normalized = (value ?? '').trim()
  const match = normalized.match(/^(.+?)\s+(USDC|USDT)$/i)

  if (!match) {
    return {
      amount: normalized,
      currency: 'USDC',
    }
  }

  return {
    amount: match[1].trim(),
    currency: match[2].toUpperCase() as RewardCurrency,
  }
}

function formatRewardBudgetLabel(amount: string, currency: RewardCurrency) {
  const normalizedAmount = amount.trim()
  return normalizedAmount ? `${normalizedAmount} ${currency}` : '未填写'
}

function resolveRewardBudgetAmount(input: string, fallback: string | null | undefined) {
  const normalizedInput = input.trim()
  if (normalizedInput) {
    return normalizedInput
  }

  return parseRewardBudgetValue(fallback).amount || '1000'
}

function formatSampleConstraintLabel(value: string) {
  return sampleConstraintOptions.find((item) => item.key === value)?.label ?? value
}

function mapCategoryLabelToApiValue(label: string): PropositionCategory {
  switch (label) {
    case 'AI / Technology':
      return 'ai'
    case 'Sports / Competition':
      return 'sports'
    case 'Public Policy':
      return 'politics'
    case 'Consumer Research':
      return 'brand_research'
    case 'Entertainment':
      return 'entertainment'
    case 'General':
    default:
      return 'general'
  }
}

function toDraftFormState(draft: PropositionDraftRecord | null): DraftFormState {
  const parsedRewardBudget = parseRewardBudgetValue(draft?.rewardBudget)

  return {
    propositionId: draft?.propositionId ?? null,
    title: draft?.title ?? '',
    summary: draft?.summary ?? '',
    optionA: draft?.optionA ?? '',
    optionB: draft?.optionB ?? '',
    category: draft ? formatCategoryLabel(draft.category) : 'AI / Technology',
    rewardBudget: parsedRewardBudget.amount,
    rewardCurrency: parsedRewardBudget.currency,
    tags: draft ? [...draft.sampleConstraints] : [],
    referenceLink: buildDraftReferenceLink(),
    submissionStatus: draft?.submissionStatus === 'submitted' ? 'submitted' : 'draft',
  }
}

function ChallengeSubmitModal({
  category,
  optionA,
  optionB,
  referenceLink,
  rewardBudget,
  rewardCurrency,
  step,
  summary,
  title,
  onBack,
  onClose,
  onNext,
}: {
  category: string
  optionA: string
  optionB: string
  referenceLink: string
  rewardBudget: string
  rewardCurrency: RewardCurrency
  step: SubmitModalStep | null
  summary: string
  title: string
  onBack: () => void
  onClose: () => void
  onNext: () => void
}) {
  if (step === null) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  const stepConfig = [
    {
      eyebrow: '提交审核',
      stepLabel: '步骤 1 / 3',
      title: '提交检查',
      description: '提交前先确认标题、描述、选项和补充资料都满足候选审核的最小要求。',
      primaryLabel: '继续',
      secondaryLabel: '返回编辑',
    },
    {
      eyebrow: '审核须知',
      stepLabel: '步骤 2 / 3',
      title: '审核边界',
      description: '候选命题进入审核队列，前端不直接创建正式市场，也不提前公开方向性信息。',
      primaryLabel: '确认提交',
      secondaryLabel: '上一步',
    },
    {
      eyebrow: '提交完成',
      stepLabel: '步骤 3 / 3',
      title: '已进入审核队列',
      description: '这次提交已经写入真实后端，后续会由审核流程决定是否进入候选池。',
      primaryLabel: '我知道了',
      secondaryLabel: null,
    },
  ] as const

  const currentStep = stepConfig[step]
  const themeClassName = step === 0
    ? 'challenge-submit-dialog challenge-submit-dialog--check'
    : step === 1
      ? 'challenge-submit-dialog challenge-submit-dialog--boundary'
      : 'challenge-submit-dialog challenge-submit-dialog--success'

  return createPortal(
    <div className="challenge-submit-overlay" onClick={onClose} role="presentation">
      <section
        aria-labelledby="challenge-submit-title"
        aria-modal="true"
        className={themeClassName}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="关闭提交审核弹窗"
          className="rules-intro-close"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>

        <div className="challenge-submit-shell">
          <header className="challenge-submit-head">
            <div className="challenge-submit-hero">
              <div className="challenge-submit-hero-copy">
                <span className="challenge-submit-hero-kicker">{currentStep.eyebrow}</span>
                <strong>{currentStep.title}</strong>
                <span>{step === 0 ? '候选审核前置校验' : step === 1 ? '信息边界与审核口径' : '真实提交回执'}</span>
              </div>
              <div className="challenge-submit-hero-badge">
                {step === 0 ? '候选准备就绪' : step === 1 ? '信息边界已锁定' : '提交成功'}
              </div>
            </div>

            <div className="challenge-submit-progress" aria-label="提交审核步骤">
              {modalProgressSteps.map((progressStep, index) => {
                const state = index < step ? 'done' : index === step ? 'active' : 'upcoming'

                return (
                  <div
                    className={`challenge-submit-progress-item challenge-submit-progress-item--${state}`}
                    key={progressStep.label}
                  >
                    <span className="challenge-submit-progress-index">{progressStep.short}</span>
                    <span className="challenge-submit-progress-label">{progressStep.label}</span>
                  </div>
                )
              })}
            </div>

            <div className="challenge-submit-kicker-row">
              <span className="challenge-submit-eyebrow">{currentStep.eyebrow}</span>
              <span className="challenge-submit-step">{currentStep.stepLabel}</span>
            </div>
            <p className="challenge-submit-description" id="challenge-submit-title">{currentStep.description}</p>
          </header>

          {step === 0 ? (
            <div className="challenge-submit-stage-grid challenge-submit-stage-grid--review">
              <div className="challenge-submit-summary">
                <div className="challenge-submit-summary-top">
                  <div className="challenge-submit-summary-title">
                    <strong>{title}</strong>
                    <p>{summary}</p>
                  </div>
                  <div className="challenge-submit-pill-row">
                    <span className="challenge-submit-pill">{formatCategoryDisplayLabel(category)}</span>
                    <span className="challenge-submit-pill">赏金 {formatRewardBudgetLabel(rewardBudget, rewardCurrency)}</span>
                  </div>
                </div>
                <div className="challenge-submit-options">
                  <div className="challenge-submit-option">
                    <span>选项 A</span>
                    <strong>{optionA}</strong>
                  </div>
                  <div className="challenge-submit-option">
                    <span>选项 B</span>
                    <strong>{optionB}</strong>
                  </div>
                </div>
                <div className="challenge-submit-link-row">
                  <span>补充资料链接</span>
                  <strong>{referenceLink || '未填写'}</strong>
                </div>
              </div>

              <div className="challenge-submit-review-grid" aria-label="提交检查项">
                {reviewChecklist.map((item) => (
                  <div className="challenge-submit-review-card" key={item}>
                    <div className="challenge-submit-review-card-top">
                      <CheckCircle2 size={16} />
                      <span className="challenge-submit-review-status">已覆盖</span>
                    </div>
                    <div className="challenge-submit-review-card-copy">
                      <strong>{item}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="challenge-submit-stage-grid challenge-submit-stage-grid--boundary">
              <div className="challenge-submit-boundary-grid" aria-label="审核说明">
                {auditNotes.map((item) => (
                  <div className="challenge-submit-boundary-card" key={item.title}>
                    <div className="challenge-submit-boundary-card-top">
                      <ShieldCheck size={16} />
                      <strong>{item.title}</strong>
                    </div>
                    <span>{item.detail}</span>
                  </div>
                ))}
              </div>

              <div className="challenge-submit-flow-grid">
                {reviewSteps.map((item, index) => {
                  const Icon = item.icon

                  return (
                    <div className="challenge-submit-flow-card" key={item.title}>
                      <div className="challenge-submit-inline-flow-marker" aria-hidden="true">
                        <Icon size={16} />
                      </div>
                      <div className="challenge-submit-inline-flow-copy">
                        <strong>{index + 1}. {item.title}</strong>
                        <span>{item.detail}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="challenge-submit-success">
              <div className="challenge-submit-success-badge" aria-hidden="true">
                <CheckCircle2 size={22} />
              </div>
              <div className="challenge-submit-success-copy">
                <strong>候选命题已提交审核</strong>
                <span>提交结果已写入 Arena 后端，后续会由平台审核决定是否进入候选池。</span>
              </div>
            </div>
          ) : null}

          <footer className="challenge-submit-footer">
            {currentStep.secondaryLabel ? (
              <button className="challenge-secondary-button" onClick={onBack} type="button">
                {currentStep.secondaryLabel}
              </button>
            ) : <span />}
            <button className="challenge-primary-button challenge-submit-cta" onClick={onNext} type="button">
              {currentStep.primaryLabel}
            </button>
          </footer>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function SampleConstraintPickerModal({
  group,
  selectedTags,
  onClose,
  onToggle,
}: {
  group: (typeof sampleConstraintGroups)[number] | null
  selectedTags: string[]
  onClose: () => void
  onToggle: (constraint: (typeof ARENA_EXECUTABLE_SAMPLE_CONSTRAINTS)[number]) => void
}) {
  if (!group || typeof document === 'undefined') {
    return null
  }

  const options = sampleConstraintOptions.filter((item) => item.group === group.group)
  const selectedCount = options.filter((item) => selectedTags.includes(item.key)).length

  return createPortal(
    <div className="challenge-sample-modal-overlay" onClick={onClose} role="presentation">
      <section
        aria-labelledby="challenge-sample-modal-title"
        aria-modal="true"
        className="challenge-sample-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="关闭样本约束选择弹窗"
          className="challenge-sample-modal-close"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>

        <header className="challenge-sample-modal-head">
          <div>
            <div className="challenge-sample-modal-title-row">
              <h2 id="challenge-sample-modal-title">{group.title}</h2>
              <span className="challenge-sample-modal-count">
                已选 {selectedCount} / {options.length}
              </span>
            </div>
            <p>{group.description}</p>
          </div>
        </header>

        <div className="challenge-sample-modal-options">
          {options.map((item) => {
            const selected = selectedTags.includes(item.key)

            return (
              <button
                aria-pressed={selected}
                className={selected
                  ? 'challenge-sample-modal-option challenge-sample-modal-option--selected'
                  : 'challenge-sample-modal-option'}
                key={item.key}
                onClick={() => onToggle(item.key)}
                type="button"
              >
                <span className="challenge-sample-modal-option-check" aria-hidden="true">
                  {selected ? <CheckCircle2 size={16} /> : null}
                </span>
                <span className="challenge-sample-modal-option-copy">
                  <strong>{item.label}</strong>
                  <em>{item.key}</em>
                  <span>{item.description}</span>
                </span>
              </button>
            )
          })}
        </div>

        <footer className="challenge-sample-modal-footer">
          <button className="challenge-secondary-button" onClick={onClose} type="button">
            完成选择
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

export function ChallengePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const selectedDraftId = searchParams.get('draft')
  const { token, isAuthenticated } = useAuthSession()
  const [draftRecord, setDraftRecord] = useState<PropositionDraftRecord | null>(null)
  const [form, setForm] = useState<DraftFormState>(() => toDraftFormState(null))
  const [submitModalStep, setSubmitModalStep] = useState<SubmitModalStep | null>(null)
  const [activeSampleConstraintGroup, setActiveSampleConstraintGroup] = useState<SampleConstraintGroupId | null>(null)
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'title' | 'summary' | 'optionA' | 'optionB', string>>>({})

  const closeSampleConstraintPicker = () => {
    setActiveSampleConstraintGroup(null)
  }

  const validateForm = (): boolean => {
    const errors: typeof fieldErrors = {}
    if (!form.title.trim()) errors.title = '标题不能为空'
    else if (form.title.trim().length < 10) errors.title = '标题至少需要 10 个字符'
    if (!form.summary.trim()) errors.summary = '描述不能为空'
    else if (form.summary.trim().length < 20) errors.summary = '描述至少需要 20 个字符'
    if (!form.optionA.trim()) errors.optionA = '选项 A 不能为空'
    if (!form.optionB.trim()) errors.optionB = '选项 B 不能为空'
    if (form.optionA.trim() && form.optionB.trim() && form.optionA.trim() === form.optionB.trim()) {
      errors.optionA = '两个选项不能完全相同'
      errors.optionB = '两个选项不能完全相同'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  useEffect(() => {
    if (!selectedDraftId || !token) {
      setDraftRecord(null)
      setForm(toDraftFormState(null))
      return
    }

    let disposed = false

    void (async () => {
      setIsLoadingDraft(true)
      setErrorMessage(null)

      try {
        const draft = await arenaApi.getDraft(selectedDraftId, token)
        if (disposed) {
          return
        }

        setDraftRecord(draft)
        setForm(toDraftFormState(draft))
      } catch (error) {
        if (disposed) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : '加载草稿失败')
      } finally {
        if (!disposed) {
          setIsLoadingDraft(false)
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [selectedDraftId, token])

  const completion = useMemo(() => {
    const derivedDraft: PropositionDraftRecord = {
      propositionId: form.propositionId ?? 'draft-preview',
      title: form.title,
      summary: form.summary,
      optionA: form.optionA,
      optionB: form.optionB,
      category: mapCategoryLabelToApiValue(form.category),
      sampleConstraints: form.tags,
      minEffectiveSample: draftRecord?.minEffectiveSample ?? 3,
      minBetAmount: draftRecord?.minBetAmount ?? '10',
      minDurationSeconds: draftRecord?.minDurationSeconds ?? 60,
      maxDurationSeconds: draftRecord?.maxDurationSeconds ?? 3600,
      rewardBudget: resolveRewardBudgetAmount(form.rewardBudget, draftRecord?.rewardBudget),
      baseResponseReward: draftRecord?.baseResponseReward ?? '20',
      marketEnabled: draftRecord?.marketEnabled ?? true,
      status: 'draft',
      submissionStatus: form.submissionStatus,
      createdAt: draftRecord?.createdAt ?? new Date().toISOString(),
      updatedAt: draftRecord?.updatedAt ?? new Date().toISOString(),
      submittedAt: draftRecord?.submittedAt ?? null,
    }

    return computeDraftCompletion(derivedDraft)
  }, [draftRecord, form])

  useEffect(() => {
    if (submitModalStep === null && activeSampleConstraintGroup === null) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSubmitModalStep(null)
        setActiveSampleConstraintGroup(null)
      }
    }

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeSampleConstraintGroup, submitModalStep])

  const updateForm = <K extends keyof DraftFormState>(key: K, value: DraftFormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const toggleRewardCurrency = () => {
    updateForm('rewardCurrency', form.rewardCurrency === 'USDC' ? 'USDT' : 'USDC')
  }

  const toggleSampleConstraint = (constraint: (typeof ARENA_EXECUTABLE_SAMPLE_CONSTRAINTS)[number]) => {
    updateForm(
      'tags',
      form.tags.includes(constraint)
        ? form.tags.filter((item) => item !== constraint)
        : [...form.tags, constraint],
    )
  }

  const saveDraft = async () => {
    if (!token) {
      setErrorMessage('请先登录')
      return null
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const payload = {
        category: mapCategoryLabelToApiValue(form.category),
        title: form.title,
        summary: form.summary,
        optionA: form.optionA,
        optionB: form.optionB,
        sampleConstraints: form.tags,
        minEffectiveSample: draftRecord?.minEffectiveSample ?? 3,
        minBetAmount: draftRecord?.minBetAmount ?? '10',
        minDurationSeconds: draftRecord?.minDurationSeconds ?? 60,
        maxDurationSeconds: draftRecord?.maxDurationSeconds ?? 3600,
        rewardBudget: resolveRewardBudgetAmount(form.rewardBudget, draftRecord?.rewardBudget),
        baseResponseReward: draftRecord?.baseResponseReward ?? '20',
        marketEnabled: draftRecord?.marketEnabled ?? true,
      }

      const nextDraft = form.propositionId
        ? await arenaApi.updateDraft(form.propositionId, payload, token)
        : await arenaApi.createDraft(payload, token)

      setDraftRecord(nextDraft)
      setForm((current) => ({
        ...current,
        propositionId: nextDraft.propositionId,
        submissionStatus: nextDraft.submissionStatus === 'submitted' ? 'submitted' : 'draft',
      }))

      return nextDraft
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存草稿失败')
      return null
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveDraft = async () => {
    await saveDraft()
  }

  const closeSubmitModal = () => {
    setSubmitModalStep(null)
  }

  const handleSubmitModalBack = () => {
    if (submitModalStep === 1) {
      setSubmitModalStep(0)
      return
    }

    if (submitModalStep === 0) {
      closeSubmitModal()
    }
  }

  const openSubmitModal = () => {
    if (!validateForm()) {
      return
    }
    setSubmitModalStep(0)
  }

  const handleSubmitModalNext = async () => {
    if (submitModalStep === 0) {
      setSubmitModalStep(1)
      return
    }

    if (submitModalStep === 1) {
      const ensuredDraft = (await saveDraft()) ?? draftRecord

      if (!ensuredDraft || !token) {
        return
      }

      const submittedDraft = await arenaApi.submitDraft(ensuredDraft.propositionId, undefined, token)
      setDraftRecord(submittedDraft)
      setForm((current) => ({
        ...current,
        propositionId: submittedDraft.propositionId,
        submissionStatus: 'submitted',
      }))
      setSubmitModalStep(2)
      return
    }

    closeSubmitModal()
    navigate('/zh/submissions')
  }

  if (!isAuthenticated) {
    return <AuthRequiredBlankGate className="challenge-route" ariaLabel="挑战页面" />
  }

  if (!isAuthenticated) {
    return (
      <section className="challenge-route" aria-label="挑战页面">
        <div className="challenge-layout challenge-layout--locked">
          <section className="challenge-panel challenge-editor-panel challenge-gate-panel">
            <div className="challenge-panel-head challenge-gate-head">
              <div>
                <span className="challenge-kicker">挑战入口</span>
                <h2>请先登录</h2>
                <p>候选命题草稿与提交已接入真实后端，需要有效 Arena 会话才能保存、继续编辑并发起审核提交。</p>
              </div>
            </div>

            <div className="challenge-gate-body">
              <div className="challenge-gate-copy">
                <strong>登录后你可以继续当前候选流程</strong>
                <p>登录后可直接读取真实草稿、保存进度，并将候选提交写入审核链路。</p>
              </div>

              <div className="challenge-gate-summary" aria-label="登录后可用能力">
                <div>
                  <span>草稿能力</span>
                  <strong>继续编辑与保存</strong>
                </div>
                <div>
                  <span>提交动作</span>
                  <strong>进入真实审核流程</strong>
                </div>
                <div>
                  <span>资料要求</span>
                  <strong>标题、描述、选项、补充链接</strong>
                </div>
              </div>
            </div>

            <div className="challenge-actions challenge-actions--gate">
              <Link className="challenge-primary-button" to="/zh/drafts">先查看草稿箱</Link>
              <Link className="challenge-secondary-button" to="/zh/submissions">查看已提交命题</Link>
            </div>
          </section>

          <aside className="challenge-side-stack challenge-side-stack--locked" aria-label="挑战辅助信息">
            <section className="challenge-panel challenge-flow-panel">
              <div className="challenge-panel-head">
                <div>
                  <h2>审核流程</h2>
                  <p>登录后提交的候选命题会进入平台审核，再决定是否进入候选池。</p>
                </div>
              </div>

              <div className="challenge-flow-list">
                {reviewSteps.map((step, index) => {
                  const Icon = step.icon

                  return (
                    <div className="challenge-flow-row" key={step.title}>
                      <div className="challenge-flow-marker" aria-hidden="true">
                        <Icon size={16} />
                      </div>
                      <div className="challenge-flow-copy">
                        <strong>{index + 1}. {step.title}</strong>
                        <span>{step.detail}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="challenge-panel challenge-flow-panel">
              <div className="challenge-panel-head">
                <div>
                  <h2>提交要求</h2>
                  <p>先把判断对象和公开验证口径写清楚，再进入正式提交。</p>
                </div>
              </div>

              <div className="challenge-flow-list">
                {reviewChecklist.map((item) => (
                  <div className="challenge-flow-row" key={item}>
                    <div className="challenge-flow-marker" aria-hidden="true">
                      <CheckCircle2 size={16} />
                    </div>
                    <div className="challenge-flow-copy">
                      <strong>{item}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    )
  }

  return (
    <section className="challenge-route" aria-label="挑战页面">
      <div className="challenge-header">
        <div className="challenge-header-copy">
          <h1>提交候选话题</h1>
        </div>

        <div className="challenge-header-status">
          <Link className="challenge-progress-chip challenge-progress-chip--drafts" aria-label="进入草稿箱" to="/zh/drafts">
            <span className="challenge-progress-chip-icon" aria-hidden="true">
              <FolderOpen size={15} />
            </span>
            <strong className="challenge-progress-chip-label">草稿箱</strong>
          </Link>
          <Link className="challenge-progress-chip" aria-label="进入已提交命题" to="/zh/submissions">
            <span className="challenge-progress-chip-icon" aria-hidden="true">
              <FileClock size={15} />
            </span>
            <strong className="challenge-progress-chip-label">已提交</strong>
          </Link>
        </div>
      </div>

      <div className="challenge-layout">
        <section className="challenge-panel challenge-editor-panel" aria-label="创建候选话题">
          <div className="challenge-panel-head">
            <div>
              <h2>编辑提交稿</h2>
            </div>
          </div>

          {isLoadingDraft ? <p className="challenge-note"><CircleAlert size={14} />正在加载草稿...</p> : null}
          {errorMessage ? <p className="challenge-note"><CircleAlert size={14} />{errorMessage}</p> : null}

          <div className="challenge-form-grid">
            <label className={fieldErrors.title ? 'challenge-field challenge-field--error' : 'challenge-field'}>
              <div className="challenge-label-row">
                <span>话题标题 <span className="challenge-required" aria-label="必填">*</span></span>
                <strong>{form.title.length} / 80</strong>
              </div>
              <input
                aria-describedby={fieldErrors.title ? 'title-error' : undefined}
                aria-invalid={Boolean(fieldErrors.title)}
                className="challenge-input"
                maxLength={80}
                onChange={(event) => {
                  updateForm('title', event.target.value)
                  if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }))
                }}
                placeholder="一句话说清楚判断对象，例如：用户是否认为……"
                type="text"
                value={form.title}
              />
              {fieldErrors.title ? <span className="challenge-field-error" id="title-error" role="alert">{fieldErrors.title}</span> : null}
            </label>

            <label className={fieldErrors.summary ? 'challenge-field challenge-field--error' : 'challenge-field'}>
              <div className="challenge-label-row">
                <span>话题描述 <span className="challenge-required" aria-label="必填">*</span></span>
                <strong>{form.summary.length} / 500</strong>
              </div>
              <textarea
                aria-describedby={fieldErrors.summary ? 'summary-error' : undefined}
                aria-invalid={Boolean(fieldErrors.summary)}
                className="challenge-textarea"
                maxLength={500}
                onChange={(event) => {
                  updateForm('summary', event.target.value)
                  if (fieldErrors.summary) setFieldErrors((prev) => ({ ...prev, summary: undefined }))
                }}
                placeholder="说明比较口径、时间窗口和真实场景，20 字以上"
                rows={5}
                value={form.summary}
              />
              {fieldErrors.summary ? <span className="challenge-field-error" id="summary-error" role="alert">{fieldErrors.summary}</span> : null}
            </label>

            <div className="challenge-field">
              <div className="challenge-label-row">
                <span>选项设置 <span className="challenge-required" aria-label="必填">*</span></span>
                <small>当前只支持二选一，两个选项必须互斥</small>
              </div>

              <div className="challenge-options-layout">
                <label className={fieldErrors.optionA ? 'challenge-option-field challenge-option-field--error' : 'challenge-option-field'}>
                  <span>选项 A</span>
                  <input
                    aria-invalid={Boolean(fieldErrors.optionA)}
                    className="challenge-input"
                    onChange={(event) => {
                      updateForm('optionA', event.target.value)
                      if (fieldErrors.optionA) setFieldErrors((prev) => ({ ...prev, optionA: undefined }))
                    }}
                    placeholder="例如：是 / 改善明显"
                    type="text"
                    value={form.optionA}
                  />
                  {fieldErrors.optionA ? <span className="challenge-field-error" role="alert">{fieldErrors.optionA}</span> : null}
                </label>

                <div className="challenge-vs-badge" aria-hidden="true">VS</div>

                <label className={fieldErrors.optionB ? 'challenge-option-field challenge-option-field--error' : 'challenge-option-field'}>
                  <span>选项 B</span>
                  <input
                    aria-invalid={Boolean(fieldErrors.optionB)}
                    className="challenge-input"
                    onChange={(event) => {
                      updateForm('optionB', event.target.value)
                      if (fieldErrors.optionB) setFieldErrors((prev) => ({ ...prev, optionB: undefined }))
                    }}
                    placeholder="例如：否 / 变化不明显"
                    type="text"
                    value={form.optionB}
                  />
                  {fieldErrors.optionB ? <span className="challenge-field-error" role="alert">{fieldErrors.optionB}</span> : null}
                </label>
              </div>
            </div>

            <div className="challenge-form-row">
              <label className="challenge-field">
                <div className="challenge-label-row">
                  <span>4. 分类</span>
                </div>
                <div className="challenge-select-shell">
                  <select className="challenge-select" onChange={(event) => updateForm('category', event.target.value)} value={form.category}>
                    {categoryOptions.map((item) => (
                      <option key={item} value={item}>{formatCategoryDisplayLabel(item)}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </div>
              </label>

              <div className="challenge-field">
                <div className="challenge-label-row">
                  <span>5. 赏金</span>
                  <small>你愿意为此话题的答案支付多少赏金</small>
                </div>
                <div className="challenge-tag-editor">
                  <input
                    className="challenge-bounty-input"
                    inputMode="numeric"
                    onChange={(event) => updateForm('rewardBudget', event.target.value)}
                    placeholder="例如：500"
                    type="text"
                    value={form.rewardBudget}
                  />
                  <button className="challenge-bounty-unit-button" onClick={toggleRewardCurrency} type="button" aria-label="切换赏金单位">
                    {form.rewardCurrency}
                  </button>
                </div>
              </div>
            </div>

            <label className="challenge-field">
              <div className="challenge-label-row">
                <span>6. 补充资料链接</span>
                <small>当前仅保留前端展示，不进入后端 DTO</small>
              </div>
              <div className="challenge-link-shell">
                <Link2 size={16} />
                <input
                  className="challenge-link-input"
                  onChange={(event) => updateForm('referenceLink', event.target.value)}
                  type="text"
                  value={form.referenceLink}
                />
              </div>
            </label>

            <section className="challenge-field challenge-sample-constraint-field" aria-labelledby="challenge-sample-constraints-title">
              <div className="challenge-label-row">
                <span id="challenge-sample-constraints-title">7. 样本约束</span>
                <small>这些条件会直接发送给真实派单策略，因此只能选择当前已支持的约束。</small>
              </div>

              <div className="challenge-sample-constraint-shell">
                {sampleConstraintGroups.map((group) => {
                  const groupOptions = sampleConstraintOptions.filter((item) => item.group === group.group)
                  const selectedOptions = groupOptions.filter((item) => form.tags.includes(item.key))

                  return (
                    <button
                      aria-expanded={activeSampleConstraintGroup === group.group}
                      aria-haspopup="dialog"
                      className="challenge-sample-constraint-group"
                      key={group.group}
                      onClick={() => {
                        setActiveSampleConstraintGroup(group.group)
                      }}
                      type="button"
                    >
                      <div className="challenge-sample-constraint-group-copy">
                        <strong>{group.title}</strong>
                      </div>

                      <div className="challenge-sample-constraint-group-action">
                        <span>{selectedOptions.length > 0 ? `已选 ${selectedOptions.length} 项` : '点击选择'}</span>
                        <ChevronDown size={16} />
                      </div>

                      {selectedOptions.length > 0 ? (
                        <div className="challenge-sample-constraint-summary">
                          {selectedOptions.slice(0, 3).map((item) => (
                            <span key={item.key}>{item.label}</span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </section>
          </div>

          <div className="challenge-actions">
            <button className="challenge-secondary-button" disabled={isSaving} onClick={() => void handleSaveDraft()} type="button">
              {isSaving ? '保存中...' : '保存草稿'}
            </button>
            <button className="challenge-primary-button" disabled={isSaving} onClick={openSubmitModal} type="button">
              {form.submissionStatus === 'submitted' ? '再次提交审核' : '提交审核'}
            </button>
          </div>

          <p className="challenge-note">
            <CircleAlert size={14} />
            {form.submissionStatus === 'submitted'
              ? '当前草稿已进入真实审核提交流程。你仍可以重新打开并再次发起提交。'
              : `当前草稿完成度 ${completion}%。保存会写入真实草稿接口，提交会调用真实 submit 接口。`}
          </p>
        </section>

        <aside className="challenge-side-stack" aria-label="挑战辅助信息">
          <section className="challenge-panel challenge-preview-panel">
            <div className="challenge-panel-head">
              <div>
                <h2>提交预览</h2>
              </div>
            </div>

            <div className="challenge-preview-card">
              <div className="challenge-preview-meta">
                <span>{formatCategoryDisplayLabel(form.category)}</span>
                <span>赏金 {formatRewardBudgetLabel(form.rewardBudget, form.rewardCurrency)}</span>
              </div>
              <strong style={{ color: form.title ? undefined : 'var(--arena-text-secondary, #6b7280)', fontStyle: form.title ? 'normal' : 'italic' }}>
                {form.title || '（话题标题将在此显示）'}
              </strong>
              <p style={{ color: form.summary ? undefined : 'var(--arena-text-secondary, #6b7280)', fontStyle: form.summary ? 'normal' : 'italic' }}>
                {form.summary || '（话题描述将在此显示）'}
              </p>
              <div className="challenge-preview-options">
                <div className="challenge-preview-option">
                  <span>选项 A</span>
                  <strong style={{ color: form.optionA ? undefined : 'var(--arena-text-secondary, #6b7280)' }}>
                    {form.optionA || '待填写'}
                  </strong>
                </div>
                <div className="challenge-preview-option">
                  <span>选项 B</span>
                  <strong style={{ color: form.optionB ? undefined : 'var(--arena-text-secondary, #6b7280)' }}>
                    {form.optionB || '待填写'}
                  </strong>
                </div>
              </div>
              <div className="challenge-preview-footer">
                <span>{form.referenceLink || '未填写补充资料链接'}</span>
              </div>
              <div className="challenge-preview-constraints" aria-label="样本约束预览">
                {form.tags.length > 0 ? (
                  form.tags.map((constraint) => (
                    <span className="challenge-preview-constraint-pill" key={constraint}>
                      {formatSampleConstraintLabel(constraint)}
                      <em>{constraint}</em>
                    </span>
                  ))
                ) : (
                  <span className="challenge-preview-constraint-empty">尚未选择样本约束，将使用平台默认派单资格。</span>
                )}
              </div>
            </div>
          </section>

          <section className="challenge-panel challenge-flow-panel">
            <div className="challenge-panel-head">
              <div>
                <h2>审核流程</h2>
                <p>挑战页只承接候选提交，不承接正式市场创建。</p>
              </div>
            </div>

            <div className="challenge-flow-list">
              {reviewSteps.map((step, index) => {
                const Icon = step.icon

                return (
                  <div className="challenge-flow-row" key={step.title}>
                    <div className="challenge-flow-marker" aria-hidden="true">
                      <Icon size={16} />
                    </div>
                    <div className="challenge-flow-copy">
                      <strong>{index + 1}. {step.title}</strong>
                      <span>{step.detail}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </aside>
      </div>

      <ChallengeSubmitModal
        category={form.category}
        optionA={form.optionA}
        optionB={form.optionB}
        referenceLink={form.referenceLink}
        rewardBudget={form.rewardBudget}
        rewardCurrency={form.rewardCurrency}
        step={submitModalStep}
        summary={form.summary}
        title={form.title}
        onBack={handleSubmitModalBack}
        onClose={closeSubmitModal}
        onNext={() => void handleSubmitModalNext()}
      />
      <SampleConstraintPickerModal
        group={sampleConstraintGroups.find((group) => group.group === activeSampleConstraintGroup) ?? null}
        selectedTags={form.tags}
        onClose={closeSampleConstraintPicker}
        onToggle={toggleSampleConstraint}
      />
    </section>
  )
}
