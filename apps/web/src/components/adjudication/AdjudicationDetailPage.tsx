import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, CircleAlert, CircleCheck, Clock3, LockKeyhole, Sparkles } from 'lucide-react'
import type { AdjudicationTaskViewModel } from '@arena/shared'
import { AuthRequiredBlankGate } from '../shared/AuthRequiredBlankGate'
import { ProgressMeter } from '../shared/ProgressMeter'
import { NotFoundPage } from '../shared/NotFoundPage'
import { arenaApi } from '../../features/api/arena-api'
import {
  formatCountdown,
  formatTokenAmount,
  summarizeRewardStatus,
} from '../../features/arena/arena-ui-mappers'
import { useAuthSession } from '../../features/auth/auth-session'

function revealLabel(task: AdjudicationTaskViewModel) {
  return task.publicProgress.timing.deadlineAt
    ?? task.publicProgress.timing.minDurationEndsAt
    ?? '公开窗口待定'
}

export function AdjudicationDetailPage() {
  const { taskId } = useParams()
  const { token, isAuthenticated } = useAuthSession()
  const [task, setTask] = useState<AdjudicationTaskViewModel | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedOption, setSelectedOption] = useState<0 | 1 | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<'success' | 'error' | null>(null)

  const loadTask = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthenticated || !token || !taskId) {
      setTask(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const tasks = await arenaApi.listAdjudicationTasks(token)
      if (signal?.aborted) return
      setTask(tasks.find((entry) => entry.taskId === taskId) ?? null)
    } catch (error) {
      if (signal?.aborted) return
      setErrorMessage(error instanceof Error ? error.message : '加载裁决任务失败')
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [isAuthenticated, token, taskId])

  useEffect(() => {
    const controller = new AbortController()
    void loadTask(controller.signal)
    return () => { controller.abort() }
  }, [loadTask])

  useEffect(() => {
    setSelectedOption(null)
    setSubmissionMessage(null)
    setSubmissionStatus(null)
  }, [taskId])

  const tags = useMemo(() => {
    if (!task) {
      return []
    }

    return ['二选一', task.taskStatus, task.hasSubmitted ? '已提交' : '可裁决']
  }, [task])

  const submitTask = async () => {
    if (!task || !token || selectedOption === null || task.hasSubmitted) {
      return
    }

    setIsSubmitting(true)
    setSubmissionMessage(null)
    setSubmissionStatus(null)
    const startedAt = new Date().toISOString()
    const submittedAt = new Date().toISOString()

    try {
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
      await loadTask()
      setSelectedOption(null)
      setSubmissionStatus('success')
      setSubmissionMessage('已提交真实裁决回答，奖励状态会随审核进度更新。')
    } catch (error) {
      setSubmissionStatus('error')
      setSubmissionMessage(error instanceof Error ? error.message : '提交裁决回答失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAuthenticated) {
    return <AuthRequiredBlankGate className="adjudication-detail-route" ariaLabel="裁决命题" />
  }

  if (isLoading && !task) {
    return (
      <section className="route-page detail-route">
        <div className="route-header">
          <h1>加载裁决命题中</h1>
        </div>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="route-page detail-route">
        <article className="adjudication-task-card">
          <h2>加载失败</h2>
          <p>{errorMessage}</p>
          <button
            className="secondary-action adjudication-link-button"
            type="button"
            style={{ marginTop: 12 }}
            onClick={() => { void loadTask(undefined) }}
          >
            <span>重新加载</span>
          </button>
        </article>
      </section>
    )
  }

  if (!task) {
    return <NotFoundPage />
  }

  return (
    <section className="route-page detail-route" aria-label="裁决命题">
      <Link className="adjudication-detail-back" to="/zh/adjudication">
        <ChevronLeft size={16} />
        <span>返回裁决层</span>
      </Link>

      <div className="detail-layout">
        <div className="detail-main-stack">
          <article className="adjudication-task-card">
            <div className="adjudication-task-head">
              <div className="task-kicker">
                <Sparkles size={15} fill="currentColor" />
                <span>裁决命题</span>
              </div>
              <div className="task-countdown" aria-label={`剩余时间 ${formatCountdown(task.timeRemainingSeconds)}`}>
                <span>剩余时间</span>
                <strong>
                  <Clock3 size={16} />
                  {formatCountdown(task.timeRemainingSeconds)}
                </strong>
              </div>
            </div>

            <h2>{task.title}</h2>

            {task.description ? (
              <p className="adjudication-detail-description">{task.description}</p>
            ) : null}

            <div className="adjudication-task-tags" aria-label="任务标签">
              {tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>

            <div className="adjudication-options" aria-label="裁决选项">
              <button
                type="button"
                className={selectedOption === 0 ? 'selected' : ''}
                disabled={task.hasSubmitted || isSubmitting}
                onClick={() => setSelectedOption(0)}
              >
                <span>A</span>
                {task.options[0]}
              </button>
              <button
                type="button"
                className={selectedOption === 1 ? 'selected' : ''}
                disabled={task.hasSubmitted || isSubmitting}
                onClick={() => setSelectedOption(1)}
              >
                <span>B</span>
                {task.options[1]}
              </button>
            </div>

            <div className="adjudication-submit-row">
              <button
                className="primary-action"
                type="button"
                disabled={task.hasSubmitted || isSubmitting || selectedOption === null}
                onClick={() => { void submitTask() }}
              >
                <span>{task.hasSubmitted ? '本命题已提交' : isSubmitting ? '提交中' : '提交真实裁决'}</span>
              </button>
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
        </div>

        <aside className="detail-side-panel">
          <section className="featured-state-board adjudication-detail-board" aria-label="命题公开进度">
            <ProgressMeter
              label="时间进度"
              detail={revealLabel(task)}
              value={task.publicProgress.progress.progressPercent}
            />
            <ProgressMeter
              label="有效样本"
              detail={`${task.publicProgress.progress.currentEffectiveSample} / ${task.publicProgress.progress.totalRequired}`}
              value={task.publicProgress.progress.progressPercent}
            />

            <dl className="adjudication-highlight-facts">
              <div>
                <dt>命题状态</dt>
                <dd>{task.propositionStatus}</dd>
              </div>
              <div>
                <dt>奖励状态</dt>
                <dd>{summarizeRewardStatus(task.rewardStatus)}</dd>
              </div>
              <div>
                <dt>待入账奖励</dt>
                <dd>{formatTokenAmount(task.rewardPendingAmount)}</dd>
              </div>
              <div>
                <dt>用户状态</dt>
                <dd>{task.hasSubmitted ? '已提交' : '尚未裁决'}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </section>
  )
}
