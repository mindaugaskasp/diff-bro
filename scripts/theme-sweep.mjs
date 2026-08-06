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
// A panel keyline is a separator, not a mark: --border sits at 1.11 against the
// panel on the quietest themes (check-theme-depth.mjs `border/panel`), and is a
// hard rule only on contrast and beacon. Holding it to DIM here would fail
// twelve themes for a line that is doing exactly its job.
const SEPARATOR = 1.11

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
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page
    .getByPlaceholder('Paste original text here')
    .fill('{\n  "a": 1,\n  "b": 2,\n  "gone": 3\n}')
  await page
    .getByPlaceholder('Paste changed text here')
    .fill('{\n  "a": 9,\n  "b": 2,\n  "added": 4\n}')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  // The display toggles live behind the View button now.
  await page
    .locator('.toolbar')
    .getByRole('button', { name: /^View\b/ })
    .click()
  await page.getByRole('checkbox', { name: 'Structure' }).check()
  await page.keyboard.press('Escape')
  await page.locator('.status-band').waitFor()
}

// Each surface: how to open it, and the pairs that carry meaning once open.
const SURFACES = [
  {
    name: 'tour-callout',
    // Summoned rather than waited for: the tour has usually been seen and
    // recorded by the time the sweep runs.
    open: async (page) => {
      await page.getByRole('button', { name: 'Help', exact: true }).click()
      await page.getByText('Show Tour', { exact: true }).click()
      await page.locator('.tour-callout').waitFor()
    },
    close: (page) => page.keyboard.press('Escape'),
    probes: {
      // The step counter reads as words, so it takes the reading floor — which
      // is what moved it off --text-dim (2.92 nord / 2.82 sepia on this face).
      'step counter': ['.tour-callout .tour-step-n', TEXT],
      'callout title': ['.tour-callout h6', TEXT],
      'callout body': ['.tour-callout .tour-body', TEXT],
      // The ring is the load-bearing cue on the seven dark themes, where the
      // scrim moves the ground by as little as 1.00 (beacon).
      'spotlight ring': ['.tour-ring', DIM]
    }
  },
  {
    name: 'tools-section',
    // Already on screen — Tools is a sidebar section, open by default. The third
    // row is hovered because the icon's --bg-hover state is the one that has no
    // resting equivalent to fall back on, and it is where sepia is tightest.
    open: async (page) => {
      const section = page.locator('.sidebar-section').filter({ hasText: 'Tools' })
      await section.locator('.row').first().waitFor()
      await section.locator('.row').first().locator('.star').click()
      await section.locator('.row').nth(2).hover()
    },
    close: async (page) => {
      const section = page.locator('.sidebar-section').filter({ hasText: 'Tools' })
      await section.locator('.row.pinned').first().locator('.star').click()
    },
    probes: {
      'tool name': ['.sidebar-section .row .nm', TEXT],
      // The trailing meta is read as a word, so it takes the reading floor.
      'tool kind': ['.sidebar-section .row .kind', TEXT],
      // Marks, not text: the star at rest and the pinned star both have to
      // register as a control against the panel.
      'star, resting': ['.sidebar-section .row:not(.pinned) .star', DIM],
      'star, pinned': ['.sidebar-section .row.pinned .star', DIM],
      'type badge': ['.sidebar-section .row .monogram', DIM],
      'row, hovered': ['.sidebar-section .row:hover .nm', TEXT],
      disclosure: ['.sidebar-section .disclosure .nm', TEXT]
    }
  },
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
    name: 'toolbar-actions',
    // Already on screen, and labelled: the row only drops to glyphs when it runs
    // out of room, which at this window size it does not.
    open: (page) => page.locator('.toolbar .group.actions .btn').first().waitFor(),
    close: async () => {},
    probes: {
      // The word and the plate's keyline together — an action that lost either
      // reads as disabled, which is the whole reason .btn carries three cues.
      'action, resting': ['.toolbar .group.actions .btn:not(:disabled)', TEXT],
      // The repo already holds this exact pair — --text-on-accent over --accent —
      // to 3.0 (check-theme-depth's `onAccent/accent`), so that contract is what
      // this probe enforces rather than a stricter one invented here. It sits
      // below the 4.5 reading floor on dark, solar and meridian; that is a
      // pre-existing app-wide decision about every primary button, not something
      // this surface introduced, and reopening it is its own spec.
      'action, primary': ['.toolbar .group.actions .btn-primary', 3.0],
      'action, disabled': ['.toolbar .group.actions .btn:disabled', DIM],
      // The View trigger sits in the same band and must read as the same control.
      'view trigger': ['.toolbar .anchor .btn', TEXT]
    }
  },
  {
    name: 'view-menu',
    // The panel this spec added: a surface that has to LIFT off the toolbar on
    // all 14, on a shadow that does not exist on seven of them.
    open: async (page) => {
      await page
        .locator('.toolbar')
        .getByRole('button', { name: /^View\b/ })
        .click()
      await page.locator('.popover').waitFor()
    },
    close: (page) => page.keyboard.press('Escape'),
    probes: {
      // --shadow-rgb is `0 0 0` on every dark theme, so on beacon, matrix and
      // neon this keyline is the ONLY thing separating the panel from the bar.
      'panel keyline': ['.popover', SEPARATOR],
      'row label': ['.popover-row:not(.off) .popover-line', TEXT],
      // The reason is read as a sentence, so it takes the reading floor — which
      // is why it is --text-hint and not --text-dim.
      'row reason': ['.popover-row .popover-why', TEXT],
      // Unavailable is a state, not text to read: --text-dim at the mark floor.
      'row, unavailable': ['.popover-row.off .popover-line', DIM],
      'trigger, open': ['.toolbar .anchor .btn.active', TEXT]
    }
  },
  {
    name: 'new-row',
    // The row a create just made. Its rail is a ::after, which querySelector
    // cannot reach, so the badge's keyline stands in for it: both are solid
    // --accent on --bg-panel, so one measurement holds the other's floor.
    // Waits past the 1.4s wash so what is measured is the state that STAYS,
    // not a frame of an animation.
    open: async (page) => {
      await page.getByRole('button', { name: 'New snippet' }).click()
      const editor = page.getByRole('dialog', { name: 'New Snippet' })
      await editor.getByPlaceholder('Snippet name…').fill('Theme sweep row')
      await editor.locator('.editor').click()
      await page.keyboard.type('sweep')
      await editor.getByRole('button', { name: 'Save', exact: true }).click()
      await page.getByRole('dialog', { name: 'Snippet', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.locator('.row.is-new .new-badge').waitFor()
      await page.waitForTimeout(1500)
    },
    // DELETE the row rather than merely retiring it. A sweep that leaves its
    // scratch snippet behind grows the sidebar by one per theme, and every other
    // surface's screenshot then differs from its baseline for no reason — which
    // is how one run dirtied 98 committed PNGs.
    close: async (page) => {
      const row = page.locator('.row.is-new')
      await row.hover()
      await row.getByRole('button', { name: 'Delete' }).click()
      const dialog = page.getByRole('dialog', { name: 'Delete snippet?' })
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      await page.locator('.row.is-new').waitFor({ state: 'detached' })
    },
    probes: {
      // The word is what identifies the row on dim and matrix, where --accent
      // and --favorite are 0.044 apart in OKLab — so it takes the reading floor.
      'badge label': ['.row.is-new .new-badge', TEXT],
      // The claim the whole design rests on: a solid --accent edge on the panel
      // clears the non-text floor on all 14 (weakest solar 3.21). Gated on the
      // BORDER channel, or it would be reported and never enforced.
      'badge keyline': ['.row.is-new .new-badge', DIM, 'border'],
      // The name must stay readable while the row wears the marker.
      'row name': ['.row.is-new .nm', TEXT]
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
    const [, floor, channel = 'text'] = surface.probes[what]
    findings.push({ theme, surface: surface.name, what, ...got, floor, channel })
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
  // Every profile here is cold, which is what the onboarding tour fires on, and
  // its tint takes the pointer for the whole window — the sweep never got past
  // its first click. The tour-callout surface below summons the tour itself, so
  // nothing is lost by starting without it. Same reason e2e/fixtures.mjs does it.
  writeFileSync(join(userDataDir, 'onboarding.json'), JSON.stringify({ showTips: false }))

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
        const got = hit[hit.channel]
        const mark = got == null || got < hit.floor ? ' ✗' : ''
        return `${String(got)}${mark}`.padEnd(17)
      })
      console.log(`  ${theme.toLowerCase().padEnd(10)}${cells.join('')}`)
    }
  }

  const failed = findings.filter((f) => f[f.channel] == null || f[f.channel] < f.floor)
  console.log('')
  if (!failed.length) {
    console.log(`✓ theme sweep ok — ${findings.length} measurements across ${THEMES.length} themes`)
    console.log(`  images: docs/screenshots/themes/`)
    return
  }
  console.log(`✗ theme sweep: ${failed.length} measurement(s) under floor:`)
  for (const f of failed) {
    console.log(`  ${f.theme} · ${f.surface} · ${f.what} — ${f[f.channel]} < ${f.floor}`)
  }
  process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
