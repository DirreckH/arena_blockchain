import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Crown, Medal } from 'lucide-react'
import type { PublicRespondentLeaderboardCategoryViewModel } from '@arena/shared'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { computeAnchoredDropdownLayout } from '../components/shared/anchored-dropdown-position'
import { useDiscoveryData } from '../features/arena/discovery-data'
import { useAuthSession } from '../features/auth/auth-session'

type RespondentLeaderboardRow = {
  rank: number
  userId: string
  handle: string
  walletShort: string
  responseRatePercent: number
  reviewedCount: number
  acceptedCount: number
  reputationScore: number
  topTag: string
}

type CategoryLeaderboard = {
  id: string
  label: string
  description: string
  rows: RespondentLeaderboardRow[]
}

const FILTER_DROPDOWN_GAP = 8
const FILTER_DROPDOWN_VIEWPORT_PADDING = 12

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function rankBadgeIcon(rank: number) {
  if (rank === 1) {
    return <Crown size={14} aria-hidden="true" />
  }

  if (rank === 2 || rank === 3) {
    return <Medal size={14} aria-hidden="true" />
  }

  return null
}

function toCategoryLeaderboard(
  category: PublicRespondentLeaderboardCategoryViewModel,
): CategoryLeaderboard {
  return {
    id: category.id,
    label: category.label,
    description: category.description,
    rows: category.rows.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      handle: row.handle,
      walletShort: row.walletShort,
      responseRatePercent: row.responseRatePercent,
      reviewedCount: row.reviewedCount,
      acceptedCount: row.acceptedCount,
      reputationScore: row.reputationScore,
      topTag: row.topTag,
    })),
  }
}

export function LeaderboardPage() {
  const {
    respondentLeaderboard,
    sourceMode: discoverySourceMode,
    errorMessage: discoveryErrorMessage,
  } = useDiscoveryData()
  const { sessionMode } = useAuthSession()
  const responseRateLeaderboards = useMemo(
    () => (respondentLeaderboard?.categories ?? []).map(toCategoryLeaderboard),
    [respondentLeaderboard],
  )
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const filterButtonRef = useRef<HTMLButtonElement | null>(null)
  const filterDropdownRef = useRef<HTMLDivElement | null>(null)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})
  const portalTarget = typeof document !== 'undefined' ? document.body : null

  const resolvedActiveCategoryId = useMemo(() => {
    if (responseRateLeaderboards.some((category) => category.id === activeCategoryId)) {
      return activeCategoryId
    }

    return responseRateLeaderboards[0]?.id ?? ''
  }, [activeCategoryId, responseRateLeaderboards])

  const activeCategory =
    responseRateLeaderboards.find((category) => category.id === resolvedActiveCategoryId)
    ?? responseRateLeaderboards[0]

  const displayedSourceMode = sessionMode === 'demo' ? 'demo' : discoverySourceMode

  useLayoutEffect(() => {
    if (!filterMenuOpen) {
      setDropdownStyle({})
      return
    }

    let frameId = 0

    const updateDropdownPosition = () => {
      if (!filterButtonRef.current || !filterDropdownRef.current) {
        return
      }

      const layout = computeAnchoredDropdownLayout({
        triggerRect: filterButtonRef.current.getBoundingClientRect(),
        dropdownWidth: filterDropdownRef.current.offsetWidth || 240,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        viewportPadding: FILTER_DROPDOWN_VIEWPORT_PADDING,
        triggerGap: FILTER_DROPDOWN_GAP,
      })

      setDropdownStyle({
        top: `${layout.top}px`,
        left: `${layout.left}px`,
        maxHeight: `${layout.maxHeight}px`,
      })
    }

    updateDropdownPosition()
    frameId = window.requestAnimationFrame(updateDropdownPosition)
    window.addEventListener('resize', updateDropdownPosition)
    window.addEventListener('scroll', updateDropdownPosition, true)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateDropdownPosition)
      window.removeEventListener('scroll', updateDropdownPosition, true)
    }
  }, [filterMenuOpen])

  return (
    <section className="route-page leaderboard-page">
      <DataSourceBadge mode={displayedSourceMode} />

      <header className="route-header compact leaderboard-header">
        <h1>排行榜</h1>
      </header>

      {discoveryErrorMessage ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>排行榜加载失败</h2>
            <span>{discoveryErrorMessage}</span>
          </div>
        </section>
      ) : null}

      <section className="leaderboard-section" aria-label="按话题用户回答率排行">
        <div className="leaderboard-section-head">
          <div>
            <h2>各话题回答率排行</h2>
            <p>切换话题查看该领域内表现最稳定的应答用户，回答率结合质检通过率统计。</p>
          </div>
          {activeCategory ? (
            <div className="leaderboard-filter-shell">
              <button
                ref={filterButtonRef}
                type="button"
                className={`leaderboard-filter-button${filterMenuOpen ? ' open' : ''}`}
                aria-haspopup="menu"
                aria-expanded={filterMenuOpen}
                aria-controls="leaderboard-topic-filter-menu"
                onClick={() => setFilterMenuOpen((value) => !value)}
              >
                <span className="leaderboard-filter-button-label">筛选</span>
                <strong>{activeCategory.label}</strong>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        {activeCategory ? (
          <article className="leaderboard-table-card">
            <div className="leaderboard-table-card-head">
              <strong>{activeCategory.label}</strong>
              <span>{activeCategory.description}</span>
            </div>

            <div className="leaderboard-table-wrapper" role="region" aria-label={`${activeCategory.label} 用户排行表`}>
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th scope="col">排名</th>
                    <th scope="col">用户</th>
                    <th scope="col">回答率</th>
                    <th scope="col">质检通过</th>
                    <th scope="col">信誉值</th>
                    <th scope="col">擅长标签</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCategory.rows.map((row) => (
                    <tr key={`${activeCategory.id}-${row.userId}`}>
                      <th scope="row">
                        <span className={`leaderboard-rank rank-${Math.min(row.rank, 4)}`}>
                          {rankBadgeIcon(row.rank)}
                          {row.rank}
                        </span>
                      </th>
                      <td>
                        <div className="leaderboard-user-cell">
                          <strong>{row.handle}</strong>
                          <span>{row.walletShort}</span>
                        </div>
                      </td>
                      <td>
                        <div className="leaderboard-progress-cell">
                          <span
                            className="leaderboard-progress-bar"
                            aria-hidden="true"
                            style={{ width: `${Math.min(100, row.responseRatePercent)}%` }}
                          />
                          <strong>{formatPercent(row.responseRatePercent)}</strong>
                        </div>
                      </td>
                      <td>
                        <span className="leaderboard-numeric">
                          {row.acceptedCount}
                          <em>/ {row.reviewedCount}</em>
                        </span>
                      </td>
                      <td>
                        <span className="leaderboard-numeric">{row.reputationScore}</span>
                      </td>
                      <td>
                        <span className="leaderboard-tag-pill">{row.topTag}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="leaderboard-table-foot">
              <span>排行计算窗口：最近 30 天</span>
              <Link to="/zh/accuracy">了解回答率与质检规则</Link>
            </footer>
          </article>
        ) : null}
      </section>

      {filterMenuOpen && portalTarget && activeCategory ? createPortal(
        <>
          <div className="more-dropdown-overlay" onClick={() => setFilterMenuOpen(false)} />
          <div
            ref={filterDropdownRef}
            id="leaderboard-topic-filter-menu"
            className="more-dropdown leaderboard-filter-menu"
            style={dropdownStyle}
            role="menu"
            aria-label="排行榜话题筛选"
          >
            <div className="leaderboard-filter-menu-head">
              <strong>筛选话题</strong>
              <span>选择一个话题查看对应回答率排行。</span>
            </div>
            <div className="leaderboard-filter-menu-list">
              {responseRateLeaderboards.map((category) => {
                const isActive = category.id === resolvedActiveCategoryId

                return (
                  <button
                    key={category.id}
                    type="button"
                    className={`leaderboard-filter-menu-item${isActive ? ' active' : ''}`}
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      setActiveCategoryId(category.id)
                      setFilterMenuOpen(false)
                    }}
                  >
                    <div className="leaderboard-filter-menu-copy">
                      <strong>{category.label}</strong>
                      <span>{category.description}</span>
                    </div>
                    {isActive ? <Check size={16} aria-hidden="true" /> : null}
                  </button>
                )
              })}
            </div>
          </div>
        </>,
        portalTarget,
      ) : null}
    </section>
  )
}
