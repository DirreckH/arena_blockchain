import type { useLocation, useNavigate } from 'react-router-dom'

export type ErrorStateKind = 'not_found' | 'unauthorized' | 'forbidden' | 'network' | 'unknown'

export type SearchUpdater = (
  navigate: ReturnType<typeof useNavigate>,
  location: ReturnType<typeof useLocation>,
  updates: Record<string, string | undefined>,
) => void

export type Feedback = {
  tone: 'success' | 'error'
  message: string
  receipt?: string[] | null
}

export type ActionPayload = {
  note: string
  reason: string
  fields?: Record<string, string>
}

export type PendingActionField = {
  key: string
  label: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
}

export type PendingAction = {
  title: string
  description: string
  danger?: boolean
  withNote?: boolean
  withReason?: boolean
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  reasonDefaultValue?: string
  extraFields?: PendingActionField[]
  successMessage: string
  run: (payload: ActionPayload) => Promise<unknown>
}
