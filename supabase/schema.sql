-- Paayo Court Ledger — database schema
-- Run this whole file once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is idempotent: running it again is safe and will not wipe your data.

-- ---------------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------------

do $$ begin
  create type entry_kind as enum ('booking', 'open_play', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rate_type as enum ('peak', 'non_peak');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pay_method as enum ('cash', 'gcash', 'maya');
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_category as enum (
    'supplies', 'maintenance', 'utilities', 'equipment', 'staff', 'marketing', 'other'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Who is allowed in
-- ---------------------------------------------------------------------------
-- Add your four staff emails here. Anyone not listed cannot read or write a
-- single row, even if they somehow obtain a valid Supabase token.

create table if not exists public.allowlist (
  email text primary key,
  label text,
  added_at timestamptz not null default now()
);

insert into public.allowlist (email, label) values
  ('you@example.com', 'Owner')
on conflict (email) do nothing;

-- Helper used by every policy below. `security definer` lets it read the
-- allowlist table regardless of the caller's own permissions.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowlist a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Entries — the ledger itself
-- ---------------------------------------------------------------------------

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  kind entry_kind not null,
  occurred_on date not null,
  occurred_at time,
  rate_type rate_type,
  hours numeric(6, 2),
  players integer,
  fee_per_player numeric(10, 2),
  amount numeric(12, 2) not null check (amount > 0),
  method pay_method not null,
  category expense_category,
  note text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Shape rules: a booking cannot carry player counts, an expense cannot carry
  -- an hourly rate, and every expense must be categorised.
  constraint entries_booking_shape check (
    kind <> 'booking' or (players is null and fee_per_player is null and category is null)
  ),
  constraint entries_open_play_shape check (
    kind <> 'open_play' or (rate_type is null and hours is null and category is null)
  ),
  constraint entries_expense_shape check (
    kind <> 'expense'
    or (rate_type is null and hours is null and players is null
        and fee_per_player is null and category is not null)
  )
);

create index if not exists entries_occurred_on_idx
  on public.entries (occurred_on desc, occurred_at desc nulls last, created_at desc);
create index if not exists entries_kind_idx on public.entries (kind);

-- ---------------------------------------------------------------------------
-- 4. Settings — pricing without code edits
-- ---------------------------------------------------------------------------
-- Single row, id = 1. Change these values in the Table Editor and every phone
-- picks up the new prices on next load.

create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  non_peak_rate numeric(10, 2) not null default 200,
  peak_rate numeric(10, 2) not null default 250,
  -- Open play fee per player varies per session, so there is no default value
  -- to prefill. Set this to a number later if the court settles on a fixed fee.
  open_play_fee numeric(10, 2),
  peak_start_hour smallint not null default 17 check (peak_start_hour between 0 and 23),
  peak_end_hour smallint not null default 24 check (peak_end_hour between 1 and 24),
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.entries enable row level security;
alter table public.settings enable row level security;
alter table public.allowlist enable row level security;

drop policy if exists "staff read entries" on public.entries;
create policy "staff read entries" on public.entries
  for select to authenticated using (public.is_staff());

drop policy if exists "staff insert entries" on public.entries;
create policy "staff insert entries" on public.entries
  for insert to authenticated with check (public.is_staff() and created_by = auth.uid());

drop policy if exists "staff update entries" on public.entries;
create policy "staff update entries" on public.entries
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff delete entries" on public.entries;
create policy "staff delete entries" on public.entries
  for delete to authenticated using (public.is_staff());

drop policy if exists "staff read settings" on public.settings;
create policy "staff read settings" on public.settings
  for select to authenticated using (public.is_staff());

drop policy if exists "staff read allowlist" on public.allowlist;
create policy "staff read allowlist" on public.allowlist
  for select to authenticated using (public.is_staff());

-- No insert/update/delete policies on settings or allowlist: they are changed
-- from the Supabase dashboard only, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- 6. Realtime — a sale logged on one phone appears on the others
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table public.entries;
exception when duplicate_object then null; end $$;
