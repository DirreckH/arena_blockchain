import { ArrowRight, Compass, FileQuestion, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

const NOT_FOUND_QUICK_LINKS: Array<{ icon: typeof Home; href: string; label: string; description: string }> = [
  { icon: Home, href: '/zh', label: '回到发现页', description: '查看精选命题与实时进度' },
  { icon: Compass, href: '/zh/markets', label: '浏览市场排行', description: '按热度与时效查看公开命题' },
  { icon: FileQuestion, href: '/zh/help', label: '帮助中心', description: '查看常见问题或联系 Arena 团队' },
]

export function NotFoundPage() {
  return (
    <section className="route-page empty-route not-found-page">
      <div className="route-header">
        <span>404</span>
        <h1>页面未找到</h1>
        <p>这个内部链接暂时没有对应内容。下方常用入口可以帮你回到产品的主要路径。</p>
        <Link className="primary-action" to="/zh">返回首页</Link>
      </div>

      <div className="not-found-grid">
        {NOT_FOUND_QUICK_LINKS.map((link) => {
          const Icon = link.icon
          return (
            <Link className="not-found-card" key={link.href} to={link.href}>
              <span className="not-found-card-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <div className="not-found-card-copy">
                <strong>{link.label}</strong>
                <span>{link.description}</span>
              </div>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
