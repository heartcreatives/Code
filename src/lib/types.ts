export type EntryKind = 'booking' | 'open_play' | 'expense'
export type RateType = 'peak' | 'non_peak'
export type PayMethod = 'cash' | 'gcash' | 'maya'
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
  /** HH:MM (24h), Manila. Start time for bookings, session time for open play. */
  occurred_at: string | null
  rate_type: RateType | null
  hours: number | null
  players: number | null
  fee_per_player: number | null
  /** Always positive. Money in for booking/open play, cost for expense. */
  amount: number
  method: PayMethod
  category: ExpenseCategory | null
  note: string | null
  created_by: string | null
  created_at: string
}

/** What the Log screen hands to the store. */
export type NewEntry = Omit<Entry, 'id' | 'created_by' | 'created_at'>

export interface Settings {
  non_peak_rate: number
  peak_rate: number
  /** null means "ask every time" — the open play fee varies per session. */
  open_play_fee: number | null
  peak_start_hour: number
  peak_end_hour: number
}

export const METHODS: { value: PayMethod; label: string; sub: string }[] = [
  { value: 'cash', label: 'Cash', sub: 'At the court' },
  { value: 'gcash', label: 'GCash', sub: 'Paayo Café' },
  { value: 'maya', label: 'Maya', sub: 'Online booking' },
]

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash · Paayo Café',
  maya: 'Maya · Online booking',
}

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

export const KIND_LABEL: Record<EntryKind, string> = {
  booking: 'Court booking',
  open_play: 'Open play',
  expense: 'Expense',
}

export const isMoneyIn = (kind: EntryKind) => kind !== 'expense'
