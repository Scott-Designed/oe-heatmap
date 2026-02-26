import type { MonthStatus } from '../types'

const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D']

interface Props {
  statuses: MonthStatus[]
  isSimulated: boolean
  isLoading: boolean
  onLoadReal: () => void
}

export default function StatusBar({ statuses, isSimulated, isLoading, onLoadReal }: Props) {
  const done  = statuses.filter(s => s.state === 'done').length
  const pct   = Math.round((done / 12) * 100)
  const allDone = done === 12

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: '#0f1f17', border: '1px solid #166534',
      borderRadius: 8, padding: '12px 16px', marginBottom: 28,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#86efac',
    }}>
      {/* Pulse dot */}
      <div style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: isLoading ? '#4ade80' : allDone ? '#4ade80' : '#6b7280',
        animation: isLoading ? 'pulse 1.5s infinite' : 'none',
      }} />

      {isSimulated ? (
        <span style={{ color: '#d4d460' }}>
          <span style={{ background:'#2a2a0f', border:'1px solid #3d3d1a', borderRadius: 3,
                         padding:'1px 6px', fontSize:10, marginRight: 8 }}>SIMULATED</span>
          Modelled NEM data
        </span>
      ) : (
        <span>
          {isLoading
            ? `Loading ${pct}%…`
            : `✓ Real NEM data · ${statuses.reduce((a,s)=>a+(s.state==='done'?1:0),0)*730} intervals`}
        </span>
      )}

      {/* Month dots */}
      <div style={{ display:'flex', gap: 4, marginLeft: 4 }}>
        {statuses.map((s, i) => (
          <div key={i} title={['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]} style={{
            width: 18, height: 18, borderRadius: 3, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize: 9, fontWeight: 600,
            background: s.state === 'done'    ? '#166534'
                       : s.state === 'loading' ? '#14532d'
                       : s.state === 'error'   ? '#7f1d1d'
                       : '#1e2328',
            color: s.state === 'done' ? '#4ade80' : s.state === 'error' ? '#f87171' : '#374151',
            animation: s.state === 'loading' ? 'pulse 1s infinite' : 'none',
          }}>
            {MONTHS[i]}
          </div>
        ))}
      </div>

      {/* Load real data button */}
      {isSimulated && (
        <button
          onClick={onLoadReal}
          disabled={isLoading}
          style={{
            marginLeft: 'auto', background: '#166534', border: '1px solid #22c55e',
            borderRadius: 4, padding: '4px 12px', color: '#4ade80',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          Load Real Data →
        </button>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  )
}
