#!/usr/bin/env node
// `make local-seed` — fill YOUR OWN install with test data, then quit.
//
// Unlike every other Make target this runs natively on the host, because the
// point is the real user-data directory: the vault key lives behind the OS
// keychain there, and only the app itself can encrypt through it.
//
// It MERGES. Existing snippets and saved diffs are read, the seed is appended,
// and the result written back — nothing you already had is replaced. Every
// entry it writes carries the `seed` tag, which is what lets `--clean` remove
// exactly this and nothing else.
//
// Diff Bro must be closed: a second launch hands its argv to the running app
// and exits, so there would be no renderer to seed through.

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'
import { makeXlsx } from './lib/makeXlsx.mjs'
import { createIdentityKeys } from '../src/main/sealing.js'
import { SEED_TAG, localDiffs, localSnippets } from './lib/seedLocal.mjs'

/* global window -- referenced only inside page.evaluate, which runs in the renderer */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
// Outside the repo on purpose: these are files to open in the app, not sources.
const SEED_DIR = process.env.SEED_DIR || join(homedir(), 'DiffBro-seed')

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

function writeFixtures() {
  mkdirSync(SEED_DIR, { recursive: true })
  for (const [name, bytes] of Object.entries(FILES)) writeFileSync(join(SEED_DIR, name), bytes)
  for (const [name, text] of Object.entries(TEXT_FILES)) {
    writeFileSync(join(SEED_DIR, name), text, 'utf8')
  }
}

async function launch() {
  if (!existsSync(MAIN)) {
    throw new Error(`build/ is missing — run "npm run build" first (looked for ${MAIN}).`)
  }
  // No --user-data-dir: the real install is the whole point. SEED_USER_DATA
  // points it at a throwaway one instead, which is how this script is tested
  // without touching anybody's vault.
  //
  // `.` from ROOT, never the entry FILE: handed a path with no package.json
  // beside it, Electron falls back to the name "Electron" — a different
  // userData directory AND a different safeStorage keychain entry, so the seed
  // would land where `npm run dev` never looks. It must be `.` rather than an
  // absolute ROOT because cliWords reads an unrecognised leading path as a
  // command (this checkout is "diff-bro", which its ENTRY pattern misses).
  const sandbox = process.env.SEED_USER_DATA
  const args = sandbox ? ['.', `--user-data-dir=${sandbox}`] : ['.']
  const app = await electron.launch({ args, cwd: ROOT }).catch((err) => {
    throw new Error(
      `could not start Diff Bro — is it already running? Quit it and try again.\n  (${err.message})`
    )
  })
  const page = await app.firstWindow()
  await page.locator('.app').waitFor({ state: 'visible', timeout: 30_000 })
  return { app, page }
}

// One read of both store files. Everything else takes them as arguments, so
// the parse lives in exactly one place — page.evaluate bodies cannot share a
// helper, they are serialised into the renderer whole.
async function readStores(page) {
  return page.evaluate(() => {
    const read = (name) => {
      try {
        return JSON.parse(window.api.storeLoad(name) || '{}')
      } catch {
        return {}
      }
    }
    return { snippets: read('snippets'), vault: read('vault') }
  })
}

// Merge into whatever is already stored. Runs in the renderer because that is
// where window.api lives; the vault key never crosses back.
async function writeStores(page, existing, { snippets, diffs, palette, seedTag }) {
  return page.evaluate(
    async ({ existing, snippets, diffs, palette, seedTag }) => {
      const tags = { ...(existing.snippets.tags ?? {}) }
      let rank = Object.keys(tags).length
      const ensure = (names) => {
        const out = []
        for (const raw of names) {
          const n = String(raw).trim().toLowerCase().slice(0, 40)
          if (!n || out.includes(n) || out.length >= 20) continue
          if (!tags[n]) {
            tags[n] = { color: palette[Object.keys(tags).length % palette.length], rank: ++rank }
          }
          out.push(n)
        }
        return out
      }
      const seal = async (text, aad) => {
        const box = await window.api.vaultEncrypt(text, aad)
        if (box?.error) throw new Error('vault key unavailable: ' + box.error)
        return box
      }
      const fmtTag = (l) => (l && l !== 'auto' && l !== 'plaintext' ? l : null)

      let t = Date.now()
      const newSnippets = []
      for (const s of snippets) {
        const id = crypto.randomUUID()
        const aadSalt = crypto.randomUUID()
        const createdAt = t
        t -= 3 * 3600_000
        const box = await seal(s.content, [id, aadSalt, createdAt].join('|'))
        const ft = fmtTag(s.language)
        newSnippets.push({
          id,
          aadSalt,
          name: s.name,
          createdAt,
          language: s.language,
          detected: s.language,
          favorite: !!s.favorite,
          secret: s.secret === true,
          tags: ensure(ft ? [ft, ...s.tags] : s.tags),
          iv: box.iv,
          data: box.data
        })
      }

      const newDiffs = []
      for (const d of diffs) {
        const id = crypto.randomUUID()
        const from = d.from ?? null
        const aad = [id, d.createdAt, d.expiresAt, from ?? ''].join('|')
        const box = await seal(JSON.stringify(d.payload), aad)
        newDiffs.push({
          id,
          name: d.name,
          createdAt: d.createdAt,
          expiresAt: d.expiresAt,
          from,
          favorite: !!d.favorite,
          tags: ensure(d.tags),
          iv: box.iv,
          data: box.data
        })
      }

      const yours = (list) => (list ?? []).filter((e) => !e.tags?.includes(seedTag))
      const keptSnippets = yours(existing.snippets.entries)
      const keptDiffs = yours(existing.vault.entries)
      await window.api.storeSave(
        'snippets',
        JSON.stringify({ tags, entries: [...newSnippets, ...keptSnippets] })
      )
      await window.api.storeSave('vault', JSON.stringify({ entries: [...newDiffs, ...keptDiffs] }))
      return {
        snippets: newSnippets.length,
        diffs: newDiffs.length,
        kept: keptSnippets.length + keptDiffs.length
      }
    },
    { existing, snippets, diffs, palette, seedTag }
  )
}

async function removeSeeded(page, existing, seedTag, keyPrefix) {
  const keys = await page.evaluate(async (prefix) => {
    let gone = 0
    for (const k of await window.api.listTrustedKeys()) {
      if (!String(k.label ?? '').startsWith(prefix)) continue
      await window.api.removeTrusted(k.fingerprint)
      gone += 1
    }
    return gone
  }, keyPrefix)

  const entries = await page.evaluate(
    async ({ existing, seedTag }) => {
      const yours = (list) => (list ?? []).filter((e) => !e.tags?.includes(seedTag))
      const snippets = yours(existing.snippets.entries)
      const diffs = yours(existing.vault.entries)
      const before =
        (existing.snippets.entries ?? []).length + (existing.vault.entries ?? []).length
      await window.api.storeSave(
        'snippets',
        JSON.stringify({ tags: existing.snippets.tags ?? {}, entries: snippets })
      )
      await window.api.storeSave('vault', JSON.stringify({ entries: diffs }))
      return before - snippets.length - diffs.length
    },
    { existing, seedTag }
  )
  return { entries, keys }
}

// Real trusted keys, so the share dialog has someone to address. Their private
// halves are thrown away with this process — a sealed file addressed to one is
// for exercising the SEND path and the "not for you" refusal, never for opening.
async function addRecipients(page, recipients) {
  return page.evaluate(
    async (list) => {
      let added = 0
      for (const r of list) {
        const res = await window.api.addTrustedKeyNamed(r.pub, r.label)
        if (res?.ok || res?.added) added += 1
      }
      return added
    },
    recipients.map((r) => ({ label: r.label, pub: r.pub }))
  )
}

// Seal a couple of the seeded diffs to those recipients, straight to disk.
async function writeSealed(app, page, dir) {
  const out = []
  for (const [i, spec] of [
    { name: 'Sealed for Alice', to: 0 },
    { name: 'Sealed for all three', to: null }
  ].entries()) {
    const target = join(dir, `sealed-${i + 1}.diffbro`)
    await app.evaluate(({ dialog }, fp) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp })
    }, target)
    const res = await page.evaluate(
      async ({ name, only }) => {
        const fps = (await window.api.listTrustedKeys()).map((k) => k.fingerprint)
        const to = only === null ? fps : [fps[only]]
        if (!to.length || to.some((x) => !x)) return { error: 'no-recipients' }
        return window.api.shareExport(
          {
            name,
            createdAt: Date.now(),
            expiresAt: Date.now() + 24 * 3600_000,
            snapshot: {
              mode: 'files',
              renderSideBySide: true,
              ignoreTrimWhitespace: false,
              left: { path: null, name: 'sealed-before.json', content: '{ "n": 1 }' },
              right: { path: null, name: 'sealed-after.json', content: '{ "n": 2 }' }
            }
          },
          to
        )
      },
      { name: spec.name, only: spec.to }
    )
    if (res?.ok || res?.path) out.push(res.path ?? target)
  }
  return out
}

async function main() {
  const clean = process.argv.includes('--clean')
  const { app, page } = await launch()
  try {
    if (clean) {
      const { entries, keys } = await removeSeeded(
        page,
        await readStores(page),
        SEED_TAG,
        SEED_KEY_PREFIX
      )
      rmSync(SEED_DIR, { recursive: true, force: true })
      console.log(
        `Removed ${entries} seeded entries, ${keys} seeded trusted keys, and ${SEED_DIR}.`
      )
      return
    }

    writeFixtures()
    const now = Date.now()
    const counts = await writeStores(page, await readStores(page), {
      snippets: localSnippets(),
      diffs: localDiffs(now),
      palette: TAG_PALETTE,
      seedTag: SEED_TAG
    })
    const recipients = await addRecipients(page, RECIPIENTS)
    const sealed = await writeSealed(app, page, SEED_DIR)

    console.log(
      `Seeded ${counts.snippets} snippets and ${counts.diffs} diffs (tagged "${SEED_TAG}").`
    )
    console.log(`Kept ${counts.kept} entries that were already there.`)
    console.log(`Added ${recipients} trusted keys: ${RECIPIENTS.map((r) => r.label).join(', ')}.`)
    console.log(`Files to open: ${SEED_DIR}`)
    if (sealed.length) console.log(`Sealed shares: ${sealed.join(', ')}`)
    console.log('\nStart Diff Bro to see them. "make local-seed-clean" takes it all back out.')
  } finally {
    await app.close().catch(() => {})
  }
}

main().catch((err) => {
  console.error(`local-seed: ${err.message}`)
  process.exit(1)
})
