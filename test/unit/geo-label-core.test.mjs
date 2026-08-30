// Unit tests for src/lib/local/geo-label-core.ts — the words that go with the
// map pin on the host forms. `placeShort` names a search hit the host picked
// from the autocomplete; `reverseLabel` names a pin the host just dragged, which
// is the half that did not exist and let the Location field keep showing the
// previous place after the pin moved.
//
// Offline: no database, no network, no server. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. geo-label-core.ts has no imports, which is what makes it
// loadable here at all. See README → Testing.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  COUNTRIES,
  REVERSE_GEOCODE_DEBOUNCE_MS,
  countryCodeFor,
  placeShort,
  reverseGeocodeUrl,
  reverseLabel,
} from '../../src/lib/local/geo-label-core.ts'

describe('reverseLabel — the bug this module exists for', () => {
  test('a pin dragged into a named suburb reads as "suburb, city"', () => {
    // The host had picked "Porto Marina, Marsa Matrouh" and then dragged the pin
    // to Sidi Abdel Rahman. Before this module the field still said Porto.
    const label = reverseLabel({
      display_name: 'Sidi Abdel Rahman, Marsa Matrouh, Matrouh, Egypt',
      address: { suburb: 'Sidi Abdel Rahman', city: 'Marsa Matrouh', state: 'Matrouh', country: 'Egypt' },
    })
    assert.equal(label, 'Sidi Abdel Rahman, Marsa Matrouh')
  })

  test('a named feature at the pin wins over the administrative words', () => {
    const label = reverseLabel({
      name: 'Marassi',
      display_name: 'Marassi, Sidi Abdel Rahman, Marsa Matrouh, Egypt',
      address: { suburb: 'Sidi Abdel Rahman', city: 'Marsa Matrouh', country: 'Egypt' },
    })
    assert.equal(label, 'Marassi, Marsa Matrouh')
  })

  test('a pin on a road inside a village is named for the village, not the road', () => {
    // "Sahl Hasheesh Road, Sahl Hasheesh" is what naive ordering produces. The
    // village is the word a guest recognises, and saying it twice is worse than
    // saying it once, so the village outranks the road and the repeat collapses.
    const label = reverseLabel({
      address: { road: 'Sahl Hasheesh Road', village: 'Sahl Hasheesh', state: 'Red Sea', country: 'Egypt' },
    })
    assert.equal(label, 'Sahl Hasheesh')
  })

  test('a pin on a road with no settlement around it does use the road', () => {
    // A desert highway: no suburb, no village, no town. The road plus the
    // governorate is the whole of what is true about that coordinate.
    const label = reverseLabel({
      address: { road: 'Wadi El Natrun Road', state: 'Beheira', country: 'Egypt' },
    })
    assert.equal(label, 'Wadi El Natrun Road, Beheira')
  })

  test('a pin in open desert falls back to the governorate and country', () => {
    const label = reverseLabel({
      display_name: 'Matrouh, Egypt',
      address: { state: 'Matrouh', country: 'Egypt' },
    })
    assert.equal(label, 'Matrouh, Egypt')
  })

  test('a place whose only word is the country still names it', () => {
    assert.equal(reverseLabel({ address: { country: 'Egypt' } }), 'Egypt')
  })

  test('a city is not qualified by the governorate that shares its name', () => {
    // Nominatim reports Cairo's state as "Cairo Governorate". "Cairo, Cairo
    // Governorate" is noise in a one-line field; the city alone is the label.
    const label = reverseLabel({ address: { city: 'Cairo', state: 'Cairo Governorate', country: 'Egypt' } })
    assert.equal(label, 'Cairo')
  })

  test('a city stands on its own — the governorate is not appended to it', () => {
    // Not "Hurghada, Red Sea". A city is specific enough for a one-line field,
    // and the form already carries Country and the curated Region beside it.
    // The governorate only appears when it is the ONLY word there is (below).
    const label = reverseLabel({ address: { city: 'Hurghada', state: 'Red Sea', country: 'Egypt' } })
    assert.equal(label, 'Hurghada')
  })

  test('a pin at sea, which Nominatim answers with nothing, yields no label', () => {
    // '' is the caller's signal to leave the Location field alone rather than
    // blank it — the form says so under the map instead.
    assert.equal(reverseLabel({}), '')
    assert.equal(reverseLabel({ address: {} }), '')
  })

  test('a failed fetch (null/undefined) yields no label rather than throwing', () => {
    assert.equal(reverseLabel(null), '')
    assert.equal(reverseLabel(undefined), '')
  })

  test('whitespace-only address words count as missing', () => {
    assert.equal(reverseLabel({ address: { suburb: '   ', city: 'Hurghada' } }), 'Hurghada')
  })

  test('with no address object at all it reads the display_name', () => {
    assert.equal(reverseLabel({ display_name: 'El Gouna, Red Sea, Egypt' }), 'El Gouna')
  })
})

describe('placeShort — the autocomplete label, unchanged by the move', () => {
  test('a search hit reads as "place, city"', () => {
    const short = placeShort({
      name: 'Porto Marina',
      display_name: 'Porto Marina, El Alamein, Matrouh, Egypt',
      address: { city: 'El Alamein', state: 'Matrouh', country: 'Egypt' },
    })
    assert.equal(short, 'Porto Marina, El Alamein')
  })

  test('a hit whose name is its city is not repeated', () => {
    assert.equal(placeShort({ name: 'Cairo', address: { city: 'Cairo' } }), 'Cairo')
  })

  test('with no address details it falls back to the first two display_name parts', () => {
    assert.equal(
      placeShort({ display_name: 'Hurghada, Red Sea, Egypt' }),
      'Hurghada',
    )
  })

  test('an empty result yields an empty label', () => {
    assert.equal(placeShort({}), '')
  })

  test('a dragged pin and the same place picked from the dropdown agree', () => {
    // The two directions must not produce different words for one place, or the
    // host sees the field rewrite itself for no visible reason.
    const hit = {
      name: 'Marassi',
      display_name: 'Marassi, Sidi Abdel Rahman, Marsa Matrouh, Egypt',
      address: { suburb: 'Sidi Abdel Rahman', city: 'Marsa Matrouh', country: 'Egypt' },
    }
    assert.equal(reverseLabel(hit), placeShort(hit))
  })
})

describe('countryCodeFor', () => {
  test('gives the ISO code the geocoder scopes by', () => {
    assert.equal(countryCodeFor('Egypt'), 'eg')
    assert.equal(countryCodeFor('United Arab Emirates'), 'ae')
  })

  test('an unlisted or empty country scopes to nothing rather than guessing', () => {
    // Older listings hold free-text countries; an unscoped search beats a wrong
    // scope that would return no results at all.
    assert.equal(countryCodeFor('Germany'), '')
    assert.equal(countryCodeFor(''), '')
    assert.equal(countryCodeFor(undefined), '')
    assert.equal(countryCodeFor(null), '')
  })

  test('every offered country carries a code', () => {
    assert.equal(COUNTRIES.length, 10)
    for (const c of COUNTRIES) {
      assert.ok(c.name, 'country needs a name')
      assert.match(c.code, /^[a-z]{2}$/, `${c.name} needs a two-letter code`)
    }
  })
})

describe('reverseGeocodeUrl', () => {
  test('asks for the address details and the granularity a Location field wants', () => {
    const url = new URL(reverseGeocodeUrl(30.8318, 28.9034))
    assert.equal(url.host, 'nominatim.openstreetmap.org')
    assert.equal(url.pathname, '/reverse')
    assert.equal(url.searchParams.get('lat'), '30.8318')
    assert.equal(url.searchParams.get('lon'), '28.9034')
    assert.equal(url.searchParams.get('addressdetails'), '1')
    assert.equal(url.searchParams.get('format'), 'jsonv2')
    // Building-level (18) would put a house number in the field.
    assert.equal(url.searchParams.get('zoom'), '16')
  })

  test('negative and fractional coordinates survive the round trip', () => {
    const url = new URL(reverseGeocodeUrl(-33.9249, 18.4241))
    assert.equal(url.searchParams.get('lat'), '-33.9249')
    assert.equal(url.searchParams.get('lon'), '18.4241')
  })

  test('the debounce stays under Nominatim one-request-a-second policy headroom', () => {
    assert.ok(REVERSE_GEOCODE_DEBOUNCE_MS >= 300, 'too eager for a rate-limited public API')
    assert.ok(REVERSE_GEOCODE_DEBOUNCE_MS <= 1000, 'a host would read this as lag')
  })
})

// Real Nominatim answers, captured 2026-08-26 from exactly the query the form
// makes (jsonv2 + addressdetails, zoom 16, `Accept-Language: en`), trimmed to
// the three fields `reverseLabel` reads. These are the regression guard the
// hand-written cases above cannot be: at this zoom the feature under a pin is
// usually a ROAD, and `name` then carries the road — which is how "Street 92"
// nearly ended up in a Location field instead of the neighbourhood around it.
describe('reverseLabel — against captured Nominatim responses', () => {
  test('a pin on the North Coast at Sidi Abdel Rahman', () => {
    assert.equal(
      reverseLabel({
        name: '',
        display_name: 'Sidi Abdel Rahman, Matruh, 51732, Egypt',
        address: {
          city: 'Sidi Abdel Rahman',
          state: 'Matruh',
          postcode: '51732',
          country: 'Egypt',
          country_code: 'eg',
        },
      }),
      'Sidi Abdel Rahman',
    )
  })

  test('a pin inside El Gouna', () => {
    assert.equal(
      reverseLabel({
        name: '',
        display_name: 'Kafr, El Gouna, Red Sea, 84513, Egypt',
        address: {
          neighbourhood: 'Kafr',
          town: 'El Gouna',
          state: 'Red Sea',
          postcode: '84513',
          country: 'Egypt',
          country_code: 'eg',
        },
      }),
      'Kafr, El Gouna',
    )
  })

  test('a pin on a numbered street near Ain Sokhna prefers the neighbourhood', () => {
    // `name` is 'Street 92' here — the road, mirrored. "Street 92, Suez" is a
    // true label and a useless one; the housing area is what a guest knows.
    assert.equal(
      reverseLabel({
        name: 'Street 92',
        display_name: 'Street 92, Al Obour Housing, Suez, 43515, Egypt',
        address: {
          road: 'Street 92',
          neighbourhood: 'Al Obour Housing',
          city: 'Suez',
          state: 'Suez',
          postcode: '43515',
          country: 'Egypt',
          country_code: 'eg',
        },
      }),
      'Al Obour Housing, Suez',
    )
  })

  test('a pin in downtown Cairo prefers the suburb over the square it sits on', () => {
    assert.equal(
      reverseLabel({
        name: 'El Tahrir Square',
        display_name: 'El Tahrir Square, Qasr Al Doubara, Bab al Luq, Cairo, 11519, Egypt',
        address: {
          road: 'El Tahrir Square',
          neighbourhood: 'Qasr Al Doubara',
          suburb: 'Bab al Luq',
          city: 'Cairo',
          state: 'Cairo',
          postcode: '11519',
          country: 'Egypt',
          country_code: 'eg',
        },
      }),
      'Bab al Luq, Cairo',
    )
  })

  test('a pin in the Western Desert falls back to the governorate', () => {
    assert.equal(
      reverseLabel({
        name: 'New Valley',
        display_name: 'New Valley, Egypt',
        address: { state: 'New Valley', country: 'Egypt', country_code: 'eg' },
      }),
      'New Valley',
    )
  })

  test('a pin in the Mediterranean — Nominatim answers "Unable to geocode"', () => {
    // The error response carries no `address` at all. '' is the signal to leave
    // the host's Location text where it is.
    assert.equal(reverseLabel({ error: 'Unable to geocode' }), '')
  })
})
