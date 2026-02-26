import { useState, useEffect } from 'react'
import type { Region, Metric } from './types'
import { useData } from './hooks/useData'
import Heatmap from './components/Heatmap'
import StatsBar from './components/StatsBar'
import StatusBar from './components/StatusBar'

const REGIONS: { code: Region; label: string }[] = [
  { code: 'NEM',  label: 'NEM' },
  { code: 'NSW1', label: 'NSW' },
  { code: 'VIC1', label: 'VIC' },
  { code: 'QLD1', label: 'QLD' },
  { code: 'SA1',  label: 'SA'  },
  { code: 'TAS1', label: 'TAS' },
]

export default function App() {
  const [region, setRegion] = useState<Region>('NEM')
  const [metric, setMetric] = useState<Metric>('renewables')
  const { data, monthStatuses, isLoading, isSimulated, loadReal, loadSimulated } = useData()

  // Load simulated data on mount
  useEffect(() => { loadSimulated('NEM') }, [loadSimulated])

  const handleRegion = (r: Region) => {
    setRegion(r)
    if (isSimulated) loadSimulated(r)
    else loadReal(r)
  }

  const handleLoadReal = () => loadReal(region)

  const btnBase: React.CSSProperties = {
    fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
    padding: '6px 14px', border: 'none', borderRadius: 4,
    cursor: 'pointer', transition: 'all 0.15s',
  }
  const btnActive: React.CSSProperties = { ...btnBase, background: '#166534', color: '#4ade80' }
  const btnInactive: React.CSSProperties = { ...btnBase, background: 'transparent', color: '#6b7280' }

  return (
    <div style={{ background: '#0a0c0f', minHeight: '100vh', padding: '40px 48px', color: '#e8eaed' }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, letterSpacing:'.15em',
                      color:'#4ade80', textTransform:'uppercase', marginBottom:12 }}>
          National Electricity Market · Australia
        </div>
        <h1 style={{ fontSize:'clamp(28px,4vw,48px)', fontWeight:800, lineHeight:1.05,
                     letterSpacing:'-.02em', marginBottom:10, fontFamily:'Syne,sans-serif' }}>
          Renewables through <span style={{ color:'#4ade80' }}>2025</span>
        </h1>
        <p style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:'#6b7280',
                    fontWeight:300, maxWidth:640, lineHeight:1.6 }}>
          Each column is one day. Each row is a 30-minute interval. Colour shows renewables share —
          every half-hour of the year. Data via{' '}
          <a href="https://openelectricity.org.au" target="_blank" rel="noreferrer"
             style={{ color:'#4ade80' }}>Open Electricity</a>.
        </p>
      </div>

      {/* Status bar */}
      <StatusBar
        statuses={monthStatuses}
        isSimulated={isSimulated}
        isLoading={isLoading}
        onLoadReal={handleLoadReal}
      />

      {/* Controls */}
      <div style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#6b7280',
                       letterSpacing:'.1em', textTransform:'uppercase' }}>Metric:</span>
        <div style={{ display:'flex', gap:4, background:'#111418', border:'1px solid #1e2328',
                      borderRadius:6, padding:3 }}>
          {(['renewables','carbon'] as Metric[]).map(m => (
            <button key={m} style={metric === m ? btnActive : btnInactive} onClick={() => setMetric(m)}>
              {m === 'renewables' ? 'Renewables %' : 'Est. Carbon Intensity'}
            </button>
          ))}
        </div>

        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#6b7280',
                       letterSpacing:'.1em', textTransform:'uppercase', marginLeft:12 }}>Region:</span>
        <div style={{ display:'flex', gap:4, background:'#111418', border:'1px solid #1e2328',
                      borderRadius:6, padding:3 }}>
          {REGIONS.map(r => (
            <button key={r.code} style={region === r.code ? btnActive : btnInactive}
                    onClick={() => handleRegion(r.code)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <StatsBar data={data} />

      {/* Chart */}
      <div style={{ background:'#111418', border:'1px solid #1e2328', borderRadius:12,
                    padding:32, marginBottom:24 }}>
        {data.length > 0
          ? <Heatmap data={data} metric={metric} />
          : <div style={{ height:500, display:'flex', alignItems:'center', justifyContent:'center',
                          fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:'#6b7280' }}>
              <span>Loading…</span>
            </div>
        }
      </div>

      {/* Footer */}
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#374151',
                    lineHeight:1.7, borderTop:'1px solid #1e2328', paddingTop:20 }}>
        <strong style={{ color:'#6b7280' }}>Data:</strong> Real NEM generation data via{' '}
        <a href="https://openelectricity.org.au" target="_blank" rel="noreferrer"
           style={{ color:'#6b7280' }}>Open Electricity</a> (CC BY-NC 4.0).
        Renewables = solar_rooftop + solar_utility + wind + hydro + pumps.
        Carbon intensity estimated from fossil share. Click "Load Real Data →" to fetch live from the API.
      </div>
    </div>
  )
}
