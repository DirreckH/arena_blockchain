import { BarChart3, CircleDollarSign, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ARENA_LOGO_SRC, footerTopics } from '../../features/app-shell/navigation-contract'
import { useRulesIntro } from '../shared/RulesIntroContext'

export function SiteFooter() {
  const { openRulesIntro } = useRulesIntro()

  return (
    <footer className="site-footer layout-container">
      <div className="footer-brand">
        <Link className="footer-logo" to="/zh">
          <img src={ARENA_LOGO_SRC} alt="Arena" />
          <span>Arena</span>
        </Link>
        <p>可验证人群共识与调研网络</p>
      </div>
      <div className="footer-columns">
        <section>
          <h3>按主题浏览命题</h3>
          <div className="footer-topic-grid">
            {footerTopics.map((topic) => (
              <Link to={topic.href} key={topic.label}>
                <span>{topic.label}</span>
                <small>状态与样本进度</small>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <h3>支持与说明</h3>
          <button type="button" onClick={openRulesIntro}>信息边界说明</button>
          <Link to="/zh/activity">账户设置</Link>
          <Link to="/zh/help">帮助中心</Link>
          <Link to="/zh/contact">联系入口</Link>
        </section>
        <section>
          <h3>Arena</h3>
          <Link to="/zh/rewards">参与激励</Link>
          <Link to="/zh/docs">开发文档</Link>
          <Link to="/zh/leaderboard">贡献排行</Link>
          <Link to="/zh/accuracy">公开结果复核</Link>
          <Link to="/zh/activity">账户活动</Link>
        </section>
      </div>
      <div className="footer-legal">
        <div>
          <Link to="/zh/contact"><CircleDollarSign size={18} /> 联系我们</Link>
          <Link to="/zh/docs"><BarChart3 size={18} /> 开发文档</Link>
          <Link to="/zh/market-integrity"><Sparkles size={18} /> 信息边界</Link>
        </div>
        <div className="footer-legal-meta">
          <span>Arena © 2026</span>
          <Link to="/zh/market-integrity">隐私与信息边界</Link>
          <Link to="/zh/help">使用条款</Link>
          <Link to="/zh/help">帮助中心</Link>
        </div>
      </div>
    </footer>
  )
}
