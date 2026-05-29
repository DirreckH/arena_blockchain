import { BookOpen, ChevronRight, Code2, FileText, Link2, Shield, Terminal } from 'lucide-react'
import { Link } from 'react-router-dom'

const docSections = [
  {
    icon: BookOpen,
    title: '产品概览',
    description: '了解 Arena 的核心架构：裁决层、验证层与奖励机制的协同关系。',
    href: '/zh/market-integrity',
    tag: '入门',
  },
  {
    icon: Code2,
    title: 'Relayer API',
    description: '使用 Relayer API 接入 Arena 链上数据流，提交裁决任务和读取命题状态。认证方式：Bearer Token。',
    href: '/zh/market-integrity',
    tag: 'API',
  },
  {
    icon: Terminal,
    title: 'WebSocket 推送',
    description: '通过 WebSocket 订阅命题状态变更、开奖事件和质检批次更新，实现实时数据接入。',
    href: '/zh/market-integrity',
    tag: '实时',
  },
  {
    icon: FileText,
    title: '命题数据结构',
    description: '命题对象的完整字段定义，包括状态机、阶段枚举、质检字段与奖励分配模型。',
    href: '/zh/market-integrity',
    tag: '参考',
  },
  {
    icon: Shield,
    title: '信息隔离边界',
    description: '裁决层与验证层的数据隔离规则，以及面向开发者的安全集成注意事项。',
    href: '/zh/market-integrity',
    tag: '安全',
  },
  {
    icon: Link2,
    title: '开发者码与沙盒',
    description: '在沙盒环境中测试集成逻辑，使用开发者码隔离测试流量，不影响正式账户数据。',
    href: '/zh/market-integrity',
    tag: '测试',
  },
]

const apiEndpoints = [
  { method: 'GET', path: '/v1/propositions', description: '获取命题列表，支持分页与状态筛选' },
  { method: 'GET', path: '/v1/propositions/:id', description: '获取单个命题详情，含阶段与质检进度' },
  { method: 'POST', path: '/v1/adjudication/submit', description: '提交裁决回答，需携带 auth token' },
  { method: 'GET', path: '/v1/account/rewards', description: '读取账户奖励记录，按时间降序返回' },
  { method: 'GET', path: '/v1/account/reputation', description: '读取账户声誉评分与阶段标签' },
  { method: 'POST', path: '/v1/propositions/draft', description: '创建命题草稿，进入候选审核队列' },
]

export function DocsPage() {
  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>开发文档</h1>
        <p>Arena 开发者接入指南，涵盖 API 参考、数据结构与集成最佳实践。</p>
      </div>

      <div className="utility-stack">
        <div>
          <h2 className="utility-page-group-title">文档分类</h2>
          <div className="help-grid">
            {docSections.map((section) => {
              const Icon = section.icon
              return (
                <Link className="help-card" key={section.title} to={section.href}>
                  <div className="help-card-icon" aria-hidden="true">
                    <Icon size={16} />
                  </div>
                  <strong>{section.title}</strong>
                  <p>{section.description}</p>
                  <span className="help-card-link">
                    {section.tag} <ChevronRight size={13} />
                  </span>
                </Link>
              )
            })}
          </div>
        </div>

        <article className="account-settings-detail-card">
          <div className="account-settings-detail-head">
            <strong>API 端点速查</strong>
            <p>Relayer API 核心端点列表，基础路径：<code>https://api.arena.xyz</code>。所有写操作需携带 Bearer Token。</p>
          </div>

          <div className="account-settings-detail-list">
            {apiEndpoints.map((ep) => (
              <div className="account-settings-detail-row" key={ep.path}>
                <div className="account-settings-detail-meta">
                  <span>
                    <code style={{ fontSize: '0.78rem', marginRight: '0.5rem', opacity: 0.7 }}>
                      {ep.method}
                    </code>
                    <code style={{ fontSize: '0.82rem' }}>{ep.path}</code>
                  </span>
                  <small>{ep.description}</small>
                </div>
                <em className={`account-settings-detail-value ${ep.method === 'GET' ? 'neutral' : 'info'}`}>
                  {ep.method}
                </em>
              </div>
            ))}
          </div>
        </article>

        <div className="help-contact-card">
          <div className="help-card-icon" aria-hidden="true">
            <Terminal size={16} />
          </div>
          <div className="help-contact-copy">
            <strong>在账户设置中获取 API 密钥</strong>
            <p>前往账户设置 → 开发者选项，生成 Relayer API 密钥后即可在沙盒环境中开始测试集成。</p>
            <Link className="help-card-link" to="/zh/activity">
              <ChevronRight size={13} />
              前往账户设置
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
