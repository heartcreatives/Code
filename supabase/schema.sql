-- Paayo Pickleball — Court Ledger database schema
-- Run this whole file once in the Supabase SQL Editor (SQL Editor → New query).
-- It is idempotent: running it again is safe and will not wipe your data.

-- ---------------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------------

do $$ begin
  create type entry_kind as enum
    ('court_booking', 'open_play', 'paddle_rent', 'machine_rent', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rate_type as enum ('peak', 'non_peak');
exception when duplicate_object then null; end $$;

-- Two separate GCash accounts, which is why this is not just "gcash".
do $$ begin
  create type pay_channel as enum ('cash', 'gcash_akiss', 'maya', 'gcash_heart');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('paid', 'partial', 'unpaid');
exception when duplicate_object then null; end $$;

-- Release is remittance, and is deliberately separate from payment: money can
-- be collected from the customer but still sitting in a staff member's hands.
do $$ begin
  create type release_status as enum
    ('not_released', 'released', 'released_via_cash', 'to_confirm');
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_category as enum
    ('supplies', 'maintenance', 'utilities', 'equipment', 'staff', 'marketing', 'other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Who is allowed in
-- ---------------------------------------------------------------------------
-- Add your four staff emails here. Anyone not listed cannot read or write a
-- single row, even with a valid Supabase login.

create table if not exists public.allowlist (
  email text primary key,
  label text,
  added_at timestamptz not null default now()
);

insert into public.allowlist (email, label) values
  ('you@example.com', 'Owner')
on conflict (email) do nothing;

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
  start_time time,
  end_time time,
  rate_type rate_type,
  qty numeric(8, 2),
  unit_price numeric(10, 2),
  amount numeric(12, 2) not null check (amount >= 0),
  amount_overridden boolean not null default false,
  channel pay_channel not null,
  payment_status payment_status not null default 'paid',
  amount_paid numeric(12, 2),
  release_status release_status not null default 'not_released',
  released_to text,
  released_on date,
  customer text,
  category expense_category,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- A partial payment has to say how much came in, and it cannot exceed the
  -- amount charged. This is the check the spreadsheet never had.
  constraint entries_partial_needs_amount check (
    payment_status <> 'partial'
    or (amount_paid is not null and amount_paid > 0 and amount_paid <= amount)
  ),
  -- Only expenses carry a category; only expenses may omit a customer-facing
  -- rate. Keeping this in the database means a bad row cannot be written by
  -- any client, now or later.
  constraint entries_expense_shape check (
    (kind = 'expense' and category is not null and rate_type is null)
    or (kind <> 'expense' and category is null)
  ),
  constraint entries_rate_only_on_bookings check (
    rate_type is null or kind = 'court_booking'
  )
);

create index if not exists entries_occurred_on_idx
  on public.entries (occurred_on desc, start_time desc nulls last, created_at desc);
create index if not exists entries_kind_idx on public.entries (kind);
-- The "money owed & held" screen filters on these two constantly.
create index if not exists entries_payment_status_idx
  on public.entries (payment_status) where payment_status <> 'paid';
create index if not exists entries_release_status_idx
  on public.entries (release_status) where release_status <> 'released';

-- ---------------------------------------------------------------------------
-- 4. Settings — prices without a code change
-- ---------------------------------------------------------------------------
-- Single row, id = 1. Edit it in the Table Editor and every phone picks up the
-- new prices on next load. A null price means the Log screen asks each time
-- rather than prefilling a number that may be wrong.

create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  non_peak_rate numeric(10, 2) not null default 200,
  peak_rate numeric(10, 2) not null default 250,
  open_play_fee numeric(10, 2) default 200,
  paddle_rent_price numeric(10, 2) default 50,
  machine_rent_price numeric(10, 2),
  peak_start_hour smallint not null default 17 check (peak_start_hour between 0 and 23),
  peak_end_hour smallint not null default 24 check (peak_end_hour between 1 and 24),
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Older installs: add the columns introduced with paddle and machine rent.
alter table public.settings add column if not exists paddle_rent_price numeric(10, 2) default 50;
alter table public.settings add column if not exists machine_rent_price numeric(10, 2);

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
  for insert to authenticated with check (public.is_staff());

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

-- No write policies on settings or allowlist: they are changed from the
-- Supabase dashboard, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- 6. Realtime — an entry logged on one phone appears on the others
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table public.entries;
exception when duplicate_object then null; end $$;
