import { Info, X } from 'lucide-react'
import { useState } from 'react'
import { useRulesIntro } from '../shared/RulesIntroContext'

export function InfoToast() {
  const [visible, setVisible] = useState(true)
  const { openRulesIntro } = useRulesIntro()

  if (!visible) {
    return null
  }

  return (
    <div className="info-toast" role="note">
      <Info size={16} fill="currentColor" />
      <button className="info-toast-link" onClick={openRulesIntro} type="button">
        <strong>信息边界</strong>
      </button>
      <button className="info-toast-dismiss" type="button" onClick={() => setVisible(false)} aria-label="关闭提示">
        <X size={17} />
      </button>
    </div>
  )
}
