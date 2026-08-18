'use client'

// The profile photo on /account — the one thing Edit profile never had.
//
// It lives in its own file, mounted inside the identity card by page.tsx, rather
// than as another field in <AccountForms>. Two reasons: a photo saves on pick
// instead of on a Save button, so it has nothing to share with a form; and the
// avatar the card was already rendering is the natural preview, so the control
// belongs next to the face rather than three cards down the page.
//
// Saving goes through PATCH /api/local/users/:id — the same door the name uses,
// and the same door the mobile apps write `avatar_url` through, so a photo set
// here and a photo set on the phone are one profile. The bytes are a base64
// `data:` URL: this stack has no object storage (see avatar-core.ts).
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { fileToCompressedDataUrl } from '@/lib/image'
import {
  AVATAR_JPEG_QUALITY,
  AVATAR_MIME_TYPES,
  MAX_AVATAR_DIMENSION,
  checkAvatar,
} from '@/lib/local/avatar-core'

const C = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

/** The file types the picker offers. Kept in step with what the server stores,
 *  plus HEIC — an iPhone hands us one and lib/image.ts converts it to JPEG. */
const ACCEPT = [...AVATAR_MIME_TYPES, 'image/heic', 'image/heif'].join(',')

function linkButton(disabled: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
    fontSize: 13,
    fontWeight: 700,
    color: C.burgundy,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

export function AvatarPicker({
  userId,
  initialUrl,
  initials,
  displayName,
  children,
}: {
  userId: string
  initialUrl: string | null
  initials: string
  displayName: string
  /** The rest of the identity card — email and the verification chip — rendered
   *  on the server by page.tsx and passed through, so making the avatar
   *  interactive doesn't drag the whole card into the client bundle. */
  children?: React.ReactNode
}) {
  const router = useRouter()
  const t = useTranslations('accountPage')

  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [busy, setBusy] = useState<'saving' | 'removing' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  /** Write `avatar_url` and adopt it locally, or report why it didn't stick. */
  async function save(next: string | null, mode: 'saving' | 'removing') {
    setBusy(mode)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/local/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ avatar_url: next }),
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || t('photo.error'))
      }
      setUrl(next)
      setSaved(true)
      // The same face is on the header of every page this session renders next.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('photo.error'))
    } finally {
      setBusy(null)
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input straight away, so picking the same file twice after a
    // failure still fires a change event.
    e.target.value = ''
    if (!file) return

    setBusy('saving')
    setError(null)
    setSaved(false)
    let dataUrl: string
    try {
      // Downscaled here rather than on the server because the browser already has
      // the pixels: a 12MP phone photo becomes ~15KB before it ever goes over the
      // wire. The two numbers are the ones the iOS picker uses.
      dataUrl = await fileToCompressedDataUrl(file, MAX_AVATAR_DIMENSION, AVATAR_JPEG_QUALITY)
    } catch {
      setBusy(null)
      setError(t('photo.unreadable'))
      return
    }

    // The server decides this too. Asking here as well means a photo that cannot
    // be stored is refused before the upload rather than after it.
    const problem = checkAvatar(dataUrl)
    if (problem) {
      setBusy(null)
      setError(t(`photo.problem.${problem.code}`))
      return
    }

    await save(dataUrl, 'saving')
  }

  return (
    <>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          background: C.tan,
          color: C.burgundy,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 24,
          overflow: 'hidden',
          flexShrink: 0,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={displayName}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          initials
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>{displayName}</div>

        {children}

        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            onChange={onPick}
            style={{ display: 'none' }}
            aria-hidden
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            style={linkButton(busy !== null)}
          >
            {busy === 'saving'
              ? t('photo.saving')
              : url
                ? t('photo.change')
                : t('photo.add')}
          </button>

          {url && (
            <button
              type="button"
              onClick={() => save(null, 'removing')}
              disabled={busy !== null}
              style={{ ...linkButton(busy !== null), color: C.muted }}
            >
              {busy === 'removing' ? t('photo.removing') : t('photo.remove')}
            </button>
          )}
        </div>

        {error ? (
          <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: '#b3261e' }}>
            {error}
          </p>
        ) : saved ? (
          <p role="status" style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: '#177245' }}>
            {t('photo.saved')}
          </p>
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted }}>{t('photo.hint')}</p>
        )}
      </div>
    </>
  )
}
