import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { useLedger } from '../state/LedgerContext'
import { parseCsv } from '../lib/csv'
import {
  IMPORT_FIELDS,
  guessMapping,
  prepareRows,
  type FieldKey,
  type Mapping,
  type PreparedRow,
} from '../lib/importer'
import { peso, plural } from '../lib/format'
import { KIND_LABEL, CHANNEL_LABEL } from '../lib/types'

type Stage = 'pick' | 'map' | 'done'

/**
 * One-time import of the court's existing spreadsheet.
 *
 * Three steps on purpose — choose the file, check the column mapping, then
 * review what the parser was unsure about. Nothing is written until the last
 * button, and rows the parser flagged are shown before that, not after.
 */
export function Import() {
  const { importEntries, settings } = useLedger()
  const toast = useToast()
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>('pick')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [skipFlagged, setSkipFlagged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState(0)

  const prepared = useMemo<PreparedRow[]>(
    () => (mapping ? prepareRows(dataRows, mapping, settings) : []),
    [dataRows, mapping, settings],
  )

  const flagged = prepared.filter((r) => r.issues.length > 0)
  const importable = prepared.filter((r) => r.entry.occurred_on && r.entry.amount > 0)
  const toImport = skipFlagged ? importable.filter((r) => r.issues.length === 0) : importable
  const total = toImport.reduce((sum, r) => sum + r.entry.amount, 0)

  async function onFile(file: File) {
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) {
      toast('That file has no rows under its header.', 'error')
      return
    }
    setFileName(file.name)
    setHeaders(rows[0])
    setDataRows(rows.slice(1))
    setMapping(guessMapping(rows[0]))
    setStage('map')
  }

  async function runImport() {
    if (busy || toImport.length === 0) return
    setBusy(true)
    try {
      const count = await importEntries(toImport.map((r) => r.entry))
      setImported(count)
      setStage('done')
    } catch (err) {
      toast(`Import failed: ${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="pt-1">
        <h1 className="font-display text-2xl font-bold text-white">Import the spreadsheet</h1>
        <p className="mt-1 text-[15px] text-ink-soft">
          Export the Log tab as CSV, then check the columns line up before anything is written.
        </p>
      </header>

      {stage === 'pick' && (
        <section className="card p-5">
          <label className="label" htmlFor="csv">
            Choose the CSV
          </label>
          <input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            className="field"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFile(file)
            }}
          />
          <p className="mt-3 text-[13px] leading-relaxed text-ink-faint">
            In Google Sheets: File → Download → Comma-separated values. Nothing is saved until
            you press Import at the end.
          </p>
        </section>
      )}

      {stage === 'map' && mapping && (
        <>
          <section className="card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[17px] font-bold text-ink">Match the columns</h2>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => {
                  setStage('pick')
                  setMapping(null)
                }}
              >
                Change file
              </button>
            </div>
            <p className="mt-0.5 text-[13px] text-ink-faint">
              {fileName} · {plural(dataRows.length, 'row')}
            </p>

            <div className="mt-4 space-y-3">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-[14px] text-ink-soft">
                    {f.label}
                    {f.required && <span className="text-orange"> *</span>}
                  </span>
                  <select
                    className="field flex-1"
                    value={mapping[f.key]}
                    aria-label={`Column for ${f.label}`}
                    onChange={(e) =>
                      setMapping({ ...mapping, [f.key as FieldKey]: Number(e.target.value) })
                    }
                  >
                    <option value={-1}>Not in this file</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="font-display text-[17px] font-bold text-ink">Preview</h2>
            <p className="mt-0.5 text-[13px] text-ink-faint">
              The first few rows as they will be saved.
            </p>
            <div className="mt-3 space-y-2">
              {prepared.slice(0, 5).map((r) => (
                <div key={r.rowNumber} className="rounded-xl border border-line bg-navy-deep p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] text-ink">
                      {r.entry.occurred_on || '— no date —'} · {KIND_LABEL[r.entry.kind]}
                    </span>
                    <span className="num text-[15px] font-semibold text-sky">
                      {peso(r.entry.amount)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-faint">
                    {r.entry.customer || 'no customer'} · {CHANNEL_LABEL[r.entry.channel]}
                  </p>
                  {r.issues.map((issue) => (
                    <p key={issue} className="mt-1 text-[13px] font-semibold text-held">
                      {issue}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {flagged.length > 0 && (
            <section className="card border-held/40 p-4">
              <h2 className="font-display text-[17px] font-bold text-held">
                {plural(flagged.length, 'row')} to look at
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                These were imported with a best guess rather than a certainty — most often a note
                that says "GCash" without saying which account. Import them and fix in History, or
                skip them and add them by hand.
              </p>
              <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto text-[13px] text-ink-faint">
                {flagged.slice(0, 30).map((r) => (
                  <li key={r.rowNumber}>
                    <span className="text-ink">Row {r.rowNumber}</span> — {r.issues.join('; ')}
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-center gap-2.5 text-[15px] text-ink-soft">
                <input
                  type="checkbox"
                  checked={skipFlagged}
                  onChange={(e) => setSkipFlagged(e.target.checked)}
                  className="h-5 w-5 accent-[#EFC94C]"
                />
                Skip these rows
              </label>
            </section>
          )}

          <button
            type="button"
            className="btn-primary"
            disabled={busy || toImport.length === 0}
            onClick={runImport}
          >
            {busy
              ? 'Importing…'
              : toImport.length === 0
                ? 'Nothing to import — check the Date and Amount columns'
                : `Import ${plural(toImport.length, 'row')} · ${peso(total)}`}
          </button>
        </>
      )}

      {stage === 'done' && (
        <section className="card p-5 text-center">
          <h2 className="font-display text-xl font-bold text-ink">
            {plural(imported, 'row')} imported
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            They're in the ledger now and on everyone else's phone. Anything that came in with a
            guess is worth a look in History.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button type="button" className="btn-quiet flex-1" onClick={() => setStage('pick')}>
              Import another
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => navigate('/history')}>
              Go to History
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
