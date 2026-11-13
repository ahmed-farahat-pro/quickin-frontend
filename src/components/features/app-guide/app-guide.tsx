'use client'

// App guide — the onboarding walkthrough overlay (spec:
// quickin-mono/mobile/APP-GUIDE-SPEC.md; step logic: src/lib/app-guide-core.ts).
//
// Mounted by each page a tour can run on (/explore, /account). It:
//   - auto-starts the main tour on Explore for a first-time visitor
//     (localStorage `qk_guide_main_v1_seen`), never on top of an open sheet;
//   - resumes a tour in progress from sessionStorage, so a step that lives on
//     another page can navigate there and carry on;
//   - opens the "App guide" chooser when an entry dispatches GUIDE_EVENT
//     (see app-guide-button.tsx).
//
// No tour library: one fixed "cutout" box whose huge box-shadow dims the rest of
// the screen, a transparent click-catcher over everything, and the card.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { stripLocaleFromPath } from '@/lib/i18n/pathname'
import {
  GUIDE_ACTIVE_KEY,
  GUIDE_EVENT,
  GUIDE_SEEN_KEY,
  HOST_REQUIREMENTS,
  anchorMatches,
  cardSide,
  finalActions,
  parseGuideState,
  placeStep,
  serializeGuideState,
  shouldAutoStart,
  steps as tourSteps,
  type GuideAction,
  type GuideTour,
  type GuideViewer,
  type Rect,
} from '@/lib/app-guide-core'

const BURGUNDY = '#5B0F16'
const INK = '#2A2220'
const MUTED = '#6B6055'
const PAD = 8
const RADIUS = 12
const CARD_W = 360
const GUTTER = 16
const Z = 2147483000

export type GuideEventDetail = { open: 'chooser' } | { start: GuideTour }

// --- storage, all of it best-effort: private windows and blocked storage throw ---

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_SEEN_KEY) === 'true'
  } catch {
    return false
  }
}

function writeSeen() {
  try {
    window.localStorage.setItem(GUIDE_SEEN_KEY, 'true')
  } catch {
    /* the tour just shows again next visit */
  }
}

function readActive() {
  try {
    return parseGuideState(window.sessionStorage.getItem(GUIDE_ACTIVE_KEY), Date.now())
  } catch {
    return null
  }
}

function writeActive(tour: GuideTour, index: number) {
  try {
    window.sessionStorage.setItem(GUIDE_ACTIVE_KEY, serializeGuideState(tour, index, Date.now()))
  } catch {
    /* no cross-page resume */
  }
}

function clearActive() {
  try {
    window.sessionStorage.removeItem(GUIDE_ACTIVE_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** Something modal the tour must not stack on: a Radix sheet/dialog/menu. */
function blockingUIShown(): boolean {
  return Boolean(
    document.querySelector(
      '[role="dialog"]:not([data-app-guide]), [role="alertdialog"], [role="menu"][data-state="open"]',
    ),
  )
}

/** The first VISIBLE element whose data-guide names this anchor (the desktop nav
 *  and the mobile header both carry anchors; only one is displayed). */
function findAnchor(anchor: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>('[data-guide]')
  for (const el of nodes) {
    if (!anchorMatches(el.getAttribute('data-guide'), anchor)) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Keep Tab inside `root`. */
function trapTab(e: React.KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== 'Tab' || !root) return
  const items = Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'),
  )
  if (items.length === 0) {
    e.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

interface Props extends GuideViewer {
  /** Explore only: start the main tour by itself for a first-time visitor. */
  autoStart?: boolean
}

export function AppGuide({ signedIn, isHost, hostPending, autoStart = false }: Props) {
  const t = useTranslations('appGuide')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const path = stripLocaleFromPath(pathname || '/').pathname
  const reducedMotion = usePrefersReducedMotion()

  const viewer = useMemo<GuideViewer>(() => ({ signedIn, isHost, hostPending }), [signedIn, isHost, hostPending])
  const [tour, setTour] = useState<{ tour: GuideTour; index: number } | null>(null)
  const [chooserOpen, setChooserOpen] = useState(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  // The step we already navigated away for — see the effect below.
  const [navigatedFor, setNavigatedFor] = useState<string | null>(null)

  const go = useCallback(
    (href: string) => router.push(`/${locale}${href}`),
    [router, locale],
  )

  const begin = useCallback((next: GuideTour, index = 0) => {
    if (!returnFocusRef.current && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement
    }
    writeActive(next, index)
    setTour({ tour: next, index })
  }, [])

  const end = useCallback(
    (then?: GuideAction) => {
      if (tour?.tour === 'main') writeSeen()
      clearActive()
      setTour(null)
      setNavigatedFor(null)
      const back = returnFocusRef.current
      returnFocusRef.current = null
      if (then === 'showHostTour') {
        begin('host')
        return
      }
      if (then === 'applyNow') go('/host/apply')
      else if (then === 'signIn') go('/login')
      else back?.focus?.()
    },
    [tour, begin, go],
  )

  // Resume a tour in progress; otherwise maybe auto-start. Retries a few times
  // while a sheet is open rather than stacking on top of it.
  useEffect(() => {
    const active = readActive()
    if (active) {
      setTour({ tour: active.tour, index: active.index })
      return
    }
    if (!autoStart) return
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const attempt = () => {
      const seen = readSeen()
      if (seen) return
      if (shouldAutoStart(seen, blockingUIShown())) begin('main')
      else if (++tries < 20) timer = setTimeout(attempt, 1500)
    }
    timer = setTimeout(attempt, 600)
    return () => clearTimeout(timer)
    // Mount only: a later page in the same tour is a new mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "App guide" entries (header, mobile menu, /account).
  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<GuideEventDetail>).detail
      if (!detail) return
      if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement
      if ('open' in detail) setChooserOpen(true)
      else begin(detail.start)
    }
    window.addEventListener(GUIDE_EVENT, onEvent)
    return () => window.removeEventListener(GUIDE_EVENT, onEvent)
  }, [begin])

  const list = tour ? tourSteps(tour.tour, viewer) : []
  const step = tour ? list[tour.index] : null

  // A step that lives on another page: navigate there once and let that page's
  // AppGuide resume. If we somehow land back here, render it centred instead of
  // bouncing forever.
  const placement = step ? placeStep(step, path) : null
  const stepKey = tour ? `${tour.tour}:${tour.index}` : null
  const navTo = placement?.kind === 'navigate' ? placement.to : null
  const mustNavigate = navTo !== null && navigatedFor !== stepKey
  useEffect(() => {
    if (!tour || !stepKey || !navTo || navigatedFor === stepKey) return
    writeActive(tour.tour, tour.index)
    go(navTo)
    // If the push never leaves this page, the next render shows the step centred.
    const timer = setTimeout(() => setNavigatedFor(stepKey), 2500)
    return () => clearTimeout(timer)
  }, [tour, stepKey, navTo, navigatedFor, go])

  const move = useCallback(
    (delta: number) => {
      if (!tour) return
      const index = tour.index + delta
      if (index < 0) return
      if (index >= list.length) {
        end('done')
        return
      }
      writeActive(tour.tour, index)
      setTour({ tour: tour.tour, index })
    },
    [tour, list.length, end],
  )

  if (chooserOpen) {
    return (
      <Chooser
        t={t}
        onClose={() => {
          setChooserOpen(false)
          returnFocusRef.current?.focus?.()
          returnFocusRef.current = null
        }}
        onPick={(picked) => {
          setChooserOpen(false)
          begin(picked)
        }}
      />
    )
  }

  if (!tour || !step || mustNavigate) return null

  return (
    <TourOverlay
      key={tour.tour}
      t={t}
      index={tour.index}
      total={list.length}
      anchor={step.anchor}
      copy={step.copy}
      checklist={Boolean(step.checklist)}
      actions={tour.index === list.length - 1 ? finalActions(tour.tour, viewer) : null}
      reducedMotion={reducedMotion}
      onBack={() => move(-1)}
      onNext={() => move(1)}
      onEnd={end}
    />
  )
}

type T = ReturnType<typeof useTranslations>

function TourOverlay({
  t,
  index,
  total,
  anchor,
  copy,
  checklist,
  actions,
  reducedMotion,
  onBack,
  onNext,
  onEnd,
}: {
  t: T
  index: number
  total: number
  anchor: string | null
  copy: string
  checklist: boolean
  actions: GuideAction[] | null
  reducedMotion: boolean
  onBack: () => void
  onNext: () => void
  onEnd: (then?: GuideAction) => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [cut, setCut] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  // Track the anchor every frame: the page scrolls, fonts load, the region rail
  // arrives late. Only re-render when something actually moved.
  useLayoutEffect(() => {
    let raf = 0
    let last = ''
    let scrolled = false
    const tick = () => {
      const el = anchor ? findAnchor(anchor) : null
      if (el && !scrolled) {
        scrolled = true
        const r = el.getBoundingClientRect()
        if (r.top < 72 || r.bottom > window.innerHeight - 72) {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
        }
      }
      let next: Rect | null = null
      if (el) {
        const r = el.getBoundingClientRect()
        next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
      }
      const vw = window.innerWidth
      const vh = window.innerHeight
      const sig = next
        ? `${Math.round(next.top)},${Math.round(next.left)},${Math.round(next.width)},${Math.round(next.height)},${vw},${vh}`
        : `none,${vw},${vh}`
      if (sig !== last) {
        last = sig
        setCut(next)
        setViewport({ w: vw, h: vh })
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [anchor, reducedMotion])

  // The card is the focus target on every step.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true })
  }, [index])

  // Escape closes (counts as X).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onEnd()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onEnd])

  const side = cardSide(cut, viewport.h)
  const cardWidth = Math.min(CARD_W, Math.max(0, viewport.w - GUTTER * 2))
  const cardStyle: React.CSSProperties = { width: cardWidth || CARD_W }
  if (side === 'center' || !cut) {
    Object.assign(cardStyle, { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxHeight: viewport.h - GUTTER * 2 })
  } else {
    const centreX = cut.left + cut.width / 2
    const left = Math.min(Math.max(centreX - cardWidth / 2, GUTTER), Math.max(GUTTER, viewport.w - cardWidth - GUTTER))
    cardStyle.left = left
    if (side === 'below') {
      const top = cut.top + cut.height + 12
      Object.assign(cardStyle, { top, maxHeight: viewport.h - top - GUTTER })
    } else {
      Object.assign(cardStyle, { bottom: viewport.h - cut.top + 12, maxHeight: cut.top - 12 - GUTTER })
    }
  }

  // With no anchor the cutout collapses to a point in the middle, so the move
  // between steps animates from/to it.
  const hole: Rect = cut ?? { top: viewport.h / 2, left: viewport.w / 2, width: 0, height: 0 }
  const transition = reducedMotion ? 'none' : 'top .25s ease, left .25s ease, width .25s ease, height .25s ease'

  const onCatcherClick = (e: React.MouseEvent) => {
    if (!cut) return
    const inside =
      e.clientX >= cut.left && e.clientX <= cut.left + cut.width && e.clientY >= cut.top && e.clientY <= cut.top + cut.height
    // A nav link or any other target: clicking it = Next. Navigating away (or
    // opening the search popover) under the tour is exactly what it must not do.
    if (inside) onNext()
  }

  const isLast = actions !== null
  const titleId = 'qk-guide-title'
  const bodyId = 'qk-guide-body'
  const stepId = 'qk-guide-step'

  return (
    <div data-app-guide style={{ position: 'fixed', inset: 0, zIndex: Z }}>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          borderRadius: RADIUS,
          boxShadow: cut
            ? `0 0 0 2px ${BURGUNDY}, 0 0 0 4px rgba(255,255,255,0.85), 0 0 0 200vmax rgba(0,0,0,0.55)`
            : 'none',
          transition,
          pointerEvents: 'none',
        }}
      />
      {/* A zero-size box paints no shadow, so a centred step dims with a plain backdrop. */}
      {!cut && <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />}
      {/* Swallows every click outside the card; a click inside the cutout = Next. */}
      <div
        aria-hidden
        onClick={onCatcherClick}
        style={{ position: 'fixed', inset: 0, cursor: 'default' }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${stepId} ${titleId}`}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={(e) => trapTab(e, cardRef.current)}
        style={{
          position: 'fixed',
          ...cardStyle,
          overflowY: 'auto',
          background: '#fff',
          color: INK,
          borderRadius: 18,
          boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
          padding: '18px 18px 16px',
          fontFamily: '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
          outline: 'none',
          transition: reducedMotion ? 'none' : 'top .25s ease, left .25s ease, bottom .25s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span id={stepId} style={{ fontSize: 12.5, fontWeight: 700, color: MUTED }}>
              <span aria-hidden>{t('stepOf', { current: index + 1, total })}</span>
              <span className="sr-only">{t('stepLabel', { current: index + 1, total })}.</span>
            </span>
            <span aria-hidden style={{ display: 'inline-flex', gap: 4 }}>
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === index ? 16 : 6,
                    height: 6,
                    borderRadius: 999,
                    background: i === index ? BURGUNDY : 'rgba(91,15,22,0.18)',
                    transition: reducedMotion ? 'none' : 'width .25s ease',
                  }}
                />
              ))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onEnd()}
            aria-label={t('buttons.close')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#6B6055] transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B0F16]/40"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <h2 id={titleId} style={{ margin: '10px 0 6px', fontSize: 18, fontWeight: 700, color: INK, lineHeight: 1.3 }}>
          {t(`steps.${copy}.title`)}
        </h2>
        {checklist ? (
          <ul id={bodyId} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {HOST_REQUIREMENTS.map((key) => (
              <li key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.45, color: MUTED }}>
                <Check aria-hidden className="mt-[2px] h-4 w-4 shrink-0 text-[#177245]" />
                <span>{t(`requirements.${key}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p id={bodyId} style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: MUTED }}>
            {t(`steps.${copy}.body`)}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {!isLast && (
            <button type="button" onClick={() => onEnd()} className={TEXT_BTN}>
              {t('buttons.skip')}
            </button>
          )}
          <span style={{ flex: 1 }} />
          {index > 0 && (
            <button type="button" onClick={onBack} className={GHOST_BTN}>
              {t('buttons.back')}
            </button>
          )}
          {isLast ? (
            actions!.map((a) =>
              a === 'done' ? (
                <button key={a} type="button" onClick={() => onEnd('done')} className={PRIMARY_BTN}>
                  {t('buttons.done')}
                </button>
              ) : (
                <button key={a} type="button" onClick={() => onEnd(a)} className={GHOST_BTN}>
                  {a === 'showHostTour' ? t('buttons.showMeHow') : a === 'applyNow' ? t('buttons.applyNow') : t('buttons.signIn')}
                </button>
              ),
            )
          ) : (
            <button type="button" onClick={onNext} className={PRIMARY_BTN}>
              {t('buttons.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B0F16]/40'
const PRIMARY_BTN = `rounded-full bg-[#5B0F16] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 ${FOCUS}`
const GHOST_BTN = `rounded-full border border-[#5B0F16]/25 px-4 py-2.5 text-sm font-bold text-[#5B0F16] transition-colors hover:bg-[#5B0F16]/5 ${FOCUS}`
const TEXT_BTN = `rounded-full px-2 py-2.5 text-sm font-semibold text-[#6B6055] transition-colors hover:text-[#2A2220] ${FOCUS}`

/** The "App guide" chooser: replay the main tour, or learn how to host. */
function Chooser({ t, onClose, onPick }: { t: T; onClose: () => void; onPick: (tour: GuideTour) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div data-app-guide style={{ position: 'fixed', inset: 0, zIndex: Z, background: 'rgba(0,0,0,0.55)' }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qk-guide-chooser-title"
        aria-describedby="qk-guide-chooser-sub"
        tabIndex={-1}
        onKeyDown={(e) => trapTab(e, ref.current)}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: `min(${CARD_W}px, calc(100vw - ${GUTTER * 2}px))`,
          background: '#fff',
          color: INK,
          borderRadius: 18,
          boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
          padding: 20,
          fontFamily: '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 id="qk-guide-chooser-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {t('entry.title')}
            </h2>
            <p id="qk-guide-chooser-sub" style={{ margin: '4px 0 0', fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
              {t('entry.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('buttons.close')}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#6B6055] transition-colors hover:bg-black/5 ${FOCUS}`}
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={() => onPick('main')} className={`${PRIMARY_BTN} w-full py-3`}>
            {t('entry.takeTour')}
          </button>
          <button type="button" onClick={() => onPick('host')} className={`${GHOST_BTN} w-full py-3`}>
            {t('entry.howToHost')}
          </button>
          <button type="button" onClick={onClose} className={`${TEXT_BTN} w-full`}>
            {t('entry.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
