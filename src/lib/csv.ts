import type { Entry } from './types'
import { CATEGORY_LABEL, KIND_LABEL, METHOD_LABEL } from './types'
import { manilaToday } from './time'

const HEADERS = [
  'Date',
  'Time',
  'Type',
  'Rate',
  'Hours',
  'Players',
  'Fee per player',
  'Amount',
  'Direction',
  'Method',
  'Category',
  'Note',
]

/**
 * Google Sheets and Excel both read this cleanly: CRLF rows, quoted fields,
 * a UTF-8 BOM so ₱ and any Filipino names survive Excel's default import.
 */
export function entriesToCsv(entries: Entry[]): string {
  const rows = entries.map((e) => [
    e.occurred_on,
    e.occurred_at ?? '',
    KIND_LABEL[e.kind],
    e.rate_type ? (e.rate_type === 'peak' ? 'Peak' : 'Non-peak') : '',
    e.hours ?? '',
    e.players ?? '',
    e.fee_per_player ?? '',
    e.amount,
    e.kind === 'expense' ? 'Expense' : 'Money in',
    METHOD_LABEL[e.method],
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
