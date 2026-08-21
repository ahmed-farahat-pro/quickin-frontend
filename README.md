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
| GET    | `/api/local/listings/{id}/calendar?start=&end=`              | — (host sees raw prices) |
| PUT    | `/api/local/listings/{id}/calendar`                         | Cookie (the listing's host) |
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
- `/host/[id]/calendar` — the host's **pricing calendar** for one of their own listings:
  a night's rate and its availability, day by day. See below.
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

### `/host/apply` — identity is verified once, not once per role

Identity belongs to the **person**, not to the role they are using: a guest verifies
from `/account` → `/verify-id` for the trust badge, and that is the same document a host
is approved on. The application form nevertheless asked every applicant for the front and
back of their ID and refused to submit without them, so anyone who had already verified
as a guest photographed the same card a second time to become a host.

`needsIdentityDocuments(status)` in `src/lib/local/host-verification-core.ts` is the rule,
and **both ends run it**: the form renders the upload step only when it returns true, and
`submitHostApplication` in `db.ts` requires the images only when it returns true. Running
one rule in both places is the point — the server has always accepted an application with
no images from a verified applicant, and the form asking for them anyway was the whole bug.

| Verification on file | The applicant sees |
| --- | --- |
| `verified` | A green "Identity verified" panel and a link to `/verify-id`. No upload. Their application is linked to the existing `id_verifications` row |
| `pending` | An amber "under review" panel. No upload — it is already in the reviewer's queue and gets decided together with the application |
| `rejected` | The reviewer's reason, then the upload step again. Re-filing refused photos would put the same document back in front of them |
| none | The upload step, as before |

The **National ID field is read-only** once the ID is verified, seeded from
`id_verifications.id_number` by `nationalIdForApplication` in the same core module —
the apps run that function too (`IdentityRules`, in `IdentityRules.kt` and
`TrustService.swift`), reading the
number from `GET /api/local/verification`, so no client asks for a number another client
would have filled in. An admin approved a document bearing that number; letting the
application carry a different one leaves the reviewer holding two answers with nothing to
say which is the person's. It stays editable while a submission is only `pending` — nothing
has been approved yet — and is still sent with the request either way (`readOnly`, not
`disabled`, so the value is submitted and screen readers still announce the field).

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

It renders on the root layout alone — no navbar, no site footer. The global "Get the
app" bar and the floating WhatsApp button both hide themselves here (each is already a
row on the page), so the route is listed in `HIDDEN_PREFIXES` in `app-store-bar.tsx`
and `whatsapp-fab.tsx`.

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

### Show/hide on every password box

A rule you can't proofread against is a rule you fail twice. `/login` and `/signup`
already put an eye inside the field; **`/account` → Change password did not**, so the
one form that asks for three passwords at once — current, new, confirm — was the one
form where a typo could only be discovered from *"New passwords do not match."*, or
from a login that stopped working.

**`components/features/auth/password-eye-toggle.tsx`** is that control, pulled out so
any form can use it: drop it in a `position: relative` wrapper and leave the input
`paddingInlineEnd: 46`. It is `insetInlineEnd`, not `right`, so it stays inside the
field in Arabic; it carries `aria-pressed` and `aria-controls` so a screen reader says
which field it belongs to; and its label is a real translation
(`passwordPolicy.toggle.show` / `.hide`) in all four locales rather than the hardcoded
English `/login` still uses.

**Each field gets its own eye, and all three go back to dots after a successful
change.** One shared toggle would mean revealing the new password to check it also
puts the current one on screen — three boxes, three different secrets — and leaving
them revealed would show the next thing typed into an emptied box.

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

## A listing title has to be a title

Create-listing asked that the title field be non-empty, so `@@@@@` and `!!!!!`
published a listing whose title is `@@@@@` — the whole listing on the explore grid,
the line in a search result, the name in the booking request a host gets and in every
notification about the stay. Presence was never the test.

**`src/lib/local/listing-title-policy.ts`** decides now, and like `name-policy.ts` it
has no imports, so the same code runs everywhere:

| Caller | What it does |
| --- | --- |
| `createListing` (`lib/local/db.ts`) | The decision on the create door. Throws `ListingInputError`, so `POST /api/local/listings` answers 400 with the reason |
| `updateListingDetails` (`lib/local/db.ts`) | The same rule on the edit door — otherwise a listing publishes with a real title and is edited down to `!!!!!` afterwards. It replaces `assertListingText`, which truncated at 200 rather than refusing |
| `app/host/new/new-listing-form.tsx` | Checks before the request and localizes the problem code (`hostPage.create.errors.title.*`) |
| `app/host/[id]/edit/edit-listing-form.tsx` | Same check on the edit form |

The rule that does the work: a title must contain **letters** (`\p{L}`, so Arabic and
Han count), at least three of them, in at most 200 characters. Deliberately **not** "no
punctuation" — `Nile-view flat (2BR)` and `شقة بإطلالة على النيل` are real titles, and
Franco-Arabic writes real words with numerals (`Sa7el chalet`). `letters` is reported
before `tooShort` so `@@` hears the thing that is actually wrong with it.

Not yet ported to `quickin-backend`, so a listing created from the mobile apps still
clears only the non-empty check — the copy-and-parity treatment `name-policy.ts` gets
is the follow-up.

## A compound name has to be a name

The resort dropdown's **Other — not listed** option swaps in a free-text box, and the
box asked only to be non-blank — so a host could type `@@@@@`, `!!!!!` or `12345` and
publish. Worse than an ugly catalog entry: a name with no alphanumerics slugs to `''`
(see `resortSlug`), and the write path reads a slug-less name as *no resort chosen*.
The host's answer was thrown away on save, the listing missed every resort filter, and
nothing queued for the /ops catalog — the same silent discard `isResortNameMissing`
was written to stop, one step further along.

**`checkResortName` in `src/lib/local/resort-core.ts`** decides now, next to the
normalizer and the slug it protects:

| Caller | What it does |
| --- | --- |
| `createListing` (`lib/local/db.ts`) | `assertResortName` on the create door. Throws `ListingInputError`, so `POST /api/local/listings` answers 400 with the reason |
| `updateListingDetails` (`lib/local/db.ts`) | The same rule on the edit door — otherwise a listing publishes under a real compound and is edited down to `!!!!!` afterwards |
| `resolveResortSelection` (`lib/local/resorts.ts`) | The storage backstop: text that isn't a name is treated as no answer rather than written to the column, so a caller that forgets can't dirty the catalog |
| `app/host/new/new-listing-form.tsx` | Checks before the request and localizes the problem code (`hostPage.create.errors.resortName.*`) |
| `app/host/[id]/edit/edit-listing-form.tsx` | Same check on the edit form |

The rule that does the work is the same one `listing-title-policy.ts` uses: the name
must contain **letters** (`\p{L}`, so Arabic counts), at least two of them. Deliberately
**not** "no punctuation" and **not** "Latin only" — `Marassi (North)`, `Sa7el Chalet`,
`90 Avenue` and `هاسيندا باي` are all names a host really types, and a rule that turns
one of those away leaves the resort blank, which is the failure it was meant to
prevent. `letters` is reported before `tooShort`, so `@@@@@` hears "write it in words"
rather than "add another `@`".

Two things pass straight through, because both are real answers: a resort **picked**
from the dropdown (the typed text is ignored when an id is present), and nothing typed
at all (a chalet outside any compound, or an edit clearing the resort).

Same fix in `quickin-backend` — `resort-core.ts` is parity-checked, and its
`createListing`/`updateListingDetails` call the same `assertResortName`, so a listing
created from iOS or Android meets the rule too.

While fixing it: a name with letters but **no** slug — anything written in a
non-Latin script, `هاسيندا باي` being the common case — is now **kept** as free text
instead of being dropped. It has no match key, so it can't auto-link to a catalog row
and can't queue (`resort_submissions` is keyed on the slug), but it is stored, shown
to guests as typed, and visible to an admin in the unassigned-names sweep.

## A listing has to have somewhere to sleep

Create-listing accepted **0 bedrooms, 0 beds and 0 bathrooms**. The form's `num()`
helper kept anything `>= 0`, the number inputs carried `min="0"`, and `createListing`
wrote the value through — so a host could publish a chalet with nowhere to sleep. The
same three numbers are the line under every listing card (`0 bedrooms · 0 beds · 0
baths`), they are what a guest filters and compares on, and `max_guests` at 0 makes a
listing nobody can book at all, since every booking checks `guests <= max_guests`.

**`src/lib/local/listing-capacity-policy.ts`** decides now, and like
`listing-title-policy.ts` it has no imports, so the same code runs everywhere:

| Caller | What it does |
| --- | --- |
| `createListing` (`lib/local/db.ts`) | The decision on the create door. Throws `ListingInputError`, so `POST /api/local/listings` answers 400 with the reason. An **omitted** field still falls back to the old defaults (1/1/1/2) — the mobile clients don't all send them, and "absent" was never the bug |
| `updateListingDetails` (`lib/local/db.ts`) | The same floor on the edit door — otherwise a listing publishes with a real capacity and is edited down to zero bedrooms afterwards. It replaces `assertListingInt`, whose floor for these three fields was 0 |
| `app/host/new/new-listing-form.tsx` | Checks before the request and localizes the problem code (`hostPage.create.errors.capacity.*`); the inputs now say `min="1"`, so the browser refuses first |
| `app/host/[id]/edit/edit-listing-form.tsx` | Same check on the edit form. `buildPatch` runs on every render, so a half-typed count falls back to what the listing already holds rather than patching a 0 |

The rule that does the work: each count is a **whole number of at least one**.
Deliberately **no** upper bound — a 40-bedroom villa is not an error, and a cap
invented here would start refusing edits to rows that already exist. `required` is
reported before `notWhole` so a blank field hears "you skipped this" rather than
"that is not a number" — `Number('')` is 0, which is how an empty field used to
arrive as a zero nobody typed. Fractions are refused rather than floored (`Math.floor`
turned `0.5` bathrooms into the zero the rule exists to prevent), and Arabic-Indic
digits are folded like everywhere else, so `٣` is three.

A **studio** is entered as 1 bedroom, not 0 — the property type already says `Studio`.
If studios should instead be modelled with 0 bedrooms the way some other platforms do
it, `MIN_CAPACITY` is the one constant to change.

Not yet ported to `quickin-backend`, so a listing created from the mobile apps still
clears only the old `>= 0` check — the same follow-up the title policy is waiting on.

## A listing has to say enough to be a listing

Create-listing required a **title and a price. That was all.** A host could open
`/host/new`, type a name and a number, press Create, and the row landed in `listings`
with a NULL description, no address, no curated area, no map pin and not one photo —
and nothing on the form said any of it mattered, because only the title carried a
`required`. The result is a listing a guest cannot **read** (no description), cannot
**find** (no region to filter by), cannot **see** (no photos) and cannot **place** (no
pin, so it is missing from the `/explore` map the whole browse experience is built on).
Both mobile wizards had already reached half of this conclusion on their own — each
required the area and the pin, neither required a description or a photo — so the three
clients nearly agreed, which is the worst number of clients to nearly agree.

**`src/lib/local/listing-completeness-policy.ts`** decides now, and like
`listing-capacity-policy.ts` it has no imports, so the same code runs everywhere:

| Caller | What it does |
| --- | --- |
| `createListing` (`lib/local/db.ts`) | The decision on the create door. Throws `ListingInputError`, so `POST /api/local/listings` answers 400 with the reason. Runs against the **filtered** photo set, so the count it judges is the count that gets written |
| `app/host/new/new-listing-form.tsx` | Checks before the request and localizes the problem code (`hostPage.create.errors.completeness.*`), in the order the fields are laid out on the page. Every required label now carries a `*` with a legend at the top of the form, and the fields that can hold a native `required` do |
| `mobile/ios` `AddListingView.swift` | The per-step gates on the create wizard: description on Basics, address on Location, a photo on Details. The **edit** wizard in the same file is deliberately untouched |
| `mobile/android` `ui/HostScreen.kt` | The same three gates in `canAdvance`. Photos are gated on Details, where the picker is — not on the read-only Review step |

The rule: a **description** (at least 20 letters), an **address**, an **area**, a **map
pin**, a **property type** and **at least one photo**. Two of those are worth spelling
out. The 20 is the floor the old listing wizard already asked for, so it is the
platform's existing answer rather than a new number; and it counts **letters**, not
characters, for the reason `listing-title-policy.ts` counts them — `....................`
is twenty characters and no description at all. `letters` is reported before `tooShort`
so a box of symbols hears the real problem instead of being told to add a twenty-first
one.

The **resort is deliberately not required**, and a resort **satisfies the area
requirement on its own**. A standalone villa belongs to no compound, so making the field
mandatory would push those hosts through the "Other" free-text box and fill the
moderation queue with names that are not resorts; and `resolveResortSelection` already
derives the region from a chosen resort, so demanding the region separately would refuse
a listing that names its compound and then have the server fill the region in a line
later.

**Both doors, judged differently.** `createListing` judges the whole listing:
everything must be answered. The edit door (`checkListingEdit`) judges only the fields
the patch actually *touches*, and that difference is deliberate on both sides.

It has to be, because a patch is partial by design: the iOS app re-submits a proof of
ownership with `PATCH { ownership_doc }` and nothing else, and its edit screen never
sends `images` at all, since photos travel through the `/images` routes. Re-running the
create check on the merged row would refuse both.

It is still enough to close the hole that matters, because **clearing a field is
touching it**. A listing cannot be created complete and then emptied out: every one of
the six fields is refused when a patch blanks it, on the web form and through the API.
What the edit door deliberately does *not* do is hold a host's price change hostage to a
description their listing never had — the rows that predate this rule stay editable in
the parts the host is actually editing, and complete themselves the moment someone edits
those fields. The two-column rules are merged before judging, so patching `lat` alone is
still judged as a pin against the stored `lng`, and swapping the region on a listing that
names a resort is still judged as an area.

One route could still empty a listing out from the side: `deleteListingImage` in
**`quickin-backend`**, which the mobile apps call to remove one photo at a time. It now
refuses to remove the last one — the count is taken after the delete, inside the
transaction, so the `ROLLBACK` puts the photo back.

This is a completeness rule, not a quality one. Whether the description is any *good* is
what the `/ops` review is for — every new listing still lands there as `pending`.

**Ported to `quickin-backend`**, where the mobile apps' create and edit doors run it, and
the file is byte-identical in both repos — `check-listing-completeness-policy-parity.mjs`
is what keeps it that way, and `npm run check` in the backend runs it. This is the first
of the listing policies to reach both repos; the title policy is already shared, capacity
is still web-only.

## The map pin has to be where the listing says it is

A listing states its place twice on the create form: in words — **Location**,
**Country**, the curated **Region** chip, the **Resort** — and as a **pin** the host
drops on the map. Nothing compared the two. A host could choose Egypt → North Coast →
Porto, click the map in **Germany**, and the listing saved without a murmur; the pin
is what `/explore`'s map, the search map and the listing page all draw from, so that
Egyptian chalet appeared in Bavaria. `createListing` wrote lat/lng through a bare
`Number.isFinite` check, so it did not even bound them to ±90/±180 the way the edit
path (`assertCoord`) had always done — a latitude of `999` was stored.

**`src/lib/local/listing-geo-policy.ts`** decides now, and like
`listing-capacity-policy.ts` it has no imports, so the same code runs everywhere:

| Caller | What it does |
| --- | --- |
| `app/host/new/new-listing-form.tsx` | Runs on every render and shows the problem under the map, in the host's own language (`hostPage.create.pinMismatch.*`, with the curated area named through `regions.*`). It **does not block the submit** |
| `app/host/[id]/edit/edit-listing-form.tsx` | The same warning on the edit door — a pin can be dragged into the wrong country from the editor too, on a listing that was already approved |
| `app/ops/(console)/ops-dashboard.tsx` | Badges the listing card an operator approves from (`Pin outside Egypt`), with the coordinates in the tooltip. This is where an ignored warning lands |
| `createListing` (`lib/local/db.ts`) | Runs `assertCoord` on both doors now, so an impossible coordinate answers **400** on create as it already did on edit. The country/region mismatch itself is **not** refused here |
| `POST /api/local/listings` · `PATCH /api/local/listings/[id]` | Answer the same verdict as a `pin_warning` field — `null`, or `{code, scope, message}`. Nothing on the web reads it (the forms run the module themselves), but `quickin-backend`'s copies of these routes answer with it for the mobile apps, and a caller pointed at either door should get the same answer |

The verdict comes from **bounding boxes** — one per country the form offers, one per
curated area (North Coast, Ain Sokhna, El Gouna, Cairo). Not a polygon and not a
reverse-geocode: a reverse-geocode is a rate-limited Nominatim call on every pin drag,
offline on mobile and fuzzy to compare against free text, while a box is explainable
to the operator who has to act on it. The boxes are padded outward and the regions are
drawn wide — "Cairo" is Greater Cairo including Giza, Sheikh Zayed, 6th of October and
New Cairo — because a warning on a genuine listing is the expensive failure here.

It **warns, it never refuses**, which is why the boxes can afford to be coarse: a
rectangle written in a source file must not be the reason a real property can't be
listed. The host sees the mismatch next to the map they just used and can fix the pin,
the country or the area; if they submit anyway, `/ops` sees the badge before approving.
Nothing about the mismatch is stored — it is derived from `lat`/`lng`/`country`/`region`
at read time, so there is no column to migrate and no flag that goes stale the moment a
host moves their pin.

The module stays quiet whenever it cannot honestly judge: no pin at all, a country it
has no box for, a region it has no box for. A warning a host cannot act on is worse
than no warning.

Which is why **both host forms now require a pin before they submit**
(`hostPage.create.errors.pinRequired`). The pin was optional on the web while both
mobile apps gate their location step on one, so the web was the only door a listing
could come through with no coordinates — and with no pin there is nothing to judge, so
the words could drift from the place unchallenged: a North Coast address under a Cairo
area chip raised nothing at all. The pin is what the policy trusts, so it has to exist
before any of it means anything. Older listings can reach the edit form without one;
the host places it once, there. The API stays permissive — the requirement is a form
rule, the same way iOS and Android gate their step rather than their request.

`listing-geo-policy.ts` is byte-identical to `quickin-backend`'s copy — that project's
`POST`/`PATCH` answer the same verdict as a non-blocking `pin_warning` for the mobile
apps, and `scripts/check-listing-geo-policy-parity.mjs` (in the backend repo) fails on
drift. `mobile/ios/Sources/ListingGeoPolicy.swift` and
`mobile/android/…/com/quickin/app/ListingGeoPolicy.kt` carry the same boxes in Swift and
Kotlin. Those two are kept in step **by hand** — no script guards them — so the boxes
are the contract between all four files.

## A rejected listing has to say why

Rejecting a listing asked the operator for a reason and then threw it away. `/ops`
prompted (`Optional note for the host (why rejected)`), `POST /api/local/admin/listings`
passed the note down, and `adminSetListingApproval` interpolated it into a **notification
body** — the only copy that ever existed. No column held it. A host who missed, cleared
or never opened that notification was left with a red **Rejected** badge, no reason, and
nothing to act on, which is the whole difference between rejecting a listing and deleting
it.

The note is now stored on the listing and read back by every host surface.

| Piece | What it does |
| --- | --- |
| `listings.review_note` (`text`, nullable) | Where the reason lives. NULL means "no reason recorded" — the operator wrote none (the note is optional, by design) or the listing was rejected before the column existed. **Apply it to Neon BEFORE shipping** — `ALTER TABLE listings ADD COLUMN IF NOT EXISTS review_note text` (or `quickin-backend/scripts/migrate-listing-review-note.mjs`), because the host projection selects the column and a database without it fails every host read. The key-gated `GET /api/local/xmig9?key=…` is the same statement for a database with no shell pointed at it — it ships *with* the code that needs the column, so it cannot be the pre-deploy step |
| `lib/local/listing-review-note-core.ts` | `normalizeListingReviewNote` — blank, whitespace and non-string all become the same `null`, so no host surface can render an empty reason box and the column never fills with `''` rows that read as a reason. Over-long notes are truncated at `MAX_LISTING_REVIEW_NOTE_CHARS`, never rejected: a slip of the finger must not leave a listing stuck in the queue. `listingRejectionMessage` composes the notification body from that same normalized note, so the notification and `/host` can't word it differently. No imports, so `node --test` loads it — see **Testing** |
| `adminSetListingApproval` (`lib/local/db.ts`) | Writes the note on reject and **NULLs it on approve** — the note describes a rejection, and a stale one under a live listing reads as a fresh complaint |
| `REQUEUE_SET` + `setListingOwnershipDoc` (`lib/local/db.ts`) | Clear the note whenever an edit or a re-uploaded document sends the listing back to `pending`, so a reason on screen always describes the *current* rejection rather than one the host has already answered |
| `LISTING_COLS_HOST` (`lib/local/db.ts`) | Carries `review_note`. Deliberately **not** in `LISTING_COMMON_COLS`: it is staff-authored text about this host's listing, and the shared block would publish it on every guest read |
| `app/host/page.tsx` | The reason under a rejected card, in its own panel outside the card's link — text to read, not part of the tap target |
| `app/host/[id]/edit/page.tsx` | The same reason as a banner above the form that fixes it. A reason the host has to navigate back to isn't much better than none |

Both surfaces fall back to generic guidance (`hostPage.dashboard.rejected.noReason`,
`hostPage.edit.rejected.noReason`) when the note is NULL, and render the operator's line
breaks with `white-space: pre-line` — a note is often a short list of fixes. Long
unspaced runs break with `overflow-wrap: anywhere` so staff text can't widen a card.

Mirrored in `quickin-backend` (`setListingApproval` takes the same optional note, and its
host projection returns the column) so the mobile apps read the same reason — iOS shows it
in `HostListingRow`, Android in the host listing card, both replacing the generic
"rejected" line they showed before.

**The note stays optional.** Someone clearing a queue of obvious spam should not have to
type, and forcing a reason there would only produce `.` — the fallback copy is the honest
answer for those.

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
| `<Skeleton />` | `src/components/ui/skeleton.tsx` | The shadcn kit, for the Tailwind-styled pages (`/links`). |

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

**An ownership document may be a PDF; an ID photo may not.** A title deed, a
utility bill or a syndicate letter is *issued* as a PDF, and the field used to
accept `image/*` only — so a host holding one had to photograph it off a screen,
which is the document operators kept rejecting as illegible. `ownership-doc-core.ts`
holds the rule (image data URL, `application/pdf` data URL with a real `%PDF-`
magic number, or an http(s) link, capped at 3.5M chars ≈ 2.5 MB); the ID kinds
stay image-only because those are a photograph of a card and a selfie. SVG is
refused on both sides now — `/ops` never rendered it, so accepting it only ever
stored a document nobody could open. A PDF is stored exactly as uploaded: there
is nothing to downscale, so the cap is a limit hosts actually meet, and `/ops`
opens it in the browser's own sandboxed PDF viewer.

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
| GET | `/api/local/admin/documents/:kind/:id` | `kind` ∈ `id_front\|id_back\|id_selfie\|ownership\|id_change_front\|id_change_back`. Returns the document **bytes**; `415` if the stored value isn't allowlisted for that kind (images for every kind, **plus `application/pdf` for `ownership`** — see `allowedMimeFor`), `404` if there's nothing there. Requires **both** `documents` and the owning module (`verifications` for IDs, `listings` for ownership, `id_changes` for the change-request pair — whose `:id` is the `id_change_requests` row, not a verification) |
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

Picking **Other** makes the name box **required** — the create and edit forms both
refuse to submit while it is empty. `resort_id` and `resort_name` are one logical
field, and a blank name is indistinguishable server-side from "not in a resort", so
without this the listing saved with no resort at all: it missed every resort filter
and nothing reached the /ops queue. The rule is `isResortNameMissing()` in
`src/lib/resort-choice.ts`, which also owns the `__other__` sentinel both forms use.

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
| `resort-core.ts` | Resort name normalization, slug collision (`Amouage` = `amouage` = `AMOUAGE.`), typo distance — and `checkResortName`: that `@@@@@`, `!!!!!`, `-----`, `12345` and `٠١٢٣` are refused for a compound name, that invisible pasted characters don't make one non-empty, that `letters` is reported before `tooShort`, and the half that matters more, that `Marassi (North)`, `Sa7el Chalet`, `90 Avenue` and `هاسيندا باي` still get in |
| `resort-choice.ts` | The resort dropdown's form rule: that **Other** with an empty or whitespace-only name is refused — it used to submit as `resort_name: undefined`, which the server cannot tell from "no resort chosen", so the host's answer was silently dropped — and the half that matters more, that the rule never fires for the no-resort choice or a catalog pick, including when stale text is left in the hidden box |
| `user-admin-core.ts` | Users-list query parsing and clamping, the full block/remove transition matrix, the `ORDER BY` injection guard, blocked-login copy |
| `activity-core.ts` | Activity/audit filter parsing, the UNION branch limits, the audit-action label map, and `alertsFor` — including that an operator never receives an alert for a module they don't hold |
| `payment-flow-core.ts` | Which stage a booking is at (`paymentStageFor`), the shared `canPay` predicate, what an admin decision writes, and the proof-image validator — including that a submitted screenshot is never "awaiting payment" |
| `document-core.ts` | Document-kind validation, the data-URL parser and its mime allowlist (SVG and HTML are rejected — these bytes render in an admin's browser), the verification state machine, and which module owns which document |
| `ownership-doc-core.ts` | What a host may attach as proof of ownership: an image, a real PDF (checked by magic number, not by the mime the uploader typed) or an http(s) link, under the 3.5M-char cap. Shared verbatim with quickin-backend — `scripts/check-ownership-doc-core-parity.mjs` there fails on drift |
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
| `listing-title-policy.ts` | The listing title: that `@@@@@`, `!!!!!`, `.....`, `12345` and `🏖️🏖️🏖️` are refused, that `letters` is reported before `tooShort` so `@@` hears the real problem, that invisible pasted characters don't make a title non-empty, and that the 200-character cap counts code points — plus the half that matters more, that `Nile-view flat (2BR)`, `★ Sahel chalet ★`, `Sa7el chalet` and `شقة بإطلالة على النيل` still get in, because a rule that bans punctuation would refuse most real titles |
| `auth-exit-core.ts` | The way out of `/login` and `/signup`: that the referring page wins and keeps its query string (a guest who came from a filtered search gets those filters back), and the four cases that fall back to `/explore` instead — no referrer, an unparseable one, another origin (otherwise any site could choose where our sign-in page sends people), and the auth pages themselves, with locale prefixes stripped first so `/ar/signup` doesn't slip through |
| `currency-core.ts` | The display currency: that an unrecognised cookie falls back to EGP instead of leaving prices in a currency with no rate; that one typo'd code in the rate override drops alone rather than taking the other five down with it, and that a zero rate is refused (it would divide every price into Infinity); and the property the money depends on — a missing rate returns the **stored** price in the **stored** currency, unmarked, never a number invented from a rate we do not have |
| `avatar-core.ts` | The profile photo: that a base64 `data:` JPEG/PNG/WebP gets in and an `https://` link does **not** (the reason is in `/account` → Profile photo above), that HTML, PDF and SVG data URLs are refused, that a mangled base64 payload is not a photo, the size ceiling and the decoded-bytes math behind it, that `null`/`''`/blank all mean "remove" while the literal string `null` does not — and that the 256px / q0.8 constants still match the iOS picker, since a drift there is a photo that weighs one thing on the phone and another on the site |
| `listing-capacity-policy.ts` | The four capacity counts: that `0`, `'0'` and `٠` are refused for bedrooms, beds, bathrooms **and** guests (the bug the module was written for), that a fraction is refused rather than floored into that same zero, that the JSON shapes `Number()` would coerce into a count (`true`, `['2']`) are not counts — and the half that matters as much, that an omitted field still falls back to the create defaults so the mobile apps' partial payloads are never answered with a 400, that a 40-bedroom villa is not an error, and that `required` is reported before `notWhole` so a blank field hears the real problem |
| `listing-completeness-policy.ts` | The bar a NEW listing clears: that a title and a price alone are refused (the reported bug), that each of the six required fields is caught when it alone is missing, that the first problem is reported in **form order** so a host is sent to the topmost empty field, that twenty symbols are `letters` rather than a long-enough description, that half a pin is no pin while `0,0` is a real coordinate, and that a non-array or junk `images` value is zero photos rather than an exemption — plus the halves that matter as much, that a complete listing passes untouched and that a chosen **resort** answers the area question on its own, since the region is derived from it. For the edit door: that every required field is refused when a patch clears it, that a field the patch does not mention is left alone (the empty ownership-doc-only patch the iOS app sends still goes through), that half a pin patch is judged against the half already stored, and that a resort on the listing answers a cleared region |
| `listing-geo-policy.ts` | The map pin against the words around it: the reported bug (Egypt + North Coast, pin in Berlin) and that the country is named before the region, since it is the bigger mistake; every curated area against every other, so a Cairo pin on a North Coast listing is caught too; that Greater Cairo and the whole Alexandria → Marsa Matrouh strip are **not** flagged, because a box that refuses real listings is the worse failure; Morocco's negative longitudes; and the silence the module keeps where it cannot judge — no pin, an unknown country, an unknown region, an unparseable coordinate |
| `listing-pricing-core.ts` | The host's weekend rate: that `0`, `'0'`, `'0.0'` and `-50` are refused rather than silently stored as "no weekend rate" (the bug the module was written for), and the half that matters as much — that `null`, `undefined` and a blank field still mean "no weekend rate" so a host can turn the feature off and the apps' `null` is never answered with a 400; plus the JSON shapes `Number()` would happily coerce into a price (`true`, `[]`, `['1500']`); and the day set that rate applies to — that all seven days is refused however it is padded (repeats, junk, reverse order), that six of seven and a lone day are not, that an empty set still means "nothing is a weekend", and that `3.7` is dropped rather than floored into Wednesday; and the two halves judged as a pair — that a rate with no day is refused, that a *missing* day set is not an empty one (it takes `DEFAULT_WEEKEND_DAYS`, which is what the mobile apps rely on) and that no rate means no days without a word of complaint, whatever the pills were showing |
| `contentguard.ts` | Every de-obfuscation the contact guard undoes (Arabic-Indic/fullwidth/enclosed digits, zero-width and soft hyphens, Cyrillic lookalikes, spelled-out EN/AR numbers, `at`/`dot` spelling, letters used as separators — `A0101 S416 M3280`, and a number padded letter-by-letter — `0a1b0c1d2e3f4g5h6i7j8`, whatever plan it is written to), the four categories it blocks, the split-across-messages check — and an equally large **false-positive** half, because a guard that rejects "we are 2 adults arriving on the 12th" is worse than one that misses |

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

## The host calendar — a night costs what the host said that night costs

`/host/[id]/calendar` is where a host prices their listing day by day: the long weekend
above the Tuesday after it, Eid above March, the week nobody books below both. It sits at
the **top** of the pricing ladder:

```
listing_date_prices  →  weekend_price on weekend_days  →  price_per_night
```

A day the host pinned beats the weekend rule. **"Reset to default" deletes the pinned
row** rather than writing the base price — a day pinned at whatever the base happened to
be would look identical, right up until the host edited their listing's price and that
day silently stopped following it. The absence of a row is the only honest way to say
"this day has no opinion of its own".

**A day's price is the price of the NIGHT that starts on it.** A stay `[check_in,
check_out)` is charged for `check_in … check_out-1`, so the checkout day is never priced —
Aug 15 → Aug 18 is three nights, not four.

### Selecting days

Airbnb-style and multi-day, because pricing a season one tap at a time is not a feature:

- **tap** a day to add or remove it,
- **press and drag** across days to sweep a range in or out,
- **Select month** takes the whole month, and takes it back on a second press — a mis-tap
  should not cost the host a month of manual deselection.

The sweep is driven by hit-testing what is under the pointer (`elementFromPoint`), not by
each cell's own enter event. On touch the pointer stays bound to the element that was
pressed for the whole gesture, so the cells being dragged over never get an enter event
at all and the drag would collapse into a single-day tap. The direction (adding or
removing) is fixed when the press starts, so dragging back and forth over a day doesn't
flip it repeatedly.

The grid maths and the set operations live in `src/lib/local/date-pricing-core.ts`
(`monthGrid`, `applySweep`, `toggleMonthSelection`, `isDayEditable`, `selectionStats`,
`chunkWindows`) rather than in the component, so they are tested without a DOM —
`test/unit/calendar-grid.test.mjs`. That file is byte-identical with the backend's copy
and guarded by `check-date-pricing-core-parity.mjs` there.

### What the host sees, and what the guest is charged

The calendar shows the host's **raw** rates — the numbers they type and are paid — with
the guest-inclusive figure under the price box ("Guests will see 4,680 EGP"). `GET
/api/local/listings/:id/calendar` decides which of the two it returns from the session,
exactly like the listing projections, so a host cannot be shown and then re-save the
marked-up number.

Every save takes the days back from the server's response rather than patching them
locally: a day whose pin was just reset gets its new price from the weekend/base ladder,
which only the server can evaluate.

**A booked night is not editable.** `bookings.total_price` is snapshotted when the
reservation is taken, so a later price change can never restate a stay a guest already
agreed to — the guard is about not misleading the host, not about data safety. Days held
by a reservation come back in `skipped` rather than failing the request, because a host
dragging across a month will cross a booking routinely.

### Availability, in the same calendar

`listing_blocked_dates` stores half-open `[start, end)` **ranges** — what the mobile range
picker writes — but the calendar edits single **days**, so "unblock the Wednesday in the
middle of this week-long block" cannot be expressed as a DELETE. The spans overlapping
what the host touched are exploded into days, changed, re-merged and rewritten; notes ride
along per day, so splitting a *maintenance* block leaves two *maintenance* blocks rather
than two unlabelled ones. `applyBlockChange()` and `blockRewriteWindow()`, both pure and
both tested.

### The booking summary

The reserve panel on `/explore/[id]` fetches the same calendar for the chosen nights and
**itemises them when they differ from each other** ("Sat 5 Sep · 4,680"). A stay at one
flat rate keeps the single `price × nights` line — writing the same number three times is
noise. The prices come straight from the endpoint, already marked up and rounded per
night, so the list always adds up to the total shown beneath it.

> **Known divergence (predates this feature).** This project's per-night ladder does not
> consult `monthly_prices` and applies no length-of-stay discount; `quickin-backend`'s
> does both, and reads Fri/Sat as the weekend rather than the listing's `weekend_days`.
> The same listing and dates can therefore total differently depending on which client
> took the booking. The **calendar rung is identical in both**, so a pinned day is charged
> the same either way. Unifying the rest is a separate change and needs a decision about
> which behaviour is correct before it is written.

## Weekend pricing — an empty field is optional, a `0` is not

A host can charge a different rate on the days they call the weekend: a
`weekend_price` plus a `weekend_days` set (Postgres DOW, `0`=Sun … `6`=Sat), both
on `listings`. The quote picks per night — a night whose DOW is in `weekend_days`
is charged `weekend_price`, everything else `price_per_night`.

The whole feature is **optional**, and an empty field is how a host says they
don't use it. Clearing the field clears the rate, and the days go with it: days
without a rate mean nothing, and both mobile clients already send `null` (not
`0`) to turn weekend pricing off — `HostService.swift` and `BookingService.kt`
map "no rate" to JSON null.

What used to fall through that door was `0`. Every layer coerced it away — the
form dropped it before the fetch, `createListing` wrote NULL, `updateListing`
wrote NULL — so the listing saved, the weekend-day pills stayed lit, and nothing
told the host that the rate they had typed was gone. A host could leave that
screen believing weekend nights were priced at 0 EGP, or priced at all.

`src/lib/local/listing-pricing-core.ts` now holds the one rule and **both ends
run it**: `/host/new` and `/host/:id/edit` refuse to submit and say why
(`hostPage.create.errors.weekendPriceInvalid`, in all four locales), and
`createListing` / `updateListing` answer 400 `Weekend price must be greater
than 0` to anything that reaches the API another way. Empty still means null at
both ends — that separation is the whole point of the module, and
`test/unit/listing-pricing-core.test.mjs` spends as much of its length on the
values that must still get in (`null` from the apps, a blank field, `1500`,
`0.5`) as on the ones that must not (`0`, `'0'`, `-50`, `'abc'`, `true`, `[]` —
`Number()` turns the last three into `0`, `1` and `0`).

One thing the rule deliberately does **not** do is require a rate when weekend
days are selected. `DEFAULT_WEEKEND_DAYS` is pre-selected on both forms, so
"days chosen, no rate" is the normal resting state of a listing without weekend
pricing, not a mistake to report. The reverse — a rate with no days — is not a
resting state and is refused; see "a rate is not a rate without a day" below.

On the edit form the refusal also has to make the form *dirty*. An invalid rate
patches to null, which usually equals what is already stored, so without that the
Save button would stay greyed out under "No changes yet" — the host would press
nothing and hear nothing, which is the original bug wearing a different hat.

### …and a weekend is not the whole week

The other half of the same screen is the day pills, and they had the mirror-image
hole: a host could light up all seven. That saves, and it prices every night at
`weekend_price` — which leaves `price_per_night`, the field directly above it and
the number the listing is advertised and sorted on, applying to no night at all.
A host who wants one rate for every night has a field for exactly that.

So the set has a ceiling: **at most six of seven**. Six is odd but honest — one
day is still on the nightly price. Zero days stays fine and still means nothing
is a weekend, for the same reason a rate-less listing is not an error.

`checkWeekendDays` in `listing-pricing-core.ts` holds it, and cleaning happens
*before* counting — days outside `0..6` are dropped, repeats are dropped, and a
fraction is dropped rather than floored (the old inline filter turned `3.7` into
Wednesday). Without that, `[0,1,2,3,4,5,6,6,'sat']` reads as nine entries and
walks straight past a check aimed at seven.

Both ends run it again. On `/host/new` and `/host/:id/edit` the sixth selection
locks the last unlit pill, with the reason spelled out under the row
(`hostPage.create.errors.weekendDays.wholeWeek`, in all four locales), and
`createListing` / `updateListing` answer 400 `Weekend pricing cannot apply to all
seven days` to anything that arrives another way — the mobile apps included,
since they PATCH the same column.

Listings saved with all seven days *before* this rule existed still load with all
seven pills lit; nothing switches them off behind the host's back. What changes
is that the edit form counts that state as dirty — the same trick the invalid
rate uses — so Save is pressable and says what has to change, instead of sitting
greyed out under "No changes yet". If the host is clearing the weekend rate
entirely, the days go with it and the rule steps aside: refusing that save would
trap them on a form they are in the middle of fixing.

### …and a rate is not a rate without a day

The pills had one more hole, at the opposite end from the whole week: a host
could type a weekend rate and turn **every** day off. That saved too. The rate
went into `weekend_price`, `weekend_days` went in as NULL — the write was a
single expression, `weekendPrice && weekendDays.length ? weekendDays : null`,
which resolved the disagreement between the two columns in favour of NULL — and
the quote only reaches for the rate `WHEN weekend_days IS NOT NULL`. So the
number the host entered was never charged on a single night, and nothing said
so. That is the `0` bug exactly, arriving through the other half of the field.

`resolveWeekendSchedule` in `listing-pricing-core.ts` now decides what the pair
means, and it is the only thing that writes `weekend_days`. Two inputs that used
to be the same thing are no longer:

| what the client sent | what it means | what is stored |
| --- | --- | --- |
| no `weekend_days` key at all | the host was never asked | `DEFAULT_WEEKEND_DAYS` |
| `weekend_days: []` | the host was asked and chose none | **400**, if there is a rate |
| no rate, any days | weekend pricing is off | `NULL` |

The first row is both mobile apps. Neither has ever sent a day set — their
pricing screens say "Applied on Fri + Sat nights" and PATCH `weekend_price`
alone — so under the old expression *every* weekend rate set from a phone stored
NULL days and applied to nothing. They now get the Fri+Sat their own UI promised.
The second row is the web forms, where the pills are directly under the rate
field: a host who cleared them all said something, and quietly putting two back
would be answering for them.

Both ends run it. `/host/new` and `/host/:id/edit` refuse to submit and name the
half to fix (`hostPage.create.errors.weekendDays.noDaysChosen`, in all four
locales) with the same note shown live under the pills as the host types, and
`createListing` / `updateListing` answer 400 `Pick at least one weekend day, or
clear the weekend price`.

`updateListing` is the awkward one, because a PATCH can carry either half alone —
the editor sends only what changed, the apps only ever send the rate — so the
half that isn't in the patch has to come off the row before the pair can be
judged. That read happens **inside** the transaction, `FOR UPDATE`, and the days
are written on every weekend patch even when only the rate moved: clearing a rate
has to take its days with it, and setting one on a listing that has none has to
put days underneath it, or the rate goes straight back to being unchargeable.

The rate is consulted before the days, and that order is load-bearing rather than
incidental — it is what keeps the whole-week rule above from trapping anyone. A
listing saved with all seven days before that rule existed loads with all seven
lit, and clearing the rate is how its host turns the feature off; judging the day
set first would refuse the very save that fixes the listing, over a day set that
was about to be dropped anyway.

## Display currency — what a guest reads, not what they pay

A listing is priced by its host in one real currency (`listings.currency`, in
practice EGP) and a booking is charged in that currency. Everything below is
display: the guest picks a currency to *read* prices in, and nothing about the
money changes.

**Where the switcher is.** Beside the language switcher, everywhere that has one:
the `/explore` header and its mobile menu, the footer — and a **Preferences** card
on `/account`, which is where people look for a setting rather than a control.

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
