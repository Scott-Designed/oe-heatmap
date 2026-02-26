export type Region = 'NEM' | 'NSW1' | 'VIC1' | 'QLD1' | 'SA1' | 'TAS1'
export type Metric = 'renewables' | 'carbon'

export interface DataPoint {
  day: number       // 0–364
  interval: number  // 0–47 (30-min slots)
  value: number     // renewables % (0–100)
}

export interface MonthStatus {
  month: number
  state: 'pending' | 'loading' | 'done' | 'error'
}
