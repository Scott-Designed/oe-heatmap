import { useMemo } from 'react'
import type { DataPoint } from '../types'

interface Props { data: DataPoint[] }

export default function StatsBar({ data }: Props) {
  const stats = useMemo(() => {
    if (!data.length) return null
    const vals = data.map(d => d.value)
    const avg  = vals.reduce((a, b) => a + b, 0) / vals.length
    const peak = Math.max(...vals)
    const pp   = data[vals.indexOf(peak)]

    const noon  = data.filter(d => d.interval >= 24 && d.interval <= 26).map(d => d.value)
    const night = data.filter(d => d.interval <= 9).map(d => d.value)
    const noonAvg  = noon.length  ? noon.reduce((a,b) => a+b, 0) / noon.length : 0
    const nightAvg = night.length ? night.reduce((a,b) => a+b, 0) / night.length : 0

    const pd = new Date(2025, 0, pp.day + 1)
    const ph = String(Math.floor(pp.interval / 2)).padStart(2, '0')
    const pm = pp.interval % 2 === 0 ? '00' : '30'
    const peakTime = pd.getDate() + ' ' + pd.toLocaleString('en-AU', { month: 'short' }) + ', ' + ph + ':' + pm

    return { avg, peak, peakTime, noonAvg, nightAvg }
  }, [data])

  const cards = stats ? [
    { label: 'Annual Average', value: stats.avg.toFixed(1) + '%',      sub: 'renewables share' },
    { label: 'Peak Renewables', value: stats.peak.toFixed(1) + '%',     sub: stats.peakTime },
    { label: 'Solar Noon Avg',  value: stats.noonAvg.toFixed(1) + '%',  sub: '12:00–13:00 average' },
    { label: 'Overnight Avg',   value: stats.nightAvg.toFixed(1) + '%', sub: 'midnight–5am average' },
  ] : Array(4).fill({ label: '—', value: '—', sub: '' })

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      gap: 16, marginBottom: 24,
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          background: '#111418', border: '1px solid #1e2328',
          borderRadius: 10, padding: '20px 24px',
        }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.12em',
                        color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>
            {c.label}
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em',
                        color: '#4ade80', lineHeight: 1, marginBottom: 4 }}>
            {c.value}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#374151' }}>
            {c.sub}
          </div>
        </div>
      ))}
    </div>
  )
}
