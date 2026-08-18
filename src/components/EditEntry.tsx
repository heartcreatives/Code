import { useEffect, useState } from 'react'
import { useLedger, type LedgerRow } from '../state/LedgerContext'
import { useToast } from './Toast'
import { peso } from '../lib/format'
import { weekday } from '../lib/time'
import {
  CHANNELS,
  PAYMENT_STATUSES,
  RELEASE_RECIPIENTS,
  RELEASE_STATUSES,
  type Channel,
  type PaymentStatus,
  type ReleaseStatus,
} from '../lib/types'

/**
 * Correcting an entry after the fact. Deliberately narrower than the Log
 * screen: the fields staff actually get wrong are the amount, who paid, and
 * whether the money has been handed over.
 */
export function EditEntry({ row, onClose }: { row: LedgerRow; onClose: () => void }) {
  const { updateEntry } = useLedger()
  const toast = useToast()
  const [amountText, setAmountText] = useState(String(row.amount))
  const [channel, setChannel] = useState<Channel>(row.channel)
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(row.payment_status)
  const [paidText, setPaidText] = useState(row.amount_paid ? String(row.amount_paid) : '')
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus>(row.release_status)
  const [releasedTo, setReleasedTo] = useState(row.released_to ?? '')
  const [customer, setCustomer] = useState(row.customer ?? '')
  const [note, setNote] = useState(row.note ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const amount = toNumber(amountText)
  const amountPaid = toNumber(paidText)
  const problem =
    !amount || amount <= 0
      ? 'Enter an amount.'
      : paymentStatus === 'partial' && (!amountPaid || amountPaid <= 0)
        ? 'Enter how much was paid.'
        : paymentStatus === 'partial' && amountPaid && amountPaid >= amount
          ? 'Partial payment must be less than the amount.'
          : null

  async function save() {
    if (problem || saving) return
    setSaving(true)
    try {
      await updateEntry(row.id, {
        amount: amount!,
        // Any hand-edited amount is an override, same as on the Log screen.
        amount_overridden: amount !== row.amount ? true : row.amount_overridden,
        channel,
        payment_status: paymentStatus,
        amount_paid: paymentStatus === 'partial' ? amountPaid : null,
        release_status: releaseStatus,
        released_to: releasedTo.trim() || null,
        released_on:
          releaseStatus === 'released' || releaseStatus === 'released_via_cash'
            ? (row.released_on ?? row.occurred_on)
            : null,
        customer: customer.trim() || null,
        note: note.trim() || null,
      })
      toast('Entry updated')
      onClose()
    } catch (err) {
      toast(`Couldn't update: ${(err as Error).message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit entry"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md animate-rise-in overflow-y-auto rounded-t-card border border-line bg-navy p-5 shadow-card sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4">
          <h2 className="font-display text-lg font-bold text-ink">Edit entry</h2>
          <p className="mt-0.5 text-[13px] text-ink-faint">
            {row.occurred_on} · {weekday(row.occurred_on)}
          </p>
        </header>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="edit-amount">
              Amount
            </label>
            <input
              id="edit-amount"
              className="field field-num"
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
          </div>

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
                    'rounded-xl border px-3 py-2.5 text-left text-[14px] font-semibold',
                    channel === c.value
                      ? 'border-sky bg-sky text-charcoal'
                      : 'border-line bg-navy-deep text-ink-soft',
                  ].join(' ')}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {row.kind !== 'expense' && (
            <>
              <div>
                <span className="label">Payment</span>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_STATUSES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      aria-pressed={paymentStatus === p.value}
                      className={`chip ${paymentStatus === p.value ? 'chip-on' : ''}`}
                      onClick={() => setPaymentStatus(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentStatus === 'partial' && (
                <div>
                  <label className="label" htmlFor="edit-paid">
                    Amount paid so far
                  </label>
                  <input
                    id="edit-paid"
                    className="field field-num"
                    inputMode="decimal"
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

              {releaseStatus !== 'not_released' && (
                <div>
                  <label className="label" htmlFor="edit-released-to">
                    Released to
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="edit-released-to"
                      className="field"
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

              <div>
                <label className="label" htmlFor="edit-customer">
                  Customer
                </label>
                <input
                  id="edit-customer"
                  className="field"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <label className="label" htmlFor="edit-note">
              Note
            </label>
            <input
              id="edit-note"
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-line bg-navy-deep py-3.5 font-semibold text-ink-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={Boolean(problem) || saving}
            className="btn-primary flex-1"
          >
            {saving ? 'Saving…' : problem ? problem : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function toNumber(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
