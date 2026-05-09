import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useValidationMarketData } from '../../features/validation/validation-market-data'

export function RightRail({ className = 'right-rail' }: { className?: string }) {
  const { markets } = useValidationMarketData()
  const breakingNews = markets.slice(0, 3)
  const hotTopics = markets.slice(0, 5)

  return (
    <aside className={className} aria-label="突发新闻和热点事件">
      <RailSection title="突发命题" href="/zh/breaking">
        {breakingNews.map((market, index) => (
          <Link className="ranked-row" key={market.id} to={`/zh/event/${market.id}`}>
            <span className="rank">{index + 1}</span>
            <span className="rank-title">{market.title}</span>
            <span className="rank-status">{market.progress.statusLabel}</span>
          </Link>
        ))}
      </RailSection>

      <RailSection title="热点事件" href="/zh/markets">
        {hotTopics.map((market, index) => (
          <Link className="topic-row" key={market.id} to={`/zh/event/${market.id}`}>
            <span className="rank">{index + 1}</span>
            <span>{market.title}</span>
            <span className="topic-meta">{market.category}</span>
            <ChevronRight size={16} />
          </Link>
        ))}
      </RailSection>
    </aside>
  )
}

function RailSection({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <section className="rail-section">
      <Link to={href} className="rail-heading">
        {title}
        <ChevronRight size={18} />
      </Link>
      <div>{children}</div>
    </section>
  )
}
