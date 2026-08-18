import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { store, sortEntries } from '../lib/store'
import { DEFAULT_SETTINGS } from '../lib/pricing'
import {
  clearFailed,
  dequeue,
  enqueue,
  isRetryable,
  markAttempted,
  markFailed,
  onOutboxChange,
  readOutbox,
  type OutboxItem,
} from '../lib/outbox'
import { useAuth } from './AuthContext'
import type { Entry, NewEntry, Settings } from '../lib/types'

/** A ledger row as the UI sees it: saved, still queued, or failed to save. */
export type LedgerRow = Entry & { pending?: boolean; failed?: string }

interface LedgerValue {
  rows: LedgerRow[]
  settings: Settings
  loading: boolean
  error: string | null
  online: boolean
  queuedCount: number
  addEntry(entry: NewEntry): Promise<{ queued: boolean }>
  updateEntry(id: string, patch: Partial<NewEntry>): Promise<void>
  /** Mark several entries released at once — the Owed screen's main action. */
  releaseEntries(ids: string[], releasedTo: string, releasedOn: string, viaCash: boolean): Promise<void>
  importEntries(entries: NewEntry[]): Promise<number>
  removeEntry(row: LedgerRow): Promise<void>
  retry(id: string): void
  refresh(): Promise<void>
}

const LedgerContext = createContext<LedgerValue | null>(null)

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { userId, access } = useAuth()
  const [saved, setSaved] = useState<Entry[]>([])
  const [outbox, setOutbox] = useState<OutboxItem[]>(() => readOutbox())
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const flushing = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const list = await store.list()
      setSaved(list)
      setError(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + live updates from other phones.
  useEffect(() => {
    if (access !== 'allowed') return
    void refresh()
    store
      .settings()
      .then(setSettings)
      .catch(() => setSettings(DEFAULT_SETTINGS))
    return store.subscribe(() => {
      void refresh()
    })
  }, [access, refresh])

  useEffect(() => onOutboxChange(() => setOutbox(readOutbox())), [])

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return
    const queue = readOutbox().filter((i) => !i.error)
    if (queue.length === 0) return
    flushing.current = true
    try {
      for (const item of queue) {
        try {
          markAttempted(item.id)
          await store.insert(item.entry, userId)
          dequeue(item.id)
        } catch (err) {
          if (isRetryable(err)) break // still offline — try the rest later
          markFailed(item.id, messageOf(err))
        }
      }
      await refresh()
    } finally {
      flushing.current = false
    }
  }, [userId, refresh])

  // Retry when the connection comes back, and periodically while anything waits.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      void flush()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    void flush()
    const timer = window.setInterval(() => void flush(), 20000)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.clearInterval(timer)
    }
  }, [flush])

  const addEntry = useCallback<LedgerValue['addEntry']>(
    async (entry) => {
      // Straight to the outbox first, so a crash or a dead connection between
      // tap and response can never lose the entry.
      const item = enqueue(entry)
      if (!navigator.onLine) return { queued: true }
      try {
        await store.insert(entry, userId)
        dequeue(item.id)
        await refresh()
        return { queued: false }
      } catch (err) {
        if (isRetryable(err)) return { queued: true }
        markFailed(item.id, messageOf(err))
        throw err
      }
    },
    [userId, refresh],
  )

  const updateEntry = useCallback<LedgerValue['updateEntry']>(
    async (id, patch) => {
      // Optimistic: show the change now, put it back if the write is refused.
      const snapshot = saved
      setSaved((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
      try {
        await store.update(id, patch)
        await refresh()
      } catch (err) {
        setSaved(snapshot)
        throw err
      }
    },
    [saved, refresh],
  )

  const releaseEntries = useCallback<LedgerValue['releaseEntries']>(
    async (ids, releasedTo, releasedOn, viaCash) => {
      if (ids.length === 0) return
      const patch = {
        release_status: (viaCash ? 'released_via_cash' : 'released') as NewEntry['release_status'],
        released_to: releasedTo.trim() || null,
        released_on: releasedOn,
      }
      const marked = new Set(ids)
      const snapshot = saved
      setSaved((prev) => prev.map((e) => (marked.has(e.id) ? { ...e, ...patch } : e)))
      try {
        await store.updateMany(ids, patch)
        await refresh()
      } catch (err) {
        setSaved(snapshot)
        throw err
      }
    },
    [saved, refresh],
  )

  const importEntries = useCallback<LedgerValue['importEntries']>(
    async (entries) => {
      const inserted = await store.insertMany(entries, userId)
      await refresh()
      return inserted
    },
    [userId, refresh],
  )

  const removeEntry = useCallback<LedgerValue['removeEntry']>(
    async (row) => {
      if (row.pending || row.failed) {
        dequeue(row.id)
        return
      }
      const snapshot = saved
      setSaved((prev) => prev.filter((e) => e.id !== row.id)) // optimistic
      try {
        await store.remove(row.id)
        await refresh()
      } catch (err) {
        setSaved(snapshot)
        throw err
      }
    },
    [saved, refresh],
  )

  const retry = useCallback(
    (id: string) => {
      clearFailed(id)
      void flush()
    },
    [flush],
  )

  const rows = useMemo<LedgerRow[]>(() => {
    const queued: LedgerRow[] = outbox.map((item) => ({
      ...item.entry,
      id: item.id,
      created_by: userId,
      created_at: item.queued_at,
      pending: !item.error,
      failed: item.error,
    }))
    return sortEntries([...queued, ...saved]) as LedgerRow[]
  }, [outbox, saved, userId])

  const value = useMemo<LedgerValue>(
    () => ({
      rows,
      settings,
      loading,
      error,
      online,
      queuedCount: outbox.length,
      addEntry,
      updateEntry,
      releaseEntries,
      importEntries,
      removeEntry,
      retry,
      refresh,
    }),
    [
      rows,
      settings,
      loading,
      error,
      online,
      outbox.length,
      addEntry,
      updateEntry,
      releaseEntries,
      importEntries,
      removeEntry,
      retry,
      refresh,
    ],
  )

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerValue {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used inside LedgerProvider')
  return ctx
}

function messageOf(err: unknown): string {
  const e = err as { message?: string }
  return e?.message ?? 'Something went wrong.'
}
