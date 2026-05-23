import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FolderOpen,
  FileClock,
  Link2,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { arenaApi, type PropositionDraftRecord } from '../features/api/arena-api'
import {
  buildDraftReferenceLink,
  buildDraftTags,
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

type DraftFormState = {
  propositionId: string | null
  title: string
  summary: string
  optionA: string
  optionB: string
  category: string
  tags: string[]
  referenceLink: string
  submissionStatus: 'draft' | 'submitted'
}

function mapCategoryLabelToApiValue(label: string) {
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
  return {
    propositionId: draft?.propositionId ?? null,
    title: draft?.title ?? '哪款 AI 搜索产品在日常使用中更有帮助？',
    summary:
      draft?.summary
      ?? '比较 Perplexity 与 ChatGPT Search 在日常信息检索、答案质量、易用性和效率方面的综合表现。选择你认为在真实使用场景中更有帮助的一款产品。',
    optionA: draft?.optionA ?? 'Perplexity',
    optionB: draft?.optionB ?? 'ChatGPT Search',
    category: draft ? formatCategoryLabel(draft.category) : 'AI / Technology',
    tags: draft ? buildDraftTags(draft) : ['AI', 'Search', 'Productivity'],
    referenceLink: buildDraftReferenceLink(),
    submissionStatus: draft?.submissionStatus === 'submitted' ? 'submitted' : 'draft',
  }
}

function ChallengeSubmitModal({
  category,
  optionA,
  optionB,
  referenceLink,
  step,
  summary,
  tags,
  title,
  onBack,
  onClose,
  onNext,
}: {
  category: string
  optionA: string
  optionB: string
  referenceLink: string
  step: SubmitModalStep | null
  summary: string
  tags: string[]
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
      description: 'Arena 当前只接受候选提交，不在前端直接创建正式市场，也不提前公开方向性信息。',
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
                    <span className="challenge-submit-pill">{category}</span>
                    <span className="challenge-submit-pill">{tags.length} 个标签</span>
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

export function ChallengePage() {
  const [searchParams] = useSearchParams()
  const selectedDraftId = searchParams.get('draft')
  const { token, isAuthenticated } = useAuthSession()
  const [draftRecord, setDraftRecord] = useState<PropositionDraftRecord | null>(null)
  const [form, setForm] = useState<DraftFormState>(() => toDraftFormState(null))
  const [submitModalStep, setSubmitModalStep] = useState<SubmitModalStep | null>(null)
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
      rewardBudget: draftRecord?.rewardBudget ?? '1000',
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
    if (submitModalStep === null) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSubmitModalStep(null)
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
  }, [submitModalStep])

  const updateForm = <K extends keyof DraftFormState>(key: K, value: DraftFormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const appendTag = () => {
    const nextTag = ['Workflow', 'Research', 'Comparison'].find((item) => !form.tags.includes(item))

    if (nextTag) {
      updateForm('tags', [...form.tags, nextTag])
    }
  }

  const removeTag = (tag: string) => {
    updateForm('tags', form.tags.filter((item) => item !== tag))
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
        rewardBudget: draftRecord?.rewardBudget ?? '1000',
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
                <p>挑战页现在不再只是前端占位。登录后会直接读取真实草稿、保存进度，并把提交写入审核链路。</p>
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
        </div>
      </div>

      <div className="challenge-layout">
        <section className="challenge-panel challenge-editor-panel" aria-label="创建候选话题">
          <div className="challenge-panel-head">
            <div>
              <h2>编辑提交稿</h2>
              <p>候选话题现在会真实写入后端草稿与提交接口，现有前端壳层保持不变。</p>
            </div>
          </div>

          {isLoadingDraft ? <p className="challenge-note"><CircleAlert size={14} />正在加载草稿...</p> : null}
          {errorMessage ? <p className="challenge-note"><CircleAlert size={14} />{errorMessage}</p> : null}

          <div className="challenge-form-grid">
            <label className="challenge-field">
              <div className="challenge-label-row">
                <span>1. 话题标题</span>
                <strong>{form.title.length} / 80</strong>
              </div>
              <input
                className="challenge-input"
                maxLength={80}
                onChange={(event) => updateForm('title', event.target.value)}
                type="text"
                value={form.title}
              />
            </label>

            <label className="challenge-field">
              <div className="challenge-label-row">
                <span>2. 话题描述</span>
                <strong>{form.summary.length} / 500</strong>
              </div>
              <textarea
                className="challenge-textarea"
                maxLength={500}
                onChange={(event) => updateForm('summary', event.target.value)}
                rows={5}
                value={form.summary}
              />
            </label>

            <div className="challenge-field">
              <div className="challenge-label-row">
                <span>3. 选项设置</span>
                <small>当前只支持二选一</small>
              </div>

              <div className="challenge-options-layout">
                <label className="challenge-option-field">
                  <span>选项 A</span>
                  <input
                    className="challenge-input"
                    onChange={(event) => updateForm('optionA', event.target.value)}
                    type="text"
                    value={form.optionA}
                  />
                </label>

                <div className="challenge-vs-badge" aria-hidden="true">VS</div>

                <label className="challenge-option-field">
                  <span>选项 B</span>
                  <input
                    className="challenge-input"
                    onChange={(event) => updateForm('optionB', event.target.value)}
                    type="text"
                    value={form.optionB}
                  />
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
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </div>
              </label>

              <div className="challenge-field">
                <div className="challenge-label-row">
                  <span>5. 标签</span>
                  <small>当前映射到 sampleConstraints 持久化</small>
                </div>
                <div className="challenge-tag-editor">
                  <div className="challenge-tag-list">
                    {form.tags.map((tag) => (
                      <button className="challenge-tag" key={tag} onClick={() => removeTag(tag)} type="button">
                        <span>{tag}</span>
                        <X size={12} />
                      </button>
                    ))}
                  </div>
                  <button className="challenge-tag-plus" onClick={appendTag} type="button" aria-label="新增标签">
                    <Plus size={15} />
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
                <p>这是审核侧会先看到的摘要层，不代表最终市场卡片。</p>
              </div>
            </div>

            <div className="challenge-preview-card">
              <div className="challenge-preview-meta">
                <span>{form.category}</span>
                <span>{form.tags.length} 个标签</span>
              </div>
              <strong>{form.title}</strong>
              <p>{form.summary}</p>
              <div className="challenge-preview-options">
                <div className="challenge-preview-option">
                  <span>选项 A</span>
                  <strong>{form.optionA}</strong>
                </div>
                <div className="challenge-preview-option">
                  <span>选项 B</span>
                  <strong>{form.optionB}</strong>
                </div>
              </div>
              <div className="challenge-preview-footer">
                <span>{form.referenceLink || '未填写补充资料链接'}</span>
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
        step={submitModalStep}
        summary={form.summary}
        tags={form.tags}
        title={form.title}
        onBack={handleSubmitModalBack}
        onClose={closeSubmitModal}
        onNext={() => void handleSubmitModalNext()}
      />
    </section>
  )
}
