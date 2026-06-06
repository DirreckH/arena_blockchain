import { type Dispatch, type SetStateAction, useState } from 'react'
import { useAuthSession } from '../../features/auth/auth-session'
import { opsCopy } from '../../features/arena/ops-copy'
import type { ActionPayload, Feedback, PendingAction } from './ops-shared'

type PersistedOpsActionReceipt = {
  id: string
  actorUserId: string | null
  title: string
  description: string
  tone: Feedback['tone']
  message: string
  receipt: string[] | null
  createdAt: string
}

type ActionFeedbackOverride = {
  feedback: Feedback
}

const OPS_RECENT_ACTION_RECEIPTS_STORAGE_KEY = 'arena.ops.recentActionReceipts'

export function useOpsActionDialog(): [
  JSX.Element | null,
  PendingAction | null,
  boolean,
  Feedback | null,
  Dispatch<SetStateAction<PendingAction | null>>,
  (payload: ActionPayload) => Promise<void>,
] {
  const { identity } = useAuthSession()
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  async function confirmAction(payload: ActionPayload) {
    if (!pendingAction) return
    setBusy(true)
    setFeedback(null)
    try {
      const result = await pendingAction.run(payload)
      const feedbackOverride = readActionFeedbackOverride(result)
      const nextFeedback = feedbackOverride ?? {
        tone: 'success',
        message: pendingAction.successMessage,
        receipt: summarizeActionReceipt(result),
      }
      setFeedback(nextFeedback)
      persistOpsActionReceipt({
        actorUserId: identity?.sub ?? null,
        description: pendingAction.description,
        message: nextFeedback.message,
        receipt: nextFeedback.receipt ?? null,
        title: pendingAction.title,
        tone: nextFeedback.tone,
      })
      setPendingAction(null)
    } catch (error) {
      const nextFeedback = {
        tone: 'error',
        message: String((error as Error).message ?? error),
      } satisfies Feedback
      setFeedback(nextFeedback)
      persistOpsActionReceipt({
        actorUserId: identity?.sub ?? null,
        description: pendingAction.description,
        message: nextFeedback.message,
        receipt: null,
        title: pendingAction.title,
        tone: nextFeedback.tone,
      })
    } finally {
      setBusy(false)
    }
  }

  return [busy ? <div className="ops-loading">{opsCopy.actions.working}</div> : null, pendingAction, busy, feedback, setPendingAction, confirmAction]
}

export function readPersistedOpsActionReceipts(actorUserId?: string): PersistedOpsActionReceipt[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(OPS_RECENT_ACTION_RECEIPTS_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item): item is PersistedOpsActionReceipt => (
        !!item
        && typeof item === 'object'
        && typeof (item as { id?: unknown }).id === 'string'
        && typeof (item as { title?: unknown }).title === 'string'
        && typeof (item as { description?: unknown }).description === 'string'
        && ((item as { actorUserId?: unknown }).actorUserId === null || typeof (item as { actorUserId?: unknown }).actorUserId === 'string')
        && ((item as { tone?: unknown }).tone === 'success' || (item as { tone?: unknown }).tone === 'error')
        && typeof (item as { message?: unknown }).message === 'string'
        && ((item as { receipt?: unknown }).receipt === null || Array.isArray((item as { receipt?: unknown }).receipt))
        && typeof (item as { createdAt?: unknown }).createdAt === 'string'
      ))
      .filter((item) => !actorUserId || item.actorUserId === actorUserId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  } catch {
    return []
  }
}

function persistOpsActionReceipt(input: Omit<PersistedOpsActionReceipt, 'createdAt' | 'id'>) {
  if (typeof window === 'undefined') {
    return
  }

  const nextItem: PersistedOpsActionReceipt = {
    ...input,
    id: `ops-receipt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
  }
  const current = readPersistedOpsActionReceipts()
  const next = [nextItem, ...current].slice(0, 20)
  window.localStorage.setItem(OPS_RECENT_ACTION_RECEIPTS_STORAGE_KEY, JSON.stringify(next))
}

function summarizeActionReceipt(result: unknown): string[] | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return null
  }

  const value = result as Record<string, unknown>
  const receipt: string[] = []

  const scalarKeys = [
    'status',
    'requestStatus',
    'propositionId',
    'marketId',
    'chainMarketId',
    'chainPropositionId',
    'ledgerId',
    'responseId',
    'queue',
    'failedCount',
    'retriedCount',
    'skippedCount',
    'txHash',
    'attemptedAt',
  ] as const

  scalarKeys.forEach((key) => {
    const item = value[key]
    if (item !== undefined && item !== null && item !== '') {
      receipt.push(`${key}: ${String(item)}`)
    }
  })

  if (value.proposition && typeof value.proposition === 'object' && !Array.isArray(value.proposition)) {
    const proposition = value.proposition as Record<string, unknown>
    if (proposition.id) {
      receipt.push(`proposition: ${String(proposition.id)}`)
    }
    if (proposition.status) {
      receipt.push(`proposition status: ${String(proposition.status)}`)
    }
  }

  if (value.market && typeof value.market === 'object' && !Array.isArray(value.market)) {
    const market = value.market as Record<string, unknown>
    if (market.id) {
      receipt.push(`market: ${String(market.id)}`)
    }
    if (market.status) {
      receipt.push(`market status: ${String(market.status)}`)
    }
  }

  return receipt.length > 0 ? receipt : null
}

function readActionFeedbackOverride(result: unknown): Feedback | null {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !('feedback' in result)) {
    return null
  }

  const feedback = (result as ActionFeedbackOverride).feedback
  if (!feedback || (feedback.tone !== 'success' && feedback.tone !== 'error') || typeof feedback.message !== 'string') {
    return null
  }

  return feedback
}

export type { ActionFeedbackOverride, PersistedOpsActionReceipt }
