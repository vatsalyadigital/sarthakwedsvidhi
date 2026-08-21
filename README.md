# Wedding Operations & Finance ERP

A complete wedding management system: vendors with dedicated dashboards, contracts and
payment tracking, a centralized expense ledger, category budgets, guests and families,
a secure self-service guest portal with Aadhaar/KYC capture, multi-hotel room allocation
with check-in/check-out, functions/events, documents, reports, global search, and
role-based access control for five roles.

It's a real, working, database-backed application — not a mockup. Every workflow below
has been exercised end to end against the live server (see **Verified workflows**).

## Why this isn't Next.js / Prisma / PostgreSQL

That was the original ask, and it's the right stack for this in production. It couldn't
be built here: the sandbox this was built in has no access to the npm registry, PyPI, or
any CDN (every package install failed with a network-level block), so `next`, `prisma`,
`tailwindcss`, `next-auth` — anything not already preinstalled — simply couldn't be
fetched. Rather than hand you an untested scaffold, this was built with **zero external
dependencies**, using only what Node 22 ships with:

| Concern | Built with |
|---|---|
| Server & routing | Node's built-in `http` module + a small hand-rolled router |
| Database | `node:sqlite` (built into Node 22.5+, real SQL, real persistence) |
| Auth | Signed HttpOnly session cookies (HMAC-SHA256) + scrypt password hashing, both via `node:crypto` |
| Frontend | Server-rendered HTML (template literals), one CSS file, a little vanilla JS |
| Charts | Inline SVG, no charting library |

Because of that, **`npm install` isn't needed at all** — clone it and run it. See
**Migrating to Next.js/Prisma/Postgres** at the bottom if you want to move to that stack
later; the data model and business logic here translate directly.

## Quick start

```bash
node src/seed.js      # (re)creates the 3 super admin accounts — wipes all other data
node src/server.js    # starts the server on http://localhost:4000
```

Requires Node **22.5+** (for `node:sqlite`).

### Admin logins

`src/seed.js` creates three Super Admin accounts (Sarthak Kalra, Niharika Kaushal, Abhinav
Kalra — see that file for current emails). All three share one password, set via the
`SEED_ADMIN_PASSWORD` environment variable — set it in your host's dashboard (never commit
it to this repo). If it's unset, a random password is generated each time and printed to
the console/deploy logs, since this repo is public.

Manage team members and roles from **Settings → Team & roles** once logged in as Super Admin.

## What's in the demo data

10 vendors (with quotations, contracts, and payments), 30 guests across 5 families,
3 hotels with 30 rooms, 6 functions (Engagement → Reception), 20 expenses, 10 vendor
payments, and category budgets — all in Indian Rupees with realistic Indian-wedding
vendor categories, names, and amounts.

## Feature tour

- **Dashboard** — total budget, estimated cost, actual expense, paid, outstanding,
  vendor/guest counts, rooms allocated/pending, upcoming payments & functions, five
  charts (budget vs actual, paid vs outstanding, expense by category/function,
  vendor-wise spending), and a live alerts feed (over-budget categories, unallocated
  guests, missing KYC, room capacity issues, guests arriving tomorrow, missing
  contracts/invoices, payments due).
- **Vendors** — quick-add form, searchable list, and a full per-vendor dashboard with
  Overview / Quotation (itemized, with qty/rate/discount/tax) / Contract (auto-computes
  Final Amount = Contract Value − Discount + Tax) / Expenses / Payments / Documents /
  Notes tabs. Payment status (Unpaid / Partially Paid / Fully Paid / Overpaid) is always
  computed live from actual payments, never stored stale.
- **Expenses** — every expense, filterable by vendor/category/function/status/method/date,
  custom categories created on the fly, CSV export.
- **Payments** — full vendor payment ledger plus an upcoming-payments reminder list.
- **Budget** — per-category budget vs estimated vs actual vs variance with progress bars,
  auto-flagged when over budget.
- **Guests & Families** — full guest records (travel, food preference, room needs,
  status), family/group view, CSV import and export.
- **Aadhaar / KYC** — restricted to Super Admin and Guest Manager. Aadhaar numbers are
  **always masked** (`XXXX XXXX 1234`) everywhere in the UI. Guests submit their own
  number through their private portal link, never through a page an admin browses guest
  lists on.
- **Guest Portal** (`/guest/secure/<token>`) — no login needed. Each guest gets a unique,
  unguessable link (see **Guests → Guest Portal Links** in the sidebar) where they confirm
  attendance, arrival/departure, food preference, and submit Aadhaar + DOB with explicit
  consent language shown before submission. Submitting flips their KYC status to
  "Submitted" automatically.
- **Rooms** — 3 hotels × room types (Single/Double/Twin/Triple/Suite/Family), allocation
  with an over-capacity warning, check-in/check-out that updates both the room and guest
  status, and an unallocated-guests panel.
- **Functions/Events** — each with its own date/venue/budget, linked vendors, and a live
  actual-spend rollup from linked expenses.
- **Documents** — records (type, name, external link, what it's linked to) for contracts,
  quotations, invoices, receipts, etc. See **No file uploads** below for why these are
  links rather than binary uploads.
- **Reports** — Financial, Vendor, Expense, Guest, Room, and KYC (restricted) reports,
  each with a CSV export.
- **Global search** — top bar search across vendors, guests, phone numbers, rooms,
  expenses, payments, and functions, with live suggestions.
- **Settings** — team management and role assignment (Super Admin only), your own
  password change, and a full audit log of who did what and when.

## No file uploads, by design

Per your request mid-build, this doesn't store uploaded files (Aadhaar scans, signed
contracts, invoices). Instead:

- **Documents** are metadata records with an external link field — paste a Google Drive,
  Dropbox, or WhatsApp-shared link.
- **KYC** captures the Aadhaar *number* (masked everywhere in the UI) and date of birth,
  not a scanned image.

This means the whole app has **no S3/R2 dependency and no persistent-disk requirement for
uploads** — only the SQLite database file itself needs to persist (see deployment below).
If you later want real Aadhaar scans stored securely, that's a contained addition: an S3-
compatible bucket, signed upload URLs, and a `file_path` column on `guests` — ask and it
can be added.

## Verified workflows

These were run against the live server before delivery, not just eyeballed:

1. Add vendor → dedicated vendor dashboard created at `/vendors/:id` ✓
2. Add a payment → Amount Paid / Outstanding / Payment Status recalculate immediately ✓
3. Add an expense → Dashboard's Total Actual Expense updates by exactly that amount ✓
4. Add a guest → unique portal link generated ✓
5. Guest submits their portal form (RSVP, Aadhaar, DOB, consent) → admin sees updated
   status and KYC flips to "Submitted" ✓
6. Admin verifies KYC → status updates, reviewer recorded ✓
7. Add a hotel + room → room inventory and hotel occupancy stat update ✓
8. Allocate a guest to a room → room shows occupant, unallocated-guest count drops ✓
9. Check in → room status → Occupied, guest status → Checked In ✓
10. Check out → room status → Cleaning, guest status → Checked Out ✓
11. Role permissions enforced server-side: a Viewer's write POST is rejected and
    redirected; a Finance user is denied the KYC page entirely ✓

## Deploying this somewhere real — the easy way

The one constraint: this uses a single SQLite file on disk, so it needs a host with a
**persistent filesystem** — not pure serverless (Vercel/Netlify functions reset their
disk on every invocation, so SQLite won't survive there as-is).

This repo includes a **[Render](https://render.com) Blueprint** (`render.yaml`) that sets
up everything automatically — the web service, a persistent disk mounted at `/data`, and
all required environment variables (including a securely auto-generated `SESSION_SECRET`).
There's nothing to configure by hand.

It also includes `scripts/start.sh`, which seeds the demo data **only on first boot**
(when no database file exists yet) and never touches it again on later redeploys — so
your real vendors, guests, and payments are safe every time you push an update.

**See `DEPLOYMENT.md` for the full step-by-step walkthrough** (getting the code onto
GitHub, then deploying it on Render with one click via the Blueprint — no command line
needed on your end).

Other hosts that work too, if you'd rather use one of them (same idea: a persistent disk
mounted at `/data`, `DATA_DIR=/data`, start command `bash scripts/start.sh`):

- **[Railway](https://railway.app)** — add a Volume, mount at `/data`, set `DATA_DIR=/data`.
- **[Fly.io](https://fly.io)** — `fly volumes create`, mount it, same `DATA_DIR` env var.
- **Your own VPS** — `git clone`, `bash scripts/start.sh` behind a process manager
  (`pm2`, `systemd`) and a reverse proxy (nginx/Caddy) for HTTPS.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `DATA_DIR` | `./data` | Where the SQLite file and session secret live — point this at your mounted volume in production |
| `SESSION_SECRET` | auto-generated into `DATA_DIR/.session_secret` | Set this explicitly in production so sessions survive redeploys |
| `NODE_ENV` | — | Set to `production` to mark session cookies `Secure` (requires HTTPS) |

### Wanting Vercel specifically?

You can, if you move off SQLite: point `DATA_DIR` won't help on serverless. The path is
to swap `src/lib/db.js` for a Postgres client (Neon/Supabase both give you a free
Postgres instance with a connection string) — the rest of the app (every route, every
calculation, every page) is unaffected, since it all goes through the small set of
`run`/`get`/`all` helpers in that one file. This is a self-contained, well-scoped follow-up.

## Migrating to Next.js / Prisma / Postgres later

The data model in `src/lib/db.js` is a clean, fully-normalized relational schema — it
maps almost directly to a Prisma schema (same tables, same foreign keys). The business
logic (contract/outstanding calculations, alerts, dashboard aggregates) lives in
`src/lib/calc.js` and `src/lib/alerts.js`, independent of the HTTP layer, so it ports
over as-is. The main work in a migration would be re-building the server-rendered HTML
pages as React components and swapping the hand-rolled router/auth for Next.js routes and
NextAuth — a substantial but mechanical rewrite, not a redesign.

## Project structure

```
src/
  server.js          entrypoint — wires up static files + all routes
  seed.js             demo data generator
  lib/
    db.js             SQLite schema + query helpers
    auth.js            sessions + password hashing
    calc.js             contract/outstanding/budget calculations
    alerts.js            dashboard alert rules
    render.js             HTML layout, components, inline SVG charts
    router.js              minimal HTTP router + body parsing
    constants.js             categories, statuses, role permissions
    format.js                 INR currency, dates, Aadhaar masking
    guard.js                   auth/role middleware helpers
    audit.js                    audit log writer
  routes/              one file per module (vendors, expenses, guests, rooms, ...)
public/
  styles.css          the whole design system
  app.js               small client-side helpers (search, confirm dialogs)
scripts/
  start.sh            production start: seeds only on first boot, then starts the server
data/                  SQLite database lives here (gitignored)
render.yaml            Render Blueprint — one-click deploy config (see DEPLOYMENT.md)
DEPLOYMENT.md           non-technical, step-by-step deploy walkthrough
```
