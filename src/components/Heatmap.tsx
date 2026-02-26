import { useEffect, useRef, useCallback } from 'react'
import type { DataPoint, Metric } from '../types'
import { renewablesColor, carbonColor, valueToCarbon } from '../utils/colors'
import { useSize } from '../hooks/useSize'

interface Props {
  data: DataPoint[]
  metric: Metric
}

const DAYS  = 365
const SLOTS = 48
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const MONTHS       = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TIME_TICKS: Record<number, string> = { 0:'00:00', 12:'06:00', 24:'12:00', 36:'18:00', 46:'23:00' }
const PAD = { top: 8, right: 16, bottom: 44, left: 54 }

export default function Heatmap({ data, metric }: Props) {
  const { ref: containerRef, width, height } = useSize()
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const gridRef    = useRef<Float32Array>(new Float32Array(DAYS * SLOTS).fill(-1))

  useEffect(() => {
    const g = new Float32Array(DAYS * SLOTS).fill(-1)
    for (const { day, interval, value } of data) {
      if (day >= 0 && day < DAYS && interval >= 0 && interval < SLOTS)
        g[day * SLOTS + interval] = value
    }
    gridRef.current = g
  }, [data])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !width || !height) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const plotW = width  - PAD.left - PAD.right
    const plotH = height - PAD.top  - PAD.bottom
    const cellW = plotW / DAYS
    const cellH = plotH / SLOTS
    const grid  = gridRef.current

    canvas.width  = width
    canvas.height = height

    ctx.fillStyle = '#0a0c0f'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(PAD.left, PAD.top, plotW, plotH)

    for (let day = 0; day < DAYS; day++) {
      for (let slot = 0; slot < SLOTS; slot++) {
        const val = grid[day * SLOTS + slot]
        if (val < 0) continue
        ctx.fillStyle = metric === 'renewables'
          ? renewablesColor(val)
          : carbonColor(valueToCarbon(val))
        ctx.fillRect(
          PAD.left + day * cellW,
          PAD.top  + slot * cellH,
          Math.ceil(cellW) + 0.5,
          Math.ceil(cellH) + 0.5,
        )
      }
    }

    ctx.font = "11px 'JetBrains Mono', monospace"
    ctx.textBaseline = 'top'
    MONTH_STARTS.forEach((day, i) => {
      const x = PAD.left + day * cellW
      ctx.fillStyle = '#1e2328'
      ctx.fillRect(x, PAD.top + plotH, 1, 5)
      ctx.fillStyle = '#6b7280'
      ctx.fillText(MONTHS[i], x + 2, PAD.top + plotH + 8)
    })

    ctx.textBaseline = 'middle'
    ctx.textAlign    = 'right'
    Object.entries(TIME_TICKS).forEach(([slotStr, label]) => {
      const slot = Number(slotStr)
      const y = PAD.top + slot * cellH
      ctx.fillStyle = '#1e2328'
      ctx.fillRect(PAD.left - 5, y, 5, 1)
      ctx.fillStyle = '#6b7280'
      ctx.fillText(label, PAD.left - 8, y)
    })
    ctx.textAlign = 'left'

    const LW = Math.min(300, plotW * 0.5)
    const lx = PAD.left + (plotW - LW) / 2
    const ly = height - 18
    const stops = metric === 'renewables'
      ? ['#0d1117','#14532d','#166534','#15803d','#22c55e','#86efac']
      : ['#86efac','#22c55e','#fde047','#f97316','#dc2626','#7f1d1d']
    stops.forEach((color, i) => {
      ctx.fillStyle = color
      ctx.fillRect(lx + i * (LW / stops.length), ly, LW / stops.length + 1, 10)
    })
    ctx.strokeStyle = '#1e2328'
    ctx.lineWidth   = 0.5
    ctx.strokeRect(lx, ly, LW, 10)
    ctx.fillStyle    = '#6b7280'
    ctx.textBaseline = 'bottom'
    ctx.textAlign    = 'left'
    ctx.fillText(metric === 'renewables' ? '0%' : '0 g', lx, ly - 2)
    ctx.textAlign = 'right'
    ctx.fillText(metric === 'renewables' ? '100%' : '800 gCO₂/kWh', lx + LW, ly - 2)

  }, [data, metric, width, height])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const tip    = tooltipRef.current
    if (!canvas || !tip || !width || !height) return

    const rect  = canvas.getBoundingClientRect()
    const plotW = width  - PAD.left - PAD.right
    const plotH = height - PAD.top  - PAD.bottom
    const cellW = plotW / DAYS
    const cellH = plotH / SLOTS
    const x = e.clientX - rect.left - PAD.left
    const y = e.clientY - rect.top  - PAD.top
    const day  = Math.floor(x / cellW)
    const slot = Math.floor(y / cellH)

    if (x < 0 || y < 0 || day < 0 || slot < 0 || day >= DAYS || slot >= SLOTS) {
      tip.style.display = 'none'; return
    }
    const val = gridRef.current[day * SLOTS + slot]
    if (val < 0) { tip.style.display = 'none'; return }

    const date = new Date(2025, 0, day + 1)
    const dStr = date.getDate() + ' ' + date.toLocaleString('en-AU', { month: 'short' })
    const h    = String(Math.floor(slot / 2)).padStart(2, '0')
    const m    = slot % 2 === 0 ? '00' : '30'
    const label = metric === 'renewables'
      ? `${val.toFixed(1)}% renewables`
      : `${valueToCarbon(val)} gCO₂/kWh (est.)`

    tip.innerHTML = `<strong>${dStr} · ${h}:${m}</strong><br/>${label}`
    const tipX = e.clientX - rect.left + 14
    const tipY = e.clientY - rect.top  - 12
    tip.style.left    = (tipX + 170 > width ? tipX - 180 : tipX) + 'px'
    tip.style.top     = Math.max(0, tipY) + 'px'
    tip.style.display = 'block'
  }, [width, height, metric])

  return (
    <div ref={containerRef} style={{ width: '100%', height: 500, position: 'relative' }}>
      {width > 0 && height > 0 && (
        <>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = 'none' }}
          />
          <div ref={tooltipRef} style={{
            display: 'none', position: 'absolute', pointerEvents: 'none',
            background: '#111418', border: '1px solid #1e2328', borderRadius: 6,
            padding: '8px 12px', fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
            color: '#e8eaed', lineHeight: 1.6, whiteSpace: 'nowrap', zIndex: 10,
          }} />
        </>
      )}
    </div>
  )
}
