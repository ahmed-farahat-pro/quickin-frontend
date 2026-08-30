'use client'

// The host's services area: their own services (with a deactivate / reactivate
// toggle), the subscription-request inbox, and the form that posts a new one.
//
// Endpoints, all cookie-authed through the same-origin /api rewrite:
//   GET   /api/local/host/services                    → the host's own services
//   GET   /api/local/host/service-requests            → the inbox
//   POST  /api/local/services                         → post a service
//   PATCH /api/local/service-requests/:id             → confirm | reject
//   PATCH /api/local/host/services/:id/visibility     → take down / put back
//
// Both lists are fetched by the SERVER component and handed in as props, then
// re-fetched here after any mutation. That is not only to avoid a skeleton
// flash on a page whose data the server already has the session for: an effect
// that fetches on mount and then setStates is what
// react-hooks/set-state-in-effect exists to catch, and the honest way to
// satisfy that rule is to not have the mount fetch at all.
import { useCallback, useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { Service, ServiceRequest } from '@/lib/types'
import {
  SERVICE_REQUEST_BUCKET_ORDER,
  canToggleService,
  guestFacingPrice,
  hostServiceState,
  isActionableRequest,
  serviceBody,
  serviceDraftProblem,
  serviceRequestBucket,
  serviceRequestCounts,
  type ServiceRequestBucket,
} from '@/lib/local/services-core'
import { formatPrice } from '@/lib/utils'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const DATE_LOCALE: Record<string, string> = {
  ar: 'ar-EG',
  fr: 'fr-FR',
  es: 'es-ES',
  en: 'en-US',
}

const BUCKET_CHIP: Record<ServiceRequestBucket, { bg: string; fg: string }> = {
  pending: { bg: '#fff7e6', fg: '#9a6b00' },
  confirmed: { bg: '#e7f5ec', fg: '#177245' },
  rejected: { bg: '#fdecea', fg: '#b3261e' },
}

type Tab = 'services' | 'requests' | 'new'

export function HostServices({
  initialServices,
  initialRequests,
}: {
  initialServices: Service[]
  initialRequests: ServiceRequest[]
}) {
  const t = useTranslations('hostServices')
  const locale = useLocale()
  const dateLocale = DATE_LOCALE[locale] ?? 'en-US'

  const [tab, setTab] = useState<Tab>('services')
  const [services, setServices] = useState<Service[]>(initialServices)
  const [requests, setRequests] = useState<ServiceRequest[]>(initialRequests)
  const [error, setError] = useState<string | null>(null)

  /** Re-read both lists after a mutation. Never on mount — see the file header. */
  const reload = useCallback(async () => {
    const [s, r] = await Promise.all([
      fetch('/api/local/host/services', { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .catch(() => null),
      fetch('/api/local/host/service-requests', { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .catch(() => null),
    ])
    // A failed re-read keeps the rows already on screen rather than blanking
    // them: the mutation itself succeeded, and emptying the list would read as
    // "your services are gone".
    if (Array.isArray(s)) setServices(s)
    if (Array.isArray(r)) setRequests(r)
    // Set unconditionally so a re-read that succeeds clears the banner a failed
    // one left behind. One message even when both calls failed: two identical
    // banners stacked is noise, and the recovery is the same either way.
    setError(s === null || r === null ? t('loadFailed') : null)
  }, [t])

  const pendingCount = useMemo(
    () => serviceRequestCounts(requests.map((r) => r.status)).pending,
    [requests],
  )

  return (
    <>
      <div
        role="tablist"
        aria-label={t('tabsLabel')}
        style={{
          display: 'inline-flex',
          background: C.tan,
          borderRadius: 999,
          padding: 4,
          gap: 4,
          marginBottom: 24,
          maxWidth: '100%',
          flexWrap: 'wrap',
        }}
      >
        <TabButton label={t('tabs.services')} active={tab === 'services'} onClick={() => setTab('services')} />
        <TabButton
          label={t('tabs.requests')}
          badge={pendingCount || undefined}
          active={tab === 'requests'}
          onClick={() => setTab('requests')}
        />
        <TabButton label={t('tabs.new')} active={tab === 'new'} onClick={() => setTab('new')} />
      </div>

      {error && <p style={{ margin: '0 0 16px', fontSize: 14, color: C.burgundy }}>{error}</p>}

      {tab === 'services' && (
        <ServicesList
          services={services}
          onChanged={reload}
          onAdd={() => setTab('new')}
          dateLocale={dateLocale}
        />
      )}
      {tab === 'requests' && (
        <RequestsInbox requests={requests} onChanged={reload} dateLocale={dateLocale} />
      )}
      {tab === 'new' && (
        <NewServiceForm
          onCreated={async () => {
            await reload()
            setTab('services')
          }}
        />
      )}
    </>
  )
}

function TabButton({
  label,
  active,
  badge,
  onClick,
}: {
  label: string
  active: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        border: 0,
        borderRadius: 999,
        padding: '9px 18px',
        fontSize: 14,
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: active ? C.burgundy : 'transparent',
        color: active ? '#fff' : C.ink,
      }}
    >
      {label}
      {badge !== undefined && (
        <span
          style={{
            background: active ? 'rgba(255,255,255,0.24)' : C.burgundy,
            color: '#fff',
            borderRadius: 999,
            minWidth: 20,
            padding: '1px 6px',
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

// ---- The host's own services -------------------------------------------------

function ServicesList({
  services,
  onChanged,
  onAdd,
  dateLocale,
}: {
  services: Service[]
  onChanged: () => Promise<void>
  onAdd: () => void
  dateLocale: string
}) {
  const t = useTranslations('hostServices')
  if (services.length === 0) {
    return (
      <Card style={{ padding: '48px 24px', textAlign: 'center', color: C.muted }}>
        <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: C.ink }}>
          {t('services.emptyTitle')}
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 15 }}>{t('services.emptyHint')}</p>
        <button type="button" onClick={onAdd} style={primaryButton}>
          {t('services.emptyCta')}
        </button>
      </Card>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {services.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          onChanged={onChanged}
          dateLocale={dateLocale}
        />
      ))}
    </div>
  )
}

function ServiceCard({
  service,
  onChanged,
  dateLocale,
}: {
  service: Service
  onChanged: () => Promise<void>
  dateLocale: string
}) {
  const t = useTranslations('hostServices')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const state = hostServiceState(service)
  const canToggle = canToggleService(service)
  const pending = service.pending_request_count ?? 0
  const dateFmt = new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })

  async function toggle() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/local/host/services/${service.id}/visibility`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !service.is_published }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || t('services.toggleFailed'))
      }
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('services.toggleFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {service.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={service.image_url}
            alt=""
            style={{
              width: 96,
              height: 96,
              objectFit: 'cover',
              borderRadius: 14,
              background: C.tan,
              flex: '0 0 auto',
            }}
          />
        )}
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 16.5, fontWeight: 700, color: C.ink }}>
              {service.title}
            </p>
            <StateChip state={state} />
          </div>

          {service.location && (
            <p style={{ margin: '3px 0 0', fontSize: 13.5, color: C.muted }}>{service.location}</p>
          )}
          {service.description && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 14,
                color: C.muted,
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {service.description}
            </p>
          )}

          {/* Both prices, labelled. The host projection's `price` is their raw
              amount and `guest_price` is the quote — showing only one of them is
              how a host ends up believing the platform takes a cut of theirs. */}
          <p style={{ margin: '10px 0 0', fontSize: 15, fontWeight: 700, color: C.burgundy }}>
            {formatPrice(service.price, service.currency)}
            <span style={{ fontWeight: 500, fontSize: 13, color: C.muted }}>
              {' '}
              {t('services.yourPrice')}
            </span>
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>
            {t('services.guestsPay', {
              price: formatPrice(guestFacingPrice(service), service.currency),
            })}
          </p>

          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted }}>
            {t('services.listedOn', { date: dateFmt.format(new Date(service.created_at)) })}
            {pending > 0 && ` · ${t('services.pendingRequests', { count: pending })}`}
          </p>

          {state === 'blocked' && (
            <p style={{ margin: '10px 0 0', fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
              {t('services.blockedBody')}
            </p>
          )}

          {error && (
            <p style={{ margin: '10px 0 0', fontSize: 13.5, color: C.burgundy }} role="alert">
              {error}
            </p>
          )}

          {canToggle && (
            <button
              type="button"
              onClick={toggle}
              disabled={busy}
              style={{
                ...secondaryButton,
                marginTop: 12,
                opacity: busy ? 0.6 : 1,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy
                ? t('services.saving')
                : service.is_published
                  ? // Named for what it costs, not for the verb: deactivating a
                    // service with people waiting declines those requests.
                    pending > 0
                    ? t('services.deactivateWithPending', { count: pending })
                    : t('services.deactivate')
                  : t('services.reactivate')}
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

function StateChip({ state }: { state: 'live' | 'deactivated' | 'blocked' }) {
  const t = useTranslations('hostServices')
  const look =
    state === 'live'
      ? { bg: '#e7f5ec', fg: '#177245' }
      : state === 'deactivated'
        ? { bg: '#f1efec', fg: C.muted }
        : { bg: '#fdecea', fg: '#b3261e' }
  return (
    <span
      style={{
        background: look.bg,
        color: look.fg,
        borderRadius: 999,
        padding: '3px 11px',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {t(`services.state.${state}`)}
    </span>
  )
}

// ---- The subscription-request inbox ------------------------------------------

function RequestsInbox({
  requests,
  onChanged,
  dateLocale,
}: {
  requests: ServiceRequest[]
  onChanged: () => Promise<void>
  dateLocale: string
}) {
  const t = useTranslations('hostServices')
  const [filter, setFilter] = useState<ServiceRequestBucket | 'all'>('all')

  const counts = serviceRequestCounts(requests.map((r) => r.status))
  const visible =
    filter === 'all' ? requests : requests.filter((r) => serviceRequestBucket(r.status) === filter)

  if (requests.length === 0) {
    return (
      <Card style={{ padding: '48px 24px', textAlign: 'center', color: C.muted }}>
        <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: C.ink }}>
          {t('requests.emptyTitle')}
        </p>
        <p style={{ margin: 0, fontSize: 15 }}>{t('requests.emptyHint')}</p>
      </Card>
    )
  }

  return (
    <>
      <div
        role="group"
        aria-label={t('requests.filterLabel')}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}
      >
        <FilterChip
          label={t('requests.filter.all')}
          count={requests.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {SERVICE_REQUEST_BUCKET_ORDER.map((bucket) => (
          <FilterChip
            key={bucket}
            label={t(`requests.filter.${bucket}`)}
            count={counts[bucket]}
            active={filter === bucket}
            onClick={() => setFilter(bucket)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <Card style={{ padding: '36px 24px', textAlign: 'center', color: C.muted }}>
          <p style={{ margin: '0 0 12px', fontSize: 15 }}>{t('requests.emptyFiltered')}</p>
          <button type="button" onClick={() => setFilter('all')} style={secondaryButton}>
            {t('requests.showAll')}
          </button>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visible.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onChanged={onChanged}
              dateLocale={dateLocale}
            />
          ))}
        </div>
      )}
    </>
  )
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        border: `1px solid ${active ? C.burgundy : 'rgba(42,34,32,0.14)'}`,
        background: active ? C.burgundy : '#fff',
        color: active ? '#fff' : C.ink,
        borderRadius: 999,
        padding: '7px 15px',
        fontSize: 13.5,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>{count}</span>
    </button>
  )
}

function RequestCard({
  request,
  onChanged,
  dateLocale,
}: {
  request: ServiceRequest
  onChanged: () => Promise<void>
  dateLocale: string
}) {
  const t = useTranslations('hostServices')
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bucket = serviceRequestBucket(request.status)
  const chip = BUCKET_CHIP[bucket]
  const dateFmt = new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })

  async function act(action: 'confirm' | 'reject') {
    if (busy) return
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/local/service-requests/${request.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || t('requests.actionFailed'))
      }
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requests.actionFailed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card padding="16px 18px">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: C.ink }}>
            {request.service_title}
          </p>
          <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>
            {request.requester_name || t('requests.deletedGuest')}
            {request.requester_email && ` · ${request.requester_email}`}
          </p>
          {request.preferred_date && (
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: C.muted }}>
              {t('requests.preferred', {
                date: dateFmt.format(new Date(request.preferred_date)),
              })}
            </p>
          )}
          {request.note && (
            <p style={{ margin: '8px 0 0', fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
              “{request.note}”
            </p>
          )}
          {request.request_code && (
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted }}>
              {t('requests.code', { code: request.request_code })}
            </p>
          )}
        </div>

        <div style={{ textAlign: 'end', flex: '0 0 auto' }}>
          <p style={{ margin: '0 0 6px', fontSize: 15.5, fontWeight: 800, color: C.burgundy }}>
            {formatPrice(request.service_price, request.service_currency)}
          </p>
          <span
            style={{
              display: 'inline-block',
              background: chip.bg,
              color: chip.fg,
              borderRadius: 999,
              padding: '3px 11px',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {t(`requests.status.${bucket}`)}
          </span>
        </div>
      </div>

      {error && (
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: C.burgundy }} role="alert">
          {error}
        </p>
      )}

      {isActionableRequest(request.status) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => act('confirm')}
            disabled={busy !== null}
            style={{ ...primaryButton, opacity: busy ? 0.6 : 1 }}
          >
            {busy === 'confirm' ? t('requests.confirming') : t('requests.confirm')}
          </button>
          <button
            type="button"
            onClick={() => act('reject')}
            disabled={busy !== null}
            style={{ ...secondaryButton, opacity: busy ? 0.6 : 1 }}
          >
            {busy === 'reject' ? t('requests.rejecting') : t('requests.reject')}
          </button>
        </div>
      )}
    </Card>
  )
}

// ---- Post a service ----------------------------------------------------------

function NewServiceForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const t = useTranslations('hostServices')
  const [draft, setDraft] = useState({
    title: '',
    price: '',
    description: '',
    category: '',
    location: '',
    image_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problem = serviceDraftProblem(draft)
  const set = (key: keyof typeof draft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }))

  async function submit() {
    if (problem || saving) return
    setSaving(true)
    setError(null)
    try {
      const image = draft.image_url.trim()
      const res = await fetch('/api/local/services', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...serviceBody(draft),
          // Kept out of serviceBody: the URL is the one field with no rule
          // worth testing, and threading it through the shared shape would put
          // an untested field in a module whose whole point is the tested ones.
          image_url: image.length > 0 ? image : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || t('new.failed'))
      }
      await onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('new.failed'))
      setSaving(false)
    }
  }

  return (
    <Card>
      <Field label={t('new.titleLabel')} required>
        <input
          value={draft.title}
          onChange={(e) => set('title')(e.target.value)}
          disabled={saving}
          placeholder={t('new.titlePlaceholder')}
          style={inputStyle}
        />
      </Field>

      <Field label={t('new.priceLabel')} required hint={t('new.priceHint')}>
        <input
          value={draft.price}
          onChange={(e) => set('price')(e.target.value)}
          disabled={saving}
          inputMode="decimal"
          placeholder="0"
          style={inputStyle}
        />
      </Field>

      <Field label={t('new.categoryLabel')}>
        <input
          value={draft.category}
          onChange={(e) => set('category')(e.target.value)}
          disabled={saving}
          placeholder={t('new.categoryPlaceholder')}
          style={inputStyle}
        />
      </Field>

      <Field label={t('new.locationLabel')}>
        <input
          value={draft.location}
          onChange={(e) => set('location')(e.target.value)}
          disabled={saving}
          placeholder={t('new.locationPlaceholder')}
          style={inputStyle}
        />
      </Field>

      <Field label={t('new.imageLabel')} hint={t('new.imageHint')}>
        <input
          value={draft.image_url}
          onChange={(e) => set('image_url')(e.target.value)}
          disabled={saving}
          inputMode="url"
          placeholder="https://…"
          style={inputStyle}
        />
      </Field>

      <Field label={t('new.descriptionLabel')}>
        <textarea
          value={draft.description}
          onChange={(e) => set('description')(e.target.value)}
          disabled={saving}
          rows={4}
          placeholder={t('new.descriptionPlaceholder')}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      {/* The rule the button is enforcing, named — a disabled button with no
          explanation is the thing people file bugs about. */}
      {problem && draft.title.length + draft.price.length > 0 && (
        <p style={{ margin: '0 0 12px', fontSize: 13.5, color: C.muted }}>
          {t(`new.problem.${problem}`)}
        </p>
      )}
      {error && (
        <p style={{ margin: '0 0 12px', fontSize: 13.5, color: C.burgundy }} role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={Boolean(problem) || saving}
        style={{
          ...primaryButton,
          background: problem || saving ? 'rgba(91,15,22,0.35)' : C.burgundy,
          cursor: problem || saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? t('new.posting') : t('new.post')}
      </button>
    </Card>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 5 }}>
        {label}
        {required && <span style={{ color: C.burgundy }}> *</span>}
      </span>
      {children}
      {hint && (
        <span style={{ display: 'block', fontSize: 12.5, color: C.muted, marginTop: 5 }}>
          {hint}
        </span>
      )}
    </label>
  )
}

// ---- Shared bits -------------------------------------------------------------

function Card({
  children,
  padding = '20px 22px',
  style,
}: {
  children: React.ReactNode
  padding?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        border: '1px solid rgba(42,34,32,0.06)',
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 12,
  border: '1px solid rgba(42,34,32,0.14)',
  padding: '10px 12px',
  fontSize: 14.5,
  fontFamily: 'inherit',
  color: C.ink,
  background: '#fff',
}

const primaryButton: React.CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: '10px 22px',
  fontSize: 14.5,
  fontWeight: 700,
  fontFamily: 'inherit',
  color: '#fff',
  background: C.burgundy,
  cursor: 'pointer',
}

const secondaryButton: React.CSSProperties = {
  border: `1px solid ${C.burgundy}`,
  borderRadius: 999,
  padding: '9px 20px',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'inherit',
  color: C.burgundy,
  background: 'transparent',
  cursor: 'pointer',
}
