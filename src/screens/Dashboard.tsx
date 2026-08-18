import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarPanel } from '../components/BarPanel'
import { CourtLines } from '../components/CourtLines'
import { EmptyState } from '../components/EmptyState'
import { Wordmark } from '../components/Logo'
import { useToast } from '../components/Toast'
import { useLedger } from '../state/LedgerContext'
import { useAuth } from '../state/AuthContext'
import { PERIODS, inRange, rangeFor, summarise, type Period } from '../lib/analytics'
import { hours as fmtHours, peso, pesoSigned, plural } from '../lib/format'
import { CATEGORY_LABEL, CHANNELS, KIND_LABEL } from '../lib/types'
import { clearSampleData, loadSampleData, seedEnabled } from '../lib/seed'
import { CHART } from '../lib/brand'

const PERIOD_KEY = 'paayo.period'

export function Dashboard() {
  const { rows, loading, error, online, queuedCount } = useLedger()
  const { userId, demo } = useAuth()
  const toast = useToast()
  const [period, setPeriod] = useState<Period>(
    () => (localStorage.getItem(PERIOD_KEY) as Period | null) ?? 'today',
  )
  const [busy, setBusy] = useState(false)

  const range = useMemo(() => rangeFor(period), [period])
  const scoped = useMemo(() => rows.filter((r) => inRange(r.occurred_on, range)), [rows, range])
  const summary = useMemo(() => summarise(scoped), [scoped])

  function choose(next: Period) {
    setPeriod(next)
    localStorage.setItem(PERIOD_KEY, next)
  }

  async function seed(mode: 'load' | 'clear') {
    setBusy(true)
    try {
      if (mode === 'load') await loadSampleData(userId)
      else await clearSampleData()
      toast(mode === 'load' ? 'Sample data loaded' : 'Sample data cleared')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-center justify-between pt-1">
        <div>
          <h1 className="sr-only">Pikol sa Paayo — court ledger</h1>
          <Wordmark compact />
          <p className="mt-1.5 text-[15px] text-ink-soft">{range.label}</p>
        </div>
        <span
          className={[
            'rounded-full px-2.5 py-1 text-[12px] font-semibold',
            online ? 'bg-sky/15 text-sky' : 'bg-orange/15 text-orange',
          ].join(' ')}
        >
          {online ? 'Live' : 'Offline'}
        </span>
      </header>

      {/* Period selector: one row of filters above everything it controls. */}
      <div
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1"
        role="group"
        aria-label="Period"
      >
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={period === p.value}
            onClick={() => choose(p.value)}
            className={`chip shrink-0 snap-start ${period === p.value ? 'chip-on' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-2xl border border-spend/40 bg-spend/10 px-4 py-3 text-[14px] text-spend">
          {error}
        </p>
      )}
      {queuedCount > 0 && (
        <p className="rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-[14px] text-orange">
          {plural(queuedCount, 'entry', 'entries')} waiting to sync.{' '}
          <Link to="/history" className="underline">
            See them
          </Link>
        </p>
      )}

      {/* Hero: the net for the period, on the court. */}
      <section className="card relative overflow-hidden bg-navy p-5 text-white">
        <CourtLines className="absolute inset-0 h-full w-full text-sky opacity-30" />
        <div className="relative">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            Net · {range.label}
          </p>
          <p
            className={[
              'num mt-1 text-[44px] font-bold leading-none',
              summary.net < 0 ? 'text-spend' : 'text-orange',
            ].join(' ')}
          >
            {pesoSigned(summary.net)}
          </p>
          <p className="mt-2 text-[14px] text-ink-soft">
            {summary.entryCount === 0
              ? 'Nothing logged yet for this period.'
              : `${plural(summary.entryCount, 'entry', 'entries')} · ${fmtHours(summary.courtHours)} of court sold`}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Money in" value={peso(summary.moneyIn)} tone="gain" />
        <Kpi label="Expenses" value={peso(summary.expenses)} tone="spend" />
        <Kpi label="Court hours sold" value={fmtHours(summary.courtHours)} />
        <Kpi
          label="Open play"
          value={summary.players ? plural(summary.players, 'player') : '—'}
        />
      </div>

      {loading && rows.length === 0 ? (
        <p className="px-1 text-[15px] text-ink-faint">Loading the ledger…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="The court's books start here"
          body="Log a booking, an open play session or an expense and this page fills in — for everyone on the team, live."
        />
      ) : summary.entryCount === 0 ? (
        <EmptyState
          title={`Nothing logged for ${range.label}`}
          body="Pick another period above, or log what just came in at the court."
          actionLabel="Log an entry"
        />
      ) : (
        <>
          <BarPanel
            title="Where it came in"
            subtitle="Money in by channel — reconcile against your GCash and Maya payouts"
            color={CHART.moneyIn}
            emptyText="No money in for this period yet."
            data={CHANNELS.map((c) => ({
              label: c.short,
              value: summary.byChannel[c.value],
              meta: c.label === c.short ? undefined : c.label,
            }))}
          />

          <BarPanel
            title="Revenue by type"
            color={CHART.revenue}
            emptyText="No revenue for this period yet."
            data={(['court_booking', 'open_play', 'paddle_rent', 'machine_rent'] as const).map(
              (k) => ({ label: KIND_LABEL[k], value: summary.byKind[k] }),
            )}
          />

          <BarPanel
            title="Expenses by category"
            color={CHART.expense}
            emptyText="No expenses for this period. Log one when the court spends."
            data={summary.byCategory.map((c) => ({
              label: CATEGORY_LABEL[c.category],
              value: c.amount,
            }))}
          />

          {summary.expenses > 0 && (
            <section className="card p-4">
              <h2 className="font-display text-[17px] font-bold text-ink">Expenses paid from</h2>
              <ul className="mt-3 space-y-2 text-[15px]">
                {CHANNELS.map((c) => (
                  <li key={c.value} className="flex justify-between border-b border-line pb-2 last:border-0">
                    <span className="text-ink-soft">{c.label}</span>
                    <span className="num font-semibold text-spend">
                      {peso(summary.expensesByChannel[c.value])}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {seedEnabled && (
        <section className="card p-4">
          <h2 className="font-display text-[15px] font-bold text-ink">Sample data</h2>
          <p className="mt-1 text-[13px] text-ink-faint">
            Three weeks of made-up entries, tagged “Sample”, so you can see the dashboard full.
            Clearing removes only those.
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn-quiet" disabled={busy} onClick={() => seed('load')}>
              Load sample data
            </button>
            <button className="btn-quiet" disabled={busy} onClick={() => seed('clear')}>
              Clear it
            </button>
          </div>
        </section>
      )}

      {demo && (
        <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
          Demo mode — entries are saved on this device only. Add your Supabase keys to share the
          ledger with the team.
        </p>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'gain' | 'spend'
}) {
  return (
    <div className="card p-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{label}</p>
      <p
        className={[
          'num mt-1.5 text-[26px] font-bold leading-none',
          tone === 'gain' ? 'text-sky' : tone === 'spend' ? 'text-spend' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  )
}
