// App guide (onboarding walkthrough) — the pure step logic behind
// src/components/features/app-guide/app-guide.tsx.
//
// One spec for iOS, Android and web: quickin-mono/mobile/APP-GUIDE-SPEC.md. The
// copy and step order are shared; only the anchors are web-specific here:
//   - an anchor is matched against `data-guide` attributes (a space-separated
//     list, so the mobile menu button can stand in for Saved/Reservations/account
//     on narrow screens, where those links collapse into it);
//   - `pages` says which pages a step may render on. The web has no tabs, so a
//     step that needs another page navigates there and resumes from the state in
//     sessionStorage (see `parseGuideState`).
//
// No runtime imports, so `node --test` can import this file directly — see
// README → Testing.

export type GuideTour = 'main' | 'host'

/** What the guide knows about the visitor. `hostPending` is only known on
 *  /account; elsewhere it is false, which only changes the copy of host step 3 —
 *  and for a signed-in visitor that step always runs on /account. */
export interface GuideViewer {
  signedIn: boolean
  isHost: boolean
  hostPending: boolean
}

export interface GuideStep {
  /** The spec's step id ('search', 'host.becomeHost', …). */
  id: string
  /** Key under `appGuide.steps` in src/messages/*.json (the variant's copy). */
  copy: string
  /** `data-guide` token to highlight, or null for a centred card. */
  anchor: string | null
  /** Unlocalised paths this step may render on; null = wherever the tour is. */
  pages: string[] | null
  /** The anchor is a header nav link: clicking it is the same as Next. */
  nav?: boolean
  /** Host step 4 renders the requirements checklist under its title. */
  checklist?: boolean
}

/** localStorage: set once the main tour has ended in any way. */
export const GUIDE_SEEN_KEY = 'qk_guide_main_v1_seen'
/** sessionStorage: the tour in progress, so it survives a page change. */
export const GUIDE_ACTIVE_KEY = 'qk_guide_active_v1'
/** A tour left mid-way longer ago than this is not resumed. */
export const GUIDE_ACTIVE_TTL_MS = 10 * 60 * 1000

/** The DOM event the "App guide" entries dispatch and the overlay listens to. */
export const GUIDE_EVENT = 'qk:app-guide'

export const HOST_REQUIREMENTS = ['hostType', 'nameAndId', 'phone', 'address', 'idPhotos'] as const

const EXPLORE = ['/explore']

export function steps(tour: GuideTour, viewer: GuideViewer): GuideStep[] {
  if (tour === 'main') {
    return [
      { id: 'welcome', copy: 'welcome', anchor: null, pages: EXPLORE },
      { id: 'search', copy: 'search', anchor: 'search', pages: EXPLORE },
      { id: 'regions', copy: 'regions', anchor: 'regions', pages: EXPLORE },
      { id: 'filters', copy: 'filters', anchor: 'filters', pages: EXPLORE },
      { id: 'wishlist', copy: 'wishlist', anchor: 'saved', pages: EXPLORE, nav: true },
      { id: 'trips', copy: 'trips', anchor: 'trips', pages: EXPLORE, nav: true },
      {
        id: 'profile',
        copy: viewer.signedIn ? 'profile' : 'profileSignedOut',
        anchor: 'account',
        pages: EXPLORE,
        nav: true,
      },
      { id: 'finish', copy: viewer.isHost ? 'finishHost' : 'finish', anchor: null, pages: EXPLORE },
    ]
  }

  // Host step 3 has four faces. Signed in, it highlights whichever host card
  // /account renders (apply / pending / hosting); signed out there is no
  // /account to go to, so it points at the sign-in entry on Explore.
  let step3: GuideStep
  if (!viewer.signedIn) {
    step3 = { id: 'host.becomeHost', copy: 'hostSignInFirst', anchor: 'signIn', pages: EXPLORE, nav: true }
  } else {
    const copy = viewer.isHost ? 'hostAlreadyHost' : viewer.hostPending ? 'hostPending' : 'hostBecomeHost'
    step3 = { id: 'host.becomeHost', copy, anchor: 'host.becomeHost', pages: ['/account'] }
  }

  return [
    { id: 'host.intro', copy: 'hostIntro', anchor: null, pages: null },
    // On /account the visitor is already on their profile: no anchor there, so
    // the card centres instead of bouncing them back to Explore.
    { id: 'host.profileTab', copy: 'hostProfileTab', anchor: 'account', pages: ['/explore', '/account'], nav: true },
    step3,
    { id: 'host.requirements', copy: 'hostRequirements', anchor: null, pages: null, checklist: true },
    { id: 'host.review', copy: 'hostReview', anchor: null, pages: null },
    { id: 'host.afterApproval', copy: 'hostAfterApproval', anchor: null, pages: null },
  ]
}

/** The main tour starts by itself only on a first visit, and never on top of
 *  something else (an open sheet, menu or dialog) — the caller retries later. */
export function shouldAutoStart(seen: boolean, blockingUIShown: boolean): boolean {
  return !seen && !blockingUIShown
}

export type GuideAction = 'showHostTour' | 'applyNow' | 'signIn' | 'done'

/** Buttons on a tour's last step, primary last. */
export function finalActions(tour: GuideTour, viewer: GuideViewer): GuideAction[] {
  if (tour === 'main') return viewer.isHost ? ['done'] : ['showHostTour', 'done']
  if (!viewer.signedIn) return ['signIn', 'done']
  if (viewer.isHost || viewer.hostPending) return ['done']
  return ['applyNow', 'done']
}

/** What the overlay should do with a step on the current page. */
export type StepPlacement = { kind: 'here' } | { kind: 'navigate'; to: string }

/** `path` is unlocalised ('/explore', not '/ar/explore'). */
export function placeStep(step: GuideStep, path: string): StepPlacement {
  if (!step.pages) return { kind: 'here' }
  const here = normalisePath(path)
  if (step.pages.some((p) => normalisePath(p) === here)) return { kind: 'here' }
  return { kind: 'navigate', to: step.pages[0] }
}

function normalisePath(path: string): string {
  const bare = path.split(/[?#]/)[0] || '/'
  return bare.length > 1 ? bare.replace(/\/+$/, '') : bare
}

export interface GuideState {
  tour: GuideTour
  index: number
  /** Epoch ms of the last write. */
  at: number
}

export function serializeGuideState(tour: GuideTour, index: number, now: number): string {
  return JSON.stringify({ tour, index, at: now })
}

/** The tour in progress, or null when there is none, it is malformed, or it was
 *  left more than GUIDE_ACTIVE_TTL_MS ago. */
export function parseGuideState(raw: string | null, now: number): GuideState | null {
  if (!raw) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!v || typeof v !== 'object') return null
  const { tour, index, at } = v as Record<string, unknown>
  if (tour !== 'main' && tour !== 'host') return null
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  if (now - at > GUIDE_ACTIVE_TTL_MS || at - now > 60_000) return null
  // Both tours keep a fixed length across variants, so an index from another
  // page's viewer still lands on the same step.
  const total = steps(tour, { signedIn: false, isHost: false, hostPending: false }).length
  if (index >= total) return null
  return { tour, index, at }
}

/** Does a `data-guide` value (space-separated tokens) name this anchor? */
export function anchorMatches(attr: string | null | undefined, anchor: string): boolean {
  if (!attr) return false
  return attr.split(/\s+/).includes(anchor)
}

export interface Rect { top: number; left: number; width: number; height: number }

/** Where the tooltip card goes for a cutout in a viewport: below or above,
 *  whichever has more room; centred when neither side has `minRoom`. */
export function cardSide(
  cut: Rect | null,
  viewportHeight: number,
  minRoom = 160,
): 'below' | 'above' | 'center' {
  if (!cut) return 'center'
  const above = cut.top
  const below = viewportHeight - (cut.top + cut.height)
  if (Math.max(above, below) < minRoom) return 'center'
  return below >= above ? 'below' : 'above'
}
