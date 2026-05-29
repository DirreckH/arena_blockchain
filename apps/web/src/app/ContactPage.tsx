import { BookOpen, ChevronRight, Mail, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

const contactChannels = [
  {
    icon: Mail,
    title: '通用咨询',
    description: '命题审核、账户问题、奖励结算等一般性问题，通过邮件联系 Arena 支持团队。',
    action: 'support@arena.xyz',
    href: 'mailto:support@arena.xyz',
    label: '发送邮件',
  },
  {
    icon: MessageCircle,
    title: '开发者支持',
    description: '接入 Relayer API、开发者码配置或沙盒环境问题，联系技术集成支持。',
    action: 'dev@arena.xyz',
    href: 'mailto:dev@arena.xyz',
    label: '联系开发者支持',
  },
]

const selfHelpLinks = [
  { label: '帮助中心', description: '产品使用常见问题与功能说明', href: '/zh/help' },
  { label: '开发文档', description: 'API 参考、数据结构与集成指南', href: '/zh/docs' },
  { label: '参与激励', description: '奖励机制、等级与结算规则说明', href: '/zh/rewards' },
]

export function ContactPage() {
  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>联系我们</h1>
        <p>如果帮助中心未能解答你的问题，可以通过以下渠道联系 Arena 团队。</p>
      </div>

      <div className="utility-stack">
        <div className="help-grid">
          {contactChannels.map((channel) => {
            const Icon = channel.icon
            return (
              <a className="help-card" href={channel.href} key={channel.title}>
                <div className="help-card-icon" aria-hidden="true">
                  <Icon size={16} />
                </div>
                <strong>{channel.title}</strong>
                <p>{channel.description}</p>
                <span className="help-card-link">
                  {channel.label} <ChevronRight size={13} />
                </span>
              </a>
            )
          })}
        </div>

        <article className="account-settings-detail-card">
          <div className="account-settings-detail-head">
            <strong>自助资源</strong>
            <p>大多数问题可以在文档和帮助中心找到解答，优先查阅可以更快解决问题。</p>
          </div>

          <div className="account-settings-detail-list">
            {selfHelpLinks.map((item) => (
              <div className="account-settings-detail-row" key={item.label}>
                <div className="account-settings-detail-meta">
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </div>
                <Link
                  className="account-settings-detail-value info"
                  to={item.href}
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  查看 <ChevronRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        </article>

        <div className="help-contact-card">
          <div className="help-card-icon" aria-hidden="true">
            <BookOpen size={16} />
          </div>
          <div className="help-contact-copy">
            <strong>回报周期与结算问题</strong>
            <p>如果你的奖励记录与预期不符，请先查阅账户页的奖励记录和裁决历史，确认质检状态后再提交支持请求，可以帮助我们更快定位问题。</p>
            <Link className="help-card-link" to="/zh/activity">
              查看账户记录 <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
