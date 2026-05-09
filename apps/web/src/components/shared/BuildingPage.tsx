import { Link } from 'react-router-dom'

export function BuildingPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="route-page empty-route">
      <div className="route-header">
        <span>Arena</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="primary-action" to="/zh">返回首页</Link>
      </div>
    </section>
  )
}
