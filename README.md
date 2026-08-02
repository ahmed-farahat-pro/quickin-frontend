# QuickIn — Frontend (Web UI)

A standalone Next.js (App Router) web UI for **QuickIn**, a boutique vacation-rental
prototype. This app contains **only the user-facing pages** — it holds no database
and no server-side data access. Every piece of data (listings, bookings, auth) is
fetched over HTTP from the separate **QuickIn backend API**.

## Architecture

```
┌──────────────────────┐      HTTP (fetch)      ┌──────────────────────┐
│  quickin-frontend    │  ───────────────────▶  │   backend API        │
│  (this repo, UI)     │   NEXT_PUBLIC_API_URL   │  /api/local/*        │
│  Next.js · port 5000 │                         │  /api/auth/*         │
└──────────────────────┘                         └──────────────────────┘
```

- Listings/detail pages **fetch** from the backend (server-side, `cache: 'no-store'`).
- Auth uses a **bearer token stored in `localStorage`** (`qk_token` / `qk_user`) —
  no cookies, so the frontend and backend can live on different domains.

## Environment

This app is configured with a single public environment variable:

| Variable              | Required | Default                 | Description                                   |
| --------------------- | -------- | ----------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | yes      | `http://127.0.0.1:4000` | Base URL of the QuickIn backend API.          |

- **Local development:** copy `.env.example` → `.env.local` (it is **not** committed)
  and point `NEXT_PUBLIC_API_URL` at your running backend (default `http://127.0.0.1:4000`).
- **Production (Vercel):** set `NEXT_PUBLIC_API_URL` to the **deployed backend URL**
  in the project's Environment Variables, e.g. `https://quickin-backend.vercel.app`.

> `NEXT_PUBLIC_*` variables are inlined into the client bundle at **build time**, so
> rebuild/redeploy after changing it.

### Optional

| Variable                        | Description                                                   |
| ------------------------------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`  | If set, enables the Google Identity Services sign-in button. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | If set, the Explore map upgrades from Leaflet to Google Maps. |
| `NEXT_PUBLIC_WHATSAPP`          | Overrides the support number in international digits, e.g. `201044448477` — what `wa.me`/`tel:` need. |
| `NEXT_PUBLIC_CONTACT_PHONE`     | Overrides how that number is *printed*, e.g. `01044448477`.   |
| `NEXT_PUBLIC_CONTACT_EMAIL`     | Overrides the support inbox.                                  |
| `NEXT_PUBLIC_SOCIAL_INSTAGRAM`  | Overrides the Instagram profile linked from `/links`.         |
| `NEXT_PUBLIC_SOCIAL_TIKTOK`     | Overrides the TikTok profile linked from `/links`.            |
| `NEXT_PUBLIC_SOCIAL_FACEBOOK`   | Overrides the Facebook page linked from `/links`.             |

The live values are the defaults in [`src/lib/contact.ts`](src/lib/contact.ts) and
[`src/lib/social.ts`](src/lib/social.ts), so none of these need to be set in production —
they exist to point a single environment somewhere else. The phone line and the WhatsApp
account are the same number, which is why the Contact page shows one "Phone / WhatsApp"
row rather than two.

Strip share tracking from any social URL before setting one of these: `igsh` (Instagram),
`_r`/`_t` (TikTok) and `mibextid` (Facebook) are per-share session tokens that identify
whoever copied the link and would follow every visitor we send. `test/unit/social.test.mjs`
fails if one slips into the defaults.

## Backend API it calls

| Method | Path                                                        | Auth   |
| ------ | ----------------------------------------------------------- | ------ |
| GET    | `/api/local/listings?location=&guests=&checkIn=&checkOut=`  | —      |
| GET    | `/api/local/listings/{id}`                                  | —      |
| POST   | `/api/local/bookings`                                       | Bearer |
| GET    | `/api/local/bookings`                                       | Bearer |
| POST   | `/api/auth/login` · `/signup` · `/social` · `/google` · `/apple` | — (returns `{ token, user }`) |

## Pages

- `/explore` — searchable listings grid + List/Map toggle.
- `/explore/[id]` — listing detail + reserve panel.
- `/login`, `/signup` — auth (stores token in `localStorage`).
- `/reservations` — the signed-in user's bookings.
- `/links` — the bio linktree. See below.
- `/plan` — static launch-plan page.

### `/links` — the bio linktree

The single URL to put in the Instagram / TikTok / Facebook bios. It lists the web app,
both mobile apps, the three social accounts, the WhatsApp line and the support inbox as
tappable rows.

It sits **outside** the `(main)` route group on purpose, so it renders on the root layout
alone — no navbar, no site footer. The global "Get the app" bar and the floating WhatsApp
button both hide themselves here (each is already a row on the page), so the route is
listed in `HIDDEN_PREFIXES` in `app-store-bar.tsx` and `whatsapp-fab.tsx`.

Where each row comes from — all existing sources, nothing duplicated:

| Row                  | Source                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| Book your stay       | `getBaseUrl()` in `src/lib/utils.ts`                                    |
| App Store / Google Play | `getAppLinks()` → the `app_ios_url` / `app_android_url` rows set in **/ops → App links** |
| Instagram / TikTok / Facebook | `src/lib/social.ts` (env-overridable, see Environment above)    |
| WhatsApp             | `whatsappHref()` in `src/lib/contact.ts`                                |
| Email us             | `CONTACT_EMAIL` / `CONTACT_EMAIL_HREF` in `src/lib/contact.ts`           |

The two app rows render as a dashed **"coming soon"** row until the matching link is set in
/ops — a linktree that silently drops the apps looks broken rather than early. Set them in
/ops and the rows go live on their own; the page is `revalidate = 300`, so an /ops edit
shows up within 5 minutes without a redeploy.

## Develop

```bash
npm install
cp .env.example .env.local   # then edit NEXT_PUBLIC_API_URL if needed
npm run dev                  # http://localhost:5000
```

## /ops admin console

Staff-only, gated by per-module permissions (`src/lib/local/staff.ts`). Beyond the
tabbed dashboard at `/ops`:

| Page | Module | What it does |
| --- | --- | --- |
| `/ops/analytics` | `analytics` | Booking, payment and cancellation reports with a shared filter bar, plus CSV/Excel export |
| `/ops/resorts` | `resorts` | Resort catalog and the pending-submission queue |
| `/ops/staff` | `staff` | Moderator accounts and their permissions (super admin only) |
| `/ops/payments` | `payments` | The Instapay destination guests pay to, plus the dispute queue |

### Instapay destination

`/ops/payments` is where the number, QR code and link guests see are set. The four
values live in `app_settings` (`instapay_handle`, `instapay_instructions`,
`instapay_link`, `instapay_qr_image`) and are shared with the mobile API, which reads
the same Neon rows.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/local/payment-config` | Signed-in guests — `{instapay_handle, instructions, instapay_link, instapay_qr_image, qr_payload}` |
| GET | `/api/local/admin/settings/instapay` | The same config, for the ops form (`payments` module) |
| PUT | `/api/local/admin/settings/instapay` | `{instapay_handle?, instapay_link?, instapay_qr_image?, instructions?}` — omit a field to leave it, send `""` to clear it. `400` on an invalid link or QR |

An uploaded QR is downscaled to a 640px PNG in the browser before it is sent, and
stored base64-inline like every other World-1 image. When no QR is uploaded, both this
app and iOS draw one from `qr_payload` (the link if set, else the handle) — here via
`qrcode.react` in `src/components/instapay-details.tsx`, which is the shared
guest-facing panel. Validation is `src/lib/local/payment-config-core.ts`, kept
byte-identical with the backend copy by
`quickin-backend/scripts/check-payment-config-core-parity.mjs`.

### Resorts API

Listings belong to a **resort** (compound) rather than a free-text city. A resort
belongs to one region, and a listing's region is derived from its resort.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/local/resorts[?region=]` | Public — the catalog the host listing form offers |
| GET | `/api/local/admin/resorts` | Catalog + free-text names still unassigned |
| POST | `/api/local/admin/resorts` | `{ name, region }` — add one |
| PATCH | `/api/local/admin/resorts/:id` | `{ name?, region?, is_active? }`, or `{ assign_name }` to sweep free-text listings in |
| GET | `/api/local/admin/resorts/submissions[?status=][&preview=]` | The queue, or the listings a merge would relink |
| POST | `/api/local/admin/resorts/submissions/:id` | `{ action:'approve', name, region, merge_into_id? }` or `{ action:'reject', reason? }` |

**Approval-time review.** Every new listing (and every edited one, since edits
re-review) needs admin approval. Approving a listing whose resort is free text opens
a review popup with three ways out — add it to the catalog with the name prefilled
from the host's text so a typo can be corrected, match an existing resort the host
missed, or keep the wording as typed. The resort is resolved **before** the listing
goes live: if the decision is invalid the approval is refused and the listing stays
pending. This is scoped to that one listing — others sharing the name stay in the
queue — but the spelling is recorded as an alias, so future hosts typing it link
automatically. `POST /api/local/admin/listings { id, action:'approve', resort: { mode } }`.

A host who picks **Other** and types a name keeps that text on the listing — it
publishes normally and guests see it as typed — while the name queues for review. On
approval the admin types the **canonical** spelling, so `amouge` becomes `Amouage`;
every listing carrying the submitted text is relinked, and the submitted spelling is
kept in `resort_aliases` so the next host who types it **auto-links instead of
re-queueing**. Every resolution is written to `staff_audit_log`.

### Analytics API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/local/admin/analytics/bookings` | Totals (active/completed/cancelled), trend, by resort, by status |
| GET | `/api/local/admin/analytics/revenue` | Gross, commission, host net, refunds, payout estimates |
| GET | `/api/local/admin/analytics/cancellations` | Count, rate, by actor, by policy, by resort |
| GET | `/api/local/admin/analytics/facets` | Filter options — regions, active resorts, hosts |
| GET | `/api/local/admin/analytics/export` | `?kind=&format=csv\|xlsx` — one booking per row, same filters |

Shared filters: `?from=&to=` (YYYY-MM-DD, defaults to the last 90 days),
`&region=`, `&resort=<id\|__other__\|__none__>`, `&host=`, `&listing=`,
`&granularity=day\|week\|month`. Bad input returns **400**, never a 500.

Two things worth knowing when reading these numbers:

- **A refund clears `paid_at`**, so revenue is decided by `payment_status`, never by
  `paid_at IS NOT NULL` — that predicate silently drops refunded bookings. The
  `PAID_SQL` / `REFUNDED_SQL` / `MONEY_AT_SQL` constants in `analytics-core.ts` exist
  so no query re-derives it.
- **Payout figures are derived estimates**, not a ledger — there is no payouts table.
  They are host-net split by whether the stay has ended.

Exports carry guest and host emails, so every one is recorded in `staff_audit_log`
as `analytics_export`. CSV is written with a UTF-8 BOM (so Excel reads Arabic
correctly) and cells starting `=` `+` `-` `@` are prefixed to defuse spreadsheet
formula injection.

## Testing

```bash
npm test          # offline unit tests — no database, no network
npm run check     # same; the pre-deploy gate
```

`node --test`, zero test-runner dependencies. Unit tests live in
`test/unit/*.test.mjs` and cover:

| Module | Covers |
| --- | --- |
| `analytics-core.ts` | Filter parsing and validation, the `buildReportWhere` SQL builder (placeholder numbering, the date-column injection guard), commission/refund math, CSV escaping and formula-injection defusing |
| `resort-core.ts` | Resort name normalization, slug collision (`Amouage` = `amouage` = `AMOUAGE.`), typo distance |
| `xlsx.ts` | Cell typing (numbers stay numeric so Excel can sum them), sheet-name sanitizing, filename safety |

Those two modules deliberately have **no runtime imports** — Node's ESM resolver
rejects the extension-less relative specifiers used elsewhere in `src/lib/local`, so a
module with no relative imports is the one shape a test can load. Keep pure logic
there and have `db.ts` / `analytics.ts` import it, never the reverse. The backend
README's Testing section is the fuller writeup.

`src/lib/local/resort-core.ts` is **byte-identical** to the backend's copy — both
projects write the same `resorts` table, so a drifted slug would fork the catalog.
The backend's `scripts/check-resort-core-parity.mjs` fails if they diverge.

## Build

```bash
npm run build
npm start                    # serves on port 5000
```

The build does **not** require the backend to be running — server-side data
fetches use `cache: 'no-store'` and the data pages are `force-dynamic`, so they
are rendered per-request at runtime, not at build time.
