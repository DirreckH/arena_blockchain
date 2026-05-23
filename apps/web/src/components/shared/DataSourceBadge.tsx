type DataSourceMode = 'live' | 'demo' | 'unavailable'

const sourceLabelByMode: Record<DataSourceMode, string> = {
  live: '真实数据',
  demo: '演示数据',
  unavailable: '不可用',
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
