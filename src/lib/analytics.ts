import type { Entry, ExpenseCategory, PayMethod } from './types'
import { endOfMonth, manilaToday, monthName, previousMonth, startOfMonth } from './time'

export type Period = 'today' | 'month' | 'last_month' | 'year' | 'all'

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
]

export interface Range {
  from: string | null
  to: string | null
  label: string
}

/** All boundaries are Manila business dates, so `today` is the court's today. */
export function rangeFor(period: Period, today: string = manilaToday()): Range {
  switch (period) {
    case 'today':
      return { from: today, to: today, label: 'Today' }
    case 'month':
      return { from: startOfMonth(today), to: endOfMonth(today), label: monthName(today) }
    case 'last_month': {
      const prev = previousMonth(today)
      return { from: prev, to: endOfMonth(prev), label: monthName(prev) }
    }
    case 'year':
      return {
        from: `${today.slice(0, 4)}-01-01`,
        to: `${today.slice(0, 4)}-12-31`,
        label: today.slice(0, 4),
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

export interface Summary {
  moneyIn: number
  expenses: number
  net: number
  courtHours: number
  entryCount: number
  byMethod: Record<PayMethod, number>
  expensesByMethod: Record<PayMethod, number>
  byType: { bookings: number; openPlay: number }
  byCategory: { category: ExpenseCategory; amount: number }[]
  players: number
}

export function summarise(entries: Entry[]): Summary {
  const s: Summary = {
    moneyIn: 0,
    expenses: 0,
    net: 0,
    courtHours: 0,
    entryCount: entries.length,
    byMethod: { cash: 0, gcash: 0, maya: 0 },
    expensesByMethod: { cash: 0, gcash: 0, maya: 0 },
    byType: { bookings: 0, openPlay: 0 },
    byCategory: [],
    players: 0,
  }
  const categories = new Map<ExpenseCategory, number>()

  for (const e of entries) {
    if (e.kind === 'expense') {
      s.expenses += e.amount
      s.expensesByMethod[e.method] += e.amount
      if (e.category) categories.set(e.category, (categories.get(e.category) ?? 0) + e.amount)
      continue
    }
    s.moneyIn += e.amount
    s.byMethod[e.method] += e.amount
    if (e.kind === 'booking') {
      s.byType.bookings += e.amount
      s.courtHours += e.hours ?? 0
    } else {
      s.byType.openPlay += e.amount
      s.players += e.players ?? 0
    }
  }

  s.net = round2(s.moneyIn - s.expenses)
  s.moneyIn = round2(s.moneyIn)
  s.expenses = round2(s.expenses)
  s.courtHours = round2(s.courtHours)
  s.byCategory = [...categories.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount)
  return s
}

/** Entries grouped by Manila business date, newest day first. */
export function groupByDay<T extends Entry>(entries: T[]): { date: string; rows: T[]; net: number }[] {
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
        rows.reduce((sum, e) => sum + (e.kind === 'expense' ? -e.amount : e.amount), 0),
      ),
    }))
}

const round2 = (n: number) => Math.round(n * 100) / 100
