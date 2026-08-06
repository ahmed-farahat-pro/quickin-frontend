// TEMPORARY migration: staff RBAC schema for the /ops admin panel (super admin +
// moderators + per-module permissions + revocable sessions). Idempotent. Key-gated.
// REMOVE after run — same lifecycle as xmig4/xmig5/xmig6/xmig7.
//
// Mirrors backend/quickin-backend/scripts/migrate-staff-rbac.mjs; this route exists
// because Vercel has no shell, so prod can't run the .mjs script.
//
//   GET /api/local/xmig8?key=qk-mig8-4b1f                      → create the tables
//   GET /api/local/xmig8?key=…&seed_email=…&seed_password=…     → …and the first super admin
//
// Seeding refuses if an active super admin already exists, so this can't mint a
// second one or be replayed to re-take the panel.
import { NextResponse } from 'next/server'
import { randomBytes, scryptSync } from 'node:crypto'
import { pool } from '@/lib/local/pool'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const KEY = 'qk-mig8-4b1f'

const TABLES = [
  'staff_accounts',
  'staff_permissions',
  'staff_sessions',
  'staff_password_resets',
  'staff_audit_log',
]

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('key') !== KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const steps: string[] = []
  const run = async (label: string, sql: string) => {
    try { await pool.query(sql); steps.push('ok: ' + label) } catch (e) { steps.push('ERR ' + label + ': ' + (e as Error).message) }
  }

  await run('pgcrypto', `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)

  await run('create staff_accounts', `
    CREATE TABLE IF NOT EXISTS staff_accounts (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email                 text NOT NULL,
      password_hash         text NOT NULL,
      full_name             text NOT NULL,
      role                  text NOT NULL DEFAULT 'moderator',
      is_active             boolean NOT NULL DEFAULT true,
      created_by            uuid REFERENCES staff_accounts(id) ON DELETE SET NULL,
      last_login_at         timestamptz,
      failed_login_attempts int NOT NULL DEFAULT 0,
      locked_until          timestamptz,
      password_changed_at   timestamptz NOT NULL DEFAULT now(),
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now()
    )`)
  await run('index staff_accounts.email', `CREATE UNIQUE INDEX IF NOT EXISTS staff_accounts_email_uidx ON staff_accounts (lower(email))`)

  await run('create staff_permissions', `
    CREATE TABLE IF NOT EXISTS staff_permissions (
      staff_id   uuid NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
      module     text NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now(),
      granted_by uuid REFERENCES staff_accounts(id) ON DELETE SET NULL,
      PRIMARY KEY (staff_id, module)
    )`)

  await run('create staff_sessions', `
    CREATE TABLE IF NOT EXISTS staff_sessions (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id     uuid NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
      created_at   timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      expires_at   timestamptz NOT NULL,
      revoked_at   timestamptz,
      ip           text,
      user_agent   text
    )`)
  await run('index staff_sessions.staff_id', `CREATE INDEX IF NOT EXISTS staff_sessions_staff_idx ON staff_sessions (staff_id)`)
  await run('index staff_sessions.expires_at', `CREATE INDEX IF NOT EXISTS staff_sessions_expiry_idx ON staff_sessions (expires_at)`)

  await run('create staff_password_resets', `
    CREATE TABLE IF NOT EXISTS staff_password_resets (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id        uuid NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
      email           text NOT NULL,
      code            text NOT NULL,
      expires_at      timestamptz NOT NULL,
      used_at         timestamptz,
      failed_attempts int NOT NULL DEFAULT 0,
      request_ip      text,
      created_at      timestamptz NOT NULL DEFAULT now()
    )`)
  await run('index staff_password_resets.staff_id', `CREATE INDEX IF NOT EXISTS staff_password_resets_staff_idx ON staff_password_resets (staff_id)`)

  await run('create staff_audit_log', `
    CREATE TABLE IF NOT EXISTS staff_audit_log (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id    uuid REFERENCES staff_accounts(id) ON DELETE SET NULL,
      staff_email text,
      action      text NOT NULL,
      target_type text,
      target_id   text,
      detail      jsonb,
      ip          text,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`)
  await run('index staff_audit_log.created_at', `CREATE INDEX IF NOT EXISTS staff_audit_log_created_idx ON staff_audit_log (created_at DESC)`)
  await run('index staff_audit_log.staff_id', `CREATE INDEX IF NOT EXISTS staff_audit_log_staff_idx ON staff_audit_log (staff_id)`)
  // Document views are audited, so "who opened document X" must not be a seq scan.
  // Mirrors migrate-documents-audit.mjs in the backend repo — keep both in step.
  await run('index staff_audit_log.target', `CREATE INDEX IF NOT EXISTS staff_audit_log_target_idx ON staff_audit_log (target_type, target_id)`)

  // ---- optional: seed the first super admin ---------------------------------
  const seedEmail = (url.searchParams.get('seed_email') || '').trim().toLowerCase()
  const seedPassword = url.searchParams.get('seed_password') || ''
  let seeded: string | null = null
  if (seedEmail && seedPassword) {
    try {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(seedEmail)) throw new Error('invalid email')
      if (seedPassword.length < 10 || !/[a-zA-Z]/.test(seedPassword) || !/[0-9]/.test(seedPassword)) {
        throw new Error('password must be 10+ chars with a letter and a digit')
      }
      const existing = await pool.query(
        `SELECT 1 FROM staff_accounts WHERE role = 'super_admin' AND is_active LIMIT 1`
      )
      if (existing.rows.length > 0) throw new Error('an active super admin already exists')

      const salt = randomBytes(16).toString('hex')
      const hash = `${salt}:${scryptSync(seedPassword, salt, 64).toString('hex')}`
      const { rows } = await pool.query(
        `INSERT INTO staff_accounts (email, password_hash, full_name, role, is_active)
         VALUES (lower($1), $2, $3, 'super_admin', true)
         ON CONFLICT (lower(email)) DO UPDATE
           SET password_hash = EXCLUDED.password_hash, role = 'super_admin', is_active = true,
               failed_login_attempts = 0, locked_until = NULL,
               password_changed_at = now(), updated_at = now()
         RETURNING id, email`,
        [seedEmail, hash, url.searchParams.get('seed_name') || 'Super Admin']
      )
      await pool.query(
        `INSERT INTO staff_audit_log (staff_id, staff_email, action, detail)
         VALUES ($1, $2, 'seed_super_admin', $3::jsonb)`,
        [rows[0].id, rows[0].email, JSON.stringify({ via: 'xmig8' })]
      )
      seeded = rows[0].email
      steps.push('ok: seed super admin')
    } catch (e) {
      steps.push('ERR seed super admin: ' + (e as Error).message)
    }
  }

  // ---- verify --------------------------------------------------------------
  let present: string[] = []
  let superAdmins = 0
  try {
    const r = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [TABLES]
    )
    present = r.rows.map((x: { table_name: string }) => x.table_name)
    const s = await pool.query(`SELECT count(*)::int AS n FROM staff_accounts WHERE role='super_admin' AND is_active`)
    superAdmins = s.rows[0].n
  } catch { /* ignore */ }

  return NextResponse.json({
    ok: present.length === TABLES.length,
    steps,
    tables_present: present.sort(),
    tables_missing: TABLES.filter((t) => !present.includes(t)),
    active_super_admins: superAdmins,
    seeded,
  })
}
