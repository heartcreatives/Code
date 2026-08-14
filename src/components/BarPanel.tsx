import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { peso } from '../lib/format'

export interface BarDatum {
  label: string
  value: number
  /** Optional second line under the label, e.g. "3 bookings". */
  meta?: string
}

/**
 * One measure across a handful of named buckets. Deliberately a single series
 * per chart: money-in and expense colours are brand-fixed and too close to
 * work as a categorical set, so identity comes from the axis label beside each
 * bar, not from hue. Values are labelled at the tip, so no x-axis is needed.
 */
export function BarPanel({
  title,
  subtitle,
  data,
  color,
  emptyText,
}: {
  title: string
  subtitle?: string
  data: BarDatum[]
  color: string
  emptyText: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const rows = data.filter((d) => d.value > 0)

  return (
    <section className="card p-4">
      <header className="mb-3">
        <h2 className="font-display text-[17px] font-bold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-faint">{subtitle}</p>}
      </header>

      {total <= 0 || rows.length === 0 ? (
        <p className="py-4 text-[15px] text-ink-faint">{emptyText}</p>
      ) : (
        <>
          <div
            style={{ height: rows.length * 44 + 8 }}
            role="img"
            aria-label={`${title}. ${rows.map((d) => `${d.label} ${peso(d.value)}`).join(', ')}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 0, right: 84, bottom: 0, left: 0 }}
                barCategoryGap={10}
              >
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={92}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#4A5B57', fontSize: 13, fontWeight: 500 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(14,75,69,0.06)' }}
                  formatter={(v: number) => [peso(v), '']}
                  separator=""
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #DAE2D6',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#12211F',
                  }}
                />
                <Bar dataKey="value" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {rows.map((d) => (
                    <Cell key={d.label} fill={color} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    offset={10}
                    formatter={(v: number) => peso(v)}
                    style={{
                      fill: '#12211F',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: '"Space Grotesk", sans-serif',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* The same numbers as text, for screen readers and for anyone who
              wants the share rather than the bar length. */}
          <table className="sr-only">
            <caption>{title}</caption>
            <tbody>
              {rows.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td>{peso(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="mt-3 space-y-1 border-t border-paper-edge pt-3 text-[13px] text-ink-faint">
            {rows.map((d) => (
              <li key={d.label} className="flex justify-between gap-3">
                <span>
                  {d.label}
                  {d.meta ? ` · ${d.meta}` : ''}
                </span>
                <span className="num font-semibold text-ink-soft">
                  {Math.round((d.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
