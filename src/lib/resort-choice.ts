// The host's resort DROPDOWN choice — the one rule the create and edit listing
// forms share, kept pure so it can be unit-tested (see test/unit/resort-choice.test.mjs).
//
// DELIBERATELY free of runtime imports, for the same reason as src/lib/local/
// resort-core.ts: `node --test` loads a .ts module directly, but Node's ESM
// resolver rejects extension-less relative specifiers. No imports = loadable.
//
// This is the FORM rule ("what may be submitted"), not the storage rule ("what the
// columns hold") — the latter is resolveResortSelection() in src/lib/local/resorts.ts.

/**
 * Sentinel `<option>` value for "Other — not listed". It is not a resort id, so it
 * is never sent as `resort_id`; picking it swaps the dropdown for a free-text box
 * whose contents go out as `resort_name`.
 *
 * The same string is the `__other__` resort filter on the /ops analytics endpoints
 * — both mean "free text rather than a catalog row".
 */
export const OTHER_RESORT = '__other__'

/**
 * True when the host picked "Other" but left the name box blank (or typed only
 * whitespace) — the one combination the forms must refuse.
 *
 * Without this the submit went through with `resort_name: undefined`, and the
 * server, which cannot tell a blank name from "no resort chosen", saved the listing
 * with NO resort at all: the host's answer was silently discarded, the listing
 * missed every resort filter, and nothing queued for the /ops catalog.
 */
export function isResortNameMissing(resortId: string, typedName: string): boolean {
  return resortId === OTHER_RESORT && typedName.trim().length === 0
}
