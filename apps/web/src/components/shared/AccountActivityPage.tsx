import {
  Bell,
  BellRing,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Code2,
  Eye,
  FileDown,
  Laptop2,
  LogIn,
  Mail,
  Shield,
  UserCircle2,
  Wallet,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES,
  type RespondentAccountPreferencesViewModel,
  type UpdateRespondentAccountPreferencesInput,
} from '@arena/shared'
import { useArenaAccountData } from '../../features/arena/account-data'
import {
  formatRelativeTime,
  summarizeReputationLevel,
  summarizeTags,
} from '../../features/arena/arena-ui-mappers'
import { useRulesIntro } from './RulesIntroContext'

type SettingsSectionId =
  | 'profile'
  | 'security'
  | 'wallet'
  | 'notifications'
  | 'privacy'
  | 'devices'
  | 'exports'
  | 'developer'

type NotificationPreferenceKey =
  | 'emailSettlement'
  | 'emailWatchlistUpdate'
  | 'emailSecurityAlert'
  | 'appOrderFilled'
  | 'appSettlement'
  | 'appWatchlistUpdate'
  | 'reviewSubmissionReceived'
  | 'reviewNeedMoreInfo'
  | 'reviewDecision'
  | 'challengeProgress'
  | 'dailyDigest'
  | 'quietHours'
  | 'onlyImportant'
  | 'syncEmailAndApp'

type ToggleItem = {
  control: 'switch' | 'checkbox'
  key: NotificationPreferenceKey
  label: string
}

type NotificationBlock = {
  id: string
  icon: typeof Mail
  title: string
  items: ToggleItem[]
}

type DetailTone = 'neutral' | 'pending' | 'info'

type DetailRow = {
  label: string
  value: string
  hint?: string
  tone?: DetailTone
}

type DetailBlock = {
  title: string
  description: string
  rows: DetailRow[]
}

type ChoiceOption = {
  label: string
  value: string
}

const SETTINGS_NAV = [
  { id: 'profile', label: '个人资料', icon: UserCircle2 },
  { id: 'security', label: '安全', icon: Shield },
  { id: 'wallet', label: '钱包与结算', icon: Wallet },
  { id: 'notifications', label: '通知', icon: Bell },
  { id: 'privacy', label: '隐私与公开', icon: Eye },
  { id: 'devices', label: '设备与会话', icon: Laptop2 },
  { id: 'exports', label: '数据导出', icon: FileDown },
  { id: 'developer', label: '开发者', icon: Code2 },
] as const

const NOTIFICATION_BLOCKS: NotificationBlock[] = [
  {
    id: 'email',
    icon: Mail,
    title: '电子邮箱',
    items: [
      { control: 'switch', key: 'emailSettlement', label: '结算结果' },
      { control: 'switch', key: 'emailWatchlistUpdate', label: '关注命题更新' },
      { control: 'switch', key: 'emailSecurityAlert', label: '系统与安全提醒' },
    ],
  },
  {
    id: 'in-app',
    icon: BellRing,
    title: '应用内',
    items: [
      { control: 'switch', key: 'appOrderFilled', label: '订单成交' },
      { control: 'switch', key: 'appSettlement', label: '结算结果' },
      { control: 'switch', key: 'appWatchlistUpdate', label: '关注命题更新' },
    ],
  },
  {
    id: 'review',
    icon: Shield,
    title: '审核与挑战',
    items: [
      { control: 'switch', key: 'reviewSubmissionReceived', label: '提交审核已接收' },
      { control: 'switch', key: 'reviewNeedMoreInfo', label: '审核需要补充材料' },
      { control: 'switch', key: 'reviewDecision', label: '审核通过或驳回' },
      { control: 'switch', key: 'challengeProgress', label: '挑战处理进度' },
    ],
  },
  {
    id: 'policy',
    icon: Bell,
    title: '通知策略',
    items: [
      { control: 'switch', key: 'dailyDigest', label: '每日汇总提醒' },
      { control: 'switch', key: 'quietHours', label: '夜间免打扰' },
      { control: 'switch', key: 'onlyImportant', label: '仅重要通知' },
      { control: 'switch', key: 'syncEmailAndApp', label: '邮件与站内同步发送' },
    ],
  },
]

const PROFILE_VISIBILITY_OPTIONS: ChoiceOption[] = [
  { value: 'members', label: '仅登录用户' },
  { value: 'public', label: '公开展示' },
]

const AVATAR_STYLE_OPTIONS: ChoiceOption[] = [
  { value: 'initial', label: '字母头像' },
  { value: 'image', label: '图片占位' },
]

const LANDING_VIEW_OPTIONS: ChoiceOption[] = [
  { value: 'overview', label: '总览' },
  { value: 'performance', label: '收益表现' },
  { value: 'positions', label: '持仓明细' },
]

const METRIC_VIEW_OPTIONS: ChoiceOption[] = [
  { value: 'usdc', label: 'USDC' },
  { value: 'shares', label: '份额' },
]

const TIME_DISPLAY_OPTIONS: ChoiceOption[] = [
  { value: 'absolute', label: '绝对时间' },
  { value: 'relative', label: '相对时间' },
]

const EXPORT_PERIOD_OPTIONS: ChoiceOption[] = [
  { value: '30d', label: '近 30 天' },
  { value: '90d', label: '近 90 天' },
]

const DEVELOPER_SCOPE_OPTIONS: ChoiceOption[] = [
  { value: 'self', label: '仅自己' },
  { value: 'team', label: '团队' },
]

const DEVELOPER_ENVIRONMENT_OPTIONS: ChoiceOption[] = [
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'production', label: 'Production' },
]

function ChoiceGroup({
  options,
  value,
  onChange,
}: {
  options: ChoiceOption[]
  value: string
  onChange: (nextValue: string) => void
}) {
  return (
    <div className="account-settings-choice-group" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'account-settings-choice active' : 'account-settings-choice'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function DetailCards({ blocks, sectionId }: { blocks: DetailBlock[]; sectionId: string }) {
  return (
    <>
      {blocks.map((block) => (
        <article className="account-settings-detail-card" key={`${sectionId}-${block.title}`}>
          <div className="account-settings-detail-head">
            <strong>{block.title}</strong>
            <p>{block.description}</p>
          </div>

          <div className="account-settings-detail-list">
            {block.rows.map((row) => (
              <div className="account-settings-detail-row" key={`${block.title}-${row.label}`}>
                <div className="account-settings-detail-meta">
                  <span>{row.label}</span>
                  {row.hint ? <small>{row.hint}</small> : null}
                </div>
                <em className={row.tone ? `account-settings-detail-value ${row.tone}` : 'account-settings-detail-value'}>
                  {row.value}
                </em>
              </div>
            ))}
          </div>
        </article>
      ))}
    </>
  )
}

function buildPreferencesDraft(
  preferences: RespondentAccountPreferencesViewModel | null,
): UpdateRespondentAccountPreferencesInput {
  if (!preferences) {
    return structuredClone(DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES)
  }

  return {
    notificationPreferences: structuredClone(preferences.notificationPreferences),
    profile: structuredClone(preferences.profile),
    privacy: structuredClone(preferences.privacy),
    security: structuredClone(preferences.security),
    devices: structuredClone(preferences.devices),
    wallet: structuredClone(preferences.wallet),
    exports: structuredClone(preferences.exports),
    developer: structuredClone(preferences.developer),
  }
}

export function AccountActivityPage() {
  const { isAuthenticated, logout, mockUser, openAuthModal } = useRulesIntro()
  const {
    overview,
    rewards,
    reputation,
    tags,
    rewardSummary,
    preferences,
    exports,
    latestExport,
    preferencesErrorMessage,
    exportsErrorMessage,
    isPreferencesLoading,
    isPreferencesSaving,
    isExportsLoading,
    isExporting,
    updatePreferences,
    createExport,
    isLoading: isAccountLoading,
    errorMessage: accountErrorMessage,
  } = useArenaAccountData()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('profile')
  const [preferencesDraft, setPreferencesDraft] = useState<UpdateRespondentAccountPreferencesInput>(() =>
    buildPreferencesDraft(null),
  )
  const lastSavedPreferencesRef = useRef<string>(JSON.stringify(buildPreferencesDraft(null)))
  const saveTimerRef = useRef<number | null>(null)

  const user = mockUser ?? {
    displayName: 'Arena 用户',
    avatarInitial: 'A',
    email: 'arena.user@example.com',
    walletAddress: '未连接',
  }
  const activeTags = summarizeTags(tags)
  const currentRewards = rewards.filter((reward) => reward.isCurrent)
  const latestReward = [...currentRewards].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  )[0] ?? null
  const latestActivity = overview?.resultOverview.recentActivity[0] ?? null
  const settledCount = overview?.resultOverview.settledResults.totals.settledCount ?? 0
  const openPositionCount = overview?.resultOverview.openPositions.totalCount ?? 0
  const openPositionStakeAmount = overview?.resultOverview.openPositions.totalStakeAmount ?? '0.00'
  const latestExportItem = exports?.items[0] ?? null
  const latestExportSummary = latestExport
    ? `${latestExport.fileName} · ${latestExport.overview.rewards.length} 条奖励 · ${latestExport.overview.resultOverview.openPositions.totalCount} 个持仓`
    : latestExportItem
      ? `${latestExportItem.fileName} · ${latestExportItem.metrics.rewardCount} 条奖励 · ${latestExportItem.metrics.openPositionCount} 个持仓`
      : '暂无已完成的导出记录。'
  const latestExportCompletedAt = latestExport?.completedAt ?? latestExportItem?.completedAt ?? null
  const latestExportFileName = latestExport?.fileName ?? latestExportItem?.fileName ?? null
  const latestExportStatus = latestExport?.status ?? latestExportItem?.status ?? 'pending'
  const notificationPreferences = preferencesDraft.notificationPreferences
  const avatarStyle = preferencesDraft.profile.avatarStyle
  const landingView = preferencesDraft.profile.landingView
  const profileVisibility = preferencesDraft.profile.profileVisibility
  const privacySettings = preferencesDraft.privacy
  const securitySettings = preferencesDraft.security
  const deviceSettings = preferencesDraft.devices
  const walletSettings = preferencesDraft.wallet
  const exportSettings = preferencesDraft.exports
  const developerSettings = preferencesDraft.developer

  useEffect(() => {
    const nextDraft = buildPreferencesDraft(preferences)
    const serialized = JSON.stringify(nextDraft)
    lastSavedPreferencesRef.current = serialized
    setPreferencesDraft(nextDraft)
  }, [preferences])

  useEffect(() => {
    if (!isAuthenticated || !preferences || isPreferencesLoading) {
      return
    }

    const serialized = JSON.stringify(preferencesDraft)
    if (serialized === lastSavedPreferencesRef.current) {
      return
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      void updatePreferences(preferencesDraft)
        .then(() => {
          lastSavedPreferencesRef.current = serialized
        })
        .catch(() => {})
    }, 400)

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [
    isAuthenticated,
    isPreferencesLoading,
    preferences,
    preferencesDraft,
    updatePreferences,
  ])

  const toggleNotificationPreference = (key: NotificationPreferenceKey) => {
    setPreferencesDraft((current) => ({
      ...current,
      notificationPreferences: {
        ...current.notificationPreferences,
        [key]: !current.notificationPreferences[key],
      },
    }))
  }

  const renderSwitchControl = (checked: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      className={checked ? 'notification-switch active' : 'notification-switch'}
      aria-label={label}
      aria-pressed={checked}
      onClick={onClick}
    >
      <span />
    </button>
  )

  const renderNotifications = () => (
    <section className="account-settings-panel">
      {NOTIFICATION_BLOCKS.map((block, blockIndex) => {
        const Icon = block.icon

        return (
          <article key={block.id} className={blockIndex === 0 ? 'notification-block' : 'notification-block with-divider'}>
            <div className="notification-block-head">
              <span className="notification-block-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <strong>{block.title}</strong>
            </div>

            <div className="notification-list">
              {block.items.map((item) => (
                <div
                  key={`${block.id}-${item.label}`}
                  className={
                    item.control === 'checkbox'
                      ? 'notification-row subtle'
                      : 'notification-row notification-row-switch'
                  }
                >
                  <div className="notification-row-copy">
                    <span>{item.label}</span>
                    {item.control === 'checkbox' ? (
                      <button
                        type="button"
                        className={
                          notificationPreferences[item.key] ? 'notification-checkmark active' : 'notification-checkmark'
                        }
                        aria-pressed={notificationPreferences[item.key]}
                        onClick={() => toggleNotificationPreference(item.key)}
                      >
                        <span className="sr-only">{item.label}</span>
                      </button>
                    ) : null}
                  </div>

                  {item.control === 'switch' ? (
                    <button
                      type="button"
                      className={notificationPreferences[item.key] ? 'notification-switch active' : 'notification-switch'}
                      aria-pressed={notificationPreferences[item.key]}
                      onClick={() => toggleNotificationPreference(item.key)}
                    >
                      <span />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        )
      })}
    </section>
  )

  const renderInteractiveSection = () => {
    if (activeSection === 'profile') {
      const profileBlocks: DetailBlock[] = [
        {
          title: '基础资料',
          description: '这里优先展示当前真实 Arena 会话里已经存在的账户基础信息。',
          rows: [
            { label: '公开昵称', value: user.displayName },
            { label: '会话钱包', value: user.walletAddress, tone: 'info' },
            { label: '当前标签', value: activeTags.length > 0 ? activeTags.slice(0, 3).join(' / ') : '暂无标签', tone: activeTags.length > 0 ? 'info' : 'pending' },
          ],
        },
        {
          title: '账户身份',
          description: '基于现有读模型显示声誉与账户阶段，其余资料编辑能力仍保持占位。',
          rows: [
            { label: '账户类型', value: '标准用户', tone: 'neutral' },
            { label: '当前状态', value: '真实已登录会话', tone: 'info' },
            {
              label: '声誉等级',
              value: reputation ? `${summarizeReputationLevel(reputation)} / ${reputation.reputationScore}` : '等待生成',
              tone: reputation ? 'info' : 'pending',
            },
          ],
        },
      ]

      return (
        <section className="account-settings-section-stack">
          <DetailCards blocks={profileBlocks} sectionId="profile" />

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>信誉等级</strong>
              <p>信誉由回答质量、完成率与参与一致性综合计算，影响未来任务派发优先级。</p>
            </div>
            {reputation ? (
              <div className="reputation-card">
                <div className="reputation-score-row">
                  <div className="reputation-score-block">
                    <strong className={`reputation-level-badge level-${reputation.reputationLevel}`}>
                      {summarizeReputationLevel(reputation)}
                    </strong>
                    <span className="reputation-score-value">{reputation.reputationScore} 分</span>
                  </div>
                  <p className="reputation-last-updated">更新于 {formatRelativeTime(reputation.computedAt)}</p>
                </div>
                <div className="reputation-metrics">
                  <div className="reputation-metric-row">
                    <span>完成率</span>
                    <strong>{(reputation.metrics.completionRate * 100).toFixed(0)}%</strong>
                  </div>
                  <div className="reputation-metric-row">
                    <span>有效回答率</span>
                    <strong>{(reputation.metrics.validRate * 100).toFixed(0)}%</strong>
                  </div>
                  <div className="reputation-metric-row">
                    <span>已审核回答</span>
                    <strong>{reputation.metrics.reviewedResponseCount}</strong>
                  </div>
                </div>
                <p className="reputation-note">New → Normal → Trusted，达到 Trusted 后获得更高优先级派单。</p>
              </div>
            ) : (
              <div className="reputation-empty">
                <span>信誉尚未生成，提交回答并通过质检后自动计算。</span>
              </div>
            )}
          </article>

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>用户标签</strong>
              <p>标签由系统根据你的回答偏好和参与记录生成，用于未来任务的精准派发。</p>
            </div>
            {tags && tags.tags.length > 0 ? (
              <div className="tag-profile-list">
                {tags.tags.map((tag) => (
                  <div key={tag.tagKey} className="tag-profile-item">
                    <span className={`tag-chip tag-type-${tag.tagType}`}>{tag.tagKey}</span>
                    <div className="tag-confidence-bar" aria-label={`置信度 ${Math.round(tag.confidenceScore * 100)}%`}>
                      <div
                        className="tag-confidence-fill"
                        style={{ width: `${Math.round(tag.confidenceScore * 100)}%` }}
                      />
                    </div>
                    <span className="tag-confidence-label">{Math.round(tag.confidenceScore * 100)}%</span>
                  </div>
                ))}
                <p className="tag-profile-note">置信度越高，标签对派单匹配的贡献越大。标签每轮结算后更新。</p>
              </div>
            ) : (
              <div className="tag-profile-empty">
                <span>标签尚未生成，参与并通过质检后系统会开始建立你的兴趣与质量画像。</span>
              </div>
            )}
          </article>

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>个人展示偏好</strong>
              <p>这里只承接头像与账户入口的显示方式，不处理公开可见范围。</p>
            </div>

            <div className="account-settings-control-stack">
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>头像样式</strong>
                  <p>当前保留字母头像与图片占位两种展示方式。</p>
                </div>
                <ChoiceGroup
                  options={AVATAR_STYLE_OPTIONS}
                  value={avatarStyle}
                  onChange={(nextValue) =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      profile: {
                        ...current.profile,
                        avatarStyle: nextValue as typeof current.profile.avatarStyle,
                      },
                    }))
                  }
                />
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>账户入口默认落地页</strong>
                  <p>点击右上角头像后，优先打开你最常使用的主页分区。</p>
                </div>
                <ChoiceGroup
                  options={LANDING_VIEW_OPTIONS}
                  value={landingView}
                  onChange={(nextValue) =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      profile: {
                        ...current.profile,
                        landingView: nextValue as typeof current.profile.landingView,
                      },
                    }))
                  }
                />
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>显示名称</strong>
                  <p>当前仅保留占位入口，后续接入真实资料编辑能力。</p>
                </div>
                <button className="account-settings-inline-button" type="button">
                  编辑占位入口
                </button>
              </div>
            </div>
          </article>
        </section>
      )
    }

    if (activeSection === 'security') {
      const securityBlocks: DetailBlock[] = [
        {
          title: '安全状态',
          description: '认证链路已接入钱包签名登录；更深的风控与二次验证仍保留前端占位。',
          rows: [
            { label: '登录方式', value: '钱包签名登录', tone: 'info' },
            { label: '当前会话', value: user.walletAddress, tone: 'neutral' },
            { label: '安全接入阶段', value: '已接入 auth challenge / verify / me', tone: 'info' },
          ],
        },
      ]

      return (
        <section className="account-settings-section-stack">
          <DetailCards blocks={securityBlocks} sectionId="security" />

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>验证与风控</strong>
              <p>保留邮箱验证、两步确认与敏感操作校验的设置结构。</p>
            </div>

            <div className="account-settings-control-stack">
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>邮箱验证</strong>
                  <p>后续接入真实认证后，这里会展示完整验证流程与状态。</p>
                </div>
                <div className="account-settings-inline-actions">
                  <span className="account-settings-pill pending">待接入</span>
                  <button className="account-settings-inline-button" type="button">
                    查看流程
                  </button>
                </div>
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>两步验证</strong>
                  <p>启用后将在敏感操作前增加额外身份确认步骤。</p>
                </div>
                {renderSwitchControl(securitySettings.twoFactorEnabled, '两步验证', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    security: {
                      ...current.security,
                      twoFactorEnabled: !current.security.twoFactorEnabled,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>提现前确认</strong>
                  <p>对钱包出金、奖励提取等高风险动作保留二次确认提示。</p>
                </div>
                {renderSwitchControl(securitySettings.withdrawalConfirmEnabled, '提现前确认', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    security: {
                      ...current.security,
                      withdrawalConfirmEnabled: !current.security.withdrawalConfirmEnabled,
                    },
                  })),
                )}
              </div>
            </div>
          </article>
        </section>
      )
    }

    if (activeSection === 'wallet') {
      const walletBlocks: DetailBlock[] = [
        {
          title: '钱包与结算状态',
          description: '当前已接入真实账户奖励与会话钱包读取；链上资产、网络与导出仍未接入。',
          rows: [
            { label: '当前钱包', value: user.walletAddress, tone: 'info' },
            { label: '待结算奖励', value: `${rewardSummary.pendingAmount} USDC`, tone: Number(rewardSummary.pendingAmount) > 0 ? 'info' : 'neutral' },
            { label: '已结算奖励', value: `${rewardSummary.finalizedAmount} USDC`, tone: Number(rewardSummary.finalizedAmount) > 0 ? 'info' : 'neutral' },
          ],
        },
      ]

      walletBlocks[0]?.rows.push({
        label: '持仓数',
        value: String(openPositionCount),
        hint: `${openPositionStakeAmount} USDC`,
        tone: openPositionCount > 0 ? 'info' : 'neutral',
      })

      return (
        <section className="account-settings-section-stack">
          <DetailCards blocks={walletBlocks} sectionId="wallet" />

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>回答奖励明细</strong>
              <p>每笔奖励的质检状态，由平台审核后入账。有效样本贡献回答奖励，质量标准影响未来派单。</p>
            </div>
            <div className="reward-ledger-list">
              {currentRewards.length === 0 ? (
                <div className="reward-ledger-empty">
                  <Wallet size={22} />
                  <span>暂无奖励记录，提交回答后在这里跟踪质检进度。</span>
                </div>
              ) : currentRewards.map((reward) => {
                const isPending = reward.status === 'pending'
                const isFinalized = reward.status === 'finalized'
                const isVoided = reward.status === 'voided' || reward.status === 'reversed'
                const reviewLabel = reward.reviewStatus === 'pending_review' ? '审核中'
                  : reward.reviewStatus === 'valid' ? '有效'
                  : reward.reviewStatus === 'partial_valid' ? '部分有效'
                  : reward.reviewStatus === 'invalid' ? '无效'
                  : reward.reviewStatus === 'fraud_suspected' ? '异常'
                  : '待审核'

                return (
                  <div className="reward-ledger-row" key={reward.ledgerId}>
                    <div className="reward-ledger-icon" aria-hidden="true">
                      {isFinalized ? (
                        <CheckCircle2 size={16} />
                      ) : isVoided ? (
                        <CircleAlert size={16} />
                      ) : (
                        <Clock3 size={16} />
                      )}
                    </div>
                    <div className="reward-ledger-copy">
                      <strong>{reward.propositionTitle}</strong>
                      <span>{reviewLabel} · {formatRelativeTime(reward.createdAt)}</span>
                    </div>
                    <div className={`reward-ledger-amount ${isFinalized ? 'positive' : isVoided ? 'negative' : 'neutral'}`}>
                      {isFinalized && reward.finalAmount ? (
                        <strong>+{reward.finalAmount} USDC</strong>
                      ) : isPending ? (
                        <span>{reward.pendingAmount} USDC 待入账</span>
                      ) : (
                        <span>已失效</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </article>

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>钱包连接与签名</strong>
              <p>先保留连接、签名前提醒与资金承接位，后续再接入真实钱包能力。</p>
            </div>

            <div className="account-settings-control-stack">
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>钱包连接</strong>
                  <p>当前已从真实 Arena 会话读取钱包地址；链上网络与资产状态仍待后端/合约补齐。</p>
                </div>
                <button
                  className="account-settings-inline-button"
                  onClick={() =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      wallet: {
                        ...current.wallet,
                        walletConnected: !current.wallet.walletConnected,
                      },
                    }))
                  }
                  type="button"
                >
                  {walletSettings.walletConnected ? '切回占位状态' : '仅切换前端占位'}
                </button>
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>签名前提醒</strong>
                  <p>在提交签名或确认资金动作前，额外展示一层确认提示。</p>
                </div>
                {renderSwitchControl(walletSettings.signingReminderEnabled, '签名前提醒', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    wallet: {
                      ...current.wallet,
                      signingReminderEnabled: !current.wallet.signingReminderEnabled,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>结算单位</strong>
                  <p>选择在主页和记录里优先显示 USDC 金额还是份额。</p>
                </div>
                <ChoiceGroup
                  options={METRIC_VIEW_OPTIONS}
                  value={walletSettings.metricView}
                  onChange={(nextValue) =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      wallet: {
                        ...current.wallet,
                        metricView: nextValue as typeof current.wallet.metricView,
                      },
                    }))
                  }
                />
              </div>
            </div>
          </article>

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>结算记录显示</strong>
              <p>控制收益、时间与小额明细在账户主页里的默认展示规则。</p>
            </div>

            <div className="account-settings-control-stack">
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>时间展示</strong>
                  <p>可在绝对时间与相对时间之间切换。</p>
                </div>
                <ChoiceGroup
                  options={TIME_DISPLAY_OPTIONS}
                  value={walletSettings.timeDisplay}
                  onChange={(nextValue) =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      wallet: {
                        ...current.wallet,
                        timeDisplay: nextValue as typeof current.wallet.timeDisplay,
                      },
                    }))
                  }
                />
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>结算后高亮收益</strong>
                  <p>在结果公开后用更明显的色彩强调正负收益。</p>
                </div>
                {renderSwitchControl(walletSettings.highlightSettlement, '结算后高亮收益', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    wallet: {
                      ...current.wallet,
                      highlightSettlement: !current.wallet.highlightSettlement,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>隐藏小额成交</strong>
                  <p>默认过滤极小额度的成交记录，保证页面阅读密度稳定。</p>
                </div>
                {renderSwitchControl(walletSettings.hideSmallFills, '隐藏小额成交', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    wallet: {
                      ...current.wallet,
                      hideSmallFills: !current.wallet.hideSmallFills,
                    },
                  })),
                )}
              </div>
            </div>
          </article>
        </section>
      )
    }

    if (activeSection === 'privacy') {
      const privacyBlocks: DetailBlock[] = [
        {
          title: '公开范围',
          description: '只控制资料与结果页的可见范围，不接真实公开资料系统。',
          rows: [
            { label: '资料卡可见范围', value: profileVisibility === 'public' ? '公开展示' : '仅登录用户', tone: 'info' },
            { label: '账户摘要公开', value: privacySettings.showAccountSummary ? '已开启' : '已关闭', tone: 'neutral' },
            { label: '结算历史公开', value: privacySettings.showSettledHistory ? '已开启' : '已关闭', tone: 'neutral' },
          ],
        },
      ]

      return (
        <section className="account-settings-section-stack">
          <DetailCards blocks={privacyBlocks} sectionId="privacy" />

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>隐私与公开控制</strong>
              <p>区分个人资料公开范围、收益摘要暴露程度与结果记录的外部可见性。</p>
            </div>

            <div className="account-settings-control-stack">
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>资料卡可见范围</strong>
                  <p>决定头像页和主页顶部资料卡可以被谁看到。</p>
                </div>
                <ChoiceGroup
                  options={PROFILE_VISIBILITY_OPTIONS}
                  value={profileVisibility}
                  onChange={(nextValue) =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      profile: {
                        ...current.profile,
                        profileVisibility: nextValue as typeof current.profile.profileVisibility,
                      },
                    }))
                  }
                />
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>公开显示账户摘要</strong>
                  <p>控制总资产、收益概览等摘要是否出现在对外展示区域。</p>
                </div>
                {renderSwitchControl(privacySettings.showAccountSummary, '公开显示账户摘要', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    privacy: {
                      ...current.privacy,
                      showAccountSummary: !current.privacy.showAccountSummary,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>公开显示结算历史</strong>
                  <p>控制已公开结果后的记录是否允许在外部视图中展示。</p>
                </div>
                {renderSwitchControl(privacySettings.showSettledHistory, '公开显示结算历史', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    privacy: {
                      ...current.privacy,
                      showSettledHistory: !current.privacy.showSettledHistory,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>允许活动被索引</strong>
                  <p>决定公开活动记录是否进入发现与搜索的占位列表。</p>
                </div>
                {renderSwitchControl(privacySettings.allowActivityIndexing, '允许活动被索引', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    privacy: {
                      ...current.privacy,
                      allowActivityIndexing: !current.privacy.allowActivityIndexing,
                    },
                  })),
                )}
              </div>
            </div>
          </article>
        </section>
      )
    }

    if (activeSection === 'devices') {
      const deviceBlocks: DetailBlock[] = [
        {
          title: '当前会话',
          description: '当前只有真实 Arena 会话本身，设备枚举与多会话管理接口尚未接入。',
          rows: [
            { label: '当前设备', value: '当前浏览器 / 当前设备', tone: 'info' },
            { label: '最近奖励活动', value: latestReward ? formatRelativeTime(latestReward.createdAt) : '暂无', tone: 'neutral' },
            { label: '会话状态', value: '活跃中 / 已鉴权', tone: 'info' },
          ],
        },
      ]

      if (latestActivity) {
        deviceBlocks[0]?.rows.splice(1, 0, {
          label: '最近账户活动',
          value: formatRelativeTime(latestActivity.occurredAt),
          hint: latestActivity.propositionTitle,
          tone: 'neutral',
        })
      }

      return (
        <section className="account-settings-section-stack">
          <DetailCards blocks={deviceBlocks} sectionId="devices" />

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>设备与会话管理</strong>
              <p>集中处理设备识别、异常会话提醒与退出控制，不再和安全项混在一起。</p>
            </div>

            <div className="account-settings-control-stack">
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>记住常用设备</strong>
                  <p>减少重复登录确认，但不影响真实认证与风控接入。</p>
                </div>
                {renderSwitchControl(deviceSettings.rememberTrustedDevice, '记住常用设备', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    devices: {
                      ...current.devices,
                      rememberTrustedDevice: !current.devices.rememberTrustedDevice,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>异常登录提醒</strong>
                  <p>检测到新设备或异地会话时，向通知中心追加提醒。</p>
                </div>
                {renderSwitchControl(deviceSettings.sessionAlertsEnabled, '异常登录提醒', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    devices: {
                      ...current.devices,
                      sessionAlertsEnabled: !current.devices.sessionAlertsEnabled,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>退出其他会话</strong>
                  <p>保留操作位，后续接入真实的会话管理接口。</p>
                </div>
                <button className="account-settings-inline-button" type="button">
                  执行占位操作
                </button>
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>退出登录</strong>
                  <p>清空当前静态已登录态，返回未登录壳。</p>
                </div>
                <button className="account-settings-inline-button" type="button" onClick={logout}>
                  退出登录
                </button>
              </div>
            </div>
          </article>
        </section>
      )
    }

    if (activeSection === 'exports') {
      const exportBlocks: DetailBlock[] = [
        {
          title: '可导出内容',
          description: '当前只读层已能获取奖励、声誉、标签；真正的导出任务和文件流仍保持占位。',
          rows: [
            { label: '奖励记录', value: `${currentRewards.length} 条真实记录`, tone: 'info' },
            { label: '声誉摘要', value: reputation ? '可读取' : '等待生成', tone: reputation ? 'info' : 'pending' },
            { label: '税务与对账单', value: '后续补齐', tone: 'pending' },
          ],
        },
      ]

      exportBlocks[0]?.rows.splice(2, 0, {
        label: '已结算结果',
        value: String(settledCount),
        hint: `持仓 ${openPositionCount} 个`,
        tone: settledCount > 0 ? 'info' : 'neutral',
      })
      exportBlocks[0]?.rows.push({
        label: '最近导出',
        value: latestExportCompletedAt ? formatRelativeTime(latestExportCompletedAt) : '待生成',
        hint: latestExportFileName ?? '暂无已完成导出',
        tone: latestExportCompletedAt ? 'info' : 'pending',
      })

      return (
        <section className="account-settings-section-stack">
          <DetailCards blocks={exportBlocks} sectionId="exports" />

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>导出偏好</strong>
              <p>把周期、附件与地址脱敏统一放在一个出口，不再散落在其他设置分区里。</p>
            </div>

            <div className="account-settings-control-stack">
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>默认导出周期</strong>
                  <p>决定收益报告和账户流水的默认时间范围。</p>
                </div>
                <ChoiceGroup
                  options={EXPORT_PERIOD_OPTIONS}
                  value={exportSettings.period}
                  onChange={(nextValue) =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      exports: {
                        ...current.exports,
                        period: nextValue as typeof current.exports.period,
                      },
                    }))
                  }
                />
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>附带结算说明</strong>
                  <p>导出收益报告时，同时附带公开结果与结算批次的说明占位。</p>
                </div>
                {renderSwitchControl(exportSettings.includeSettlementAttachment, '附带结算说明', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    exports: {
                      ...current.exports,
                      includeSettlementAttachment: !current.exports.includeSettlementAttachment,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>导出时脱敏地址</strong>
                  <p>在流水和签名记录导出中保留地址片段，不完整暴露原始地址。</p>
                </div>
                {renderSwitchControl(exportSettings.maskWalletAddress, '导出时脱敏地址', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    exports: {
                      ...current.exports,
                      maskWalletAddress: !current.exports.maskWalletAddress,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>导出快照</strong>
                  <p>基于当前奖励记录、结果概览和偏好设置生成一份真实账户导出记录。</p>
                </div>
                <button
                  className="account-settings-inline-button"
                  type="button"
                  onClick={() => {
                    void createExport().catch(() => {})
                  }}
                >
                  {isExporting ? '生成中...' : '导出账户快照'}
                </button>
              </div>
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>最近导出状态</strong>
                  <p>
                    {latestExportSummary}
                  </p>
                </div>
                <span className="account-settings-inline-value">
                  {isExportsLoading ? '加载中...' : latestExportStatus}
                </span>
              </div>
              {exportsErrorMessage ? (
                <div className="account-settings-control-row">
                  <div className="account-settings-control-copy">
                    <strong>导出同步失败</strong>
                    <p>{exportsErrorMessage}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        </section>
      )
    }

    if (activeSection === 'developer') {
      const developerBlocks: DetailBlock[] = [
        {
          title: '开发者接入状态',
          description: '把原先分散的 Relayer API、开发者码和技术入口统一归档到这里。',
          rows: [
            { label: 'Relayer API 密钥', value: developerSettings.keyCreated ? '已生成示例密钥' : '未生成', tone: developerSettings.keyCreated ? 'info' : 'pending' },
            { label: '开发者码', value: developerSettings.codeEnabled ? '已启用示例码' : '未启用', tone: developerSettings.codeEnabled ? 'info' : 'pending' },
            { label: '环境范围', value: developerSettings.environment === 'sandbox' ? '沙盒' : '生产', tone: 'neutral' },
          ],
        },
      ]

      return (
        <section className="account-settings-section-stack">
          <DetailCards blocks={developerBlocks} sectionId="developer" />

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>API 与访问控制</strong>
              <p>这里保留密钥、来源限制与环境切换的前端产品壳，不接真实后端。</p>
            </div>

            <div className="account-settings-control-stack">
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>当前密钥</strong>
                  <p>仅生成本地示例字符串，不可用于真实请求调用。</p>
                </div>
                <div className="account-settings-inline-actions">
                  <span className="account-settings-code">
                    {developerSettings.keyCreated ? 'sk_relayer_••••••••7Q2M' : '尚未生成'}
                  </span>
                  <button
                    className="account-settings-inline-button"
                    onClick={() =>
                      setPreferencesDraft((current) => ({
                        ...current,
                        developer: {
                          ...current.developer,
                          keyCreated: !current.developer.keyCreated,
                        },
                      }))
                    }
                    type="button"
                  >
                    {developerSettings.keyCreated ? '重置示例密钥' : '生成示例密钥'}
                  </button>
                </div>
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>IP 白名单</strong>
                  <p>预留访问控制入口，后续接入真实来源限制。</p>
                </div>
                {renderSwitchControl(developerSettings.whitelistEnabled, 'IP 白名单', () =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    developer: {
                      ...current.developer,
                      whitelistEnabled: !current.developer.whitelistEnabled,
                    },
                  })),
                )}
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>访问环境</strong>
                  <p>未来可在沙盒与正式网络之间切换。</p>
                </div>
                <ChoiceGroup
                  options={DEVELOPER_ENVIRONMENT_OPTIONS}
                  value={developerSettings.environment}
                  onChange={(nextValue) =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      developer: {
                        ...current.developer,
                        environment: nextValue as typeof current.developer.environment,
                      },
                    }))
                  }
                />
              </div>
            </div>
          </article>

          <article className="account-settings-detail-card">
            <div className="account-settings-detail-head">
              <strong>开发者码与协作</strong>
              <p>把邀请码、测试标识和团队适用范围放到同一分区，避免再拆成独立技术页。</p>
            </div>

            <div className="account-settings-control-stack">
              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>当前开发者码</strong>
                  <p>本地静态字符串，仅用于视觉占位与流程预留。</p>
                </div>
                <div className="account-settings-inline-actions">
                  <span className="account-settings-code">
                    {developerSettings.codeEnabled ? 'ARENA-DEV-7Q2M' : '未启用'}
                  </span>
                  <button
                    className="account-settings-inline-button"
                    onClick={() =>
                      setPreferencesDraft((current) => ({
                        ...current,
                        developer: {
                          ...current.developer,
                          codeEnabled: !current.developer.codeEnabled,
                        },
                      }))
                    }
                    type="button"
                  >
                    {developerSettings.codeEnabled ? '停用示例码' : '启用示例码'}
                  </button>
                </div>
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>适用范围</strong>
                  <p>区分只供自己测试还是在团队内共享。</p>
                </div>
                <ChoiceGroup
                  options={DEVELOPER_SCOPE_OPTIONS}
                  value={developerSettings.scope}
                  onChange={(nextValue) =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      developer: {
                        ...current.developer,
                        scope: nextValue as typeof current.developer.scope,
                      },
                    }))
                  }
                />
              </div>

              <div className="account-settings-control-row">
                <div className="account-settings-control-copy">
                  <strong>开发文档入口</strong>
                  <p>当前只保留说明入口位，后续接产品与接口文档。</p>
                </div>
                <button className="account-settings-inline-button" type="button">
                  查看占位文档
                </button>
              </div>
            </div>
          </article>
        </section>
      )
    }

    return null
  }

  if (!isAuthenticated) {
    return (
      <section className="route-page account-activity-page">
        <section className="account-empty-card">
          <div className="account-empty-icon" aria-hidden="true">
            <UserCircle2 size={28} />
          </div>
          <strong>尚未登录</strong>
          <p>当前头像入口对应账户设置页。请先进入静态已登录态，再查看账户设置内容。</p>
          <div className="account-summary-actions">
            <button className="primary-action" onClick={() => openAuthModal('login')} type="button">
              <LogIn size={16} />
              <span>打开登录弹窗</span>
            </button>
          </div>
        </section>
      </section>
    )
  }

  return (
    <section className="route-page account-activity-page">
      <div className="account-settings-layout">
        <aside className="account-settings-sidebar" aria-label="账户设置导航">
          <div className="account-settings-sidebar-list">
            {SETTINGS_NAV.map((item) => {
              const Icon = item.icon
              const isActive = item.id === activeSection

              return (
                <button
                  key={item.id}
                  type="button"
                  className={isActive ? 'account-settings-nav-item active' : 'account-settings-nav-item'}
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon size={21} strokeWidth={2.1} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <div className="account-settings-main">
          {accountErrorMessage ? (
            <article className="account-settings-detail-card">
              <div className="account-settings-detail-head">
                <strong>账户读模型加载失败</strong>
                <p>{accountErrorMessage}</p>
              </div>
            </article>
          ) : null}
          {isAccountLoading ? (
            <article className="account-settings-detail-card">
              <div className="account-settings-detail-head">
                <strong>正在读取真实账户数据</strong>
                <p>当前会话下的奖励、声誉与标签会在载入后覆盖对应卡片。</p>
              </div>
            </article>
          ) : null}
          {activeSection === 'notifications' ? renderNotifications() : renderInteractiveSection()}
        </div>
      </div>
    </section>
  )
}
