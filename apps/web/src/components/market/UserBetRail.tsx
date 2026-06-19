import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { filterUserOpenMarkets, filterUserSettledMarkets } from '../../features/arena/arena-ui-mappers'
import { useValidationMarketData } from '../../features/validation/validation-market-data'

const USER_BET_PREVIEW_LIMIT = 5

type UserBetItem = {
  href: string
  title: string
  positionLabel: string
  stakeLabel: string
  statusLabel: string
  resultLabel?: string
  resultTone?: 'neutral' | 'positive' | 'negative'
}

function mapOpenMarketToBetItem(market: ReturnType<typeof filterUserOpenMarkets>[number]): UserBetItem {
  const position = market.currentUserPosition
  const selectedOption = typeof position?.selectedOption === 'number'
    ? market.options[position.selectedOption] ?? `选项 ${position.selectedOption + 1}`
    : '未知选项'

  return {
    href: `/zh/event/${market.marketId}`,
    title: market.title,
    positionLabel: `已押 ${selectedOption}`,
    stakeLabel: `${position?.stakeAmount ?? '0'} USDC`,
    statusLabel: market.publicProgress.publicState.phase === 'frozen' ? '待公开' : '进行中',
    resultTone: 'neutral',
  }
}

function mapSettledMarketToBetItem(market: ReturnType<typeof filterUserSettledMarkets>[number]): UserBetItem {
  const position = market.currentUserPosition
  const outcome = position?.settlementOutcome
  const pnl = position?.pnl

  return {
    href: `/zh/event/${market.marketId}`,
    title: market.title,
    positionLabel: `已押 ${typeof position?.selectedOption === 'number' ? market.options[position.selectedOption] : '已结算'}`,
    stakeLabel: `${position?.stakeAmount ?? '0'} USDC`,
    statusLabel: outcome === 'won' ? '命中' : outcome === 'lost' ? '未中' : '退款',
    resultLabel: pnl ? `${pnl} USDC` : undefined,
    resultTone: outcome === 'won' ? 'positive' : outcome === 'lost' ? 'negative' : 'neutral',
  }
}

export function UserBetRail() {
  const [activeTab, setActiveTab] = useState<'open' | 'settled'>('open')
  const { rawMarkets } = useValidationMarketData()

  const openItems = useMemo(
    () => filterUserOpenMarkets(rawMarkets).map(mapOpenMarketToBetItem),
    [rawMarkets],
  )
  const settledItems = useMemo(
    () => filterUserSettledMarkets(rawMarkets).map(mapSettledMarketToBetItem),
    [rawMarkets],
  )
  const currentItems = activeTab === 'open' ? openItems : settledItems
  const visibleItems = useMemo(
    () => currentItems.slice(0, USER_BET_PREVIEW_LIMIT),
    [currentItems],
  )

  return (
    <aside className="right-rail user-bet-rail" aria-label="已下注命题">
      <section className="rail-section user-bet-panel">
        <Link to="/zh/results?tab=wagers" className="rail-heading">
          已下注命题
          <ChevronRight size={18} />
        </Link>

        <div className="bet-list" aria-label={activeTab === 'open' ? '未开奖命题' : '已开奖命题'}>
          {visibleItems.length > 0 ? visibleItems.map((item) => (
            <BetRow item={item} key={item.href} />
          )) : (
            <div className="bet-row">
              <div className="bet-copy">
                <strong>暂无数据</strong>
                <small>当前登录态下没有可展示的真实持仓市场。</small>
              </div>
            </div>
          )}
        </div>

        <div className="bet-toggle-bar" aria-label="投注状态切换">
          <button
            className={activeTab === 'open' ? 'bet-toggle active' : 'bet-toggle'}
            onClick={() => setActiveTab('open')}
            type="button"
          >
            未开奖
          </button>
          <button
            className={activeTab === 'settled' ? 'bet-toggle active' : 'bet-toggle'}
            onClick={() => setActiveTab('settled')}
            type="button"
          >
            已开奖
          </button>
        </div>
      </section>
    </aside>
  )
}

function BetRow({ item }: { item: UserBetItem }) {
  return (
    <Link className="bet-row" to={item.href}>
      <div className="bet-copy">
        <strong>{item.title}</strong>
        <small>{item.positionLabel} 路 {item.stakeLabel}</small>
      </div>
      <div className="bet-side">
        <span className={`bet-state-pill ${item.resultTone ?? 'neutral'}`}>{item.statusLabel}</span>
        {item.resultLabel ? <em className={`bet-result ${item.resultTone ?? 'neutral'}`}>{item.resultLabel}</em> : null}
      </div>
    </Link>
  )
}
