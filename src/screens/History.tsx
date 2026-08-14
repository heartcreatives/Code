import { useMemo, useState } from 'react'
import { Confirm } from '../components/Confirm'
import { EmptyState } from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { useLedger, type LedgerRow } from '../state/LedgerContext'
import { groupByDay } from '../lib/analytics'
import { downloadCsv } from '../lib/csv'
import { peso, pesoSigned, plural } from '../lib/format'
import { formatDayHeading, formatTime } from '../lib/time'
import { CATEGORY_LABEL, METHOD_LABEL, isMoneyIn, type EntryKind } from '../lib/types'

type Filter = 'all' | 'in' | 'out'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'Money in' },
  { value: 'out', label: 'Expenses' },
]

export function History() {
  const { rows, removeEntry, retry, loading } = useLedger()
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [pendingDelete, setPendingDelete] = useState<LedgerRow | null>(null)

  const shown = useMemo(
    () =>
      rows.filter((r) =>
        filter === 'all' ? true : filter === 'in' ? isMoneyIn(r.kind) : r.kind === 'expense',
      ),
    [rows, filter],
  )

  const days = useMemo(() => groupByDay(shown), [shown])

  async function confirmDelete() {
    const row = pendingDelete
    setPendingDelete(null)
    if (!row) return
    try {
      await removeEntry(row)
      toast('Entry deleted')
    } catch (err) {
      toast(`Couldn't delete: ${(err as Error).message}`, 'error')
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-baseline justify-between pt-1">
        <div>
          <h1 className="font-display text-2xl font-bold text-court-deep">History</h1>
          <p className="mt-0.5 text-[15px] text-ink-soft">
            {plural(shown.length, 'entry', 'entries')}
          </p>
        </div>
        <button
          type="button"
          className="btn-quiet"
          disabled={shown.length === 0}
          onClick={() => {
            downloadCsv(shown, filter === 'all' ? 'all' : filter === 'in' ? 'money-in' : 'expenses')
            toast('CSV downloaded')
          }}
        >
          Export CSV
        </button>
      </header>

      <div className="flex gap-2" role="group" aria-label="Filter entries">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`chip ${filter === f.value ? 'chip-on' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && rows.length === 0 ? (
        <p className="px-1 text-[15px] text-ink-faint">Loading the ledger…</p>
      ) : days.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'No entries yet' : 'Nothing here for this filter'}
          body={
            filter === 'all'
              ? 'Everything logged at the court shows up here, newest first, with a running daily net.'
              : 'Try “All”, or log the entry you were looking for.'
          }
        />
      ) : (
        days.map((day) => (
          <section key={day.date}>
            <div className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between bg-paper/95 px-4 py-2 backdrop-blur">
              <h2 className="font-display text-[15px] font-bold text-court-deep">
                {formatDayHeading(day.date)}
              </h2>
              <span
                className={[
                  'num text-[15px] font-bold',
                  day.net < 0 ? 'text-spend' : 'text-gain',
                ].join(' ')}
              >
                {pesoSigned(day.net)}
              </span>
            </div>
            <ul className="card divide-y divide-paper-edge overflow-hidden">
              {day.rows.map((row) => (
                <Row key={row.id} row={row} onDelete={() => setPendingDelete(row)} onRetry={() => retry(row.id)} />
              ))}
            </ul>
          </section>
        ))
      )}

      <Confirm
        open={pendingDelete !== null}
        title="Delete this entry?"
        body={
          pendingDelete
            ? `${peso(pendingDelete.amount)} · ${describe(pendingDelete)}. This can't be undone.`
            : undefined
        }
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

function Row({
  row,
  onDelete,
  onRetry,
}: {
  row: LedgerRow
  onDelete: () => void
  onRetry: () => void
}) {
  const out = row.kind === 'expense'
  return (
    <li className="flex items-start gap-3 p-3.5">
      <span
        aria-hidden="true"
        className={[
          'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
          out ? 'bg-spend' : 'bg-gain',
        ].join(' ')}
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-semibold text-ink">{title(row.kind)}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-faint">
          {describe(row)}
        </p>
        {row.failed && (
          <p className="mt-1 text-[13px] font-semibold text-spend">
            Didn’t save: {row.failed}{' '}
            <button type="button" className="underline" onClick={onRetry}>
              Try again
            </button>
          </p>
        )}
        {row.pending && <p className="mt-1 text-[13px] font-semibold text-[#7A5A12]">Waiting to sync…</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className={['num text-[17px] font-bold', out ? 'text-spend' : 'text-gain'].join(' ')}>
          {out ? `−${peso(row.amount)}` : peso(row.amount)}
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${title(row.kind)} of ${peso(row.amount)}`}
          className="rounded-lg px-2 py-1 text-[12px] font-semibold text-ink-faint active:bg-paper-soft"
        >
          Delete
        </button>
      </div>
    </li>
  )
}

const title = (kind: EntryKind) =>
  kind === 'booking' ? 'Court booking' : kind === 'open_play' ? 'Open play' : 'Expense'

function describe(row: LedgerRow): string {
  const bits: string[] = []
  if (row.occurred_at) bits.push(formatTime(row.occurred_at))
  if (row.kind === 'booking' && row.hours) {
    bits.push(`${row.hours}h ${row.rate_type === 'peak' ? 'peak' : 'non-peak'}`)
  }
  if (row.kind === 'open_play' && row.players) {
    bits.push(
      row.fee_per_player
        ? `${row.players} × ${peso(row.fee_per_player)}`
        : plural(row.players, 'player'),
    )
  }
  if (row.category) bits.push(CATEGORY_LABEL[row.category])
  bits.push(METHOD_LABEL[row.method])
  if (row.note) bits.push(row.note)
  return bits.join(' · ')
}
