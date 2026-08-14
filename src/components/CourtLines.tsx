/**
 * The signature element: a pickleball court seen from above, drawn faintly
 * behind the balance card — outer box, net line down the middle, and the
 * non-volley "kitchen" band either side of it. Decorative only.
 *
 * It stretches to fill whatever card it sits behind rather than cropping:
 * every line is axis-aligned, so stretching still reads as a court where a
 * crop would leave a meaningless grid. `vectorEffect` keeps the strokes an
 * even weight however far it is stretched.
 */
const line = { vectorEffect: 'non-scaling-stroke' } as const

export function CourtLines({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 160"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth="1.5" opacity="0.55">
        {/* Sidelines and baselines */}
        <rect x="10" y="10" width="300" height="140" style={line} />
        {/* Net */}
        <line x1="160" y1="6" x2="160" y2="154" strokeWidth="2.5" style={line} />
        {/* Kitchen — the non-volley zone on each side of the net */}
        <line x1="118" y1="10" x2="118" y2="150" style={line} />
        <line x1="202" y1="10" x2="202" y2="150" style={line} />
        {/* Service courts */}
        <line x1="10" y1="80" x2="118" y2="80" style={line} />
        <line x1="202" y1="80" x2="310" y2="80" style={line} />
      </g>
    </svg>
  )
}
