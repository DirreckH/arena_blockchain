import type {
  RespondentReputationSummaryViewModel,
  RespondentRewardLedgerViewModel,
  RespondentTagSummaryViewModel,
  ResponseReviewStatus,
} from '@arena/shared'
import {
  Award,
  ChevronRight,
  CircleAlert,
  Gift,
  LogIn,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useRulesIntro } from '../components/shared/RulesIntroContext'
import {
  formatRelativeTime,
  summarizeReputationLevel,
  summarizeTags,
  summarizeRewardStatus,
} from '../features/arena/arena-ui-mappers'
import { useArenaAccountData } from '../features/arena/account-data'

type RewardTierDefinition = {
  tier: string
  icon: typeof Star
  threshold: string
  reward: string
  description: string
}

type RewardFaq = {
  question: string
  answer: string
}

type RewardMetric = {
  label: string
  value: string
  detail: string
  tone?: 'positive' | 'neutral'
}

const rewardTiers: RewardTierDefinition[] = [
  {
    tier: '入门',
    icon: Star,
    threshold: '完成首次有效裁决回答',
    reward: '解锁基础奖励结算资格',
    description: '第一次提交通过审核的回答后，奖励会进入你的账户奖励流水。',
  },
  {
    tier: '活跃',
    icon: Zap,
    threshold: '连续 7 天保持有效参与',
    reward: '活跃度权重加成 ×1.2',
    description: '连续完成派单并维持健康有效率后，后续奖励权重会获得稳定加成。',
  },
  {
    tier: '高质量',
    icon: TrendingUp,
    threshold: '有效样本率达到 80% 以上',
    reward: '质量奖励加成 ×1.5',
    description: '高质量回答会直接提升你在奖励池中的分配权重，并影响后续派单优先级。',
  },
  {
    tier: '精英',
    icon: Award,
    threshold: '累计有效样本达到 500+',
    reward: '精英激励与专属标签',
    description: '长期稳定贡献者会进入高优先级通道，获得更高价值任务与额外激励资格。',
  },
]

const rewardFaqs: RewardFaq[] = [
  {
    question: '奖励什么时候入账？',
    answer: '命题进入公开与结算流程后，平台会在审核完成后把奖励写入账户流水，待结算与已结算会分开展示。',
  },
  {
    question: '奖励以什么形式显示？',
    answer: 'Arena 当前以 USDC 口径展示 respondent 奖励，并把待结算与已结算金额拆开，方便核对当期收益。',
  },
  {
    question: '质检未通过会怎样？',
    answer: '无效或异常回答不会计入有效样本，也不会产生该次奖励权重；但已完成结算的历史奖励不会被同一次失败直接扣回。',
  },
]

function formatAmount(amount: string) {
  return `${amount} USDC`
}

function summarizeReviewStatus(reviewStatus: ResponseReviewStatus | null) {
  switch (reviewStatus) {
    case 'valid':
      return '审核通过'
    case 'partial_valid':
      return '部分有效'
    case 'invalid':
      return '无效回答'
    case 'fraud_suspected':
      return '异常待核查'
    case 'pending_review':
      return '等待审核'
    default:
      return '等待处理'
  }
}

function buildRewardMetrics(input: {
  currentCount: number
  pendingAmount: string
  finalizedAmount: string
  settledCount: number
  reviewedResponseCount: number
}): RewardMetric[] {
  return [
    {
      label: '当前奖励条目',
      value: String(input.currentCount),
      detail: '仍在账户当前视图中生效的奖励流水条目',
    },
    {
      label: '待结算奖励',
      value: formatAmount(input.pendingAmount),
      detail: '已经进入奖励账本、等待最终结算的 respondent 奖励',
      tone: Number(input.pendingAmount) > 0 ? 'positive' : 'neutral',
    },
    {
      label: '已结算奖励',
      value: formatAmount(input.finalizedAmount),
      detail: '已经完成结算并写入账户的奖励金额',
      tone: Number(input.finalizedAmount) > 0 ? 'positive' : 'neutral',
    },
    {
      label: '已公开结果',
      value: String(input.settledCount),
      detail: '与你账户相关、已经走到公开结果阶段的命题数量',
    },
    {
      label: '已审核回答',
      value: String(input.reviewedResponseCount),
      detail: '用于计算声誉与有效率的已审核回答总数',
    },
  ]
}

function RewardSummaryPanel({
  metrics,
  reputation,
  tags,
}: {
  metrics: RewardMetric[]
  reputation: RespondentReputationSummaryViewModel | null
  tags: RespondentTagSummaryViewModel | null
}) {
  const activeTags = summarizeTags(tags)

  return (
    <section className="account-menu-panel rewards-summary-panel" aria-label="真实奖励概览">
      <div className="account-menu-panel-head">
        <div>
          <h2>当前账户奖励概览</h2>
          <span>这部分直接读取真实 respondent 账户聚合，而不是静态说明文案。</span>
        </div>
      </div>

      <div className="rewards-metric-grid">
        {metrics.map((metric) => (
          <article className="rewards-metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong className={metric.tone === 'positive' ? 'positive' : undefined}>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </div>

      <div className="rewards-signal-grid">
        <article className="help-card">
          <div className="help-card-icon" aria-hidden="true">
            <ShieldCheck size={16} />
          </div>
          <strong>
            声誉等级
            {reputation ? `：${summarizeReputationLevel(reputation)} / ${reputation.reputationScore}` : '：等待生成'}
          </strong>
          {reputation ? (
            <div className="reputation-metrics">
              <div className="reputation-metric-row">
                <span>完成率</span>
                <strong>{(reputation.metrics.completionRate * 100).toFixed(0)}%</strong>
              </div>
              <div className="reputation-metric-row">
                <span>有效率</span>
                <strong>{(reputation.metrics.validRate * 100).toFixed(0)}%</strong>
              </div>
              <div className="reputation-metric-row">
                <span>最近更新</span>
                <strong>{formatRelativeTime(reputation.computedAt)}</strong>
              </div>
            </div>
          ) : (
            <p>提交并通过审核的回答越多，这里的声誉画像越完整。</p>
          )}
        </article>

        <article className="help-card">
          <div className="help-card-icon" aria-hidden="true">
            <Sparkles size={16} />
          </div>
          <strong>当前标签</strong>
          {activeTags.length > 0 ? (
            <div className="rewards-tag-list" aria-label="当前账户标签">
              {activeTags.slice(0, 4).map((tag) => (
                <span className="tag-chip tag-type-interest" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p>还没有生成当前标签。后续回答与审核记录会逐步形成标签画像。</p>
          )}
        </article>
      </div>
    </section>
  )
}

function RewardLedgerPanel({ rewards }: { rewards: RespondentRewardLedgerViewModel[] }) {
  const currentRewards = rewards.filter((reward) => reward.isCurrent)
  const visibleRewards = [...currentRewards].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  )

  return (
    <section className="account-menu-panel rewards-ledger-panel" aria-label="真实奖励流水">
      <div className="account-menu-panel-head">
        <div>
          <h2>最近奖励流水</h2>
          <span>展示真实 reward ledger 中仍然生效的当前条目。</span>
        </div>
      </div>

      {visibleRewards.length === 0 ? (
        <div className="reputation-empty">
          <span>当前账户还没有可展示的奖励流水。</span>
        </div>
      ) : (
        <div className="rewards-ledger-list">
          {visibleRewards.map((reward) => (
            <article className="rewards-ledger-item" key={reward.ledgerId}>
              <div className="rewards-ledger-top">
                <div className="rewards-ledger-copy">
                  <strong>{reward.propositionTitle}</strong>
                  <p>
                    {summarizeRewardStatus(reward.status)} · {summarizeReviewStatus(reward.reviewStatus)}
                  </p>
                </div>
                <div className="rewards-ledger-amounts">
                  <strong>
                    {reward.status === 'finalized'
                      ? formatAmount(reward.finalAmount ?? '0.00')
                      : formatAmount(reward.pendingAmount)}
                  </strong>
                  <span>{reward.status === 'finalized' ? '已结算' : '待结算'}</span>
                </div>
              </div>

              <div className="rewards-ledger-meta">
                <span>命题 ID: {reward.propositionId}</span>
                <span>记录时间: {formatRelativeTime(reward.createdAt)}</span>
                {reward.finalizedAt ? <span>结算完成: {formatRelativeTime(reward.finalizedAt)}</span> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export function RewardsPage() {
  const { isAuthenticated, openAuthModal } = useRulesIntro()
  const {
    rewards,
    rewardSummary,
    reputation,
    tags,
    overview,
    sourceMode,
    isLoading,
    errorMessage,
  } = useArenaAccountData()
  const settledCount = overview?.resultOverview.settledResults.totals.settledCount ?? 0
  const reviewedResponseCount = reputation?.metrics.reviewedResponseCount ?? 0
  const rewardMetrics = buildRewardMetrics({
    currentCount: rewardSummary.currentCount,
    pendingAmount: rewardSummary.pendingAmount,
    finalizedAmount: rewardSummary.finalizedAmount,
    settledCount,
    reviewedResponseCount,
  })

  return (
    <section className="route-page utility-page rewards-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>参与激励</h1>
        <p>这页保留奖励规则与结算方式说明，同时在登录后把真实账户奖励、声誉和标签接入到已有产品流程里。</p>
      </div>

      <div className="utility-stack">
        <DataSourceBadge mode={sourceMode} />

        {!isAuthenticated ? (
          <section className="account-empty-card" aria-label="奖励账户登录提示">
            <div className="account-empty-icon" aria-hidden="true">
              <LogIn size={28} />
            </div>
            <strong>登录后查看真实奖励流水</strong>
            <p>当前页的奖励规则说明对所有人可见，但真实的待结算奖励、已结算金额、声誉与标签需要登录后才能读取。</p>
            <div className="account-summary-actions">
              <button className="primary-action" type="button" onClick={() => openAuthModal('login')}>
                <LogIn size={16} />
                <span>连接钱包并读取账户</span>
              </button>
              <Link className="secondary-action" to="/zh/adjudication">
                前往裁决页
              </Link>
            </div>
          </section>
        ) : null}

        {isAuthenticated && errorMessage ? (
          <section className="account-menu-panel" aria-label="奖励账户加载失败">
            <div className="account-menu-panel-head">
              <div>
                <h2>奖励账户读取失败</h2>
                <span>{errorMessage}</span>
              </div>
              <CircleAlert size={18} aria-hidden="true" />
            </div>
          </section>
        ) : null}

        {isAuthenticated && isLoading ? (
          <section className="account-menu-panel" aria-label="奖励账户加载中">
            <div className="account-menu-panel-head">
              <div>
                <h2>正在读取真实奖励账户</h2>
                <span>待结算奖励、已结算金额、声誉与标签会在加载完成后替换静态说明。</span>
              </div>
            </div>
          </section>
        ) : null}

        {isAuthenticated && !isLoading && !errorMessage ? (
          <>
            <RewardSummaryPanel metrics={rewardMetrics} reputation={reputation} tags={tags} />
            <RewardLedgerPanel rewards={rewards} />
          </>
        ) : null}

        <div>
          <h2 className="utility-page-group-title">激励层级</h2>
          <div className="help-grid">
            {rewardTiers.map((tier) => {
              const Icon = tier.icon

              return (
                <div className="help-card" key={tier.tier}>
                  <div className="help-card-icon" aria-hidden="true">
                    <Icon size={16} />
                  </div>
                  <strong>{tier.tier}：{tier.reward}</strong>
                  <p>{tier.description}</p>
                  <span className="reward-tier-meta">
                    <span className="reward-tier-meta-label">触发条件</span>
                    <span className="reward-tier-meta-value">{tier.threshold}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <h2 className="utility-page-group-title">结算与规则说明</h2>
          <div className="help-faq">
            {rewardFaqs.map((faq) => (
              <div className="help-faq-item" key={faq.question}>
                <p className="help-faq-question">{faq.question}</p>
                <p className="help-faq-answer">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="help-contact-card">
          <div className="help-card-icon" aria-hidden="true">
            <Gift size={16} />
          </div>
          <div className="help-contact-copy">
            <strong>继续积累奖励权重</strong>
            <p>前往裁决页领取任务，提交有效回答后，奖励会先进入真实 reward ledger，再逐步结算进你的账户记录。</p>
            <Link className="help-card-link" to="/zh/adjudication">
              <ChevronRight size={13} />
              前往裁决页
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
