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
- `/plan` — static launch-plan page.

## Develop

```bash
npm install
cp .env.example .env.local   # then edit NEXT_PUBLIC_API_URL if needed
npm run dev                  # http://localhost:5000
```

## Build

```bash
npm run build
npm start                    # serves on port 5000
```

The build does **not** require the backend to be running — server-side data
fetches use `cache: 'no-store'` and the data pages are `force-dynamic`, so they
are rendered per-request at runtime, not at build time.
