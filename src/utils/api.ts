import type { DataPoint, Region } from '../types'

const RENEWABLE = new Set([
  'solar_rooftop', 'solar_utility', 'solar', 'wind',
  'hydro', 'pumps', 'battery_discharging',
  'bioenergy_biogas', 'bioenergy_biomass',
])

export async function fetchMonth(month: number): Promise<unknown> {
  const pad = (n: number) => String(n).padStart(2, '0')
  const days = new Date(2025, month, 0).getDate()
  const params = new URLSearchParams()
  params.append('metrics', 'energy')
  params.set('interval', '1h')
  params.set('date_start', `2025-${pad(month)}-01T00:00:00`)
  params.set('date_end', `2025-${pad(month)}-${pad(days)}T23:00:00`)
  params.set('primary_grouping', 'network_region')
  params.append('secondary_grouping', 'fueltech_group')

  const r = await fetch(`/api/data/network/NEM?${params}`)
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`)
  return r.json()
}

export function parseMonth(json: unknown, region: Region): DataPoint[] {
  const raw = json as Record<string, unknown>
  const series = (
    Array.isArray(raw.data) ? raw.data : []
  ) as Array<{ results?: Array<{ columns?: Record<string, string>; data?: [string, number][] }> }>

  if (!series.length) return []

  const buckets = new Map<string, { r: number; t: number }>()

  for (const s of series) {
    for (const result of s.results ?? []) {
      const cols = result.columns ?? {}
      const ft = (cols.fueltech_group ?? '').toLowerCase()
      const rgn = cols.region ?? ''

      if (region !== 'NEM' && rgn !== region) continue

      const isRenew = RENEWABLE.has(ft)

      for (const [ts, val] of result.data ?? []) {
        if (typeof val !== 'number' || val < 0) continue
        const localStr = ts.slice(0, 16) // "2025-MM-DDTHH:mm"
        if (!buckets.has(localStr)) buckets.set(localStr, { r: 0, t: 0 })
        const b = buckets.get(localStr)!
        b.t += val
        if (isRenew) b.r += val
      }
    }
  }

  const points: DataPoint[] = []

  for (const [localStr, { r, t }] of buckets) {
    if (t === 0) continue
    const datePart = localStr.slice(0, 10)
    const hh = parseInt(localStr.slice(11, 13))
    const [year, mon, dayN] = datePart.split('-').map(Number)

    const dayOfYear = Math.floor(
      (Date.UTC(year, mon - 1, dayN) - Date.UTC(2025, 0, 1)) / 86_400_000
    )
    if (dayOfYear < 0 || dayOfYear >= 365) continue

    // 1h interval → map each hour to 2 x 30-min slots
    const interval = hh * 2
    points.push({ day: dayOfYear, interval, value: Math.round((r / t) * 1000) / 10 })
    // Also fill the :30 slot with same value
    points.push({ day: dayOfYear, interval: interval + 1, value: Math.round((r / t) * 1000) / 10 })
  }

  return points
}
