import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  description: string
  withNote?: boolean
  withReason?: boolean
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  reasonDefaultValue?: string
  danger?: boolean
  onConfirm: (payload: { note: string; reason: string }) => void
  onCancel: () => void
}

export function OpsConfirmDialog({
  title,
  description,
  withNote,
  withReason,
  requireReason,
  reasonLabel,
  reasonPlaceholder,
  reasonDefaultValue,
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const [note, setNote] = useState('')
  const [reason, setReason] = useState(reasonDefaultValue ?? '')
  const overlayRef = useRef<HTMLDivElement>(null)

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onCancel()
  }

  const el = (
    <div className="ops-confirm-overlay" ref={overlayRef} onClick={handleOverlayClick} role="presentation">
      <div className="ops-confirm-dialog" role="dialog" aria-modal aria-labelledby="ops-dialog-title">
        <h2 id="ops-dialog-title">{title}</h2>
        <p>{description}</p>
        {withReason && (
          <label className="ops-confirm-field">
            <span>{reasonLabel ?? '原因'}</span>
            <input
              aria-label={reasonLabel ?? '原因'}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder ?? '请输入原因'}
              value={reason}
            />
          </label>
        )}
        {withNote && (
          <textarea
            placeholder="备注（可选）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="备注"
          />
        )}
        <div className="ops-actions">
          <button className="ops-btn ops-btn-ghost" type="button" onClick={onCancel}>取消</button>
          <button
            className={`ops-btn ${danger ? 'ops-btn-danger' : 'ops-btn-primary'}`}
            type="button"
            disabled={Boolean(withReason && requireReason && !reason.trim())}
            onClick={() => onConfirm({ note, reason: reason.trim() })}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(el, document.body)
}
