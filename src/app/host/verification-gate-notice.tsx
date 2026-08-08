// Why a host can't add a listing yet, and what to do about it.
//
// Rendered INSTEAD of the create form rather than beside it: letting someone
// fill in a listing they cannot submit wastes their time and turns a clear rule
// into a 403 at the end. The wording comes from canPublishListing() so the site
// and both apps say the same thing, and the call to action is chosen by the
// refusal `code` — "verify now" and "we're reviewing it" need different buttons.
import type { ListingGateCode } from '@/lib/local/host-verification-core'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

/** The action that actually unblocks each refusal. */
const CTA: Record<ListingGateCode, { href: string; label: string } | null> = {
  ok: null,
  not_host: { href: '/host/apply', label: 'Apply to become a host' },
  verification_missing: { href: '/verify-id', label: 'Verify my identity' },
  // Nothing for the host to do but wait — offering a button here would invite
  // pointless resubmissions and reset their place in the queue.
  verification_pending: null,
  verification_rejected: { href: '/verify-id', label: 'Upload my documents again' },
}

export function VerificationGateNotice({
  code,
  message,
  /** The reviewer's reason, shown only when the documents were rejected. */
  reason,
}: {
  code: ListingGateCode
  message: string
  reason?: string | null
}) {
  const cta = CTA[code]
  const rejected = code === 'verification_rejected'

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 22,
        border: `1px solid ${rejected ? 'rgba(179,38,30,0.35)' : 'rgba(42,34,32,0.08)'}`,
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding: '32px 26px',
        maxWidth: 620,
      }}
    >
      <h2 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 800, color: C.ink }}>
        {code === 'not_host'
          ? 'Become a host first'
          : code === 'verification_pending'
            ? "We're reviewing your documents"
            : rejected
              ? 'Your documents need another look'
              : 'Verify your identity to start listing'}
      </h2>

      <p style={{ margin: '0 0 16px', fontSize: 15, color: C.muted, lineHeight: 1.65 }}>{message}</p>

      {rejected && reason ? (
        <div
          style={{
            background: C.cream,
            border: `1px solid ${C.tan}`,
            borderRadius: 14,
            padding: '12px 14px',
            margin: '0 0 18px',
          }}
        >
          <p style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 700, color: C.ink }}>
            Reason given by our team
          </p>
          <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{reason}</p>
        </div>
      ) : null}

      {cta ? (
        <a
          href={cta.href}
          style={{
            display: 'inline-block',
            background: C.burgundy,
            color: '#fff',
            borderRadius: 999,
            padding: '10px 24px',
            fontWeight: 700,
            fontSize: 14.5,
            textDecoration: 'none',
          }}
        >
          {cta.label}
        </a>
      ) : null}

      <p style={{ margin: '18px 0 0', fontSize: 13, color: C.muted }}>
        Your existing listings are not affected by this.
      </p>
    </div>
  )
}
