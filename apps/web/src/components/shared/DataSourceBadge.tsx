type DataSourceMode = 'live' | 'demo' | 'unavailable' | 'mixed'

const sourceLabelByMode: Record<'unavailable' | 'mixed', string> = {
  unavailable: '暂不可用',
  mixed: '混合数据',
}

interface DataSourceBadgeProps {
  mode: DataSourceMode
  // detail kept for backwards compatibility with internal pages but no longer rendered
  detail?: string
}

// Only render when the data source is genuinely degraded (unavailable / mixed).
// In normal live and demo operation the badge stays hidden so the product
// does not carry source-mode metadata in the user's view.
export function DataSourceBadge({ mode }: DataSourceBadgeProps) {
  if (mode !== 'unavailable' && mode !== 'mixed') {
    return null
  }

  return (
    <div className={`data-source-badge ${mode}`}>
      <strong>{sourceLabelByMode[mode]}</strong>
    </div>
  )
}
