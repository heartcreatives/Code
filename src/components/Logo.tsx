/**
 * A roundel drawn from the Pikol sa Paayo badge: navy court, sky rim and
 * court lines, orange ball. Simplified deliberately — at 40px in a header the
 * full badge's lettering would be mud, so the mark carries the identity and
 * the wordmark sits beside it as live text.
 *
 * The full artwork lives in the brand files; drop it in as `public/logo.png`
 * if you want the original on the sign-in screen.
 */
export function Logo({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Pikol sa Paayo"
    >
      <circle cx="50" cy="50" r="48" fill="#0B2942" stroke="#55B8E8" strokeWidth="3" />
      <circle cx="50" cy="50" r="41" fill="none" stroke="#55B8E8" strokeWidth="1" opacity="0.45" />

      {/* The court, in perspective: baseline nearest, net across the middle. */}
      <g stroke="#55B8E8" strokeWidth="1.6" fill="none" opacity="0.85">
        <path d="M26 74 L38 44 L62 44 L74 74 Z" />
        <path d="M32 59 L68 59" />
        <path d="M50 44 L50 74" opacity="0.6" />
      </g>
      {/* Net posts and tape */}
      <g stroke="#EAF6FF" strokeWidth="2" opacity="0.9">
        <path d="M33 52 L67 52" />
      </g>

      {/* The ball — the signature orange, and the only warm mark on the badge. */}
      <g>
        <circle cx="50" cy="63" r="13" fill="#F58220" />
        <g fill="#0B2942">
          <circle cx="45" cy="58" r="1.9" />
          <circle cx="54.5" cy="57.5" r="1.9" />
          <circle cx="50" cy="63.5" r="1.9" />
          <circle cx="44.5" cy="68" r="1.9" />
          <circle cx="55" cy="68" r="1.9" />
        </g>
      </g>
    </svg>
  )
}

/** The roundel plus the name, for the sign-in screen and the app header. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={compact ? 36 : 56} />
      <div>
        <p
          className={[
            'font-display font-bold uppercase leading-none tracking-[0.1em] text-ink',
            compact ? 'text-[13px]' : 'text-[15px]',
          ].join(' ')}
        >
          Pikol sa <span className="text-orange">Paayo</span>
        </p>
        <p
          className={[
            'mt-1 font-display font-semibold uppercase leading-none tracking-[0.18em] text-sky',
            compact ? 'text-[9px]' : 'text-[10px]',
          ].join(' ')}
        >
          Pickleball Court
        </p>
      </div>
    </div>
  )
}
