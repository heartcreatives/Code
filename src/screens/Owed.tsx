import { useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { useLedger } from '../state/LedgerContext'
import { PERIODS, inRange, owedReport, rangeFor, type Period } from '../lib/analytics'
import { peso, plural } from '../lib/format'
import { formatDate, manilaToday } from '../lib/time'
import {
  CHANNELS,
  CHANNEL_LABEL,
  KIND_LABEL,
  PAYMENT_LABEL,
  RELEASE_LABEL,
  RELEASE_RECIPIENTS,
  collected,
  type Channel,
} from '../lib/types'
import type { HeldPot } from '../lib/analytics'

const PERIOD_KEY = 'paayo.period'

/**
 * The screen the spreadsheet never had. Two different questions live here and
 * they are deliberately kept apart:
 *   - Receivables: money customers still owe us.
 *   - Held: money we have collected but not yet handed over.
 * A booking can be fully paid and still unreleased, which is why one status
 * could never answer both.
 */
export function Owed() {
  const { rows, releaseEntries, loading } = useLedger()
  const toast = useToast()
  const [period, setPeriod] = useState<Period>(
    () => (localStorage.getItem(PERIOD_KEY) as Period | null) ?? 'month',
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [releasedTo, setReleasedTo] = useState('')
  const [viaCash, setViaCash] = useState(false)
  const [busy, setBusy] = useState(false)

  const range = useMemo(() => rangeFor(period), [period])
  const scoped = useMemo(() => rows.filter((r) => inRange(r.occurred_on, range)), [rows, range])
  const report = useMemo(() => owedReport(rows, scoped), [rows, scoped])

  const selectedTotal = useMemo(
    () =>
      report.held
        .filter((e) => selected.has(e.id))
        .reduce((sum, e) => sum + collected(e), 0),
    [report.held, selected],
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllInChannel(channel: Channel) {
    const ids = report.held.filter((e) => e.channel === channel).map((e) => e.id)
    const allOn = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)))
      return next
    })
  }

  async function markReleased() {
    if (selected.size === 0 || busy) return
    setBusy(true)
    try {
      const ids = [...selected]
      await releaseEntries(ids, releasedTo, manilaToday(), viaCash)
      toast(`${plural(ids.length, 'entry', 'entries')} marked released`)
      setSelected(new Set())
      setReleasedTo('')
      setViaCash(false)
    } catch (err) {
      toast(`Couldn't update: ${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="pt-1">
        <h1 className="font-display text-2xl font-bold text-white">Money owed &amp; held</h1>
        <p className="mt-1 text-[15px] text-ink-soft">
          What customers still owe, and what we've collected but not handed over.
        </p>
      </header>

      {/* The question this screen exists to answer, and where the money is. */}
      <PotCard
        title="Not released to the owner"
        subtitle="Court bookings and open play collected but not yet handed over"
        pot={report.heldFor.owner}
        hero
      />

      <PotCard
        title="Not released to Cyril"
        subtitle="Paddle and machine rent — a separate pot"
        pot={report.heldFor.cyril}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Owed to us
          </p>
          <p className="num mt-1.5 text-[26px] font-bold leading-none text-held">
            {peso(report.receivableTotal)}
          </p>
          <p className="mt-1 text-[13px] text-ink-faint">
            {plural(report.receivables.length, 'entry', 'entries')} · unpaid
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Customer credits
          </p>
          <p className="num mt-1.5 text-[26px] font-bold leading-none text-held">
            {peso(report.floatingTotal)}
          </p>
          <p className="mt-1 text-[13px] text-ink-faint">
            {plural(report.floating.length, 'rebooking')}
          </p>
        </div>
      </div>

      {/* ---- Receivables ------------------------------------------------ */}
      <section className="card p-4">
        <h2 className="font-display text-[17px] font-bold text-ink">Receivables</h2>
        <p className="mt-0.5 text-[13px] text-ink-faint">
          Unpaid and partly paid, oldest debts included whatever period is selected below.
        </p>
        {loading && rows.length === 0 ? (
          <p className="py-4 text-[15px] text-ink-faint">Loading…</p>
        ) : report.receivables.length === 0 ? (
          <p className="py-4 text-[15px] text-ink-faint">
            Nobody owes the court anything. Every entry is marked paid.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {report.receivables.map(({ entry, balance }) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-display text-[15px] font-semibold text-ink">
                    {entry.customer || 'Walk-in'}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-faint">
                    {formatDate(entry.occurred_on)} · {KIND_LABEL[entry.kind]} ·{' '}
                    {PAYMENT_LABEL[entry.payment_status]}
                    {entry.payment_status === 'partial' &&
                      ` · ${peso(entry.amount_paid ?? 0)} of ${peso(entry.amount)}`}
                  </p>
                </div>
                <span className="num shrink-0 text-[17px] font-bold text-held">{peso(balance)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Customer credits -------------------------------------------- */}
      {report.floating.length > 0 && (
        <section className="card p-4">
          <h2 className="font-display text-[17px] font-bold text-ink">Customer credits</h2>
          <p className="mt-0.5 text-[13px] text-ink-faint">
            Paid, then the slot moved. The money is still in the channel; the court owes the
            time.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {report.floating.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[15px] text-ink">{e.customer || 'Walk-in'}</p>
                  <p className="mt-0.5 text-[13px] text-ink-faint">
                    {formatDate(e.occurred_on)} · {CHANNEL_LABEL[e.channel]}
                  </p>
                </div>
                <span className="num shrink-0 text-[15px] font-semibold text-held">
                  {peso(collected(e))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Held money -------------------------------------------------- */}
      <section className="card p-4">
        <h2 className="font-display text-[17px] font-bold text-ink">Select by channel</h2>
        <p className="mt-0.5 text-[13px] text-ink-faint">
          Tap a channel to select everything held in it, ready to mark released.
        </p>

        <ul className="mt-3 space-y-2">
          {CHANNELS.map((c) => {
            const amount = report.heldByChannel[c.value]
            const ids = report.held.filter((e) => e.channel === c.value)
            return (
              <li key={c.value}>
                <button
                  type="button"
                  disabled={ids.length === 0}
                  onClick={() => toggleAllInChannel(c.value)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-navy-deep px-3 py-2.5 text-left disabled:opacity-45"
                >
                  <span className="text-[15px] text-ink-soft">{c.label}</span>
                  <span className="num text-[15px] font-semibold text-held">{peso(amount)}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {report.heldByPerson.length > 0 && (
          <>
            <h3 className="mt-5 font-display text-[15px] font-bold text-ink">By person</h3>
            <ul className="mt-2 space-y-1.5 text-[15px]">
              {report.heldByPerson.map((p) => (
                <li key={p.person} className="flex justify-between border-b border-line pb-1.5 last:border-0">
                  <span className="text-ink-soft">{p.person}</span>
                  <span className="num font-semibold text-held">{peso(p.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ---- Cyril's payout ---------------------------------------------- */}
      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[17px] font-bold text-ink">Cyril's payout</h2>
          <span className="num text-[22px] font-bold text-orange">{peso(report.cyrilPayout)}</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-faint">
          Paddle rent plus machine rent · {range.label}.
        </p>
        <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => {
                setPeriod(p.value)
                localStorage.setItem(PERIOD_KEY, p.value)
              }}
              className={`chip shrink-0 snap-start ${period === p.value ? 'chip-on' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* ---- The list you tick, and the action ---------------------------- */}
      <section className="card p-4">
        <h2 className="font-display text-[17px] font-bold text-ink">Mark as released</h2>
        {report.held.length === 0 ? (
          <p className="py-3 text-[15px] text-ink-faint">
            Nothing is being held — every collected entry has been released.
          </p>
        ) : (
          <>
            <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">
              {report.held.map((e) => (
                <li key={e.id}>
                  <label className="flex cursor-pointer items-start gap-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      className="mt-1 h-5 w-5 shrink-0 accent-[#EFC94C]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] text-ink">
                        {e.customer || KIND_LABEL[e.kind]}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-ink-faint">
                        {formatDate(e.occurred_on)} · {CHANNEL_LABEL[e.channel]} ·{' '}
                        {RELEASE_LABEL[e.release_status]}
                        {e.released_to ? ` · for ${e.released_to}` : ''}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[15px] font-semibold text-held">
                      {peso(collected(e))}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <div>
                <label className="label" htmlFor="release-to">
                  Released to
                </label>
                <div className="flex gap-2">
                  <input
                    id="release-to"
                    className="field"
                    placeholder="Name"
                    value={releasedTo}
                    onChange={(e) => setReleasedTo(e.target.value)}
                  />
                  {RELEASE_RECIPIENTS.map((person) => (
                    <button
                      key={person}
                      type="button"
                      className={`chip shrink-0 ${releasedTo === person ? 'chip-on' : ''}`}
                      onClick={() => setReleasedTo(person)}
                    >
                      {person}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-[15px] text-ink-soft">
                <input
                  type="checkbox"
                  checked={viaCash}
                  onChange={(e) => setViaCash(e.target.checked)}
                  className="h-5 w-5 accent-[#EFC94C]"
                />
                Collected digitally, handed over as cash
              </label>

              <button
                type="button"
                className="btn-primary"
                disabled={selected.size === 0 || busy}
                onClick={markReleased}
              >
                {busy
                  ? 'Saving…'
                  : selected.size === 0
                    ? 'Select entries to release'
                    : `Release ${plural(selected.size, 'entry', 'entries')} · ${peso(selectedTotal)}`}
              </button>
            </div>
          </>
        )}
      </section>

      {rows.length === 0 && !loading && (
        <EmptyState
          title="Nothing to chase yet"
          body="Once entries are logged, anything unpaid or unreleased collects here so it can't be forgotten."
        />
      )}
    </div>
  )
}

/**
 * One pot of held money with its channel split — the reconciliation view.
 * Channels with nothing in them are still listed, because "GCash 1: ₱0" is
 * itself the answer when you are checking an account.
 */
function PotCard({
  title,
  subtitle,
  pot,
  hero = false,
}: {
  title: string
  subtitle: string
  pot: HeldPot
  hero?: boolean
}) {
  return (
    <section className={`card p-4 ${hero ? 'border-held/40' : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-bold text-ink">{title}</h2>
        <span
          className={[
            'num font-bold text-held',
            hero ? 'text-[30px] leading-none' : 'text-[22px]',
          ].join(' ')}
        >
          {peso(pot.total)}
        </span>
      </div>
      <p className="mt-0.5 text-[13px] text-ink-faint">{subtitle}</p>

      {pot.total <= 0 ? (
        <p className="mt-3 text-[15px] text-ink-faint">Nothing waiting — all handed over.</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-[15px]">
          {CHANNELS.map((c) => (
            <li
              key={c.value}
              className="flex justify-between border-b border-line pb-1.5 last:border-0"
            >
              <span className={pot.byChannel[c.value] > 0 ? 'text-ink-soft' : 'text-ink-faint'}>
                {c.label}
              </span>
              <span
                className={[
                  'num font-semibold',
                  pot.byChannel[c.value] > 0 ? 'text-held' : 'text-ink-faint',
                ].join(' ')}
              >
                {peso(pot.byChannel[c.value])}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
