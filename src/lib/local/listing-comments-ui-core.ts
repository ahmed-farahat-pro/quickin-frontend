// Listing comments ("Questions & comments") — the pure rules the web UI needs.
//
// Public Q&A on a listing replaced host ⇄ guest messaging (2026-10-02). The backend
// (quickin-backend, /api/local/listings/:id/comments) owns every rule that matters;
// this module only holds what the browser has to decide on its own: how to read a
// failed response, where a notification should go, and the length cap the input
// enforces. No runtime imports, so `node --test` loads it as-is
// (test/unit/listing-comments-ui-core.test.mjs).

/** Longest comment or reply, in characters after trimming. Mirrors the backend's
 *  COMMENT_MAX — the server is still the gate, this just stops the box early. */
export const COMMENT_MAX = 1000

/** The host's answer to a comment. One per comment; null until they reply. */
export interface CommentReply {
  body: string
  created_at: string
}

/** One comment, as GET/POST /api/local/listings/:id/comments return it. */
export interface ListingComment {
  id: string
  listing_id: string
  user_id: string
  author_name: string
  author_avatar: string | null
  body: string
  created_at: string
  mine: boolean
  reply: CommentReply | null
}

/** GET /api/local/listings/:id/comments. */
export interface ListingCommentsResponse {
  comments: ListingComment[]
  is_host: boolean
  can_comment: boolean
}

/** One row of GET /api/local/host/comments — a comment plus which listing it is on. */
export interface HostComment extends ListingComment {
  listing_title: string
  listing_image: string | null
}

export interface PolicyWarning {
  id: string
  message: string
}

/**
 * What a failed comment / reply write means for the UI.
 *   signin  — 401: the session is gone; show the sign-in prompt
 *   warning — 409: a moderator's policy warning must be acknowledged first
 *   error   — everything else; `message` is the server's own wording when it sent
 *             one (400 contact-details / length, 403, 429 rate limit), else null so
 *             the caller can fall back to a generic localized line
 */
export type CommentFailure =
  | { kind: 'signin' }
  | { kind: 'warning'; warning: PolicyWarning }
  | { kind: 'error'; message: string | null }

/**
 * Classify a non-2xx response from a comment or reply write.
 *
 * The 409 gate body is `{ error, warning: { id, message } }` per the contract, but
 * the shared moderation helper (warningGateBody) has always answered chat with
 * `policyWarning` — both are accepted so the gate works whichever the route sends.
 */
export function commentFailure(status: number, body: unknown): CommentFailure {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (status === 401) return { kind: 'signin' }
  if (status === 409) {
    const w = (b.warning ?? b.policyWarning) as Record<string, unknown> | undefined
    if (w && typeof w === 'object' && typeof w.id === 'string' && w.id) {
      const message = typeof w.message === 'string' && w.message ? w.message : String(b.error ?? '')
      return { kind: 'warning', warning: { id: w.id, message } }
    }
  }
  const error = typeof b.error === 'string' && b.error.trim() ? b.error : null
  return { kind: 'error', message: error }
}

/** How many of these comments still wait on the host's reply. */
export function unansweredCount(comments: readonly { reply: CommentReply | null }[]): number {
  return comments.reduce((n, c) => (c.reply ? n : n + 1), 0)
}

/**
 * Where tapping a notification in the header bell should go, or null for "nowhere"
 * (the row just sits in the list).
 *
 * `comment` / `comment_reply` carry `/explore/<listingId>#comments` from the backend.
 * `message` notifications predate the removal of messaging: they must never lead to a
 * chat screen, so they — and any stale `/messages…` link — route nowhere. Only
 * same-site `/explore/…` links are followed; older notification types carry links to
 * routes from the retired Supabase app that would 404 here.
 */
export function notificationHref(n: { type?: string | null; link?: string | null }): string | null {
  if (n.type === 'message') return null
  const link = typeof n.link === 'string' ? n.link.trim() : ''
  if (!link.startsWith('/explore/') || link.startsWith('//')) return null
  return link
}
