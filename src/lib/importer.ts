import type {
  Channel,
  Court,
  EntryKind,
  ExpenseCategory,
  NewEntry,
  PaymentStatus,
  ReleaseStatus,
  Settings,
} from './types'
import { CATEGORIES } from './types'
import { hoursBetween } from './time'
import { computeAmount, defaultUnitPrice, suggestRateType } from './pricing'

/**
 * One-time import of the court's existing spreadsheet.
 *
 * The rule throughout: map what is unambiguous, and *flag* what isn't rather
 * than guessing. A wrong guess here becomes a wrong number in the books that
 * nobody notices for a month.
 */

export type FieldKey =
  | 'occurred_on'
  | 'kind'
  | 'customer'
  | 'start_time'
  | 'end_time'
  | 'qty'
  | 'unit_price'
  | 'amount'
  | 'rate_type'
  | 'channel'
  | 'payment_status'
  | 'amount_paid'
  | 'release_status'
  | 'released_to'
  | 'category'
  | 'note'

export const IMPORT_FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: 'occurred_on', label: 'Date', required: true },
  { key: 'kind', label: 'Type' },
  { key: 'customer', label: 'Customer' },
  { key: 'start_time', label: 'Start time' },
  { key: 'end_time', label: 'End time' },
  { key: 'qty', label: 'Qty (hours / players)' },
  { key: 'unit_price', label: 'Unit price' },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'rate_type', label: 'Peak / non-peak' },
  { key: 'channel', label: 'Channel', required: true },
  { key: 'payment_status', label: 'Payment status' },
  { key: 'amount_paid', label: 'Amount paid' },
  { key: 'release_status', label: 'Release status' },
  { key: 'released_to', label: 'Released to' },
  { key: 'category', label: 'Expense category' },
  { key: 'note', label: 'Note' },
]

/** Column index per field, or -1 for "not in this file". */
export type Mapping = Record<FieldKey, number>

const HINTS: Record<FieldKey, string[]> = {
  occurred_on: ['date'],
  kind: ['type', 'kind', 'service', 'particular'],
  customer: ['customer', 'name', 'client', 'booked'],
  start_time: ['start', 'time in', 'from'],
  end_time: ['end', 'time out', 'to'],
  qty: ['qty', 'quantity', 'hours', 'hrs', 'players', 'pax'],
  unit_price: ['unit', 'rate', 'price', 'per'],
  amount: ['amount', 'total'],
  rate_type: ['rate', 'peak'],
  // "Paid via" is a channel column, not a payment-status one. It has to be
  // listed here or the looser "paid" hint below claims it and every row lands
  // in cash — which is exactly what happened the first time this ran.
  channel: ['paid via', 'channel', 'mode of payment', 'mode', 'method', 'account', 'gcash'],
  payment_status: ['payment status', 'paid?'],
  amount_paid: ['amount paid', 'partial'],
  release_status: ['release', 'remit', 'status'],
  released_to: ['released to', 'remitted to', 'person'],
  category: ['category', 'expense type'],
  note: ['note', 'remarks', 'comment'],
}

export function guessMapping(headers: string[]): Mapping {
  const lower = headers.map((h) => h.trim().toLowerCase())
  const used = new Set<number>()
  const mapping = {} as Mapping

  for (const { key } of IMPORT_FIELDS) {
    let found = -1
    for (const hint of HINTS[key]) {
      const exact = lower.findIndex((h, i) => !used.has(i) && h === hint)
      if (exact >= 0) {
        found = exact
        break
      }
      const partial = lower.findIndex((h, i) => !used.has(i) && h.includes(hint))
      if (partial >= 0 && found < 0) found = partial
    }
    mapping[key] = found
    if (found >= 0) used.add(found)
  }
  return mapping
}

export interface PreparedRow {
  rowNumber: number
  entry: NewEntry
  /** Anything the import could not decide. Non-empty means "look at this". */
  issues: string[]
  raw: string[]
}

export function prepareRows(
  rows: string[][],
  mapping: Mapping,
  settings: Settings,
): PreparedRow[] {
  return rows.map((raw, i) => prepareRow(raw, mapping, settings, i + 2))
}

function prepareRow(
  raw: string[],
  mapping: Mapping,
  settings: Settings,
  rowNumber: number,
): PreparedRow {
  const issues: string[] = []
  const get = (key: FieldKey) => (mapping[key] >= 0 ? (raw[mapping[key]] ?? '').trim() : '')

  const occurred_on = parseDate(get('occurred_on'))
  if (!occurred_on) issues.push(`Date "${get('occurred_on')}" not understood`)

  const note = get('note')
  const fromNote = readStatusText(`${note} ${get('release_status')} ${get('payment_status')}`)
  if (fromNote.ambiguous) {
    issues.push(`Status text "${fromNote.ambiguous}" doesn't match a known status`)
  }

  const kind = parseKind(`${get('kind')} ${note}`)
  if (!kind) issues.push(`Type "${get('kind')}" not recognised — defaulting to court booking`)

  const channel = parseChannel(get('channel'))
  if (!channel.value) {
    issues.push(
      channel.reason ?? `Channel "${get('channel')}" not recognised — defaulting to cash`,
    )
  }

  const start_time = parseTime(get('start_time'))
  const end_time = parseTime(get('end_time'))
  const resolvedKind = kind ?? 'court_booking'

  // "Court Booking" with no number is Court 1 — Court 2 only opened on
  // 5 Sep 2026, so every earlier unnumbered booking was on Court 1.
  const court = resolvedKind === 'court_booking' ? parseCourt(get('kind')) : null

  // A rebooked slot: the money was taken, the booking moved, and it is held
  // as credit against a future slot. Only an explicit "rebooked" sets this —
  // notes like "floating 50" name a *part* of the row as credit, which cannot
  // be split automatically, so those are raised for review instead.
  const floating = /rebook/i.test(`${get('release_status')} ${note}`)
  if (!floating && /floating/i.test(note)) {
    issues.push(`Note says "${note.trim().slice(0, 40)}" — part of this row looks like credit`)
  }

  let qty = parseNumber(get('qty'))
  if (qty === null && resolvedKind === 'court_booking') qty = hoursBetween(start_time, end_time)

  // Respect the rate the sheet recorded; only fall back to the time-of-day
  // suggestion when the column is absent or unreadable.
  const rate_type =
    resolvedKind === 'court_booking'
      ? (parseRateType(get('rate_type')) ?? suggestRateType(start_time, settings))
      : null
  const unit_price =
    parseNumber(get('unit_price')) ??
    (resolvedKind === 'expense' ? null : defaultUnitPrice(resolvedKind, rate_type ?? 'non_peak', settings))

  const amount = parseNumber(get('amount'))
  const computed = computeAmount(qty, unit_price)
  if (amount === null) issues.push('No amount — this row cannot be imported')

  const amount_paid = parseNumber(get('amount_paid'))
  let payment_status: PaymentStatus = fromNote.payment ?? 'paid'
  if (amount_paid !== null && amount !== null && amount_paid > 0 && amount_paid < amount) {
    payment_status = 'partial'
  }

  // Says it was paid but never says whether it was handed over. Treated as
  // still held, which is the safe direction, but worth a human look.
  const statusText = `${get('release_status')} ${note}`.toLowerCase()
  if (fromNote.payment === 'paid' && !fromNote.release && !/releas/.test(statusText)) {
    issues.push("Says paid but not whether it was released — counted as still held")
  }

  const category = resolvedKind === 'expense' ? parseCategory(get('category')) : null

  // Money paid into Boboy's own GCash has already reached the owner.
  const directToOwner = channel.value === 'gcash_boboy'

  const entry: NewEntry = {
    kind: resolvedKind,
    occurred_on: occurred_on ?? '',
    start_time,
    end_time,
    rate_type,
    court,
    qty,
    unit_price,
    amount: amount ?? 0,
    // If the sheet's amount disagrees with qty × price, the sheet wins and we
    // record that it was a manual figure — that is how discounts were given.
    amount_overridden:
      amount !== null && computed !== null && Math.abs(amount - computed) > 0.5,
    channel: channel.value ?? 'cash',
    payment_status,
    amount_paid: payment_status === 'partial' ? amount_paid : null,
    release_status: directToOwner ? 'released' : (fromNote.release ?? 'not_released'),
    released_to: directToOwner ? 'Boboy' : get('released_to') || fromNote.releasedTo || null,
    released_on: directToOwner ? (occurred_on ?? null) : null,
    customer: get('customer') || null,
    is_floating: floating,
    collected_by: fromNote.collectedBy ?? null,
    category,
    note: note || null,
  }

  return { rowNumber, entry, issues, raw }
}

// ---------------------------------------------------------------------------
// Free-text parsing
// ---------------------------------------------------------------------------

interface StatusRead {
  payment?: PaymentStatus
  release?: ReleaseStatus
  releasedTo?: string
  /** "Paid to Jiji" names the staff member who took the money, not a payout. */
  collectedBy?: string
  /** The phrase that looked like a status but matched no rule. */
  ambiguous?: string
}

/**
 * The old Note column carried the status as prose. These are the exact
 * phrasings from the sheet; anything status-shaped that isn't one of them is
 * reported rather than assumed.
 */
export function readStatusText(text: string): StatusRead {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return {}
  const out: StatusRead = {}

  if (/not paid|unpaid/.test(t)) out.payment = 'unpaid'
  else if (/partial/.test(t)) out.payment = 'partial'
  else if (/\bpaid\b/.test(t)) out.payment = 'paid'

  // Order matters: the qualified phrases have to be tested before plain
  // "released", which is a substring of all of them.
  if (/not released|unreleased/.test(t)) out.release = 'not_released'
  else if (/released.*(thru|through|via) cash|converted to cash/.test(t)) {
    out.release = 'released_via_cash'
  } else if (/released.*to confirm|to confirm/.test(t)) out.release = 'to_confirm'
  else if (/\breleased\b/.test(t)) out.release = 'released'

  const to = /released (?:to|kay) ([a-z][a-z ]{1,20})/.exec(t)
  if (to) out.releasedTo = titleCase(to[1].trim())

  // "Paid to jiji" is the staff member who took the cash, which is a different
  // fact from remitting it to the owner — recording it as a release would
  // wrongly clear the money out of the held pot.
  const paidTo = /paid (?:to|kay) ([a-z][a-z ]{1,20})/.exec(t)
  if (paidTo) {
    out.collectedBy = titleCase(paidTo[1].trim())
    out.payment = out.payment ?? 'paid'
  }

  // Something that talks about release or payment but matched nothing above.
  if (!out.release && !out.payment && /releas|remit|paid|balance|owe/.test(t)) {
    out.ambiguous = text.trim().slice(0, 60)
  }
  return out
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase())

export function parseKind(text: string): EntryKind | null {
  const t = text.toLowerCase()
  if (/machine/.test(t)) return 'machine_rent'
  if (/paddle/.test(t)) return 'paddle_rent'
  if (/open ?play/.test(t)) return 'open_play'
  if (/expense|purchase|bought|supply|supplies/.test(t)) return 'expense'
  if (/court|booking|rent|reserv/.test(t)) return 'court_booking'
  return null
}

export function parseChannel(text: string): { value: Channel | null; reason?: string } {
  const t = text.toLowerCase()
  if (/akiss|gcash ?1|g-cash ?1/.test(t)) return { value: 'gcash_akiss' }
  // Globe is tested before plain "heart": both GCash 2 and GCash 3 are
  // Heart's accounts, so "heart globe" has to reach GCash 3 rather than being
  // claimed by the GCash 2 rule it also matches.
  if (/globe|gcash ?3|g-cash ?3/.test(t)) return { value: 'gcash_3' }
  if (/heart|gcash ?2|g-cash ?2/.test(t)) return { value: 'gcash_heart' }
  if (/boboy|gcash ?4|g-cash ?4/.test(t)) return { value: 'gcash_boboy' }
  if (/maya|paymaya/.test(t)) return { value: 'maya' }
  if (/gcash|g-cash/.test(t)) {
    // Four GCash accounts — which one is a question only a person can answer.
    return { value: null, reason: 'Says "GCash" but not which of the four accounts' }
  }
  // "Cash" has to be tested after the GCash accounts, since it is a substring
  // of every one of them.
  if (/cash|walk/.test(t)) return { value: 'cash' }
  return { value: null }
}

export function parseRateType(text: string): 'peak' | 'non_peak' | null {
  const t = text.toLowerCase().trim()
  if (!t) return null
  if (/non[- ]?peak|off[- ]?peak/.test(t)) return 'non_peak'
  if (/peak/.test(t)) return 'peak'
  return null
}

/** "Court 2 - Booking" → 2. A plain "Court Booking" is Court 1. */
export function parseCourt(text: string): Court {
  return /court ?2/i.test(text) ? 2 : 1
}

export function parseCategory(text: string): ExpenseCategory | null {
  const t = text.toLowerCase().trim()
  if (!t) return 'other'
  const hit = CATEGORIES.find((c) => c.value === t || c.label.toLowerCase() === t)
  return hit?.value ?? 'other'
}

/** ISO first, then the M/D/YYYY that Sheets exports. Ambiguity returns null. */
export function parseDate(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slash = /^(\d{1,2})[/](\d{1,2})[/](\d{2,4})$/.exec(t)
  if (slash) {
    const a = Number(slash[1])
    const b = Number(slash[2])
    let year = Number(slash[3])
    if (year < 100) year += 2000
    // Sheets exports month first. A value over 12 in the first slot can only
    // be a day, so that case is safe to swap.
    const month = a > 12 ? b : a
    const day = a > 12 ? a : b
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${year}-${pad(month)}-${pad(day)}`
  }
  return null
}

/** "5:00 PM", "17:00", "5PM" → "17:00". */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase()
  if (!t) return null
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|nn|mn)?/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const suffix = m[3]
  if (suffix === 'pm' && h < 12) h += 12
  if (suffix === 'am' && h === 12) h = 0
  if (suffix === 'mn') h = 0
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const pad = (n: number) => String(n).padStart(2, '0')
