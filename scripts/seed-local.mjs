#!/usr/bin/env node
// `make local-seed` — fill YOUR OWN install with test data. Runs on the host,
// not in Docker, because the target is the real user-data directory.
//
// Fixtures and the plaintext seed are built here; everything needing the vault
// key happens in seed-worker.cjs. It MERGES — every entry carries the `seed`
// tag, which is what lets `--clean` remove exactly this and nothing else.
//
// Diff Bro must be closed: a second launch hands its argv to the running app.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeXlsx } from './lib/makeXlsx.mjs'
import { createIdentityKeys } from '../src/main/sealing.js'
import { SEED_TAG, localDiffs, localSnippets } from './lib/seedLocal.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
// Inside the repo but gitignored: keeps the fixtures beside the project they
// belong to, with no chance of committing 80 MB of generated log. No leading
// dot — Finder hides those, and the open dialog needs Cmd+Shift+. to show them,
// which is a poor way to reach files whose whole purpose is being opened.
// Override with SEED_DIR.
const SEED_DIR = process.env.SEED_DIR || join(ROOT, 'seed-files')

// Mirrors snippetStore's TAG_PALETTE. Cosmetic only.
const TAG_PALETTE = [
  '#e9687e',
  '#c18f00',
  '#18b46d',
  '#00a7d8',
  '#a87eeb',
  '#ea6c5a',
  '#aa9a00',
  '#00b292',
  '#299ff4',
  '#c075d7',
  '#e57431',
  '#8ca507',
  '#00afab',
  '#6594fa',
  '#d46ebd',
  '#d68200',
  '#62ae45',
  '#00abc0',
  '#8a89f7',
  '#e1699f'
]

// Three demo identities so the share dialog has real recipients to address and
// the multi-recipient path can be exercised. Generated fresh each run: nobody
// holds their private halves, which is the honest state for a fixture.
//
// The label prefix is load-bearing. Fingerprints are new every run, so --clean
// has nothing else to recognise them by — and it must never take out a key you
// actually trust.
const SEED_KEY_PREFIX = 'Seed — '
const RECIPIENTS = ['Alice (MacBook)', 'Bob (workstation)', 'Carol (laptop)'].map((who) => ({
  label: `${SEED_KEY_PREFIX}${who}`,
  ...createIdentityKeys()
}))

const FILES = {
  'budget-2024.xlsx': makeXlsx([
    {
      name: 'Summary',
      rows: [
        ['Metric', 'Q2', 'Q3'],
        ['Revenue', 1180, 1245],
        ['Costs', 640, 690],
        ['Headcount', 42, 44]
      ]
    },
    {
      name: 'Regions',
      rows: [
        ['Region', 'Users', 'MRR'],
        ['EMEA', 9200, 74000],
        ['APAC', 6100, 48000],
        ['LATAM', 2100, 15000]
      ]
    }
  ]),
  'budget-2025.xlsx': makeXlsx([
    {
      name: 'Summary',
      rows: [
        ['Metric', 'Q2', 'Q3'],
        ['Revenue', 1180, 1310],
        ['Costs', 640, 690],
        ['Headcount', 42, 47],
        ['Runway (mo)', 18, 21]
      ]
    },
    {
      name: 'Regions',
      rows: [
        ['Region', 'Users', 'MRR'],
        ['EMEA', 9200, 74000],
        ['APAC', 6800, 52000],
        ['NA', 3400, 29000]
      ]
    }
  ]),
  // A workbook wide enough that the grid scrolls sideways — what the image
  // export reports as columns it cannot reach.
  'wide-metrics-a.xlsx': makeXlsx([
    {
      name: 'Weekly',
      rows: [
        ['Metric', ...Array.from({ length: 40 }, (_, i) => `W${i + 1}`)],
        ['Signups', ...Array.from({ length: 40 }, (_, i) => 100 + i * 3)],
        ['Churn', ...Array.from({ length: 40 }, (_, i) => 5 + (i % 7))]
      ]
    }
  ]),
  'wide-metrics-b.xlsx': makeXlsx([
    {
      name: 'Weekly',
      rows: [
        ['Metric', ...Array.from({ length: 40 }, (_, i) => `W${i + 1}`)],
        ['Signups', ...Array.from({ length: 40 }, (_, i) => 100 + i * 4)],
        ['Churn', ...Array.from({ length: 40 }, (_, i) => 5 + (i % 5))]
      ]
    }
  ])
}

const TEXT_FILES = {
  'service-before.yaml': 'service:\n  name: diff-engine\n  replicas: 3\n  features: [a, b]\n',
  'service-after.yaml': 'service:\n  replicas: 6\n  name: diff-engine\n  features: [b, a, c]\n',
  'catalog-before.xml': '<catalog><item id="1"><price>9.99</price></item></catalog>\n',
  'catalog-after.xml': '<catalog><item id="1"><price>12.50</price></item></catalog>\n',
  'huge-before.json': `{\n${Array.from({ length: 5000 }, (_, i) => `  "k${i}": ${i}`).join(',\n')}\n}\n`,
  'huge-after.json': `{\n${Array.from(
    { length: 5000 },
    (_, i) => `  "k${i}": ${i % 37 === 0 ? i + 1000 : i}`
  ).join(',\n')}\n}\n`
}

// Streaming only engages past STREAM_THRESHOLD_BYTES (32 MB, src/main/files.js),
// so a "big" file of a few thousand lines proves nothing — it opens in Monaco
// like any other. These are sized to cross it.
// Written a chunk at a time, because building 36 MB as one JS string to hand to
// writeFileSync is exactly the memory behaviour the feature exists to avoid.
// Measured at ~76 bytes/line: 550k clears the 32 MB threshold with room to
// spare. 400k came to 29 MB and quietly opened in Monaco instead.
const STREAM_LINES = 550_000
const CHUNK_LINES = 20_000

function writeStreamedPair(dir) {
  const line = (i, changed) =>
    `${String(i).padStart(9, '0')} ${changed ? 'THIS LINE WAS EDITED' : 'request ok'} ` +
    `session=${(i * 2654435761) % 1_000_000} latency=${i % 997}ms path=/api/v2/resource/${i % 5000}\n`

  const write = (name, edit) => {
    const path = join(dir, name)
    writeFileSync(path, '')
    for (let start = 0; start < STREAM_LINES; start += CHUNK_LINES) {
      let chunk = ''
      for (let i = start; i < Math.min(start + CHUNK_LINES, STREAM_LINES); i++) {
        chunk += line(i, edit && i % 5000 === 0)
      }
      writeFileSync(path, chunk, { flag: 'a' })
    }
    return path
  }

  return [write('huge-before.log', false), write('huge-after.log', true)]
}

function writeFixtures() {
  mkdirSync(SEED_DIR, { recursive: true })
  for (const [name, bytes] of Object.entries(FILES)) writeFileSync(join(SEED_DIR, name), bytes)
  for (const [name, text] of Object.entries(TEXT_FILES)) {
    writeFileSync(join(SEED_DIR, name), text, 'utf8')
  }
}

// One addressed to a single recipient and one to all three, so the "not for you"
// refusal and the multi-recipient path each have a real file to try.
const SEALED = [
  { name: 'Sealed for Alice', all: false },
  { name: 'Sealed for all three', all: true }
].map((s) => ({
  ...s,
  snapshot: {
    mode: 'files',
    renderSideBySide: true,
    ignoreTrimWhitespace: false,
    left: { path: null, name: 'sealed-before.json', content: '{ "n": 1 }' },
    right: { path: null, name: 'sealed-after.json', content: '{ "n": 2 }' }
  }
}))

function runWorker(payload) {
  if (!existsSync(MAIN)) {
    throw new Error(`build/ is missing — run "npm run build" first (looked for ${MAIN}).`)
  }
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-seed-'))
  const payloadPath = join(dir, 'payload.json')
  const resultPath = join(dir, 'result.json')
  writeFileSync(payloadPath, JSON.stringify(payload))

  const electronBin = join(ROOT, 'node_modules', '.bin', 'electron')
  // Exercises the script without touching anybody's real vault.
  const sandbox = process.env.SEED_USER_DATA
  const args = [join(ROOT, 'scripts', 'seed-worker.cjs')]
  if (sandbox) args.push(`--user-data-dir=${sandbox}`)
  args.push(payloadPath, resultPath)

  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE // would run the worker as plain Node, with no safeStorage
  // The worker reports its own failures through resultPath, so a non-zero exit
  // is only fatal when nothing was written there.
  try {
    execFileSync(electronBin, args, { cwd: ROOT, env, stdio: 'ignore' })
  } catch {
    /* empty */
  }
  let result
  try {
    result = JSON.parse(readFileSync(resultPath, 'utf-8'))
  } catch {
    throw new Error('could not start Diff Bro — is it already running? Quit it and try again.')
  }
  if (result.error) throw new Error(result.error)
  return result
}

function main() {
  if (process.argv.includes('--clean')) {
    const res = runWorker({
      clean: true,
      seedTag: SEED_TAG,
      keyPrefix: SEED_KEY_PREFIX,
      seedDir: SEED_DIR
    })
    console.log(
      `Removed ${res.removed} seeded entries, ${res.keys} seeded trusted keys, and ${SEED_DIR}.`
    )
    return
  }

  writeFixtures()
  const streamed = writeStreamedPair(SEED_DIR)
  const res = runWorker({
    clean: false,
    seedTag: SEED_TAG,
    keyPrefix: SEED_KEY_PREFIX,
    palette: TAG_PALETTE,
    seedDir: SEED_DIR,
    snippets: localSnippets(),
    diffs: localDiffs(Date.now()),
    recipients: RECIPIENTS.map((r) => ({ label: r.label, pub: r.pub })),
    sealed: SEALED
  })

  console.log(`Seeded ${res.snippets} snippets and ${res.diffs} diffs (tagged "${SEED_TAG}").`)
  console.log(`Kept ${res.kept} entries that were already there.`)
  console.log(`Added ${res.keys} trusted keys: ${RECIPIENTS.map((r) => r.label).join(', ')}.`)
  console.log(`Data directory: ${res.dataDir}`)
  console.log(`Files to open: ${SEED_DIR}`)
  const mb = (f) => (statSync(f).size / 1024 / 1024).toFixed(1)
  console.log(
    `Streamed pair (open both to exercise it): ` +
      streamed.map((f) => `${basename(f)} ${mb(f)} MB`).join(', ')
  )
  if (res.sealed?.length) console.log(`Sealed shares: ${res.sealed.join(', ')}`)
  console.log('\nStart Diff Bro to see them. "make local-seed-clean" takes it all back out.')
}

try {
  main()
} catch (err) {
  console.error(`local-seed: ${err.message}`)
  process.exit(1)
}
