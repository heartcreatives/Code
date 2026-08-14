import type { NewEntry } from './types'

/**
 * Entries saved while the phone is offline (or while Supabase is unreachable)
 * live here, on disk, until they land. Nothing is ever dropped silently: an
 * item is either sent, still queued, or visibly marked as failed with a reason.
 */
export interface OutboxItem {
  id: string
  entry: NewEntry
  queued_at: string
  attempts: number
  /** Set only for errors that retrying will not fix (validation, RLS). */
  error?: string
}

const KEY = 'paayo.outbox.v1'
const listeners = new Set<() => void>()

export function readOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as OutboxItem[]) : []
  } catch {
    return []
  }
}

function write(items: OutboxItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
  listeners.forEach((fn) => fn())
}

export function onOutboxChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function enqueue(entry: NewEntry): OutboxItem {
  const item: OutboxItem = {
    id: `queued-${crypto.randomUUID()}`,
    entry,
    queued_at: new Date().toISOString(),
    attempts: 0,
  }
  write([...readOutbox(), item])
  return item
}

export function dequeue(id: string) {
  write(readOutbox().filter((i) => i.id !== id))
}

export function markFailed(id: string, error: string) {
  write(readOutbox().map((i) => (i.id === id ? { ...i, error, attempts: i.attempts + 1 } : i)))
}

export function markAttempted(id: string) {
  write(readOutbox().map((i) => (i.id === id ? { ...i, attempts: i.attempts + 1 } : i)))
}

export function clearFailed(id: string) {
  write(readOutbox().map((i) => (i.id === id ? { ...i, error: undefined } : i)))
}

/**
 * A dropped connection, a DNS failure, a 5xx — worth retrying. A constraint
 * violation or a policy rejection is not, and should be shown to the user.
 */
export function isRetryable(err: unknown): boolean {
  if (!navigator.onLine) return true
  const e = err as { message?: string; code?: string; status?: number }
  const message = (e?.message ?? '').toLowerCase()
  if (e?.status && e.status >= 500) return true
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('load failed')
  )
}
