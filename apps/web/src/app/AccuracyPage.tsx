import { CheckCircle2, ChevronRight, ExternalLink, Hash, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'

type ResultTone = 'positive' | 'neutral' | 'info'

interface HistoricalResult {
  id: string
  title: string
  closedAt: string
  category: string
  winningOption: string
  validSampleCount: number
  winMarginPercent: string
  settlementTxHash: string
  onChain: boolean
}

const DEMO_RESULTS: HistoricalResult[] = [
  {
    id: 'public-trust-q1',
    title: '公众是否认为本季度公共服务响应速度有所改善？',
    closedAt: '2026-04-18',
    category: '公共政策',
    winningOption: '改善明显',
    validSampleCount: 612,
    winMarginPercent: '58.3%',
    settlementTxHash: '0x3a8f...e291',
    onChain: true,
  },
  {
    id: 'ai-regulation-march',
    title: '多数受访者是否支持对生成式 AI 实施行业自律规范？',
    closedAt: '2026-03-31',
    category: 'AI 调研',
    winningOption: '支持自律规范',
    validSampleCount: 480,
    winMarginPercent: '61.7%',
    settlementTxHash: '0xb12c...7f04',
    onChain: true,
  },
  {
    id: 'defi-adoption-feb',
    title: '链上用户是否认为 DeFi 协议在 2026 Q1 安全性有所提升？',
    closedAt: '2026-02-28',
    category: '加密',
    winningOption: '安全性有所提升',
    validSampleCount: 344,
    winMarginPercent: '54.1%',
    settlementTxHash: '0x9d44...a812',
    onChain: true,
  },
]

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

function ResultRow({ result }: { result: HistoricalResult }) {
  const tone: ResultTone = result.onChain ? 'positive' : 'neutral'

  return (
    <div className="account-settings-detail-row">
      <div className="account-settings-detail-meta">
        <span style={{ fontSize: '0.92rem', fontWeight: 500 }}>{result.title}</span>
        <small style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: 2 }}>
          <span className={`account-settings-pill ${tone}`}>{result.category}</span>
          <span style={{ opacity: 0.55 }}>{result.closedAt} 开奖</span>
          <span style={{ opacity: 0.55 }}>有效样本 {result.validSampleCount}</span>
        </small>
      </div>
      <em className="account-settings-detail-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
        <span style={{ fontWeight: 600 }}>{result.winningOption}</span>
        <small style={{ opacity: 0.6 }}>胜出占比 {result.winMarginPercent}</small>
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
  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>公开结果复核</h1>
        <p>Arena 所有已结算命题的共识结论均写入链上，任何人可独立核验有效样本数量、开奖依据与奖励分配记录。</p>
      </div>

      <div className="utility-stack">
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
            <strong>近期已结算命题（演示数据）</strong>
            <p>以下为平台近期完成开奖的命题结果摘要，链上哈希可在区块浏览器中独立验证。</p>
          </div>
          <div className="account-settings-detail-list">
            {DEMO_RESULTS.map((result) => (
              <ResultRow key={result.id} result={result} />
            ))}
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
                <small>命题进入开奖流程的时间戳（UTC）</small>
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
