/**
 * Everything date-shaped in this app is Manila local time (UTC+8).
 * The court's business day is a Manila day, so "today", the daily rollups and
 * the peak-hour rule all read from here — never from `new Date().getDate()`,
 * which would be the phone's timezone or UTC.
 */

export const MANILA = 'Asia/Manila'

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

interface ManilaParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function partsOf(d: Date): ManilaParts {
  const map: Record<string, string> = {}
  for (const p of partsFormatter.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Intl can emit "24" for midnight in some engines; fold it back to 0.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Today in Manila, as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  const p = partsOf(now)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** The current Manila wall-clock time, as HH:MM. */
export function manilaTimeNow(now: Date = new Date()): string {
  const p = partsOf(now)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** Hour 0–23 from an HH:MM string, or null if it isn't a usable time. */
export function hourOf(time: string | null | undefined): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!m) return null
  const h = Number(m[1])
  return h >= 0 && h <= 23 ? h : null
}

/** Add days to a YYYY-MM-DD string without touching timezones. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function startOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

export function endOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${pad(m)}-${pad(last)}`
}

export function previousMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`
}

const dayFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const dayWithYearFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** "Thu, 14 Aug" — or with the year when it isn't the current one. */
export function formatDate(dateStr: string, today: string = manilaToday()): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const asUtc = new Date(Date.UTC(y, m - 1, d))
  const fmt = dateStr.slice(0, 4) === today.slice(0, 4) ? dayFormatter : dayWithYearFormatter
  return fmt.format(asUtc)
}

/** "Today", "Yesterday", or the formatted date. */
export function formatDayHeading(dateStr: string, today: string = manilaToday()): string {
  if (dateStr === today) return 'Today'
  if (dateStr === addDays(today, -1)) return 'Yesterday'
  return formatDate(dateStr, today)
}

/** "5:30PM" from "17:30". */
export function formatTime(time: string | null): string {
  const h = hourOf(time)
  if (h === null || !time) return ''
  const minute = time.slice(3, 5)
  const suffix = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}:${minute}${suffix}`
}

export const monthName = (dateStr: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, 1)),
  )

// ---------------------------------------------------------------------------
// Week boundaries and weekday labels
// ---------------------------------------------------------------------------

/**
 * Monday-start weeks. The court's takings are read as a business week, and a
 * Sunday-start week would split a Friday–Saturday evening rush across two
 * periods.
 */
export function startOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = (dt.getUTCDay() + 6) % 7 // Monday = 0
  return addDays(dateStr, -dow)
}

export function endOfWeek(dateStr: string): string {
  return addDays(startOfWeek(dateStr), 6)
}

const weekdayFormatter = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', weekday: 'long' })
const weekdayShortFormatter = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', weekday: 'short' })

/**
 * The sheet had a Day column typed by hand. Here it is derived, so it can
 * never disagree with the date.
 */
export function weekday(dateStr: string, short = false): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const asUtc = new Date(Date.UTC(y, m - 1, d))
  return (short ? weekdayShortFormatter : weekdayFormatter).format(asUtc)
}

/**
 * Hours between two HH:MM times, to two decimals. An end time at or before the
 * start is read as running past midnight — the court books blocks that end at
 * 12MN and beyond.
 */
export function hoursBetween(start: string | null, end: string | null): number | null {
  const a = minutesOf(start)
  const b = minutesOf(end)
  if (a === null || b === null) return null
  const span = b > a ? b - a : b + 24 * 60 - a
  if (span <= 0 || span > 18 * 60) return null
  return Math.round((span / 60) * 100) / 100
}

function minutesOf(time: string | null): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}
