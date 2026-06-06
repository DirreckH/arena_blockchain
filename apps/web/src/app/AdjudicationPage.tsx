import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronRight, CircleAlert, Clock3, LockKeyhole, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AdjudicationTaskViewModel, PropositionCategory } from '@arena/shared'
import { RightRail } from '../components/market/RightRail'
import { AuthRequiredBlankGate } from '../components/shared/AuthRequiredBlankGate'
import { arenaApi } from '../features/api/arena-api'
import {
  formatCountdown,
  formatTokenAmount,
  formatRelativeTime,
  pickLeadTask,
  summarizeRewardStatus,
} from '../features/arena/arena-ui-mappers'
import { useAuthSession } from '../features/auth/auth-session'
import { useValidationMarketData } from '../features/validation/validation-market-data'

type TaskTabId = 'pending' | 'review' | 'done' | 'quality'
const ACTIVE_TASK_STATUSES = new Set(['assigned', 'started'])
const TASK_COOLDOWN_SECONDS = 12 * 60 * 60
const HIGHLIGHT_QUEUE_LIMIT = 10

const TASK_TABS: Array<{ id: TaskTabId; label: string }> = [
  { id: 'pending', label: '未进行' },
  { id: 'review', label: '待审核' },
  { id: 'done', label: '已结束' },
  { id: 'quality', label: '回答质量' },
]

function isActiveTask(task: AdjudicationTaskViewModel) {
  return ACTIVE_TASK_STATUSES.has(task.taskStatus)
}

function classifyTask(task: AdjudicationTaskViewModel): TaskTabId {
  if (isActiveTask(task)) {
    return 'pending'
  }

  if (task.taskStatus === 'submitted' && task.latestResponseStatus === 'pending_review') {
    return 'review'
  }

  return 'done'
}

function adjudicationCategoryLabel(category: PropositionCategory | null | undefined): string {
  switch (category) {
    case 'ai': return 'AI 命题'
    case 'sports': return '体育命题'
    case 'politics': return '公共议题'
    case 'brand_research': return '调研命题'
    case 'entertainment': return '娱乐命题'
    case 'general':
    default:
      return '综合命题'
  }
}

function reviewStatusLabel(status: string | null): string {
  switch (status) {
    case 'pending_review': return '审核中'
    case 'valid': return '有效'
    case 'partial_valid': return '部分有效'
    case 'invalid': return '无效'
    case 'fraud_suspected': return '异常'
    default: return '待提交'
  }
}

function rewardStatusTone(status: string | null): 'positive' | 'negative' | 'neutral' {
  if (status === 'finalized') return 'positive'
  if (status === 'voided' || status === 'reversed') return 'negative'
  return 'neutral'
}

function endedTaskTone(task: AdjudicationTaskViewModel): 'positive' | 'negative' | 'neutral' {
  if (task.taskStatus === 'skipped' || task.taskStatus === 'expired') {
    return 'negative'
  }

  return rewardStatusTone(task.rewardStatus)
}

function endedTaskSummaryLabel(task: AdjudicationTaskViewModel): string {
  if (task.taskStatus === 'skipped') return '已跳过'
  if (task.taskStatus === 'expired') return '已过期'
  return summarizeRewardStatus(task.rewardStatus)
}

function endedTaskBadgeLabel(task: AdjudicationTaskViewModel): string {
  if (task.taskStatus === 'skipped') return '已跳过'
  if (task.taskStatus === 'expired') return '已过期'
  return reviewStatusLabel(task.latestResponseStatus)
}

function describeEndedTaskReason(task: AdjudicationTaskViewModel): string | null {
  if (task.taskStatus === 'skipped') {
    return task.skipReason === 'user_declined'
      ? '用户主动跳过'
      : task.skipReason
  }

  if (task.taskStatus === 'expired') {
    return task.expiryReason === 'ttl_elapsed'
      ? '任务超时未完成'
      : task.expiryReason
  }

  return null
}

function resolveEndedAt(task: AdjudicationTaskViewModel): string | null {
  if (task.taskStatus === 'submitted') {
    return task.submittedAt
  }

  if (task.taskStatus === 'expired') {
    return task.expiresAt
  }

  if (task.taskStatus === 'skipped' && task.cooldownUntil) {
    return new Date(new Date(task.cooldownUntil).getTime() - TASK_COOLDOWN_SECONDS * 1000).toISOString()
  }

  return null
}

function previewPhaseLabel(phase: string | null | undefined) {
  switch (phase) {
    case 'frozen':
      return '等待公开'
    case 'revealed':
      return '结果公开中'
    case 'settled':
      return '已归档'
    case 'live':
    default:
      return '采样进行中'
  }
}

function previewTaskStatusLabel(taskStatus: string) {
  switch (taskStatus) {
    case 'started':
      return '正在作答'
    case 'submitted':
      return '已提交'
    case 'skipped':
      return '已跳过'
    case 'expired':
      return '已过期'
    case 'assigned':
    default:
      return '待处理'
  }
}

function formatScheduleLabel(isoTimestamp: string | null | undefined) {
  if (!isoTimestamp) {
    return '未公布'
  }

  const timestamp = new Date(isoTimestamp)
  if (Number.isNaN(timestamp.getTime())) {
    return '未公布'
  }

  return timestamp.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdjudicationPage() {
  const { token, isAuthenticated } = useAuthSession()
  const { rawMarkets, refresh: refreshMarkets } = useValidationMarketData()
  const [tasks, setTasks] = useState<AdjudicationTaskViewModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedOptionsByTaskId, setSelectedOptionsByTaskId] = useState<Record<string, 0 | 1>>({})
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null)
  const [skippingTaskId, setSkippingTaskId] = useState<string | null>(null)
  const [taskFeedbackById, setTaskFeedbackById] = useState<Record<string, { status: 'error'; message: string }>>({})
  const [activeTab, setActiveTab] = useState<TaskTabId>('pending')
  const [highlightPreviewTaskId, setHighlightPreviewTaskId] = useState<string | null>(null)

  const loadTasks = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthenticated || !token) {
      setTasks([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const nextTasks = await arenaApi.listAdjudicationTasks(token)
      if (signal?.aborted) return
      setTasks(nextTasks)
    } catch (error) {
      if (signal?.aborted) return
      setErrorMessage(error instanceof Error ? error.message : '加载仲裁任务失败')
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [isAuthenticated, token])

  useEffect(() => {
    const controller = new AbortController()
    void loadTasks(controller.signal)
    return () => { controller.abort() }
  }, [loadTasks])

  const activeTasks = useMemo(
    () => tasks.filter((task) => isActiveTask(task)),
    [tasks],
  )
  const leadTask = useMemo(() => pickLeadTask(activeTasks), [activeTasks])
  const recentTasks = useMemo(
    () => activeTasks.filter((task) => task.taskId !== leadTask?.taskId),
    [activeTasks, leadTask?.taskId],
  )
  const highlightQueueTasks = useMemo(
    () => (leadTask ? [leadTask, ...recentTasks] : recentTasks).slice(0, HIGHLIGHT_QUEUE_LIMIT),
    [leadTask, recentTasks],
  )
  const taskCategoryByPropositionId = useMemo(
    () => new Map(rawMarkets.map((market) => [market.propositionId, market.category] as const)),
    [rawMarkets],
  )

  const tasksByTab = useMemo(() => {
    const groups: Record<TaskTabId, AdjudicationTaskViewModel[]> = {
      pending: [],
      review: [],
      done: [],
      quality: [],
    }
    for (const task of tasks) {
      const tab = classifyTask(task)
      groups[tab].push(task)
      if (task.latestResponseStatus) {
        groups.quality.push(task)
      }
    }
    return groups
  }, [tasks])

  useEffect(() => {
    if (highlightQueueTasks.length === 0) {
      setHighlightPreviewTaskId(null)
      return
    }

    setHighlightPreviewTaskId((current) => {
      if (current && highlightQueueTasks.some((task) => task.taskId === current)) {
        return current
      }

      return highlightQueueTasks[0].taskId
    })
  }, [highlightQueueTasks])

  const tabCounts: Record<TaskTabId, number> = useMemo(() => ({
    pending: tasksByTab.pending.length,
    review: tasksByTab.review.length,
    done: tasksByTab.done.length,
    quality: tasksByTab.quality.length,
  }), [tasksByTab])

  const tabTasks = tasksByTab[activeTab]
  const highlightPreviewTask = highlightQueueTasks.find((task) => task.taskId === highlightPreviewTaskId) ?? highlightQueueTasks[0] ?? null
  const highlightPreviewTaskIndex = highlightPreviewTask
    ? highlightQueueTasks.findIndex((task) => task.taskId === highlightPreviewTask.taskId)
    : -1
  const highlightSamplePercent = highlightPreviewTask
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (highlightPreviewTask.publicProgress.progress.currentEffectiveSample
              / Math.max(1, highlightPreviewTask.publicProgress.progress.totalRequired)) * 100,
          ),
        ),
      )
    : 0
  const highlightTimePercent = highlightPreviewTask
    ? Math.max(0, Math.min(100, 100 - Math.round(highlightPreviewTask.timeRemainingSeconds / (48 * 60 * 60) * 100)))
    : 0

  const submitTask = async (task: AdjudicationTaskViewModel) => {
    const selectedOption = selectedOptionsByTaskId[task.taskId]

    if (!token || selectedOption === undefined || task.hasSubmitted) {
      return
    }

    setSubmittingTaskId(task.taskId)
    setTaskFeedbackById((current) => {
      if (!(task.taskId in current)) return current
      const next = { ...current }
      delete next[task.taskId]
      return next
    })
    const startedAt = task.startedAt ?? new Date().toISOString()
    const submittedAt = new Date().toISOString()

    try {
      if (task.taskStatus === 'assigned') {
        await arenaApi.startAdjudicationTask(
          task.taskId,
          {
            startedAt,
          },
          token,
        )
      }

      await arenaApi.submitAdjudicationResponse(
        task.taskId,
        {
          propositionId: task.propositionId,
          selectedOption,
          confirmationOption: selectedOption,
          clientStartedAt: startedAt,
          clientSubmittedAt: submittedAt,
          understandingAck: true,
          submittedAt,
        },
        token,
      )
      await loadTasks()
      setSelectedOptionsByTaskId((current) => {
        if (!(task.taskId in current)) return current
        const next = { ...current }
        delete next[task.taskId]
        return next
      })
      await refreshMarkets()
    } catch (error) {
      void loadTasks()
      setTaskFeedbackById((current) => ({
        ...current,
        [task.taskId]: {
          status: 'error',
          message: error instanceof Error ? error.message : '提交裁决回答失败',
        },
      }))
    } finally {
      setSubmittingTaskId((current) => (current === task.taskId ? null : current))
    }
  }

  const skipTask = async (task: AdjudicationTaskViewModel) => {
    if (!token || task.hasSubmitted) {
      return
    }

    setSkippingTaskId(task.taskId)
    setTaskFeedbackById((current) => {
      if (!(task.taskId in current)) return current
      const next = { ...current }
      delete next[task.taskId]
      return next
    })

    try {
      await arenaApi.skipAdjudicationTask(
        task.taskId,
        {
          skippedAt: new Date().toISOString(),
          skipReason: 'user_declined',
        },
        token,
      )
      await loadTasks()
      setSelectedOptionsByTaskId((current) => {
        if (!(task.taskId in current)) return current
        const next = { ...current }
        delete next[task.taskId]
        return next
      })
    } catch (error) {
      void loadTasks()
      setTaskFeedbackById((current) => ({
        ...current,
        [task.taskId]: {
          status: 'error',
          message: error instanceof Error ? error.message : '跳过任务失败',
        },
      }))
    } finally {
      setSkippingTaskId((current) => (current === task.taskId ? null : current))
    }
  }

  if (!isAuthenticated) {
    return <AuthRequiredBlankGate className="adjudication-route" ariaLabel="裁决" />
  }

  if (!isAuthenticated) {
    return (
      <section className="adjudication-route" aria-label="裁决层">
        <div className="adjudication-main">
          <article className="adjudication-task-card">
            <h2>请先登录</h2>
            <p>仲裁任务卡片已接入真实 `/arena/adjudication/tasks`，需要有效 Arena 会话才能读取。</p>
          </article>
        </div>
        <RightRail className="right-rail adjudication-side" />
      </section>
    )
  }

  const topSlot = leadTask && highlightPreviewTask ? (
    <section className="featured-panel adjudication-highlight-panel adjudication-top-slot" aria-label="近期热门待裁决事件">
      <div className="adjudication-highlight-head">
        <div className="adjudication-highlight-kicker">
          <Sparkles size={15} fill="currentColor" />
          <span>近期热门事件</span>
        </div>
      </div>

      <div className="featured-body adjudication-highlight-body">
        <div className="featured-copy adjudication-highlight-copy">
          <div className="adjudication-queue-list" aria-label="更多近期热门事件">
            {highlightQueueTasks.map((task, index) => (
              <Link
                className={`adjudication-queue-row${task.taskId === highlightPreviewTask.taskId ? ' active' : ''}`}
                key={task.taskId}
                to={`/zh/adjudicate/${task.taskId}`}
                title={task.title}
                aria-current={task.taskId === highlightPreviewTask.taskId ? 'true' : undefined}
                onMouseEnter={() => setHighlightPreviewTaskId(task.taskId)}
                onFocus={() => setHighlightPreviewTaskId(task.taskId)}
              >
                <span className="queue-rank">{String(index + 1).padStart(2, '0')}</span>
                <div className="adjudication-queue-row-copy">
                  <strong>{task.title}</strong>
                  <span>{adjudicationCategoryLabel(taskCategoryByPropositionId.get(task.propositionId) ?? null)}</span>
                </div>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        </div>

        <section className="featured-state-board adjudication-highlight-board" aria-label="近期热门事件详情" aria-live="polite">
          <div className="adjudication-highlight-preview-head">
            <div className="adjudication-highlight-preview-rank" aria-hidden="true" />
            <div className="adjudication-highlight-preview-copy">
              <h3>{highlightPreviewTask.title}</h3>
            </div>
          </div>

          <div className="adjudication-highlight-progress-list" aria-label="话题概况">
            <div className="adjudication-highlight-progress-card">
              <div className="adjudication-highlight-progress-row">
                <span>样本进度</span>
                <strong>
                  {highlightPreviewTask.publicProgress.progress.currentEffectiveSample}
                  /
                  {highlightPreviewTask.publicProgress.progress.totalRequired}
                </strong>
              </div>
              <div className="adjudication-highlight-progress-track" aria-hidden="true">
                <span style={{ width: `${highlightSamplePercent}%` }} />
              </div>
            </div>
            <div className="adjudication-highlight-progress-card">
              <div className="adjudication-highlight-progress-row">
                <span>剩余时间</span>
                <strong>{formatCountdown(highlightPreviewTask.timeRemainingSeconds)}</strong>
              </div>
              <div className="adjudication-highlight-progress-track time" aria-hidden="true">
                <span style={{ width: `${highlightTimePercent}%` }} />
              </div>
            </div>
          </div>

          <dl className="adjudication-highlight-facts">
            <div>
              <dt>当前阶段</dt>
              <dd>{previewPhaseLabel(highlightPreviewTask.publicProgress.publicState.phase)}</dd>
            </div>
            <div>
              <dt>任务状态</dt>
              <dd>{previewTaskStatusLabel(highlightPreviewTask.taskStatus)}</dd>
            </div>
            <div>
              <dt>公开进度</dt>
              <dd>{highlightPreviewTask.publicProgress.progress.progressPercent}%</dd>
            </div>
            <div>
              <dt>裁决截止</dt>
              <dd>{formatScheduleLabel(highlightPreviewTask.expiresAt)}</dd>
            </div>
          </dl>

          <div className="adjudication-highlight-options-shell" aria-label="命题选项">
            <div className="adjudication-highlight-options">
              <div className="adjudication-highlight-option-card">
                <span className="adjudication-highlight-option-code">A</span>
                <strong>{highlightPreviewTask.options[0]}</strong>
              </div>
              <div className="adjudication-highlight-option-card">
                <span className="adjudication-highlight-option-code">B</span>
                <strong>{highlightPreviewTask.options[1]}</strong>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  ) : (
    <article className="adjudication-task-card adjudication-top-slot">
      {isLoading ? (
        <>
          <h2>加载中</h2>
          <p>正在读取真实仲裁任务，请稍候。</p>
        </>
      ) : errorMessage ? (
        <>
          <h2>加载失败</h2>
          <p>{errorMessage}</p>
          <button
            className="secondary-action adjudication-link-button"
            type="button"
            style={{ marginTop: 12 }}
            onClick={() => { void loadTasks(undefined) }}
          >
            <span>重新加载</span>
          </button>
        </>
      ) : (
        <>
          <h2>暂无待裁决任务</h2>
          <p>当前账户下没有可领取的仲裁任务，稍后可刷新查看。</p>
        </>
      )}
    </article>
  )

  return (
    <section className="adjudication-route" aria-label="裁决层">
      {topSlot}
      <RightRail className="right-rail adjudication-side" />
      <div className={activeTab === 'pending' ? 'adjudication-main adjudication-main--pending' : 'adjudication-main'}>
        {!isLoading && !errorMessage ? (
          <div className="adjudication-tabs" aria-label="任务状态">
            {TASK_TABS.map((tab) => (
              <button
                className={tab.id === activeTab ? 'active' : ''}
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                {tabCounts[tab.id] > 0 ? (
                  <em className="tab-count">{tabCounts[tab.id]}</em>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {activeTab === 'pending' && tabTasks.length > 0 ? (
          <div className="adjudication-pending-grid">
            {tabTasks.map((task) => {
              const selectedOption = selectedOptionsByTaskId[task.taskId]
              const isSubmitting = submittingTaskId === task.taskId
              const isSkipping = skippingTaskId === task.taskId
              const isAnotherTaskBusy = (
                (submittingTaskId !== null && submittingTaskId !== task.taskId)
                || (skippingTaskId !== null && skippingTaskId !== task.taskId)
              )
              const taskFeedback = taskFeedbackById[task.taskId]
              const taskCategoryTag = adjudicationCategoryLabel(taskCategoryByPropositionId.get(task.propositionId) ?? null)

              return (
                <article className="adjudication-task-card adjudication-pending-card" key={task.taskId}>
                  <div className="adjudication-task-head">
                    <div className="task-kicker">
                      <Sparkles size={15} fill="currentColor" />
                      <span>今日活跃任务</span>
                    </div>
                    <div className="task-countdown" aria-label={`剩余时间 ${formatCountdown(task.timeRemainingSeconds)}`}>
                      <span>剩余时间</span>
                      <strong>
                        <Clock3 size={15} />
                        {formatCountdown(task.timeRemainingSeconds)}
                      </strong>
                    </div>
                  </div>

                  <div className="adjudication-pending-card-title-row">
                    <span className="adjudication-pending-card-media-placeholder" aria-hidden="true" />
                    <h3 className="adjudication-pending-card-title">{task.title}</h3>
                  </div>

                  <div className="adjudication-task-tags" aria-label="命题类型">
                    <span>{taskCategoryTag}</span>
                  </div>

                  <div className="adjudication-options" aria-label="回答选项">
                    <button
                      type="button"
                      className={selectedOption === 0 ? 'selected' : ''}
                      disabled={task.hasSubmitted || isSubmitting || isSkipping || isAnotherTaskBusy}
                      onClick={() => {
                        setSelectedOptionsByTaskId((current) => ({
                          ...current,
                          [task.taskId]: 0,
                        }))
                      }}
                    >
                      <span>A</span>
                      {task.options[0]}
                    </button>
                    <button
                      type="button"
                      className={selectedOption === 1 ? 'selected' : ''}
                      disabled={task.hasSubmitted || isSubmitting || isSkipping || isAnotherTaskBusy}
                      onClick={() => {
                        setSelectedOptionsByTaskId((current) => ({
                          ...current,
                          [task.taskId]: 1,
                        }))
                      }}
                    >
                      <span>B</span>
                      {task.options[1]}
                    </button>
                  </div>

                  <div className="adjudication-submit-row">
                    <button
                      className="primary-action"
                      type="button"
                      disabled={task.hasSubmitted || isSubmitting || isSkipping || isAnotherTaskBusy || selectedOption === undefined}
                      onClick={() => { void submitTask(task) }}
                    >
                      <span>{task.hasSubmitted ? '本任务已提交' : isSubmitting ? '提交中' : '提交真实回答'}</span>
                    </button>
                    <button
                      className="secondary-action adjudication-link-button"
                      type="button"
                      disabled={task.hasSubmitted || isSubmitting || isSkipping || isAnotherTaskBusy}
                      onClick={() => { void skipTask(task) }}
                    >
                      <span>{isSkipping ? '跳过中' : '跳过本任务'}</span>
                    </button>
                    <Link className="secondary-action adjudication-link-button" to={`/zh/adjudicate/${task.taskId}`}>
                      <span>查看命题详情</span>
                    </Link>
                  </div>

                  {taskFeedback ? (
                    <p className={`adjudication-feedback-note ${taskFeedback.status}`}>
                      <CircleAlert size={14} />
                      {taskFeedback.message}
                    </p>
                  ) : null}

                  <p className="adjudication-boundary-note">
                    <LockKeyhole size={14} />
                    开奖前不可见验证正反方与领先选项
                  </p>
                </article>
              )
            })}
          </div>
        ) : null}

        {activeTab === 'pending' && !leadTask && !isLoading ? (
          <article className="adjudication-task-card">
            <h2>暂无待回答任务</h2>
            <p>当前账户下没有可领取的仲裁任务，稍后可刷新查看。</p>
          </article>
        ) : null}

        {activeTab === 'review' ? (
          <div className="adjudication-list">
            {tabTasks.length === 0 ? (
              <article className="adjudication-task-card">
                <h2>暂无待审核任务</h2>
                <p>已提交但还在质检中的回答会显示在这里。</p>
              </article>
            ) : tabTasks.map((task) => {
              return (
                <article className="adjudication-task-card adjudication-list-card" key={task.taskId}>
                  <div className="adjudication-task-head">
                    <div className="task-kicker">
                      <Clock3 size={14} />
                      <span>质检中</span>
                    </div>
                    <span className={`adjudication-review-badge pending`}>
                      {reviewStatusLabel(task.latestResponseStatus)}
                    </span>
                  </div>
                  <h3>{task.title}</h3>
                  <div className="adjudication-task-tags">
                    <span>{summarizeRewardStatus(task.rewardStatus)}</span>
                    <span>{formatTokenAmount(task.rewardPendingAmount)} 待入账</span>
                  </div>
                  <Link className="adjudication-card-link" to={`/zh/adjudicate/${task.taskId}`}>
                    查看命题详情 <ChevronRight size={14} />
                  </Link>
                </article>
              )
            })}
          </div>
        ) : null}

        {activeTab === 'done' ? (
          <div className="adjudication-list">
            {tabTasks.length === 0 ? (
              <article className="adjudication-task-card">
                <h2>暂无已结束任务</h2>
                <p>已提交完成、已跳过或已超时的任务会显示在这里。</p>
              </article>
            ) : tabTasks.map((task) => {
              const tone = endedTaskTone(task)
              const endedAt = resolveEndedAt(task)
              const endedReason = describeEndedTaskReason(task)
              return (
                <article className="adjudication-task-card adjudication-list-card" key={task.taskId}>
                  <div className="adjudication-task-head">
                    <div className="task-kicker">
                      {tone === 'positive' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                      <span>{tone === 'positive' ? '奖励已结算' : tone === 'negative' ? endedTaskSummaryLabel(task) : '已结束'}</span>
                    </div>
                    <span className={`adjudication-review-badge ${tone}`}>
                      {endedTaskBadgeLabel(task)}
                    </span>
                  </div>
                  <h3>{task.title}</h3>
                  <div className="adjudication-task-tags">
                    <span>{endedTaskSummaryLabel(task)}</span>
                    {endedAt ? (
                      <span>结束于 {formatRelativeTime(endedAt)}</span>
                    ) : null}
                    {task.cooldownUntil ? (
                      <span>冷却到 {formatRelativeTime(task.cooldownUntil)}</span>
                    ) : null}
                    {task.rewardFinalAmount ? (
                      <span>{formatTokenAmount(task.rewardFinalAmount)} 已入账</span>
                    ) : null}
                  </div>
                  {endedReason ? (
                    <p className="adjudication-feedback-note error">
                      <CircleAlert size={14} />
                      结束原因：{endedReason}
                    </p>
                  ) : null}
                  <Link className="adjudication-card-link" to={`/zh/adjudicate/${task.taskId}`}>
                    查看命题详情 <ChevronRight size={14} />
                  </Link>
                </article>
              )
            })}
          </div>
        ) : null}

        {activeTab === 'quality' ? (
          <div className="adjudication-list">
            {tabTasks.length === 0 ? (
              <article className="adjudication-task-card">
                <h2>暂无质检记录</h2>
                <p>有质检结果的回答会在这里展示，帮你了解回答质量趋势。</p>
              </article>
            ) : (
              <>
                <article className="adjudication-task-card adjudication-quality-summary">
                  <h3>回答质量概览</h3>
                  <div className="adjudication-quality-stats">
                    <div>
                      <strong>{tabTasks.filter((t) => t.latestResponseStatus === 'valid').length}</strong>
                      <span>有效</span>
                    </div>
                    <div>
                      <strong>{tabTasks.filter((t) => t.latestResponseStatus === 'partial_valid').length}</strong>
                      <span>部分有效</span>
                    </div>
                    <div>
                      <strong>{tabTasks.filter((t) => t.latestResponseStatus === 'invalid').length}</strong>
                      <span>无效</span>
                    </div>
                    <div>
                      <strong>{tabTasks.filter((t) => t.latestResponseStatus === 'pending_review').length}</strong>
                      <span>审核中</span>
                    </div>
                  </div>
                  <p className="adjudication-quality-note">质检结果由平台审核，有效样本贡献信誉与奖励资格。</p>
                </article>
                {tabTasks.map((task) => (
                  <article className="adjudication-task-card adjudication-list-card" key={`quality-${task.taskId}`}>
                    <div className="adjudication-task-head">
                      <span className="task-date">
                        {task.publicProgress.timing.minDurationEndsAt
                          ? formatRelativeTime(task.publicProgress.timing.minDurationEndsAt)
                          : '时间未知'}
                      </span>
                      <span className={`adjudication-review-badge ${task.latestResponseStatus === 'valid' || task.latestResponseStatus === 'partial_valid' ? 'positive' : task.latestResponseStatus === 'invalid' || task.latestResponseStatus === 'fraud_suspected' ? 'negative' : 'neutral'}`}>
                        {reviewStatusLabel(task.latestResponseStatus)}
                      </span>
                    </div>
                    <h3>{task.title}</h3>
                    <div className="adjudication-task-tags">
                      <span>{summarizeRewardStatus(task.rewardStatus)}</span>
                    </div>
                  </article>
                ))}
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
