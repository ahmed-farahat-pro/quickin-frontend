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
| `NEXT_PUBLIC_FX_RATES_PER_EGP`  | JSON object of EGP-per-unit exchange rates, e.g. `{"USD":49.10,"EUR":53.40}`. Overrides the built-in snapshot — see **Display currency** below. |

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
| POST   | `/api/auth/forgot-password` `{ email }`                     | — (always `{ sent: true, cooldown }`) |
| POST   | `/api/auth/reset-password` `{ email, code, password }`      | — (returns `{ token, user }`) |

### Password reset

`/login` → **Forgot password?** → email → 6-digit code + new password → signed in.
Two routes, the same pair and the same contract the backend serves to the iOS and
Android apps (`ForgotPasswordView.swift`, `ForgotPasswordScreen.kt`), so a guest who
resets on their phone and a guest who resets on the web go through one flow.

The code is the same 6-digit OTP signup and login already mail — `otp_codes`, a 10
minute TTL, five wrong tries and it dies — so this added **no** table and no migration.

Two properties worth keeping:

- **It cannot be used to find out who has an account.** `forgot-password` answers
  `{ sent: true }` for every address, and `reset-password` gives one message —
  *"That code is invalid or has expired."* — for a wrong code, an expired code and an
  email with no account alike. A blocked or removed account is the one exception and
  is told so plainly: it can't reset its way back in, and saying so saves a support
  round trip that the generic reply above has already made safe.
- **`devCode` never travels once mail is live.** With no `MAIL_BACKEND_URL` /
  `MAIL_RELAY_SECRET` (local dev) the code comes back in the response so the flow
  works offline; `mailRelayConfigured` gates it and
  `test/unit/password-reset-core.test.mjs` fails if that gate is ever inverted.

A successful reset also signs the user in and marks the account email-verified —
holding a code we mailed is exactly the proof the OTP gate asks for, and without it a
never-verified user would reset their password only to be bounced to the OTP screen.

## Pages

- `/explore` — searchable listings grid + List/Map toggle.
- `/explore/[id]` — listing detail + reserve panel.
- `/login`, `/signup` — auth (stores token in `localStorage`). `/login` also carries the
  email-verification step and the **password reset** — see above.
- `/reservations` — the signed-in user's bookings.
- `/account` — profile, identity, password, **Preferences** (display currency + language) and — for an approved host — **Payment information**. See below.
- `/host/apply` — the "become a host" application. See below.
- `/links` — the bio linktree. See below.
- `/plan` — static launch-plan page.

### `/login` and `/signup` — signing in is optional, so the exit is always on screen

Most of QuickIn is browsable without an account, but both auth pages are full-page
cards with none of the site's chrome around them. That made them one-way doors: a
guest who opened sign-in and changed their mind had only the browser's Back button.

`AuthExitLink` (`src/components/features/auth/auth-exit-link.tsx`) is the way back —
a "Keep browsing without an account" link above the card, plus the logo, which is now
a link to the same place. It sits outside every view switch, so it survives the OTP,
forgot-password and reset steps too; those keep their own "Back to sign in", which is
the other, narrower escape.

Where it goes is `resolveReturnHref` in `src/lib/local/auth-exit-core.ts`: the
referring page when that's usable — query string and all, so a guest who came from a
filtered search gets those filters back — and `/explore` otherwise. "Otherwise" covers
a missing or unparseable referrer, another origin (an external referrer isn't
"browsing", and honouring one would let any site choose where our sign-in page sends
people), and the auth pages themselves, which would be a bounce rather than an exit.

The referrer only exists on the client, so the hook reads it through
`useSyncExternalStore` with `/explore` as the server snapshot. The rendered element is
a real `<a href>` either way — it still works when JS is what broke.

### `/host/apply` — the phone number has to be a phone number

The application is how our team reaches an applicant, so the phone field is validated
rather than merely required: it used to accept anything a keyboard produced, and `asdf`
reached review as a number nobody could dial.

`src/lib/local/phone-core.ts` holds the rule, and **both ends run it** — the form
(`filterPhoneInput` drops non-phone characters as they are typed, so a letter never
lands in the field at all, then `isValidPhone` checks the shape on submit) and
`submitHostApplication` in `db.ts`, which answers `400 { fields: { phone } }` for
anything the browser let through. `type="tel"` is a keyboard hint, not a filter, which
is why the filtering is ours.

It normalizes as well as validates, on the same reasoning as the payout wallet number:
the same mobile typed `+20 10…`, `0020 10…` and `010…` is stored once, as
`01XXXXXXXXX`, so one applicant is one row in `/ops` and not three. Egyptian numbers
come back in the local form (a mobile is 01 + 9 digits **exactly**, so a number typed a
digit short is caught here rather than by the person calling it); everything else keeps
`+<digits>` E.164, because a host abroad still has to be reachable. Arabic-Indic and
Persian digits fold to ASCII — the site runs in Arabic, and a filter that dropped `٠١٠…`
would empty the field of a host typing their own number correctly.

Refusal is a `null`, not a throw: every caller is building a per-field error map and the
message belongs to the caller — the form's is localized (`hostApply.errors.phoneInvalid`
in all four locales), the API's is not.

`phone-core.ts` is **byte-identical to the backend's copy**, guarded by
`quickin-backend/scripts/check-phone-core-parity.mjs`: the iOS and Android apps apply
through `quickin-backend`, and both projects write the same `host_applications.phone`.
A number the web stored as `01012345678` and the apps stored as `+201012345678` is one
host filed twice, and no operator reading `/ops` can tell that from two people.

`national_id` next to it is deliberately **not** validated this way — a foreign
applicant's passport number has letters in it.

### `/account` — Profile photo

`users.avatar_url` had been **read** everywhere since the beginning — the identity card
on `/account`, the host card on a listing, comments, reviews — while the only thing that
ever **wrote** it was the Google sign-in merge. Both apps have had a photo picker for as
long as they have had an Edit profile screen; the web form sent `full_name` and nothing
else, so anyone who signed up with an email address had no way to have a face on this
site at all. That was the bug.

The control is the avatar itself (`src/app/account/avatar-picker.tsx`): the circle, the
name and add/change/remove are one client component mounted inside the identity card,
and the email and verification chip below stay server-rendered as its children. A photo
**saves on pick**, not on a Save button — it has nothing to share with the profile form,
and picking a photo is already the confirmation.

**It is stored, not linked.** The bytes are a base64 `data:` URL in the column, the same
way listing photos and ID documents are stored (this stack has no object storage of any
kind — see `src/lib/image.ts`), and the same shape both apps already send. The browser
downscales to **256px at JPEG q0.8** before upload, which is exactly what iOS's
`QKAvatarImage.makeDataURL` does, so the same photo weighs the same whichever client it
was picked on — `test/unit/avatar-core.test.mjs` fails if either side moves.

`src/lib/local/avatar-core.ts` holds the rules, and the one that matters is that an
`https://` URL is **refused**. Before this, `PATCH /api/local/users/:id` stored
`String(body.avatar_url)` — whatever arrived. A remote URL there would be fetched by
every guest who opened a listing that person hosts, handing whoever owns that host an IP
log of the people browsing it, and the bytes behind it could be swapped for something
else the day after a moderator cleared the photo. Neither is possible when the image
*is* the value. The same module caps a photo at `MAX_AVATAR_CHARS` (~300KB decoded,
about ten times what a real 256px photo comes out at) because this column does not stay
on the profile page: `getListingById` selects it as `host_avatar`. `null` or `''` clears
the photo to SQL NULL — the old code stored the literal text `null` when a client meant
"remove it".

**Moderation is a way down, not a queue in front.** A photo goes live the moment it is
picked, on the site and in both apps, and it is the one field on a profile that no filter
can read: `contentguard` catches a phone number typed into a name or a bio, but not one
written on paper and photographed. So `/ops → Users → (a user)` now shows the photo next
to the name — a report that says "profile picture" is unanswerable from a table of
bookings — with a **Remove photo** button beside the account actions. It takes the
picture down and touches nothing else; blocking the account over it stays a separate,
reasoned decision. Every press is audited as `user_photo_removed`, including one that
found no photo to remove, and `/ops → Reports` already links a `target_type='user'`
report straight to that screen.

### `/account` — the profile the apps already had

Age, phone number and "About you" are editable here, next to the name. They were on
Edit profile in both mobile apps from the start and on no web screen at all: the apps
wrote `users.age`, `users.phone` and `users.bio` through the backend's
`/api/local/profile`, while the web's profile form sent `full_name` and nothing else.
Someone who signed up on the site could not fill in the profile the site shows, and a
bio typed on a phone was invisible on the web. All four now write the same three
columns, so one person editing on either has one profile.

Each field is optional and each **clears** when emptied — a bio someone regrets has to
be able to go away, which is why the web route sets the columns explicitly rather than
`COALESCE`-ing them the way the mobile API does. What decides them:

| Field | Rule | Where |
| --- | --- | --- |
| Age | A whole number between `MIN_AGE` and `MAX_AGE` (13–120). `3e2`, `0x22` and `34.5` are refused rather than coerced — `Number('3e2')` is 300, and an age nobody is, silently stored, is worse than a form that pushes back. Arabic-Indic digits are digits. | `src/lib/local/profile-core.ts` |
| Phone | The same `normalizePhone` the host application and the mobile API use, so `+20 10…`, `0020 10…` and `010…` are one stored number. Only the user themselves ever reads it back — the public `GET /api/local/users/:id` does not carry it. | `src/lib/local/phone-core.ts` |
| About you | At most `MAX_BIO_LENGTH` (500) characters, counted as characters and not UTF-16 units, on the **normalized** text — so trailing newlines from a paste are not what pushes it over. Line breaks survive; a bio is a paragraph, not a name. It also takes the contact guard, because it is free text shown next to the name. | `profile-core.ts` + `moderation.ts` |

The plausibility bounds on age are deliberately not an eligibility rule. Whether an
account has to be 18 to book belongs at the booking door, where it can be enforced
against an ID, rather than on a self-declared profile field.

The form runs the same cores before it submits, so the message a guest gets is the one
the API would have given; the route echoes `{ field, ageProblem | bioProblem }` so a
refusal lands under the input it belongs to rather than at the foot of the card.

### `/account` — Payment information (host payout method)

Where QuickIn sends a host's earnings. The card shows one of two states: the **form**
(method picker — Bank account / InstaPay / Wallet — plus the fields that method needs)
or a **preview** of what is on file, so the host can confirm it saved correctly. It
renders only when `host_status === 'approved'`; the route behind it answers
`403 {code:'not_host'}` to anyone else.

The rules live in `src/lib/local/payout-method-core.ts`, byte-identical to the backend's
copy and guarded by `quickin-backend/scripts/check-payout-method-core-parity.mjs`. All
three destinations are stored and shown back **whole** — an IBAN exists to be handed
out, and a masked one is one a host cannot check. A bank account needs the bank plus an
IBAN *or* an account number; the IBAN is validated on its mod-97 checksum and its
country length, and read back grouped in fours the way a bank prints it.

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

## `/signup` — email addresses are checked against the real root zone

`layla@email.con` used to create an account. Nothing in the stack disagreed with it:
`<input type="email">` and the old `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` both only ask
whether an address is *shaped* like one, and by that measure `.con` is fine. It isn't
a delegated TLD, so the 6-digit code goes nowhere, the guest waits at the OTP step for
an email that cannot arrive, and the row sits in `users` unverified forever.

The rules now live in **`src/lib/local/email-core.ts`**, which holds a snapshot of the
[IANA root zone](https://data.iana.org/TLD/tlds-alpha-by-domain.txt) — every delegated
TLD, ~1,438 of them — and checks the extension against it. It has no imports, so the
same code runs in all three places that need it:

| Caller | What it does |
| --- | --- |
| `src/app/api/auth/signup/route.ts` | The decision. Returns 400 with a plain-English `error` **and** a structured `emailProblem` (`{ code, tld?, suggestion? }`) |
| `src/app/signup/page.tsx` | Checks on blur and before submit, so a typo is caught without a round trip, and localizes `emailProblem` into the four locales |
| `src/lib/validations/schemas.ts` | `signUpSchema` / `signInSchema` — the auth modal's `z.string().email()` accepted `.con` too |

Five problem codes, in the order they are checked: `required`, `tooLong`, `format`,
`unknownTld`, `disposable`. Order is the point — a guest who typed `a@mailinator.con`
is told about the extension, fixes it, and *then* hears about the blocklist, so
`unknownTld` is decided first. `isValidEmail` deliberately still returns `true` for a
disposable address: that is a policy call for signup to make, not a claim that the
string isn't an address, and `resend-otp` only asks the latter.

**A rejected address gets a did-you-mean** (`layla@gmail.con` → "Did you mean
layla@gmail.com?"), matched against a short list of popular mailbox providers and
extensions with a transposition-aware edit distance — `gmial.com` is one edit, not two.
The list is short on purpose: `con` is exactly one deletion from `cn` (China) as well as
from `com`, so searching the whole root zone for a near match would confidently suggest
whichever it reached first.

What this does **not** do is check that the domain exists or accepts mail — no MX
lookup, no network call in the signup path. The OTP already proves deliverability;
this only stops the addresses that provably cannot receive one.

New TLDs are delegated a few times a year, and the failure that matters is the
opposite of the bug: an over-tight list turns away a paying guest with no appeal.
`npm run check:tlds` diffs the snapshot against IANA and prints what to refresh. It
needs the network, so it is **not** part of `npm run check`; run it by hand every few
months, or the moment someone reports a valid address being refused.

## Password policy — one floor, all three doors

`123456` used to create an account. Signup asked for six characters of anything, and
the two other doors into the same column disagreed with it and with each other:
`/api/auth/change-password` wanted eight, `password-reset-core.ts` kept its own copy
of the six-character rule, and `signUpSchema` a third. A floor only one door enforces
is not a floor — signing up strong and immediately resetting weak was a two-request
bypass.

The rules now live in **`src/lib/local/password-policy.ts`**, which — like
`email-core.ts` — has no imports, so the same code decides in every place that needs
an answer:

| Caller | What it does |
| --- | --- |
| `api/auth/signup`, `api/auth/reset-password`, `api/auth/change-password` | The decision. 400 with a plain-English `error` **and** a structured `passwordProblem` (`{ code }`) |
| `app/signup/page.tsx`, `app/login/page.tsx` (reset step), `app/account/account-forms.tsx` | Check before the request and localize `passwordProblem` into the four locales |
| `components/features/auth/password-checklist.tsx` | The live tick-list under the field — `passwordRuleStatus`, so what ticks is literally what the server will apply |
| `lib/validations/schemas.ts` | `signUpSchema` — the auth modal's `.min(8)` accepted `12345678` |

Five rules, checked in the order the checklist shows them: **8 characters**,
**uppercase**, **lowercase**, **digit**, **symbol**. Order is the point — the message
a guest gets names the first box they haven't ticked, not a paragraph of policy. Three
more checks can't be drawn as a box and are decided after: `whitespace` (a password of
only spaces), `email` (an account's own address is the top of every credential-stuffing
list, and a reset is exactly where people reach for it), and `common`.

**`common` strips the decoration people add to get past exactly this kind of rule.**
`Password1!` and `P@ssw0rd123` both clear all five character rules; both reduce to
`password` and are refused. The blocklist is a few dozen bases, not a dictionary, and
it matches on the *whole* reduced password — `Cairo-Nights-42!` is not `cairo`.
A longer list would start refusing passwords that merely contain a common word, which
is a support ticket rather than a security win.

Two limitations worth knowing. **A password written purely in a script without case
(Arabic, for one) cannot satisfy `uppercase`/`lowercase`** — the checklist says so up
front rather than failing on submit, but it is a real constraint on an app whose
guests are Egyptian. And the policy is **not web-only**, because it can't be:
`quickin-backend`, which the iOS and Android apps call, signs into the same `users`
row, so a six-character rule there was a way to weaken a web account from the apps.
`password-policy.ts` is copied into that repo byte-identical and guarded by
`quickin-backend/scripts/check-password-policy-parity.mjs`, the same treatment
`resort-core.ts` and `name-policy.ts` get. Edit one copy, copy it over the other.

Existing weak passwords keep working — nothing rehashes or expires them; the rules
apply the next time one is set.

## A name has to be a name

Signup asked that the name field be non-empty, so `12345` created an account whose
display name is `12345` — what a host reads next to a booking request, what a review
is signed with, and what an operator matches against an ID document. Presence was
never the test.

**`src/lib/local/name-policy.ts`** decides now, and like `email-core.ts` it has no
imports, so the same code runs everywhere:

| Caller | What it does |
| --- | --- |
| `api/auth/signup` (here and in `quickin-backend`) | The decision. 400 with a plain-English `error` **and** a structured `nameProblem` (`{ code }`) |
| `app/signup/page.tsx` | Checks on blur and before the request, and localizes `nameProblem` into the four locales (`namePolicy.errors.*`) |
| `lib/validations/schemas.ts` | `signUpSchema` — its `.min(6)` accepted `123456` while refusing `Ali M` |
| `api/local/users/[id]` (PATCH) | The rename door. A gate only signup enforced would let a guest sign up as `Layla` and become `12345` a minute later |
| `api/local/host/apply` + `app/host/apply/apply-form.tsx` | The name an operator reads against the ID photos |
| iOS `Sources/NameRules.swift` | The Swift twin: same rule, same problem cases, so the app says it at the field instead of after a round trip |

The rule that does the work: a name must contain **letters** (`\p{L}`, so Arabic and
Han count), at least two of them, in at most 60 characters. Deliberately **not** "no
digits" — Franco-Arabic writes real names with numerals (`Ma7moud`, `3omar`), and a
digit ban would turn away exactly the guests this app is for. `letters` is reported
before `tooShort` so `5` hears the thing that is actually wrong with it.

A request with **no** name at all is still accepted, because social sign-in has none.
It falls back to the local part of the address — and to `Guest` when that isn't a name
either, since `0100@gmail.com` would otherwise seed the very thing the rule refuses.

`name-policy.ts` is byte-identical to the backend's copy; the backend's
`scripts/check-name-policy-parity.mjs` fails if they drift.

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
| `/ops` | `overview` | Top-line counts and the graph they drive (click a tile), money (commission earned / expected, host payouts), the queues needing attention, app download links — in that order, with a one-line alert strip pinned above them |
| `/ops/listings` | `listings` | Properties, with approve / publish / hide / delete and the free-text resort review |
| `/ops/bookings` | `bookings` | Reservations with guest paid / host payout / commission per row, and totals over the loaded page |
| `/ops/applications` | `applications` | The host-application queue |
| `/ops/verifications` | `verifications` | Submitted ID documents, filterable by decision |
| `/ops/verifications` | `id_changes` | **Same screen, second queue:** requests to change the ID number already on an account. Granted separately, so correcting a number can be delegated without handing over the decision that verifies an account and gates its listings. Holding either module opens the page; each queue renders only for the operator who holds it, and the sidebar names the item for whichever they have |
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
| GET | `/api/local/admin/documents/:kind/:id` | `kind` ∈ `id_front\|id_back\|id_selfie\|ownership\|id_change_front\|id_change_back`. Returns image **bytes**; `415` if the stored value isn't an allowlisted image, `404` if there's nothing there. Requires **both** `documents` and the owning module (`verifications` for IDs, `listings` for ownership, `id_changes` for the change-request pair — whose `:id` is the `id_change_requests` row, not a verification) |
| GET | `/api/local/admin/verifications?status=` | `pending` (default) `\|verified\|rejected\|all` — a decided case stays reachable so it can be reopened |
| POST | `/api/local/admin/verifications` | `{ id, action:'verify'\|'reject'\|'pending', note? }`. Writes both tables in one transaction and records the deciding staff member |
| GET | `/api/local/admin/id-changes?status=` | `pending` (default) `\|approved\|rejected` — requests to change an account's ID number, with the before/after values and the declared document type |
| POST | `/api/local/admin/id-changes` | `{ id, action:'approve'\|'reject', note? }`. Approving is the **only** path that writes `users.id_document`, and it deliberately leaves `verification_status` alone — the operator has just examined a document, and resetting a verified host to pending would trip the publish gate and pull their live listings off the market as a side effect of a typo fix. A rejection **requires** a note; it is what the user is shown. Decided once: the guard is in the UPDATE's `WHERE status = 'pending'`, so two operators clicking at the same time cannot both win |

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

### Overview trends — the cards are a graph selector

The Overview's twelve count tiles used to be a dead grid: every number was "as of
right now", so nothing on the screen said whether the platform was growing or
stalling. **Clicking a tile draws its history** in the panel below it — Users by
default. `Total` plots the running total (the tile's own number, rewound); `New`
plots additions per bucket. Range presets are 7 / 30 / 90 days and 12 months, the
last switching to monthly buckets.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/local/admin/stats/trends` | `?range=7d\|30d\|90d\|12mo` (default `30d`) — every metric's series in one response. Module: `overview`, same as `/stats` |

**Three tiles do not click, deliberately.** A tile counts rows matching a predicate
*today*; charting it needs a timestamp for when each row started matching, and these
three have none:

| Tile | Missing |
| --- | --- |
| Published | `listings` has no `published_at` (nor `approved_at`) |
| Pending bookings | `bookings` has `created_at` / `paid_at` / `cancelled_at` — no status-change stamps |
| Confirmed | the same |

They render as plain tiles rather than as a line that silently answers a different
question. If they are ever wanted the fix is a nightly `metric_daily` snapshot
table, **not a cleverer query** — the information is not in the database today.

Three more things worth knowing when reading these lines:

- **Every cumulative series is dated so its last point equals the tile exactly.**
  That is why `hosts` and `verified` date rows by `COALESCE(approval, signup)`: an
  account with no decision stamp (seeded, or flipped straight in the database) must
  still be counted once, or the chart would end below the tile beside it. Rows with
  a NULL date axis are counted in the baseline for the same reason.
- **`baseline`** — rows falling before the window — is what keeps the running total
  honest. Without it the 7-day view would draw the platform's entire user base as
  having arrived last week.
- **The two queue metrics chart submissions, not the queue.** Nothing records when
  an application or an ID left the queue, so a running total there would be
  "submitted ever" — a line that climbs forever and never meets its tile. They are
  flagged `cumulative: false`, which hides the Total/New toggle and prints why.

The `paid` metric is decided by `payment_status`, never `paid_at IS NOT NULL` — the
same refund trap the Analytics API documents below.

**The default range is loaded on the server**, by `(console)/page.tsx` beside the
module check, and handed to the client as a prop — the same shape `/ops/payments`,
`/ops/users` and `/ops/staff` use. The graph is therefore drawn on arrival rather
than fetching for itself after it mounts, which on Vercel meant paying a cold
function and a Neon wake-up the page had already paid for once. If that server load
fails the prop is `null` and the client falls back to fetching, so a hiccup costs a
moment rather than the panel.

Only a **range switch** goes through the API, and each range is cached once fetched,
so going back to one already seen is instant. Switching *tiles* never fetches at all —
every metric is in one response. None of this rides the Overview's 30-second stats
poll; a trend line does not move meaningfully inside half a minute.

Three loading states, in the order they cost an operator: an error says so; nothing
drawn yet gets `OpsSkeletonChart` (only reachable when the server seed failed, or on
a range never loaded); and a range switch **keeps the current chart on screen**,
dimmed, until the new one arrives. Blanking a chart someone is reading in order to
redraw the same shape is the jarring part — the caption shimmers rather than
captioning a held-over 30-day line "in the last 90 days".

Range parsing, bucket math and series filling are pure in
`src/lib/local/overview-trends-core.ts` and covered by
`test/unit/overview-trends-core.test.mjs`; only the two SQL round trips live in
`db.ts`, which assembles the whole payload so the route and the server component
cannot drift into shipping different shapes.

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
| `moderation-core.ts` | The flag threshold (one attempt, and why not three), the three moderator actions and the fact that permanent removal is not one of them, the warning fallback copy, and the 409 `policyWarning` contract all three clients branch on — including that `error` repeats the warning so an old app build still shows it |
| `disputes-core.ts` | Which bookings can be disputed (and why pending and cancelled can't), that `closed` is terminal while `resolved` can reopen, that a no-op transition is refused, and the validators — including that one bad attachment out of four doesn't lose the whole filing |
| `ranking-core.ts` | The search score behind `/explore`'s default order: that a lone 5★ review loses to a large body of good ones **at every platform average** (the assertion that only asked at one average passed against an implementation that did not hold the property), where that rule stops applying, that cancelled and pending bookings are excluded from the SQL, the recency decay and its floor, and that the SQL twin carries the same constants as the TypeScript |
| `password-reset-core.ts` | The guest password reset: code normalization (a code pasted out of a mail client with spaces or a hyphen is not a wrong code), and above all that the reply is byte-identical whether or not the address has an account — plus that `devCode` never appears once mail delivery is configured |
| `password-policy.ts` | The strength rules: that `123456`, `password` and `qwerty` are refused; which single rule a password is told about first (the one the checklist shows unticked); that length counts characters and not UTF-16 units; that Arabic-Indic digits are digits and a space is not a symbol; the account-email rule; and the blocklist's decoration-stripping — `P@ssw0rd123` is `password`, while `Cairo-Nights-42!` is not `cairo` |
| `email-core.ts` | That `.con` (and `cim`, `cmo`, `ocm`, `ner`, `ogr`…) is refused, that the did-you-mean answers `com` and never `cn`, the structural rules (double dots, edge hyphens, the 64/254 limits) — and an equally large half asserting that ordinary addresses still get in (`.eg`, `.com.eg`, `.co.uk`, `.photography`, punycode), because a too-tight TLD list turns away paying guests and is the worse failure |
| `phone-core.ts` | The host application's phone field: that a word is refused and that letters mixed into a real number are refused rather than quietly stripped (a wrong number on file is worse than a rejected form); that the nine ways of writing one Egyptian mobile all normalize to the same `01XXXXXXXXX`; that a mobile a digit short is caught while an Egyptian landline and a foreign E.164 number are not; that Arabic-Indic and Persian digits are digits; and that what survives typing still has to normalize — the filter is not the validator |
| `profile-core.ts` | The age and "about you" fields on `/account`: that an empty field is accepted (all three are optional, and a form that demanded an age to save a name would be a new bug), that `3e2` and `0x22` are refused rather than coerced into 300 and 34, that `٣٤` is thirty-four, that a slipped number pad is caught at both ends — and for the bio, that line breaks survive while a paste's padding does not, that invisibles cannot fill it or its budget, and that the cap is measured on what gets stored, not on what was typed |
| `name-policy.ts` | The signup name: that `12345`, `٠١٢٣٤`, `0100` and `-----` are refused, that `letters` is reported before `tooShort` so `5` hears the real problem, that invisible pasted characters don't make a name non-empty — and the half that matters more, that `Ma7moud`, `Bo`, `Ali M`, `محمد أحمد`, `李伟` and `O'Brien` still get in; plus the email fallback, which can never seed the numeric name the rule just refused |
| `auth-exit-core.ts` | The way out of `/login` and `/signup`: that the referring page wins and keeps its query string (a guest who came from a filtered search gets those filters back), and the four cases that fall back to `/explore` instead — no referrer, an unparseable one, another origin (otherwise any site could choose where our sign-in page sends people), and the auth pages themselves, with locale prefixes stripped first so `/ar/signup` doesn't slip through |
| `currency-core.ts` | The display currency: that an unrecognised cookie falls back to EGP instead of leaving prices in a currency with no rate; that one typo'd code in the rate override drops alone rather than taking the other five down with it, and that a zero rate is refused (it would divide every price into Infinity); and the property the money depends on — a missing rate returns the **stored** price in the **stored** currency, unmarked, never a number invented from a rate we do not have |
| `avatar-core.ts` | The profile photo: that a base64 `data:` JPEG/PNG/WebP gets in and an `https://` link does **not** (the reason is in `/account` → Profile photo above), that HTML, PDF and SVG data URLs are refused, that a mangled base64 payload is not a photo, the size ceiling and the decoded-bytes math behind it, that `null`/`''`/blank all mean "remove" while the literal string `null` does not — and that the 256px / q0.8 constants still match the iOS picker, since a drift there is a photo that weighs one thing on the phone and another on the site |
| `contentguard.ts` | Every de-obfuscation the contact guard undoes (Arabic-Indic/fullwidth/enclosed digits, zero-width and soft hyphens, Cyrillic lookalikes, spelled-out EN/AR numbers, `at`/`dot` spelling, letters used as separators — `A0101 S416 M3280`), the four categories it blocks, the split-across-messages check — and an equally large **false-positive** half, because a guard that rejects "we are 2 adults arriving on the 12th" is worse than one that misses |

Those modules deliberately have **no runtime imports** — Node's ESM resolver
rejects the extension-less relative specifiers used elsewhere in `src/lib/local`, so a
module with no relative imports is the one shape a test can load. Keep pure logic
there and have `db.ts` / `analytics.ts` import it, never the reverse. The backend
README's Testing section is the fuller writeup.

`src/lib/local/resort-core.ts` is **byte-identical** to the backend's copy — both
projects write the same `resorts` table, so a drifted slug would fork the catalog.
The backend's `scripts/check-resort-core-parity.mjs` fails if they diverge.
`contentguard.ts` is duplicated the same way (`check-contentguard-parity.mjs`) — see
below. So is `ranking-core.ts` (`check-ranking-core-parity.mjs`): both projects rank
the same listings from the same reviews and bookings, so a drifted weight would put
the same two chalets in one order on the web and the other order in the apps. And so is
`name-policy.ts` (`check-name-policy-parity.mjs`): both projects create accounts in the
same `users` table, so a name rule that held on one door and not the other would not
hold at all.

## Display currency — what a guest reads, not what they pay

A listing is priced by its host in one real currency (`listings.currency`, in
practice EGP) and a booking is charged in that currency. Everything below is
display: the guest picks a currency to *read* prices in, and nothing about the
money changes.

**Where the switcher is.** Beside the language switcher, everywhere that has one:
the `/explore` header and its mobile menu, both footers, the `/` navbar — and a
**Preferences** card on `/account`, which is where people look for a setting
rather than a control. Before this it was nowhere: the dashboard footer had an
`EGP` button that was a `<button>` with no handler.

**How it is stored.** A `qk_currency` cookie, one year, exactly like `NEXT_LOCALE`
— no column, no migration, and it works signed-out. Server components read it
through `getRequestCurrency()`; client components read the same value out of
`DisplayCurrencyProvider`, which the root layout seeds from the cookie so the
first paint is already right. Switching writes the cookie, updates the provider's
state (client prices change on the spot, including the map pills, without leaving
the Map tab) and calls `router.refresh()` for the server-rendered pages.

**The rates are a hand-maintained snapshot, not a feed.**
`DEFAULT_EGP_PER_UNIT` in `src/lib/local/currency-core.ts` is a table of
EGP-per-unit values with a `RATES_AS_OF` date beside it, shown to the guest on
`/account`. `NEXT_PUBLIC_FX_RATES_PER_EGP` overrides any subset of it per deploy
without a release. **Replace it with a real rate source before these numbers are
treated as anything but an approximation.** Nothing is charged off them.

**So every converted price says so.** `formatDisplayPrice` prefixes `≈`, and the
listing page swaps "Prices in EGP" for "Approximate — charged in EGP". Two
surfaces deliberately do *not* convert their headline number, because it is a
real charge and not a quote: `/reservations` and `/pay/[id]` keep the booking's
own currency in the big text and put the converted figure underneath it as a
second line. A guest comparing the screen to their banking app has to be looking
at the amount the bank will see.

**When there is no rate**, `displayPrice` returns the original price in the
original currency, unmarked. "No rate" and "a rate of zero" arrive as the same
shape, and only one of them is a price — so the fallback is the stored number,
never an invented one. A zero is exact in every currency, so an empty quote reads
`$0` rather than `≈ $0`.

`src/lib/local/currency-core.ts` holds all of the arithmetic and has no relative
imports, so `test/unit/currency-core.test.mjs` can load it directly.

## Search ranking — `/explore`'s default order

The `Recommended` pill (the default, so it is what most guests see) is a performance
score, not a recency list. `getListings` builds its `ORDER BY` from
`src/lib/local/ranking-core.ts`:

```
score = 0.6 × rating component     (guest reviews, shrunk and discounted for doubt)
      + 0.4 × bookings component   (COMPLETED stays only, log-damped)
      + 0.05 if is_guest_favorite
```

Reviews are shrunk toward the platform average **and** discounted by `1.28 / √(n + 5)`,
so a chalet with one 5★ review cannot outrank one with hundreds of good reviews — the
shrinkage alone was not enough for that, see the backend README's "Search ranking" for
the case that proved it. Bookings count only `completed` stays, or `confirmed` ones
whose check-out has passed; **cancelled bookings never count**. Both halves fade with
age. A listing with no history scores an unproven average — below a proven listing,
above a badly-reviewed one — and `created_at DESC` breaks ties, so two brand-new
listings keep exactly the order this replaced.

The score is derived at read time from `reviews` and `bookings`, so a new review or a
completed stay reorders search immediately, with nothing stored and nothing to backfill.
The other three sorts (`price_asc`, `price_desc`, `newest`) are untouched.

The backend README is the fuller writeup, including the weights and the boundary where
the review rule stops applying.

## Contact details are blocked, everywhere a user can type

`src/lib/local/contentguard.ts` keeps phone numbers, email addresses, social handles
and off-platform links out of every free-text field, so a host and a guest can't take
the booking (and the payment) off QuickIn. **The backend README's "Contact details are
blocked" section is the full writeup** — what it detects, how it survives obfuscation,
and why the two copies must stay byte-identical. What is specific to this project:

| Surface | Enforced in |
| --- | --- |
| Pre-booking chat (`POST /api/local/chat`) | `postMessage` (db.ts) |
| Reviews (`POST /api/local/reviews`) | `submitReview` (db.ts) |
| Listing title + description | `createListing`, `updateListing` (db.ts) |
| Profile display name (`PATCH /api/local/users/:id`) | `updateUserProfile` (db.ts) |

This replaced a `redactContact()` helper that silently rewrote matches to `[hidden]`
using three plain regexes. It was bypassed by anything that wasn't ASCII digits —
`٠١٠…`, `０１０…`, "zero one zero", a soft hyphen between digits — and because it
masked rather than refused, a sender got no signal and simply retried until something
slipped through. The guard now **rejects** the write and says why.

`LocalChatPanel` imports the same module client-side and checks before sending, so
the sender gets the answer with no round trip and their text stays in the box. That is
UX only — the server check is the gate, and a client can always skip it.

Errors surface as **400** with the guard's own sentence: routes recognise them via
`isContactBlockedError` (and `isListingInputError`, which now includes them).

## /ops → Moderation

Every blocked attempt is now recorded, so the guard refusing something is no longer
invisible. `src/lib/local/moderation.ts` writes one `policy_violations` row per
blocked attempt — who, which category, which surface, **the full text they typed**,
and whether it was only caught by stitching their recent messages together. The
backend project records the same rows for the mobile apps; the console is here.

**Flagged at one attempt, not three.** The guard already refused the message, so a
row is a recorded attempt rather than a suspicion — and a threshold would hide the
first two attempts by everyone, which is exactly the population worth seeing.
`FLAG_THRESHOLD` in `moderation-core.ts`.

**The queue is people, not attempts.** One user trying forty times is one decision.
Expanding a row loads their whole history verbatim, because a count alone can't tell
a determined evader from someone whose booking reference tripped the guard.

| Action | What it does |
| --- | --- |
| **Warn** | Issues a warning the user must acknowledge before they can send another message (`policy_warnings`). One pending warning at a time — a second would leave them acknowledging one and still gated by the other, with no way to see it |
| **Suspend** | Reuses `adminSetAccountStatus(id, 'blocked')`, so listings hide and unhide exactly as they do from /ops → Users, and the same token check refuses them. Reversible from Users |
| **Clear** | A false positive, or a first slip not worth acting on |

Permanent **removal is deliberately absent** here: it stays behind the `users` module,
so a moderator granted only `moderation` can stop someone without being able to erase
them.

**All three actions mark the user's outstanding rows reviewed**, which is what drains
the alert. Without that the count only ever climbs and the alert centre trains people
to ignore it — the same reason `ALERT_SOURCES` drops zero-count queues. Flagged users
appear as `flagged_users` in `adminStats` and in the alert centre for anyone holding
the module.

Reading someone's attempts means reading what they wrote, so the read writes a
`moderation_viewed` row to `staff_audit_log`, like documents already do.

### The acknowledge gate

While a warning is unacknowledged, every chat send answers **409** with
`{ error, policyWarning: { id, message } }`; `POST /api/local/policy-warning { id }`
clears it. Enforced server-side so no client can skip it, and `error` repeats the
warning text so a mobile build that predates the dialog still *shows* it rather than a
dead end. Nothing else notifies the user — no email, no push, by design — so the
dialog is the delivery as well as the gate.

`LocalChatPanel` swaps its composer for the warning rather than showing it above:
a notice you can ignore while still typing is not a gate. The draft is kept, so
acknowledging reopens the composer with the message still in it. iOS and Android do
the same via `PolicyWarningBanner`.

**Deploy order matters here.** Ship the migration first, then the two web projects,
then the app builds. Between the server deploy and the app release, a warned user on
an old build sees the warning text inline and cannot send — correct, but they can only
clear it from the web until they update.

## /ops → Guest disputes

Issues guests raise about a stay — before, during or after. **The backend
README's "Guest disputes" section is the full writeup**: how this differs from the
payment dispute and from abuse reports, which bookings are eligible, and why the
description is deliberately not content-guarded. What is specific to this project:

| Surface | Where |
| --- | --- |
| Guest files / follows | `DisputePanel` on `/reservations` — collapsed to one link until tapped, replaced by the status and history once raised |
| Admin queue | `/ops/disputes`, `disputes` staff module |
| Admin API | `GET/POST /api/local/admin/disputes` |

**A status change is a compare-and-set.** The route reads the dispute, checks the
transition is legal, then updates `WHERE status = <what the operator saw>`. Two
people working the queue at once can't both act on a stale screen — the loser gets
a **409** telling them to refresh. Every change writes a `dispute_events` row and a
`staff_audit_log` row.

**On "Resolved" the note is the outcome.** The same text goes to
`disputes.resolution` and to the history row, because it is what the guest reads —
making the operator type it twice would guarantee the two drift.

Flagged as `open_disputes` in `adminStats` and in the alert centre for anyone
holding the module; `resolved` and `closed` both drain it.

**A note on `ORDER BY` here.** These queries alias `to_char(created_at, …) AS
created_at`, and Postgres resolves a *bare* identifier in `ORDER BY` to the output
column first — so an unqualified `ORDER BY created_at` sorts by the
second-precision **string**, and rows in the same second fall back to the uuid
tiebreak. That scrambled the dispute timeline. Every such `ORDER BY` in both repos
is now table-qualified; if you add one, qualify it.

## Build

```bash
npm run build
npm start                    # serves on port 5000
```

The build does **not** require the backend to be running — server-side data
fetches use `cache: 'no-store'` and the data pages are `force-dynamic`, so they
are rendered per-request at runtime, not at build time.
