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
| `NEXT_PUBLIC_WHATSAPP`          | Overrides the support number in international digits, e.g. `201013010119` — what `wa.me`/`tel:` need. |
| `NEXT_PUBLIC_CONTACT_PHONE`     | Overrides how that number is *printed*, e.g. `01013010119`.   |
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

## Loading states

Every route that awaits data on the server needs its own `loading.tsx`. Without one,
Next.js walks up to the nearest boundary — and the root `src/app/loading.tsx` is a
**fullscreen** takeover, so a missing boundary means an entire screen (sidebar, top
bar and all) is torn down and rebuilt on every navigation. That was the state of all
16 `/ops` pages until the console got `src/app/ops/(console)/loading.tsx`; put a new
boundary beside the layout you want to survive, not above it.

| Piece | Where | For |
| --- | --- | --- |
| `<RouteProgress />` | `src/components/ui/route-progress.tsx` | The top-of-viewport bar. Drop it in every `loading.tsx` — a route skeleton's lifetime *is* the pending navigation, so no router subscription is needed. |
| `<QuickInMark />` | `src/components/ui/quickin-mark.tsx` | The Q that draws itself. Cold boot and sign-in screens only — never in place of a populated screen. |
| `SkeletonBlock`, `SkeletonCard`, `SkeletonRow`, `ShimmerStyles` | `src/components/ui/skeleton-block.tsx` | Boutique-palette shimmer for the guest site. One `<ShimmerStyles />` per loading tree. |
| `OpsSkeletonPage`, `…Header`, `…Stats`, `…Table`, `…Filters`, `…Form`, `…Chart`, `…Panel` | `src/app/ops/(console)/ops-skeleton.tsx` | The console's shapes, in its inline-style idiom. |
| `<Skeleton />` | `src/components/ui/skeleton.tsx` | The shadcn kit, for the Tailwind-styled pages (`/dashboard`, `/links`). |

A `loading.tsx` must stay server-renderable — no `'use client'`, no hooks. Shipping
JavaScript to draw a placeholder defeats the point.

Skip the boundary when there is no server wait to cover: client-component pages
(`/messages`, `/login`, `/signup`, `/auth/*`) and pages that read no database
(`/plan`, `/progress`) resolve instantly, so a skeleton there only flashes. Those
screens fetch on mount instead, and own their loading state in-component.

## Develop

```bash
npm install
cp .env.example .env.local   # then edit NEXT_PUBLIC_API_URL if needed
npm run dev                  # http://localhost:5000
```

## /ops admin console

Staff-only, gated by per-module permissions (`src/lib/local/staff.ts`).

**One sidebar, no tabs.** The console used to carry two navigation bars — a header
strip of buttons plus a tab row that existed only on `/ops` — which left half the
screens reachable only from the dashboard. `(console)/ops-shell.tsx` now renders a
single grouped sidebar (Dashboard / Operations / People / Insights / Settings) from
the layout, so it is present on every screen and anywhere reaches anywhere in one
click. The top bar holds only the logo (home), the alert bell and sign out; below
900px the sidebar becomes a drawer. A group whose every item is hidden by
permissions disappears with it.

The five dashboard sections became **real routes** — `/ops`, `/ops/listings`,
`/ops/bookings`, `/ops/applications`, `/ops/verifications` — each rendering
`ops-dashboard.tsx` with a fixed `section`. As tabs they had no URL, so nothing
could link to them; the alert centre's own "ID verifications to review" pointed at
`/ops?tab=verifications`, a query string nothing read, and landed on the Overview.
Reaching a section without its module gets a no-access card and a 403 from the API.

| Page | Module | What it does |
| --- | --- | --- |
| `/ops` | `overview` | Money (commission earned / expected, host payouts), the queues needing attention, top-line counts, app download links |
| `/ops/listings` | `listings` | Properties, with approve / publish / hide / delete and the free-text resort review |
| `/ops/bookings` | `bookings` | Reservations with guest paid / host payout / commission per row, and totals over the loaded page |
| `/ops/applications` | `applications` | The host-application queue |
| `/ops/verifications` | `verifications` | Submitted ID documents, filterable by decision |
| `/ops/users` | `users` | Searchable directory of every guest and host, and one person's full profile — listings, bookings, payments, messages, documents — plus block / remove / restore |
| `/ops/activity` | `overview` | Everything that happened on the site — signups, sign-ins, listings, bookings, payments, cancellations. **Derived**, so it shows full history rather than starting at deploy |
| `/ops/alerts` | `overview` | Every queue waiting on a human, filtered to the modules you hold, with how long the oldest item has waited. Also the bell in the header |
| `/ops/reports` | `reports` | Abuse reports filed by guests and hosts. The table and filing API existed for months with no screen — nothing filed had ever been read |
| `/ops/audit` | `audit` | Every staff action, who did it and when. **Super admin only** |
| *(no screen)* | `documents` | A capability, not a tab: permits opening ID and ownership documents from the Verifications and Listings queues. Every open writes a `document_viewed` row to `staff_audit_log` |
| `/ops/analytics` | `analytics` | Booking, payment and cancellation reports with a shared filter bar, plus CSV/Excel export |
| `/ops/resorts` | `resorts` | Resort catalog and the pending-submission queue |
| `/ops/staff` | `staff` | Moderator accounts and their permissions (super admin only) |
| `/ops/payments` | `payments` | The Instapay destination guests pay to, plus the dispute queue |

### Activity, audit and alerts

**The activity feed is derived, not recorded.** There is no `activity_log` table: six
of the seven event kinds come from timestamps already on real rows (`users.created_at`,
`listings.created_at`, `bookings.created_at`, `payment_proofs.submitted_at`,
`bookings.paid_at`, `bookings.cancelled_at`). That means full history from day one and
nothing that can drift from the data it describes. Each UNION branch is date-windowed
and LIMITed *before* the merge so it uses its own index.

Sign-ins are the exception — nothing recorded them (no `last_login_at`, no user session
table; auth is a stateless JWT) — so `user_logins` is the one new table. It carries an
IP and a user agent, so the staff-cleanup cron purges it at **90 days** and is now
scheduled daily in `vercel.json`. Writing it is best-effort: a telemetry failure must
never block a sign-in.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/local/admin/activity?kind=&q=&from=&to=&limit=&offset=` | `kind` is comma-separated; returns `hasMore` rather than a total, because counting a seven-branch UNION costs as much as the page |
| GET | `/api/local/admin/audit?q=&action=&target_type=&from=&to=` | Super admin only. `actions` lists what this deployment has actually recorded |
| GET | `/api/local/admin/alerts` | Derived counts, filtered server-side to the caller's modules |
| GET \| POST | `/api/local/admin/reports` | Triage queue; `{ id, action:'resolve'\|'dismiss' }` |

**Every admin mutation is now audited.** The previously-unaudited ones included the two
most consequential actions in the system — changing the Instapay destination (where
guests send money) and sending a broadcast to every user. The backend repo had *no*
audit call sites at all; it now writes them too, and its `admin/host-applications`
route was moved off the pre-RBAC `users.role='admin'` check onto the staff module gate
it should always have used.

**Polling.** The dashboard and the alert centre refresh every 30s. The hook pauses when
the tab is hidden, and on a 401 it **stops and says so** rather than redirecting — a
background poll that yanked an operator to the login page mid-edit would be worse than
stale numbers. It deliberately does not touch the idle timer, which resets only on real
input.

### Documents and verification

Identity documents (`id_verifications.image_data` / `back_image_data` /
`selfie_image_data`) and proof-of-ownership (`listings.ownership_doc`) are stored
base64-inline like every other World-1 image. Three rules govern them.

**1. `users.verification_status` is the source of truth.** `id_verifications` is the
submission log; the user row is what every badge reads — the mobile apps'
`getUserBadges`, `host_verified` on every listing payload, the web host profile,
listing pages and search cards. They used to disagree: `/ops` wrote only the
submission row, so the iOS and Android verified badges were permanently dark and
`users.verified_at` was never written by anything. Vocabulary is
`unverified | pending | verified | rejected`, where `unverified` means "never
submitted". Submitting sets `pending` — except for an already-verified account, which
keeps its badge while a renewed ID is reviewed rather than going dark mid-review.

**2. Documents are never shipped in bulk.** The verification queue and the listings
queue return `has_front` / `has_back` / `has_selfie` / `has_ownership_doc` booleans.
The bytes come one request at a time from the endpoint below. Before this, opening the
Verifications tab handed you every pending submission's three ID photos, and opening
the Listings tab handed you every pending ownership document, with no record either way.

**3. Every document open is recorded, or it doesn't happen.**

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/local/admin/documents/:kind/:id` | `kind` ∈ `id_front\|id_back\|id_selfie\|ownership`. Returns image **bytes**; `415` if the stored value isn't an allowlisted image, `404` if there's nothing there. Requires **both** `documents` and the owning module (`verifications` for IDs, `listings` for ownership) |
| GET | `/api/local/admin/verifications?status=` | `pending` (default) `\|verified\|rejected\|all` — a decided case stays reachable so it can be reopened |
| POST | `/api/local/admin/verifications` | `{ id, action:'verify'\|'reject'\|'pending', note? }`. Writes both tables in one transaction and records the deciding staff member |

The `documents` module is a **capability, not a screen** — it has no `/ops` tab, and
holding it doesn't grant a queue you weren't given; it lets you open a document you
could already reach. The audit write for a document view deliberately **throws** —
unlike `logStaffAction`, which swallows errors so an audit hiccup can't break the
action it's auditing. Here "log who viewed what" *is* the feature, so no log means no
bytes. Don't reconcile the two by routing document views through `logStaffAction`.

Responses carry `no-store, private`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, and — unlike every other admin route — **no
`Access-Control-Allow-Origin`**. Identity documents must not be readable
cross-origin; don't "fix" that by copying the `CORS` const from a neighbour.

### Users API

The directory, the profile, and the account lifecycle. All gated by the `users` module.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/local/admin/users?q=&status=&role=&sort=&limit=&offset=` | `{ users, total, filter }`. `q` matches email, name or phone; `status` ∈ `all\|active\|blocked\|removed`; `role` ∈ `all\|host\|guest`; `sort` ∈ `recent\|oldest\|name\|bookings`; `limit` ≤ 200. Bad input is a `400`, never a 500 |
| GET | `/api/local/admin/users/:id` | `{ user, listings, bookings, payments, conversations, documents, stats }` — the profile. Message bodies and document images are **not** included |
| POST | `/api/local/admin/users/:id` | `{ action:'block'\|'unblock'\|'remove'\|'restore', reason? }`. `block`/`remove` require a reason. `restore` is **super admin only** |
| GET | `/api/local/admin/users/:id/thread/:conversationId` | The message bodies of one thread. **Writes a `user_thread_viewed` audit row on every call** |
| POST | `/api/local/admin/users` | `{ id, action:'activate'\|'make-host'\|'remove-host' }` — email verification and host access |

Every mutation writes to `staff_audit_log` (`user_blocked`, `user_unblocked`,
`user_removed`, `user_restored`, `user_thread_viewed`, `user_activate_email`,
`user_set_host`). Before this, user changes — including a hard delete — left no trail
at all.

### Account status — block and remove

`users.account_status` is `'active' | 'blocked' | 'removed'`, with `status_reason`,
`status_changed_at` and `status_changed_by` alongside it. One column rather than a
pair of flags, so every enforcement site tests one thing and the two states can never
both be true.

- **Block** is reversible suspension. **Remove** closes the account and also refuses
  a fresh signup on that email. Both hide the person's published listings; going back
  to active republishes **exactly** the ones that were hidden — that is what
  `listings.unpublished_by_admin` is for, so a listing the host took down themselves
  stays down.
- **Nothing is deleted.** Bookings, payments and messages survive a removal so a
  dispute can still be settled. The old hard delete is gone from `/ops`, and the
  backend's `DELETE /api/local/admin/users/:id` now answers `410 Gone`.
  `adminDeleteUser` remains **only** for self-service deletion at
  `/api/local/account` (App Store 5.1.1(v) / Google Play).
- **Enforcement.** User tokens are stateless 30-day HMACs with no session table and
  no revocation, so status is re-read on every request in `getUserFromRequest` — one
  chokepoint covering every authenticated route. Routes that *mint* a token run
  before there is a session, so `login`, `verify-otp`, `resend-otp`, `signup` and the
  social providers each call `blockedAccountResponse` themselves; social sign-in
  checks **before** `upsertSocialUser`, which would otherwise let a removed user
  reactivate themselves. `createBooking` additionally refuses a blocked host's
  listing, so a deep link can't book around the hiding.
- **The rejection is `403` with `{ error, accountStatus }` and deliberately no
  `needsVerification`.** iOS and Android route `403 + needsVerification:true` to their
  OTP screen and otherwise display `error` verbatim, so this shows our message with
  no app change — but adding that key would send a blocked user to a verification
  screen they can pass and still be refused.

### Paying for a stay

**`/pay/<bookingId>`** — how to pay on the left (the QR, handle and deep link, via the
shared `InstapayDetails`), the screenshot upload and an **"I have paid"** button on the
right. It stacks on narrow screens. Reached from Pay now on `/reservations`, and gated
on the booking being yours, confirmed, and not already paid.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/local/bookings/:id/payment-proof` | `{ image, method? }` — the guest submits their receipt. Sets `payment_status = 'submitted'` |
| GET | `/api/local/bookings/:id/payment-proof` | The latest screenshot, for the guest or an admin |
| GET | `/api/local/admin/payments` | `{ pending, disputes }` — two queues |
| POST | `/api/local/admin/payments` | `{ booking_id, action }` — `accept`/`reject` decides a new screenshot, `approve`/`uphold` resolves a dispute |

**Who confirms a payment: QuickIn, not the host.** Money goes to QuickIn's Instapay
account, so an admin accepts or rejects the screenshot in `/ops/payments`. Hosts still
accept or decline the *reservation*; they no longer see the guest's bank screenshot at
all.

Three things this replaced, each of which was broken:

- **A payment made through the website went nowhere.** A guest can only pay once a
  booking is `confirmed`, but the only path that could approve a fresh screenshot
  required it to be `pending` — and the admin queue was filtered to disputes. Proofs
  sat in `submitted` with no reviewer, and the guest couldn't even escalate.
- **"Pay now" didn't take a payment.** It POSTed to a mock endpoint that stamped
  `paid_at` on the caller's own booking — any guest could mark themselves paid without
  transferring anything, and it counted toward `gross_paid`. That route is deleted.
- **The guest was invited to pay twice.** `/reservations` read a derived
  `paid_at IS NULL ? 'unpaid' : 'paid'` field, which cannot express "submitted", so a
  guest who had already uploaded a receipt still saw Pay now. Everything now goes
  through `paymentStageFor`.

Rejecting a screenshot leaves the booking **confirmed** — the guest uploads a clearer
one. The old host path flipped the whole reservation to `rejected`, cancelling a real
booking over an unreadable photo.

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
| GET | `/api/local/admin/analytics/revenue` | Guest gross, commission, host payouts, refunds, payout estimates |
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
  They are the host's price split by whether the stay has ended.
- **Every money figure is the guest-facing one.** `bookings.total_price` stores the
  *host's* raw price, and the commission is a markup on top of it, so a report that
  summed the column would understate what was collected. Gross, trend and by-resort
  values all go through `sqlWithCommission()`; commission is
  `bookingCommissionSql()` — guest price minus raw price — not `total_price × rate`,
  which ignores the round-up to 10 EGP and so never reconciles with the real charge.
  `hostPayouts` is the raw price **in full**: the markup was never deducted from the
  host. (This report previously used the retired fee model, reporting hosts at 90% of
  a total they were in fact paid entirely.)

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
| `analytics-core.ts` | Filter parsing and validation, the `buildReportWhere` SQL builder (placeholder numbering, the date-column injection guard), refund math, CSV escaping and formula-injection defusing. It holds **no** commission math on purpose — see `commission-core.ts` |
| `commission-core.ts` | The markup and its round-up to 10 EGP, rate parsing and the blank-row trap (`Number('')` is 0, which would read as a 0% commission), and the SQL builders — including that `bookingCommissionSql()` is guest minus raw, never a percentage |
| `resort-core.ts` | Resort name normalization, slug collision (`Amouage` = `amouage` = `AMOUAGE.`), typo distance |
| `user-admin-core.ts` | Users-list query parsing and clamping, the full block/remove transition matrix, the `ORDER BY` injection guard, blocked-login copy |
| `activity-core.ts` | Activity/audit filter parsing, the UNION branch limits, the audit-action label map, and `alertsFor` — including that an operator never receives an alert for a module they don't hold |
| `payment-flow-core.ts` | Which stage a booking is at (`paymentStageFor`), the shared `canPay` predicate, what an admin decision writes, and the proof-image validator — including that a submitted screenshot is never "awaiting payment" |
| `document-core.ts` | Document-kind validation, the data-URL parser and its mime allowlist (SVG and HTML are rejected — these bytes render in an admin's browser), the verification state machine, and which module owns which document |
| `xlsx.ts` | Cell typing (numbers stay numeric so Excel can sum them), sheet-name sanitizing, filename safety |

Those modules deliberately have **no runtime imports** — Node's ESM resolver
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
