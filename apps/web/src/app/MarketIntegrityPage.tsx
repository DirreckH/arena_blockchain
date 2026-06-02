import { ChevronRight, Eye, Lock, Shield, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PublicIntegrityOverviewViewModel } from '@arena/shared'
import { Link } from 'react-router-dom'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { arenaApi } from '../features/api/arena-api'
import { useAuthSession } from '../features/auth/auth-session'
import { formatCategoryLabel } from '../features/arena/arena-ui-mappers'

const principles = [
  {
    icon: Eye,
    title: '裁决层与验证层隔离',
    body: '开奖前，裁决层（共识采集）与验证层（预测市场）严格信息隔离。裁决参与者只能看到任务进度与有效样本数，无法读取验证层的实时方向数据，防止共识被市场信号污染。',
  },
  {
    icon: Lock,
    title: '质检与有效样本机制',
    body: '每条裁决回答都经过多轮质检评估：有效、部分有效、无效、异常。只有通过质检的回答才计入有效样本池，达到门槛后命题才能进入开奖流程。',
  },
  {
    icon: Zap,
    title: '链上结算与可验证性',
    body: '奖励分配与命题结果以批次形式写入链上，所有结算记录可公开审计。每个命题的开奖依据、共识结论和奖励权重均附带可验证证明。',
  },
  {
    icon: Shield,
    title: '信息边界保护',
    body: '命题候选审核阶段，评审人员仅接触必要字段，不接触完整的验证层数据。开奖后信息边界自动解除，历史数据对所有用户公开。',
  },
] as const

const phases = [
  { label: '命题草稿', description: '命题创建者提交候选内容，进入审核队列。' },
  { label: '审核中', description: '平台评审信息边界、选项互斥性与可验证性。' },
  { label: '采集阶段', description: '裁决参与者领取任务，提交回答，质检同步进行。' },
  { label: '达到门槛', description: '有效样本数达到命题设定门槛，触发开奖流程。' },
  { label: '开奖', description: '共识结论写入链上，验证层结算同步执行，奖励分配完成。' },
] as const

type LiveIntegrityItem = PublicIntegrityOverviewViewModel['live']['items'][number]

function formatDeadlineLabel(deadlineAt: string | null) {
  if (!deadlineAt) {
    return '未设公开截止时间'
  }

  const date = new Date(deadlineAt)
  if (Number.isNaN(date.getTime())) {
    return deadlineAt
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSettledAtLabel(settledAt: string | null) {
  if (!settledAt) {
    return '暂无已公开归档时间'
  }

  const date = new Date(settledAt)
  if (Number.isNaN(date.getTime())) {
    return settledAt
  }

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function buildSourceDetail(_sourceMode: 'live' | 'demo' | 'mixed' | 'unavailable') {
  return undefined
}

function LiveProgressRow({ item }: { item: LiveIntegrityItem }) {
  return (
    <div className="account-settings-detail-row">
      <div className="account-settings-detail-meta">
        <span style={{ fontSize: '0.92rem', fontWeight: 500 }}>{item.title}</span>
        <small style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: 2 }}>
          <span className="account-settings-pill neutral">{formatCategoryLabel(item.category)}</span>
          <span style={{ opacity: 0.55 }}>{item.phase === 'live' ? '采集中' : item.phase === 'revealing' ? '开奖中' : '处理中'}</span>
          <span style={{ opacity: 0.55 }}>有效样本 {item.effectiveSampleCount}/{item.requiredSampleCount}</span>
        </small>
      </div>
      <em className="account-settings-detail-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
        <span style={{ fontWeight: 600 }}>{item.progressPercent}%</span>
        <small style={{ opacity: 0.6 }}>{item.reachedSampleThreshold ? '已达到样本门槛' : '尚未达到样本门槛'}</small>
        <small style={{ opacity: 0.55 }}>截止 {formatDeadlineLabel(item.deadlineAt)}</small>
      </em>
    </div>
  )
}

export function MarketIntegrityPage() {
  const { sessionMode } = useAuthSession()
  const [overview, setOverview] = useState<PublicIntegrityOverviewViewModel | null>(null)
  const [sourceMode, setSourceMode] = useState<'live' | 'demo' | 'mixed'>('live')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    void (async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const nextOverview = await arenaApi.getPublicIntegrityOverviewFeed()
        if (disposed) {
          return
        }

        setOverview(nextOverview.data)
        setSourceMode(nextOverview.sourceMode)
      } catch (error) {
        if (disposed) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : '市场完整性概览加载失败')
      } finally {
        if (!disposed) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [])

  const displayedSourceMode = sessionMode === 'demo'
    ? 'demo'
    : errorMessage
      ? 'unavailable'
      : sourceMode

  const phaseSummary = useMemo(() => overview?.live.phaseBreakdown ?? [], [overview])
  const liveItems = useMemo(() => overview?.live.items ?? [], [overview])

  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>信息边界与市场完整性</h1>
        <p>Arena 通过结构化隔离机制保证裁决结果的可信度，防止验证层信号对裁决层造成干扰。</p>
      </div>

      <div className="utility-stack">
        <DataSourceBadge mode={displayedSourceMode} detail={buildSourceDetail(displayedSourceMode)} />

        <div className="help-grid">
          {principles.map((item) => {
            const Icon = item.icon
            return (
              <div className="help-card" key={item.title}>
                <div className="help-card-icon" aria-hidden="true">
                  <Icon size={16} />
                </div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            )
          })}
        </div>

        <article className="account-settings-detail-card">
          <div className="account-settings-detail-head">
            <strong>当前公开完整性概览</strong>
            <p>只展示开奖前允许公开的进度信号，以及开奖后已归档的审计结果。</p>
          </div>

          <div className="account-settings-detail-list">
            {isLoading ? (
              <div className="account-settings-detail-row">
                <div className="account-settings-detail-meta">
                  <span>正在汇总公开完整性指标</span>
                  <small>同步公开进度、已归档结算记录与链上可验证状态。</small>
                </div>
              </div>
            ) : null}

            {!isLoading && errorMessage ? (
              <div className="account-settings-detail-row">
                <div className="account-settings-detail-meta">
                  <span>市场完整性概览加载失败</span>
                  <small>{errorMessage}</small>
                </div>
              </div>
            ) : null}

            {!isLoading && !errorMessage && overview ? (
              <>
                <div className="account-settings-detail-row">
                  <div className="account-settings-detail-meta">
                    <span>公开采集中的命题</span>
                    <small>当前仍处于公开进度阶段的命题数</small>
                  </div>
                  <em className="account-settings-detail-value">{overview.live.totalCount}</em>
                </div>
                <div className="account-settings-detail-row">
                  <div className="account-settings-detail-meta">
                    <span>已达到样本门槛</span>
                    <small>已满足公开样本要求、可进入下一阶段的命题数</small>
                  </div>
                  <em className="account-settings-detail-value">{overview.live.reachedSampleThresholdCount}</em>
                </div>
                <div className="account-settings-detail-row">
                  <div className="account-settings-detail-meta">
                    <span>已归档公开结果</span>
                    <small>已完成开奖并可公开复核的历史命题数</small>
                  </div>
                  <em className="account-settings-detail-value">{overview.archive.settledCount}</em>
                </div>
                <div className="account-settings-detail-row">
                  <div className="account-settings-detail-meta">
                    <span>链上结算记录</span>
                    <small>已附带链上结算证据的归档命题数</small>
                  </div>
                  <em className="account-settings-detail-value">{overview.archive.onChainCount}</em>
                </div>
                <div className="account-settings-detail-row">
                  <div className="account-settings-detail-meta">
                    <span>归档命题平均有效样本</span>
                    <small>仅按已公开归档结果统计的历史平均值</small>
                  </div>
                  <em className="account-settings-detail-value">{overview.archive.averageValidSampleCount}</em>
                </div>
                <div className="account-settings-detail-row">
                  <div className="account-settings-detail-meta">
                    <span>最近归档时间</span>
                    <small>最近一次进入公开复核档案的日期</small>
                  </div>
                  <em className="account-settings-detail-value">{formatSettledAtLabel(overview.archive.latestSettledAt)}</em>
                </div>
              </>
            ) : null}
          </div>
        </article>

        <article className="account-settings-detail-card">
          <div className="account-settings-detail-head">
            <strong>公开阶段分布</strong>
            <p>仅展示可公开的生命周期阶段，不暴露方向性、盘口或内部修复信息。</p>
          </div>

          <div className="account-settings-detail-list">
            {!isLoading && !errorMessage && phaseSummary.length === 0 ? (
              <div className="account-settings-detail-row">
                <div className="account-settings-detail-meta">
                  <span>当前没有处于公开进度阶段的命题</span>
                  <small>当新的命题进入采集、冻结或开奖阶段后，这里会自动更新。</small>
                </div>
              </div>
            ) : null}

            {phaseSummary.map((phase) => (
              <div className="account-settings-detail-row" key={phase.phase}>
                <div className="account-settings-detail-meta">
                  <span>{phase.label}</span>
                  <small>当前处于该公开阶段的命题数量</small>
                </div>
                <em className="account-settings-detail-value">{phase.count}</em>
              </div>
            ))}
          </div>
        </article>

        <article className="account-settings-detail-card">
          <div className="account-settings-detail-head">
            <strong>当前公开样本进度</strong>
            <p>这里展示的是不含方向信息的公开进度，用于判断命题是否接近开奖门槛。</p>
          </div>

          <div className="account-settings-detail-list">
            {!isLoading && !errorMessage && liveItems.length === 0 ? (
              <div className="account-settings-detail-row">
                <div className="account-settings-detail-meta">
                  <span>当前没有公开中的完整性样本</span>
                  <small>新命题上线并进入可公开进度阶段后，这里会展示实时汇总。</small>
                </div>
              </div>
            ) : null}

            {liveItems.map((item) => (
              <LiveProgressRow key={item.propositionId} item={item} />
            ))}
          </div>
        </article>

        <article className="account-settings-detail-card">
          <div className="account-settings-detail-head">
            <strong>命题生命周期</strong>
            <p>从草稿提交到链上结算的完整流程。</p>
          </div>

          <div className="account-settings-detail-list">
            {phases.map((phase, index) => (
              <div className="account-settings-detail-row" key={phase.label}>
                <div className="account-settings-detail-meta">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: 'var(--color-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </span>
                    {phase.label}
                  </span>
                  <small>{phase.description}</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <div className="help-contact-card">
          <div className="help-card-icon" aria-hidden="true">
            <Shield size={16} />
          </div>
          <div className="help-contact-copy">
            <strong>参与裁决，建立可信共识</strong>
            <p>前往裁决页领取待处理任务，你的每一次有效回答都会为命题的可信结论贡献权重。</p>
            <Link className="help-card-link" to="/zh/adjudication">
              前往裁决 <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
