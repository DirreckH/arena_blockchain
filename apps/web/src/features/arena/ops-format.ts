export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

export function fmtBadgeClass(
  status: string,
): 'ops-badge-green' | 'ops-badge-red' | 'ops-badge-yellow' | 'ops-badge-gray' | 'ops-badge-blue' {
  const s = status.toLowerCase()
  if (['open', 'active', 'healthy', 'approved', 'resolved', 'ready', 'complete'].some((k) => s.includes(k))) return 'ops-badge-green'
  if (['freeze', 'frozen', 'paused', 'error', 'failed', 'rejected', 'cancel'].some((k) => s.includes(k))) return 'ops-badge-red'
  if (['pending', 'draft', 'review', 'warn', 'stale', 'drift', 'request'].some((k) => s.includes(k))) return 'ops-badge-yellow'
  if (['syncing', 'processing', 'claimed', 'executing'].some((k) => s.includes(k))) return 'ops-badge-blue'
  return 'ops-badge-gray'
}
