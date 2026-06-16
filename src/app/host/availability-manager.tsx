'use client'

// Host availability manager for a single listing. Lets a host block a date
// range (POST), see the listing's current spans, and remove a host block
// (DELETE). Booked spans are shown read-only (greyed, no × ) since the host
// can't free a guest's reservation here; only host-placed blocks are removable.
//
// Talks to the backend with the bearer token in qk_token (same pattern as the
// rest of the host dashboard). Half-open ranges throughout: a block
// start=2030-01-10 end=2030-01-15 covers Jan 10–14, leaving Jan 15 bookable.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_URL, getAvailability, getToken, type AvailabilitySpan } from '@/lib/api'
import { addDays, rangeOverlapsAny, toRanges } from '@/lib/availability'
import DatePickerField from '@/app/_components/date-picker-field'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

// Format an ISO date for display in the host's calendar list.
function fmt(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const todayISO = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export default function AvailabilityManager({
  listingId,
}: {
  listingId: string
}) {
  const { t } = useLanguage()

  const [spans, setSpans] = useState<AvailabilitySpan[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // id of the block currently being removed (disables its × button)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    const rows = await getAvailability(listingId)
    setSpans(rows)
    setLoading(false)
  }, [listingId])

  // Lazy: only fetch the first time the panel is opened (it's mounted on open).
  useEffect(() => {
    load().catch(() => setLoadError(true))
  }, [load])

  const ranges = useMemo(() => toRanges(spans), [spans])

  // Disable already-taken days in BOTH pickers so the host can't author a block
  // that overlaps an existing span. End must be after start (half-open), so the
  // end picker's `min` is the day after start.
  const isDisabled = useCallback(
    (iso: string) => {
      for (const r of ranges) if (iso >= r.start && iso < r.end) return true
      return false
    },
    [ranges]
  )

  const blocks = spans.filter((s) => s.kind === 'blocked')
  const booked = spans.filter((s) => s.kind === 'booked')

  const canAdd =
    !!start && !!end && end > start && !submitting && !rangeOverlapsAny(start, end, ranges)

  async function addBlock() {
    setFormError(null)
    if (!start || !end || end <= start) {
      setFormError(t('availability.invalidRange'))
      return
    }
    if (rangeOverlapsAny(start, end, ranges)) {
      setFormError(t('availability.overlaps'))
      return
    }
    const token = getToken()
    if (!token) {
      setFormError(t('availability.signInRequired'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(
        `${API_URL}/api/local/listings/${encodeURIComponent(listingId)}/availability`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify({ start, end, note: note.trim() || undefined }),
        }
      )
      if (res.status === 401) {
        setFormError(t('availability.signInRequired'))
        return
      }
      if (res.status === 403) {
        setFormError(t('availability.notHost'))
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status !== 201 && !res.ok) {
        setFormError((data && data.error) || t('availability.addError'))
        return
      }
      // Reset the form and refresh the list so the new block appears.
      setStart('')
      setEnd('')
      setNote('')
      await load()
    } catch {
      setFormError(t('availability.networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  async function removeBlock(blockId: string) {
    const token = getToken()
    if (!token) {
      setFormError(t('availability.signInRequired'))
      return
    }
    setRemovingId(blockId)
    setFormError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/local/listings/${encodeURIComponent(listingId)}/availability?blockId=${encodeURIComponent(blockId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token },
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFormError((data && data.error) || t('availability.removeError'))
        return
      }
      await load()
    } catch {
      setFormError(t('availability.networkError'))
    } finally {
      setRemovingId(null)
    }
  }

  // end picker can't go on/before start; never before tomorrow either.
  const endMin = start ? addDays(start, 1) : addDays(todayISO(), 1)

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 16,
        borderTop: '1px solid rgba(42,34,32,0.08)',
        fontFamily: FONT,
      }}
    >
      <p style={{ margin: '0 0 12px', fontSize: 13, color: COLORS.muted }}>
        {t('availability.intro')}
      </p>

      {/* Block-a-range form ------------------------------------------------- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          alignItems: 'end',
        }}
      >
        <DatePickerField
          label={t('availability.from')}
          value={start}
          ariaLabel={t('availability.from')}
          compact
          min={todayISO()}
          isDateDisabled={isDisabled}
          onChange={(iso) => {
            setStart(iso)
            if (iso && end && end <= iso) setEnd('')
            setFormError(null)
          }}
        />
        <DatePickerField
          label={t('availability.to')}
          value={end}
          ariaLabel={t('availability.to')}
          compact
          min={endMin}
          isDateDisabled={isDisabled}
          onChange={(iso) => {
            setEnd(iso)
            setFormError(null)
          }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: COLORS.muted,
            marginBottom: 6,
          }}
        >
          {t('availability.note')}
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('availability.notePlaceholder')}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            fontSize: 14,
            fontFamily: FONT,
            color: COLORS.ink,
            background: '#fff',
            border: '1px solid rgba(42,34,32,0.14)',
            borderRadius: 12,
            outline: 'none',
          }}
        />
      </div>

      {formError && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(91,15,22,0.08)',
            border: '1px solid rgba(91,15,22,0.2)',
            fontSize: 13,
            color: COLORS.burgundy,
            fontWeight: 600,
          }}
        >
          {formError}
        </div>
      )}

      <button
        type="button"
        onClick={addBlock}
        disabled={!canAdd}
        className={canAdd ? 'qk-press' : undefined}
        style={{
          marginTop: 14,
          padding: '11px 22px',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: FONT,
          color: '#fff',
          background: GRAD_BURGUNDY,
          border: 'none',
          borderRadius: 12,
          cursor: canAdd ? 'pointer' : 'not-allowed',
          opacity: canAdd ? 1 : 0.55,
          boxShadow: canAdd ? '0 8px 20px rgba(91,15,22,0.22)' : 'none',
        }}
      >
        {submitting ? t('availability.adding') : t('availability.addBlock')}
      </button>

      {/* Current calendar --------------------------------------------------- */}
      <div style={{ marginTop: 20 }}>
        <h4
          style={{
            margin: '0 0 10px',
            fontSize: 14,
            fontWeight: 700,
            color: COLORS.ink,
          }}
        >
          {t('availability.current')}
        </h4>

        {loading ? (
          <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>
            {t('availability.loading')}
          </p>
        ) : loadError ? (
          <p style={{ margin: 0, fontSize: 13, color: COLORS.burgundy }}>
            {t('availability.loadError')}
          </p>
        ) : spans.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>
            {t('availability.noBlocks')}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {/* Host blocks first (removable), then read-only booked spans. */}
            {[...blocks, ...booked].map((s) => {
              const isBooked = s.kind === 'booked'
              const busy = removingId === s.id
              return (
                <li
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: isBooked ? COLORS.tan : '#fff',
                    border: isBooked
                      ? '1px solid rgba(42,34,32,0.10)'
                      : '1px solid rgba(91,15,22,0.18)',
                    opacity: isBooked ? 0.85 : 1,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 9px',
                          borderRadius: 999,
                          color: isBooked ? '#8a5a00' : COLORS.burgundy,
                          background: isBooked
                            ? 'rgba(176,122,0,0.14)'
                            : 'rgba(91,15,22,0.10)',
                        }}
                      >
                        {isBooked ? t('availability.booked') : t('availability.blocked')}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>
                        {fmt(s.start)} → {fmt(s.end)}
                      </span>
                    </div>
                    {s.note && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: 12,
                          color: COLORS.muted,
                          fontStyle: 'italic',
                        }}
                      >
                        “{s.note}”
                      </p>
                    )}
                  </div>

                  {isBooked ? (
                    <span style={{ fontSize: 12, color: COLORS.muted, flex: '0 0 auto' }}>
                      {t('availability.readOnly')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeBlock(s.id)}
                      disabled={busy}
                      aria-label={t('availability.remove')}
                      title={t('availability.remove')}
                      className={busy ? undefined : 'qk-press'}
                      style={{
                        flex: '0 0 auto',
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        border: `1px solid ${COLORS.burgundy}`,
                        background: '#fff',
                        color: COLORS.burgundy,
                        fontSize: 18,
                        lineHeight: 1,
                        cursor: busy ? 'not-allowed' : 'pointer',
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      {busy ? '·' : '×'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
