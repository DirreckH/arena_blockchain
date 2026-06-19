import { hasAnySystemRole, SystemRole } from '@arena/shared'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { arenaApi } from '../../features/api/arena-api'
import {
  useOpsDiscoveryCategoryConfig,
  useOpsDiscoveryCategoryConfigs,
  useOpsDiscoveryGlobalConfig,
} from '../../features/arena/ops-console-data'
import type {
  InternalDiscoveryCategoryConfigInput,
  InternalDiscoveryCategoryPageState,
  InternalDiscoveryCategoryConfigViewModel,
  InternalDiscoveryGlobalCategoryConfigInput,
  InternalDiscoveryGlobalConfigInput,
  InternalDiscoveryGlobalConfigViewModel,
  InternalDiscoverySecondaryCapsuleInput,
  InternalDiscoverySidebarItemInput,
} from '../../features/arena/internal-ops.types'
import { useAuthSession } from '../../features/auth/auth-session'
import { useOptionalDiscoveryData } from '../../features/arena/discovery-data'
import { useValidationMarketData } from '../../features/validation/validation-market-data'
import type { Feedback } from './ops-shared'
import { OpsEmpty, OpsError, OpsFeedback, OpsLoading, OpsStringList } from './ops-shared-ui'

const CUSTOM_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,31}$/

const RESERVED_CUSTOM_SLUGS = new Set([
  'ops', 'admin', 'api', 'auth', 'event', 'events', 'markets', 'results',
  'rewards', 'watchlist', 'drafts', 'submissions', 'leaderboard', 'docs',
  'help', 'contact', 'predictions', 'categories', 'pages', 'menu', 'language',
  'share', 'breaking', 'hot', 'new', 'latest', 'adjudication', 'challenges',
  'accuracy', 'market-integrity', 'activity', 'dev', 'c',
])

function canManageDiscoveryConfig(roles: SystemRole[] | string[]) {
  return hasAnySystemRole(roles as readonly SystemRole[], [SystemRole.Admin, SystemRole.System])
}

function getDiscoveryPageStateLabel(pageState: InternalDiscoveryCategoryPageState) {
  switch (pageState) {
    case 'hidden':
      return '已隐藏'
    case 'deleted':
      return '已删除'
    case 'visible':
    default:
      return '显示中'
  }
}

function getDiscoveryPageStateBadgeClass(pageState: InternalDiscoveryCategoryPageState) {
  switch (pageState) {
    case 'hidden':
      return 'ops-badge-yellow'
    case 'deleted':
      return 'ops-badge-red'
    case 'visible':
    default:
      return 'ops-badge-green'
  }
}

function getNextDiscoveryPageStateFromVisibilityAction(pageState: InternalDiscoveryCategoryPageState): InternalDiscoveryCategoryPageState {
  if (pageState === 'visible') {
    return 'hidden'
  }

  return 'visible'
}

function getVisibilityActionLabel(pageState: InternalDiscoveryCategoryPageState) {
  switch (pageState) {
    case 'hidden':
      return '显示'
    case 'deleted':
      return '恢复'
    case 'visible':
    default:
      return '隐藏'
  }
}

function toGlobalDraft(
  value: InternalDiscoveryGlobalConfigViewModel,
): InternalDiscoveryGlobalConfigInput {
  return {
    categories: value.categories.map((item) => ({
      slug: item.slug,
      pathname: item.pathname,
      label: item.label,
      title: item.title,
      directoryLabel: item.directoryLabel,
      description: item.description,
      displayOrder: item.displayOrder,
      pageState: item.pageState,
      kind: item.kind,
      marketIdWhitelist: [...item.marketIdWhitelist],
    })),
    rankingCategoryLabels: { ...value.rankingCategoryLabels },
    secondaryCapsules: value.secondaryCapsules.map((item) => ({
      id: item.id,
      label: item.label,
      displayOrder: item.displayOrder,
      pageState: item.pageState,
      kind: item.kind,
      baseRankingId: item.baseRankingId,
      marketIdWhitelist: [...item.marketIdWhitelist],
    })),
  }
}

function getCategoryKindBadge(kind: 'system' | 'custom') {
  return kind === 'system'
    ? { label: '系统', className: 'ops-badge-gray' }
    : { label: '自定义', className: 'ops-badge-blue' }
}

function validateCustomSlug(slug: string, existingSlugs: ReadonlySet<string>) {
  if (!slug) {
    return 'slug 不能为空。'
  }
  if (!CUSTOM_SLUG_PATTERN.test(slug)) {
    return 'slug 只能包含小写字母、数字和连字符,并以字母开头(2-32 字符)。'
  }
  if (RESERVED_CUSTOM_SLUGS.has(slug)) {
    return `slug "${slug}" 是系统保留字,不能使用。`
  }
  if (existingSlugs.has(slug)) {
    return `slug "${slug}" 已存在,请改用其它 slug。`
  }
  return null
}

function toCategoryDraft(
  value: InternalDiscoveryCategoryConfigViewModel,
): InternalDiscoveryCategoryConfigInput {
  return {
    sidebarItems: value.sidebarItems.map((item) => ({
      id: item.id,
      label: item.label,
      linkedMarketIds: [...item.linkedMarketIds],
    })),
  }
}

function updateSidebarItem(
  items: InternalDiscoverySidebarItemInput[],
  index: number,
  updater: (item: InternalDiscoverySidebarItemInput) => InternalDiscoverySidebarItemInput,
) {
  return items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item))
}

function moveSidebarItem(
  items: InternalDiscoverySidebarItemInput[],
  index: number,
  direction: -1 | 1,
) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items
  }

  const nextItems = [...items]
  const [current] = nextItems.splice(index, 1)
  nextItems.splice(targetIndex, 0, current!)
  return nextItems
}

function resolveSidebarPreview(
  item: InternalDiscoverySidebarItemInput,
  validMarketIds: Set<string>,
) {
  const linkedMarketIds = [...new Set(item.linkedMarketIds)]
  const invalidLinkedMarketIds = linkedMarketIds.filter((marketId) => !validMarketIds.has(marketId))
  return {
    linkedMarketIds,
    invalidLinkedMarketIds,
    resolvedLinkedMarketCount: linkedMarketIds.filter((marketId) => validMarketIds.has(marketId)).length,
  }
}

export function OpsDiscoveryConfigPage({ token }: { token: string }) {
  const globalConfig = useOpsDiscoveryGlobalConfig(token)
  const categoryConfigs = useOpsDiscoveryCategoryConfigs(token)
  const discovery = useOptionalDiscoveryData()
  const { identity } = useAuthSession()
  const { markets } = useValidationMarketData()
  const canSave = canManageDiscoveryConfig(identity?.roles ?? [])
  const [draft, setDraft] = useState<InternalDiscoveryGlobalConfigInput | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [customCategoryDialogOpen, setCustomCategoryDialogOpen] = useState(false)
  const [customCapsuleDialogOpen, setCustomCapsuleDialogOpen] = useState(false)
  const [whitelistEditorSlug, setWhitelistEditorSlug] = useState<string | null>(null)
  const [capsuleWhitelistEditorId, setCapsuleWhitelistEditorId] = useState<string | null>(null)

  useEffect(() => {
    if (globalConfig.state.status === 'ok') {
      setDraft(toGlobalDraft(globalConfig.state.data))
    }
  }, [globalConfig.state])

  const categorySummaries = categoryConfigs.state.status === 'ok' ? categoryConfigs.state.data : []
  const availableMarkets = useMemo(
    () => markets.map((market) => ({ marketId: market.id, title: market.title })),
    [markets],
  )

  async function persistGlobalDraft(
    nextDraft: InternalDiscoveryGlobalConfigInput,
    messages?: {
      success: string
      error: string
    },
    rollbackDraft?: InternalDiscoveryGlobalConfigInput | null,
  ) {
    if (!canSave) {
      return
    }

    setIsSaving(true)
    setFeedback(null)
    try {
      const saved = await arenaApi.updateOpsDiscoveryGlobalConfig(nextDraft, token)
      setDraft(toGlobalDraft(saved))
      categoryConfigs.refresh()
      globalConfig.refresh()
      void discovery?.refresh()
      setFeedback({
        tone: 'success',
        message: messages?.success ?? '全局分类配置已保存。',
      })
    } catch (error) {
      if (rollbackDraft) {
        setDraft(rollbackDraft)
      }
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : (messages?.error ?? '保存全局分类配置失败。'),
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSave() {
    if (!draft || !canSave) {
      return
    }

    await persistGlobalDraft(draft)
  }

  async function handlePageStateChange(
    slug: string,
    pageState: InternalDiscoveryCategoryPageState,
  ) {
    if (!draft || !canSave) {
      return
    }

    const currentDraft = draft
    const nextDraft = {
      ...currentDraft,
      categories: currentDraft.categories.map((item) => item.slug === slug ? { ...item, pageState } : item),
    }

    setDraft(nextDraft)
    await persistGlobalDraft(
      nextDraft,
      {
        success: pageState === 'deleted'
          ? '分类页已删除。'
          : pageState === 'hidden'
            ? '分类页已隐藏。'
            : '分类页已恢复显示。',
        error: pageState === 'deleted'
          ? '删除分类页失败。'
          : pageState === 'hidden'
            ? '隐藏分类页失败。'
            : '恢复分类页失败。',
      },
      currentDraft,
    )
  }

  async function handleAddCustomCategory(input: {
    slug: string
    label: string
    title: string
    description: string
    marketIdWhitelist: string[]
  }) {
    if (!draft || !canSave) {
      return
    }

    const currentDraft = draft
    const nextDraft: InternalDiscoveryGlobalConfigInput = {
      ...currentDraft,
      categories: [
        ...currentDraft.categories,
        {
          slug: input.slug,
          label: input.label,
          title: input.title,
          directoryLabel: input.label,
          description: input.description,
          displayOrder: currentDraft.categories.length,
          pageState: 'visible',
          kind: 'custom',
          marketIdWhitelist: input.marketIdWhitelist,
        } satisfies InternalDiscoveryGlobalCategoryConfigInput,
      ],
    }

    setDraft(nextDraft)
    await persistGlobalDraft(
      nextDraft,
      {
        success: `已新增自定义分类 ${input.label}。`,
        error: `新增自定义分类失败。`,
      },
      currentDraft,
    )
  }

  async function handleUpdateCategoryWhitelist(slug: string, marketIds: string[]) {
    if (!draft || !canSave) {
      return
    }

    const currentDraft = draft
    const nextDraft: InternalDiscoveryGlobalConfigInput = {
      ...currentDraft,
      categories: currentDraft.categories.map((item) => item.slug === slug ? {
        ...item,
        marketIdWhitelist: [...new Set(marketIds)],
      } : item),
    }

    setDraft(nextDraft)
    await persistGlobalDraft(
      nextDraft,
      {
        success: `已更新 ${slug} 的市场白名单。`,
        error: `更新市场白名单失败。`,
      },
      currentDraft,
    )
  }

  async function handleAddCustomCapsule(input: {
    label: string
    marketIdWhitelist: string[]
  }) {
    if (!draft || !canSave) {
      return
    }

    const id = `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const currentDraft = draft
    const nextDraft: InternalDiscoveryGlobalConfigInput = {
      ...currentDraft,
      secondaryCapsules: [
        ...(currentDraft.secondaryCapsules ?? []),
        {
          id,
          label: input.label,
          displayOrder: (currentDraft.secondaryCapsules ?? []).length,
          pageState: 'visible',
          kind: 'custom',
          baseRankingId: null,
          marketIdWhitelist: input.marketIdWhitelist,
        } satisfies InternalDiscoverySecondaryCapsuleInput,
      ],
    }

    setDraft(nextDraft)
    await persistGlobalDraft(
      nextDraft,
      {
        success: `已新增自定义胶囊 ${input.label}。`,
        error: `新增自定义胶囊失败。`,
      },
      currentDraft,
    )
  }

  async function handleUpdateCapsule(
    id: string,
    update: Partial<InternalDiscoverySecondaryCapsuleInput>,
  ) {
    if (!draft || !canSave) {
      return
    }

    const currentDraft = draft
    const nextDraft: InternalDiscoveryGlobalConfigInput = {
      ...currentDraft,
      secondaryCapsules: (currentDraft.secondaryCapsules ?? []).map((item) =>
        item.id === id ? { ...item, ...update } : item,
      ),
    }

    setDraft(nextDraft)
    await persistGlobalDraft(nextDraft, undefined, currentDraft)
  }

  async function handleDeleteCustomCapsule(id: string) {
    if (!draft || !canSave) {
      return
    }

    const currentDraft = draft
    const nextDraft: InternalDiscoveryGlobalConfigInput = {
      ...currentDraft,
      secondaryCapsules: (currentDraft.secondaryCapsules ?? []).filter((item) => item.id !== id),
    }

    setDraft(nextDraft)
    await persistGlobalDraft(
      nextDraft,
      {
        success: '已删除自定义胶囊。',
        error: '删除自定义胶囊失败。',
      },
      currentDraft,
    )
  }

  return (
    <section className="ops-panel">
      <section className="detail-panel">
        <div className="ops-section-head">
          <div>
            <h2>分类配置</h2>
            <p className="ops-muted">维护公开发现页的分类顺序、标题说明，以及固定排行标签的展示文案。</p>
          </div>
        </div>
        {!canSave ? <p className="ops-muted">当前角色可查看配置，但只有 Admin / System 可以保存修改。</p> : null}
        <OpsFeedback feedback={feedback} />
      </section>

      {globalConfig.state.status === 'loading' || categoryConfigs.state.status === 'loading' ? <OpsLoading /> : null}
      {globalConfig.state.status === 'error' ? <OpsError {...globalConfig.state} onRetry={globalConfig.refresh} /> : null}
      {categoryConfigs.state.status === 'error' ? <OpsError {...categoryConfigs.state} onRetry={categoryConfigs.refresh} /> : null}

      {draft ? (
        <>
          <section className="detail-panel">
            <div className="ops-section-head">
              <div>
                <h3>顶部主分类导航配置</h3>
                <p className="ops-muted">系统分类的 slug 与 pathname 固定,只开放显示层元数据与顺序编辑;自定义分类支持完整 CRUD,内容由市场白名单驱动。</p>
              </div>
              <button
                className="ops-btn ops-btn-primary"
                disabled={!canSave || isSaving}
                type="button"
                onClick={() => setCustomCategoryDialogOpen(true)}
              >
                + 新增自定义分类
              </button>
            </div>
            <div className="ops-table-scroll">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>分类</th>
                    <th>类型</th>
                    <th>顺序</th>
                    <th>标题</th>
                    <th>说明</th>
                    <th>市场绑定</th>
                    <th>控制</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.categories.map((category, index) => {
                    const rowCanEdit = canSave && category.pageState !== 'deleted'
                    const kindBadge = getCategoryKindBadge(category.kind ?? 'system')
                    const isCustom = category.kind === 'custom'
                    return (
                      <tr key={category.slug}>
                        <td>
                          <strong>{category.slug}</strong>
                          <div className="ops-muted">{category.pathname}</div>
                        </td>
                        <td>
                          <span className={`ops-badge ${kindBadge.className}`}>
                            {kindBadge.label}
                          </span>
                        </td>
                        <td>
                          <input
                            disabled={!rowCanEdit}
                            type="number"
                            value={category.displayOrder ?? index}
                            onChange={(event) => {
                              const value = Number.parseInt(event.target.value || '0', 10)
                              setDraft((current) => current ? ({
                                ...current,
                                categories: current.categories.map((item) => item.slug === category.slug ? {
                                  ...item,
                                  displayOrder: Number.isNaN(value) ? 0 : value,
                                } : item),
                              }) : current)
                            }}
                          />
                        </td>
                        <td>
                          <input
                            disabled={!rowCanEdit}
                            value={category.title ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraft((current) => current ? ({
                                ...current,
                                categories: current.categories.map((item) => item.slug === category.slug ? { ...item, title: value, label: isCustom ? value : item.label } : item),
                              }) : current)
                            }}
                          />
                        </td>
                        <td>
                          <textarea
                            className="ops-textarea"
                            disabled={!rowCanEdit}
                            value={category.description ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraft((current) => current ? ({
                                ...current,
                                categories: current.categories.map((item) => item.slug === category.slug ? { ...item, description: value } : item),
                              }) : current)
                            }}
                          />
                        </td>
                        <td>
                          {isCustom ? (
                            <div style={{ display: 'grid', gap: 6 }}>
                              <span className="ops-muted">{(category.marketIdWhitelist ?? []).length} 个市场</span>
                              <button
                                className="ops-btn ops-btn-ghost"
                                disabled={!rowCanEdit || isSaving}
                                type="button"
                                onClick={() => setWhitelistEditorSlug(category.slug)}
                              >
                                编辑市场白名单
                              </button>
                            </div>
                          ) : (
                            <span className="ops-muted">系统默认</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'grid', gap: 8, minWidth: 180 }}>
                            <span className={`ops-badge ${getDiscoveryPageStateBadgeClass(category.pageState ?? 'visible')}`}>
                              {getDiscoveryPageStateLabel(category.pageState ?? 'visible')}
                            </span>
                            <div className="ops-actions">
                              <button
                                className={`ops-btn ${category.pageState === 'visible' ? 'ops-btn-ghost' : 'ops-btn-primary'}`}
                                disabled={!canSave || isSaving}
                                type="button"
                                onClick={() => {
                                  const nextPageState = getNextDiscoveryPageStateFromVisibilityAction(category.pageState ?? 'visible')
                                  void handlePageStateChange(category.slug, nextPageState)
                                }}
                              >
                                {getVisibilityActionLabel(category.pageState ?? 'visible')}
                              </button>
                              <button
                                className={`ops-btn ${category.pageState === 'deleted' ? 'ops-btn-ghost' : 'ops-btn-danger'}`}
                                disabled={!canSave || isSaving || category.pageState === 'deleted'}
                                type="button"
                                onClick={() => {
                                  void handlePageStateChange(category.slug, 'deleted')
                                }}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section-head">
              <div>
                <h3>二级筛选胶囊栏配置</h3>
                <p className="ops-muted">主分类下方的横向胶囊。系统胶囊保留 ranking 过滤逻辑,仅可重命名/隐藏/重排;自定义胶囊由市场白名单驱动,完整 CRUD。</p>
              </div>
              <button
                className="ops-btn ops-btn-primary"
                disabled={!canSave || isSaving}
                type="button"
                onClick={() => setCustomCapsuleDialogOpen(true)}
              >
                + 新增自定义胶囊
              </button>
            </div>
            <div className="ops-table-scroll">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>胶囊</th>
                    <th>类型</th>
                    <th>顺序</th>
                    <th>文案</th>
                    <th>市场绑定</th>
                    <th>控制</th>
                  </tr>
                </thead>
                <tbody>
                  {(draft.secondaryCapsules ?? []).map((capsule) => {
                    const kindBadge = getCategoryKindBadge(capsule.kind ?? 'system')
                    const isCustom = capsule.kind === 'custom'
                    const pageState = capsule.pageState ?? 'visible'
                    const canDelete = isCustom
                    return (
                      <tr key={capsule.id}>
                        <td>
                          <strong>{capsule.id}</strong>
                          {capsule.baseRankingId ? (
                            <div className="ops-muted">{capsule.baseRankingId}</div>
                          ) : null}
                        </td>
                        <td>
                          <span className={`ops-badge ${kindBadge.className}`}>{kindBadge.label}</span>
                        </td>
                        <td>
                          <input
                            disabled={!canSave || pageState === 'deleted'}
                            type="number"
                            value={capsule.displayOrder ?? 0}
                            onChange={(event) => {
                              const value = Number.parseInt(event.target.value || '0', 10)
                              setDraft((current) => current ? ({
                                ...current,
                                secondaryCapsules: (current.secondaryCapsules ?? []).map((item) => item.id === capsule.id ? {
                                  ...item,
                                  displayOrder: Number.isNaN(value) ? 0 : value,
                                } : item),
                              }) : current)
                            }}
                          />
                        </td>
                        <td>
                          <input
                            disabled={!canSave || pageState === 'deleted'}
                            value={capsule.label ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraft((current) => current ? ({
                                ...current,
                                secondaryCapsules: (current.secondaryCapsules ?? []).map((item) => item.id === capsule.id ? { ...item, label: value } : item),
                              }) : current)
                            }}
                          />
                        </td>
                        <td>
                          {isCustom ? (
                            <div style={{ display: 'grid', gap: 6 }}>
                              <span className="ops-muted">{(capsule.marketIdWhitelist ?? []).length} 个市场</span>
                              <button
                                className="ops-btn ops-btn-ghost"
                                disabled={!canSave || isSaving}
                                type="button"
                                onClick={() => setCapsuleWhitelistEditorId(capsule.id)}
                              >
                                编辑市场白名单
                              </button>
                            </div>
                          ) : (
                            <span className="ops-muted">系统 ranking 过滤</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'grid', gap: 8, minWidth: 180 }}>
                            <span className={`ops-badge ${getDiscoveryPageStateBadgeClass(pageState)}`}>
                              {getDiscoveryPageStateLabel(pageState)}
                            </span>
                            <div className="ops-actions">
                              <button
                                className={`ops-btn ${pageState === 'visible' ? 'ops-btn-ghost' : 'ops-btn-primary'}`}
                                disabled={!canSave || isSaving}
                                type="button"
                                onClick={() => {
                                  void handleUpdateCapsule(capsule.id, {
                                    pageState: pageState === 'visible' ? 'hidden' : 'visible',
                                  })
                                }}
                              >
                                {pageState === 'visible' ? '隐藏' : '显示'}
                              </button>
                              <button
                                className="ops-btn ops-btn-danger"
                                disabled={!canSave || isSaving || !canDelete}
                                type="button"
                                title={canDelete ? '删除自定义胶囊' : '系统胶囊不可删除,可隐藏'}
                                onClick={() => {
                                  void handleDeleteCustomCapsule(capsule.id)
                                }}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="ops-actions" style={{ marginTop: 12 }}>
              <button
                className="ops-btn"
                disabled={!canSave || isSaving}
                type="button"
                onClick={() => void handleSave()}
              >
                保存全局配置
              </button>
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section-head">
              <div>
                <h3>分类词条配置入口</h3>
                <p className="ops-muted">每个分类单独维护左侧词条，不影响右侧公开市场主列表。</p>
              </div>
            </div>
            {categorySummaries.length === 0 ? (
              <OpsEmpty message="暂无可编辑的分类词条配置。" />
            ) : (
              <div className="ops-list-stack">
                {categorySummaries.map((summary) => {
                  const summaryKindBadge = getCategoryKindBadge(summary.kind ?? 'system')
                  return (
                  <div className="ops-list-card" key={summary.slug}>
                    <div className="ops-list-row">
                      <div>
                        <strong>{summary.label}</strong>
                        <p className="ops-muted">{summary.pathname}</p>
                      </div>
                      <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                        <span className={`ops-badge ${summaryKindBadge.className}`}>
                          {summaryKindBadge.label}
                        </span>
                        <span className={`ops-badge ${summary.configured ? 'ops-badge-blue' : 'ops-badge-gray'}`}>
                          {summary.configured ? `已配置 ${summary.sidebarItemCount}` : '未配置'}
                        </span>
                        <span className={`ops-badge ${getDiscoveryPageStateBadgeClass(summary.pageState)}`}>
                          {getDiscoveryPageStateLabel(summary.pageState)}
                        </span>
                      </div>
                    </div>
                    <p className="ops-muted">{summary.description}</p>
                    <div className="ops-actions">
                      {summary.pageState === 'deleted' ? (
                        <span className="ops-muted">已删除页仅可在上方全局配置中恢复。</span>
                      ) : (
                        <Link className="ops-pill-link" to={`/zh/ops/discovery-config/${summary.slug}`}>编辑词条</Link>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      {customCategoryDialogOpen && draft ? (
        <CustomCategoryDialog
          existingSlugs={new Set(draft.categories.map((item) => item.slug))}
          availableMarkets={availableMarkets}
          isSaving={isSaving}
          onCancel={() => setCustomCategoryDialogOpen(false)}
          onSubmit={async (input) => {
            await handleAddCustomCategory(input)
            setCustomCategoryDialogOpen(false)
          }}
        />
      ) : null}

      {customCapsuleDialogOpen && draft ? (
        <CustomCapsuleDialog
          availableMarkets={availableMarkets}
          isSaving={isSaving}
          onCancel={() => setCustomCapsuleDialogOpen(false)}
          onSubmit={async (input) => {
            await handleAddCustomCapsule(input)
            setCustomCapsuleDialogOpen(false)
          }}
        />
      ) : null}

      {whitelistEditorSlug && draft ? (
        <MarketWhitelistDialog
          title={`编辑市场白名单 — ${draft.categories.find((item) => item.slug === whitelistEditorSlug)?.label ?? whitelistEditorSlug}`}
          availableMarkets={availableMarkets}
          initialMarketIds={draft.categories.find((item) => item.slug === whitelistEditorSlug)?.marketIdWhitelist ?? []}
          isSaving={isSaving}
          onCancel={() => setWhitelistEditorSlug(null)}
          onSubmit={async (marketIds) => {
            await handleUpdateCategoryWhitelist(whitelistEditorSlug, marketIds)
            setWhitelistEditorSlug(null)
          }}
        />
      ) : null}

      {capsuleWhitelistEditorId && draft ? (
        <MarketWhitelistDialog
          title={`编辑胶囊市场白名单 — ${(draft.secondaryCapsules ?? []).find((item) => item.id === capsuleWhitelistEditorId)?.label ?? capsuleWhitelistEditorId}`}
          availableMarkets={availableMarkets}
          initialMarketIds={(draft.secondaryCapsules ?? []).find((item) => item.id === capsuleWhitelistEditorId)?.marketIdWhitelist ?? []}
          isSaving={isSaving}
          onCancel={() => setCapsuleWhitelistEditorId(null)}
          onSubmit={async (marketIds) => {
            await handleUpdateCapsule(capsuleWhitelistEditorId, { marketIdWhitelist: marketIds })
            setCapsuleWhitelistEditorId(null)
          }}
        />
      ) : null}
    </section>
  )
}

export function OpsDiscoveryCategoryConfigPage({
  slug,
  token,
}: {
  slug: string
  token: string
}) {
  const categoryConfig = useOpsDiscoveryCategoryConfig(token, slug)
  const { identity } = useAuthSession()
  const canSave = canManageDiscoveryConfig(identity?.roles ?? [])
  const [draft, setDraft] = useState<InternalDiscoveryCategoryConfigInput | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (categoryConfig.state.status === 'ok') {
      setDraft(toCategoryDraft(categoryConfig.state.data))
    }
  }, [categoryConfig.state])

  const view = categoryConfig.state.status === 'ok' ? categoryConfig.state.data : null
  const canEditCategory = canSave && view?.pageState !== 'deleted'
  const validMarketIds = useMemo(
    () => new Set(view?.availableMarkets.map((market) => market.marketId) ?? []),
    [view],
  )

  const previewWarnings = useMemo(
    () => draft?.sidebarItems
      .map((item) => {
        const resolved = resolveSidebarPreview(item, validMarketIds)
        if (resolved.invalidLinkedMarketIds.length === 0) {
          return null
        }
        return `词条“${item.label || item.id}”存在 ${resolved.invalidLinkedMarketIds.length} 个失效或跨分类市场绑定。`
      })
      .filter((item): item is string => Boolean(item)) ?? [],
    [draft, validMarketIds],
  )

  async function handleSave() {
    if (!draft || !canEditCategory) {
      return
    }

    setIsSaving(true)
    setFeedback(null)
    try {
      const saved = await arenaApi.updateOpsDiscoveryCategoryConfig(slug, draft, token)
      setDraft(toCategoryDraft(saved))
      categoryConfig.refresh()
      setFeedback({
        tone: 'success',
        message: '分类词条配置已保存。',
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : '保存分类词条配置失败。',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="ops-panel">
      {categoryConfig.state.status === 'loading' ? <OpsLoading /> : null}
      {categoryConfig.state.status === 'error' ? <OpsError {...categoryConfig.state} onRetry={categoryConfig.refresh} /> : null}

      {view && draft ? (
        <>
          <section className="detail-panel">
            <div className="ops-section-head">
              <div>
                <h2>{view.label} 词条配置</h2>
                <p className="ops-muted">词条只影响左侧展示，不改变右侧公开市场列表与筛选逻辑。</p>
                <div style={{ marginTop: 8 }}>
                  <span className={`ops-badge ${getDiscoveryPageStateBadgeClass(view.pageState)}`}>
                    {getDiscoveryPageStateLabel(view.pageState)}
                  </span>
                </div>
              </div>
              <Link className="ops-pill-link" to="/zh/ops/discovery-config">返回全局配置</Link>
            </div>
            {!canSave ? <p className="ops-muted">当前角色可查看配置，但只有 Admin / System 可以保存修改。</p> : null}
            {view.pageState === 'deleted' ? <p className="ops-muted">当前分类页已删除。若要恢复编辑，请回到全局配置页恢复该页显示。</p> : null}
            <OpsFeedback feedback={feedback} />
          </section>

          <section className="detail-panel">
            <div className="ops-section-head">
              <div>
                <h3>公开分类元数据</h3>
                <p className="ops-muted">slug / pathname 固定，当前页仅展示该分类公开层元数据回显。</p>
              </div>
            </div>
            <div className="ops-form-grid">
              <label className="ops-form-block">
                <span>slug</span>
                <input disabled value={view.slug} />
              </label>
              <label className="ops-form-block">
                <span>pathname</span>
                <input disabled value={view.pathname} />
              </label>
              <label className="ops-form-block">
                <span>导航文案</span>
                <input disabled value={view.label} />
              </label>
              <label className="ops-form-block">
                <span>页面标题</span>
                <input disabled value={view.title} />
              </label>
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section-head">
              <div>
                <h3>左侧词条列表</h3>
                <p className="ops-muted">每个词条可绑定多个当前分类市场，数字会按有效绑定市场数自动统计。</p>
              </div>
            </div>

            {draft.sidebarItems.length === 0 ? <OpsEmpty message="当前分类还没有自定义左侧词条。" /> : null}

            <div className="ops-list-stack">
              {draft.sidebarItems.map((item, index) => {
                const resolved = resolveSidebarPreview(item, validMarketIds)
                return (
                  <div className="ops-list-card" key={`${item.id}-${index}`}>
                    <div className="ops-list-row">
                      <strong>词条 {index + 1}</strong>
                      <span className="ops-badge ops-badge-gray">自动统计 {resolved.resolvedLinkedMarketCount}</span>
                    </div>
                    <div className="ops-form-grid" style={{ marginTop: 12 }}>
                      <label className="ops-form-block">
                        <span>词条 ID</span>
                        <input
                          disabled={!canEditCategory}
                          value={item.id}
                          onChange={(event) => {
                            const value = event.target.value
                            setDraft((current) => current ? ({
                              ...current,
                              sidebarItems: updateSidebarItem(current.sidebarItems, index, (entry) => ({ ...entry, id: value })),
                            }) : current)
                          }}
                        />
                      </label>
                      <label className="ops-form-block">
                        <span>词条文案</span>
                        <input
                          disabled={!canEditCategory}
                          value={item.label}
                          onChange={(event) => {
                            const value = event.target.value
                            setDraft((current) => current ? ({
                              ...current,
                              sidebarItems: updateSidebarItem(current.sidebarItems, index, (entry) => ({ ...entry, label: value })),
                            }) : current)
                          }}
                        />
                      </label>
                    </div>

                    <div className="ops-string-list">
                      <strong>绑定市场</strong>
                      {view.availableMarkets.length === 0 ? <p className="ops-muted">当前分类公开市场为空，暂时没有可绑定项。</p> : null}
                      {view.availableMarkets.length > 0 ? (
                        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                          {view.availableMarkets.map((market) => {
                            const checked = item.linkedMarketIds.includes(market.marketId)
                            return (
                              <label className="ops-inline-toggle" key={market.marketId} style={{ alignItems: 'flex-start' }}>
                                <input
                                  checked={checked}
                                  disabled={!canEditCategory}
                                  type="checkbox"
                                  onChange={() => {
                                    setDraft((current) => {
                                      if (!current) {
                                        return current
                                      }

                                      const nextLinkedMarketIds = checked
                                        ? item.linkedMarketIds.filter((marketId) => marketId !== market.marketId)
                                        : [...item.linkedMarketIds, market.marketId]

                                      return {
                                        ...current,
                                        sidebarItems: updateSidebarItem(
                                          current.sidebarItems,
                                          index,
                                          (entry) => ({ ...entry, linkedMarketIds: nextLinkedMarketIds }),
                                        ),
                                      }
                                    })
                                  }}
                                />
                                <span>{market.title}</span>
                              </label>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>

                    {resolved.invalidLinkedMarketIds.length > 0 ? (
                      <OpsStringList
                        title="失效绑定"
                        items={resolved.invalidLinkedMarketIds}
                      />
                    ) : null}

                    <div className="ops-actions">
                      <button
                        className="ops-btn ops-btn-ghost"
                        disabled={!canEditCategory || index === 0}
                        type="button"
                        onClick={() => {
                          setDraft((current) => current ? ({
                            ...current,
                            sidebarItems: moveSidebarItem(current.sidebarItems, index, -1),
                          }) : current)
                        }}
                      >
                        上移
                      </button>
                      <button
                        className="ops-btn ops-btn-ghost"
                        disabled={!canEditCategory || index === draft.sidebarItems.length - 1}
                        type="button"
                        onClick={() => {
                          setDraft((current) => current ? ({
                            ...current,
                            sidebarItems: moveSidebarItem(current.sidebarItems, index, 1),
                          }) : current)
                        }}
                      >
                        下移
                      </button>
                      <button
                        className="ops-btn ops-btn-ghost"
                        disabled={!canEditCategory || resolved.invalidLinkedMarketIds.length === 0}
                        type="button"
                        onClick={() => {
                          setDraft((current) => current ? ({
                            ...current,
                            sidebarItems: updateSidebarItem(
                              current.sidebarItems,
                              index,
                              (entry) => ({
                                ...entry,
                                linkedMarketIds: entry.linkedMarketIds.filter((marketId) => !resolved.invalidLinkedMarketIds.includes(marketId)),
                              }),
                            ),
                          }) : current)
                        }}
                      >
                        移除失效绑定
                      </button>
                      <button
                        className="ops-btn ops-btn-ghost"
                        disabled={!canEditCategory}
                        type="button"
                        onClick={() => {
                          setDraft((current) => current ? ({
                            ...current,
                            sidebarItems: current.sidebarItems.filter((_, itemIndex) => itemIndex !== index),
                          }) : current)
                        }}
                      >
                        删除词条
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="ops-actions">
              <button
                className="ops-btn"
                disabled={!canEditCategory}
                type="button"
                onClick={() => {
                  setDraft((current) => current ? ({
                    ...current,
                    sidebarItems: [
                      ...current.sidebarItems,
                      {
                        id: `sidebar-item-${current.sidebarItems.length + 1}`,
                        label: `新词条 ${current.sidebarItems.length + 1}`,
                        linkedMarketIds: [],
                      },
                    ],
                  }) : current)
                }}
              >
                新增词条
              </button>
              <button
                className="ops-btn"
                disabled={!canEditCategory || isSaving}
                type="button"
                onClick={() => void handleSave()}
              >
                保存分类配置
              </button>
            </div>
          </section>

          <section className="detail-panel">
            <div className="ops-section-head">
              <div>
                <h3>公开页预览摘要</h3>
                <p className="ops-muted">这里只展示左侧词条和自动统计摘要，不在运营台重建整套公开页。</p>
              </div>
            </div>
            {previewWarnings.length > 0 ? <OpsStringList title="预警" items={previewWarnings} /> : null}
            <div className="ops-list-stack">
              {draft.sidebarItems.map((item) => {
                const resolved = resolveSidebarPreview(item, validMarketIds)
                return (
                  <div className="ops-list-card" key={`preview-${item.id}`}>
                    <div className="ops-list-row">
                      <strong>{item.label || item.id}</strong>
                      <span className="ops-badge ops-badge-blue">{resolved.resolvedLinkedMarketCount}</span>
                    </div>
                    <p className="ops-muted">
                      已绑定 {resolved.linkedMarketIds.length} 个市场，其中 {resolved.resolvedLinkedMarketCount} 个仍属于当前分类公开市场集合。
                    </p>
                  </div>
                )
              })}
            </div>
            {draft.sidebarItems.length === 0 ? <OpsEmpty message="暂无可预览的词条内容。" /> : null}
          </section>
        </>
      ) : null}
    </section>
  )
}

// --- Dialog components used by OpsDiscoveryConfigPage ---

type AvailableMarketOption = { marketId: string; title: string }

function CustomCategoryDialog({
  existingSlugs,
  availableMarkets,
  isSaving,
  onCancel,
  onSubmit,
}: {
  existingSlugs: ReadonlySet<string>
  availableMarkets: AvailableMarketOption[]
  isSaving: boolean
  onCancel: () => void
  onSubmit: (input: {
    slug: string
    label: string
    title: string
    description: string
    marketIdWhitelist: string[]
  }) => Promise<void>
}) {
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const slugError = validateCustomSlug(slug.trim(), existingSlugs)
  const canSubmit = !isSaving && slug.trim().length > 0 && label.trim().length > 0 && !slugError

  function toggleMarket(marketId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(marketId)) {
        next.delete(marketId)
      } else {
        next.add(marketId)
      }
      return next
    })
  }

  return (
    <div className="ops-confirm-overlay" role="dialog" aria-modal="true" aria-label="新增自定义分类">
      <div className="ops-confirm-dialog" style={{ maxWidth: 720 }}>
        <h2>新增自定义分类</h2>
        <div className="ops-form-grid">
          <label className="ops-form-block">
            <span>slug *</span>
            <input
              placeholder="例如 esports"
              value={slug}
              onChange={(event) => setSlug(event.target.value.trim().toLowerCase())}
            />
            <small className="ops-muted">小写字母+数字+连字符,2-32 字符。生成路径 /zh/c/&lt;slug&gt;。</small>
            {slug.length > 0 && slugError ? <small style={{ color: 'crimson' }}>{slugError}</small> : null}
          </label>
          <label className="ops-form-block">
            <span>显示文案 *</span>
            <input
              placeholder="例如 电竞"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="ops-form-block">
            <span>页面标题</span>
            <input
              placeholder="留空时复用显示文案"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="ops-form-block">
            <span>说明</span>
            <textarea
              className="ops-textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>

        <div className="ops-string-list" style={{ marginTop: 16 }}>
          <strong>选择市场(白名单)</strong>
          <p className="ops-muted">选中的市场将作为该分类页右侧命题列表的全部内容。</p>
          {availableMarkets.length === 0 ? <OpsEmpty message="当前没有可选公开市场。" /> : (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', maxHeight: 320, overflow: 'auto' }}>
              {availableMarkets.map((market) => {
                const checked = selected.has(market.marketId)
                return (
                  <label key={market.marketId} className="ops-inline-toggle" style={{ alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleMarket(market.marketId)} />
                    <span>{market.title}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
        <div className="ops-actions">
          <button type="button" className="ops-btn ops-btn-ghost" onClick={onCancel} disabled={isSaving}>取消</button>
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={!canSubmit}
            onClick={async () => {
              setError(null)
              try {
                await onSubmit({
                  slug: slug.trim(),
                  label: label.trim(),
                  title: title.trim() || label.trim(),
                  description: description.trim(),
                  marketIdWhitelist: Array.from(selected),
                })
              } catch (submitError) {
                setError(submitError instanceof Error ? submitError.message : '提交失败,请重试。')
              }
            }}
          >
            创建分类
          </button>
        </div>
      </div>
    </div>
  )
}

function CustomCapsuleDialog({
  availableMarkets,
  isSaving,
  onCancel,
  onSubmit,
}: {
  availableMarkets: AvailableMarketOption[]
  isSaving: boolean
  onCancel: () => void
  onSubmit: (input: { label: string; marketIdWhitelist: string[] }) => Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const canSubmit = !isSaving && label.trim().length > 0

  function toggleMarket(marketId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(marketId)) {
        next.delete(marketId)
      } else {
        next.add(marketId)
      }
      return next
    })
  }

  return (
    <div className="ops-confirm-overlay" role="dialog" aria-modal="true" aria-label="新增自定义胶囊">
      <div className="ops-confirm-dialog" style={{ maxWidth: 720 }}>
        <h2>新增自定义胶囊</h2>
        <div className="ops-form-grid">
          <label className="ops-form-block">
            <span>胶囊文案 *</span>
            <input
              placeholder="例如 大选"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
        </div>
        <div className="ops-string-list" style={{ marginTop: 16 }}>
          <strong>选择市场(白名单)</strong>
          <p className="ops-muted">选中后,点击该胶囊将只展示这些市场。</p>
          {availableMarkets.length === 0 ? <OpsEmpty message="当前没有可选公开市场。" /> : (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', maxHeight: 320, overflow: 'auto' }}>
              {availableMarkets.map((market) => {
                const checked = selected.has(market.marketId)
                return (
                  <label key={market.marketId} className="ops-inline-toggle" style={{ alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleMarket(market.marketId)} />
                    <span>{market.title}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
        {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
        <div className="ops-actions">
          <button type="button" className="ops-btn ops-btn-ghost" onClick={onCancel} disabled={isSaving}>取消</button>
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={!canSubmit}
            onClick={async () => {
              setError(null)
              try {
                await onSubmit({
                  label: label.trim(),
                  marketIdWhitelist: Array.from(selected),
                })
              } catch (submitError) {
                setError(submitError instanceof Error ? submitError.message : '提交失败,请重试。')
              }
            }}
          >
            创建胶囊
          </button>
        </div>
      </div>
    </div>
  )
}

function MarketWhitelistDialog({
  title,
  availableMarkets,
  initialMarketIds,
  isSaving,
  onCancel,
  onSubmit,
}: {
  title: string
  availableMarkets: AvailableMarketOption[]
  initialMarketIds: string[]
  isSaving: boolean
  onCancel: () => void
  onSubmit: (marketIds: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialMarketIds))
  const [error, setError] = useState<string | null>(null)

  function toggleMarket(marketId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(marketId)) {
        next.delete(marketId)
      } else {
        next.add(marketId)
      }
      return next
    })
  }

  return (
    <div className="ops-confirm-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ops-confirm-dialog" style={{ maxWidth: 720 }}>
        <h2>{title}</h2>
        {availableMarkets.length === 0 ? <OpsEmpty message="当前没有可选公开市场。" /> : (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', maxHeight: 420, overflow: 'auto' }}>
            {availableMarkets.map((market) => {
              const checked = selected.has(market.marketId)
              return (
                <label key={market.marketId} className="ops-inline-toggle" style={{ alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleMarket(market.marketId)} />
                  <span>{market.title}</span>
                </label>
              )
            })}
          </div>
        )}
        {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
        <div className="ops-actions">
          <button type="button" className="ops-btn ops-btn-ghost" onClick={onCancel} disabled={isSaving}>取消</button>
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={isSaving}
            onClick={async () => {
              setError(null)
              try {
                await onSubmit(Array.from(selected))
              } catch (submitError) {
                setError(submitError instanceof Error ? submitError.message : '提交失败,请重试。')
              }
            }}
          >
            保存白名单
          </button>
        </div>
      </div>
    </div>
  )
}
