import type { RateType, Settings } from './types'
import { hourOf } from './time'

/**
 * Fallback used before the settings row loads (and when running with no
 * backend at all). The real numbers live in the `settings` table so the court
 * can change prices without a code change.
 */
export const DEFAULT_SETTINGS: Settings = {
  non_peak_rate: 200,
  peak_rate: 250,
  open_play_fee: null,
  peak_start_hour: 17,
  peak_end_hour: 24,
}

/**
 * Non-peak runs 5:00AM–4:00PM, peak 5:00PM–12:00MN. This is a *suggestion*:
 * the Log screen always shows an editable toggle, which is what covers the
 * 4–5PM edge and any after-midnight session.
 */
export function suggestRateType(time: string | null, s: Settings): RateType {
  const h = hourOf(time)
  if (h === null) return 'non_peak'
  return h >= s.peak_start_hour && h < s.peak_end_hour ? 'peak' : 'non_peak'
}

export function rateFor(rateType: RateType, s: Settings): number {
  return rateType === 'peak' ? s.peak_rate : s.non_peak_rate
}

export function bookingAmount(hours: number, rateType: RateType, s: Settings): number {
  return round2(hours * rateFor(rateType, s))
}

export function openPlayAmount(players: number, feePerPlayer: number): number {
  return round2(players * feePerPlayer)
}

export const round2 = (n: number) => Math.round(n * 100) / 100

export const rateLabel: Record<RateType, string> = {
  peak: 'Peak',
  non_peak: 'Non-peak',
}

export const rateWindow: Record<RateType, string> = {
  peak: '5:00PM – 12:00MN',
  non_peak: '5:00AM – 4:00PM',
}
