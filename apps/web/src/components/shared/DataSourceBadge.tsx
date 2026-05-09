type DataSourceMode = 'live' | 'demo' | 'unavailable'

const sourceLabelByMode: Record<DataSourceMode, string> = {
  live: 'Live data',
  demo: 'Demo data',
  unavailable: 'Unavailable',
}

export function DataSourceBadge({
  mode,
  detail,
}: {
  mode: DataSourceMode
  detail?: string
}) {
  return (
    <div className={`data-source-badge ${mode}`}>
      <strong>{sourceLabelByMode[mode]}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  )
}
