import type { ReactNode } from 'react'
import type { AccountSummaryItem, MockUser } from '../../mocks/account-shell.mock'

export function AccountShellHeader({
  user,
  eyebrow = 'Arena 账户',
  title,
  description,
  metrics,
  actions,
  compactIdentity = false,
}: {
  user?: MockUser | null
  eyebrow?: string
  title: string
  description: string
  metrics: AccountSummaryItem[]
  actions?: ReactNode
  compactIdentity?: boolean
}) {
  return (
    <section className={compactIdentity ? 'account-summary-card account-shell-header compact' : 'account-summary-card account-shell-header'}>
      <div className="account-summary-top">
        <div className="account-summary-head">
          <span className="account-summary-avatar" aria-hidden="true">
            {user?.avatarInitial ?? 'A'}
          </span>

          <div className="account-summary-copy">
            {!compactIdentity ? <span className="account-summary-kicker">{eyebrow}</span> : null}
            <strong>{title}</strong>
            {!compactIdentity ? (
              <span className="account-summary-meta">
                {user ? `${user.displayName} · ${user.email}` : '未登录预览 · 登录后切换为你的账户壳'}
              </span>
            ) : null}
            {!compactIdentity ? <p>{description}</p> : null}
          </div>
        </div>

        {actions ? <div className="account-summary-actions">{actions}</div> : null}
      </div>

      <div className="account-summary-grid">
        {metrics.map((item) => (
          <article key={`${title}-${item.label}`} className="account-summary-item">
            <span>{item.label}</span>
            <strong className={item.tone ? `account-summary-value ${item.tone}` : 'account-summary-value'}>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>
    </section>
  )
}
