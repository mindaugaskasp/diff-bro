#!/usr/bin/env node
// Regenerates src/shared/i18n/en-XA.json from en.json.
//
//   node scripts/pseudolocale.mjs           write it
//   node scripts/pseudolocale.mjs --check   fail if what is committed is stale
//
// The committed file is what ships, so `--check` runs in `npm run check`: a key
// added to en.json without regenerating would otherwise fall back to English and
// silently look translated.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pseudoTree } from './lib/pseudo.mjs'

const dir = fileURLToPath(new URL('../src/shared/i18n/', import.meta.url))
const source = `${dir}en.json`
const target = `${dir}en-XA.json`

const generated = `${JSON.stringify(pseudoTree(JSON.parse(readFileSync(source, 'utf8'))), null, 2)}\n`

if (process.argv.includes('--check')) {
  let current
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    current = null
  }
  if (current !== generated) {
    console.error('pseudolocale: en-XA.json is stale — run `node scripts/pseudolocale.mjs`')
    process.exit(1)
  }
  console.log('pseudolocale ok')
} else {
  writeFileSync(target, generated)
  console.log(`pseudolocale: wrote ${target}`)
}
