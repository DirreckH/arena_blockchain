import { CheckCircle2, ChevronRight, ExternalLink, Hash, Shield } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PublicSettledResultItemViewModel } from '@arena/shared'
import { Link } from 'react-router-dom'
import { DataSourceBadge } from '../components/shared/DataSourceBadge'
import { formatCategoryLabel } from '../features/arena/arena-ui-mappers'
import { arenaApi } from '../features/api/arena-api'
import { useAuthSession } from '../features/auth/auth-session'

type ResultTone = 'positive' | 'neutral'

type HistoricalResult = {
  id: string
  title: string
  closedAtLabel: string
  categoryLabel: string
  winningOptionLabel: string
  validSampleCount: number
  winMarginLabel: string
  settlementTxHash: string | null
  onChain: boolean
}

const verificationSteps = [
  {
    step: 1,
    title: '查看命题 ID',
    description: '每个已结算命题有唯一 ID，可在结果复核页或下方列表中查询。',
  },
  {
    step: 2,
    title: '比对链上批次',
    description: '结算批次哈希对应链上交易，可在区块浏览器中独立验证结算记录。',
  },
  {
    step: 3,
    title: '核查有效样本数',
    description: '结算时记录的有效样本数与质检结果均可通过链上数据核验，不依赖平台声明。',
  },
]

function formatClosedAtLabel(isoTimestamp: string) {
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

function toHistoricalResult(result: PublicSettledResultItemViewModel): HistoricalResult {
  return {
    id: result.propositionId,
    title: result.title,
    closedAtLabel: formatClosedAtLabel(result.settledAt),
    categoryLabel: formatCategoryLabel(result.category),
    winningOptionLabel: formatWinningOptionLabel(result),
    validSampleCount: result.validSampleCount,
    winMarginLabel:
      typeof result.winMarginPercent === 'number'
        ? `${result.winMarginPercent.toFixed(1)}%`
        : '不适用',
    settlementTxHash: result.settlementTxHash,
    onChain: result.onChain,
  }
}

function buildSourceDetail(_sourceMode: 'live' | 'demo' | 'mixed') {
  return undefined
}

function ResultRow({ result }: { result: HistoricalResult }) {
  const tone: ResultTone = result.onChain ? 'positive' : 'neutral'

  return (
    <div className="account-settings-detail-row">
      <div className="account-settings-detail-meta">
        <span style={{ fontSize: '0.92rem', fontWeight: 500 }}>{result.title}</span>
        <small style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: 2 }}>
          <span className={`account-settings-pill ${tone}`}>{result.categoryLabel}</span>
          <span style={{ opacity: 0.55 }}>{result.closedAtLabel} 结算</span>
          <span style={{ opacity: 0.55 }}>有效样本 {result.validSampleCount}</span>
        </small>
      </div>
      <em className="account-settings-detail-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
        <span style={{ fontWeight: 600 }}>{result.winningOptionLabel}</span>
        <small style={{ opacity: 0.6 }}>胜出占比 {result.winMarginLabel}</small>
        <small style={{ opacity: 0.55 }}>{result.settlementTxHash ?? '未附链上证据'}</small>
        {result.onChain && (
          <small style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-positive)' }}>
            <CheckCircle2 size={11} />
            链上结算
          </small>
        )}
      </em>
    </div>
  )
}

export function AccuracyPage() {
  const { sessionMode } = useAuthSession()
  const [results, setResults] = useState<HistoricalResult[]>([])
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

        setResults(nextResults.data.items.map(toHistoricalResult))
        setSourceMode(nextResults.sourceMode)
      } catch (error) {
        if (disposed) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : '加载公开结果失败')
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

  const settledResultHeading = useMemo(() => {
    return '近期已结算命题'
  }, [])

  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>公开结果复核</h1>
        <p>所有已结算命题的共识结论均写入链上，可独立核验有效样本数量、开奖依据与奖励分配记录。</p>
      </div>

      <div className="utility-stack">
        <DataSourceBadge mode={displayedSourceMode} detail={buildSourceDetail(displayedSourceMode)} />

        <div className="help-grid">
          <div className="help-card">
            <div className="help-card-icon" aria-hidden="true">
              <CheckCircle2 size={16} />
            </div>
            <strong>链上可验证</strong>
            <p>每次开奖的共识结论与奖励权重均以批次形式写入链上，链下声明不构成唯一依据。</p>
          </div>
          <div className="help-card">
            <div className="help-card-icon" aria-hidden="true">
              <Hash size={16} />
            </div>
            <strong>有效样本独立审计</strong>
            <p>质检结果与有效样本计数可通过链上批次哈希独立核查，不依赖平台提供的汇总报告。</p>
          </div>
          <div className="help-card">
            <div className="help-card-icon" aria-hidden="true">
              <Shield size={16} />
            </div>
            <strong>信息边界保护</strong>
            <p>开奖前严格隔离裁决层与验证层数据，开奖后完整历史数据对所有人公开。</p>
          </div>
        </div>

        <article className="account-settings-detail-card">
          <div className="account-settings-detail-head">
            <strong>如何独立核验结果</strong>
            <p>通过以下步骤，你可以在不依赖平台声明的前提下核查任意已结算命题。</p>
          </div>
          <div className="account-settings-detail-list">
            {verificationSteps.map((item) => (
              <div className="account-settings-detail-row" key={item.step}>
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
                      {item.step}
                    </span>
                    {item.title}
                  </span>
                  <small>{item.description}</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="account-settings-detail-card">
          <div className="account-settings-detail-head">
            <strong>{settledResultHeading}</strong>
            <p>以下为平台近期完成结算的命题结果摘要，链上哈希可在区块浏览器中独立验证。</p>
          </div>
          <div className="account-settings-detail-list">
            {isLoading ? (
              <div className="account-settings-detail-row">
                <div className="account-settings-detail-meta">
                  <span>正在读取公开结果归档</span>
                  <small>同步真实结算记录、有效样本与链上交易哈希。</small>
                </div>
              </div>
            ) : null}

            {!isLoading && errorMessage ? (
              <div className="account-settings-detail-row">
                <div className="account-settings-detail-meta">
                  <span>公开结果加载失败</span>
                  <small>{errorMessage}</small>
                </div>
              </div>
            ) : null}

            {!isLoading && !errorMessage && results.length === 0 ? (
              <div className="account-settings-detail-row">
                <div className="account-settings-detail-meta">
                  <span>暂无已结算公开结果</span>
                  <small>当首批非滚动命题完成 reveal 与 settlement 后，会在这里自动归档。</small>
                </div>
              </div>
            ) : null}

            {!isLoading && !errorMessage
              ? results.map((result) => <ResultRow key={result.id} result={result} />)
              : null}
          </div>
        </article>

        <article className="account-settings-detail-card">
          <div className="account-settings-detail-head">
            <strong>结算记录说明</strong>
            <p>结算批次字段释义与链上数据读取说明。</p>
          </div>
          <div className="account-settings-detail-list">
            <div className="account-settings-detail-row">
              <div className="account-settings-detail-meta">
                <span>settlementTxHash</span>
                <small>链上结算交易哈希，可在区块链浏览器中独立验证</small>
              </div>
              <em className="account-settings-detail-value neutral">链上字段</em>
            </div>
            <div className="account-settings-detail-row">
              <div className="account-settings-detail-meta">
                <span>validSampleCount</span>
                <small>质检通过后计入共识池的有效回答数量</small>
              </div>
              <em className="account-settings-detail-value neutral">可核验</em>
            </div>
            <div className="account-settings-detail-row">
              <div className="account-settings-detail-meta">
                <span>winMarginPercent</span>
                <small>胜出选项占有效样本的比例（四舍五入至一位小数）</small>
              </div>
              <em className="account-settings-detail-value neutral">衍生值</em>
            </div>
            <div className="account-settings-detail-row">
              <div className="account-settings-detail-meta">
                <span>closedAt</span>
                <small>命题进入开奖流程并完成结算的时间（UTC）</small>
              </div>
              <em className="account-settings-detail-value neutral">时间戳</em>
            </div>
          </div>
        </article>

        <div className="help-contact-card">
          <div className="help-card-icon" aria-hidden="true">
            <ExternalLink size={16} />
          </div>
          <div className="help-contact-copy">
            <strong>了解信息隔离机制</strong>
            <p>开奖前裁决层与验证层严格隔离，了解 Arena 如何在结构上保证共识结果的可信度。</p>
            <Link className="help-card-link" to="/zh/market-integrity">
              信息边界说明 <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
