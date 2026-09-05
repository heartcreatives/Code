import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Segmented } from '../components/Segmented'
import { useToast } from '../components/Toast'
import { useLedger } from '../state/LedgerContext'
import { CourtLines } from '../components/CourtLines'
import {
  QTY_LABEL,
  UNIT_LABEL,
  computeAmount,
  defaultUnitPrice,
  rateLabel,
  rateWindow,
  suggestRateType,
} from '../lib/pricing'
import { hoursBetween, manilaTimeNow, manilaToday, weekday } from '../lib/time'
import { peso } from '../lib/format'
import {
  CATEGORIES,
  CHANNELS,
  PAYMENT_STATUSES,
  RELEASE_RECIPIENTS,
  RELEASE_STATUSES,
  type Channel,
  type EntryKind,
  type Court,
  type ExpenseCategory,
  type PaymentStatus,
  type RateType,
  type ReleaseStatus,
} from '../lib/types'
import { isDirectToOwner } from '../lib/types'

const LAST_CHANNEL_KEY = 'paayo.lastChannel'

const KIND_OPTIONS: { value: EntryKind; label: string; sub: string }[] = [
  { value: 'court_booking', label: 'Court', sub: 'Booking' },
  { value: 'open_play', label: 'Open play', sub: 'Per player' },
  { value: 'paddle_rent', label: 'Paddle', sub: 'Rent' },
  { value: 'machine_rent', label: 'Machine', sub: 'Rent' },
  { value: 'expense', label: 'Expense', sub: 'Money out' },
]

export function Log() {
  const { addEntry, settings, online } = useLedger()
  const toast = useToast()
  const amountRef = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<EntryKind>('court_booking')
  const [date, setDate] = useState(manilaToday)
  const [startTime, setStartTime] = useState(manilaTimeNow)
  const [endTime, setEndTime] = useState('')
  const [rateType, setRateType] = useState<RateType>(() =>
    suggestRateType(manilaTimeNow(), settings),
  )
  const [qtyText, setQtyText] = useState('')
  const [qtyEdited, setQtyEdited] = useState(false)
  const [unitText, setUnitText] = useState('')
  const [unitEdited, setUnitEdited] = useState(false)
  const [amountText, setAmountText] = useState('')
  const [amountEdited, setAmountEdited] = useState(false)
  const [channel, setChannel] = useState<Channel>(
    () => (localStorage.getItem(LAST_CHANNEL_KEY) as Channel | null) ?? 'cash',
  )
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid')
  const [paidText, setPaidText] = useState('')
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus>('not_released')
  const [releasedTo, setReleasedTo] = useState('')
  const [customer, setCustomer] = useState('')
  const [court, setCourt] = useState<Court>(1)
  const [isFloating, setIsFloating] = useState(false)
  const [collectedBy, setCollectedBy] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('supplies')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const qty = toNumber(qtyText)
  const unitPrice = toNumber(unitText)
  const amount = toNumber(amountText)
  const amountPaid = toNumber(paidText)

  const isBooking = kind === 'court_booking'
  const isExpense = kind === 'expense'
  const countsQty = !isExpense

  // Start and end time fill in the hours — staff used to type both the times
  // and the hours into the sheet, which is the same fact entered twice.
  const derivedHours = useMemo(
    () => (isBooking ? hoursBetween(startTime, endTime) : null),
    [isBooking, startTime, endTime],
  )

  useEffect(() => {
    if (!isBooking || qtyEdited || derivedHours === null) return
    setQtyText(String(derivedHours))
  }, [isBooking, derivedHours, qtyEdited])

  // Unit price follows the kind (and the rate, for bookings) until touched.
  useEffect(() => {
    if (unitEdited || isExpense) return
    const preset = defaultUnitPrice(kind, rateType, settings)
    setUnitText(preset === null ? '' : String(preset))
  }, [kind, rateType, settings, unitEdited, isExpense])

  // Amount = qty × unit price, unless staff typed one. Discounts are common,
  // so the typed figure always wins and is recorded as an override.
  useEffect(() => {
    if (amountEdited || isExpense) return
    const computed = computeAmount(qty, unitPrice)
    if (computed !== null) setAmountText(String(computed))
  }, [qty, unitPrice, amountEdited, isExpense])

  const changeStart = useCallback(
    (next: string) => {
      setStartTime(next)
      setRateType(suggestRateType(next, settings)) // a suggestion; still editable
      setQtyEdited(false)
      setUnitEdited(false)
      setAmountEdited(false)
    },
    [settings],
  )

  const changeKind = useCallback((next: EntryKind) => {
    setKind(next)
    setQtyEdited(false)
    setUnitEdited(false)
    setAmountEdited(false)
    setAmountText('')
    setQtyText('')
  }, [])

  const suggested = useMemo(() => suggestRateType(startTime, settings), [startTime, settings])
  // Boboy's own GCash: the money is with the owner the moment it lands, so
  // there is nothing to release and the controls for it are hidden.
  const straightToOwner = isDirectToOwner(channel)

  const problem = useMemo(() => {
    if (!date) return 'Pick a date.'
    if (!amount || amount <= 0) return 'Enter an amount.'
    if (paymentStatus === 'partial' && (!amountPaid || amountPaid <= 0)) {
      return 'Enter how much was paid.'
    }
    if (paymentStatus === 'partial' && amountPaid && amountPaid >= amount) {
      return 'Partial payment must be less than the amount.'
    }
    return null
  }, [date, amount, paymentStatus, amountPaid])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (problem || saving) return
    setSaving(true)
    localStorage.setItem(LAST_CHANNEL_KEY, channel)

    try {
      const { queued } = await addEntry({
        kind,
        occurred_on: date,
        start_time: isExpense ? null : startTime || null,
        end_time: isBooking ? endTime || null : null,
        rate_type: isBooking ? rateType : null,
        court: isBooking ? court : null,
        qty: countsQty ? qty : null,
        unit_price: countsQty ? unitPrice : null,
        amount: amount!,
        amount_overridden: amountEdited,
        channel,
        payment_status: isExpense ? 'paid' : paymentStatus,
        amount_paid: paymentStatus === 'partial' && !isExpense ? amountPaid : null,
        release_status: isExpense || straightToOwner ? 'released' : releaseStatus,
        released_to: straightToOwner ? 'Boboy' : releasedTo.trim() || null,
        released_on:
          straightToOwner ||
          releaseStatus === 'released' ||
          releaseStatus === 'released_via_cash'
            ? date
            : null,
        customer: customer.trim() || null,
        is_floating: isExpense ? false : isFloating,
        collected_by: collectedBy.trim() || null,
        category: isExpense ? category : null,
        note: note.trim() || null,
      })

      toast(
        queued
          ? `Saved offline · ${peso(amount!)} — it will sync when you're back online`
          : `${isExpense ? 'Expense' : 'Money in'} · ${peso(amount!)} logged`,
        queued ? 'warn' : 'ok',
      )

      // Reset for the next entry but stay here — staff log several in a row.
      setAmountText('')
      setAmountEdited(false)
      setQtyText('')
      setQtyEdited(false)
      setEndTime('')
      setNote('')
      setCustomer('')
      setPaidText('')
      setPaymentStatus('paid')
      setIsFloating(false)
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
        <h1 className="font-display text-2xl font-bold text-white">Log an entry</h1>
        <p className="mt-1 text-[15px] text-ink-soft">
          {online
            ? 'Everyone at the court sees this within seconds.'
            : 'Offline — entries queue and sync later.'}
        </p>
      </header>

      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Entry type">
        {KIND_OPTIONS.map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => changeKind(k.value)}
            className={`chip shrink-0 snap-start ${kind === k.value ? 'chip-on' : ''}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <section className="card space-y-4 p-4">
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
          {date && <p className="mt-1.5 text-[13px] text-ink-faint">{weekday(date)}</p>}
        </div>

        {!isExpense && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="start">
                {isBooking ? 'Start' : 'Time'}
              </label>
              <input
                id="start"
                type="time"
                className="field"
                value={startTime}
                onChange={(e) => changeStart(e.target.value)}
              />
            </div>
            {isBooking && (
              <div>
                <label className="label" htmlFor="end">
                  End
                </label>
                <input
                  id="end"
                  type="time"
                  className="field"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value)
                    setQtyEdited(false)
                    setAmountEdited(false)
                  }}
                />
              </div>
            )}
          </div>
        )}

        {isBooking && (
          <div>
            <span className="label">Rate</span>
            <Segmented
              size="sm"
              label="Rate type"
              value={rateType}
              onChange={(v) => {
                setRateType(v)
                setUnitEdited(false)
                setAmountEdited(false)
              }}
              options={[
                { value: 'non_peak', label: 'Non-peak', sub: `${peso(settings.non_peak_rate)}/hr` },
                { value: 'peak', label: 'Peak', sub: `${peso(settings.peak_rate)}/hr` },
              ]}
            />
            <p className="mt-2 text-[13px] text-ink-faint">
              {rateWindow[rateType]} ·{' '}
              {rateType === suggested
                ? `suggested from ${startTime || 'the start time'}`
                : `overriding the ${rateLabel[suggested].toLowerCase()} suggestion`}
            </p>

            <div className="mt-4">
              <span className="label">Court</span>
              <Segmented
                size="sm"
                label="Court"
                value={String(court)}
                onChange={(v) => setCourt(Number(v) as Court)}
                options={[
                  { value: '1', label: 'Court 1' },
                  { value: '2', label: 'Court 2' },
                ]}
              />
            </div>
          </div>
        )}

        {countsQty && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="qty">
                {QTY_LABEL[kind]}
              </label>
              <input
                id="qty"
                className="field field-num"
                inputMode="decimal"
                placeholder="0"
                value={qtyText}
                onChange={(e) => {
                  setQtyText(e.target.value)
                  setQtyEdited(true)
                  setAmountEdited(false)
                }}
              />
              {isBooking && derivedHours !== null && !qtyEdited && (
                <p className="mt-1.5 text-[13px] text-sky">From the times</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="unit">
                {UNIT_LABEL[kind]}
              </label>
              <input
                id="unit"
                className="field field-num"
                inputMode="decimal"
                placeholder="₱"
                value={unitText}
                onChange={(e) => {
                  setUnitText(e.target.value)
                  setUnitEdited(true)
                  setAmountEdited(false)
                }}
              />
            </div>
          </div>
        )}

        {isExpense && (
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
      <section className="card relative overflow-hidden bg-navy p-4 text-white">
        <CourtLines className="absolute inset-0 h-full w-full text-sky opacity-30" />
        <div className="relative">
          <label className="label !text-ink-soft" htmlFor="amount">
            {isExpense ? 'Cost' : 'Amount'}
          </label>
          <div className="flex items-baseline gap-2">
            <span className="num text-3xl font-bold text-orange">₱</span>
            <input
              id="amount"
              ref={amountRef}
              className="num w-full bg-transparent text-right text-4xl font-bold text-orange placeholder:text-ink-faint/50 focus:outline-none"
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
          <p id="amount-help" className="mt-2 text-[13px] text-ink-soft">
            {isExpense
              ? 'What this cost the court.'
              : amountEdited
                ? 'Typed by hand — saved as an override. Change the qty or price to recalculate.'
                : qty && unitPrice
                  ? `${qty} × ${peso(unitPrice)} · auto-filled, tap to change`
                  : 'Enter the qty and price, or just type the total.'}
          </p>
        </div>
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <span className="label">Paid into</span>
          <div className="grid grid-cols-2 gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={channel === c.value}
                onClick={() => setChannel(c.value)}
                className={[
                  'rounded-2xl border px-3 py-3 text-left transition-colors',
                  channel === c.value
                    ? 'border-sky bg-sky text-charcoal'
                    : 'border-line bg-navy-deep text-ink-soft',
                ].join(' ')}
              >
                <span className="block font-display text-[15px] font-semibold leading-tight">
                  {c.short}
                </span>
                <span
                  className={[
                    'mt-0.5 block text-[11px] leading-tight',
                    channel === c.value ? 'text-charcoal/70' : 'text-ink-faint',
                  ].join(' ')}
                >
                  {c.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {!isExpense && (
          <>
            <div>
              <span className="label">Payment</span>
              <Segmented
                size="sm"
                label="Payment status"
                value={paymentStatus}
                onChange={setPaymentStatus}
                options={PAYMENT_STATUSES.map((p) => ({ value: p.value, label: p.label }))}
              />
            </div>

            {paymentStatus === 'partial' && (
              <div>
                <label className="label" htmlFor="paid">
                  Amount paid so far
                </label>
                <input
                  id="paid"
                  className="field field-num"
                  inputMode="decimal"
                  placeholder="₱"
                  value={paidText}
                  onChange={(e) => setPaidText(e.target.value)}
                />
                {amount && amountPaid ? (
                  <p className="mt-1.5 text-[13px] text-held">
                    {peso(Math.max(0, amount - amountPaid))} still owed
                  </p>
                ) : null}
              </div>
            )}

            {straightToOwner ? (
              <p className="rounded-2xl border border-sky/30 bg-sky/10 px-4 py-3 text-[14px] text-sky">
                GCash 4 is Boboy's own account, so this counts as sales but never needs
                releasing — it's already with the owner.
              </p>
            ) : (
            <div>
              <span className="label">Released</span>
              <div className="flex flex-wrap gap-2">
                {RELEASE_STATUSES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={releaseStatus === r.value}
                    className={`chip ${releaseStatus === r.value ? 'chip-on' : ''}`}
                    onClick={() => setReleaseStatus(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            )}

            {!straightToOwner && releaseStatus !== 'not_released' && (
              <div>
                <label className="label" htmlFor="released-to">
                  Released to
                </label>
                <div className="flex gap-2">
                  <input
                    id="released-to"
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
            )}

            <label className="flex items-start gap-2.5 text-[15px] text-ink-soft">
              <input
                type="checkbox"
                checked={isFloating}
                onChange={(e) => setIsFloating(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#EFC94C]"
              />
              <span>
                Rebooked — money held as credit for a future slot
                <span className="mt-0.5 block text-[13px] text-ink-faint">
                  Still counts as money the court is holding.
                </span>
              </span>
            </label>

            <div>
              <label className="label" htmlFor="collected-by">
                Collected by{' '}
                <span className="font-normal normal-case tracking-normal">(if not you)</span>
              </label>
              <input
                id="collected-by"
                className="field"
                placeholder="Staff name"
                value={collectedBy}
                onChange={(e) => setCollectedBy(e.target.value)}
                maxLength={40}
              />
            </div>

            <div>
              <label className="label" htmlFor="customer">
                Customer <span className="font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="customer"
                className="field"
                placeholder="Name, group, or walk-in"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                maxLength={80}
              />
            </div>
          </>
        )}

        <div>
          <label className="label" htmlFor="note">
            Note <span className="font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="note"
            className="field"
            placeholder={isExpense ? 'Supplier or what it was for' : 'Court 1, anything worth knowing'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={160}
          />
        </div>
      </section>

      <button type="submit" className="btn-primary" disabled={Boolean(problem) || saving}>
        {saving
          ? 'Saving…'
          : problem
            ? problem
            : `Save ${isExpense ? 'expense' : ''} ${peso(amount ?? 0)}`.replace('  ', ' ')}
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
