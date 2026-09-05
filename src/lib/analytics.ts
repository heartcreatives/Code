import type { Channel, Destination, Entry, EntryKind, ExpenseCategory } from './types'
import { collected, destinationOf, isCyrilShare, isHeld, isMoneyIn, outstanding } from './types'
import {
  endOfMonth,
  endOfWeek,
  manilaToday,
  monthName,
  previousMonth,
  startOfMonth,
  startOfWeek,
} from './time'

export type Period = 'today' | 'week' | 'month' | 'last_month' | 'all'

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'all', label: 'All time' },
]

export interface Range {
  from: string | null
  to: string | null
  label: string
}

/** All boundaries are Manila business dates, so "today" is the court's today. */
export function rangeFor(period: Period, today: string = manilaToday()): Range {
  switch (period) {
    case 'today':
      return { from: today, to: today, label: 'Today' }
    case 'week':
      return { from: startOfWeek(today), to: endOfWeek(today), label: 'This week' }
    case 'month':
      return { from: startOfMonth(today), to: endOfMonth(today), label: monthName(today) }
    case 'last_month': {
      const prev = previousMonth(today)
      return { from: prev, to: endOfMonth(prev), label: monthName(prev) }
    }
    case 'all':
      return { from: null, to: null, label: 'All time' }
  }
}

export function inRange(dateStr: string, range: Range): boolean {
  if (range.from && dateStr < range.from) return false
  if (range.to && dateStr > range.to) return false
  return true
}

const emptyChannels = (): Record<Channel, number> => ({
  cash: 0,
  gcash_akiss: 0,
  gcash_heart: 0,
  gcash_3: 0,
  gcash_boboy: 0,
  maya: 0,
})

export interface Summary {
  /** Everything charged on money-in entries, paid or not. */
  billed: number
  /** What has actually come in — partials count only what was received. */
  moneyIn: number
  expenses: number
  net: number
  courtHours: number
  entryCount: number
  players: number
  /** Money in by channel. Summed over every matching record, never a fixed list. */
  byChannel: Record<Channel, number>
  expensesByChannel: Record<Channel, number>
  byKind: Record<EntryKind, number>
  byCategory: { category: ExpenseCategory; amount: number }[]
  /** Paddle rent + machine rent — Cyril's share. */
  cyrilPayout: number
}

/**
 * Every figure here is derived by walking the records handed in. There is no
 * path in this file that can reference a record by position, which is what
 * made the spreadsheet's `=SUM(I3,I5,I8)` totals silently wrong.
 */
export function summarise(entries: Entry[]): Summary {
  const s: Summary = {
    billed: 0,
    moneyIn: 0,
    expenses: 0,
    net: 0,
    courtHours: 0,
    entryCount: entries.length,
    players: 0,
    byChannel: emptyChannels(),
    expensesByChannel: emptyChannels(),
    byKind: {
      court_booking: 0,
      open_play: 0,
      paddle_rent: 0,
      machine_rent: 0,
      expense: 0,
    },
    byCategory: [],
    cyrilPayout: 0,
  }
  const categories = new Map<ExpenseCategory, number>()

  for (const e of entries) {
    if (e.kind === 'expense') {
      s.expenses += e.amount
      s.expensesByChannel[e.channel] += e.amount
      s.byKind.expense += e.amount
      if (e.category) categories.set(e.category, (categories.get(e.category) ?? 0) + e.amount)
      continue
    }

    const received = collected(e)
    s.billed += e.amount
    s.moneyIn += received
    s.byChannel[e.channel] += received
    s.byKind[e.kind] += e.amount
    if (isCyrilShare(e.kind)) s.cyrilPayout += e.amount
    if (e.kind === 'court_booking') s.courtHours += e.qty ?? 0
    if (e.kind === 'open_play') s.players += e.qty ?? 0
  }

  s.net = round2(s.moneyIn - s.expenses)
  s.billed = round2(s.billed)
  s.moneyIn = round2(s.moneyIn)
  s.expenses = round2(s.expenses)
  s.courtHours = round2(s.courtHours)
  s.cyrilPayout = round2(s.cyrilPayout)
  s.byCategory = [...categories.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount)
  return s
}

// ---------------------------------------------------------------------------
// Money owed & held
// ---------------------------------------------------------------------------

/** Money held, split the way it actually gets handed over. */
export interface HeldPot {
  entries: Entry[]
  total: number
  byChannel: Record<Channel, number>
}

export interface OwedReport {
  /** Unpaid and partial entries — what customers still owe. */
  receivables: { entry: Entry; balance: number }[]
  receivableTotal: number
  /** Collected but not handed over. */
  held: Entry[]
  heldTotal: number
  heldByChannel: Record<Channel, number>
  heldByPerson: { person: string; amount: number }[]
  /**
   * The headline question: how much is waiting to go to the owner, and through
   * which channel did it arrive. Cyril's paddle and machine rent is a separate
   * pot and is never mixed into it.
   */
  heldFor: Record<Destination, HeldPot>
  /** Paid, but the slot moved — still in the channel, owed as court time. */
  floating: Entry[]
  floatingTotal: number
  cyrilPayout: number
}

/**
 * Receivables are computed over *all* entries, not the selected period — money
 * owed from three weeks ago is still owed today. Held money is period-scoped,
 * since releasing is something you do for a stretch of trading.
 */
export function owedReport(all: Entry[], inPeriod: Entry[]): OwedReport {
  const receivables = all
    .filter((e) => isMoneyIn(e.kind) && e.payment_status !== 'paid')
    .map((e) => ({ entry: e, balance: outstanding(e) }))
    .filter((r) => r.balance > 0)
    .sort((a, b) => (a.entry.occurred_on < b.entry.occurred_on ? 1 : -1))

  const held = all.filter(isHeld)
  const heldByChannel = emptyChannels()
  const people = new Map<string, number>()
  const heldFor: Record<Destination, HeldPot> = {
    owner: { entries: [], total: 0, byChannel: emptyChannels() },
    cyril: { entries: [], total: 0, byChannel: emptyChannels() },
  }

  for (const e of held) {
    const amount = collected(e)
    heldByChannel[e.channel] += amount
    // "To confirm" money is earmarked for someone even before it moves.
    const person = e.released_to?.trim() || 'Not assigned'
    people.set(person, (people.get(person) ?? 0) + amount)

    const pot = heldFor[destinationOf(e.kind)]
    pot.entries.push(e)
    pot.total += amount
    pot.byChannel[e.channel] += amount
  }
  heldFor.owner.total = round2(heldFor.owner.total)
  heldFor.cyril.total = round2(heldFor.cyril.total)

  const floating = all.filter((e) => e.is_floating && isMoneyIn(e.kind))

  return {
    receivables,
    receivableTotal: round2(receivables.reduce((sum, r) => sum + r.balance, 0)),
    held,
    heldTotal: round2(held.reduce((sum, e) => sum + collected(e), 0)),
    heldByChannel,
    heldByPerson: [...people.entries()]
      .map(([person, amount]) => ({ person, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    heldFor,
    floating,
    floatingTotal: round2(floating.reduce((sum, e) => sum + collected(e), 0)),
    cyrilPayout: round2(
      inPeriod.filter((e) => isCyrilShare(e.kind)).reduce((sum, e) => sum + e.amount, 0),
    ),
  }
}

/** Entries grouped by Manila business date, newest day first. */
export function groupByDay<T extends Entry>(
  entries: T[],
): { date: string; rows: T[]; net: number }[] {
  const days = new Map<string, T[]>()
  for (const e of entries) {
    const list = days.get(e.occurred_on)
    if (list) list.push(e)
    else days.set(e.occurred_on, [e])
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, rows]) => ({
      date,
      rows,
      net: round2(
        rows.reduce((sum, e) => sum + (e.kind === 'expense' ? -e.amount : collected(e)), 0),
      ),
    }))
}

const round2 = (n: number) => Math.round(n * 100) / 100
