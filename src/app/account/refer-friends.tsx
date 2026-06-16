'use client'

// "Refer friends" card shown on the account page. Fetches the signed-in user's
// referral code + stats (GET /api/local/referrals) and renders the code with a
// copy button, the invited count, the total reward earned, and the list of
// referred friends. Hides itself if the referral state can't be loaded.
import { useEffect, useState } from 'react'
import { getReferrals, getToken, type ReferralState } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default function ReferFriends() {
  const { t, lang } = useLanguage()
  const [state, setState] = useState<ReferralState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoaded(true)
      return
    }
    const ac = new AbortController()
    getReferrals(token, ac.signal).then((res) => {
      if (ac.signal.aborted) return
      setState(res)
      setLoaded(true)
    })
    return () => ac.abort()
  }, [])

  async function copyCode() {
    if (!state?.code) return
    try {
      await navigator.clipboard.writeText(state.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard unavailable — leave the code visible to copy manually.
    }
  }

  // Don't render anything until we've tried to load. If there's no code (not
  // signed in / endpoint unavailable), hide the surface entirely.
  if (!loaded) return null
  if (!state || !state.code) return null

  const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'
  const fmtDate = (iso: string): string => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div
      style={{
        marginTop: 24,
        background: '#fff',
        borderRadius: 22,
        border: '1px solid rgba(42,34,32,0.06)',
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding: '26px 26px 28px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'linear-gradient(135deg,#B07A2A,#d8a55a)',
            color: '#fff',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: COLORS.ink }}>
          {t('referral.title')}
        </h2>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: COLORS.muted, lineHeight: 1.5 }}>
        {t('referral.subtitle')}
      </p>

      {/* Referral code + copy */}
      <div style={{ marginBottom: 20 }}>
        <span
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: COLORS.muted,
            marginBottom: 8,
          }}
        >
          {t('referral.yourCode')}
        </span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <code
            style={{
              flex: '1 1 160px',
              minWidth: 0,
              display: 'inline-flex',
              alignItems: 'center',
              fontFamily: '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: COLORS.burgundy,
              background: COLORS.cream,
              border: `1px dashed ${COLORS.gold}`,
              borderRadius: 14,
              padding: '12px 16px',
            }}
          >
            {state.code}
          </code>
          <button
            type="button"
            onClick={copyCode}
            className="qk-press"
            style={{
              flex: '0 0 auto',
              padding: '12px 22px',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: FONT,
              color: '#fff',
              background: copied ? '#0f5132' : 'linear-gradient(135deg,#5B0F16,#8a2530)',
              border: 'none',
              borderRadius: 14,
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(91,15,22,0.24)',
            }}
          >
            {copied ? `✓ ${t('referral.copied')}` : t('referral.copy')}
          </button>
        </div>
      </div>

      {/* Stats — invited count + rewards earned */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: state.referred.length > 0 ? 24 : 0,
        }}
      >
        <Stat label={t('referral.invited')} value={String(state.count)} />
        <Stat label={t('referral.reward')} value={`EGP ${state.rewardTotal}`} />
      </div>

      {/* Referred friends list */}
      {state.referred.length > 0 ? (
        <div>
          <span
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: COLORS.muted,
              marginBottom: 10,
            }}
          >
            {t('referral.friendsList')}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {state.referred.map((f, i) => (
              <div
                key={`${f.name ?? 'friend'}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  background: COLORS.cream,
                  borderRadius: 14,
                  border: '1px solid rgba(42,34,32,0.06)',
                  padding: '12px 16px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: COLORS.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.name || t('referral.anonymous')}
                  </p>
                  {f.created_at && (
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: COLORS.muted }}>
                      {fmtDate(f.created_at)}
                    </p>
                  )}
                </div>
                {f.reward_amount > 0 && (
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#0f5132',
                      background: 'rgba(15,81,50,0.10)',
                      borderRadius: 999,
                      padding: '4px 12px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    +EGP {f.reward_amount}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ margin: '20px 0 0', fontSize: 13.5, color: COLORS.muted, textAlign: 'center' }}>
          {t('referral.none')}
        </p>
      )}
    </div>
  )
}

// One stat tile (invited count / rewards earned).
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: COLORS.tan,
        borderRadius: 16,
        padding: '14px 16px',
      }}
    >
      <span style={{ display: 'block', fontSize: 12, color: COLORS.muted, fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ display: 'block', marginTop: 4, fontSize: 24, fontWeight: 800, color: COLORS.burgundy }}>
        {value}
      </span>
    </div>
  )
}
