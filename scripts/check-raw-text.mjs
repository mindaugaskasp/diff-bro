#!/usr/bin/env node
// Counts the raw strings still hardcoded in templates and holds the number to a
// committed baseline, which is now 0 — every string is in the catalogue.
//
// It stays a baseline rather than a bare `=== 0` because that is what carried
// the migration from 193 down, and because a future surface that genuinely
// cannot be extracted gets one reviewed line rather than a disabled rule.
//
//   node scripts/check-raw-text.mjs             fail if the count rose
//   node scripts/check-raw-text.mjs --retighten lower the baseline to today's
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASELINE = fileURLToPath(new URL('./lib/rawTextBaseline.json', import.meta.url))
const root = fileURLToPath(new URL('..', import.meta.url))

let report
try {
  report = JSON.parse(
    execFileSync(
      'npx',
      ['eslint', '--no-config-lookup', '-c', 'eslint.i18n.mjs', '-f', 'json', 'src/renderer/src'],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
  )
} catch (err) {
  // eslint exits non-zero when it reports errors; the JSON is still on stdout.
  report = JSON.parse(err.stdout)
}

const count = report.reduce(
  (n, f) => n + f.messages.filter((m) => m.ruleId?.endsWith('no-raw-text')).length,
  0
)
const { max } = JSON.parse(readFileSync(BASELINE, 'utf8'))

if (process.argv.includes('--retighten')) {
  if (count < max) {
    writeFileSync(BASELINE, `${JSON.stringify({ max: count }, null, 2)}\n`)
    console.log(`raw text: baseline lowered ${max} → ${count}`)
  } else {
    console.log(`raw text: ${count} — baseline ${max} already tight`)
  }
  process.exit(0)
}

if (count > max) {
  console.error(`raw text: ${count} hardcoded strings, baseline is ${max} — extract, don't add.`)
  console.error('  Offenders: npx eslint --no-config-lookup -c eslint.i18n.mjs src/renderer/src')
  process.exit(1)
}
if (count < max) {
  console.error(`raw text: ${count} < baseline ${max} — run --retighten to lock the win in.`)
  process.exit(1)
}
console.log(`raw text: ${count} still hardcoded, held at the baseline`)
