import { supabase, hasSupabase } from './supabase'
import { DEFAULT_SETTINGS } from './pricing'
import type { Entry, NewEntry, Settings } from './types'

/**
 * One interface, two backends:
 *  - Supabase (Postgres + Realtime) once the env vars are set — the real thing.
 *  - localStorage, so the app is fully usable before the Supabase project
 *    exists and so `npm run dev` works with no setup at all.
 * Everything above this file is written against the interface, not the backend.
 */
export interface LedgerStore {
  list(): Promise<Entry[]>
  insert(entry: NewEntry, userId: string | null): Promise<Entry>
  remove(id: string): Promise<void>
  settings(): Promise<Settings>
  /** Fires whenever any device changes the ledger. Returns an unsubscribe fn. */
  subscribe(onChange: () => void): () => void
}

const LOCAL_KEY = 'paayo.entries.v1'

function readLocal(): Entry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as Entry[]) : []
  } catch {
    return []
  }
}

function writeLocal(entries: Entry[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(entries))
  // Same-tab listeners: the storage event only fires in *other* tabs.
  window.dispatchEvent(new CustomEvent('paayo:local-change'))
}

export const localStore: LedgerStore = {
  async list() {
    return sortEntries(readLocal())
  },
  async insert(entry, userId) {
    const row: Entry = {
      ...entry,
      id: crypto.randomUUID(),
      created_by: userId,
      created_at: new Date().toISOString(),
    }
    writeLocal([row, ...readLocal()])
    return row
  },
  async remove(id) {
    writeLocal(readLocal().filter((e) => e.id !== id))
  },
  async settings() {
    return DEFAULT_SETTINGS
  },
  subscribe(onChange) {
    const handler = () => onChange()
    window.addEventListener('storage', handler)
    window.addEventListener('paayo:local-change', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('paayo:local-change', handler)
    }
  },
}

/** Replace the whole local ledger — used by the sample-data seeder. */
export function replaceLocal(entries: Entry[]) {
  writeLocal(sortEntries(entries))
}

const SELECT =
  'id,kind,occurred_on,occurred_at,rate_type,hours,players,fee_per_player,amount,method,category,note,created_by,created_at'

export const supabaseStore: LedgerStore = {
  async list() {
    const { data, error } = await supabase!
      .from('entries')
      .select(SELECT)
      .order('occurred_on', { ascending: false })
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) throw error
    return (data ?? []).map(normalise)
  },

  async insert(entry, userId) {
    const { data, error } = await supabase!
      .from('entries')
      .insert({ ...entry, created_by: userId })
      .select(SELECT)
      .single()
    if (error) throw error
    return normalise(data)
  },

  async remove(id) {
    const { error } = await supabase!.from('entries').delete().eq('id', id)
    if (error) throw error
  },

  async settings() {
    const { data, error } = await supabase!
      .from('settings')
      .select('non_peak_rate,peak_rate,open_play_fee,peak_start_hour,peak_end_hour')
      .eq('id', 1)
      .maybeSingle()
    if (error || !data) return DEFAULT_SETTINGS
    return {
      non_peak_rate: num(data.non_peak_rate) ?? DEFAULT_SETTINGS.non_peak_rate,
      peak_rate: num(data.peak_rate) ?? DEFAULT_SETTINGS.peak_rate,
      open_play_fee: num(data.open_play_fee),
      peak_start_hour: num(data.peak_start_hour) ?? DEFAULT_SETTINGS.peak_start_hour,
      peak_end_hour: num(data.peak_end_hour) ?? DEFAULT_SETTINGS.peak_end_hour,
    }
  },

  subscribe(onChange) {
    const channel = supabase!
      .channel('entries-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, onChange)
      .subscribe()
    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}

export const store: LedgerStore = hasSupabase ? supabaseStore : localStore

/** Postgres numerics arrive as strings; times as HH:MM:SS. */
function normalise(row: Record<string, unknown>): Entry {
  const at = row.occurred_at as string | null
  return {
    id: row.id as string,
    kind: row.kind as Entry['kind'],
    occurred_on: row.occurred_on as string,
    occurred_at: at ? at.slice(0, 5) : null,
    rate_type: (row.rate_type as Entry['rate_type']) ?? null,
    hours: num(row.hours),
    players: num(row.players),
    fee_per_player: num(row.fee_per_player),
    amount: num(row.amount) ?? 0,
    method: row.method as Entry['method'],
    category: (row.category as Entry['category']) ?? null,
    note: (row.note as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1
    const at = a.occurred_at ?? ''
    const bt = b.occurred_at ?? ''
    if (at !== bt) return at < bt ? 1 : -1
    return a.created_at < b.created_at ? 1 : -1
  })
}
