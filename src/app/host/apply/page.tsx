// Become-a-host application (no Supabase) — an admin-reviewed application, NOT
// an instant flip. Server-resolves the signed-in user + their host_status from the
// database on every request (force-dynamic; never a cached client flag):
//   - not signed in  → redirect('/login')
//   - approved       → redirect('/host')
//   - pending        → calm "under review" state (read-only)
//   - rejected       → the reason + the form again, as a reapply
//   - none           → the application form (client component)
// The signed-in user's identity verification is resolved here too and handed to
// the form, which drops its ID-upload step for anyone already verified or under
// review. See needsIdentityDocuments in host-verification-core.
import type { Metadata } from 'next'
import type { HostStatus, HostApplication, Verification } from '@/lib/types'
import { viewer, backendFetchOr } from '@/lib/backend'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { normalizeVerificationStatus } from '@/lib/local/host-verification-core'
import { ApplyForm } from './apply-form'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostApply')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/host/apply' },
    robots: { index: false, follow: true },
  }
}

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

interface ApplyUser {
  id: string
  email: string
  full_name: string | null
  host_status: HostStatus
  host_review_note: string | null
}

function Header({ backLabel }: { backLabel: string }) {
  return (
    <header
      style={{
        background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
        borderBottom: `1px solid rgba(91,15,22,0.10)`,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <img
            src="/logo.png"
            alt="QuickIn"
            height={40}
            style={{ height: 40, width: 'auto', display: 'block' }}
          />
        </a>
        <a
          href="/account"
          style={{
            color: COLORS.burgundy,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← {backLabel}
        </a>
      </div>
    </header>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function HostApplyPage() {
  const user = await viewer()
  if (!user) redirect('/login')
  if (user.host_status === 'approved') redirect('/host')

  const t = await getTranslations('hostApply')
  // Identity is verified ONCE, from the profile, and serves guest and host alike.
  // Read from the same place submitHostApplication reads (the id_verifications
  // row, not users.verification_status) so the form asks for exactly what the
  // server will require — an already-verified applicant is never sent back to
  // photograph the same ID a second time.
  const [{ application }, verification] = await Promise.all([
    backendFetchOr<{ application: HostApplication | null }>('/api/local/host/application', { application: null }),
    backendFetchOr<Verification | null>('/api/local/verification', null),
  ])
  const pending = user.host_status === 'pending'
  const rejected = user.host_status === 'rejected'

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
      }}
    >
      <Header backLabel={t('backToAccount')} />

      <section
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '36px 24px 72px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 6px',
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 'clamp(26px, 4vw, 34px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: COLORS.burgundy,
            }}
          >
            {t('title')}
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: COLORS.muted, lineHeight: 1.55 }}>
            {pending ? t('pending.subtitle') : rejected ? t('rejected.subtitle') : t('subtitle')}
          </p>
        </div>

        {/* Rejected: the decision + the admin's reason, then the form again so the
            applicant can fix what was wrong and reapply (re-submitting clears it). */}
        {rejected && (
          <div
            style={{
              background: '#fff',
              borderRadius: 22,
              border: `1px solid rgba(179,38,30,0.22)`,
              boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
              padding: '28px 26px',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                background: '#fdecea',
                color: '#b3261e',
                fontSize: 12.5,
                fontWeight: 700,
                padding: '5px 14px',
                borderRadius: 999,
              }}
            >
              {t('rejected.badge')}
            </span>
            <h2 style={{ margin: '16px 0 6px', fontSize: 19, fontWeight: 700, color: COLORS.ink }}>
              {t('rejected.title')}
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 14.5, color: COLORS.muted, lineHeight: 1.6 }}>
              {t('rejected.body')}
            </p>
            <dl style={{ margin: 0, display: 'grid', gap: 14 }}>
              <SummaryRow
                label={t('rejected.reason')}
                value={user.host_review_note || t('rejected.noReason')}
              />
              {application?.reviewed_at && (
                <SummaryRow label={t('rejected.reviewedAt')} value={formatDate(application.reviewed_at)} />
              )}
            </dl>
          </div>
        )}

        {pending && application ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 22,
              border: `1px solid rgba(42,34,32,0.06)`,
              boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
              padding: '28px 26px',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                background: '#fff7e6',
                color: '#9a6b00',
                fontSize: 12.5,
                fontWeight: 700,
                padding: '5px 14px',
                borderRadius: 999,
              }}
            >
              {t('pending.badge')}
            </span>
            <h2 style={{ margin: '16px 0 6px', fontSize: 19, fontWeight: 700, color: COLORS.ink }}>
              {t('pending.title')}
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 14.5, color: COLORS.muted, lineHeight: 1.6 }}>
              {t('pending.body')}
            </p>

            <dl style={{ margin: 0, display: 'grid', gap: 14 }}>
              <SummaryRow label={t('fields.fullName')} value={application.full_name} />
              <SummaryRow label={t('fields.nationalId')} value={application.national_id} />
              <SummaryRow label={t('fields.phone')} value={application.phone} />
              <SummaryRow label={t('fields.address')} value={application.address} />
              {application.company && (
                <SummaryRow label={t('fields.company')} value={application.company} />
              )}
              {application.notes && (
                <SummaryRow label={t('fields.notes')} value={application.notes} />
              )}
              <SummaryRow
                label={t('pending.submittedAt')}
                value={application.submitted_at ? formatDate(application.submitted_at) : null}
              />
            </dl>
          </div>
        ) : (
          <ApplyForm
            initialName={application?.full_name || user.full_name || ''}
            reapply={rejected}
            identity={{
              status: normalizeVerificationStatus(verification?.status ?? null),
              idNumber: verification?.id_number ?? null,
              docType: verification?.doc_type ?? null,
              notes: verification?.notes ?? null,
            }}
            previous={
              rejected && application
                ? {
                    national_id: application.national_id ?? '',
                    phone: application.phone ?? '',
                    address: application.address ?? '',
                    company: application.company ?? '',
                    notes: application.notes ?? '',
                  }
                : null
            }
          />
        )}
      </section>
    </main>
  )
}

function SummaryRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <dt style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.02em' }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: 15, color: COLORS.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {value || '—'}
      </dd>
    </div>
  )
}
