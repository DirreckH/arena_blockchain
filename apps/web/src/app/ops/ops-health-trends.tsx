import type { SampleShortageMonitoringItemViewModel } from '../../features/arena/internal-ops.types'
import { opsCopy } from '../../features/arena/ops-copy'

export type OpsHealthTrendSnapshot = {
  recordedAt: string
  totalWaiting: number
  totalAlerts: number
  peakAnomalyRate: number
  sampleCompletion: number
}

type OpsHealthTrendTone = 'queue' | 'alert' | 'anomaly' | 'sample'

const OPS_HEALTH_TREND_STORAGE_KEY = 'arena.ops.healthTrendHistory'
const MAX_OPS_HEALTH_TREND_POINTS = 12

export function OpsHealthTrendsPanel({
  waitingTrendPoints,
  alertTrendPoints,
  anomalyTrendPoints,
  sampleProgressTrendPoints,
}: {
  waitingTrendPoints: number[]
  alertTrendPoints: number[]
  anomalyTrendPoints: number[]
  sampleProgressTrendPoints: number[]
}) {
  return (
    <section className="detail-panel">
      <div className="ops-section">
        <div className="ops-section-head">
          <p className="ops-section-title">{opsCopy.trends.title}</p>
          <span className="ops-muted">{opsCopy.trends.hint}</span>
        </div>
        <div className="ops-trend-grid">
          <OpsTrendCard
            detail={opsCopy.trends.pollPoints(waitingTrendPoints.length)}
            hint={opsCopy.trends.waiting.hint}
            title={opsCopy.trends.waiting.title}
            value={opsCopy.trends.waiting.value(formatHealthCount(waitingTrendPoints.at(-1) ?? 0))}
            points={waitingTrendPoints}
            valueTone="queue"
          />
          <OpsTrendCard
            detail={opsCopy.trends.pollPoints(alertTrendPoints.length)}
            hint={opsCopy.trends.alert.hint}
            title={opsCopy.trends.alert.title}
            value={opsCopy.trends.alert.value(formatHealthCount(alertTrendPoints.at(-1) ?? 0))}
            points={alertTrendPoints}
            valueTone="alert"
          />
          <OpsTrendCard
            detail={opsCopy.trends.pollPoints(anomalyTrendPoints.length)}
            hint={opsCopy.trends.anomaly.hint}
            title={opsCopy.trends.anomaly.title}
            value={opsCopy.trends.anomaly.value(formatHealthPercent(anomalyTrendPoints.at(-1) ?? 0))}
            points={anomalyTrendPoints}
            formatter={formatHealthPercent}
            valueTone="anomaly"
          />
          <OpsTrendCard
            detail={opsCopy.trends.pollPoints(sampleProgressTrendPoints.length)}
            hint={opsCopy.trends.sample.hint}
            title={opsCopy.trends.sample.title}
            value={opsCopy.trends.sample.value(formatHealthPercent(sampleProgressTrendPoints.at(-1) ?? 1))}
            points={sampleProgressTrendPoints}
            formatter={formatHealthPercent}
            valueTone="sample"
          />
        </div>
      </div>
    </section>
  )
}

export function readPersistedHealthTrendHistory(): OpsHealthTrendSnapshot[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(OPS_HEALTH_TREND_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is OpsHealthTrendSnapshot => (
      !!item
      && typeof item === 'object'
      && typeof (item as { recordedAt?: unknown }).recordedAt === 'string'
      && typeof (item as { totalWaiting?: unknown }).totalWaiting === 'number'
      && typeof (item as { totalAlerts?: unknown }).totalAlerts === 'number'
      && typeof (item as { peakAnomalyRate?: unknown }).peakAnomalyRate === 'number'
      && typeof (item as { sampleCompletion?: unknown }).sampleCompletion === 'number'
    ))
  } catch {
    return []
  }
}

export function persistHealthTrendHistory(state: OpsHealthTrendSnapshot[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(OPS_HEALTH_TREND_STORAGE_KEY, JSON.stringify(state))
}

export function buildHealthTrendSnapshot(input: {
  queueTimestamp: string | null
  queueWaiting: number | null
  healthTimestamp: string | null
  alertCount: number | null
  runtimeTimestamp: string | null
  runtimeAlertCount: number | null
  peakAnomalyRate: number | null
  sampleCompletion: number | null
}): OpsHealthTrendSnapshot | null {
  const recordedAt = [input.queueTimestamp, input.healthTimestamp, input.runtimeTimestamp]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((left, right) => right.localeCompare(left))[0] ?? null

  if (!recordedAt) {
    return null
  }

  return {
    recordedAt,
    totalWaiting: input.queueWaiting ?? 0,
    totalAlerts: (input.alertCount ?? 0) + (input.runtimeAlertCount ?? 0),
    peakAnomalyRate: input.peakAnomalyRate ?? 0,
    sampleCompletion: input.sampleCompletion ?? 1,
  }
}

export function appendTrendSnapshot(
  current: OpsHealthTrendSnapshot[],
  next: OpsHealthTrendSnapshot,
): OpsHealthTrendSnapshot[] {
  const last = current.at(-1)
  if (
    last
    && last.recordedAt === next.recordedAt
    && last.totalWaiting === next.totalWaiting
    && last.totalAlerts === next.totalAlerts
    && last.peakAnomalyRate === next.peakAnomalyRate
    && last.sampleCompletion === next.sampleCompletion
  ) {
    return current
  }

  const deduped = current.filter((item) => item.recordedAt !== next.recordedAt)
  return [...deduped, next].slice(-MAX_OPS_HEALTH_TREND_POINTS)
}

export function computeSampleCompletion(items: SampleShortageMonitoringItemViewModel[]): number {
  if (items.length === 0) {
    return 1
  }

  const totals = items.reduce((sum, item) => ({
    effective: sum.effective + item.effectiveSampleCount,
    minimum: sum.minimum + item.minEffectiveSample,
  }), { effective: 0, minimum: 0 })

  if (totals.minimum <= 0) {
    return 1
  }

  return Math.max(0, Math.min(1, totals.effective / totals.minimum))
}

export function formatHealthCount(value: number): string {
  return `${value}`
}

export function formatHealthPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function OpsTrendCard({
  title,
  value,
  hint,
  detail,
  points,
  formatter = formatHealthCount,
  valueTone,
}: {
  title: string
  value: string
  hint: string
  detail: string
  points: number[]
  formatter?: (value: number) => string
  valueTone: OpsHealthTrendTone
}) {
  const safePoints = points.length > 0 ? points : [0]
  const latest = safePoints.at(-1) ?? 0
  const previous = safePoints.length > 1 ? safePoints.at(-2) ?? latest : latest
  const delta = latest - previous
  const deltaLabel = delta === 0
    ? opsCopy.trends.steady
    : opsCopy.trends.deltaVsPrevious(`${delta > 0 ? '+' : ''}${formatter(delta)}`)

  return (
    <div className="ops-trend-card">
      <div className="ops-trend-head">
        <strong>{title}</strong>
        <span className={`ops-badge ${trendToneBadgeClass(valueTone)}`}>{detail}</span>
      </div>
      <div className="ops-trend-value-row">
        <span className="ops-trend-value">{value}</span>
        <span className="ops-muted">{deltaLabel}</span>
      </div>
      <svg
        aria-label={opsCopy.trends.sparklineAria(title)}
        className={`ops-trend-sparkline ops-trend-sparkline-${valueTone}`}
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 40"
      >
        <path d={buildSparklineArea(safePoints, 100, 40)} className="ops-trend-area" />
        <path d={buildSparklinePath(safePoints, 100, 40)} className="ops-trend-line" />
      </svg>
      <p className="ops-muted">{hint}</p>
    </div>
  )
}

function trendToneBadgeClass(value: OpsHealthTrendTone): string {
  switch (value) {
    case 'queue':
      return 'ops-badge-blue'
    case 'alert':
      return 'ops-badge-red'
    case 'anomaly':
      return 'ops-badge-yellow'
    case 'sample':
      return 'ops-badge-green'
    default:
      return 'ops-badge-blue'
  }
}

function buildSparklinePath(values: number[], width: number, height: number): string {
  const points = normalizeSparklinePoints(values, width, height)
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function buildSparklineArea(values: number[], width: number, height: number): string {
  const points = normalizeSparklinePoints(values, width, height)
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) {
    return ''
  }

  return `${path} L ${last.x} ${height} L ${first.x} ${height} Z`
}

function normalizeSparklinePoints(values: number[], width: number, height: number) {
  const safeValues = values.length > 0 ? values : [0]
  const min = Math.min(...safeValues)
  const max = Math.max(...safeValues)
  const range = max - min || 1
  const stepX = safeValues.length === 1 ? 0 : width / (safeValues.length - 1)

  return safeValues.map((value, index) => {
    const normalized = (value - min) / range
    return {
      x: Number((index * stepX).toFixed(2)),
      y: Number((height - normalized * (height - 4) - 2).toFixed(2)),
    }
  })
}
