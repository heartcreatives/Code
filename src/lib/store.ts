import { supabase, hasSupabase } from './supabase'
import { DEFAULT_SETTINGS } from './pricing'
import type { Entry, NewEntry, Settings } from './types'

/**
 * One interface, two backends:
 *  - Supabase (Postgres + Realtime) once the env vars are set — the real thing.
 *  - localStorage, so the app is fully usable before the Supabase project
 *    exists and `npm run dev` works with no setup.
 * Everything above this file is written against the interface.
 */
export interface LedgerStore {
  list(): Promise<Entry[]>
  insert(entry: NewEntry, userId: string | null): Promise<Entry>
  /** Insert many in one round trip — used by the spreadsheet import. */
  insertMany(entries: NewEntry[], userId: string | null): Promise<number>
  update(id: string, patch: Partial<NewEntry>): Promise<void>
  /** Mark several entries released in one go. */
  updateMany(ids: string[], patch: Partial<NewEntry>): Promise<void>
  remove(id: string): Promise<void>
  settings(): Promise<Settings>
  /** Fires whenever any device changes the ledger. Returns an unsubscribe fn. */
  subscribe(onChange: () => void): () => void
}

const LOCAL_KEY = 'paayo.entries.v2'

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

const withIds = (entry: NewEntry, userId: string | null): Entry => ({
  ...entry,
  id: crypto.randomUUID(),
  created_by: userId,
  created_at: new Date().toISOString(),
})

export const localStore: LedgerStore = {
  async list() {
    return sortEntries(readLocal())
  },
  async insert(entry, userId) {
    const row = withIds(entry, userId)
    writeLocal([row, ...readLocal()])
    return row
  },
  async insertMany(entries, userId) {
    writeLocal([...entries.map((e) => withIds(e, userId)), ...readLocal()])
    return entries.length
  },
  async update(id, patch) {
    writeLocal(readLocal().map((e) => (e.id === id ? { ...e, ...patch } : e)))
  },
  async updateMany(ids, patch) {
    const set = new Set(ids)
    writeLocal(readLocal().map((e) => (set.has(e.id) ? { ...e, ...patch } : e)))
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
  'id,kind,occurred_on,start_time,end_time,rate_type,qty,unit_price,amount,amount_overridden,' +
  'channel,payment_status,amount_paid,release_status,released_to,released_on,customer,' +
  'category,note,created_by,created_at'

export const supabaseStore: LedgerStore = {
  async list() {
    const { data, error } = await supabase!
      .from('entries')
      .select(SELECT)
      .order('occurred_on', { ascending: false })
      .order('start_time', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(10000)
    if (error) throw error
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalise)
  },

  async insert(entry, userId) {
    const { data, error } = await supabase!
      .from('entries')
      .insert({ ...entry, created_by: userId })
      .select(SELECT)
      .single()
    if (error) throw error
    return normalise(data as unknown as Record<string, unknown>)
  },

  async insertMany(entries, userId) {
    const { error, count } = await supabase!
      .from('entries')
      .insert(entries.map((e) => ({ ...e, created_by: userId })), { count: 'exact' })
    if (error) throw error
    return count ?? entries.length
  },

  async update(id, patch) {
    const { error } = await supabase!.from('entries').update(patch).eq('id', id)
    if (error) throw error
  },

  async updateMany(ids, patch) {
    const { error } = await supabase!.from('entries').update(patch).in('id', ids)
    if (error) throw error
  },

  async remove(id) {
    const { error } = await supabase!.from('entries').delete().eq('id', id)
    if (error) throw error
  },

  async settings() {
    const { data, error } = await supabase!
      .from('settings')
      .select(
        'non_peak_rate,peak_rate,open_play_fee,paddle_rent_price,machine_rent_price,peak_start_hour,peak_end_hour',
      )
      .eq('id', 1)
      .maybeSingle()
    if (error || !data) return DEFAULT_SETTINGS
    return {
      non_peak_rate: num(data.non_peak_rate) ?? DEFAULT_SETTINGS.non_peak_rate,
      peak_rate: num(data.peak_rate) ?? DEFAULT_SETTINGS.peak_rate,
      open_play_fee: num(data.open_play_fee),
      paddle_rent_price: num(data.paddle_rent_price),
      machine_rent_price: num(data.machine_rent_price),
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
  return {
    id: row.id as string,
    kind: row.kind as Entry['kind'],
    occurred_on: row.occurred_on as string,
    start_time: time(row.start_time),
    end_time: time(row.end_time),
    rate_type: (row.rate_type as Entry['rate_type']) ?? null,
    qty: num(row.qty),
    unit_price: num(row.unit_price),
    amount: num(row.amount) ?? 0,
    amount_overridden: Boolean(row.amount_overridden),
    channel: row.channel as Entry['channel'],
    payment_status: row.payment_status as Entry['payment_status'],
    amount_paid: num(row.amount_paid),
    release_status: row.release_status as Entry['release_status'],
    released_to: (row.released_to as string | null) ?? null,
    released_on: (row.released_on as string | null) ?? null,
    customer: (row.customer as string | null) ?? null,
    category: (row.category as Entry['category']) ?? null,
    note: (row.note as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
  }
}

const time = (v: unknown): string | null => (typeof v === 'string' ? v.slice(0, 5) : null)

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1
    const at = a.start_time ?? ''
    const bt = b.start_time ?? ''
    if (at !== bt) return at < bt ? 1 : -1
    return a.created_at < b.created_at ? 1 : -1
  })
}
