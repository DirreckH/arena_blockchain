import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Clock3, LockKeyhole, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AdjudicationTaskViewModel } from '@arena/shared'
import { RightRail } from '../components/market/RightRail'
import { ProgressMeter } from '../components/shared/ProgressMeter'
import { arenaApi } from '../features/api/arena-api'
import {
  formatCountdown,
  formatTokenAmount,
  pickLeadTask,
  summarizeRewardStatus,
} from '../features/arena/arena-ui-mappers'
import { useAuthSession } from '../features/auth/auth-session'
import { useValidationMarketData } from '../features/validation/validation-market-data'

const taskTabs = [
  { label: '未进行', active: true },
  { label: '待审核' },
  { label: '已完成' },
  { label: '回答质量' },
]

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

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setTasks([])
      setIsLoading(false)
      return
    }

    let disposed = false

    void (async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const nextTasks = await arenaApi.listAdjudicationTasks(token)
        if (disposed) {
          return
        }

        setTasks(nextTasks)
      } catch (error) {
        if (disposed) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : '加载仲裁任务失败')
      } finally {
        if (!disposed) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [isAuthenticated, token])

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

  useEffect(() => {
    setSelectedOption(null)
    setSubmissionMessage(null)
  }, [leadTask?.taskId])

  const submitCurrentTask = async () => {
    if (!leadTask || !token || selectedOption === null || leadTask.hasSubmitted) {
      return
    }

    setIsSubmitting(true)
    setSubmissionMessage(null)
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
      setSubmissionMessage('已提交真实裁决回答，奖励状态会随审核进度更新。')
      await refreshMarkets()
    } catch (error) {
      setSubmissionMessage(error instanceof Error ? error.message : '提交裁决回答失败')
    } finally {
      setIsSubmitting(false)
    }
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

  return (
    <section className="adjudication-route" aria-label="裁决层">
      <div className="adjudication-main">
        {leadTask ? (
          <section className="featured-panel adjudication-highlight-panel" aria-label="近期热门待裁决事件">
            <div className="adjudication-highlight-head">
              <div>
                <div className="adjudication-highlight-kicker">
                  <Sparkles size={15} fill="currentColor" />
                  <span>近期热门事件</span>
                </div>
                <h1>待你裁决</h1>
                <p>这里展示你尚未完成的真实裁决任务，只保留公开进度、状态与样本门槛。</p>
              </div>

              <div className="adjudication-highlight-count" aria-label={`待裁决任务 ${tasks.length} 个`}>
                <strong>{tasks.length}</strong>
                <span>待裁决任务</span>
              </div>
            </div>

            <div className="featured-body adjudication-highlight-body">
              <div className="featured-copy adjudication-highlight-copy">
                {leadTaskMarketId ? (
                  <Link className="featured-title-row adjudication-highlight-title" to={`/zh/event/${leadTaskMarketId}`}>
                    <div>
                      <div className="eyebrow">{leadTask.propositionStatus} 路 仲裁任务</div>
                      <h3>{leadTask.title}</h3>
                    </div>
                  </Link>
                ) : (
                  <div className="featured-title-row adjudication-highlight-title">
                    <div>
                      <div className="eyebrow">{leadTask.propositionStatus} 路 仲裁任务</div>
                      <h3>{leadTask.title}</h3>
                    </div>
                  </div>
                )}

                <div className="adjudication-highlight-tags" aria-label="待裁决事件标签">
                  <span>{leadTask.hasSubmitted ? '已提交回答' : '尚未裁决'}</span>
                  <span>{formatCountdown(leadTask.timeRemainingSeconds)}</span>
                  <span>{formatTokenAmount(leadTask.rewardPendingAmount)}</span>
                </div>

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
                          <small>{task.taskStatus} 路 {summarizeRewardStatus(task.rewardStatus)}</small>
                        </div>
                        <ChevronRight size={18} />
                      </Link>
                    ) : (
                      <div className="adjudication-queue-row" key={task.taskId}>
                        <span className="queue-rank">{String(index + 2).padStart(2, '0')}</span>
                        <div>
                          <strong>{task.title}</strong>
                          <small>{task.taskStatus} 路 {summarizeRewardStatus(task.rewardStatus)}</small>
                        </div>
                        <ChevronRight size={18} />
                      </div>
                    )
                  ))}
                </div>
              </div>

              <div className="featured-state-board adjudication-highlight-board" aria-label="待裁决事件公开进度">
                <span className="status-pill">待你裁决</span>
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

                <p className="boundary-note">这里只展示公开状态、时间进度和有效样本进度，不展示当前方向。</p>
              </div>
            </div>
          </section>
        ) : (
          <article className="adjudication-task-card">
            <h2>{isLoading ? '加载中' : errorMessage ? '加载失败' : '暂无任务'}</h2>
            <p>{isLoading ? '正在读取真实仲裁任务。' : errorMessage ?? '当前账户下没有可领取的仲裁任务。'}</p>
          </article>
        )}

        <div className="adjudication-tabs" aria-label="任务状态">
          {taskTabs.map((tab) => (
            <button className={tab.active ? 'active' : ''} type="button" key={tab.label}>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {leadTask ? (
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
                onClick={() => {
                  void submitCurrentTask()
                }}
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
              <p className="adjudication-feedback-note">{submissionMessage}</p>
            ) : null}

            <p className="adjudication-boundary-note">
              <LockKeyhole size={14} />
              开奖前不可见验证正反方与领先选项
            </p>
          </article>
        ) : null}
      </div>

      <RightRail className="right-rail adjudication-side" />
    </section>
  )
}
