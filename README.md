# Pikol sa Paayo — Court Ledger

A phone-first web app for the finances of the Pikol sa Paayo pickleball court in Tagum City.
Four staff take payments courtside and log them into one shared ledger, which answers, at any
moment: what came in and through which channel, who still owes us, and which collected money
has been released.

It replaces a Google Sheet, and is built to make that sheet's failure modes impossible.

- **Five entry types** — court booking, open play, paddle rent, machine rent, expense
- **Six channels** — Cash, GCash 1 – Akiss, GCash 2 – Heart, GCash 3 – Heart Globe,
  GCash 4 – Boboy, Maya — split out so each one reconciles against its own balance
- **Payment and release tracked separately** — money can be collected but not yet handed over
- **Money owed & held** answers the daily question: how much is waiting to go to the owner,
  and which account it came in through. GCash 4 is the owner's own account, so money there
  counts as sales but is never part of that pot — the app derives that from the channel
- **Live** — an entry logged at the court appears on the other phones within seconds
- **Offline-safe** — entries queue on the phone and sync when the signal comes back
- **Installable** — add to home screen, works one-handed

Everything is Manila time (UTC+8) and Philippine pesos.

---

## Try it right now (no accounts needed)

```bash
npm install
npm run dev
```

Open the printed URL. With no Supabase keys set the app runs in **demo mode**: it works
end to end, but entries are stored on that one device only. To fill the dashboard with
three weeks of made-up entries, run it with the seed flag:

```bash
VITE_ENABLE_SEED=true npm run dev
```

…then tap **Load sample data** at the bottom of the dashboard. Every sample row is tagged
`Sample ·`, and **Clear it** removes exactly those and nothing else.

---

## Setup, step by step

### 1. Supabase (the shared database)

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub or email.
   The free tier is enough for this app.
2. **New project.** Name it `paayo-court`, pick a strong database password (save it in
   your password manager — you won't need it day to day), and choose the **Southeast Asia
   (Singapore)** region: it's the closest to Tagum, so the app feels quicker.
3. Wait for the project to finish provisioning (about two minutes).
4. Open **SQL Editor** → **New query**. Paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql) and press **Run**. This creates the
   `entries` and `settings` tables, the allowlist, the Row Level Security policies, and
   turns on Realtime. It is safe to run twice.
5. Open **Table Editor → allowlist** and replace `you@example.com` with the four staff
   email addresses, one row each. **Anyone not in this table cannot read or write a single
   row**, even with a valid login.
6. Open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

   Copy `.env.example` to `.env.local` and paste them in. `.env.local` is gitignored.

   > The anon key is *meant* to be in the browser — that's what RLS is for. **Never** put
   > the `service_role` key in this app or in Netlify; it bypasses every policy.

7. Restart `npm run dev`. The sign-in screen now asks for an email instead of dropping
   you straight into demo mode.

**Changing prices later:** Table Editor → `settings` → edit the row — `non_peak_rate`,
`peak_rate`, `open_play_fee`, `paddle_rent_price`, `machine_rent_price`. Every phone picks the
new prices up on next load.

`machine_rent_price` ships **empty on purpose**, because the court hasn't set one — the Log
screen asks for it each time rather than prefilling a number that might be wrong. Put a value
in and it starts prefilling.

### 2. Netlify (the hosting)

1. Push this repo to GitHub (see below).
2. Go to <https://netlify.com> → sign up (free) → **Add new site → Import an existing
   project** → **GitHub** → authorise → pick this repository.
3. Build settings — Netlify usually detects these, but confirm:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. **Site configuration → Environment variables → Add a variable.** Add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as `.env.local`.
   (Leave `VITE_ENABLE_SEED` unset in production so staff never see the sample-data
   buttons.)
5. **Deploy.** Netlify gives you a URL like `paayo-court.netlify.app` — you can rename it
   under **Site configuration → Change site name**.
6. Back in Supabase: **Authentication → URL Configuration** → set **Site URL** to your
   Netlify URL, and add `https://your-site.netlify.app/**` under **Redirect URLs**. Magic
   links won't work until you do this.
7. Every push to the branch you selected redeploys automatically.

`public/_redirects` already contains `/*  /index.html  200`, so deep links like
`/history` don't 404 on refresh.

### 3. Adding your staff

1. Supabase → **Table Editor → allowlist → Insert row**, one per person.
2. Send them the Netlify URL. They enter their email, tap the link in it, and they're in —
   no password to remember or share.
3. On the phone: open the URL in Chrome or Safari → browser menu → **Add to Home Screen**.
   It then opens like an app, full screen.
4. To remove someone who leaves, delete their allowlist row. Their next request is refused
   by the database, whatever is still on their phone.

---

## How the money rules work

| Rule | Behaviour |
|---|---|
| Non-peak | 5:00AM–4:00PM, ₱200/hr |
| Peak | 5:00PM–12:00MN, ₱250/hr |
| Hours | Typed once, as a start and end time — the hours fill themselves in, and a block ending after midnight is handled |
| Rate suggestion | Taken from the start hour (17–23 → peak), always overridable. That is what covers the 4:30–5:30PM booking charged non-peak, and long blocks charged at one rate |
| Amount | `qty × unit price`, auto-filled. Type over it and the entry is saved as **overridden** — that is how discounts are recorded rather than lost |
| Open play | Either per player (players × fee) or booked as court hours under one organiser — log the second as a court booking with the organiser as customer |
| Paddle / machine rent | qty × unit price from settings. These two are what make up **Cyril's payout** |
| Payment | `paid`, `partial` (records how much came in; the rest becomes a receivable) or `unpaid` |
| Release | Separate from payment: `not released`, `released`, `released via cash`, `to confirm`, plus who it went to and when |

Money in counts what has **actually been collected** — a partial payment contributes only the
part that was received, and the remainder shows up under Money owed. Dates are the Manila
business date, taken from `Asia/Manila` rather than the phone clock, and the day of the week is
derived from the date so the two can never disagree.

**Every total is computed by walking all matching records.** There is no code path anywhere that
refers to a record by position, which is what made the old `=SUM(I3,I5,I8,…)` totals silently
drop later rows.

## Screens

- **Log** — five types across the top, then only the fields that type needs.
- **Home** — period selector (today, this week, this month, last month, all time), KPIs, money in
  by channel, revenue by type, expenses by category. Updates live.
- **Owed** — receivables, money collected but not released (split by channel and by person),
  Cyril's payout, and bulk mark-as-released.
- **History** — grouped by day with the day's net, filters for type, channel, payment and release,
  customer search, edit, delete, and CSV export.
- **Import** — one-time load of the old spreadsheet: pick the CSV, check the column mapping, review
  what the parser was unsure about, then import. Reachable from History → Import.

### Importing the old spreadsheet

Export the Log tab as CSV, then open History → **Import**. The columns are matched by name and
you can correct any of them. The old free-text notes are read into the new fields —
`released` → released, `not released` → not released, `released - thru cash` → released via cash,
`released - to confirm` → to confirm, `not paid` → unpaid — and anything that doesn't match a known
phrase is **listed for you to look at before importing**, never guessed. A note that just says
"GCash" is flagged too, because only a person knows whether that is Akiss or Heart.

## Brand

Taken from the Pikol sa Paayo badge. The tokens live in
[`src/lib/brand.ts`](src/lib/brand.ts) and `tailwind.config.js` — change them in
those two places and the whole app follows.

| Colour | Hex | Used for |
|---|---|---|
| Charcoal | `#17191C` | Page ground |
| Navy | `#0B2942` | Cards, the court surface |
| Sky blue | `#55B8E8` | Court lines, highlights, **money in** |
| Paayo orange | `#F58220` | The primary button, the one key figure per screen |
| White | `#FFFFFF` | Type |
| Rose | `#E5486B` | **Money out** |

Roughly 60% charcoal + navy, 25% sky, 10% orange, 5% white. Orange is rationed
deliberately: one Save button, one net figure. If it starts appearing in three
places on a screen it has stopped being the signature.

Rose is the one colour not in the badge. The brand has no "negative" colour, and
a plain red sits only ΔE 12 from Paayo orange — close enough that a red expense
figure and an orange button read as the same colour at a glance. This rose clears
every pairing. Nothing relies on colour alone in any case: every figure is
labelled, and expenses carry a − sign.

**The logo.** `public/logo.png` is the badge, background removed and scaled to
512px (249 KB, down from a 2 MB source). The sign-in screen and the header mark
both use it; if the file is ever missing they fall back to a drawn SVG in
`src/components/Logo.tsx`, so the app never renders a broken image.

To replace it with new artwork:

```bash
npm run logo -- path/to/new-badge.png   # removes the background, trims, resizes
npm run icons                           # rebuilds the home-screen icons from it
```

`npm run logo` samples the backdrop from the image's corners, so a white export
and a charcoal one both work, and it floods inward from the edges only — the
white lettering inside the badge is never touched.

## Project layout

```
src/
  lib/         time (Manila), money formatting, pricing rules, analytics,
               CSV export, the offline outbox, and the data store
  state/       AuthContext (magic link + allowlist), LedgerContext (entries,
               Realtime, optimistic saves)
  components/  court-lines motif, bottom nav, segmented controls, bar charts
  screens/     SignIn, Log, Dashboard, History
supabase/schema.sql   tables, constraints, RLS policies, Realtime
scripts/generate-icons.mjs   builds the PWA icons (npm run icons)
```

`src/lib/store.ts` is the seam: one interface, a Supabase implementation and a
localStorage one. Nothing above it knows which is in use.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the built app (this is where the service worker is live) |
| `npm run icons` | Regenerate the PWA icons |

## Security notes

- No secrets in the repo. `.env.local` is gitignored; only the anon key ever reaches a
  browser.
- Every table has RLS on, and every policy requires the caller's email to be in
  `allowlist`. There is no anonymous read path.
- `settings` and `allowlist` have read-only policies — they're edited from the Supabase
  dashboard, which bypasses RLS.
- Deleting an entry is permanent and confirmed with a dialog first.
