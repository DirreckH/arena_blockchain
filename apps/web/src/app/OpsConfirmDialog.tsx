import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { PendingActionField } from './ops/ops-shared'

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
  extraFields?: PendingActionField[]
  onConfirm: (payload: { note: string; reason: string; fields?: Record<string, string> }) => void
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
  extraFields,
  onConfirm,
  onCancel,
}: Props) {
  const [note, setNote] = useState('')
  const [reason, setReason] = useState(reasonDefaultValue ?? '')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        (extraFields ?? []).map((field) => [field.key, field.defaultValue ?? '']),
      ),
  )
  const overlayRef = useRef<HTMLDivElement>(null)
  const hasMissingRequiredExtraFields = useMemo(
    () =>
      (extraFields ?? []).some(
        (field) => field.required && !(fieldValues[field.key] ?? '').trim(),
      ),
    [extraFields, fieldValues],
  )

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
        {(extraFields ?? []).map((field) => (
          <label className="ops-confirm-field" key={field.key}>
            <span>{field.label}</span>
            <input
              aria-label={field.label}
              onChange={(event) =>
                setFieldValues((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))}
              placeholder={field.placeholder ?? ''}
              value={fieldValues[field.key] ?? ''}
            />
          </label>
        ))}
        <div className="ops-actions">
          <button className="ops-btn ops-btn-ghost" type="button" onClick={onCancel}>取消</button>
          <button
            className={`ops-btn ${danger ? 'ops-btn-danger' : 'ops-btn-primary'}`}
            type="button"
            disabled={Boolean(withReason && requireReason && !reason.trim()) || hasMissingRequiredExtraFields}
            onClick={() => onConfirm({ note, reason: reason.trim(), fields: fieldValues })}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(el, document.body)
}
