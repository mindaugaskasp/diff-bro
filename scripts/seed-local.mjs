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
import { basename, dirname, join } from 'node:path'
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
// `--many-keys` seeds a realistic org instead of three colleagues. The recipient
// picker and the trusted-key manager both change shape past a handful — search,
// alphabetical order, a bounded scroll — and `make local-seed` is the only way
// that is opened by hand on the host. Two of them deliberately have NO address,
// so the "Create file" fallback and the "Add an address…" secondary are
// reachable without editing anything first.
const MANY_KEYS = 30
const ADDRESSED = (who) => `${who.split(' ')[0].toLowerCase()}@example.com`

const smallTeam = () =>
  ['Alice (MacBook)', 'Bob (workstation)', 'Carol (laptop)'].map((who) => ({
    who,
    email: ADDRESSED(who)
  }))

const wholeOrg = () =>
  Array.from({ length: MANY_KEYS }, (_, i) => {
    const who = `${TEAM_NAMES[i % TEAM_NAMES.length]} ${String(i + 1).padStart(2, '0')}`
    // Two without an address, on purpose.
    return { who, email: i < MANY_KEYS - 2 ? ADDRESSED(who) : null }
  })

const TEAM_NAMES = [
  'Alice',
  'Bob',
  'Carol',
  'Dovydas',
  'Eglė',
  'Frank',
  'Greta',
  'Henrikas',
  'Ingrid',
  'Jonas',
  'Rūta',
  'Tomas'
]

const RECIPIENTS = (process.argv.includes('--many-keys') ? wholeOrg() : smallTeam()).map(
  ({ who, email }) => ({
    label: `${SEED_KEY_PREFIX}${who}`,
    email,
    ...createIdentityKeys()
  })
)

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
  // An inserted column and a sub-cent nudge, so the column alignment and the
  // tolerance control both have something to do when opened by hand.
  'budget-2025.xlsx': makeXlsx([
    {
      name: 'Summary',
      rows: [
        ['Metric', 'Q2', 'Q2 forecast', 'Q3'],
        ['Revenue', 1180, 1200, 1310],
        ['Costs', 640.004, 650, 690],
        ['Headcount', 42, 42, 47],
        ['Runway (mo)', 18, 18, 21]
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
  // A title row above the header and the same ledger re-sorted: nearly all
  // "changed" under Auto, one moved amount and one dropped line when keyed on
  // Account + Centre. Account alone is a duplicate key, which the panel says.
  'ledger-before.xlsx': makeXlsx([
    {
      name: 'Ledger',
      rows: [
        ['Trial balance as at 30 Jun 2025'],
        ['Account', 'Centre', 'Description', 'Amount'],
        ['1001', 'EMEA', 'Bank', 128400.5],
        ['1001', 'APAC', 'Bank', 41200],
        ['1200', 'EMEA', 'Receivables', 96750.25],
        ['1200', 'APAC', 'Receivables', 30110],
        ['2100', 'EMEA', 'Payables', -74300],
        ['4000', 'EMEA', 'Revenue', -412900],
        ['5000', 'EMEA', 'Cost of sales', 233150.75],
        ['6100', 'EMEA', 'Payroll', 118000],
        ['6200', 'APAC', 'Travel', 9430.4]
      ]
    }
  ]),
  'ledger-after.xlsx': makeXlsx([
    {
      name: 'Ledger',
      rows: [
        ['Trial balance as at 31 Jul 2025'],
        ['Account', 'Centre', 'Description', 'Amount'],
        ['6200', 'APAC', 'Travel', 9430.4],
        ['4000', 'EMEA', 'Revenue', -412900],
        ['1200', 'APAC', 'Receivables', 30110],
        ['1001', 'APAC', 'Bank', 41200],
        ['5000', 'EMEA', 'Cost of sales', 233150.75],
        ['1200', 'EMEA', 'Receivables', 91020.25],
        ['1001', 'EMEA', 'Bank', 128400.5],
        ['2100', 'EMEA', 'Payables', -74300]
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

// A lockfile pair: thousands of lines of text saying one direct bump, two
// carried packages and one dropped. The dependency view is the only way to see
// that without reading all of it.
const lockPackages = (entries) => ({
  lockfileVersion: 3,
  name: 'demo-app',
  packages: {
    '': {
      name: 'demo-app',
      dependencies: { vue: '^3.4.0', pinia: '^2.1.0' },
      devDependencies: { vitest: '^4.0.0' }
    },
    ...Object.fromEntries(
      entries.map(([name, version, dev]) => [
        `node_modules/${name}`,
        {
          version,
          resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
          license: 'MIT',
          ...(dev ? { dev: true } : {})
        }
      ])
    )
  }
})

const TEXT_FILES = {
  'lock-before/package-lock.json': JSON.stringify(
    lockPackages([
      ['vue', '3.4.21'],
      ['pinia', '2.1.7'],
      ['vitest', '4.1.9', true],
      ['@vue/shared', '3.4.21'],
      ['@vue/reactivity', '3.4.21'],
      ['nanoid', '3.3.7'],
      ['tinybench', '2.9.0', true]
    ]),
    null,
    2
  ),
  'lock-after/package-lock.json': JSON.stringify(
    lockPackages([
      ['vue', '3.5.13'],
      ['pinia', '2.1.7'],
      ['vitest', '4.1.10', true],
      ['@vue/shared', '3.5.13'],
      ['@vue/reactivity', '3.5.13'],
      ['tinybench', '2.9.0', true]
    ]),
    null,
    2
  ),
  'service-before.yaml': 'service:\n  name: diff-engine\n  replicas: 3\n  features: [a, b]\n',
  'service-after.yaml': 'service:\n  replicas: 6\n  name: diff-engine\n  features: [b, a, c]\n',
  // Two .csv files on disk: the Grid toggle only appears when BOTH sides are
  // delimited, so a pair is the only useful fixture.
  'totals-before.csv':
    'region,q2,q3\n"Nordics, EMEA",9200,74000\nAPAC,6100,48000\nLATAM,2100,15000\n',
  'totals-after.csv':
    'region,q2,q2 forecast,q3\n"Nordics, EMEA",9200.004,9400,74000\nAPAC,6800,7000,52000\nNA,3400,3600,29000\n',
  'catalog-before.xml': '<catalog><item id="1"><price>9.99</price></item></catalog>\n',
  'catalog-after.xml': '<catalog><item id="1"><price>12.50</price></item></catalog>\n',
  // The two extensions "Open with" associates that nothing else here writes.
  'notes-before.md': '# Release notes\n\n- Sealed diffs\n- Excel grid\n\nShips **today**.\n',
  'notes-after.md':
    '# Release notes\n\n- Sealed diffs\n- Excel grid\n- Open with\n\nShips **tomorrow**.\n',
  'plain-before.txt': 'one\ntwo\nthree\n',
  'plain-after.txt': 'one\ntwo CHANGED\nthree\nfour\n',
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
    const path = join(SEED_DIR, name)
    // A lockfile is recognised by its exact NAME, so the pair has to live in two
    // directories the way two checkouts do.
    if (name.includes('/')) mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text, 'utf8')
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
    recipients: RECIPIENTS.map((r) => ({ label: r.label, email: r.email, pub: r.pub })),
    sealed: SEALED
  })

  console.log(`Seeded ${res.snippets} snippets and ${res.diffs} diffs (tagged "${SEED_TAG}").`)
  console.log(`Kept ${res.kept} entries that were already there.`)
  const withMail = RECIPIENTS.filter((r) => r.email).length
  console.log(
    `Added ${res.keys} trusted keys (${withMail} with an email address)` +
      (RECIPIENTS.length > 5
        ? '. Pass --many-keys off to go back to three.'
        : `: ${RECIPIENTS.map((r) => r.label).join(', ')}. Pass --many-keys for ${MANY_KEYS}.`)
  )
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
