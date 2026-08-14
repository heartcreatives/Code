import { store } from './store'
import { addDays, manilaToday } from './time'
import { bookingAmount, openPlayAmount } from './pricing'
import { DEFAULT_SETTINGS } from './pricing'
import type { NewEntry, PayMethod, ExpenseCategory } from './types'

/**
 * Sample rows so the dashboard has something to show on a fresh install.
 * Every seeded row is tagged, so "Clear sample data" removes exactly these and
 * never touches a real entry. Hidden unless VITE_ENABLE_SEED=true.
 */
export const SEED_TAG = 'Sample'
export const seedEnabled = import.meta.env.VITE_ENABLE_SEED === 'true'

export const isSeedRow = (note: string | null) => Boolean(note?.startsWith(`${SEED_TAG} ·`))

const tag = (text: string) => `${SEED_TAG} · ${text}`

// A tiny deterministic PRNG, so the demo looks the same each time it is loaded.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function sampleEntries(today: string = manilaToday()): NewEntry[] {
  const rand = rng(20250814)
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)]
  const methods: PayMethod[] = ['cash', 'cash', 'gcash', 'gcash', 'maya']
  const courts = ['Court 1', 'Court 2']
  const names = ['Ate Belen', 'Coach Rey', 'JM group', 'Doc Ann', 'Walk-in']
  const out: NewEntry[] = []

  for (let back = 20; back >= 0; back--) {
    const day = addDays(today, -back)
    const bookings = 2 + Math.floor(rand() * 3)

    for (let i = 0; i < bookings; i++) {
      const peak = rand() > 0.45
      const hour = peak ? 17 + Math.floor(rand() * 6) : 6 + Math.floor(rand() * 10)
      const hours = rand() > 0.7 ? 2 : 1
      const rateType = peak ? ('peak' as const) : ('non_peak' as const)
      out.push({
        kind: 'booking',
        occurred_on: day,
        occurred_at: `${String(hour).padStart(2, '0')}:00`,
        rate_type: rateType,
        hours,
        players: null,
        fee_per_player: null,
        amount: bookingAmount(hours, rateType, DEFAULT_SETTINGS),
        method: pick(methods),
        category: null,
        note: tag(`${pick(courts)} · ${pick(names)}`),
      })
    }

    if (rand() > 0.4) {
      const players = 4 + Math.floor(rand() * 9)
      const fee = pick([100, 120, 150, 150, 200])
      out.push({
        kind: 'open_play',
        occurred_on: day,
        occurred_at: '19:00',
        rate_type: null,
        hours: null,
        players,
        fee_per_player: fee,
        amount: openPlayAmount(players, fee),
        method: pick(methods),
        category: null,
        note: tag('Evening open play'),
      })
    }

    if (rand() > 0.72) {
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
        kind: 'expense',
        occurred_on: day,
        occurred_at: null,
        rate_type: null,
        hours: null,
        players: null,
        fee_per_player: null,
        amount: expense[2],
        method: pick(['cash', 'gcash'] as PayMethod[]),
        category: expense[0],
        note: tag(expense[1]),
      })
    }
  }
  return out
}

export async function loadSampleData(userId: string | null) {
  for (const entry of sampleEntries()) {
    await store.insert(entry, userId)
  }
}

export async function clearSampleData() {
  const all = await store.list()
  for (const row of all) {
    if (isSeedRow(row.note)) await store.remove(row.id)
  }
}
