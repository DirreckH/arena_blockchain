import { ChevronRight, LogIn, LogOut, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useArenaAccountData } from '../../features/arena/account-data'
import {
  formatRelativeTime,
  summarizeReputationLevel,
  summarizeRewardStatus,
  summarizeTags,
} from '../../features/arena/arena-ui-mappers'
import { useValidationMarketData } from '../../features/validation/validation-market-data'
import {
  ACCOUNT_HEADER_METRICS,
  ACCOUNT_MENU_PRIMARY_LINKS,
  ACCOUNT_MENU_STATUS_ITEMS,
  ACCOUNT_MENU_SUPPORT_LINKS,
  ACCOUNT_OVERVIEW_TIMELINE_ITEMS,
} from '../../mocks/account-shell.mock'
import { navItems } from '../../mocks/arena-market.mock'
import { MarketCardView } from '../market/MarketCardView'
import { AccountShellHeader } from './AccountShellHeader'
import { useRulesIntro } from './RulesIntroContext'

type UtilityVariant = 'search' | 'categories' | 'pages' | 'menu' | 'language' | 'share' | 'news'

function MenuActionGrid({
  title,
  items,
}: {
  title: string
  items: Array<{ label: string; caption: string; href: string }>
}) {
  return (
    <section className="account-menu-section">
      <div className="account-menu-section-head">
        <h2>{title}</h2>
      </div>
      <div className="account-menu-grid">
        {items.map((item) => (
          <Link to={item.href} key={`${title}-${item.href}`} className="account-menu-card">
            <div className="account-menu-card-copy">
              <strong>{item.label}</strong>
              <span>{item.caption}</span>
            </div>
            <ChevronRight size={16} />
          </Link>
        ))}
      </div>
    </section>
  )
}

function MenuStatusPanel({
  items,
  isUsingRealData,
}: {
  items: Array<{ label: string; detail: string; value: string; tone?: string }>
  isUsingRealData: boolean
}) {
  return (
    <section className="account-menu-panel">
      <div className="account-menu-panel-head">
        <h2>账户状态</h2>
        <span>{isUsingRealData ? '使用真实账户读模型。' : '使用共享账户 Shell 基线。'}</span>
      </div>
      <div className="account-menu-status-list">
        {items.map((item) => (
          <div key={item.label} className="account-menu-status-row">
            <div>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
            <em className={item.tone ? `account-menu-value ${item.tone}` : 'account-menu-value'}>{item.value}</em>
          </div>
        ))}
      </div>
    </section>
  )
}

function MenuTimelinePanel({
  items,
  isUsingRealData,
}: {
  items: Array<{ time: string; title: string; detail: string; amount?: string; tone?: string }>
  isUsingRealData: boolean
}) {
  return (
    <section className="account-menu-panel">
      <div className="account-menu-panel-head">
        <h2>近期活动</h2>
        <span>{isUsingRealData ? '展示最新的真实账户事件。' : '展示共享账户 Shell 时间线。'}</span>
      </div>
      <div className="account-menu-timeline">
        {items.map((item) => (
          <div key={`${item.time}-${item.title}`} className="account-menu-timeline-row">
            <span>{item.time}</span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </div>
            <em className={item.tone ? `account-menu-value ${item.tone}` : 'account-menu-value'}>
              {item.amount ?? '-'}
            </em>
          </div>
        ))}
      </div>
    </section>
  )
}

function MenuShell() {
  const { isAuthenticated, logout, mockUser, openAuthModal } = useRulesIntro()
  const { overview, rewards, reputation, tags, rewardSummary, isLoading, errorMessage } = useArenaAccountData()

  if (!isAuthenticated) {
    return (
      <section className="account-menu-layout">
        <section className="account-empty-card">
          <div className="account-empty-icon" aria-hidden="true">
            <LogIn size={28} />
          </div>
          <strong>未登录</strong>
          <p>登录后可从此菜单路由进入真实账户 Shell、偏好设置和活动时间线。</p>
          <div className="account-summary-actions">
            <button className="primary-action" onClick={() => openAuthModal('login')} type="button">
              <LogIn size={16} />
              <span>打开登录</span>
            </button>
          </div>
        </section>

        <MenuActionGrid title="常用入口" items={ACCOUNT_MENU_SUPPORT_LINKS.slice(0, 4)} />
      </section>
    )
  }

  const activeTags = summarizeTags(tags)
  const menuStatusItems = rewards.length > 0 || reputation || tags
    ? [
        {
          label: '当前信誉',
          value: summarizeReputationLevel(reputation),
          detail: reputation
            ? `分值 ${reputation.reputationScore}，共 ${reputation.metrics.reviewedResponseCount} 条已审核回答`
            : '等待信誉数据填充',
        },
        {
          label: '待结算奖励',
          value: `${rewardSummary.pendingAmount} USDC`,
          detail: `${rewardSummary.currentCount} 条奖励账本条目`,
          tone: Number(rewardSummary.pendingAmount) > 0 ? 'positive' : undefined,
        },
        {
          label: '已完成奖励',
          value: `${rewardSummary.finalizedAmount} USDC`,
          detail: '当前奖励账本已结算金额',
          tone: Number(rewardSummary.finalizedAmount) > 0 ? 'positive' : undefined,
        },
        {
          label: '活跃标签',
          value: activeTags.length > 0 ? `${activeTags.length}` : '0',
          detail: activeTags.length > 0 ? activeTags.slice(0, 3).join(' / ') : '暂无账户标签',
        },
      ]
    : ACCOUNT_MENU_STATUS_ITEMS

  const timelineItems = rewards.length > 0
    ? rewards
        .filter((reward) => reward.isCurrent)
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, 4)
        .map((reward) => ({
          time: formatRelativeTime(reward.createdAt),
          title: reward.propositionTitle,
          detail: `${summarizeRewardStatus(reward.status)} / ${reward.reviewStatus ?? 'pending_review'}`,
          amount: reward.status === 'finalized'
            ? `${reward.finalAmount ?? '0'} USDC`
            : `${reward.pendingAmount} USDC`,
          tone: reward.status === 'finalized' ? 'positive' : undefined,
        }))
    : ACCOUNT_OVERVIEW_TIMELINE_ITEMS

  const overviewTimelineItems = overview
    ? overview.resultOverview.recentActivity
        .slice(0, 4)
        .map((item) => ({
          time: formatRelativeTime(item.occurredAt),
          title: item.propositionTitle,
          detail: item.detail,
          amount: item.amount
            ? item.direction === 'positive' && !item.amount.startsWith('-') && item.amount !== '0'
              ? `+${item.amount}.00 USDC`
              : `${item.amount}.00 USDC`
            : undefined,
          tone: item.direction === 'neutral' ? undefined : item.direction,
        }))
    : timelineItems

  const isUsingRealMenuData = !isLoading && overview !== null

  return (
    <section className="account-menu-layout">
      <AccountShellHeader
        user={mockUser}
        title="账户菜单"
        description="使用同一个账户 Shell 访问活动、设置和支持路由，无需切换当前产品语言。"
        metrics={rewards.length > 0 || reputation ? [
          {
            label: '待结算奖励',
            value: `${rewardSummary.pendingAmount} USDC`,
            detail: '真实奖励账本待结算金额',
            tone: Number(rewardSummary.pendingAmount) > 0 ? 'positive' : undefined,
          },
          {
            label: '已完成奖励',
            value: `${rewardSummary.finalizedAmount} USDC`,
            detail: '当前已结算奖励金额',
            tone: Number(rewardSummary.finalizedAmount) > 0 ? 'positive' : undefined,
          },
          {
            label: '信誉',
            value: summarizeReputationLevel(reputation),
            detail: reputation ? `分值 ${reputation.reputationScore}` : '等待刷新',
          },
          {
            label: '标签',
            value: String(activeTags.length),
            detail: activeTags.length > 0 ? activeTags.slice(0, 2).join(' / ') : '暂无标签',
          },
        ] : ACCOUNT_HEADER_METRICS}
        actions={(
          <button className="secondary-action account-menu-logout" onClick={logout} type="button">
            <LogOut size={16} />
            <span>退出登录</span>
          </button>
        )}
      />

      <div className="account-menu-main-grid">
        <div className="account-menu-main-column">
          <MenuActionGrid title="账户入口" items={ACCOUNT_MENU_PRIMARY_LINKS} />
          <MenuActionGrid title="支持与工具" items={ACCOUNT_MENU_SUPPORT_LINKS} />
        </div>
        <div className="account-menu-side-column">
          {errorMessage ? (
            <section className="account-menu-panel">
              <div className="account-menu-panel-head">
                <h2>账户数据不可用</h2>
                <span>{errorMessage}</span>
              </div>
            </section>
          ) : null}
          <MenuStatusPanel items={menuStatusItems} isUsingRealData={isUsingRealMenuData} />
          <MenuTimelinePanel items={overviewTimelineItems} isUsingRealData={isUsingRealMenuData} />
        </div>
      </div>
    </section>
  )
}

export function UtilityPage({
  title,
  description,
  variant,
}: {
  title: string
  description: string
  variant: UtilityVariant
}) {
  const { markets: publicMarkets } = useValidationMarketData()
  const categoryLinks = navItems.slice(3)
  const pageLinks = [
    ...ACCOUNT_MENU_PRIMARY_LINKS,
    ...ACCOUNT_MENU_SUPPORT_LINKS.filter((item) => item.href !== '/zh/activity'),
  ]
  const visibleMarkets = publicMarkets.slice(0, 6)

  if (variant === 'menu') {
    return (
      <section className="route-page utility-page utility-page-menu">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <MenuShell />
      </section>
    )
  }

  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      {variant === 'search' ? (
        <div className="route-search">
          <Search size={22} />
          <input readOnly value="" placeholder="搜索命题、主题或公开结果" />
        </div>
      ) : null}

      {variant === 'language' ? (
        <div className="route-list">
          {['中文', 'English', 'Español', 'Français'].map((language) => (
            <Link className={language === '中文' ? 'route-list-item selected' : 'route-list-item'} to="/zh" key={language}>
              <span>{language}</span>
              <ChevronRight size={18} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="route-link-grid">
          {(variant === 'pages' ? pageLinks : categoryLinks).map((item, index) => (
            <Link to={item.href} key={`${variant}-${item.href}-${index}`}>
              <strong>{item.label}</strong>
              <span>{variant === 'pages' ? item.caption : '打开其他市场分类入口。'}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="market-grid route-grid">
        {visibleMarkets.map((market) => (
          <MarketCardView market={market} key={`${variant}-${market.id}`} />
        ))}
      </div>
    </section>
  )
}
