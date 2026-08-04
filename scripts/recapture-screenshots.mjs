#!/usr/bin/env node
// Fully automated README screenshots. Drives the app's OWN Electron (Playwright
// `_electron`, exactly like the e2e suite — no bundled browser, no network),
// seeds a realistic library of snippets and saved/imported diffs, walks it
// through each state, and captures it. No manual clicks.
//
// Runs INSIDE the Docker container (Xvfb :99) via `make screenshots`, because
// Playwright's _electron can't launch Electron 39 on the macOS host (it passes
// --remote-debugging-port=0, which that build rejects). Linux Electron accepts
// it, so this is driven where the e2e suite already runs.
//
// Each shot is written to docs/screenshots/<name>.png (~1400px; the container's
// deviceScaleFactor is 1). A fresh throwaway --user-data-dir means the run never
// touches real vault/keys, and the demo .xlsx fixtures generated into tests/data
// are removed at the end.

import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'
import { makeXlsx } from './lib/makeXlsx.mjs'
import { SNIPPETS, savedDiffs, externalDiffs } from './lib/seedData.mjs'

/* global window -- referenced only inside page.evaluate, which runs in the renderer */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
const OUT = join(ROOT, 'docs/screenshots')
const DATA = join(ROOT, 'tests/data')

// Mirrors snippetStore's TAG_PALETTE (kept in sync by hand — it only drives the
// demo tag colors, nothing load-bearing).
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

// A .mmd pair for the Diagram view. Written to the temp fixture dir rather than
// committed: the frame is the artifact, the source is two lines of throwaway.
const MMD_A = join(DATA, 'pipeline-v1.mmd')
const MMD_B = join(DATA, 'pipeline-v2.mmd')
const MMD_BEFORE = `flowchart TD
  Ingest[Ingest] --> Validate{Valid?}
  Validate -- yes --> Transform[Transform]
  Validate -- no --> Reject[Reject]
  Transform --> Publish[Publish]`
const MMD_AFTER = `flowchart TD
  Ingest[Ingest] --> Validate{Valid?}
  Validate -- yes --> Enrich[Enrich]
  Enrich --> Transform[Transform]
  Validate -- no --> Quarantine[Quarantine]
  Transform --> Publish[Publish]`

const XLSX_A = join(DATA, 'budget-2024.xlsx')
const XLSX_B = join(DATA, 'budget-2025.xlsx')
const JSON_A = join(DATA, 'config-v1.json')
const JSON_B = join(DATA, 'config-v2.json')

function writeXlsxFixtures() {
  writeFileSync(
    XLSX_A,
    makeXlsx([
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
    ])
  )
  writeFileSync(
    XLSX_B,
    makeXlsx([
      {
        // The inserted column is the point of the shot: without one the
        // picture argues the diff still shifts everything after an insert.
        name: 'Summary',
        rows: [
          ['Metric', 'Q2', 'Q2 forecast', 'Q3'],
          ['Revenue', 1180, 1200, 1310],
          ['Costs', 640, 650, 690],
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
    ])
  )
}

// Encrypt every body through the real vault (main process) and write both store
// files, so a reload brings the app up already full of data.
async function seed(page) {
  const now = Date.now()
  await page.evaluate(
    async ({ snippets, diffs, palette }) => {
      const tags = {}
      let rank = 0
      const ensure = (names) => {
        const out = []
        for (const raw of names) {
          const n = String(raw).trim().toLowerCase().slice(0, 40)
          if (!n || out.includes(n) || out.length >= 20) continue
          if (!tags[n])
            tags[n] = { color: palette[Object.keys(tags).length % palette.length], rank: ++rank }
          else tags[n].rank = ++rank
          out.push(n)
        }
        return out
      }
      const fmtTag = (lang) => (lang && lang !== 'auto' && lang !== 'plaintext' ? lang : null)

      let t = Date.now()
      const snippetEntries = []
      for (const s of snippets) {
        const id = crypto.randomUUID()
        const aadSalt = crypto.randomUUID()
        const createdAt = t
        t -= 3 * 3600_000
        const box = await window.api.vaultEncrypt(s.content, [id, aadSalt, createdAt].join('|'))
        if (box?.error) throw new Error('vault key unavailable: ' + box.error)
        const ft = fmtTag(s.language)
        snippetEntries.push({
          id,
          aadSalt,
          name: s.name,
          createdAt,
          language: s.language,
          detected: s.language,
          favorite: !!s.favorite,
          tags: ensure(ft ? [ft, ...s.tags] : s.tags),
          iv: box.iv,
          data: box.data
        })
      }

      const vaultEntries = []
      for (const d of diffs) {
        const id = crypto.randomUUID()
        const from = d.from ?? null
        const box = await window.api.vaultEncrypt(
          JSON.stringify(d.payload),
          [id, d.createdAt, d.expiresAt, from ?? ''].join('|')
        )
        if (box?.error) throw new Error('vault key unavailable: ' + box.error)
        vaultEntries.push({
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

      await window.api.storeSave('snippets', JSON.stringify({ tags, entries: snippetEntries }))
      await window.api.storeSave('vault', JSON.stringify({ entries: vaultEntries }))
      await window.api.storeSave('theme', 'dark')
      // This runs on a throwaway profile, which is exactly what the onboarding
      // tour fires on — without this, every captured frame wears a scrim.
      await window.api.storeSave('onboarding', JSON.stringify({ showTips: false }))
    },
    { snippets: SNIPPETS, diffs: [...savedDiffs(now), ...externalDiffs(now)], palette: TAG_PALETTE }
  )
  await page.reload()
  await page.locator('.snippets-section .row').first().waitFor({ state: 'visible' })
  // Fail loudly rather than shipping a set of veiled frames that look plausible
  // in the terminal and wrong in the README.
  if (await page.locator('.tour').count()) {
    throw new Error('onboarding tour is showing — screenshots would be captured through its scrim')
  }
}

async function stubOpen(app, filePath) {
  await app.evaluate(({ dialog }, fp) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fp] })
  }, filePath)
}

async function loadPair(app, page, leftPath, rightPath) {
  await stubOpen(app, leftPath)
  await page.locator('.slot[data-side="left"]').click()
  await stubOpen(app, rightPath)
  await page.locator('.slot[data-side="right"]').click()
}

async function setTheme(page, label) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Settings', { exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Settings' })
  // By accessible name, not the tooltip attribute: tooltips moved from native
  // `title` to `data-tip` and silently broke this.
  await dlg.getByRole('button', { name: `Use the ${label} theme` }).click()
  await page.keyboard.press('Escape')
  await dlg.waitFor({ state: 'hidden' })
}

async function shoot(page, name, want) {
  if (want.size && !want.has(name)) return
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(`  → docs/screenshots/${name}.png`)
}

async function main() {
  if (!existsSync(MAIN)) {
    console.error(`Build missing (${MAIN}). Run 'npm run build' first.`)
    process.exit(1)
  }
  const want = new Set(process.argv.slice(2))
  writeXlsxFixtures()
  const userDataDir = mkdtempSync(join(tmpdir(), 'diffbro-shots-profile-'))
  const app = await electron.launch({ args: [MAIN, `--user-data-dir=${userDataDir}`] })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    console.log('Seeding demo library…')
    await seed(page)

    await shoot(page, 'empty-state', want)

    console.log('Loading JSON diff…')
    await loadPair(app, page, JSON_A, JSON_B)
    await page.locator('.status-band .add').waitFor({ state: 'visible' })
    await shoot(page, 'diff-dark', want)

    await setTheme(page, 'Light')
    await shoot(page, 'diff-light', want)
    await setTheme(page, 'Dark')

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('dialog', { name: 'Save diff' }).waitFor({ state: 'visible' })
    await shoot(page, 'save-encrypted', want)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    console.log('Loading spreadsheet diff…')
    await loadPair(app, page, XLSX_A, XLSX_B)
    await page.locator('.sheet-tabs').waitFor({ state: 'visible' })
    await shoot(page, 'spreadsheet-diff', want)

    console.log('Loading diagram diff…')
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    writeFileSync(MMD_A, MMD_BEFORE)
    writeFileSync(MMD_B, MMD_AFTER)
    await loadPair(app, page, MMD_A, MMD_B)
    await page.getByRole('checkbox', { name: /Diagram/i }).check()
    // Union view: one layout carrying both revisions is the thing worth showing.
    await page.getByRole('checkbox', { name: 'Split view' }).uncheck()
    await page.locator('.dg-stage svg').first().waitFor({ state: 'visible' })
    await page.waitForTimeout(1200)
    await shoot(page, 'diagram-diff', want)
  } finally {
    await app.close()
    for (const f of [XLSX_A, XLSX_B, MMD_A, MMD_B]) if (existsSync(f)) rmSync(f)
    rmSync(userDataDir, { recursive: true, force: true })
    console.log('Cleaned up fixtures and temp profile.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
