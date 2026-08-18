import { useId, useState } from 'react'

/**
 * The Pikol sa Paayo badge.
 *
 * If `public/logo.png` exists it is used — drop the real artwork in and every
 * logo in the app picks it up, no code change. Export it with a transparent
 * background; the badge sits on navy and a white square would show. Until then
 * these drawn stand-ins render: a plain mark for small sizes, and the fuller
 * badge with its ring text for the sign-in screen.
 */
const LOGO_SRC = '/logo.png'

/** The compact mark: court, net, ball. No lettering — it would be mud at 36px. */
export function Logo({ size = 44, className = '' }: { size?: number; className?: string }) {
  const [useDrawn, setUseDrawn] = useState(false)

  if (!useDrawn) {
    return (
      <img
        src={LOGO_SRC}
        width={size}
        height={size}
        alt="Pikol sa Paayo"
        className={`${className} object-contain`}
        onError={() => setUseDrawn(true)}
      />
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Pikol sa Paayo"
    >
      <circle cx="50" cy="50" r="48" fill="#0B2942" stroke="#55B8E8" strokeWidth="3.5" />
      <circle cx="50" cy="50" r="41" fill="none" stroke="#55B8E8" strokeWidth="1" opacity="0.4" />

      {/* Court in perspective: baseline nearest the viewer, net across it. */}
      <g stroke="#55B8E8" strokeWidth="1.6" fill="none" opacity="0.85">
        <path d="M26 74 L38 44 L62 44 L74 74 Z" />
        <path d="M32 59 L68 59" />
        <path d="M50 44 L50 74" opacity="0.55" />
      </g>
      <path d="M33 52 L67 52" stroke="#EAF6FF" strokeWidth="2" opacity="0.9" />

      {/* The swoosh the ball is travelling on — the badge's one flash of motion. */}
      <path
        d="M22 74 C34 70 40 64 52 62"
        stroke="#F58220"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      <circle cx="50" cy="63" r="13" fill="#F58220" />
      <g fill="#0B2942">
        <circle cx="45" cy="58" r="1.9" />
        <circle cx="54.5" cy="57.5" r="1.9" />
        <circle cx="50" cy="63.5" r="1.9" />
        <circle cx="44.5" cy="68" r="1.9" />
        <circle cx="55" cy="68" r="1.9" />
      </g>
    </svg>
  )
}

/** The fuller badge, for the sign-in screen where there is room to read it. */
export function LogoBadge({ size = 148 }: { size?: number }) {
  const [useDrawn, setUseDrawn] = useState(false)
  const id = useId().replace(/:/g, '')

  if (!useDrawn) {
    return (
      <img
        src={LOGO_SRC}
        width={size}
        height={size}
        alt="Pikol sa Paayo — Pickleball Court"
        className="object-contain"
        onError={() => setUseDrawn(true)}
      />
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Pikol sa Paayo — Pickleball Court"
    >
      <defs>
        <path id={`${id}-top`} d="M100,100 m-74,0 a74,74 0 0,1 148,0" fill="none" />
        <path id={`${id}-bottom`} d="M100,100 m-72,0 a72,72 0 0,0 144,0" fill="none" />
      </defs>

      <circle cx="100" cy="100" r="98" fill="#17191C" />
      <circle cx="100" cy="100" r="93" fill="none" stroke="#55B8E8" strokeWidth="6" />
      <circle cx="100" cy="100" r="86" fill="#0B2942" />
      <circle cx="100" cy="100" r="66" fill="none" stroke="#55B8E8" strokeWidth="1.2" opacity="0.5" />

      {/* Ring text, set in the app's display face rather than the badge's script. */}
      <text
        fill="#FFFFFF"
        fontFamily='"Space Grotesk", sans-serif'
        fontSize="15"
        fontWeight="700"
        letterSpacing="2.4"
      >
        {/* textLength pins the arc text to a fixed width, so it can never
            overrun the ring if the display face hasn't loaded yet. */}
        <textPath
          href={`#${id}-top`}
          startOffset="50%"
          textAnchor="middle"
          textLength="180"
          lengthAdjust="spacingAndGlyphs"
        >
          PIKOL SA PAAYO
        </textPath>
      </text>
      <text
        fill="#55B8E8"
        fontFamily='"Space Grotesk", sans-serif'
        fontSize="10.5"
        fontWeight="600"
        letterSpacing="1.8"
      >
        <textPath
          href={`#${id}-bottom`}
          startOffset="50%"
          textAnchor="middle"
          textLength="150"
          lengthAdjust="spacingAndGlyphs"
        >
          PICKLEBALL COURT
        </textPath>
      </text>

      {/* The two orange pips that break the ring text on the badge. */}
      <circle cx="21" cy="108" r="3" fill="#F58220" />
      <circle cx="179" cy="108" r="3" fill="#F58220" />

      <g stroke="#55B8E8" strokeWidth="2" fill="none" opacity="0.85">
        <path d="M56 140 L78 84 L122 84 L144 140 Z" />
        <path d="M67 112 L133 112" />
        <path d="M100 84 L100 140" opacity="0.5" />
      </g>
      <path d="M68 100 L132 100" stroke="#EAF6FF" strokeWidth="2.5" opacity="0.9" />

      <path
        d="M44 142 C68 136 78 124 100 120"
        stroke="#F58220"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      <circle cx="104" cy="122" r="23" fill="#F58220" />
      <g fill="#0B2942">
        <circle cx="95" cy="113" r="3.2" />
        <circle cx="112" cy="112" r="3.2" />
        <circle cx="104" cy="123" r="3.2" />
        <circle cx="94" cy="131" r="3.2" />
        <circle cx="113" cy="130" r="3.2" />
      </g>
    </svg>
  )
}

/**
 * The mark plus the name, for the app header. The badge already carries
 * "PICKLEBALL COURT" in its ring, so the compact form doesn't repeat it —
 * one line of type beside the mark, and nothing said twice.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={compact ? 40 : 56} />
      <div>
        <p
          className={[
            'font-display font-bold uppercase leading-none tracking-[0.1em] text-ink',
            compact ? 'text-[14px]' : 'text-[15px]',
          ].join(' ')}
        >
          Pikol sa <span className="text-orange">Paayo</span>
        </p>
        {!compact && (
          <p className="mt-1 font-display text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-sky">
            Pickleball Court
          </p>
        )}
      </div>
    </div>
  )
}
