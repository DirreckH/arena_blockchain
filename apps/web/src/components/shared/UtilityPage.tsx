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
        <h2>Account status</h2>
        <span>{isUsingRealData ? 'Using the real account read model.' : 'Using the shared account shell baseline.'}</span>
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
        <h2>Recent activity</h2>
        <span>{isUsingRealData ? 'Showing the most recent real account events.' : 'Showing the shared account shell timeline.'}</span>
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
          <strong>Not signed in</strong>
          <p>Sign in to open the real account shell, preferences surface, and activity timeline from this menu route.</p>
          <div className="account-summary-actions">
            <button className="primary-action" onClick={() => openAuthModal('login')} type="button">
              <LogIn size={16} />
              <span>Open sign-in</span>
            </button>
          </div>
        </section>

        <MenuActionGrid title="General entry points" items={ACCOUNT_MENU_SUPPORT_LINKS.slice(0, 4)} />
      </section>
    )
  }

  const activeTags = summarizeTags(tags)
  const menuStatusItems = rewards.length > 0 || reputation || tags
    ? [
        {
          label: 'Current reputation',
          value: summarizeReputationLevel(reputation),
          detail: reputation
            ? `Score ${reputation.reputationScore} across ${reputation.metrics.reviewedResponseCount} reviewed responses`
            : 'Waiting for reputation data to populate',
        },
        {
          label: 'Pending rewards',
          value: `${rewardSummary.pendingAmount} USDC`,
          detail: `${rewardSummary.currentCount} current reward ledger entries`,
          tone: Number(rewardSummary.pendingAmount) > 0 ? 'positive' : undefined,
        },
        {
          label: 'Finalized rewards',
          value: `${rewardSummary.finalizedAmount} USDC`,
          detail: 'Current reward ledger settled amount',
          tone: Number(rewardSummary.finalizedAmount) > 0 ? 'positive' : undefined,
        },
        {
          label: 'Active tags',
          value: activeTags.length > 0 ? `${activeTags.length}` : '0',
          detail: activeTags.length > 0 ? activeTags.slice(0, 3).join(' / ') : 'No account tags yet',
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
        title="Account menu"
        description="Use the same account shell to reach activity, settings, and support routes without changing the current product language."
        metrics={rewards.length > 0 || reputation ? [
          {
            label: 'Pending rewards',
            value: `${rewardSummary.pendingAmount} USDC`,
            detail: 'Real reward ledger pending amount',
            tone: Number(rewardSummary.pendingAmount) > 0 ? 'positive' : undefined,
          },
          {
            label: 'Finalized rewards',
            value: `${rewardSummary.finalizedAmount} USDC`,
            detail: 'Current settled reward amount',
            tone: Number(rewardSummary.finalizedAmount) > 0 ? 'positive' : undefined,
          },
          {
            label: 'Reputation',
            value: summarizeReputationLevel(reputation),
            detail: reputation ? `Score ${reputation.reputationScore}` : 'Waiting for refresh',
          },
          {
            label: 'Tags',
            value: String(activeTags.length),
            detail: activeTags.length > 0 ? activeTags.slice(0, 2).join(' / ') : 'No tags yet',
          },
        ] : ACCOUNT_HEADER_METRICS}
        actions={(
          <button className="secondary-action account-menu-logout" onClick={logout} type="button">
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        )}
      />

      <div className="account-menu-main-grid">
        <div className="account-menu-main-column">
          <MenuActionGrid title="Account entry points" items={ACCOUNT_MENU_PRIMARY_LINKS} />
          <MenuActionGrid title="Support and tools" items={ACCOUNT_MENU_SUPPORT_LINKS} />
        </div>
        <div className="account-menu-side-column">
          {errorMessage ? (
            <section className="account-menu-panel">
              <div className="account-menu-panel-head">
                <h2>Account data unavailable</h2>
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
          <input readOnly value="" placeholder="Search propositions, topics, or public results" />
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
              <span>{variant === 'pages' ? item.caption : 'Open another market category entry point.'}</span>
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
