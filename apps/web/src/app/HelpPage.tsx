import { BookOpen, ChevronRight, Mail, MessageCircle, Shield, Sparkles, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

const helpTopics = [
  {
    icon: Sparkles,
    title: '什么是 Arena？',
    description: '了解 Arena 的核心定位：可验证人群共识与调研网络，以及裁决层与验证层如何协同工作。',
    href: '/zh/market-integrity',
  },
  {
    icon: Zap,
    title: '如何参与裁决？',
    description: '登录后前往裁决页，领取待裁决任务，选择答案提交后等待质检结果与奖励入账。',
    href: '/zh/adjudication',
  },
  {
    icon: BookOpen,
    title: '如何提交候选命题？',
    description: '前往挑战页，填写标题、描述、选项和补充链接，保存草稿后可一键提交进入审核流程。',
    href: '/zh/challenges',
  },
  {
    icon: Shield,
    title: '信息边界是什么？',
    description: '开奖前，裁决层与验证层严格隔离。你只能看到时间进度和有效样本数，不展示实时方向。',
    href: '/zh/market-integrity',
  },
]

const faqs = [
  {
    question: '裁决层和验证层有什么区别？',
    answer: '裁决层负责收集回答、质检样本、形成共识结论；验证层是预测市场，用户可以对命题走向下注。两层在开奖前信息严格隔离，避免数据污染。',
  },
  {
    question: '我的裁决回答会如何被评估？',
    answer: '平台会对提交的回答进行质检，评估为有效、部分有效、无效或异常。有效样本会贡献信誉和奖励资格；无效回答不计入有效样本池。',
  },
  {
    question: '命题候选审核需要多长时间？',
    answer: '候选命题提交后进入审核队列，由平台进行信息边界、选项互斥性和公开可验证性检查。通过后才可进入候选池，时间取决于当前审核负载。',
  },
  {
    question: '如何查看自己的裁决历史？',
    answer: '前往裁决页，切换到「已完成」或「回答质量」选项卡，可以查看已完成任务的质检结果和奖励到账情况。',
  },
  {
    question: '「有效样本」是什么意思？',
    answer: '有效样本指通过质检的回答数量。每个命题设有最低有效样本门槛，达到后才能进入开奖流程。进度条展示当前有效样本/总要求数量。',
  },
]

export function HelpPage() {
  return (
    <section className="route-page utility-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>帮助中心</h1>
        <p>了解 Arena 的核心玩法、参与规则和产品功能，快速上手可验证共识网络。</p>
      </div>

      <div className="utility-stack">
        <div className="help-grid">
          {helpTopics.map((topic) => {
            const Icon = topic.icon
            return (
              <Link className="help-card" key={topic.title} to={topic.href}>
                <div className="help-card-icon" aria-hidden="true">
                  <Icon size={16} />
                </div>
                <strong>{topic.title}</strong>
                <p>{topic.description}</p>
                <span className="help-card-link">
                  了解更多 <ChevronRight size={13} />
                </span>
              </Link>
            )
          })}
        </div>

        <div>
          <h2 className="utility-page-group-title">常见问题</h2>
          <div className="help-faq">
            {faqs.map((faq) => (
              <div className="help-faq-item" key={faq.question}>
                <p className="help-faq-question">{faq.question}</p>
                <p className="help-faq-answer">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="help-contact-card">
          <div className="help-card-icon" aria-hidden="true">
            <MessageCircle size={16} />
          </div>
          <div className="help-contact-copy">
            <strong>还有其他问题？</strong>
            <p>帮助中心覆盖了核心使用场景。如果你的问题在这里找不到答案，可以通过下方链接联系 Arena 团队。</p>
            <Link className="help-card-link" to="/zh/contact">
              <Mail size={13} />
              联系 Arena
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
