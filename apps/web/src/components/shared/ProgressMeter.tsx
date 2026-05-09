type ProgressMeterProps = {
  label: string
  detail: string
  value: number
}

const clampProgress = (value: number) => Math.max(0, Math.min(100, value))

export function ProgressMeter({ label, detail, value }: ProgressMeterProps) {
  const normalizedValue = clampProgress(value)

  return (
    <div className="progress-meter">
      <div className="progress-meter-label">
        <span>{label}</span>
        <strong>{detail}</strong>
      </div>
      <div className="progress-meter-track" aria-hidden="true">
        <span style={{ width: `${normalizedValue}%` }} />
      </div>
    </div>
  )
}
