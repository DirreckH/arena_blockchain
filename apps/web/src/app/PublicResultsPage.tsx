import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CheckCircle2 } from 'lucide-react'
import type { PublicSettledResultItemViewModel } from '@arena/shared'
import { FilterStrip } from '../components/navigation/FilterStrip'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { useAuthSession } from '../features/auth/auth-session'
import { formatCategoryLabel } from '../features/arena/arena-ui-mappers'
import { arenaApi } from '../features/api/arena-api'

type PublicResultRecord = {
  propositionId: string
  marketId: string | null
  title: string
  category: string
  winningOptionLabel: string
  validSampleCount: number
  winMarginLabel: string
  settledAtLabel: string
  settlementTxHash: string | null
  onChain: boolean
}

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

function toPublicResultRecord(result: PublicSettledResultItemViewModel): PublicResultRecord {
  return {
    propositionId: result.propositionId,
    marketId: result.marketId,
    title: result.title,
    category: formatCategoryLabel(result.category),
    winningOptionLabel: formatWinningOptionLabel(result),
    validSampleCount: result.validSampleCount,
    winMarginLabel:
      typeof result.winMarginPercent === 'number'
        ? `${result.winMarginPercent.toFixed(1)}%`
        : '不适用',
    settledAtLabel: formatSettledAtLabel(result.settledAt),
    settlementTxHash: result.settlementTxHash,
    onChain: result.onChain,
  }
}

function compareBySettledAtDesc(left: PublicResultRecord, right: PublicResultRecord) {
  return right.settledAtLabel.localeCompare(left.settledAtLabel)
}

function PublicResultRow({ result }: { result: PublicResultRecord }) {
  return (
    <article className="category-card polymarket-row-card polymarket-row-card-no-media">
      <div className="polymarket-row-body">
        <div className="polymarket-row-head">
          <div className="polymarket-row-headline">
            {result.marketId ? (
              <Link className="polymarket-row-title" to={`/zh/event/${result.marketId}`}>
                <strong>{result.title}</strong>
              </Link>
            ) : (
              <span className="polymarket-row-title">
                <strong>{result.title}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="polymarket-row-meta">
          <span className="polymarket-row-meta-item">{result.settledAtLabel} 结算</span>
          <span className="polymarket-row-meta-item">有效样本 {result.validSampleCount}</span>
          <span className="polymarket-row-meta-result">{result.winningOptionLabel}</span>
        </div>

        <div className="polymarket-row-meta">
          <span className="polymarket-row-meta-item">胜出占比 {result.winMarginLabel}</span>
          <span className="polymarket-row-meta-item">
            {result.settlementTxHash ?? '未附链上证据'}
          </span>
          {result.onChain ? (
            <span className="polymarket-row-meta-result">链上结算</span>
          ) : null}
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

  const grouped = useMemo(() => {
    const map = new Map<string, PublicResultRecord[]>()

    for (const market of settledMarkets) {
      const bucket = map.get(market.category) ?? []
      bucket.push(market)
      map.set(market.category, bucket)
    }

    return Array.from(map.entries())
  }, [settledMarkets])

  return (
    <section className="route-page market-page public-results-page">
      <DataSourceBadge mode={displayedSourceMode} />
      <FilterStrip className="market-category-strip" dividerBeforeHref="/zh/politics" />

      <header className="route-header compact public-results-header">
        <h1>公开结果</h1>
        <p>已完成裁决并归档的命题集合，可用于回顾历史结论与公开复核结果。</p>
        <div className="public-results-meta">
          <span className="public-results-meta-pill">
            <CheckCircle2 size={14} />
            已归档结果
          </span>
          <span className="public-results-meta-pill">合计 {settledMarkets.length} 条</span>
          <Link className="public-results-meta-link" to="/zh/accuracy">
            <span>查看复核流程</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
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

      {grouped.map(([category, bucket]) => (
        <section className="prediction-topic-section" aria-label={`${category} 已归档结果`} key={category}>
          <div className="prediction-topic-section-head">
            <div>
              <h2>{category}</h2>
            </div>
            <span className="prediction-topic-count settled">{bucket.length} 条</span>
          </div>
          <div className="market-grid prediction-topic-grid">
            {bucket.map((market) => (
              <PublicResultRow result={market} key={`public-result-${market.propositionId}`} />
            ))}
          </div>
        </section>
      ))}
    </section>
  )
}
