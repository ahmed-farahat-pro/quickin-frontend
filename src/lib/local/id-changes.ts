import { pool } from './pool'
import {
  IdChangeError,
  assertRejectionExplained,
  normalizeIdChangeAction,
  normalizeIdChangeNote,
  normalizeIdChangeStatus,
  statusForIdChangeAction,
  type IdChangeAction,
  type IdChangeStatus,
} from './id-change-core'

// The DECIDING half of the ID change queue — what an operator does in
// /ops → ID verifications with a user's request to change their identity number.
//
// The submitting half (file, withdraw) lives in the BACKEND repo's id-changes.ts,
// because that is the API the mobile apps call. Both write the same
// `id_change_requests` rows on the shared Neon DB and validate through the
// byte-identical id-change-core.
//
// Approving is the ONLY thing that ever writes users.id_document. The column is no
// longer reachable from updateProfile, which is what makes "reviewed by a human" a
// property of the data rather than a convention the UI happens to follow.

const isUuid = (s: string) => /^[0-9a-fA-F-]{36}$/.test(s)

/**
 * Tell the user what was decided — and never let that failing undo the decision.
 *
 * Written here rather than imported from db.ts, which already imports this module for
 * its alert counts; going back the other way would be a cycle. It also needs the
 * swallow-errors contract that db.ts's own createNotification does not have: the
 * decision is already committed by the time this runs, so throwing would surface a
 * failure for work that actually succeeded.
 */
async function notifyDecision(
  userId: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, body, '/profile'],
    )
  } catch (e) {
    console.error('id change notification failed (ignored):', e)
  }
}

export interface AdminIdChangeRow {
  id: string
  user_id: string
  user_name: string | null
  user_email: string | null
  /** Whether this account is verified — context for how much the number matters. */
  verification_status: string
  current_value: string | null
  requested_value: string
  doc_type: string
  reason: string | null
  status: IdChangeStatus
  notes: string | null
  has_front: boolean
  has_back: boolean
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  /** Present only on the single-request read — the list omits them, see below. */
  image_data?: string | null
  back_image_data?: string | null
}

// The list deliberately does NOT select image_data. Each row carries up to 3.5MB of
// inline base64, and /ops polls on a 30-second timer — sending twenty of them per poll
// would be tens of megabytes a minute per operator. The documents are fetched one at a
// time when a reviewer opens a request.
const LIST_COLUMNS = `
  r.id, r.user_id, u.full_name AS user_name, u.email AS user_email,
  COALESCE(u.verification_status, 'unverified') AS verification_status,
  r.current_value, r.requested_value, r.doc_type, r.reason, r.status, r.notes,
  -- Which documents exist, so the reviewer sees a button per document without the
  -- bytes riding along. image_data is NOT NULL by schema, so has_front is really
  -- "there is always one" — it is projected anyway so the UI can treat both the same.
  (r.image_data IS NOT NULL) AS has_front,
  (r.back_image_data IS NOT NULL) AS has_back,
  to_char(r.submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
  to_char(r.reviewed_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at,
  r.reviewed_by`

/** The queue: everything awaiting a decision, oldest first so it matches the
 *  "waited 3 days" the alert centre shows. Empty when the table doesn't exist yet. */
export async function adminListIdChangeRequests(status: IdChangeStatus = 'pending'): Promise<AdminIdChangeRow[]> {
  try {
    const { rows } = await pool.query(
      `SELECT ${LIST_COLUMNS}
         FROM id_change_requests r
         LEFT JOIN users u ON u.id = r.user_id
        WHERE r.status = $1
        ORDER BY r.submitted_at ASC
        LIMIT 200`,
      [normalizeIdChangeStatus(status)],
    )
    return rows as AdminIdChangeRow[]
  } catch {
    // Same contract as countOpenDisputes: an un-migrated database shows an empty
    // queue rather than breaking the verifications screen around it.
    return []
  }
}

/** One request WITH its document images, for the reviewer who opened it. */
export async function adminGetIdChangeRequest(id: string): Promise<AdminIdChangeRow | null> {
  if (!isUuid(id)) throw new IdChangeError('Invalid request')
  const { rows } = await pool.query(
    `SELECT ${LIST_COLUMNS}, r.image_data, r.back_image_data
       FROM id_change_requests r
       LEFT JOIN users u ON u.id = r.user_id
      WHERE r.id = $1`,
    [id],
  )
  return (rows[0] as AdminIdChangeRow | undefined) ?? null
}

/** How many requests need someone — the Alerts count. Zero when un-migrated. */
export async function countPendingIdChanges(): Promise<number> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM id_change_requests WHERE status = 'pending'`,
    )
    return Number(rows[0]?.n ?? 0)
  } catch {
    return 0
  }
}

/** When the oldest waiting request arrived, so the alert can say "3 days". */
export async function oldestPendingIdChangeAt(): Promise<string | null> {
  try {
    const { rows } = await pool.query(
      `SELECT to_char(MIN(submitted_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS t
         FROM id_change_requests WHERE status = 'pending'`,
    )
    return (rows[0]?.t as string | null) ?? null
  } catch {
    return null
  }
}

/**
 * Decide a request.
 *
 * Approving writes the new number onto the user and stamps the row; rejecting stamps
 * the row and leaves the profile untouched. Both happen in ONE transaction, because a
 * half-applied decision — profile updated, request still pending — would let a second
 * operator approve the same change again onto a value that had already moved.
 *
 * `verification_status` is deliberately NOT touched. The operator has just examined a
 * document to approve this, which is the same act that grants verification; resetting
 * a verified host to pending here would trip the publish gate in
 * host-verification-core and pull their live listings off the market as a side effect
 * of correcting a number. Losing verification stays something reviewVerification does
 * on purpose, never something a typo fix causes by accident.
 *
 * Only a PENDING request can be decided — the guard is in the UPDATE's WHERE clause
 * rather than a preceding SELECT, so two operators clicking at once cannot both win.
 */
export async function reviewIdChangeRequest(
  requestId: string,
  action: IdChangeAction | string,
  note: string | null,
  actor: string,
): Promise<{ userId: string; status: IdChangeStatus; value: string | null }> {
  if (!isUuid(requestId)) throw new IdChangeError('Invalid request')
  const decision = normalizeIdChangeAction(action)
  const cleanNote = normalizeIdChangeNote(note)
  // A rejection the user cannot act on is a dead end — they are never told what to fix.
  assertRejectionExplained(decision, cleanNote)
  const status = statusForIdChangeAction(decision)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE id_change_requests
          SET status = $2, notes = $3, reviewed_at = now(), reviewed_by = $4
        WHERE id = $1 AND status = 'pending'
        RETURNING user_id, requested_value`,
      [requestId, status, cleanNote, actor],
    )
    const row = rows[0]
    if (!row) {
      // Either it never existed or someone else already decided it. Both mean this
      // operator's click must not apply.
      throw new IdChangeError('That request has already been decided')
    }
    const userId = String(row.user_id)
    const requested = String(row.requested_value)

    if (decision === 'approve') {
      await client.query(`UPDATE users SET id_document = $2 WHERE id = $1`, [userId, requested])
    }
    await client.query('COMMIT')

    // Outside the transaction: a failed notification must not roll back a decision
    // that has already been made.
    await notifyDecision(
      userId,
      `id_change_${status}`,
      decision === 'approve' ? 'ID number updated' : 'ID change request rejected',
      decision === 'approve'
        ? `Your ID number is now ${requested}.`
        : cleanNote ?? 'Your request to change your ID number was not approved.',
    )

    return { userId, status, value: decision === 'approve' ? requested : null }
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    throw err
  } finally {
    client.release()
  }
}
