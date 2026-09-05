import type { Entry } from './types'
import {
  CATEGORY_LABEL,
  CHANNEL_LABEL,
  KIND_LABEL,
  PAYMENT_LABEL,
  RELEASE_LABEL,
  outstanding,
} from './types'
import { manilaToday, weekday } from './time'

/** Column order mirrors the spreadsheet the court is coming from. */
const HEADERS = [
  'Date',
  'Day',
  'Type',
  'Court',
  'Customer',
  'Start',
  'End',
  'Rate',
  'Qty',
  'Unit price',
  'Amount',
  'Overridden',
  'Channel',
  'Payment',
  'Amount paid',
  'Balance',
  'Release',
  'Released to',
  'Released on',
  'Collected by',
  'Credit (rebooked)',
  'Category',
  'Note',
]

/**
 * Google Sheets and Excel both read this cleanly: CRLF rows, quoted fields,
 * and a UTF-8 BOM so ₱ and Filipino names survive Excel's default import.
 */
export function entriesToCsv(entries: Entry[]): string {
  const rows = entries.map((e) => [
    e.occurred_on,
    weekday(e.occurred_on),
    KIND_LABEL[e.kind],
    e.court ?? '',
    e.customer ?? '',
    e.start_time ?? '',
    e.end_time ?? '',
    e.rate_type ? (e.rate_type === 'peak' ? 'Peak' : 'Non-peak') : '',
    e.qty ?? '',
    e.unit_price ?? '',
    e.amount,
    e.amount_overridden ? 'yes' : '',
    CHANNEL_LABEL[e.channel],
    PAYMENT_LABEL[e.payment_status],
    e.amount_paid ?? '',
    outstanding(e) || '',
    RELEASE_LABEL[e.release_status],
    e.released_to ?? '',
    e.released_on ?? '',
    e.collected_by ?? '',
    e.is_floating ? 'yes' : '',
    e.category ? CATEGORY_LABEL[e.category] : '',
    e.note ?? '',
  ])
  return '﻿' + [HEADERS, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

function cell(value: string | number): string {
  const s = String(value ?? '')
  // A leading =, +, - or @ would be read as a formula by Sheets and Excel.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

export function downloadCsv(entries: Entry[], label: string) {
  const blob = new Blob([entriesToCsv(entries)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `paayo-court-${slug(label)}-${manilaToday()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'ledger'

// ---------------------------------------------------------------------------
// Reading a CSV back in
// ---------------------------------------------------------------------------

/** A small RFC-4180 parser: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}
