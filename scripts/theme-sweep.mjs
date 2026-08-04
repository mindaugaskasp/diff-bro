#!/usr/bin/env node
// Walks a surface through all 14 themes and MEASURES it, rather than leaving a
// reviewer to eyeball fourteen pictures. For every theme it reads the COMPUTED
// colours off the live DOM and reports the contrast of each pair that carries
// meaning — which is the check docs/standards.md asks for ("assert the
// measurable thing — a bounding box, a computed style, a contrast ratio").
//
// check-theme-depth.mjs already holds the token-level floors. This is the other
// half: what a specific new surface actually renders once the tokens are
// composed, including the pairs a static scan cannot see (a label on a chip
// whose background is a color-mix, a disabled control, a scrolled list).
//
// Runs INSIDE the container via `make theme-sweep`, for the same reason as the
// screenshots: Playwright's _electron cannot launch this Electron on macOS.
//
// PNGs land in docs/screenshots/themes/<surface>-<theme>.png so a human can
// still look; the exit code is what gates.

import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateKeyPairSync } from 'node:crypto'
import { _electron as electron } from '@playwright/test'

/* global document, getComputedStyle -- inside page.evaluate only */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
const OUT = join(ROOT, 'docs/screenshots/themes')

const THEMES = [
  'Light',
  'Dark',
  'Solar',
  'Neon',
  'Nord',
  'Sepia',
  'Dim',
  'Beacon',
  'Meridian',
  'Linen',
  'Bloom',
  'Nyan',
  'Matrix',
  'Contrast'
]

// The floors the repo already runs on. Declared PER PROBE rather than guessed
// from the label: a regex over the probe name once matched "field label" to the
// non-text floor by accident, which is how a real failure would go quiet.
//   4.5 — anything the reader must read
//   3.0 — a keyline, an icon, and --text-dim micro-labels: check-theme-depth.mjs
//         pins `dim/panel` at 3.0 as a deliberate, ratcheted contract (line 134),
//         so holding this sweep to 4.5 there would contradict the repo's own gate
const TEXT = 4.5
const DIM = 3

// Measured in the renderer. Walks up for the first OPAQUE background and
// composites the translucent layers back down, because a chip on a card on a
// dialog is three layers deep and only the composite is what the eye sees.
// Passed as a function, never eval'd — rule 8.
function measureProbes(selectors) {
  // Chromium resolves color-mix() to `color(srgb 0.2 0.7 0.3)` — 0-1 floats —
  // rather than rgb() with 0-255 ints, by version. Reading those as 0-255 makes
  // every mixed colour look near-black, which is exactly the false failure this
  // sweep is meant not to produce. check-theme-depth.mjs handles both too.
  const parse = (s) => {
    const nums = (String(s).match(/[\d.]+/g) ?? []).map(Number)
    if (!/^color\(/.test(String(s).trim())) return nums
    return nums.map((n, i) => (i < 3 ? n * 255 : n))
  }
  const lum = ([r, g, b]) => {
    const f = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const over = (fg, bg) => {
    const a = fg.length > 3 ? fg[3] : 1
    return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a))
  }
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m)
    return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2))
  }
  const groundOf = (el) => {
    const stack = []
    let node = el
    while (node) {
      const p = parse(getComputedStyle(node).backgroundColor)
      if (p.length >= 3 && (p.length < 4 || p[3] > 0)) {
        if (p.length < 4 || p[3] > 0.99) {
          return stack.reduce((acc, layer) => over(layer, acc), p.slice(0, 3))
        }
        stack.push(p)
      }
      node = node.parentElement
    }
    return stack.reduce((acc, layer) => over(layer, acc), [255, 255, 255])
  }
  const measure = (selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const cs = getComputedStyle(el)
    const behind = groundOf(el.parentElement ?? el)
    const own = parse(cs.backgroundColor)
    const surface = own.length >= 3 && (own.length < 4 || own[3] > 0) ? over(own, behind) : behind
    const border = parse(cs.borderTopColor)
    return {
      text: ratio(over(parse(cs.color), surface), surface),
      border:
        border.length >= 3 && parseFloat(cs.borderTopWidth) > 0
          ? ratio(over(border, surface), surface)
          : null
    }
  }
  return Object.fromEntries(Object.entries(selectors).map(([k, sel]) => [k, measure(sel)]))
}

const realKey = () => ({
  sign: generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }),
  box: generateKeyPairSync('x25519').publicKey.export({ type: 'spki', format: 'pem' })
})

async function setTheme(page, label) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Settings', { exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Settings' })
  await dlg.getByRole('button', { name: `Use the ${label} theme` }).click()
  await page.keyboard.press('Escape')
  await dlg.waitFor({ state: 'hidden' })
}

// Leaves a structure diff on screen: its status band is the only one carrying
// all three counts (added / changed / removed) at once.
async function loadStructureDiff(page) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page
    .getByPlaceholder('Paste original text here')
    .fill('{\n  "a": 1,\n  "b": 2,\n  "gone": 3\n}')
  await page
    .getByPlaceholder('Paste changed text here')
    .fill('{\n  "a": 9,\n  "b": 2,\n  "added": 4\n}')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByText('Structure', { exact: true }).click()
  await page.locator('.status-band').waitFor()
}

// Each surface: how to open it, and the pairs that carry meaning once open.
const SURFACES = [
  {
    name: 'status-band',
    // Already on screen — the sweep leaves a structure diff loaded.
    open: async (page) => page.locator('.status-band').waitFor(),
    close: async () => {},
    probes: {
      // These carry the numbers a reader reads, so they take the reading floor —
      // which is what caught --dg-chg at 2.73 on light when they did not.
      'count, added': ['.status-band .add', TEXT],
      'count, changed': ['.status-band .chg', TEXT],
      'count, removed': ['.status-band .del', TEXT],
      'band label': ['.status-band', TEXT]
    }
  },
  {
    name: 'trusted-keys',
    open: async (page) => {
      await page.getByRole('button', { name: 'Security', exact: true }).click()
      await page.getByText('Manage Trusted Keys', { exact: true }).click()
      await page.getByRole('dialog', { name: 'Trusted keys' }).waitFor()
    },
    close: (page) => page.keyboard.press('Escape'),
    probes: {
      'row label': ['.key .label', TEXT],
      'row fingerprint': ['.key .fp', DIM],
      'address, set': ['.key .mail.set', TEXT],
      // A call to action, so it is held to the reading floor — which is what
      // moved it off --text-dim (3.44 on sepia) and onto --text-hint.
      'address, unset': ['.key .mail:not(.set)', TEXT],
      'search field': ['.field-search', TEXT],
      'filtered count': ['.keys-head .count', DIM]
    }
  },
  {
    name: 'settings-email',
    open: async (page) => {
      await page.getByRole('button', { name: 'File', exact: true }).click()
      await page.getByText('Settings', { exact: true }).click()
      const dlg = page.getByRole('dialog', { name: 'Settings' })
      await dlg.getByRole('button', { name: 'Email', exact: true }).click()
      await dlg.locator('.email-settings').waitFor()
    },
    close: (page) => page.keyboard.press('Escape'),
    probes: {
      // The app-wide micro-label idiom (TagChipsField.css does the same).
      'field label': ['.email-settings .field-label', DIM],
      'subject input': ['.email-settings input', TEXT],
      'advisory strip': ['.email-settings .hint', TEXT]
    }
  }
]

async function sweepSurface(page, surface, theme, findings) {
  await surface.open(page)
  await page.waitForTimeout(120)
  await page.screenshot({ path: join(OUT, `${surface.name}-${theme.toLowerCase()}.png`) })

  const selectors = Object.fromEntries(
    Object.entries(surface.probes).map(([what, [sel]]) => [what, sel])
  )
  const probe = await page.evaluate(measureProbes, selectors)

  for (const [what, got] of Object.entries(probe)) {
    if (!got) continue
    findings.push({ theme, surface: surface.name, what, ...got, floor: surface.probes[what][1] })
  }
  await surface.close(page)
  await page.waitForTimeout(80)
}

async function main() {
  if (!existsSync(MAIN)) {
    console.error(`Build missing (${MAIN}). Run 'npm run build' first.`)
    process.exit(1)
  }
  mkdirSync(OUT, { recursive: true })
  const userDataDir = mkdtempSync(join(tmpdir(), 'diffbro-sweep-'))
  const { fingerprint } = await import(pathToFileURL(join(ROOT, 'src/main/sealing.js')).href)
  // Seed the trust store on disk before launch — the manager reads it on open.
  const keys = [
    { label: 'Ana — work laptop', email: 'ana.petrauskas@example.com' },
    { label: 'Rūta — design', email: 'ruta@example.com' },
    { label: 'Tomas — build box' },
    ...Array.from({ length: 12 }, (_, i) => ({
      label: `Teammate ${String(i + 1).padStart(2, '0')}`,
      email: `teammate${i + 1}@example.com`
    }))
  ].map((k) => {
    const { sign, box } = realKey()
    return { ...k, sign, box, fingerprint: fingerprint(sign, box) }
  })
  writeFileSync(join(userDataDir, 'trusted-keys.json'), JSON.stringify(keys, null, 2))

  const app = await electron.launch({ args: [MAIN, `--user-data-dir=${userDataDir}`] })
  const findings = []
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(600)
    await loadStructureDiff(page)

    for (const theme of THEMES) {
      await setTheme(page, theme)
      for (const surface of SURFACES) await sweepSurface(page, surface, theme, findings)
      process.stdout.write(`  ${theme.padEnd(9)} ✓\n`)
    }
  } finally {
    await app.close()
  }

  report(findings)
}

function report(findings) {
  const surfaces = [...new Set(findings.map((f) => f.surface))]
  for (const surface of surfaces) {
    const rows = findings.filter((f) => f.surface === surface)
    const probes = [...new Set(rows.map((r) => r.what))]
    console.log(`\n${surface}`)
    console.log(`  ${'theme'.padEnd(10)}${probes.map((p) => p.slice(0, 15).padEnd(17)).join('')}`)
    for (const theme of THEMES) {
      const cells = probes.map((p) => {
        const hit = rows.find((r) => r.theme === theme && r.what === p)
        if (!hit) return '—'.padEnd(17)
        const mark = hit.text < hit.floor ? ' ✗' : ''
        return `${String(hit.text)}${mark}`.padEnd(17)
      })
      console.log(`  ${theme.toLowerCase().padEnd(10)}${cells.join('')}`)
    }
  }

  const failed = findings.filter((f) => f.text < f.floor)
  console.log('')
  if (!failed.length) {
    console.log(`✓ theme sweep ok — ${findings.length} measurements across ${THEMES.length} themes`)
    console.log(`  images: docs/screenshots/themes/`)
    return
  }
  console.log(`✗ theme sweep: ${failed.length} measurement(s) under floor:`)
  for (const f of failed) {
    console.log(`  ${f.theme} · ${f.surface} · ${f.what} — ${f.text} < ${f.floor}`)
  }
  process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
