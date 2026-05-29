import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronRight, CircleAlert, CircleCheck, Clock3, LockKeyhole, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AdjudicationTaskViewModel } from '@arena/shared'
import { RightRail } from '../components/market/RightRail'
import { AuthRequiredBlankGate } from '../components/shared/AuthRequiredBlankGate'
import { ProgressMeter } from '../components/shared/ProgressMeter'
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

const TASK_TABS: Array<{ id: TaskTabId; label: string }> = [
  { id: 'pending', label: '未进行' },
  { id: 'review', label: '待审核' },
  { id: 'done', label: '已完成' },
  { id: 'quality', label: '回答质量' },
]

function classifyTask(task: AdjudicationTaskViewModel): TaskTabId {
  if (task.rewardStatus === 'finalized' || task.rewardStatus === 'voided' || task.rewardStatus === 'reversed') {
    return 'done'
  }

  if (task.hasSubmitted && task.latestResponseStatus === 'pending_review') {
    return 'review'
  }

  if (task.latestResponseStatus && task.latestResponseStatus !== 'pending_review') {
    return 'done'
  }

  return 'pending'
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

function revealLabel(task: AdjudicationTaskViewModel) {
  return task.publicProgress.timing.deadlineAt
    ?? task.publicProgress.timing.minDurationEndsAt
    ?? '公开窗口待定'
}

export function AdjudicationPage() {
  const { token, isAuthenticated } = useAuthSession()
  const { rawMarkets, refresh: refreshMarkets } = useValidationMarketData()
  const [tasks, setTasks] = useState<AdjudicationTaskViewModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedOption, setSelectedOption] = useState<0 | 1 | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<'success' | 'error' | null>(null)
  const [activeTab, setActiveTab] = useState<TaskTabId>('pending')

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

  const leadTask = useMemo(() => pickLeadTask(tasks), [tasks])
  const marketIdByPropositionId = useMemo(() => (
    new Map(rawMarkets.map((market) => [market.propositionId, market.marketId] as const))
  ), [rawMarkets])
  const leadTaskMarketId = leadTask
    ? marketIdByPropositionId.get(leadTask.propositionId) ?? null
    : null
  const recentTasks = useMemo(
    () => tasks.filter((task) => task.taskId !== leadTask?.taskId).slice(0, 3),
    [leadTask?.taskId, tasks],
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

  const tabCounts: Record<TaskTabId, number> = useMemo(() => ({
    pending: tasksByTab.pending.length,
    review: tasksByTab.review.length,
    done: tasksByTab.done.length,
    quality: tasksByTab.quality.length,
  }), [tasksByTab])

  const tabTasks = tasksByTab[activeTab]

  useEffect(() => {
    setSelectedOption(null)
    setSubmissionMessage(null)
    setSubmissionStatus(null)
  }, [leadTask?.taskId])

  const submitCurrentTask = async () => {
    if (!leadTask || !token || selectedOption === null || leadTask.hasSubmitted) {
      return
    }

    setIsSubmitting(true)
    setSubmissionMessage(null)
    setSubmissionStatus(null)
    const startedAt = new Date().toISOString()
    const submittedAt = new Date().toISOString()

    try {
      await arenaApi.submitAdjudicationResponse(
        leadTask.taskId,
        {
          propositionId: leadTask.propositionId,
          selectedOption,
          confirmationOption: selectedOption,
          clientStartedAt: startedAt,
          clientSubmittedAt: submittedAt,
          understandingAck: true,
          submittedAt,
        },
        token,
      )
      const nextTasks = await arenaApi.listAdjudicationTasks(token)
      setTasks(nextTasks)
      setSelectedOption(null)
      setSubmissionStatus('success')
      setSubmissionMessage('已提交真实裁决回答，奖励状态会随审核进度更新。')
      await refreshMarkets()
    } catch (error) {
      setSubmissionStatus('error')
      setSubmissionMessage(error instanceof Error ? error.message : '提交裁决回答失败')
    } finally {
      setIsSubmitting(false)
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

  const topSlot = leadTask ? (
    <section className="featured-panel adjudication-highlight-panel adjudication-top-slot" aria-label="近期热门待裁决事件">
      <div className="adjudication-highlight-head">
        <div>
          <div className="adjudication-highlight-kicker">
            <Sparkles size={15} fill="currentColor" />
            <span>近期热门事件</span>
          </div>
          <h1>待你裁决</h1>
        </div>
      </div>

      <div className="featured-body adjudication-highlight-body">
        <div className="featured-copy adjudication-highlight-copy">
          {leadTaskMarketId ? (
            <Link className="featured-title-row adjudication-highlight-title" to={`/zh/event/${leadTaskMarketId}`}>
              <div>
                <h3>{leadTask.title}</h3>
              </div>
            </Link>
          ) : (
            <div className="featured-title-row adjudication-highlight-title">
              <div>
                <h3>{leadTask.title}</h3>
              </div>
            </div>
          )}

          <div className="adjudication-queue-list" aria-label="更多近期热门事件">
            {recentTasks.map((task, index) => (
              marketIdByPropositionId.get(task.propositionId) ? (
                <Link
                  className="adjudication-queue-row"
                  key={task.taskId}
                  to={`/zh/event/${marketIdByPropositionId.get(task.propositionId)}`}
                >
                  <span className="queue-rank">{String(index + 2).padStart(2, '0')}</span>
                  <div>
                    <strong>{task.title}</strong>
                  </div>
                  <ChevronRight size={18} />
                </Link>
              ) : (
                <div className="adjudication-queue-row" key={task.taskId}>
                  <span className="queue-rank">{String(index + 2).padStart(2, '0')}</span>
                  <div>
                    <strong>{task.title}</strong>
                  </div>
                  <ChevronRight size={18} />
                </div>
              )
            ))}
          </div>
        </div>

        <div className="featured-state-board adjudication-highlight-board" aria-label="待裁决事件公开进度">
          <ProgressMeter
            label="时间进度"
            detail={revealLabel(leadTask)}
            value={leadTask.publicProgress.progress.progressPercent}
          />
          <ProgressMeter
            label="有效样本"
            detail={`${leadTask.publicProgress.progress.currentEffectiveSample} / ${leadTask.publicProgress.progress.totalRequired}`}
            value={leadTask.publicProgress.progress.progressPercent}
          />

          <dl className="adjudication-highlight-facts">
            <div>
              <dt>奖励状态</dt>
              <dd>{summarizeRewardStatus(leadTask.rewardStatus)}</dd>
            </div>
            <div>
              <dt>预计耗时</dt>
              <dd>{formatCountdown(leadTask.timeRemainingSeconds)}</dd>
            </div>
            <div>
              <dt>用户状态</dt>
              <dd>{leadTask.hasSubmitted ? '已提交' : '尚未裁决'}</dd>
            </div>
          </dl>
        </div>
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
      <div className="adjudication-main">
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

        {activeTab === 'pending' && leadTask ? (
          <article className="adjudication-task-card">
            <div className="adjudication-task-head">
              <div className="task-kicker">
                <Sparkles size={15} fill="currentColor" />
                <span>今日活跃任务</span>
              </div>
              <div className="task-countdown" aria-label={`剩余时间 ${formatCountdown(leadTask.timeRemainingSeconds)}`}>
                <span>剩余时间</span>
                <strong>
                  <Clock3 size={16} />
                  {formatCountdown(leadTask.timeRemainingSeconds)}
                </strong>
              </div>
            </div>

            <h2>{leadTask.title}</h2>

            <div className="adjudication-task-tags" aria-label="任务标签">
              <span>二选一</span>
              <span>{leadTask.taskStatus}</span>
              <span>{leadTask.hasSubmitted ? '已提交' : '可回答'}</span>
            </div>

            <div className="adjudication-options" aria-label="回答选项">
              <button
                type="button"
                className={selectedOption === 0 ? 'selected' : ''}
                disabled={leadTask.hasSubmitted || isSubmitting}
                onClick={() => setSelectedOption(0)}
              >
                <span>A</span>
                {leadTask.options[0]}
              </button>
              <button
                type="button"
                className={selectedOption === 1 ? 'selected' : ''}
                disabled={leadTask.hasSubmitted || isSubmitting}
                onClick={() => setSelectedOption(1)}
              >
                <span>B</span>
                {leadTask.options[1]}
              </button>
            </div>

            <div className="adjudication-submit-row">
              <button
                className="primary-action"
                type="button"
                disabled={leadTask.hasSubmitted || isSubmitting || selectedOption === null}
                onClick={() => { void submitCurrentTask() }}
              >
                <span>{leadTask.hasSubmitted ? '本任务已提交' : isSubmitting ? '提交中' : '提交真实回答'}</span>
              </button>
              {leadTaskMarketId ? (
                <Link className="secondary-action adjudication-link-button" to={`/zh/event/${leadTaskMarketId}`}>
                  <span>查看事件详情</span>
                </Link>
              ) : null}
            </div>

            {submissionMessage ? (
              <p className={`adjudication-feedback-note${submissionStatus ? ` ${submissionStatus}` : ''}`}>
                {submissionStatus === 'success' ? <CircleCheck size={14} /> : submissionStatus === 'error' ? <CircleAlert size={14} /> : null}
                {submissionMessage}
              </p>
            ) : null}

            <p className="adjudication-boundary-note">
              <LockKeyhole size={14} />
              开奖前不可见验证正反方与领先选项
            </p>
          </article>
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
              const marketId = marketIdByPropositionId.get(task.propositionId) ?? null
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
                  {marketId ? (
                    <Link className="adjudication-card-link" to={`/zh/event/${marketId}`}>
                      查看命题详情 <ChevronRight size={14} />
                    </Link>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : null}

        {activeTab === 'done' ? (
          <div className="adjudication-list">
            {tabTasks.length === 0 ? (
              <article className="adjudication-task-card">
                <h2>暂无已完成任务</h2>
                <p>审核结束或奖励已结算的任务会显示在这里。</p>
              </article>
            ) : tabTasks.map((task) => {
              const marketId = marketIdByPropositionId.get(task.propositionId) ?? null
              const tone = rewardStatusTone(task.rewardStatus)
              return (
                <article className="adjudication-task-card adjudication-list-card" key={task.taskId}>
                  <div className="adjudication-task-head">
                    <div className="task-kicker">
                      {tone === 'positive' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                      <span>{tone === 'positive' ? '奖励已结算' : tone === 'negative' ? '奖励已失效' : '已完成'}</span>
                    </div>
                    <span className={`adjudication-review-badge ${tone}`}>
                      {reviewStatusLabel(task.latestResponseStatus)}
                    </span>
                  </div>
                  <h3>{task.title}</h3>
                  <div className="adjudication-task-tags">
                    <span>{summarizeRewardStatus(task.rewardStatus)}</span>
                    {task.rewardFinalAmount ? (
                      <span>{formatTokenAmount(task.rewardFinalAmount)} 已入账</span>
                    ) : null}
                  </div>
                  {marketId ? (
                    <Link className="adjudication-card-link" to={`/zh/event/${marketId}`}>
                      查看命题详情 <ChevronRight size={14} />
                    </Link>
                  ) : null}
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
