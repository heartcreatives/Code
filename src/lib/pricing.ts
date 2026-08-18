import type { EntryKind, RateType, Settings } from './types'
import { hourOf } from './time'

/**
 * Fallback used before the settings row loads. The real numbers live in the
 * `settings` table so the court can change prices without a deploy.
 *
 * The three that start null are the ones the court hasn't fixed: open play is
 * sometimes ₱200 a head and sometimes booked as court hours, and machine rent
 * has no agreed price yet. A null means "ask every time" rather than a wrong
 * number quietly filling itself in.
 */
export const DEFAULT_SETTINGS: Settings = {
  non_peak_rate: 200,
  peak_rate: 250,
  open_play_fee: 200,
  paddle_rent_price: 50,
  machine_rent_price: null,
  peak_start_hour: 17,
  peak_end_hour: 24,
}

/**
 * Non-peak runs 5:00AM–4:00PM, peak 5:00PM–12:00MN. This is only a
 * *suggestion* taken from the start hour: a 4:30–5:30PM booking was charged
 * non-peak, and long blocks crossing the boundary were charged at one rate, so
 * the toggle stays editable and whatever staff choose wins.
 */
export function suggestRateType(time: string | null, s: Settings): RateType {
  const h = hourOf(time)
  if (h === null) return 'non_peak'
  return h >= s.peak_start_hour && h < s.peak_end_hour ? 'peak' : 'non_peak'
}

export function rateFor(rateType: RateType, s: Settings): number {
  return rateType === 'peak' ? s.peak_rate : s.non_peak_rate
}

/** The per-unit price a kind defaults to, or null when there isn't a fixed one. */
export function defaultUnitPrice(
  kind: EntryKind,
  rateType: RateType,
  s: Settings,
): number | null {
  switch (kind) {
    case 'court_booking':
      return rateFor(rateType, s)
    case 'open_play':
      return s.open_play_fee
    case 'paddle_rent':
      return s.paddle_rent_price
    case 'machine_rent':
      return s.machine_rent_price
    case 'expense':
      return null
  }
}

/** What each kind counts, for the field label beside the number. */
export const QTY_LABEL: Record<EntryKind, string> = {
  court_booking: 'Hours',
  open_play: 'Players',
  paddle_rent: 'Paddles',
  machine_rent: 'Hours',
  expense: '',
}

export const UNIT_LABEL: Record<EntryKind, string> = {
  court_booking: 'Per hour',
  open_play: 'Fee each',
  paddle_rent: 'Per paddle',
  machine_rent: 'Per hour',
  expense: '',
}

export const computeAmount = (qty: number | null, unitPrice: number | null): number | null =>
  qty && unitPrice ? round2(qty * unitPrice) : null

export const round2 = (n: number) => Math.round(n * 100) / 100

export const rateLabel: Record<RateType, string> = {
  peak: 'Peak',
  non_peak: 'Non-peak',
}

export const rateWindow: Record<RateType, string> = {
  peak: '5:00PM – 12:00MN',
  non_peak: '5:00AM – 4:00PM',
}
