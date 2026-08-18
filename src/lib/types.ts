export type EntryKind = 'court_booking' | 'open_play' | 'paddle_rent' | 'machine_rent' | 'expense'
export type RateType = 'peak' | 'non_peak'
export type Channel = 'cash' | 'gcash_akiss' | 'maya' | 'gcash_heart'
export type PaymentStatus = 'paid' | 'partial' | 'unpaid'
export type ReleaseStatus = 'not_released' | 'released' | 'released_via_cash' | 'to_confirm'
export type ExpenseCategory =
  | 'supplies'
  | 'maintenance'
  | 'utilities'
  | 'equipment'
  | 'staff'
  | 'marketing'
  | 'other'

export interface Entry {
  id: string
  kind: EntryKind
  /** Business date in Manila time, as YYYY-MM-DD. Never derived from UTC. */
  occurred_on: string
  /** HH:MM, Manila. Court bookings carry both; hours are computed from them. */
  start_time: string | null
  end_time: string | null
  rate_type: RateType | null
  /** Hours, players, or units — whichever the kind counts. */
  qty: number | null
  /** ₱ per hour / player / unit. */
  unit_price: number | null
  /** Final ₱ charged. Computed from qty × unit_price unless overridden. */
  amount: number
  /** True when staff typed the amount rather than taking the computed one. */
  amount_overridden: boolean
  channel: Channel
  payment_status: PaymentStatus
  /** Only meaningful for `partial` — how much of `amount` has come in. */
  amount_paid: number | null
  release_status: ReleaseStatus
  released_to: string | null
  released_on: string | null
  customer: string | null
  category: ExpenseCategory | null
  note: string | null
  created_by: string | null
  created_at: string
}

export type NewEntry = Omit<Entry, 'id' | 'created_by' | 'created_at'>

export interface Settings {
  non_peak_rate: number
  peak_rate: number
  open_play_fee: number | null
  paddle_rent_price: number | null
  machine_rent_price: number | null
  peak_start_hour: number
  peak_end_hour: number
}

// ---------------------------------------------------------------------------
// Labels. These exact strings appear in the UI and in the CSV export.
// ---------------------------------------------------------------------------

export const KINDS: { value: EntryKind; label: string; short: string }[] = [
  { value: 'court_booking', label: 'Court booking', short: 'Court' },
  { value: 'open_play', label: 'Open play', short: 'Open play' },
  { value: 'paddle_rent', label: 'Paddle rent', short: 'Paddle' },
  { value: 'machine_rent', label: 'Machine rent', short: 'Machine' },
  { value: 'expense', label: 'Expense', short: 'Expense' },
]

export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<
  EntryKind,
  string
>

export const CHANNELS: { value: Channel; label: string; short: string }[] = [
  { value: 'cash', label: 'Cash', short: 'Cash' },
  { value: 'gcash_akiss', label: 'GCash 1 – Akiss', short: 'GCash 1' },
  { value: 'maya', label: 'Maya', short: 'Maya' },
  { value: 'gcash_heart', label: 'GCash 2 – Heart', short: 'GCash 2' },
]

export const CHANNEL_LABEL = Object.fromEntries(CHANNELS.map((c) => [c.value, c.label])) as Record<
  Channel,
  string
>

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'unpaid', label: 'Unpaid' },
]

export const PAYMENT_LABEL = Object.fromEntries(
  PAYMENT_STATUSES.map((p) => [p.value, p.label]),
) as Record<PaymentStatus, string>

export const RELEASE_STATUSES: { value: ReleaseStatus; label: string }[] = [
  { value: 'not_released', label: 'Not released' },
  { value: 'released', label: 'Released' },
  { value: 'released_via_cash', label: 'Released via cash' },
  { value: 'to_confirm', label: 'To confirm' },
]

export const RELEASE_LABEL = Object.fromEntries(
  RELEASE_STATUSES.map((r) => [r.value, r.label]),
) as Record<ReleaseStatus, string>

export const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'supplies', label: 'Supplies' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'staff', label: 'Staff' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
]

export const CATEGORY_LABEL = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
) as Record<ExpenseCategory, string>

/** Who money is usually released to. Free text underneath — this is a shortcut. */
export const RELEASE_RECIPIENTS = ['Boboy', 'Cyril']

export const isMoneyIn = (kind: EntryKind) => kind !== 'expense'

/** Paddle and machine rent are the two lines that make up Cyril's payout. */
export const isCyrilShare = (kind: EntryKind) =>
  kind === 'paddle_rent' || kind === 'machine_rent'

/** Money collected but still in a staff member's hands. */
export const isHeld = (e: Entry) =>
  isMoneyIn(e.kind) && (e.release_status === 'not_released' || e.release_status === 'to_confirm')

/** What a customer still owes on an entry. */
export function outstanding(e: Entry): number {
  if (!isMoneyIn(e.kind) || e.payment_status === 'paid') return 0
  if (e.payment_status === 'unpaid') return e.amount
  return Math.max(0, round2(e.amount - (e.amount_paid ?? 0)))
}

/** What has actually come in on an entry, regardless of what was charged. */
export function collected(e: Entry): number {
  if (e.payment_status === 'paid') return e.amount
  if (e.payment_status === 'unpaid') return 0
  return Math.min(e.amount, e.amount_paid ?? 0)
}

const round2 = (n: number) => Math.round(n * 100) / 100
