interface Option<T extends string> {
  value: T
  label: string
  sub?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  size?: 'md' | 'sm'
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1.5 rounded-2xl border border-paper-edge bg-paper-soft p-1.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={[
              'rounded-xl text-center transition-colors',
              size === 'md' ? 'px-2 py-3' : 'px-2 py-2',
              active
                ? 'bg-court text-paper shadow-card'
                : 'bg-transparent text-ink-soft active:bg-white',
            ].join(' ')}
          >
            <span className="block font-display text-[15px] font-semibold leading-tight">
              {opt.label}
            </span>
            {opt.sub && (
              <span
                className={[
                  'mt-0.5 block text-[11px] leading-tight',
                  active ? 'text-paper/70' : 'text-ink-faint',
                ].join(' ')}
              >
                {opt.sub}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
