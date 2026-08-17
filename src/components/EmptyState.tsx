import { Link } from 'react-router-dom'
import { CourtLines } from './CourtLines'

export function EmptyState({
  title,
  body,
  actionLabel = 'Log the first entry',
  actionTo = '/log',
}: {
  title: string
  body: string
  actionLabel?: string
  actionTo?: string | null
}) {
  return (
    <div className="card relative overflow-hidden px-6 py-10 text-center">
      <CourtLines className="absolute inset-0 h-full w-full text-sky opacity-[0.07]" />
      <div className="relative">
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        <p className="mx-auto mt-2 max-w-[30ch] text-[15px] leading-relaxed text-ink-soft">{body}</p>
        {actionTo && (
          <Link
            to={actionTo}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-orange px-5 py-3 font-display text-[15px] font-bold text-charcoal"
          >
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  )
}
