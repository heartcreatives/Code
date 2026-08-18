/**
 * Pikol sa Paayo — brand tokens.
 *
 * Balance the logo asks for: ~60% charcoal + navy, ~25% light sky blue,
 * ~10% orange, ~5% white. Orange is the signature: it is spent only on the
 * primary action and the one figure that matters on a screen.
 *
 * Kept in TS as well as Tailwind because the charts need real hex values.
 */
export const BRAND = {
  charcoal: '#17191C',
  navy: '#0B2942',
  navyDeep: '#081F33',
  sky: '#55B8E8',
  orange: '#F58220',
  white: '#FFFFFF',
  /**
   * Money out. Not from the logo palette — the brand has no "negative"
   * colour, and plain red sits only ΔE 12 from Paayo orange, which is too
   * close to tell apart at a glance. This rose-red clears every pair.
   */
  spend: '#E5486B',
  /**
   * Money owed to us, or collected but not yet handed over. Warm so it reads
   * as "needs attention" rather than "error", and yellow enough to stay clear
   * of the orange primary action beside it.
   */
  held: '#EFC94C',
} as const

/** Money in reads sky blue; money out reads rose. Never colour alone — every
 *  figure is labelled and expenses carry a − sign as well. */
export const CHART = {
  moneyIn: BRAND.sky,
  revenue: BRAND.orange,
  expense: BRAND.spend,
  held: BRAND.held,
} as const
