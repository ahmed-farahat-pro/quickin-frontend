#!/usr/bin/env node
// Reports drift between the root-zone snapshot embedded in
// src/lib/local/email-core.ts and the live IANA list.
//
// NOT part of `npm run check` — that gate is offline by design, and this needs
// the network. Run it by hand every few months, or when someone reports that a
// legitimate address was refused:
//
//   npm run check:tlds
//
// A TLD that IANA has added and we haven't is the failure that matters: a guest
// on a brand-new extension is turned away at signup with no way around it. One
// we still list and IANA has retired is harmless — nobody can register there.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SOURCE = 'https://data.iana.org/TLD/tlds-alpha-by-domain.txt'
const here = dirname(fileURLToPath(import.meta.url))
const modulePath = join(here, '..', 'src', 'lib', 'local', 'email-core.ts')

const source = readFileSync(modulePath, 'utf8')
const block = source.match(/const TLD_DATA =\n([\s\S]*?)\n\nconst VALID_TLDS/)
if (!block) {
  console.error('Could not find TLD_DATA in email-core.ts — did the module change shape?')
  process.exit(2)
}
const ours = new Set(
  block[1].split('\n').map((l) => l.trim().replace(/^"|" \+$|"$/g, '')).join('').trim().split(/\s+/)
)

const res = await fetch(SOURCE)
if (!res.ok) {
  console.error(`Could not fetch ${SOURCE}: ${res.status}`)
  process.exit(2)
}
const text = await res.text()
const [versionLine, ...rest] = text.split('\n')
const theirs = new Set(rest.map((s) => s.trim().toLowerCase()).filter(Boolean))

const missing = [...theirs].filter((t) => !ours.has(t)).sort()
const stale = [...ours].filter((t) => !theirs.has(t)).sort()

console.log(`embedded: ${ours.size} TLDs`)
console.log(`iana:     ${theirs.size} TLDs — ${versionLine.replace(/^#\s*/, '')}`)

if (!missing.length && !stale.length) {
  console.log('\nUp to date.')
  process.exit(0)
}
if (missing.length) console.log(`\nMISSING (${missing.length}) — real TLDs we would refuse:\n  ${missing.join(' ')}`)
if (stale.length) console.log(`\nRETIRED (${stale.length}) — gone from the root zone, harmless to keep:\n  ${stale.join(' ')}`)
console.log(
  '\nTo refresh: replace the TLD_DATA block in src/lib/local/email-core.ts with the ' +
  'lowercased, sorted, space-separated list from the URL above, and update the ' +
  'Version comment beside it.'
)
process.exit(missing.length ? 1 : 0)
