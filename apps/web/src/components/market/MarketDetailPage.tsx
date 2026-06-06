import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useValidationMarketData } from '../../features/validation/validation-market-data'
import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'
import { useRulesIntro } from '../shared/RulesIntroContext'
import { useAuthSession } from '../../features/auth/auth-session'
import { useWalletEnvironment } from '../../features/auth/wallet-environment'
import { NotFoundPage } from '../shared/NotFoundPage'
import { ProgressMeter } from '../shared/ProgressMeter'
import { DataSourceBadge } from '../shared/DataSourceBadge'
import { WatchlistToggleButton } from './WatchlistToggleButton'
import { type DiscussionComment, toDiscussionComments } from '../../features/arena/discussion'
import { useDiscussionData } from '../../features/arena/discussion-data'
import {
  describeActiveExecutionFootnote,
} from '../../features/validation/validation-bet-execution-status'

const optionCode = (displayOrder: number) => `选项 ${String.fromCharCode(64 + displayOrder)}`
const revealLabel = (market: PublicValidationMarketCard) =>
  market.revealTargetAt ?? market.closesAt ?? '公开时间待定'

function isValidStakeAmount(value: string) {
  return /^[0-9]+$/.test(value)
}

export function MarketDetailPage() {
  const { marketId } = useParams()
  const [searchParams] = useSearchParams()
  const { marketDetails, rawMarkets, isLoading, sourceMode, latestBetExecution, placeBet } = useValidationMarketData()
  const { isAuthenticated, sessionMode, configuredChainId } = useAuthSession()
  const { availability, networkStatus, currentChainId } = useWalletEnvironment()
  const market = marketId ? marketDetails.get(marketId) : undefined
  const rawMarket = useMemo(
    () => rawMarkets.find((entry) => entry.marketId === marketId) ?? null,
    [marketId, rawMarkets],
  )
  const selectedOption = searchParams.get('option')
  const { openRulesIntro, openAuthModal } = useRulesIntro()
  const [stakeAmount, setStakeAmount] = useState('')
  const [isSubmittingBet, setIsSubmittingBet] = useState(false)
  const [betFeedback, setBetFeedback] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [discussionFeedback, setDiscussionFeedback] = useState<string | null>(null)
  const [isSubmittingDiscussionComment, setIsSubmittingDiscussionComment] = useState(false)
  const [discussionSort, setDiscussionSort] = useState<'top' | 'new'>('top')
  const [discussionFilter, setDiscussionFilter] = useState<'all' | 'option-0' | 'option-1'>('all')
  const [likedCommentIds, setLikedCommentIds] = useState<string[]>([])
  const {
    thread: discussionThread,
    isLoading: isDiscussionLoading,
    errorMessage: discussionErrorMessage,
    createComment,
  } = useDiscussionData(
    rawMarket?.marketId ?? null,
    rawMarket?.propositionId ?? null,
    sessionMode === 'demo' || sourceMode === 'demo' ? 'demo' : 'live',
  )
  const comments = useMemo<DiscussionComment[]>(
    () => discussionThread ? toDiscussionComments(discussionThread) : [],
    [discussionThread],
  )

  const selectedOptionIndex =
    rawMarket?.options.findIndex((_, index) => `${rawMarket.marketId}-option-${index + 1}` === selectedOption) ?? -1
  const hasSelectedOption = selectedOptionIndex === 0 || selectedOptionIndex === 1
  const hasExistingPosition = Boolean(rawMarket?.currentUserPosition)
  const selectedOptionLabel =
    hasSelectedOption && rawMarket ? rawMarket.options[selectedOptionIndex as 0 | 1] : null
  const activeExecution = latestBetExecution && latestBetExecution.mode === (sessionMode === 'demo' ? 'demo_bypass' : 'wallet_direct_contract_write')
    ? latestBetExecution
    : null
  const activeExecutionFootnote = useMemo(
    () => activeExecution ? describeActiveExecutionFootnote(activeExecution) : null,
    [activeExecution],
  )
  const discussionFilters = useMemo(
    () => [
      { key: 'all' as const, label: '全部' },
      { key: 'option-0' as const, label: market?.options[0]?.label ?? '选项 A' },
      { key: 'option-1' as const, label: market?.options[1]?.label ?? '选项 B' },
    ],
    [market],
  )
  const visibleComments = useMemo(() => {
    const filtered = comments.filter((comment) => {
      if (discussionFilter === 'all') {
        return true
      }

      return discussionFilter === `option-${comment.optionIndex}`
    })

    const ranked = [...filtered]
    ranked.sort((left, right) => {
      if (discussionSort === 'new') {
        return left.minutesAgo - right.minutesAgo
      }

      const leftScore = left.likes + left.replyCount * 2
      const rightScore = right.likes + right.replyCount * 2
      return rightScore - leftScore
    })
    return ranked
  }, [comments, discussionFilter, discussionSort])

  const handlePostComment = async () => {
    const normalizedDraft = commentDraft.trim()
    if (!normalizedDraft) {
      return
    }

    if (!isAuthenticated) {
      openAuthModal('login')
      return
    }

    setDiscussionFeedback(null)
    setIsSubmittingDiscussionComment(true)

    try {
      await createComment({
        body: normalizedDraft,
        optionIndex: hasSelectedOption ? selectedOptionIndex as 0 | 1 : undefined,
      })
      setCommentDraft('')
      setDiscussionFeedback(sessionMode === 'demo'
        ? '演示讨论已更新'
        : '评论已发布到结算后的真实讨论区')
    } catch (error) {
      setDiscussionFeedback(error instanceof Error ? error.message : '讨论提交失败，请稍后重试')
    } finally {
      setIsSubmittingDiscussionComment(false)
    }
  }

  const handleToggleLike = (commentId: string) => {
    setLikedCommentIds((current) =>
      current.includes(commentId)
        ? current.filter((entry) => entry !== commentId)
        : [...current, commentId],
    )
  }

  const handleReplyToComment = (comment: DiscussionComment) => {
    setCommentDraft(`回复 @${comment.author}：`)
  }

  const handleQuoteComment = (comment: DiscussionComment) => {
    const excerpt = comment.body.length > 42 ? `${comment.body.slice(0, 42)}…` : comment.body
    setCommentDraft(`引用 @${comment.author}：「${excerpt}」\n`)
  }

  const handlePlaceBet = async () => {
    if (!rawMarket) {
      return
    }

    if (!isAuthenticated) {
      openAuthModal('login')
      return
    }

    if (sessionMode !== 'demo' && availability === 'missing') {
      setBetFeedback('请先安装或解锁钱包插件，再签名真实 Arena 会话')
      return
    }

    if (sessionMode !== 'demo' && networkStatus === 'unsupported') {
      setBetFeedback(`请将钱包切换到 Chain ID ${configuredChainId} 后再下注`)
      return
    }

    if (!hasSelectedOption) {
      setBetFeedback('请先选择一个选项再下注')
      return
    }

    const normalizedStakeAmount = stakeAmount.trim()
    if (!isValidStakeAmount(normalizedStakeAmount)) {
      setBetFeedback('请输入整数下注金额')
      return
    }

    if (BigInt(normalizedStakeAmount) < BigInt(rawMarket.minBetAmount)) {
      setBetFeedback(`最低下注金额为 ${rawMarket.minBetAmount}`)
      return
    }

    setIsSubmittingBet(true)
    setBetFeedback(null)

    try {
      await placeBet({
        marketId: rawMarket.marketId,
        propositionId: rawMarket.propositionId,
        selectedOption: selectedOptionIndex as 0 | 1,
        stakeAmount: normalizedStakeAmount,
      })
      setStakeAmount('')
      setBetFeedback(sessionMode === 'demo'
        ? `演示持仓已建立：${selectedOptionLabel}`
        : `链上下注已提交，Arena 已记录持仓：${selectedOptionLabel}`)
    } catch (error) {
      setBetFeedback(error instanceof Error ? error.message : '下注失败，请稍后重试')
    } finally {
      setIsSubmittingBet(false)
    }
  }

  if (isLoading && !market) {
    return (
      <section className="route-page detail-route">
        <div className="route-header">
          <h1>加载命题中</h1>
        </div>
      </section>
    )
  }

  if (!market) {
    return <NotFoundPage />
  }

  return (
    <section className="route-page detail-route">
      <DataSourceBadge mode={sessionMode === 'demo' ? 'demo' : sourceMode} />

      <div className="detail-layout">
        <div className="detail-main-stack">
          <article className="detail-panel">
            <div className="detail-panel-watchlist">
              <WatchlistToggleButton marketId={market.id} />
            </div>

            <div className={market.imageSrc ? 'detail-title-row' : 'detail-title-row without-media'}>
              {market.imageSrc ? <span className="detail-title-media market-media-placeholder" aria-hidden="true" /> : null}
              <div className="detail-title-copy">
                <h2>{market.title}</h2>
              </div>
            </div>

            <div className="detail-progress-grid">
              <ProgressMeter label="时间进度" detail={revealLabel(market)} value={market.progress.timeProgressPercent} />
              <ProgressMeter
                label="有效样本"
                detail={`${market.progress.effectiveSampleCount} / ${market.progress.minEffectiveSample}`}
                value={market.progress.effectiveSampleProgressPercent}
              />
            </div>

            {market.publicResult ? <p className="boundary-note">{market.publicResult}</p> : null}

            <div className="detail-outcomes">
              {market.options.map((option) => (
                <div className="detail-outcome-row option-row" key={option.id}>
                  <span>{option.label}</span>
                  <Link
                    className={selectedOption === option.id ? 'option-button selected' : 'option-button'}
                    to={`/zh/event/${market.id}?option=${encodeURIComponent(option.id)}`}
                  >
                    {optionCode(option.displayOrder)}
                  </Link>
                </div>
              ))}
            </div>
          </article>

          <section className="detail-panel detail-discussion-panel" aria-labelledby="discussion-title">
            <div className="detail-discussion-head">
              <div>
                <h2 id="discussion-title">讨论区</h2>
              </div>
              <span className="detail-discussion-count">{comments.length} 条讨论</span>
            </div>

            <div className="detail-discussion-toolbar">
              <div className="detail-discussion-filter-row" aria-label="评论立场筛选">
                {discussionFilters.map((filter) => (
                  <button
                    key={filter.key}
                    className={discussionFilter === filter.key ? 'discussion-chip active' : 'discussion-chip'}
                    type="button"
                    onClick={() => setDiscussionFilter(filter.key)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="detail-discussion-sort-row" aria-label="评论排序">
                <button
                  className={discussionSort === 'top' ? 'discussion-sort active' : 'discussion-sort'}
                  type="button"
                  onClick={() => setDiscussionSort('top')}
                >
                  最热
                </button>
                <button
                  className={discussionSort === 'new' ? 'discussion-sort active' : 'discussion-sort'}
                  type="button"
                  onClick={() => setDiscussionSort('new')}
                >
                  最新
                </button>
              </div>
            </div>

            <div className="detail-discussion-composer">
              {discussionThread?.availability === 'pre_settlement_hidden' ? (
                <div className="discussion-empty-state" data-testid="discussion-pre-settlement-hidden">
                  <strong>开奖前隐藏讨论方向</strong>
                  <span>真实模式下，Arena 会在结算后才开放讨论区，避免未结算阶段暴露方向性信号。</span>
                </div>
              ) : discussionErrorMessage ? (
                <div className="discussion-empty-state" data-testid="discussion-load-error">
                  <strong>讨论区暂时不可用</strong>
                  <span>{discussionErrorMessage}</span>
                </div>
              ) : (
                <>
                  <textarea
                    value={commentDraft}
                    onChange={(event) => {
                      setCommentDraft(event.target.value)
                      if (discussionFeedback) {
                        setDiscussionFeedback(null)
                      }
                    }}
                    rows={4}
                    placeholder="写下你对已结算结果的依据、证据来源或复盘看法…"
                    disabled={isDiscussionLoading || isSubmittingDiscussionComment}
                  />
                  <div className="detail-discussion-composer-foot">
                    <span>{selectedOptionLabel ? `当前引用立场：${selectedOptionLabel}` : '可先在上方选择一个立场再参与讨论'}</span>
                    <button
                      className="primary-action"
                      type="button"
                      onClick={() => { void handlePostComment() }}
                      disabled={!commentDraft.trim() || isDiscussionLoading || isSubmittingDiscussionComment}
                    >
                      {isSubmittingDiscussionComment ? '发布中...' : '发布评论'}
                    </button>
                  </div>
                  {discussionFeedback ? <p className="market-bet-feedback">{discussionFeedback}</p> : null}
                </>
              )}
            </div>

            <div className="detail-discussion-list">
              {isDiscussionLoading ? (
                <div className="discussion-empty-state">
                  <strong>讨论区加载中</strong>
                  <span>正在读取当前 market 的讨论线程。</span>
                </div>
              ) : discussionErrorMessage ? null : discussionThread?.availability === 'pre_settlement_hidden' ? null : visibleComments.length === 0 ? (
                <div className="discussion-empty-state">
                  <strong>{discussionFilter === 'all' ? '结算后的讨论区还没有评论' : '当前筛选下还没有讨论'}</strong>
                  <span>{discussionFilter === 'all'
                    ? '可以先发布你的复盘、证据来源或对最终结果的补充说明。'
                    : '可以先发布你的判断，或者切换到其他立场查看现有观点。'}
                  </span>
                </div>
              ) : visibleComments.map((comment) => (
                <article className="discussion-comment-card" key={comment.id}>
                  <div className="discussion-comment-head">
                    <div className="discussion-comment-author">
                      <span className="discussion-comment-avatar" aria-hidden="true">{comment.author.slice(0, 1)}</span>
                      <div>
                        <strong>{comment.author}</strong>
                        <span>{comment.handle}</span>
                      </div>
                    </div>
                    <span className="discussion-comment-time">{comment.timeLabel}</span>
                  </div>

                  <p>{comment.body}</p>

                  {comment.repliesPreview && comment.repliesPreview.length > 0 ? (
                    <div className="discussion-reply-preview">
                      {comment.repliesPreview.map((reply, index) => (
                        <div className="discussion-reply-row" key={`${comment.id}-reply-${index}`}>
                          <strong>{reply.author}</strong>
                          <span>{reply.body}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="discussion-comment-foot">
                    <button type="button" onClick={() => handleToggleLike(comment.id)}>
                      {likedCommentIds.includes(comment.id) ? '已赞同' : '赞同'} {comment.likes + (likedCommentIds.includes(comment.id) ? 1 : 0)}
                    </button>
                    <button type="button" onClick={() => handleReplyToComment(comment)}>回复</button>
                    <button type="button" onClick={() => handleQuoteComment(comment)}>引用观点</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="detail-side-panel">
          <section className="market-bet-card">
            <h2>建立持仓</h2>
            <dl className="market-bet-facts">
              <div>
                <dt>已选选项</dt>
                <dd>{selectedOptionLabel ?? '请在上方选择一个选项'}</dd>
              </div>
              <div>
                <dt>最低下注</dt>
                <dd>{rawMarket?.minBetAmount ?? '0'}</dd>
              </div>
              <div>
                <dt>钱包网络</dt>
                <dd>
                  {sessionMode === 'demo'
                    ? '已就绪'
                    : networkStatus === 'supported'
                      ? `Chain ${configuredChainId}`
                      : networkStatus === 'unsupported'
                        ? `网络不匹配（当前 ${currentChainId ?? '未知'}）`
                        : availability === 'missing'
                          ? '钱包不可用'
                          : '检测中'}
                </dd>
              </div>
              <div>
                <dt>当前持仓</dt>
                <dd>
                  {rawMarket?.currentUserPosition
                    ? `${rawMarket.options[rawMarket.currentUserPosition.selectedOption]} / ${rawMarket.currentUserPosition.stakeAmount}`
                    : '暂无持仓'}
                </dd>
              </div>
            </dl>
            <label className="market-bet-field">
              <span>下注金额</span>
              <input
                value={stakeAmount}
                onChange={(event) => setStakeAmount(event.target.value)}
                inputMode="numeric"
                placeholder={rawMarket?.minBetAmount ?? '0'}
                disabled={!rawMarket?.canBet || hasExistingPosition || isSubmittingBet}
              />
            </label>
            <button
              className="primary-action"
              type="button"
              disabled={!rawMarket?.canBet || hasExistingPosition || isSubmittingBet}
              onClick={() => {
                void handlePlaceBet()
              }}
            >
              {!isAuthenticated
                ? '登录后下注'
                : sessionMode !== 'demo' && availability === 'missing'
                  ? '需要钱包'
                  : sessionMode !== 'demo' && networkStatus === 'unsupported'
                    ? '切换网络'
                    : hasExistingPosition
                      ? '已有持仓'
                      : isSubmittingBet
                        ? '提交中...'
                        : '确认下注'}
            </button>
            {betFeedback ? <p className="market-bet-feedback">{betFeedback}</p> : null}
            {hasExistingPosition && !betFeedback ? (
              <p className="market-bet-feedback" style={{ color: 'var(--color-info, #1652f0)' }}>
                你已在此命题建立持仓。前往 <Link to="/zh/results?tab=positions" style={{ color: 'inherit', textDecoration: 'underline' }}>持仓列表</Link> 查看详情。
              </p>
            ) : null}
            {activeExecution ? (
              <div className="market-execution-panel">
                <strong>{activeExecution.statusLabel}</strong>
                <span>{activeExecution.detail}</span>
                {activeExecutionFootnote ? <small>{activeExecutionFootnote}</small> : null}
              </div>
            ) : null}
          </section>

          <section className="detail-panel" style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0, color: '#050b14', fontSize: 18, fontWeight: 800 }}>信息边界</h2>
            <dl style={{ display: 'grid', gap: 12, margin: 0 }}>
              <div style={{ display: 'grid', gap: 3 }}>
                <dt style={{ color: '#94a3b8', fontSize: 12, fontWeight: 800 }}>命题状态</dt>
                <dd style={{ margin: 0, color: '#111827', fontSize: 14, fontWeight: 700 }}>{market.progress.statusLabel}</dd>
              </div>
              <div style={{ display: 'grid', gap: 3 }}>
                <dt style={{ color: '#94a3b8', fontSize: 12, fontWeight: 800 }}>开奖前公开字段</dt>
                <dd style={{ margin: 0, color: '#111827', fontSize: 14, fontWeight: 700 }}>状态、时间进度、有效样本进度</dd>
              </div>
            </dl>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <button className="primary-action" onClick={openRulesIntro} type="button">查看边界规则</button>
              <Link className="secondary-action" to="/zh/markets">浏览更多命题</Link>
            </div>
          </section>
        </aside>
      </div>
    </section>
  )
}
