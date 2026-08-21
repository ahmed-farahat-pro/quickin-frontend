// The one way this app reaches its data.
//
// quickin-frontend owns the UI; quickin-backend owns the API and the database. Server
// components used to import `@/lib/local/db` and query Postgres directly — idiomatic for
// a standalone Next app, and exactly what this project used to be, but it meant two
// codebases held their own database client against one Neon instance. Everything now
// goes over HTTP to the one backend, which is what lets this project drop `pool.ts`,
// `db.ts` and `DATABASE_URL` entirely.
//
// This costs an extra hop per render versus a direct query. That is the deliberate
// trade: one owner of the data, one place a rule can live.
//
// SERVER SIDE ONLY. The browser never calls the backend's origin directly — it calls
// same-origin `/api/*`, which next.config rewrites across, so cookies keep working
// without CORS or a third-party-cookie problem.

import { cookies } from 'next/headers'

/** Where the backend lives. Same variable the mobile apps' Config points at. */
export const BACKEND_URL = (
  process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000'
).replace(/\/+$/, '')

export class BackendError extends Error {
  constructor(readonly status: number, message: string, readonly body?: unknown) {
    super(message)
    this.name = 'BackendError'
  }
}

/**
 * Call the backend from a server component or server action, as the signed-in person.
 *
 * Both session cookies are forwarded: `qk_token` for a guest or host, `qk_staff` for an
 * operator in /ops. Forwarding the whole cookie header rather than picking one keeps
 * this correct when a cookie is added — the backend decides what it honours.
 *
 * `cache: 'no-store'` because every one of these reads is per-user; caching a response
 * keyed only by URL would serve one person's reservations to another.
 */
export async function backendFetch<T = unknown>(
  path: string,
  init: RequestInit & { allow404?: boolean } = {},
): Promise<T> {
  const { allow404, ...rest } = init
  const jar = await cookies()
  const cookieHeader = jar.getAll().map((c) => `${c.name}=${c.value}`).join('; ')
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...rest,
    cache: 'no-store',
    headers: {
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
  })
  if (res.status === 404 && allow404) return null as T
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!res.ok) {
    const msg = (body && typeof body === 'object' && 'error' in body)
      ? String((body as { error: unknown }).error)
      : `Backend ${res.status} for ${path}`
    throw new BackendError(res.status, msg, body)
  }
  return body as T
}

/**
 * Like backendFetch, but a failure renders an empty screen instead of a 500.
 *
 * An /ops list that cannot load should show the console with nothing in it, not take the
 * whole page down — the operator can still navigate to a module that does work. The
 * error is logged so a broken endpoint is never silent.
 */
export async function backendFetchOr<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    return await backendFetch<T>(path, init)
  } catch (err) {
    console.error(`backendFetch failed for ${path}:`, err instanceof Error ? err.message : err)
    return fallback
  }
}

/** The signed-in guest or host, exactly as GET /api/auth/me returns it. */
export interface Viewer {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  provider: string
  role: string
  is_host: boolean
  host_type: string | null
  host_status: string
  host_review_note: string | null
}

/**
 * The signed-in guest or host, or null.
 *
 * Replaces the `verifyToken(cookie)` + `getUserRowByEmail(claims.email)` pair that a
 * dozen pages each did for themselves. Two reasons that pattern had to go beyond the
 * database dependency: it resolved the account by EMAIL, which is not a key on this
 * database (one address can own several rows — see the backend README on sign-in), and
 * it verified the token locally, so the web needed AUTH_SECRET to stay in step with the
 * backend's. Now the backend answers both questions.
 */
export async function viewer(): Promise<Viewer | null> {
  try {
    const r = await backendFetch<{ user: Viewer | null }>('/api/auth/me')
    return r?.user ?? null
  } catch {
    return null
  }
}

/**
 * Call the backend for PUBLIC data, with no session attached.
 *
 * Separate from backendFetch because reading cookies opts a route out of static
 * rendering: `sitemap.xml` is generated at build time and revalidated hourly, and the
 * moment it touched cookies() Next refused to render it statically and it shipped with
 * no listings in it. Anything that is the same for every visitor belongs here.
 */
export async function backendFetchPublic<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { next: { revalidate: 300 } })
    if (!res.ok) throw new Error(`Backend ${res.status} for ${path}`)
    return (await res.json()) as T
  } catch (err) {
    console.error(`backendFetchPublic failed for ${path}:`, err instanceof Error ? err.message : err)
    return fallback
  }
}

/** What the site chrome renders for the signed-in person: a greeting, an avatar, and
 *  whether the heart on a listing card is already filled. */
export interface ViewerChrome {
  firstName: string | null
  initials: string
  avatarUrl: string | null
  savedIds: string[]
  isHost: boolean
}

const SIGNED_OUT_CHROME: ViewerChrome = {
  firstName: null, initials: '?', avatarUrl: null, savedIds: [], isHost: false,
}

function initialsFrom(source: string): string {
  const parts = source.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase()
}

/**
 * The header's view of the signed-in person. Never throws — a signed-out visitor and a
 * backend that is briefly unreachable both render the same signed-out chrome, because
 * neither is a reason to fail the whole page.
 */
export async function viewerChrome(): Promise<ViewerChrome> {
  const me = await viewer()
  if (!me) return SIGNED_OUT_CHROME
  const name = me.full_name?.trim() || me.email.split('@')[0]
  const { listings } = await backendFetchOr<{ listings: { id: string }[] }>(
    '/api/local/wishlists', { listings: [] },
  )
  return {
    firstName: name ? name.split(' ')[0] : null,
    initials: initialsFrom(name || me.email),
    avatarUrl: me.avatar_url?.trim() || null,
    savedIds: listings.map((l) => l.id),
    isHost: Boolean(me.is_host),
  }
}

/** Name of the staff session cookie. Only the NAME lives here — the value is opaque to
 *  this app and is verified by the backend, which owns the signing secret. */
export const STAFF_COOKIE = 'qk_staff'

/** The staff identity, exactly as GET /api/local/staff/me returns it. */
export interface OpsSession {
  id: string
  email: string
  full_name: string | null
  role: string
  /** Modules explicitly granted. Use `can` to decide access, not this. */
  modules: string[]
  /** EFFECTIVE permissions, resolved by the backend's staffCan(). */
  can: string[]
  legacy?: boolean
}

/**
 * The signed-in operator, or null.
 *
 * Replaces `resolveStaffSession(cookie)`, which read `staff_sessions` from this app's own
 * pool. The backend now owns that table and this is the only thing the pages need from it.
 */
export async function opsSession(): Promise<OpsSession | null> {
  return (await opsMe()).staff
}

/** The full staff/me payload — identity, the module catalog, and the idle-logout
 *  deadline the SERVER enforces. The console layout needs all three. */
export async function opsMe(): Promise<{
  staff: OpsSession | null
  modules: { key: string; label: string; description: string }[]
  idleMs: number
}> {
  try {
    const r = await backendFetch<{
      staff: OpsSession | null
      modules: { key: string; label: string; description: string }[]
      idleMs: number
    }>('/api/local/staff/me')
    return { staff: r?.staff ?? null, modules: r?.modules ?? [], idleMs: r?.idleMs ?? 30 * 60_000 }
  } catch {
    return { staff: null, modules: [], idleMs: 30 * 60_000 }
  }
}

/**
 * Whether an operator may use a module.
 *
 * Deliberately a lookup, not a re-implementation of `staffCan`. The real rule is more
 * than "is the key granted" — a super admin holds everything, and some modules are
 * super-admin-only regardless of grants. The backend resolves it and sends `can`;
 * copying the predicate here is the drift this merge exists to stop.
 */
export function opsCan(staff: OpsSession | null, moduleKey: string): boolean {
  return Boolean(staff?.can?.includes(moduleKey))
}
