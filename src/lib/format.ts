/** Philippine peso, en-PH, thousands separators, decimals only when they exist. */

const whole = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const withCents = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** ₱2,225 — or ₱2,225.50 when the centavos matter. */
export function peso(amount: number): string {
  if (!Number.isFinite(amount)) return '₱0'
  const rounded = Math.round(amount * 100) / 100
  return Number.isInteger(rounded) ? whole.format(rounded) : withCents.format(rounded)
}

/** Same, but a leading − for negatives instead of the locale's parentheses. */
export function pesoSigned(amount: number): string {
  return amount < 0 ? `−${peso(Math.abs(amount))}` : peso(amount)
}

const plainNumber = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })

export const number = (n: number) => plainNumber.format(n)

/** "3 hrs", "1 hr", "1.5 hrs" */
export const hours = (n: number) => `${plainNumber.format(n)} ${n === 1 ? 'hr' : 'hrs'}`

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${plainNumber.format(n)} ${n === 1 ? one : many}`
