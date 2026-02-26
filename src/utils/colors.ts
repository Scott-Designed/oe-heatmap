// Interpolate through a stop list → hex color
type Stop = [number, [number, number, number]]

const RENEWABLES_SCALE: Stop[] = [
  [0,    [13,  17,  23]],
  [0.15, [26,  42,  31]],
  [0.30, [20,  83,  45]],
  [0.50, [22,  101, 52]],
  [0.70, [21,  128, 61]],
  [0.85, [34,  197, 94]],
  [1.00, [134, 239, 172]],
]

const CARBON_SCALE: Stop[] = [
  [0,    [134, 239, 172]],
  [0.20, [34,  197, 94]],
  [0.40, [253, 224, 71]],
  [0.60, [249, 115, 22]],
  [0.80, [220, 38,  38]],
  [1.00, [127, 29,  29]],
]

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function interpolate(stops: Stop[], t: number): string {
  t = Math.max(0, Math.min(1, t))
  for (let i = 1; i < stops.length; i++) {
    const [s0, c0] = stops[i - 1]
    const [s1, c1] = stops[i]
    if (t <= s1) {
      const f = (t - s0) / (s1 - s0)
      const r = Math.round(lerp(c0[0], c1[0], f))
      const g = Math.round(lerp(c0[1], c1[1], f))
      const b = Math.round(lerp(c0[2], c1[2], f))
      return `rgb(${r},${g},${b})`
    }
  }
  const last = stops[stops.length - 1][1]
  return `rgb(${last[0]},${last[1]},${last[2]})`
}

export function renewablesColor(pct: number): string {
  return interpolate(RENEWABLES_SCALE, pct / 100)
}

export function carbonColor(ci: number): string {
  return interpolate(CARBON_SCALE, ci / 800)
}

export function valueToCarbon(pct: number): number {
  return Math.round(Math.max(15, (1 - pct / 100) * 750))
}
