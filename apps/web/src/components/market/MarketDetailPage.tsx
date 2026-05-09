import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ARENA_INFORMATION_BOUNDARY } from '../../features/arena-information-boundary'
import { useValidationMarketData } from '../../features/validation/validation-market-data'
import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'
import { useRulesIntro } from '../shared/RulesIntroContext'
import { useAuthSession } from '../../features/auth/auth-session'
import { useWalletEnvironment } from '../../features/auth/wallet-environment'
import { NotFoundPage } from '../shared/NotFoundPage'
import { ProgressMeter } from '../shared/ProgressMeter'
import { DataSourceBadge } from '../shared/DataSourceBadge'

const optionCode = (displayOrder: number) => `Option ${String.fromCharCode(64 + displayOrder)}`
const revealLabel = (market: PublicValidationMarketCard) =>
  market.revealTargetAt ?? market.closesAt ?? 'Reveal target pending'

type DiscussionComment = {
  id: string
  author: string
  handle: string
  tone: string
  timeLabel: string
  minutesAgo: number
  optionIndex?: 0 | 1
  body: string
  likes: number
  replyCount: number
  repliesPreview?: Array<{ author: string, body: string }>
}

const DISCUSSION_SEED: DiscussionComment[] = [
  {
    id: 'comment-1',
    author: 'Lena',
    handle: '@macro_watch',
    tone: '支持形成公开结果',
    timeLabel: '12 分钟前',
    minutesAgo: 12,
    optionIndex: 0,
    body: '从当前公开样本和窗口进度看，已经接近足够证据。关键是最后一轮公开披露能不能按时完成，只要披露时间不再后移，我倾向于结果会形成。',
    likes: 18,
    replyCount: 3,
    repliesPreview: [
      { author: 'Noah', body: '如果今晚来源同步更新，我也会转向这个判断。' },
    ],
  },
  {
    id: 'comment-2',
    author: 'Kai',
    handle: '@event_reader',
    tone: '偏谨慎',
    timeLabel: '28 分钟前',
    minutesAgo: 28,
    optionIndex: 1,
    body: '样本数量虽然接近阈值，但来源一致性还不够稳。这个命题更像会拖到窗口尾部，甚至因为证据标准不齐导致暂时无法形成公开结果。',
    likes: 11,
    replyCount: 2,
    repliesPreview: [
      { author: 'Aya', body: '我同意，尤其是证据标准这一点现在还没有统一。' },
    ],
  },
  {
    id: 'comment-3',
    author: 'Mira',
    handle: '@signal_lane',
    tone: '关注时间窗口',
    timeLabel: '41 分钟前',
    minutesAgo: 41,
    body: '我更想看后续有没有新的公开确认源。如果今晚之前出现第二个高可信来源，这个市场的讨论方向可能会明显倾向 A 选项。',
    likes: 7,
    replyCount: 0,
  },
]

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
  const [comments, setComments] = useState(DISCUSSION_SEED)
  const [discussionSort, setDiscussionSort] = useState<'top' | 'new'>('top')
  const [discussionFilter, setDiscussionFilter] = useState<'all' | 'neutral' | 'option-0' | 'option-1'>('all')
  const [likedCommentIds, setLikedCommentIds] = useState<string[]>([])

  const selectedOptionIndex =
    rawMarket?.options.findIndex((_, index) => `${rawMarket.marketId}-option-${index + 1}` === selectedOption) ?? -1
  const hasSelectedOption = selectedOptionIndex === 0 || selectedOptionIndex === 1
  const hasExistingPosition = Boolean(rawMarket?.currentUserPosition)
  const selectedOptionLabel =
    hasSelectedOption && rawMarket ? rawMarket.options[selectedOptionIndex as 0 | 1] : null
  const activeExecution = latestBetExecution && latestBetExecution.mode === (sessionMode === 'demo' ? 'demo_bypass' : 'wallet_authenticated_account_write')
    ? latestBetExecution
    : null
  const discussionFilters = useMemo(
    () => [
      { key: 'all' as const, label: '全部' },
      { key: 'option-0' as const, label: market?.options[0]?.label ?? '选项 A' },
      { key: 'option-1' as const, label: market?.options[1]?.label ?? '选项 B' },
      { key: 'neutral' as const, label: '观察' },
    ],
    [market],
  )
  const visibleComments = useMemo(() => {
    const filtered = comments.filter((comment) => {
      if (discussionFilter === 'all') {
        return true
      }

      if (discussionFilter === 'neutral') {
        return comment.optionIndex === undefined
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

  const handlePostComment = () => {
    const normalizedDraft = commentDraft.trim()
    if (!normalizedDraft) {
      return
    }

    setComments((current) => [
      {
        id: `comment-${current.length + 1}`,
        author: isAuthenticated ? 'You' : 'Guest',
        handle: isAuthenticated ? '@arena_user' : '@guest_viewer',
        tone: selectedOptionLabel ? `倾向 ${selectedOptionLabel}` : '新评论',
        timeLabel: '刚刚',
        minutesAgo: 0,
        optionIndex: hasSelectedOption ? selectedOptionIndex as 0 | 1 : undefined,
        body: normalizedDraft,
        likes: 0,
        replyCount: 0,
      },
      ...current,
    ])
    setCommentDraft('')
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
      setBetFeedback('Install or unlock an injected wallet before signing a real Arena session')
      return
    }

    if (sessionMode !== 'demo' && networkStatus === 'unsupported') {
      setBetFeedback(`Switch wallet network to chain ID ${configuredChainId} before placing a real bet`)
      return
    }

    if (!hasSelectedOption) {
      setBetFeedback('Select one option before placing a bet')
      return
    }

    const normalizedStakeAmount = stakeAmount.trim()
    if (!isValidStakeAmount(normalizedStakeAmount)) {
      setBetFeedback('Enter a whole-number stake amount')
      return
    }

    if (BigInt(normalizedStakeAmount) < BigInt(rawMarket.minBetAmount)) {
      setBetFeedback(`Minimum stake is ${rawMarket.minBetAmount}`)
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
        ? `Demo position opened on ${selectedOptionLabel}`
        : `Position recorded on ${selectedOptionLabel}`)
    } catch (error) {
      setBetFeedback(error instanceof Error ? error.message : 'Failed to place position')
    } finally {
      setIsSubmittingBet(false)
    }
  }

  if (isLoading && !market) {
    return (
      <section className="route-page detail-route">
        <div className="route-header">
          <Link className="back-link" to="/zh">Back home</Link>
          <h1>Loading proposition</h1>
        </div>
      </section>
    )
  }

  if (!market) {
    return <NotFoundPage />
  }

  return (
    <section className="route-page detail-route">
      <div className="route-header">
        <Link className="back-link" to="/zh">Back home</Link>
        <span>{market.category}</span>
        <h1>{market.title}</h1>
        <p>Detail view exposes the current public status, progress, and option labels.</p>
      </div>

      <DataSourceBadge
        mode={sessionMode === 'demo' ? 'demo' : sourceMode}
        detail={
          sessionMode === 'demo'
            ? 'The authenticated demo session keeps proposition detail interactive without a real wallet.'
            : sourceMode === 'live'
              ? 'Public proposition state is being read from the current Arena market feed.'
              : 'Public proposition state fell back to demo seed data.'
        }
      />

      <div className="detail-layout">
        <div className="detail-main-stack">
          <article className="detail-panel">
            <div className={market.imageSrc ? 'detail-title-row' : 'detail-title-row without-media'}>
              {market.imageSrc ? <img src={market.imageSrc} alt={`${market.title} icon`} /> : null}
              <div className="detail-title-copy">
                <Link className="eyebrow" to="/zh/markets">{market.category}</Link>
                <h2>{market.title}</h2>
                <p>{market.progress.statusLabel} · {market.status}</p>
              </div>
            </div>

            <div className="detail-progress-grid">
              <ProgressMeter label="Time progress" detail={revealLabel(market)} value={market.progress.timeProgressPercent} />
              <ProgressMeter
                label="Effective sample"
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
                <span className="eyebrow">Community discussion</span>
                <h2 id="discussion-title">讨论区</h2>
              </div>
              <span className="detail-discussion-count">{comments.length} 条讨论</span>
            </div>

            <p className="boundary-note">
              这里展示围绕命题结果的公开讨论。当前先使用 mock 讨论流，后续可接真实评论、回复与排序能力。
            </p>

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
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                rows={4}
                placeholder="写下你的判断依据、证据来源或对结果的看法…"
              />
              <div className="detail-discussion-composer-foot">
                <span>{selectedOptionLabel ? `当前倾向：${selectedOptionLabel}` : '可先在上方选择一个立场再参与讨论'}</span>
                <button className="primary-action" type="button" onClick={handlePostComment} disabled={!commentDraft.trim()}>
                  发布评论
                </button>
              </div>
            </div>

            <div className="detail-discussion-list">
              {visibleComments.length === 0 ? (
                <div className="discussion-empty-state">
                  <strong>当前筛选下还没有讨论</strong>
                  <span>可以先发布你的判断，或者切换到其他立场查看现有观点。</span>
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

                  <div className="discussion-comment-tags">
                    <span className="discussion-comment-tone">{comment.tone}</span>
                    {comment.optionIndex !== undefined ? <span className="discussion-comment-option">{market.options[comment.optionIndex]?.label}</span> : null}
                    {comment.replyCount > 0 ? <span className="discussion-comment-meta">{comment.replyCount} 条回复</span> : null}
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
            <h2>Place position</h2>
            <p className="boundary-note">
              {sessionMode === 'demo'
                ? 'This path records a seeded demo position without wallet signing.'
                : 'This path uses a wallet-authenticated Arena session to record the position through the live validation API.'}
            </p>
            <dl className="market-bet-facts">
              <div>
                <dt>Wallet session</dt>
                <dd>{isAuthenticated ? (sessionMode === 'demo' ? 'Demo session' : 'Connected') : 'Not connected'}</dd>
              </div>
              <div>
                <dt>Wallet network</dt>
                <dd>
                  {sessionMode === 'demo'
                    ? 'Demo bypass'
                    : networkStatus === 'supported'
                      ? `Chain ${configuredChainId}`
                      : networkStatus === 'unsupported'
                        ? `Wrong network (${currentChainId ?? 'unknown'})`
                        : availability === 'missing'
                          ? 'Wallet unavailable'
                          : 'Pending detection'}
                </dd>
              </div>
              <div>
                <dt>Selected option</dt>
                <dd>{selectedOptionLabel ?? 'Choose an option in the market panel'}</dd>
              </div>
              <div>
                <dt>Minimum stake</dt>
                <dd>{rawMarket?.minBetAmount ?? '0'}</dd>
              </div>
              <div>
                <dt>Execution mode</dt>
                <dd>{sessionMode === 'demo' ? 'Demo bypass' : 'Wallet-authenticated account write'}</dd>
              </div>
              <div>
                <dt>Your position</dt>
                <dd>
                  {rawMarket?.currentUserPosition
                    ? `${rawMarket.options[rawMarket.currentUserPosition.selectedOption]} / ${rawMarket.currentUserPosition.stakeAmount}`
                    : 'No active position'}
                </dd>
              </div>
            </dl>
            <label className="market-bet-field">
              <span>Stake amount</span>
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
                ? 'Login to place a bet'
                : sessionMode !== 'demo' && availability === 'missing'
                  ? 'Wallet required'
                  : sessionMode !== 'demo' && networkStatus === 'unsupported'
                    ? 'Switch network'
                  : hasExistingPosition
                    ? 'Position already exists'
                    : isSubmittingBet
                      ? 'Submitting bet...'
                      : 'Place real bet'}
            </button>
            {betFeedback ? <p className="market-bet-feedback">{betFeedback}</p> : null}
            {activeExecution ? (
              <div className="market-execution-panel">
                <strong>{activeExecution.statusLabel}</strong>
                <span>{activeExecution.detail}</span>
                <small>
                  {activeExecution.usesDemoFlow
                    ? 'No wallet signature or chain transaction was required.'
                    : 'Wallet authentication was required, but the resulting position is recorded as an Arena account write rather than an on-chain bet transaction.'}
                </small>
              </div>
            ) : null}
          </section>

          <h2>Information boundary</h2>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{market.progress.statusLabel}</dd>
            </div>
            <div>
              <dt>Pre-reveal public fields</dt>
              <dd>Status, time progress, effective sample progress</dd>
            </div>
            <div>
              <dt>Security note</dt>
              <dd>{ARENA_INFORMATION_BOUNDARY.notes[0]}</dd>
            </div>
          </dl>
          <button className="primary-action" onClick={openRulesIntro} type="button">View boundary rules</button>
          <Link className="secondary-action" to="/zh/markets">View more propositions</Link>
        </aside>
      </div>
    </section>
  )
}
