import type { DataPoint, Region } from '../types'

const RENEWABLE = new Set([
  'solar_rooftop', 'solar_utility', 'solar', 'wind',
  'hydro', 'pumps', 'battery_discharging',
  'bioenergy_biogas', 'bioenergy_biomass',
])

const YEAR_START = new Date('2025-01-01T00:00:00').getTime()

export async function fetchMonth(month: number): Promise<unknown> {
  const pad = (n: number) => String(n).padStart(2, '0')
  const days = new Date(2025, month, 0).getDate()
  const params = new URLSearchParams()
  params.append('metrics', 'energy')
  params.set('interval', '5m')
  params.set('date_start', `2025-${pad(month)}-01T00:00:00`)
  params.set('date_end', `2025-${pad(month)}-${pad(days)}T23:30:00`)
  params.set('primary_grouping', 'network_region')
  params.append('secondary_grouping', 'fueltech_group')

  const r = await fetch(`/api/data/network/NEM?${params}`)
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`)
  return r.json()
}

export function parseMonth(json: unknown, region: Region): DataPoint[] {
  // Response shape: { data: [{ metric, results: [{ columns: {network_region, fueltech_group}, data: [[ts, val],...] }] }] }
  const raw = json as Record<string, unknown>
  const series = (
    Array.isArray(raw) ? raw :
    Array.isArray(raw.data) ? raw.data :
    (raw.data as Record<string, unknown>)?.data ?? []
  ) as Array<{ results?: Array<{ columns?: Record<string, string>; data?: [string, number][] }> }>

  if (!series.length) return []

  // Accumulate into buckets keyed by timestamp
  const buckets = new Map<string, { r: number; t: number }>()

  for (const s of series) {
    for (const result of s.results ?? []) {
      const cols = result.columns ?? {}
      const ft = (cols.fueltech_group ?? '').toLowerCase()
      const rgn = cols.network_region ?? 'NEM'

      if (region !== 'NEM' && rgn !== region) continue

      const isRenew = RENEWABLE.has(ft)

      for (const [ts, val] of result.data ?? []) {
        if (typeof val !== 'number' || val < 0) continue
        if (!buckets.has(ts)) buckets.set(ts, { r: 0, t: 0 })
        const b = buckets.get(ts)!
        b.t += val
        if (isRenew) b.r += val
      }
    }
  }

  const points: DataPoint[] = []

  for (const [ts, { r, t }] of buckets) {
    if (t === 0) continue
    const dt = new Date(ts)
    if (isNaN(dt.getTime())) continue
    const day = Math.floor((dt.getTime() - YEAR_START) / 86_400_000)
    if (day < 0 || day >= 365) continue
    const interval = Math.floor((dt.getHours() * 60 + dt.getMinutes()) / 30)
    points.push({ day, interval, value: Math.round((r / t) * 1000) / 10 })
  }

  return points
}
