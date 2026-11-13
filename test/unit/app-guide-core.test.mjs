// Unit tests for src/lib/app-guide-core.ts — the App guide's step logic.
//
// Offline: no database, no network, no browser. Run with `npm test`.
// The spec these pin down is quickin-mono/mobile/APP-GUIDE-SPEC.md.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  steps,
  shouldAutoStart,
  finalActions,
  placeStep,
  serializeGuideState,
  parseGuideState,
  anchorMatches,
  cardSide,
  GUIDE_SEEN_KEY,
  GUIDE_ACTIVE_TTL_MS,
  HOST_REQUIREMENTS,
} from '../../src/lib/app-guide-core.ts'

const GUEST = { signedIn: true, isHost: false, hostPending: false }
const PENDING = { signedIn: true, isHost: false, hostPending: true }
const HOST = { signedIn: true, isHost: true, hostPending: false }
const OUT = { signedIn: false, isHost: false, hostPending: false }

describe('persistence key', () => {
  test('is the one the spec names for the web', () => {
    assert.equal(GUIDE_SEEN_KEY, 'qk_guide_main_v1_seen')
  })
})

describe('main tour', () => {
  test('has the spec order: 8 steps, welcome → finish', () => {
    assert.deepEqual(steps('main', GUEST).map((s) => s.id), [
      'welcome', 'search', 'regions', 'filters', 'wishlist', 'trips', 'profile', 'finish',
    ])
  })

  test('runs entirely on Explore', () => {
    for (const s of steps('main', GUEST)) assert.deepEqual(s.pages, ['/explore'], s.id)
  })

  test('welcome and finish are centred; the rest have anchors', () => {
    const anchors = Object.fromEntries(steps('main', GUEST).map((s) => [s.id, s.anchor]))
    assert.equal(anchors.welcome, null)
    assert.equal(anchors.finish, null)
    assert.equal(anchors.search, 'search')
    assert.equal(anchors.wishlist, 'saved')
    assert.equal(anchors.trips, 'trips')
    assert.equal(anchors.profile, 'account')
  })

  test('only the header nav steps advance on a click of their target', () => {
    const nav = steps('main', GUEST).filter((s) => s.nav).map((s) => s.id)
    assert.deepEqual(nav, ['wishlist', 'trips', 'profile'])
  })

  test('step 7 swaps to the sign-in copy when signed out', () => {
    assert.equal(steps('main', GUEST)[6].copy, 'profile')
    assert.equal(steps('main', OUT)[6].copy, 'profileSignedOut')
  })

  test('step 8 tells a host to manage listings instead of pitching hosting', () => {
    assert.equal(steps('main', GUEST)[7].copy, 'finish')
    assert.equal(steps('main', HOST)[7].copy, 'finishHost')
  })

  test('final buttons: Show me how + Done, or only Done for a host', () => {
    assert.deepEqual(finalActions('main', GUEST), ['showHostTour', 'done'])
    assert.deepEqual(finalActions('main', OUT), ['showHostTour', 'done'])
    assert.deepEqual(finalActions('main', HOST), ['done'])
  })
})

describe('host tour', () => {
  test('has 6 steps in the spec order', () => {
    assert.deepEqual(steps('host', GUEST).map((s) => s.id), [
      'host.intro', 'host.profileTab', 'host.becomeHost', 'host.requirements', 'host.review', 'host.afterApproval',
    ])
  })

  test('step 3 has four faces', () => {
    assert.equal(steps('host', GUEST)[2].copy, 'hostBecomeHost')
    assert.equal(steps('host', PENDING)[2].copy, 'hostPending')
    assert.equal(steps('host', HOST)[2].copy, 'hostAlreadyHost')
    assert.equal(steps('host', OUT)[2].copy, 'hostSignInFirst')
  })

  test('step 3 runs on /account when signed in, on Explore when signed out', () => {
    // /account redirects a signed-out visitor to /login, so the tour must not go there.
    assert.deepEqual(steps('host', GUEST)[2].pages, ['/account'])
    assert.equal(steps('host', GUEST)[2].anchor, 'host.becomeHost')
    assert.deepEqual(steps('host', OUT)[2].pages, ['/explore'])
    assert.equal(steps('host', OUT)[2].anchor, 'signIn')
  })

  test('a guest\'s "Become a host" card is NOT a nav target (clicking it is Next, not the form)', () => {
    assert.ok(!steps('host', GUEST)[2].nav)
  })

  test('step 2 may render on Explore or on /account', () => {
    assert.deepEqual(steps('host', GUEST)[1].pages, ['/explore', '/account'])
  })

  test('only step 4 carries the five-item checklist', () => {
    assert.deepEqual(steps('host', GUEST).filter((s) => s.checklist).map((s) => s.id), ['host.requirements'])
    assert.equal(HOST_REQUIREMENTS.length, 5)
  })

  test('final buttons: Apply now for a guest, Sign in signed out, only Done otherwise', () => {
    assert.deepEqual(finalActions('host', GUEST), ['applyNow', 'done'])
    assert.deepEqual(finalActions('host', OUT), ['signIn', 'done'])
    assert.deepEqual(finalActions('host', PENDING), ['done'])
    assert.deepEqual(finalActions('host', HOST), ['done'])
  })

  test('every variant keeps the same length, so a resumed index lands on the same step', () => {
    for (const tour of ['main', 'host']) {
      const lengths = [GUEST, PENDING, HOST, OUT].map((v) => steps(tour, v).length)
      assert.equal(new Set(lengths).size, 1, tour)
    }
  })
})

describe('shouldAutoStart', () => {
  test('starts on a first visit with nothing else on screen', () => {
    assert.equal(shouldAutoStart(false, false), true)
  })
  test('never once seen', () => {
    assert.equal(shouldAutoStart(true, false), false)
    assert.equal(shouldAutoStart(true, true), false)
  })
  test('never stacks on top of a sheet or dialog', () => {
    assert.equal(shouldAutoStart(false, true), false)
  })
})

describe('placeStep', () => {
  const [welcome] = steps('main', GUEST)
  test('renders here when the page matches (trailing slash and query ignored)', () => {
    assert.deepEqual(placeStep(welcome, '/explore'), { kind: 'here' })
    assert.deepEqual(placeStep(welcome, '/explore/'), { kind: 'here' })
    assert.deepEqual(placeStep(welcome, '/explore?region=North%20Coast'), { kind: 'here' })
  })
  test('navigates to the first allowed page otherwise', () => {
    assert.deepEqual(placeStep(welcome, '/account'), { kind: 'navigate', to: '/explore' })
    assert.deepEqual(placeStep(steps('host', GUEST)[2], '/explore'), { kind: 'navigate', to: '/account' })
  })
  test('a listing page is not Explore', () => {
    assert.deepEqual(placeStep(welcome, '/explore/abc'), { kind: 'navigate', to: '/explore' })
  })
  test('page-less steps render anywhere', () => {
    assert.deepEqual(placeStep(steps('host', GUEST)[0], '/whatever'), { kind: 'here' })
  })
})

describe('guide state', () => {
  const now = 1_800_000_000_000
  test('round-trips', () => {
    assert.deepEqual(parseGuideState(serializeGuideState('host', 2, now), now + 1000), { tour: 'host', index: 2, at: now })
  })
  test('rejects junk', () => {
    for (const raw of [null, '', 'nope', '[]', '{"tour":"x","index":0,"at":1}', `{"tour":"main","index":-1,"at":${now}}`,
      `{"tour":"main","index":1.5,"at":${now}}`, `{"tour":"main","index":0}`]) {
      assert.equal(parseGuideState(raw, now), null, String(raw))
    }
  })
  test('rejects an index past the end of the tour', () => {
    assert.equal(parseGuideState(serializeGuideState('main', 8, now), now), null)
    assert.equal(parseGuideState(serializeGuideState('host', 6, now), now), null)
    assert.ok(parseGuideState(serializeGuideState('main', 7, now), now))
  })
  test('expires a tour abandoned for longer than the TTL', () => {
    const raw = serializeGuideState('main', 3, now)
    assert.ok(parseGuideState(raw, now + GUIDE_ACTIVE_TTL_MS))
    assert.equal(parseGuideState(raw, now + GUIDE_ACTIVE_TTL_MS + 1), null)
  })
})

describe('anchorMatches', () => {
  test('matches a token in a space-separated list', () => {
    assert.equal(anchorMatches('saved trips account signIn', 'trips'), true)
    assert.equal(anchorMatches('search', 'search'), true)
  })
  test('does not match a prefix or an empty attribute', () => {
    assert.equal(anchorMatches('savedX', 'saved'), false)
    assert.equal(anchorMatches(null, 'saved'), false)
    assert.equal(anchorMatches('', 'saved'), false)
  })
})

describe('cardSide', () => {
  test('centres without a cutout', () => {
    assert.equal(cardSide(null, 800), 'center')
  })
  test('picks the side with more room', () => {
    assert.equal(cardSide({ top: 40, left: 0, width: 100, height: 40 }, 800), 'below')
    assert.equal(cardSide({ top: 700, left: 0, width: 100, height: 40 }, 800), 'above')
  })
  test('centres when neither side fits a card', () => {
    assert.equal(cardSide({ top: 100, left: 0, width: 100, height: 600 }, 800), 'center')
  })
})
