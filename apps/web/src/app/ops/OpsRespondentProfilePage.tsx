import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  useOpsRespondentReputation,
  useOpsRespondentTags,
  useOpsRewards,
} from '../../features/arena/ops-console-data'
import { fmtDate } from '../../features/arena/ops-format'
import { opsCopy } from '../../features/arena/ops-copy'
import { statusLabel } from '../../features/arena/ops-status-labels'

type ErrorStateKind = 'not_found' | 'unauthorized' | 'forbidden' | 'network' | 'unknown'

type OpsRespondentProfilePageProps = {
  token: string
  userId: string
  formatPercent: (value: number) => string
  EmptyComponent: ComponentType<{ message: string }>
  LoadingComponent: ComponentType
  InlineMetricComponent: ComponentType<{ label: string; value: string }>
  ErrorComponent: ComponentType<{
    kind: ErrorStateKind
    message: string
    onRetry?: () => void
    statusCode?: number
  }>
}

export function OpsRespondentProfilePage({
  token,
  userId,
  formatPercent,
  EmptyComponent,
  LoadingComponent,
  InlineMetricComponent,
  ErrorComponent,
}: OpsRespondentProfilePageProps) {
  const reputation = useOpsRespondentReputation(token, userId)
  const tags = useOpsRespondentTags(token, userId)
  const rewards = useOpsRewards(token, { userId })

  const reputationData = reputation.state.status === 'ok' ? reputation.state.data : null
  const tagData = tags.state.status === 'ok' ? tags.state.data : null
  const rewardData = rewards.state.status === 'ok' ? rewards.state.data.items : []

  return (
    <div className="detail-layout">
      <div className="detail-main-stack">
        <section className="detail-panel">
          <div className="ops-list-row">
            <div>
              <h2>{opsCopy.respondent.title}</h2>
              <p className="ops-muted">{userId}</p>
            </div>
            <div className="ops-actions">
              <button
                className="ops-refresh-btn"
                onClick={() => {
                  reputation.refresh()
                  tags.refresh()
                  rewards.refresh()
                }}
                type="button"
              >
                {opsCopy.actions.refresh}
              </button>
            </div>
          </div>
        </section>

        <section className="detail-panel">
          <div className="ops-section">
            <p className="ops-section-title">{opsCopy.respondent.reputationTitle}</p>
            {reputation.state.status === 'loading' || reputation.state.status === 'idle' ? <LoadingComponent /> : null}
            {reputation.state.status === 'error' ? <ErrorComponent kind={reputation.state.kind} message={reputation.state.message} onRetry={reputation.refresh} statusCode={reputation.state.statusCode} /> : null}
            {reputationData ? (
              <>
                <div className="ops-card-grid ops-card-grid-compact">
                  <InlineMetricComponent label={opsCopy.respondent.metricScore} value={String(reputationData.reputationScore)} />
                  <InlineMetricComponent label={opsCopy.respondent.metricLevel} value={reputationData.reputationLevel} />
                  <InlineMetricComponent label={opsCopy.respondent.metricRuleVersion} value={reputationData.ruleVersion} />
                  <InlineMetricComponent label={opsCopy.respondent.metricReviews} value={String(reputationData.metrics.reviewedResponseCount)} />
                </div>
                <div className="ops-kv-grid" style={{ marginTop: 16 }}>
                  <span className="ops-kv-label">{opsCopy.respondent.completionRate}</span><span>{formatPercent(reputationData.metrics.completionRate)}</span>
                  <span className="ops-kv-label">{opsCopy.respondent.validRate}</span><span>{formatPercent(reputationData.metrics.validRate)}</span>
                  <span className="ops-kv-label">{opsCopy.respondent.partialValidRate}</span><span>{formatPercent(reputationData.metrics.partialValidRate)}</span>
                  <span className="ops-kv-label">{opsCopy.respondent.invalidRate}</span><span>{formatPercent(reputationData.metrics.invalidRate)}</span>
                  <span className="ops-kv-label">{opsCopy.respondent.anomalyRate}</span><span>{formatPercent(reputationData.metrics.anomalyRate)}</span>
                  <span className="ops-kv-label">{opsCopy.respondent.fraudFlags}</span><span>{reputationData.metrics.fraudFlagCount}</span>
                </div>
              </>
            ) : null}
          </div>
        </section>

        <section className="detail-panel">
          <div className="ops-section">
            <p className="ops-section-title">{opsCopy.respondent.tagsTitle}</p>
            {tags.state.status === 'loading' || tags.state.status === 'idle' ? <LoadingComponent /> : null}
            {tags.state.status === 'error' ? <ErrorComponent kind={tags.state.kind} message={tags.state.message} onRetry={tags.refresh} statusCode={tags.state.statusCode} /> : null}
            {tagData && tagData.tags.length === 0 ? <EmptyComponent message={opsCopy.respondent.tagsEmpty} /> : null}
            {tagData && tagData.tags.length > 0 ? (
              <div className="ops-table-scroll">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>{opsCopy.respondent.tagHead.tag}</th>
                      <th>{opsCopy.respondent.tagHead.type}</th>
                      <th>{opsCopy.respondent.tagHead.confidence}</th>
                      <th>{opsCopy.respondent.tagHead.source}</th>
                      <th>{opsCopy.respondent.tagHead.updated}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tagData.tags.map((tag) => (
                      <tr key={tag.tagKey}>
                        <td>{tag.tagKey}</td>
                        <td>{tag.tagType}</td>
                        <td>{formatPercent(tag.confidenceScore)}</td>
                        <td>{tag.sourceType}</td>
                        <td>{fmtDate(tag.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>

        <section className="detail-panel">
          <div className="ops-section">
            <p className="ops-section-title">{opsCopy.respondent.rewardLedgerTitle}</p>
            {rewards.state.status === 'loading' || rewards.state.status === 'idle' ? <LoadingComponent /> : null}
            {rewards.state.status === 'error' ? <ErrorComponent kind={rewards.state.kind} message={rewards.state.message} onRetry={rewards.refresh} statusCode={rewards.state.statusCode} /> : null}
            {rewards.state.status === 'ok' && rewardData.length === 0 ? <EmptyComponent message={opsCopy.respondent.rewardLedgerEmpty} /> : null}
            {rewards.state.status === 'ok' && rewardData.length > 0 ? (
              <div className="ops-table-scroll">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>{opsCopy.respondent.rewardHead.ledger}</th>
                      <th>{opsCopy.respondent.rewardHead.proposition}</th>
                      <th>{opsCopy.respondent.rewardHead.status}</th>
                      <th>{opsCopy.respondent.rewardHead.pendingAmount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rewardData.slice(0, 6).map((item) => (
                      <tr key={item.ledgerId}>
                        <td>
                          <Link to={`/zh/ops/rewards?ledgerId=${item.ledgerId}&userId=${item.userId}`}>
                            {item.ledgerId}
                          </Link>
                        </td>
                        <td>{item.propositionTitle}</td>
                        <td>{statusLabel('reward', item.status)}</td>
                        <td>{item.pendingAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <aside className="detail-side-panel ops-side-panel">
        <div className="ops-section">
          <p className="ops-section-title">{opsCopy.respondent.quickActionsTitle}</p>
          <div className="ops-side-stack">
            <Link className="ops-pill-link" to={`/zh/ops/rewards?userId=${userId}`}>{opsCopy.respondent.viewRewards}</Link>
            <Link className="ops-pill-link" to={`/zh/ops/takeover?userId=${userId}`}>{opsCopy.respondent.openTakeover}</Link>
          </div>
        </div>
      </aside>
    </div>
  )
}
