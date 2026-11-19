'use client'

// The /ops listing photo viewer: every photo a host uploaded, in their order, in an
// in-page lightbox. The listings list only carries the cover photo, so the gallery
// is fetched on open from GET /api/local/admin/listings/:id/photos (module
// `listings`) — which, unlike the public detail route, also answers for pending,
// rejected and hidden listings: exactly the ones a reviewer needs to look at.
import { useCallback, useEffect, useState } from 'react'
import { adminGet } from './ops-ui'
import { COLORS } from '../ops-theme'

type Photo = { id: string | null; url: string; kind: 'hosted' | 'inline'; position: number }
type PhotosPayload = { listing_id: string; title: string; photos: Photo[] }

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; title: string; photos: Photo[] }

export function ListingPhotoViewer({
  listingId,
  title,
  onClose,
}: {
  listingId: string
  title: string
  onClose: () => void
}) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [index, setIndex] = useState(0)

  useEffect(() => {
    // Starts in 'loading' at index 0 — the parent keys this component by listing
    // id, so opening another listing remounts it rather than resetting here.
    let cancelled = false
    void adminGet<PhotosPayload>(`listings/${encodeURIComponent(listingId)}/photos`).then((res) => {
      if (cancelled) return
      if (res === 'forbidden') setState({ status: 'error', message: 'Your account does not have the Listings permission.' })
      else if (!res) setState({ status: 'error', message: 'Could not load the photos. Please retry.' })
      else setState({ status: 'ready', title: res.title || title, photos: Array.isArray(res.photos) ? res.photos : [] })
    })
    return () => {
      cancelled = true
    }
  }, [listingId, title])

  const count = state.status === 'ready' ? state.photos.length : 0
  const go = useCallback(
    (delta: number) => {
      if (count < 2) return
      setIndex((i) => (i + delta + count) % count)
    },
    [count]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [go, onClose])

  const current = state.status === 'ready' ? state.photos[index] : undefined

  const navBtn: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 44,
    height: 44,
    borderRadius: 22,
    border: 'none',
    background: 'rgba(255,255,255,0.92)',
    color: COLORS.ink,
    fontSize: 22,
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photos of ${title}`}
      data-testid="listing-photo-viewer"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(20,16,15,0.88)',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        gap: 12,
      }}
    >
      {/* Header */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#fff', maxWidth: 1100, width: '100%', margin: '0 auto' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {state.status === 'ready' ? state.title : title}
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.75 }}>
            {state.status === 'ready'
              ? count === 0
                ? 'No photos'
                : `Photo ${index + 1} of ${count}`
              : state.status === 'loading'
                ? 'Loading photos…'
                : ''}
          </div>
        </div>
        {current ? (
          <a
            href={current.kind === 'hosted' ? current.url : undefined}
            onClick={(e) => {
              // A data URL cannot be opened in a new tab directly (browsers block
              // top-level data: navigation), so hand it over as a blob instead.
              if (current.kind === 'inline') {
                e.preventDefault()
                void fetch(current.url)
                  .then((r) => r.blob())
                  .then((b) => {
                    const u = URL.createObjectURL(b)
                    window.open(u, '_blank', 'noopener,noreferrer')
                    setTimeout(() => URL.revokeObjectURL(u), 60_000)
                  })
              }
            }}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#fff', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}
          >
            Open full size
          </a>
        ) : null}
        <button
          onClick={onClose}
          aria-label="Close photos"
          style={{
            border: 'none',
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            borderRadius: 18,
            width: 36,
            height: 36,
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      {/* Stage */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: 1100,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {state.status === 'loading' ? <div style={{ color: '#fff', opacity: 0.8 }}>Loading…</div> : null}
        {state.status === 'error' ? (
          <div onClick={(e) => e.stopPropagation()} style={{ color: '#fff', background: COLORS.red, padding: '10px 14px', borderRadius: 12 }}>
            {state.message}
          </div>
        ) : null}
        {state.status === 'ready' && count === 0 ? (
          <div style={{ color: '#fff', opacity: 0.8 }}>This listing has no photos.</div>
        ) : null}
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.url}
            src={current.url}
            alt={`${title} — photo ${index + 1}`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, background: '#000' }}
          />
        ) : null}
        {count > 1 ? (
          <>
            <button
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation()
                go(-1)
              }}
              style={{ ...navBtn, left: 8 }}
            >
              ‹
            </button>
            <button
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation()
                go(1)
              }}
              style={{ ...navBtn, right: 8 }}
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      {/* Thumbnail strip */}
      {state.status === 'ready' && count > 1 ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            maxWidth: 1100,
            width: '100%',
            margin: '0 auto',
            paddingBottom: 4,
          }}
        >
          {state.photos.map((p, i) => (
            <button
              key={p.id ?? `${i}`}
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              style={{
                flexShrink: 0,
                padding: 0,
                border: i === index ? '2px solid #fff' : '2px solid transparent',
                borderRadius: 10,
                background: 'transparent',
                cursor: 'pointer',
                opacity: i === index ? 1 : 0.6,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt=""
                loading="lazy"
                style={{ width: 84, height: 60, objectFit: 'cover', borderRadius: 8, display: 'block' }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
