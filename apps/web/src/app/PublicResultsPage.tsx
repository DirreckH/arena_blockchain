import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PropositionCategory, PublicSettledResultItemViewModel } from '@arena/shared'
import { MarketSearchBar } from '../components/market/MarketSearchBar'
import { FilterStrip } from '../components/navigation/FilterStrip'
import { computeAnchoredDropdownLayout } from '../components/shared/anchored-dropdown-position'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useAuthSession } from '../features/auth/auth-session'
import { formatCategoryLabel } from '../features/arena/arena-ui-mappers'
import { arenaApi } from '../features/api/arena-api'

type PublicResultRecord = {
  propositionId: string
  marketId: string | null
  title: string
  category: string
  categoryMonogram: string
  winningOptionLabel: string
  validSampleCount: number
  winMarginPercent: number | null
  winMarginLabel: string
  settledAtLabel: string
  settlementTxHash: string | null
  settlementTxHashLabel: string
  onChain: boolean
}

type PublicResultFilterOption = {
  id: string
  label: string
  count: number
}

const FILTER_DROPDOWN_GAP = 8
const FILTER_DROPDOWN_VIEWPORT_PADDING = 12

function formatSettledAtLabel(isoTimestamp: string) {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp
  }

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatWinningOptionLabel(result: PublicSettledResultItemViewModel) {
  if (result.resultKind === 'void') {
    return result.voidReason ? `作废：${result.voidReason}` : '作废结算'
  }

  return result.winningOptionLabel ?? '已公开结果'
}

function categoryMonogram(category: PropositionCategory | string) {
  switch (category) {
    case 'dao':
      return 'DAO'
    case 'politics':
      return 'PP'
    case 'ai':
      return 'AI'
    case 'sports':
      return 'SP'
    case 'brand_research':
      return 'CR'
    case 'entertainment':
      return 'EN'
    case 'general':
    default:
      return 'GN'
  }
}

function shortenHash(hash: string | null) {
  if (!hash) {
    return '未附链上证据'
  }

  if (hash.length <= 18) {
    return hash
  }

  return `${hash.slice(0, 8)}...${hash.slice(-6)}`
}

function toPublicResultRecord(result: PublicSettledResultItemViewModel): PublicResultRecord {
  return {
    propositionId: result.propositionId,
    marketId: result.marketId,
    title: result.title,
    category: formatCategoryLabel(result.category),
    categoryMonogram: categoryMonogram(result.category),
    winningOptionLabel: formatWinningOptionLabel(result),
    validSampleCount: result.validSampleCount,
    winMarginPercent: typeof result.winMarginPercent === 'number' ? result.winMarginPercent : null,
    winMarginLabel:
      typeof result.winMarginPercent === 'number'
        ? `${result.winMarginPercent.toFixed(1)}%`
        : '不适用',
    settledAtLabel: formatSettledAtLabel(result.settledAt),
    settlementTxHash: result.settlementTxHash,
    settlementTxHashLabel: shortenHash(result.settlementTxHash),
    onChain: result.onChain,
  }
}

function compareBySettledAtDesc(left: PublicResultRecord, right: PublicResultRecord) {
  return right.settledAtLabel.localeCompare(left.settledAtLabel)
}

function buildFilterOptions(results: PublicResultRecord[]): PublicResultFilterOption[] {
  const buckets = new Map<string, PublicResultFilterOption>()

  for (const result of results) {
    const current = buckets.get(result.category) ?? {
      id: result.category,
      label: result.category,
      count: 0,
    }

    current.count += 1
    buckets.set(result.category, current)
  }

  return [
    {
      id: 'all',
      label: '全部话题',
      count: results.length,
    },
    ...Array.from(buckets.values()).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
  ]
}

function PublicResultCard({
  result,
  sampleSharePercent,
}: {
  result: PublicResultRecord
  sampleSharePercent: number
}) {
  return (
    <article className="public-result-card" data-testid={`public-result-card-${result.propositionId}`}>
      <div className="public-result-card-head">
        <div className="public-result-card-media" aria-hidden="true">
          <span>{result.categoryMonogram}</span>
        </div>
        <div className="public-result-card-copy">
          {result.marketId ? (
            <Link className="public-result-card-title" to={`/zh/event/${result.marketId}`}>
              <strong>{result.title}</strong>
            </Link>
          ) : (
            <span className="public-result-card-title">
              <strong>{result.title}</strong>
            </span>
          )}

          <div className="public-result-card-meta">
            <span>{result.category}</span>
            <span>{result.settledAtLabel} 结算</span>
          </div>
        </div>
      </div>

      <div className="public-result-card-metric">
        <div className="public-result-card-metric-row">
          <span>胜出占比</span>
          <strong>{result.winMarginLabel}</strong>
        </div>
        <div className="public-result-card-track" aria-hidden="true">
          <span style={{ width: `${Math.max(result.winMarginPercent ?? 0, 8)}%` }} />
        </div>
      </div>

      <div className="public-result-card-metric">
        <div className="public-result-card-metric-row">
          <span>有效样本</span>
          <strong>{result.validSampleCount}</strong>
        </div>
        <div className="public-result-card-track" aria-hidden="true">
          <span style={{ width: `${Math.max(sampleSharePercent, 8)}%` }} />
        </div>
      </div>

      <div className="public-result-card-proof">
        <span>结算记录</span>
        <strong title={result.settlementTxHash ?? result.settlementTxHashLabel}>{result.settlementTxHashLabel}</strong>
      </div>

      <div className="public-result-card-outcomes">
        <div className="public-result-card-outcome public-result-card-outcome--winner">
          <small>公开结果</small>
          <strong>{result.winningOptionLabel}</strong>
        </div>
        <div className="public-result-card-outcome">
          <small>结算状态</small>
          <strong>{result.onChain ? '链上结算' : '站内归档'}</strong>
        </div>
      </div>
    </article>
  )
}

export function PublicResultsPage() {
  const { sessionMode } = useAuthSession()
  const [results, setResults] = useState<PublicResultRecord[]>([])
  const [sourceMode, setSourceMode] = useState<'live' | 'demo' | 'mixed'>('live')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeFilterId, setActiveFilterId] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const filterButtonRef = useRef<HTMLButtonElement | null>(null)
  const filterDropdownRef = useRef<HTMLDivElement | null>(null)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})
  const portalTarget = typeof document !== 'undefined' ? document.body : null

  useEffect(() => {
    let disposed = false

    void (async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const nextResults = await arenaApi.getPublicSettledResultsFeed()
        if (disposed) {
          return
        }

        setResults(nextResults.data.items.map(toPublicResultRecord))
        setSourceMode(nextResults.sourceMode)
      } catch (error) {
        if (disposed) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : '公开结果加载失败')
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
    : sourceMode

  const settledMarkets = useMemo(
    () => results.slice().sort(compareBySettledAtDesc),
    [results],
  )

  const filterOptions = useMemo(
    () => buildFilterOptions(settledMarkets),
    [settledMarkets],
  )

  const resolvedFilterId = useMemo(() => {
    if (filterOptions.some((option) => option.id === activeFilterId)) {
      return activeFilterId
    }

    return filterOptions[0]?.id ?? 'all'
  }, [activeFilterId, filterOptions])

  const activeFilter = filterOptions.find((option) => option.id === resolvedFilterId) ?? filterOptions[0] ?? null
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const visibleResults = useMemo(() => {
    const filteredResults = resolvedFilterId === 'all'
      ? settledMarkets
      : settledMarkets.filter((result) => result.category === resolvedFilterId)

    if (normalizedSearchQuery.length === 0) {
      return filteredResults
    }

    return filteredResults.filter((result) => {
      const searchableText = [result.title, result.category, result.winningOptionLabel]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(normalizedSearchQuery)
    })
  }, [normalizedSearchQuery, resolvedFilterId, settledMarkets])

  const maxSampleCount = useMemo(
    () => Math.max(...settledMarkets.map((result) => result.validSampleCount), 1),
    [settledMarkets],
  )

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
        dropdownWidth: filterDropdownRef.current.offsetWidth || 280,
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
    <section className="route-page market-page public-results-page">
      <DataSourceBadge mode={displayedSourceMode} />
      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      <header className="route-header compact public-results-header">
        <h1>公开结果</h1>
        <p>已完成裁决并归档的命题集合，可用于回顾历史结论与公开复核结果。</p>
      </header>

      {errorMessage ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>公开结果加载失败</h2>
            <span>{errorMessage}</span>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="account-menu-panel">
          <div className="account-menu-panel-head">
            <h2>正在加载公开结果</h2>
            <span>Arena 正在汇总已归档命题的最终结果与复核状态。</span>
          </div>
        </section>
      ) : null}

      {!isLoading && settledMarkets.length === 0 && !errorMessage ? (
        <section className="account-menu-panel public-results-empty-panel">
          <div className="account-menu-panel-head">
            <h2>当前还没有归档的公开结果</h2>
            <span>命题需要走完样本门槛、公开窗口与复核流程之后才会出现在这里。</span>
          </div>
          <Link className="public-results-empty-cta" to="/zh">
            返回热门命题
          </Link>
        </section>
      ) : null}

      {!isLoading && settledMarkets.length > 0 && !errorMessage ? (
        <section className="public-results-board" aria-label="公开结果卡片区">
          <div className="public-results-board-head">
            <MarketSearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={'\u641c\u7d22\u516c\u5f00\u7ed3\u679c'}
              className="public-results-board-search"
            />
            <div className="public-results-board-actions">
              <Link className="public-results-meta-link" to="/zh/accuracy">
                查看复核流程
              </Link>

              {activeFilter ? (
                <div className="leaderboard-filter-shell">
                  <button
                    ref={filterButtonRef}
                    type="button"
                    className={`leaderboard-filter-button${filterMenuOpen ? ' open' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={filterMenuOpen}
                    aria-controls="public-results-filter-menu"
                    aria-label={`筛选 ${activeFilter.label}`}
                    onClick={() => setFilterMenuOpen((current) => !current)}
                  >
                    <span className="leaderboard-filter-button-label">筛选</span>
                    <strong>{activeFilter.label}</strong>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {visibleResults.length > 0 ? (
            <div className="public-results-card-grid">
              {visibleResults.map((result) => (
                <PublicResultCard
                  key={`public-result-${result.propositionId}`}
                  result={result}
                  sampleSharePercent={(result.validSampleCount / maxSampleCount) * 100}
                />
              ))}
            </div>
          ) : (
            <section className="public-results-empty-panel public-results-filter-empty">
              <div className="account-menu-panel-head">
                <h2>当前筛选下暂无公开结果</h2>
                <span>试试切换到其他话题，或者选择“全部话题”查看完整归档卡片。</span>
              </div>
            </section>
          )}
        </section>
      ) : null}

      {filterMenuOpen && portalTarget && activeFilter ? createPortal(
        <>
          <div className="more-dropdown-overlay" onClick={() => setFilterMenuOpen(false)} />
          <div
            ref={filterDropdownRef}
            id="public-results-filter-menu"
            className="more-dropdown leaderboard-filter-menu"
            style={dropdownStyle}
            role="menu"
            aria-label="公开结果话题筛选"
          >
            <div className="leaderboard-filter-menu-head">
              <strong>筛选公开结果</strong>
              <span>按不同话题类型筛选当前页中的公开结果卡片。</span>
            </div>

            <div className="leaderboard-filter-menu-list">
              {filterOptions.map((option) => {
                const isActive = option.id === resolvedFilterId

                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`leaderboard-filter-menu-item${isActive ? ' active' : ''}`}
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      setActiveFilterId(option.id)
                      setFilterMenuOpen(false)
                    }}
                  >
                    <div className="leaderboard-filter-menu-copy">
                      <strong>{option.label}</strong>
                      <span>{option.count} 条公开结果</span>
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
