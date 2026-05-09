import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="route-page empty-route">
      <div className="route-header">
        <span>404</span>
        <h1>页面未找到</h1>
        <p>这个内部链接暂时没有对应内容，先返回首页继续浏览。</p>
        <Link className="primary-action" to="/zh">返回首页</Link>
      </div>
    </section>
  )
}
