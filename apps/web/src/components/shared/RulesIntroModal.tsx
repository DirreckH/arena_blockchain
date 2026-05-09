import { X } from 'lucide-react'
import { RULES_INTRO_STEPS } from './RulesIntroContent'

type RulesIntroModalProps = {
  isOpen: boolean
  stepIndex: number
  onClose: () => void
  onPrimaryAction: (stepIndex: number) => void
  onSelectStep: (stepIndex: number) => void
}

const STATUS_LABELS = {
  browse: '浏览中',
  judge: '判断中',
  boundary: '隔离中',
  settled: '已公开',
} as const

export function RulesIntroModal({
  isOpen,
  stepIndex,
  onClose,
  onPrimaryAction,
  onSelectStep,
}: RulesIntroModalProps) {
  if (!isOpen) {
    return null
  }

  const currentStep = RULES_INTRO_STEPS[stepIndex]

  return (
    <div className="rules-intro-overlay" onClick={onClose} role="presentation">
      <section
        aria-describedby="rules-intro-description"
        aria-labelledby="rules-intro-title"
        aria-modal="true"
        className={`rules-intro-dialog rules-intro-dialog--${currentStep.visualVariant}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="关闭规则介绍"
          className="rules-intro-close"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>

        <div className={`rules-intro-visual rules-intro-visual--${currentStep.visualVariant}`}>
          <article className="rules-intro-visual-card">
            <div className="rules-intro-visual-card-head">
              <div className="rules-intro-visual-title-group">
                <span className="rules-intro-visual-kicker">Arena</span>
                <strong>{currentStep.panelTitle}</strong>
              </div>
            </div>

            <p>{currentStep.panelNote}</p>

            <div className="rules-intro-chip-row">
              {currentStep.chips.map((chip) => (
                <span className="rules-intro-chip" key={chip}>
                  {chip}
                </span>
              ))}
            </div>

            <div className="rules-intro-metric-grid">
              {currentStep.metrics.map((metric) => (
                <div className="rules-intro-metric" key={`${currentStep.title}-${metric.label}-${metric.value}`}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="rules-intro-body">
          <span className="rules-intro-step-count">{`第 ${stepIndex + 1} 步 / ${RULES_INTRO_STEPS.length}`}</span>
          <h2 id="rules-intro-title">{currentStep.title}</h2>
          <p id="rules-intro-description">{currentStep.description}</p>
        </div>

        <div className="rules-intro-footer">
          <div aria-label="规则介绍步骤" className="rules-intro-dots" role="tablist">
            {RULES_INTRO_STEPS.map((step, index) => (
              <button
                aria-label={`跳转到${step.title}`}
                aria-selected={index === stepIndex}
                className={index === stepIndex ? 'rules-intro-dot active' : 'rules-intro-dot'}
                key={step.title}
                onClick={() => onSelectStep(index)}
                role="tab"
                type="button"
              />
            ))}
          </div>

          <button
            className="primary-action rules-intro-cta"
            onClick={() => onPrimaryAction(stepIndex)}
            type="button"
          >
            {currentStep.primaryButtonLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
