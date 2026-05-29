import { Check, ChevronRight, Copy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDiscoveryData } from '../../features/arena/discovery-data'
import { useValidationMarketData } from '../../features/validation/validation-market-data'
import { MarketCardView } from '../market/MarketCardView'
import { useShellLanguage } from './ShellLanguageContext'

type UtilityVariant = 'categories' | 'pages' | 'language' | 'share' | 'news'

const pageLinks = [
  {
    section: '产品入口',
    items: [
      { label: '发现', href: '/zh', description: '首页命题流与热门精选' },
      { label: '市场排行', href: '/zh/markets', description: '全量命题按热度与时效排行' },
      { label: '突发命题', href: '/zh/breaking', description: '实时更新的高交互命题' },
      { label: '最新命题', href: '/zh/new', description: '最近发布的候选命题' },
    ],
  },
  {
    section: '用户功能',
    items: [
      { label: '裁决任务', href: '/zh/adjudication', description: '查看并完成你的裁决任务' },
      { label: '提交候选', href: '/zh/challenges', description: '创建并提交候选命题草稿' },
      { label: '草稿箱', href: '/zh/drafts', description: '管理你保存的命题草稿' },
      { label: '已提交命题', href: '/zh/submissions', description: '追踪候选命题的审核状态并支持撤回到草稿' },
      { label: '已保存命题', href: '/zh/watchlist', description: '你收藏的命题列表' },
      { label: '账户活动', href: '/zh/activity', description: '查看账户历史与资产概览' },
      { label: '账户主页', href: '/zh/results', description: '净值、收益与持仓总览' },
    ],
  },
  {
    section: '支持与信息',
    items: [
      { label: '帮助中心', href: '/zh/help', description: '产品使用指南与常见问题' },
      { label: '信息隔离边界', href: '/zh/market-integrity', description: '裁决层与验证层的隔离规则' },
      { label: '公开结果复核', href: '/zh/accuracy', description: '历史裁决结果的公开存档' },
      { label: '语言设置', href: '/zh/language', description: '切换产品界面显示语言' },
    ],
  },
]

export function UtilityPage({
  title,
  description,
  variant,
}: {
  title: string
  description: string
  variant: UtilityVariant
}) {
  const { markets: publicMarkets } = useValidationMarketData()
  const {
    activeLanguage,
    availableLanguages,
    setActiveLanguage,
  } = useShellLanguage()
  const { categoryIndex } = useDiscoveryData()
  const visibleMarkets = publicMarkets.slice(0, 6)
  const categoryLinks = Array.from(categoryIndex.values()).map((item) => ({
    label: item.directoryLabel,
    href: item.pathname,
    description: item.description,
  }))
  const [copiedMarketId, setCopiedMarketId] = useState<string | null>(null)

  const handleCopyShareLink = async (marketId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const shareUrl = `${origin}/zh/event/${marketId}`

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl)
      }
      setCopiedMarketId(marketId)
      window.setTimeout(() => setCopiedMarketId((current) => (current === marketId ? null : current)), 2200)
    } catch {
      setCopiedMarketId(null)
    }
  }

  if (variant === 'categories') {
    return (
      <section className="route-page utility-page">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>分类浏览</h1>
          <p>按主题分类浏览 Arena 公开命题，覆盖政策、金融、科技、体育等多个领域。</p>
        </div>

        <div className="utility-stack">
          <div className="utility-category-grid">
            {categoryLinks.map((item) => (
              <Link className="utility-category-card" key={item.href} to={item.href}>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (variant === 'pages') {
    return (
      <section className="route-page utility-page">
        <div className="route-header compact">
          <span>Arena</span>
          <h1>全部页面</h1>
          <p>Arena 产品所有入口一览，覆盖发现、市场、账户、支持等功能模块。</p>
        </div>

        <div className="utility-stack">
          {pageLinks.map((group) => (
            <div className="utility-page-group" key={group.section}>
              <h2 className="utility-page-group-title">{group.section}</h2>
              <div className="utility-page-list">
                {group.items.map((item) => (
                  <Link className="utility-page-row" key={item.href} to={item.href}>
                    <div className="utility-page-row-copy">
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </div>
                    <ChevronRight size={16} />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      {variant === 'language' ? (
        <div className="route-list">
          {availableLanguages.map((language) => (
            <button
              className={language.code === activeLanguage.code ? 'route-list-item selected' : 'route-list-item'}
              key={language.code}
              onClick={() => setActiveLanguage(language.code)}
              type="button"
            >
              <span>{language.label}</span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      ) : null}

      {variant === 'share' ? (
        <div className="utility-stack">
          <div className="utility-share-list">
            {visibleMarkets.map((market) => {
              const isCopied = copiedMarketId === market.id
              return (
                <div className="utility-share-row" key={`share-row-${market.id}`}>
                  <div className="utility-share-row-copy">
                    <strong>{market.title}</strong>
                    <span>{market.category}</span>
                  </div>
                  <button
                    type="button"
                    className={isCopied ? 'utility-share-action copied' : 'utility-share-action'}
                    onClick={() => { void handleCopyShareLink(market.id) }}
                    aria-label={`复制 ${market.title} 的分享链接`}
                  >
                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{isCopied ? '已复制链接' : '复制分享链接'}</span>
                  </button>
                </div>
              )
            })}
          </div>
          <div className="market-grid route-grid">
            {visibleMarkets.map((market) => (
              <MarketCardView market={market} key={`share-${market.id}`} />
            ))}
          </div>
        </div>
      ) : null}

      {variant === 'news' ? (
        <div className="market-grid route-grid">
          {visibleMarkets.map((market) => (
            <MarketCardView market={market} key={`news-${market.id}`} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
