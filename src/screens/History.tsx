import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Confirm } from '../components/Confirm'
import { EditEntry } from '../components/EditEntry'
import { EmptyState } from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { useLedger, type LedgerRow } from '../state/LedgerContext'
import { groupByDay } from '../lib/analytics'
import { downloadCsv } from '../lib/csv'
import { peso, pesoSigned, plural } from '../lib/format'
import { formatDayHeading, formatTime, weekday } from '../lib/time'
import {
  CATEGORY_LABEL,
  CHANNELS,
  CHANNEL_LABEL,
  KINDS,
  KIND_LABEL,
  PAYMENT_LABEL,
  RELEASE_LABEL,
  outstanding,
  type Channel,
  type EntryKind,
  type PaymentStatus,
  type ReleaseStatus,
} from '../lib/types'

type KindFilter = EntryKind | 'all'
type ChannelFilter = Channel | 'all'
type PaymentFilter = PaymentStatus | 'all'
type ReleaseFilter = ReleaseStatus | 'all' | 'outstanding'

export function History() {
  const { rows, removeEntry, retry, loading } = useLedger()
  const toast = useToast()
  const [kind, setKind] = useState<KindFilter>('all')
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [payment, setPayment] = useState<PaymentFilter>('all')
  const [release, setRelease] = useState<ReleaseFilter>('all')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<LedgerRow | null>(null)
  const [editing, setEditing] = useState<LedgerRow | null>(null)

  const query = search.trim().toLowerCase()

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (kind !== 'all' && r.kind !== kind) return false
        if (channel !== 'all' && r.channel !== channel) return false
        if (payment !== 'all' && r.payment_status !== payment) return false
        if (release === 'outstanding') {
          if (r.release_status === 'released' || r.release_status === 'released_via_cash') {
            return false
          }
        } else if (release !== 'all' && r.release_status !== release) return false
        if (query) {
          const haystack = `${r.customer ?? ''} ${r.note ?? ''}`.toLowerCase()
          if (!haystack.includes(query)) return false
        }
        return true
      }),
    [rows, kind, channel, payment, release, query],
  )

  const days = useMemo(() => groupByDay(shown), [shown])
  const activeFilters =
    (kind !== 'all' ? 1 : 0) +
    (channel !== 'all' ? 1 : 0) +
    (payment !== 'all' ? 1 : 0) +
    (release !== 'all' ? 1 : 0)

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

  function clearFilters() {
    setKind('all')
    setChannel('all')
    setPayment('all')
    setRelease('all')
    setSearch('')
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-baseline justify-between gap-3 pt-1">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">History</h1>
          <p className="mt-0.5 text-[15px] text-ink-soft">
            {plural(shown.length, 'entry', 'entries')}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to="/import" className="btn-quiet">
            Import
          </Link>
          <button
            type="button"
            className="btn-quiet"
            disabled={shown.length === 0}
            onClick={() => {
              downloadCsv(shown, kind === 'all' ? 'all' : kind)
              toast('CSV downloaded')
            }}
          >
            Export
          </button>
        </div>
      </header>

      <div className="flex gap-2">
        <input
          type="search"
          className="field flex-1"
          placeholder="Search customer or note"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search by customer or note"
        />
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={`chip shrink-0 ${activeFilters > 0 ? 'chip-on' : ''}`}
        >
          Filters{activeFilters > 0 ? ` · ${activeFilters}` : ''}
        </button>
      </div>

      {showFilters && (
        <section className="card space-y-4 p-4">
          <FilterRow
            label="Type"
            value={kind}
            onChange={setKind}
            options={[{ value: 'all' as const, label: 'All' }, ...KINDS.map((k) => ({ value: k.value, label: k.short }))]}
          />
          <FilterRow
            label="Channel"
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'all' as const, label: 'All' },
              ...CHANNELS.map((c) => ({ value: c.value, label: c.short })),
            ]}
          />
          <FilterRow
            label="Payment"
            value={payment}
            onChange={setPayment}
            options={[
              { value: 'all' as const, label: 'All' },
              { value: 'paid' as const, label: 'Paid' },
              { value: 'partial' as const, label: 'Partial' },
              { value: 'unpaid' as const, label: 'Unpaid' },
            ]}
          />
          <FilterRow
            label="Release"
            value={release}
            onChange={setRelease}
            options={[
              { value: 'all' as const, label: 'All' },
              { value: 'outstanding' as const, label: 'Not released' },
              { value: 'released' as const, label: 'Released' },
              { value: 'released_via_cash' as const, label: 'Via cash' },
              { value: 'to_confirm' as const, label: 'To confirm' },
            ]}
          />
          {(activeFilters > 0 || query) && (
            <button type="button" className="btn-quiet" onClick={clearFilters}>
              Clear all
            </button>
          )}
        </section>
      )}

      {loading && rows.length === 0 ? (
        <p className="px-1 text-[15px] text-ink-faint">Loading the ledger…</p>
      ) : days.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? 'No entries yet' : 'Nothing matches those filters'}
          body={
            rows.length === 0
              ? 'Everything logged at the court shows up here, newest first, with a running daily net.'
              : 'Try clearing a filter, or search a different name.'
          }
          actionLabel={rows.length === 0 ? 'Log the first entry' : 'Log an entry'}
        />
      ) : (
        days.map((day) => (
          <section key={day.date}>
            <div className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between bg-charcoal/95 px-4 py-2 backdrop-blur">
              <h2 className="font-display text-[15px] font-bold text-white">
                {formatDayHeading(day.date)}
                <span className="ml-2 font-body text-[13px] font-normal text-ink-faint">
                  {weekday(day.date)}
                </span>
              </h2>
              <span
                className={['num text-[15px] font-bold', day.net < 0 ? 'text-spend' : 'text-sky'].join(
                  ' ',
                )}
              >
                {pesoSigned(day.net)}
              </span>
            </div>
            <ul className="card divide-y divide-line overflow-hidden">
              {day.rows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  onEdit={() => setEditing(row)}
                  onDelete={() => setPendingDelete(row)}
                  onRetry={() => retry(row.id)}
                />
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

      {editing && <EditEntry row={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function FilterRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`chip ${value === o.value ? 'chip-on' : ''}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Row({
  row,
  onEdit,
  onDelete,
  onRetry,
}: {
  row: LedgerRow
  onEdit: () => void
  onDelete: () => void
  onRetry: () => void
}) {
  const out = row.kind === 'expense'
  const owed = outstanding(row)
  return (
    <li className="flex items-start gap-3 p-3.5">
      <span
        aria-hidden="true"
        className={['mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', out ? 'bg-spend' : 'bg-sky'].join(' ')}
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-semibold text-ink">
          {row.customer || KIND_LABEL[row.kind]}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-faint">
          {describe(row)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {owed > 0 && <Tag tone="held">{peso(owed)} owed</Tag>}
          {!out && row.release_status !== 'released' && row.release_status !== 'released_via_cash' && (
            <Tag tone="held">{RELEASE_LABEL[row.release_status]}</Tag>
          )}
          {row.amount_overridden && <Tag tone="quiet">Adjusted</Tag>}
        </div>
        {row.failed && (
          <p className="mt-1 text-[13px] font-semibold text-spend">
            Didn't save: {row.failed}{' '}
            <button type="button" className="underline" onClick={onRetry}>
              Try again
            </button>
          </p>
        )}
        {row.pending && (
          <p className="mt-1 text-[13px] font-semibold text-orange">Waiting to sync…</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className={['num text-[17px] font-bold', out ? 'text-spend' : 'text-sky'].join(' ')}>
          {out ? `−${peso(row.amount)}` : peso(row.amount)}
        </span>
        <div className="flex gap-1">
          {!row.pending && !row.failed && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${KIND_LABEL[row.kind]} of ${peso(row.amount)}`}
              className="rounded-lg px-2 py-1 text-[12px] font-semibold text-sky active:bg-navy-deep"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${KIND_LABEL[row.kind]} of ${peso(row.amount)}`}
            className="rounded-lg px-2 py-1 text-[12px] font-semibold text-ink-faint active:bg-navy-deep"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}

function Tag({ children, tone }: { children: React.ReactNode; tone: 'held' | 'quiet' }) {
  return (
    <span
      className={[
        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tone === 'held' ? 'bg-held/15 text-held' : 'bg-navy-lift text-ink-faint',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

function describe(row: LedgerRow): string {
  const bits: string[] = [KIND_LABEL[row.kind]]
  if (row.start_time) {
    bits.push(row.end_time ? `${formatTime(row.start_time)}–${formatTime(row.end_time)}` : formatTime(row.start_time))
  }
  if (row.kind === 'court_booking' && row.qty) {
    bits.push(`${row.qty}h ${row.rate_type === 'peak' ? 'peak' : 'non-peak'}`)
  }
  if ((row.kind === 'open_play' || row.kind === 'paddle_rent' || row.kind === 'machine_rent') && row.qty) {
    bits.push(row.unit_price ? `${row.qty} × ${peso(row.unit_price)}` : String(row.qty))
  }
  if (row.category) bits.push(CATEGORY_LABEL[row.category])
  bits.push(CHANNEL_LABEL[row.channel])
  if (row.payment_status !== 'paid') bits.push(PAYMENT_LABEL[row.payment_status])
  if (row.released_to) bits.push(`to ${row.released_to}`)
  if (row.note) bits.push(row.note)
  return bits.join(' · ')
}
