import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Segmented } from '../components/Segmented'
import { useToast } from '../components/Toast'
import { useLedger } from '../state/LedgerContext'
import { CourtLines } from '../components/CourtLines'
import { bookingAmount, openPlayAmount, rateFor, rateLabel, rateWindow, suggestRateType } from '../lib/pricing'
import { manilaTimeNow, manilaToday } from '../lib/time'
import { peso } from '../lib/format'
import { CATEGORIES, METHODS, type EntryKind, type ExpenseCategory, type PayMethod, type RateType } from '../lib/types'

const LAST_METHOD_KEY = 'paayo.lastMethod'

export function Log() {
  const { addEntry, settings, online } = useLedger()
  const toast = useToast()
  const amountRef = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<EntryKind>('booking')
  const [date, setDate] = useState(manilaToday)
  const [time, setTime] = useState(manilaTimeNow)
  const [rateType, setRateType] = useState<RateType>(() => suggestRateType(manilaTimeNow(), settings))
  const [hoursText, setHoursText] = useState('1')
  const [playersText, setPlayersText] = useState('')
  const [feeText, setFeeText] = useState(() =>
    settings.open_play_fee ? String(settings.open_play_fee) : '',
  )
  const [amountText, setAmountText] = useState('')
  const [amountEdited, setAmountEdited] = useState(false)
  const [method, setMethod] = useState<PayMethod>(
    () => (localStorage.getItem(LAST_METHOD_KEY) as PayMethod | null) ?? 'cash',
  )
  const [category, setCategory] = useState<ExpenseCategory>('supplies')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const hours = toNumber(hoursText)
  const players = toNumber(playersText)
  const fee = toNumber(feeText)
  const amount = toNumber(amountText)

  // Auto-fill: booking = hours × rate. Any manual edit to the amount sticks
  // until the time, hours or rate changes again.
  useEffect(() => {
    if (kind !== 'booking' || amountEdited) return
    setAmountText(hours && hours > 0 ? String(bookingAmount(hours, rateType, settings)) : '')
  }, [kind, hours, rateType, settings, amountEdited])

  // Auto-fill: open play = players × fee per player. With no fixed fee at this
  // court, staff can also just type the total and leave these blank.
  useEffect(() => {
    if (kind !== 'open_play' || amountEdited) return
    if (players && players > 0 && fee && fee > 0) {
      setAmountText(String(openPlayAmount(players, fee)))
    }
  }, [kind, players, fee, amountEdited])

  const changeTime = useCallback(
    (next: string) => {
      setTime(next)
      setRateType(suggestRateType(next, settings)) // suggestion, still editable below
      setAmountEdited(false)
    },
    [settings],
  )

  const changeKind = useCallback((next: EntryKind) => {
    setKind(next)
    setAmountEdited(false)
    setAmountText('')
  }, [])

  const suggested = useMemo(() => suggestRateType(time, settings), [time, settings])
  const rate = rateFor(rateType, settings)

  const problem = useMemo(() => {
    if (!date) return 'Pick a date.'
    if (!amount || amount <= 0) return 'Enter an amount.'
    if (kind === 'booking' && (!hours || hours <= 0)) return 'Enter how many hours.'
    return null
  }, [date, amount, kind, hours])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (problem || saving) return
    setSaving(true)
    localStorage.setItem(LAST_METHOD_KEY, method)

    try {
      const { queued } = await addEntry({
        kind,
        occurred_on: date,
        occurred_at: kind === 'expense' ? null : time || null,
        rate_type: kind === 'booking' ? rateType : null,
        hours: kind === 'booking' ? hours : null,
        players: kind === 'open_play' ? players : null,
        fee_per_player: kind === 'open_play' ? fee : null,
        amount: amount!,
        method,
        category: kind === 'expense' ? category : null,
        note: note.trim() || null,
      })

      toast(
        queued
          ? `Saved offline · ${peso(amount!)} — it will sync when you're back online`
          : `${kind === 'expense' ? 'Expense' : 'Money in'} · ${peso(amount!)} logged`,
        queued ? 'warn' : 'ok',
      )

      // Reset for the next entry, but stay here: staff log several in a row.
      setAmountText('')
      setAmountEdited(false)
      setNote('')
      setPlayersText('')
      if (kind === 'booking') setHoursText('1')
      if (!settings.open_play_fee) setFeeText('')
      amountRef.current?.blur()
    } catch (err) {
      toast(`Couldn't save: ${(err as Error).message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-6">
      <header className="pt-1">
        <h1 className="font-display text-2xl font-bold text-court-deep">Log an entry</h1>
        <p className="mt-1 text-[15px] text-ink-soft">
          {online ? 'Everyone at the court sees this within seconds.' : 'Offline — entries queue and sync later.'}
        </p>
      </header>

      <Segmented
        label="Entry type"
        value={kind}
        onChange={changeKind}
        options={[
          { value: 'booking', label: 'Court', sub: 'Booking' },
          { value: 'open_play', label: 'Open play', sub: 'Per player' },
          { value: 'expense', label: 'Expense', sub: 'Money out' },
        ]}
      />

      <section className="card space-y-4 p-4">
        <div className={kind === 'expense' ? '' : 'grid grid-cols-2 gap-3'}>
          <div>
            <label className="label" htmlFor="date">
              Date
            </label>
            <input
              id="date"
              type="date"
              className="field"
              value={date}
              max={manilaToday()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          {kind !== 'expense' && (
            <div>
              <label className="label" htmlFor="time">
                {kind === 'booking' ? 'Start time' : 'Session time'}
              </label>
              <input
                id="time"
                type="time"
                className="field"
                value={time}
                onChange={(e) => changeTime(e.target.value)}
              />
            </div>
          )}
        </div>

        {kind === 'booking' && (
          <>
            <div>
              <span className="label">Rate</span>
              <Segmented
                size="sm"
                label="Rate type"
                value={rateType}
                onChange={(v) => {
                  setRateType(v)
                  setAmountEdited(false)
                }}
                options={[
                  { value: 'non_peak', label: 'Non-peak', sub: peso(settings.non_peak_rate) + '/hr' },
                  { value: 'peak', label: 'Peak', sub: peso(settings.peak_rate) + '/hr' },
                ]}
              />
              <p className="mt-2 text-[13px] text-ink-faint">
                {rateWindow[rateType]} ·{' '}
                {rateType === suggested
                  ? `suggested from ${time || 'the start time'}`
                  : `overriding the ${rateLabel[suggested].toLowerCase()} suggestion`}
              </p>
            </div>

            <div>
              <label className="label" htmlFor="hours">
                Hours
              </label>
              <div className="flex gap-2">
                <input
                  id="hours"
                  className="field field-num w-24"
                  inputMode="decimal"
                  value={hoursText}
                  onChange={(e) => {
                    setHoursText(e.target.value)
                    setAmountEdited(false)
                  }}
                />
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {['1', '1.5', '2', '3'].map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`chip ${hoursText === h ? 'chip-on' : ''}`}
                      onClick={() => {
                        setHoursText(h)
                        setAmountEdited(false)
                      }}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {kind === 'open_play' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="players">
                Players
              </label>
              <input
                id="players"
                className="field field-num"
                inputMode="numeric"
                placeholder="0"
                value={playersText}
                onChange={(e) => {
                  setPlayersText(e.target.value)
                  setAmountEdited(false)
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor="fee">
                Fee each
              </label>
              <input
                id="fee"
                className="field field-num"
                inputMode="decimal"
                placeholder="₱"
                value={feeText}
                onChange={(e) => {
                  setFeeText(e.target.value)
                  setAmountEdited(false)
                }}
              />
            </div>
          </div>
        )}

        {kind === 'expense' && (
          <div>
            <span className="label">Category</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={category === c.value}
                  className={`chip ${category === c.value ? 'chip-on' : ''}`}
                  onClick={() => setCategory(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* The amount card carries the court motif — the one bold moment. */}
      <section className="card relative overflow-hidden bg-court p-4 text-paper">
        <CourtLines className="absolute inset-0 h-full w-full text-paper opacity-20" />
        <div className="relative">
          <label className="label !text-paper/70" htmlFor="amount">
            {kind === 'expense' ? 'Cost' : 'Amount'}
          </label>
          <div className="flex items-baseline gap-2">
            <span className="num text-3xl font-bold text-optic">₱</span>
            <input
              id="amount"
              ref={amountRef}
              className="num w-full bg-transparent text-right text-4xl font-bold text-optic placeholder:text-paper/30 focus:outline-none"
              inputMode="decimal"
              placeholder="0"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value)
                setAmountEdited(true)
              }}
              aria-describedby="amount-help"
            />
          </div>
          <p id="amount-help" className="mt-2 text-[13px] text-paper/75">
            {kind === 'booking' &&
              (amountEdited
                ? 'Edited by hand — change time, hours or rate to recalculate.'
                : `${hoursText || 0} × ${peso(rate)} · auto-filled, tap to change`)}
            {kind === 'open_play' &&
              (amountEdited
                ? 'Edited by hand — change players or fee to recalculate.'
                : players && fee
                  ? `${players} × ${peso(fee)} · auto-filled, tap to change`
                  : 'Enter players and fee each, or just type the total.')}
            {kind === 'expense' && 'What this cost the court.'}
          </p>
        </div>
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <span className="label">Paid by</span>
          <Segmented
            label="Payment method"
            value={method}
            onChange={setMethod}
            options={METHODS.map((m) => ({ value: m.value, label: m.label, sub: m.sub }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="note">
            Note <span className="font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="note"
            className="field"
            placeholder={
              kind === 'expense' ? 'Supplier or what it was for' : 'Court 1, customer name…'
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
          />
        </div>
      </section>

      <button type="submit" className="btn-primary" disabled={Boolean(problem) || saving}>
        {saving
          ? 'Saving…'
          : problem
            ? problem
            : `Save ${kind === 'expense' ? 'expense' : ''} ${peso(amount ?? 0)}`.replace('  ', ' ')}
      </button>
    </form>
  )
}

function toNumber(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
