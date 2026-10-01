'use client'

// The host's "Guest questions" list: GET /api/local/host/comments returns every
// comment across their listings, unanswered first, with `unanswered` counted by the
// server. Each row reuses the listing page's CommentItem, so replying, editing and
// deleting a reply behave identically in both places; the row adds which listing the
// question is on and a link to it there (`/explore/<id>#comments`).
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ShimmerStyles, SkeletonRow } from '@/components/ui/skeleton-block'
import { CommentItem, PolicyWarningGate } from '@/components/listing-comments'
import {
  unansweredCount,
  type HostComment,
  type ListingComment,
  type PolicyWarning,
} from '@/lib/local/listing-comments-ui-core'

const C = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

export function HostQuestions() {
  const t = useTranslations('hostQuestions')
  const [rows, setRows] = useState<HostComment[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [warning, setWarning] = useState<PolicyWarning | null>(null)
  const [now, setNow] = useState(0)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await fetch('/api/local/host/comments', { credentials: 'same-origin', cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      setRows(Array.isArray(body?.comments) ? body.comments : [])
    } catch {
      setRows([])
      setLoadError(true)
    }
    setNow(Date.now())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (rows === null) {
    return (
      <>
        <ShimmerStyles />
        <div style={{ display: 'grid', gap: 12 }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </>
    )
  }

  // Counted locally rather than kept from the response: replying in this list
  // changes it, and the header should move with the rows.
  const unanswered = unansweredCount(rows)

  // Keep the listing fields when a write returns the bare comment shape.
  const update = (u: ListingComment) =>
    setRows((prev) => (prev ? prev.map((r) => (r.id === u.id ? { ...r, ...u } : r)) : prev))

  return (
    <>
      {loadError && (
        <p style={{ margin: '0 0 16px', fontSize: 14, color: C.burgundy }}>{t('loadFailed')}</p>
      )}

      {rows.length > 0 && (
        <p role="status" style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: C.ink }}>
          {t('unanswered', { count: unanswered })}
        </p>
      )}

      {warning && <PolicyWarningGate warning={warning} onCleared={() => setWarning(null)} />}

      {rows.length === 0 && !loadError ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 22,
            border: '1px solid rgba(42,34,32,0.06)',
            boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
            padding: '48px 24px',
            textAlign: 'center',
            color: C.muted,
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: C.ink }}>{t('empty.title')}</p>
          <p style={{ margin: 0, fontSize: 15 }}>{t('empty.hint')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {rows.map((row) => (
            <div key={row.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                {row.listing_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.listing_image}
                    alt=""
                    width={36}
                    height={36}
                    style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', background: C.tan }}
                  />
                ) : null}
                <a
                  href={`/explore/${row.listing_id}#comments`}
                  style={{ fontSize: 14, fontWeight: 700, color: C.ink, textDecoration: 'none', minWidth: 0, overflowWrap: 'anywhere' }}
                >
                  {row.listing_title || t('untitledListing')} →
                </a>
                {!row.reply && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      textTransform: 'uppercase',
                      color: '#fff',
                      background: C.burgundy,
                      borderRadius: 999,
                      padding: '3px 9px',
                    }}
                  >
                    {t('needsReply')}
                  </span>
                )}
              </div>
              <CommentItem
                comment={row}
                listingId={row.listing_id}
                isHost
                ctx={{ onWarning: setWarning, gated: Boolean(warning) }}
                now={now}
                onUpdated={update}
                onDeleted={() => setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev))}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
