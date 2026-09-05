import { store } from './store'
import { addDays, manilaToday } from './time'
import { DEFAULT_SETTINGS, computeAmount } from './pricing'
import type { Channel, EntryKind, ExpenseCategory, NewEntry, ReleaseStatus } from './types'

/**
 * Sample rows so the dashboard has something to show on a fresh install.
 * Every seeded row is tagged, so "Clear sample data" removes exactly these and
 * never touches a real entry. Hidden unless VITE_ENABLE_SEED=true.
 */
export const SEED_TAG = 'Sample'
export const seedEnabled = import.meta.env.VITE_ENABLE_SEED === 'true'

export const isSeedRow = (note: string | null) => Boolean(note?.startsWith(`${SEED_TAG} ·`))

const tag = (text: string) => `${SEED_TAG} · ${text}`

// A tiny deterministic PRNG, so the demo looks the same each time.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const blank = {
  start_time: null,
  end_time: null,
  rate_type: null,
  court: null,
  qty: null,
  unit_price: null,
  amount_overridden: false,
  amount_paid: null,
  released_to: null,
  released_on: null,
  customer: null,
  is_floating: false,
  collected_by: null,
  category: null,
} as const

export function sampleEntries(today: string = manilaToday()): NewEntry[] {
  const rand = rng(20260814)
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)]
  const channels: Channel[] = ['cash', 'cash', 'gcash_akiss', 'gcash_heart', 'maya']
  const names = ['Frelyn', 'Bidik', 'Sonrise MPC', 'Coach Rey', 'walk-in', 'Ate Belen']
  const releases: ReleaseStatus[] = [
    'released',
    'released',
    'not_released',
    'released_via_cash',
    'to_confirm',
  ]
  const out: NewEntry[] = []

  for (let back = 20; back >= 0; back--) {
    const day = addDays(today, -back)

    for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) {
      const peak = rand() > 0.45
      const hour = peak ? 17 + Math.floor(rand() * 5) : 6 + Math.floor(rand() * 9)
      const hours = rand() > 0.75 ? 2 : 1
      const rateType = peak ? ('peak' as const) : ('non_peak' as const)
      const unit = peak ? DEFAULT_SETTINGS.peak_rate : DEFAULT_SETTINGS.non_peak_rate
      out.push({
        ...blank,
        kind: 'court_booking',
        occurred_on: day,
        start_time: `${String(hour).padStart(2, '0')}:00`,
        end_time: `${String((hour + hours) % 24).padStart(2, '0')}:00`,
        rate_type: rateType,
        court: rand() > 0.7 ? 2 : 1,
        qty: hours,
        unit_price: unit,
        amount: computeAmount(hours, unit) ?? 0,
        channel: pick(channels),
        payment_status: 'paid',
        release_status: pick(releases),
        released_to: rand() > 0.5 ? 'Boboy' : null,
        customer: pick(names),
        note: tag('Court booking'),
      })
    }

    if (rand() > 0.45) {
      const players = 2 + Math.floor(rand() * 10)
      const fee = DEFAULT_SETTINGS.open_play_fee ?? 200
      out.push({
        ...blank,
        kind: 'open_play',
        occurred_on: day,
        start_time: '19:00',
        qty: players,
        unit_price: fee,
        amount: computeAmount(players, fee) ?? 0,
        channel: pick(channels),
        payment_status: 'paid',
        release_status: pick(releases),
        released_to: 'Boboy',
        customer: 'Open play',
        note: tag('Evening open play'),
      })
    }

    if (rand() > 0.6) {
      const paddles = 1 + Math.floor(rand() * 4)
      out.push({
        ...blank,
        kind: 'paddle_rent',
        occurred_on: day,
        qty: paddles,
        unit_price: DEFAULT_SETTINGS.paddle_rent_price,
        amount: computeAmount(paddles, DEFAULT_SETTINGS.paddle_rent_price) ?? 0,
        channel: pick(channels),
        payment_status: 'paid',
        release_status: rand() > 0.5 ? 'not_released' : 'released',
        released_to: 'Cyril',
        customer: pick(names),
        note: tag('Paddle rent'),
      })
    }

    if (rand() > 0.85) {
      const hours = 1 + Math.floor(rand() * 2)
      out.push({
        ...blank,
        kind: 'machine_rent',
        occurred_on: day,
        qty: hours,
        unit_price: 300,
        amount: 300 * hours,
        channel: pick(channels),
        payment_status: 'paid',
        release_status: 'not_released',
        released_to: 'Cyril',
        customer: pick(names),
        note: tag('Ball machine'),
      })
    }

    if (rand() > 0.75) {
      const expense = pick<[ExpenseCategory, string, number]>([
        ['supplies', 'Shuttlecocks & balls', 850],
        ['maintenance', 'Court net repair', 1200],
        ['utilities', 'Lights electricity share', 2400],
        ['equipment', 'Replacement paddles', 3200],
        ['staff', 'Weekend court marshal', 900],
        ['marketing', 'Tarpaulin for open play', 650],
        ['other', 'Drinking water refill', 300],
      ])
      out.push({
        ...blank,
        kind: 'expense' as EntryKind,
        occurred_on: day,
        amount: expense[2],
        channel: pick(['cash', 'gcash_akiss'] as Channel[]),
        payment_status: 'paid',
        release_status: 'released',
        category: expense[0],
        note: tag(expense[1]),
      })
    }
  }

  // The two real open items the court is carrying, so the Owed screen has
  // something true-to-life on it.
  out.push({
    ...blank,
    kind: 'court_booking',
    occurred_on: addDays(today, -9),
    start_time: '17:00',
    end_time: '23:00',
    rate_type: 'peak',
    qty: 6,
    unit_price: 250,
    amount: 1500,
    channel: 'cash',
    payment_status: 'unpaid',
    release_status: 'not_released',
    customer: 'Bidik',
    note: tag('Open Play c/o Bidik — unpaid'),
  })
  out.push({
    ...blank,
    kind: 'court_booking',
    occurred_on: addDays(today, -4),
    start_time: '09:00',
    end_time: '11:00',
    rate_type: 'non_peak',
    qty: 2,
    unit_price: 200,
    amount: 400,
    amount_paid: 100,
    channel: 'cash',
    payment_status: 'partial',
    release_status: 'not_released',
    customer: 'Frelyn',
    note: tag('Partial payment'),
  })
  return out
}

export async function loadSampleData(userId: string | null) {
  await store.insertMany(sampleEntries(), userId)
}

export async function clearSampleData() {
  const all = await store.list()
  for (const row of all) {
    if (isSeedRow(row.note)) await store.remove(row.id)
  }
}
