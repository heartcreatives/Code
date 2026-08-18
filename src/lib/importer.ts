import type {
  Channel,
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
  amount: ['amount', 'total', 'payment', 'collect'],
  channel: ['channel', 'mode', 'method', 'gcash', 'account'],
  payment_status: ['payment status', 'paid'],
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

  let qty = parseNumber(get('qty'))
  if (qty === null && resolvedKind === 'court_booking') qty = hoursBetween(start_time, end_time)

  const rate_type =
    resolvedKind === 'court_booking' ? suggestRateType(start_time, settings) : null
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

  const category = resolvedKind === 'expense' ? parseCategory(get('category')) : null

  const entry: NewEntry = {
    kind: resolvedKind,
    occurred_on: occurred_on ?? '',
    start_time,
    end_time,
    rate_type,
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
    release_status: fromNote.release ?? 'not_released',
    released_to: get('released_to') || fromNote.releasedTo || null,
    released_on: null,
    customer: get('customer') || null,
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
  if (/akiss|gcash ?1/.test(t)) return { value: 'gcash_akiss' }
  if (/heart|gcash ?2/.test(t)) return { value: 'gcash_heart' }
  if (/maya|paymaya/.test(t)) return { value: 'maya' }
  if (/gcash|g-cash/.test(t)) {
    // Two GCash accounts — which one is a question only a person can answer.
    return { value: null, reason: 'Says "GCash" but not which account (Akiss or Heart)' }
  }
  if (/cash|walk/.test(t)) return { value: 'cash' }
  return { value: null }
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
