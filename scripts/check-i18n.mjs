#!/usr/bin/env node
// The i18n ratchet. Three checks, run by `npm run check`:
//
//   1. every t('…') key in src/ exists in en.json      — always an error
//   2. en-XA.json is regenerated from en.json          — always an error
//   3. every key in en.json is actually used           — see UNUSED_IS_ERROR
//
// (3) is a warning until the extraction finishes: while surfaces are being
// migrated one commit at a time, a key can legitimately land before its call
// site. Flip it the moment the last surface is done — a catalogue nobody prunes
// is how dead copy outlives the UI it described.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalogueKeys, dottedLiteralsIn, dynamicKeyLines, keysUsedIn } from './lib/i18nKeys.mjs'
import { isStaleGenerated, pseudoTree } from './lib/pseudo.mjs'

const UNUSED_IS_ERROR = true

const root = fileURLToPath(new URL('..', import.meta.url))
const i18nDir = join(root, 'src/shared/i18n')
const EXTS = ['.js', '.vue', '.mjs']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTS.some((e) => name.endsWith(e))) out.push(full)
  }
  return out
}

const en = JSON.parse(readFileSync(join(i18nDir, 'en.json'), 'utf8'))
const known = new Set(catalogueKeys(en))
const used = new Set()
const problems = []
const dynamic = []

for (const file of walk(join(root, 'src'))) {
  const source = readFileSync(file, 'utf8')
  const where = relative(root, file)
  for (const key of keysUsedIn(source)) {
    used.add(key)
    if (!known.has(key)) problems.push(`${where}: unknown key ${JSON.stringify(key)}`)
  }
  // A key can also arrive as a plain value (shareErrors.js maps code -> key).
  // Only ones the catalogue actually has count, so this cannot invent a use.
  for (const value of dottedLiteralsIn(source)) if (known.has(value)) used.add(value)
  for (const { line, text } of dynamicKeyLines(source)) dynamic.push(`${where}:${line}  ${text}`)
}

const expected = `${JSON.stringify(pseudoTree(en), null, 2)}\n`
let current
try {
  current = readFileSync(join(i18nDir, 'en-XA.json'), 'utf8')
} catch {
  current = null
}
if (isStaleGenerated(current, expected)) {
  problems.push('en-XA.json is stale — run `node scripts/pseudolocale.mjs`')
}

const unused = [...known].filter((key) => !used.has(key)).sort()
if (unused.length) {
  const line = `${unused.length} catalogue key(s) with no call site: ${unused.slice(0, 8).join(', ')}${unused.length > 8 ? ' …' : ''}`
  if (UNUSED_IS_ERROR) problems.push(line)
  else console.log(`i18n warning: ${line}`)
}

if (dynamic.length) {
  console.log(`i18n: ${dynamic.length} runtime-built key(s), not statically checkable:`)
  for (const d of dynamic) console.log(`  ${d}`)
}

if (problems.length) {
  console.error(`i18n: ${problems.length} finding(s)\n`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log(`i18n: ${known.size} keys, ${used.size} used — clean`)
