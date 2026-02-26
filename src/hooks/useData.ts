import { useState, useCallback, useRef } from 'react'
import type { DataPoint, Region, MonthStatus } from '../types'
import { fetchMonth, parseMonth } from '../utils/api'
import { generateSimulatedData } from '../utils/dataGen'

interface UseDataResult {
  data: DataPoint[]
  monthStatuses: MonthStatus[]
  isLoading: boolean
  isSimulated: boolean
  loadReal: (region: Region) => Promise<void>
  loadSimulated: (region: Region) => void
}

// Cache raw API responses so region switching doesn't re-fetch
const rawCache: Record<number, unknown> = {}
const parsedCache: Record<string, DataPoint[]> = {}

export function useData(): UseDataResult {
  const [data, setData] = useState<DataPoint[]>([])
  const [monthStatuses, setMonthStatuses] = useState<MonthStatus[]>(
    Array.from({ length: 12 }, (_, i) => ({ month: i + 1, state: 'pending' }))
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isSimulated, setIsSimulated] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const loadSimulated = useCallback((region: Region) => {
    const key = `sim-${region}`
    if (!parsedCache[key]) parsedCache[key] = generateSimulatedData(region)
    setData(parsedCache[key])
    setIsSimulated(true)
    setMonthStatuses(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, state: 'done' })))
  }, [])

  const loadReal = useCallback(async (region: Region) => {
    // Cancel any in-flight load
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setIsLoading(true)
    setIsSimulated(false)
    setMonthStatuses(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, state: 'pending' })))

    const allPoints: DataPoint[] = []

    try {
      for (let m = 1; m <= 12; m++) {
        setMonthStatuses(prev => prev.map(s => s.month === m ? { ...s, state: 'loading' } : s))

        if (!rawCache[m]) rawCache[m] = await fetchMonth(m)

        const pts = parseMonth(rawCache[m], region)
        allPoints.push(...pts)

        setMonthStatuses(prev => prev.map(s => s.month === m ? { ...s, state: 'done' } : s))

        if (m < 12) await new Promise(r => setTimeout(r, 80))
      }

      setData(allPoints)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      console.error('Load failed:', err)
      setMonthStatuses(prev => prev.map(s => s.state === 'loading' ? { ...s, state: 'error' } : s))
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { data, monthStatuses, isLoading, isSimulated, loadReal, loadSimulated }
}
