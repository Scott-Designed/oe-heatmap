import type { DataPoint, Region } from '../types'

const PROFILES: Record<Region, {
  solar: number; solarSeason: number
  wind: number;  windWinter: number
  hydro: number
}> = {
  NEM:  { solar: 0.26, solarSeason: 0.10, wind: 0.14, windWinter: 0.06, hydro: 0.13 },
  NSW1: { solar: 0.26, solarSeason: 0.09, wind: 0.11, windWinter: 0.05, hydro: 0.10 },
  VIC1: { solar: 0.20, solarSeason: 0.07, wind: 0.24, windWinter: 0.09, hydro: 0.05 },
  QLD1: { solar: 0.36, solarSeason: 0.12, wind: 0.07, windWinter: 0.03, hydro: 0.04 },
  SA1:  { solar: 0.30, solarSeason: 0.10, wind: 0.40, windWinter: 0.12, hydro: 0.01 },
  TAS1: { solar: 0.06, solarSeason: 0.03, wind: 0.16, windWinter: 0.07, hydro: 0.64 },
}

export function generateSimulatedData(region: Region): DataPoint[] {
  const p = PROFILES[region]
  const DAYS = 365, SLOTS = 48

  // Seeded PRNG per region for reproducibility
  let s = region.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 42) >>> 0
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff }
  const randn = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand())

  // AR(1) wind process — correlated across whole year
  const windSeries = new Float32Array(DAYS * SLOTS)
  let w = 0
  for (let i = 0; i < windSeries.length; i++) {
    w = 0.97 * w + 0.06 * randn()
    windSeries[i] = w
  }
  let wMin = Infinity, wMax = -Infinity
  for (const v of windSeries) { if (v < wMin) wMin = v; if (v > wMax) wMax = v }
  const wRange = wMax - wMin
  for (let i = 0; i < windSeries.length; i++) windSeries[i] = (windSeries[i] - wMin) / wRange

  const data: DataPoint[] = []

  for (let day = 0; day < DAYS; day++) {
    // +1 = Australian summer (Jan/Dec), -1 = winter (Jul)
    const seasonPhase = Math.cos(2 * Math.PI * (day - 15) / 365)

    for (let slot = 0; slot < SLOTS; slot++) {
      const hour = slot / 2
      const idx = day * SLOTS + slot

      // Solar: Gaussian around noon, wider/stronger in summer
      const solarWidth = 3.0 + seasonPhase * 0.9
      const solarCurve = Math.exp(-0.5 * ((hour - 12.5) / solarWidth) ** 2)
      const solarAmp = Math.max(0, p.solar + p.solarSeason * seasonPhase)
      const solar = Math.max(0, solarCurve * solarAmp * (0.82 + 0.18 * (1 - rand() * 0.25)))

      // Wind: AR(1) with winter boost
      const windAmp = p.wind + p.windWinter * (-seasonPhase)
      const wind = Math.max(0, windSeries[idx] * windAmp * 1.6 + windAmp * 0.15)

      // Hydro: stable with minor noise
      const hydro = Math.max(0, p.hydro * (0.85 + 0.3 * rand()))

      const value = Math.min(100, Math.max(0, (solar + wind + hydro) * 100))
      data.push({ day, interval: slot, value: Math.round(value * 10) / 10 })
    }
  }

  return data
}
