# Paayo Court Ledger

A phone-first web app for logging the finances of the Paayo pickleball court in Tagum
City. Four staff, one shared set of books: court bookings, open play and expenses go in
from any phone, and the dashboard updates on everyone else's within seconds.

- **Money in / out** — court bookings (peak & non-peak), open play, categorised expenses
- **Channels** — Cash, GCash · Paayo Café, Maya · Online booking, split out for reconciliation
- **Live** — a sale logged at the court appears on the other phones through Supabase Realtime
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
   turns on Realtime.
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

**Changing prices later:** Table Editor → `settings` → edit the row. `non_peak_rate` and
`peak_rate` are the hourly court rates; `open_play_fee` is left empty on purpose, because
the open play fee varies per session — set it to a number if the court ever settles on a
fixed fee and it will prefill instead.

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
| Rate suggestion | Start hour 17–23 suggests **Peak**, anything else **Non-peak** — always overridable with the toggle, which is how the 4–5PM edge and after-midnight sessions are handled |
| Booking amount | `hours × rate`, auto-filled. Editing it by hand sticks until the time, hours or rate changes again |
| Open play | `players × fee each`, auto-filled; or type the total directly and leave those blank |
| Expense | Cost plus a category and the method it was paid from |

Dates are the Manila business date, taken from `Asia/Manila` rather than the phone clock
or UTC, so a 9PM entry never lands on the wrong day's takings.

---

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
