import { AlertTriangle, FolderOpen, Search, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { arenaApi, type PropositionDraftRecord } from '../features/api/arena-api'
import {
  buildDraftReferenceLink,
  buildDraftTags,
  computeDraftCompletion,
  formatCategoryLabel,
  formatRelativeTime,
} from '../features/arena/arena-ui-mappers'
import { useAuthSession } from '../features/auth/auth-session'

type DraftCardRecord = {
  id: string
  title: string
  summary: string
  optionA: string
  optionB: string
  category: string
  tags: string[]
  referenceLink: string
  completion: number
  status: string
  updatedAt: string
  raw: PropositionDraftRecord
}

function toDraftCardRecord(draft: PropositionDraftRecord): DraftCardRecord {
  return {
    id: draft.propositionId,
    title: draft.title,
    summary: draft.summary,
    optionA: draft.optionA,
    optionB: draft.optionB,
    category: formatCategoryLabel(draft.category),
    tags: buildDraftTags(draft),
    referenceLink: buildDraftReferenceLink(),
    completion: computeDraftCompletion(draft),
    status: draft.submissionStatus,
    updatedAt: formatRelativeTime(draft.updatedAt),
    raw: draft,
  }
}

function DraftDeleteModal({
  title,
  updatedAt,
  onClose,
  onConfirm,
}: {
  title: string
  updatedAt: string
  onClose: () => void
  onConfirm: () => void
}) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="draft-delete-overlay" onClick={onClose} role="presentation">
      <section
        aria-labelledby="draft-delete-title"
        aria-modal="true"
        className="draft-delete-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="关闭删除确认弹窗"
          className="rules-intro-close"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>

        <div className="draft-delete-shell">
          <div className="draft-delete-copy">
            <div className="draft-delete-head">
              <span className="draft-delete-icon" aria-hidden="true">
                <AlertTriangle size={16} />
              </span>
              <span className="draft-delete-eyebrow">删除操作</span>
            </div>
            <h2 id="draft-delete-title">确认删除这条草稿命题？</h2>
          </div>

          <article className="draft-delete-preview">
            <span className="draft-delete-preview-label">将被移出草稿箱</span>
            <strong>{title}</strong>
            <div className="draft-delete-preview-meta">
              <span>{updatedAt}</span>
              <span>删除后不可恢复</span>
            </div>
          </article>

          <div className="draft-delete-actions">
            <button
              className="secondary-action draft-delete-button"
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="primary-action draft-delete-button draft-delete-confirm"
              onClick={onConfirm}
              type="button"
            >
              确认删除
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function DraftsPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { token, isAuthenticated } = useAuthSession()
  const [drafts, setDrafts] = useState<DraftCardRecord[]>([])
  const [keyword, setKeyword] = useState('')
  const [pendingDeleteDraftId, setPendingDeleteDraftId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setDrafts([])
      setIsLoading(false)
      return
    }

    let disposed = false

    void (async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const records = await arenaApi.listDrafts(token)
        if (disposed) {
          return
        }

        setDrafts(records.filter((draft) => draft.submissionStatus === 'draft').map(toDraftCardRecord))
      } catch (error) {
        if (disposed) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : '加载草稿失败')
      } finally {
        if (!disposed) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [isAuthenticated, token])

  const filteredDrafts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()

    if (!normalizedKeyword) {
      return drafts
    }

    return drafts.filter((draft) =>
      [draft.title, draft.summary, draft.category, draft.tags.join(' ')].some((value) =>
        value.toLowerCase().includes(normalizedKeyword),
      ),
    )
  }, [drafts, keyword])

  const selectedDraftId = searchParams.get('draft')
  const selectedDraft = filteredDrafts.find((draft) => draft.id === selectedDraftId)
    ?? filteredDrafts[0]
    ?? null

  const handleSelectDraft = (draftId: string) => {
    navigate(`/zh/drafts?draft=${draftId}`, { replace: true })
  }

  const handleRemoveDraft = async (draftId: string) => {
    if (!token) {
      return
    }

    await arenaApi.deleteDraft(draftId, token)
    const nextDrafts = drafts.filter((draft) => draft.id !== draftId)
    setDrafts(nextDrafts)
    setPendingDeleteDraftId(null)

    if (selectedDraftId === draftId) {
      const nextSelectedDraft = nextDrafts[0]
      navigate(nextSelectedDraft ? `/zh/drafts?draft=${nextSelectedDraft.id}` : '/zh/drafts', { replace: true })
    }
  }

  const pendingDeleteDraft = drafts.find((draft) => draft.id === pendingDeleteDraftId) ?? null

  useEffect(() => {
    if (!pendingDeleteDraftId) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPendingDeleteDraftId(null)
      }
    }

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [pendingDeleteDraftId])

  if (!isAuthenticated) {
    return (
      <section className="route-page drafts-page">
        <section className="drafts-empty-state">
          <FolderOpen size={22} />
          <strong>请先登录</strong>
          <p>草稿箱已接入真实后端，需要有效 Arena 会话才能读取你的命题草稿。</p>
          <Link className="drafts-primary-link" to="/zh/challenges">
            去挑战页登录并创建草稿
          </Link>
        </section>
      </section>
    )
  }

  return (
    <section className="route-page drafts-page">
      <section className="drafts-workspace">
        <div className="drafts-list-panel">
          <div className="drafts-panel-head">
            <div className="drafts-panel-copy">
              <h2>草稿列表</h2>
            </div>
            <Link className="drafts-primary-link" to="/zh/challenges">
              新建草稿
            </Link>
          </div>

          <div className="drafts-search-shell" role="search">
            <Search size={16} />
            <input
              type="text"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索标题、分类或标签"
            />
          </div>

          <div className="drafts-list">
            {isLoading ? (
              <div className="drafts-empty-state">
                <strong>加载中</strong>
                <p>正在从 Arena 后端读取你的草稿。</p>
              </div>
            ) : errorMessage ? (
              <div className="drafts-empty-state">
                <strong>加载失败</strong>
                <p>{errorMessage}</p>
              </div>
            ) : filteredDrafts.length > 0 ? (
              filteredDrafts.map((draft) => {
                const isActive = selectedDraft?.id === draft.id

                return (
                  <button
                    key={draft.id}
                    type="button"
                    className={isActive ? 'drafts-list-item active' : 'drafts-list-item'}
                    onClick={() => handleSelectDraft(draft.id)}
                  >
                    <div className="drafts-list-item-top">
                      <span className="drafts-list-time">{draft.updatedAt}</span>
                    </div>
                    <strong>{draft.title}</strong>
                    <p>{draft.summary}</p>
                    <div className="drafts-list-meta">
                      <span>{draft.category}</span>
                      <span>{draft.tags.length} 个标签</span>
                      <span>{draft.completion}%</span>
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="drafts-empty-state">
                <FolderOpen size={22} />
                <strong>没有匹配的草稿</strong>
                <p>换个关键词，或者先回到挑战页保存一条新的候选草稿。</p>
              </div>
            )}
          </div>
        </div>
        {selectedDraft ? (
          <section className="drafts-detail-panel">
            <div className="drafts-panel-head">
              <div className="drafts-panel-copy">
                <h2>草稿详情</h2>
              </div>
              <div className="drafts-detail-actions">
                <button
                  type="button"
                  className="drafts-inline-button subtle"
                  onClick={() => setPendingDeleteDraftId(selectedDraft.id)}
                >
                  <Trash2 size={14} />
                  <span>删除</span>
                </button>
                <Link className="drafts-inline-button primary" to={`/zh/challenges?draft=${selectedDraft.id}`}>
                  继续编辑
                </Link>
              </div>
            </div>

            <article className="drafts-detail-card">
              <div className="drafts-detail-top">
                <div className="drafts-detail-copy">
                  <strong>{selectedDraft.title}</strong>
                  <p>{selectedDraft.summary}</p>
                </div>
              </div>

              <div className="drafts-detail-grid">
                <div className="drafts-detail-metric">
                  <span>分类</span>
                  <strong>{selectedDraft.category}</strong>
                </div>
                <div className="drafts-detail-metric">
                  <span>最近更新</span>
                  <strong>{selectedDraft.updatedAt}</strong>
                </div>
                <div className="drafts-detail-metric">
                  <span>选项结构</span>
                  <strong>二选一</strong>
                </div>
                <div className="drafts-detail-metric">
                  <span>补充资料</span>
                  <strong>{selectedDraft.referenceLink !== 'https://' ? '已填写' : '待补充'}</strong>
                </div>
              </div>

              <div className="drafts-options-grid">
                <article className="drafts-option-card">
                  <span>选项 A</span>
                  <strong>{selectedDraft.optionA}</strong>
                </article>
                <article className="drafts-option-card">
                  <span>选项 B</span>
                  <strong>{selectedDraft.optionB}</strong>
                </article>
              </div>

              <div className="drafts-tags-row">
                {selectedDraft.tags.map((tag) => (
                  <span key={`${selectedDraft.id}-${tag}`} className="drafts-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          </section>
        ) : null}
      </section>

      {pendingDeleteDraft ? (
        <DraftDeleteModal
          onClose={() => setPendingDeleteDraftId(null)}
          onConfirm={() => void handleRemoveDraft(pendingDeleteDraft.id)}
          title={pendingDeleteDraft.title}
          updatedAt={pendingDeleteDraft.updatedAt}
        />
      ) : null}
    </section>
  )
}
