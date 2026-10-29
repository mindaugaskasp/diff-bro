#!/usr/bin/env node
// Walks a surface through every theme and MEASURES it, rather than leaving a
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

import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { _electron as electron } from '@playwright/test'
import { THEMES as ALL_THEMES } from '../src/renderer/src/utils/themes.js'

/* global document, getComputedStyle -- inside page.evaluate only */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
// The app's OWN Electron, the way the launcher would reach it — process.execPath
// here is node, which would run the main bundle as a plain script.
const ELECTRON = createRequire(import.meta.url)('electron')

// The app's own list, so a new theme cannot ship unswept. Labels: the Settings
// buttons are named after them.
const THEMES = ALL_THEMES.map((t) => t.label)

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
// The resting-to-hovered face step; the bar is .btn's own shipped hover (1.16 on sepia).
const HOVER_STEP = 1.15

// Through the ≡ menu, the only in-window menu since #144.
async function pickMenuItem(page, top, label) {
  await page.locator('.menubar').getByRole('button', { name: 'Menu', exact: true }).click()
  await page.locator('.menubar > .dropdown > .submenu > .item', { hasText: top }).hover()
  await page.locator('.menubar .flyout').getByText(label, { exact: true }).click()
}

async function setOnboarding(page, state) {
  await page.evaluate((s) => globalThis.api.storeSave('onboarding', JSON.stringify(s)), state)
  await page.reload()
}

async function showPanel(page, panel) {
  if (panel === 'keys') {
    await page.locator('.menubar').getByRole('button', { name: 'Menu', exact: true }).click()
    await page.locator('.menubar > .dropdown > .submenu > .item', { hasText: 'Security' }).hover()
    await page.locator('.menubar .flyout > .submenu', { hasText: 'Trusted Keys' }).hover()
    await page.locator('.flyout .flyout').getByText('Manage Trusted Keys…', { exact: true }).click()
    return
  }
  const item = page.locator(`.sidebar-nav [data-value="${panel}"]`)
  if ((await item.getAttribute('aria-pressed')) !== 'true') await item.click()
}

// Measured in the renderer. Walks up for the first OPAQUE background and
// composites the translucent layers back down, because a chip on a card on a
// dialog is three layers deep and only the composite is what the eye sees.
// Passed as a function, never eval'd — rule 8.
function measureProbes({ selectors, baseline = {} }) {
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
  // An underline drawn as an inset box-shadow: its colour leads the computed value.
  const shadowColour = (cs) => parse(cs.boxShadow.match(/^(rgba?|color)\([^)]*\)/)?.[0] ?? '')
  const measure = (key, selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const cs = getComputedStyle(el)
    const behind = groundOf(el.parentElement ?? el)
    const own = parse(cs.backgroundColor)
    const surface = own.length >= 3 && (own.length < 4 || own[3] > 0) ? over(own, behind) : behind
    const against = (colour) => (colour.length >= 3 ? ratio(over(colour, surface), surface) : null)
    const hasBorder = parseFloat(cs.borderTopWidth) > 0
    return {
      text: ratio(over(parse(cs.color), surface), surface),
      border: against(hasBorder ? parse(cs.borderTopColor) : []),
      shadow: against(shadowColour(cs)),
      outline: against(cs.outlineStyle === 'none' ? [] : parse(cs.outlineColor)),
      face: surface,
      step: baseline[key] ? ratio(baseline[key], surface) : null
    }
  }
  return Object.fromEntries(Object.entries(selectors).map(([k, sel]) => [k, measure(k, sel)]))
}

const realKey = () => ({
  sign: generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }),
  box: generateKeyPairSync('x25519').publicKey.export({ type: 'spki', format: 'pem' })
})

async function closeSnippetTab(page) {
  await page.locator('.diff-tabs .tab.active .tab-close').click()
  const ask = page.getByRole('dialog', { name: 'Close snippet?' })
  const asked = await ask.waitFor({ timeout: 2000 }).then(
    () => true,
    () => false
  )
  if (asked) await ask.getByRole('button', { name: 'Close it' }).click()
  await page.getByRole('region', { name: 'New snippet' }).waitFor({ state: 'detached' })
}

async function setTheme(page, label) {
  await pickMenuItem(page, 'File', 'Settings…')
  const dlg = page.getByRole('dialog', { name: 'Settings', exact: true })
  await dlg.getByRole('button', { name: `Use the ${label} theme` }).click()
  const save = dlg.locator(':scope > .dialog-actions .btn-primary')
  if (await save.isEnabled()) await save.click()
  await page.keyboard.press('Escape')
  await dlg.waitFor({ state: 'hidden' })
}

// Leaves a structure diff on screen: its status band is the only one carrying
// all three counts (added / changed / removed) at once.
async function loadStructureDiff(page) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page
    .getByPlaceholder('Paste or type the original text')
    .fill('{\n  "a": 1,\n  "b": 2,\n  "gone": 3\n}')
  await page
    .getByPlaceholder('Paste or type the changed text')
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

// Any dialog the clear raised has to go too, or its backdrop swallows the
// clicks the NEXT surface makes and the sweep dies three surfaces later.
async function clearComparison(page) {
  const close = page.locator('.diff-tabs .tab.active .tab-close')
  if (await close.isVisible().catch(() => false)) {
    await close.click()
    const confirm = page.getByRole('dialog', { name: 'Close comparison?' })
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.getByRole('button', { name: 'Close it' }).click()
    }
  }
  const backdrop = page.locator('.dialog-backdrop')
  while (await backdrop.count()) {
    await page.keyboard.press('Escape')
    await backdrop.first().waitFor({ state: 'detached' })
  }
  await page.locator('.monaco-diff-editor, .waiting').waitFor({ state: 'detached' })
}

async function openWithFile(userDataDir, path) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  await new Promise((resolve) => {
    const child = spawn(ELECTRON, [MAIN, `--user-data-dir=${userDataDir}`, path], {
      env,
      stdio: 'ignore'
    })
    child.on('exit', resolve)
    setTimeout(resolve, 8000)
  })
}

let openedFiles = null
function openedFixtures() {
  if (openedFiles) return openedFiles
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-sweep-open-'))
  openedFiles = { dir, first: join(dir, 'config.yaml'), second: join(dir, 'config.prod.yaml') }
  writeFileSync(openedFiles.first, 'service:\n  port: 8080\n')
  writeFileSync(openedFiles.second, 'service:\n  port: 443\n')
  return openedFiles
}

async function closeOpenedTabs(page) {
  const opened = page.getByRole('region', { name: 'New snippet' })
  while (await opened.count()) {
    await page.locator('.diff-tabs .tab.active .tab-close').click()
    const ask = page.getByRole('dialog', { name: 'Close snippet?' })
    if (
      await ask.waitFor({ timeout: 1500 }).then(
        () => true,
        () => false
      )
    ) {
      await ask.getByRole('button', { name: 'Close it' }).click()
    }
    await page.waitForTimeout(150)
  }
}

// Each surface: how to open it, and the pairs that carry meaning once open.
const LOCKFILE = (version) =>
  JSON.stringify(
    {
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { vue: '^3.4.0' } },
        'node_modules/vue': { version, license: 'MIT' },
        'node_modules/@vue/shared': { version }
      }
    },
    null,
    2
  )

// The merge view has no entry point inside the app: it exists because git
// launched the tool. So the sweep makes a real conflict once and drives a real
// `git mergetool` at it for each theme, cancelling out again so the file — and
// the repo — are left exactly as git wrote them.
let conflicted = null

function mergeConflictRepo() {
  if (conflicted) return conflicted
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-sweep-merge-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const file = join(dir, 'config.yml')
  git('init', '-q', '-b', 'main')
  writeFileSync(file, 'service: diff-engine\nreplicas: 3\nregion: eu-west-1\nkeep: yes\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(file, 'service: diff-engine\nreplicas: 9\nregion: eu-west-1\nkeep: yes\n')
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  writeFileSync(file, 'service: diff-engine\nreplicas: 5\nregion: us-east-1\nkeep: yes\n')
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected: this is the conflict the surface is for.
  }
  conflicted = { dir, file }
  return conflicted
}

async function openMerge(page, userDataDir) {
  const { dir, file } = mergeConflictRepo()
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  await new Promise((resolve) => {
    const child = spawn(
      ELECTRON,
      [MAIN, `--user-data-dir=${userDataDir}`, 'mergetool', file, file, file],
      { cwd: dir, env, stdio: 'ignore' }
    )
    child.on('exit', resolve)
    setTimeout(resolve, 8000)
  })
  // The launcher window has been up by now, and the merge arrives through a
  // SECOND process whose focus() does not reliably raise the main window under
  // the container's window manager — leaving it occluded, producing no frames,
  // and hanging the screenshot rather than failing it.
  await page.bringToFront()
  await page.locator('.merge-view').waitFor({ timeout: 20000 })
  await page.locator('.merge-word-theirs').first().waitFor({ timeout: 10000 })
}

// A SECOND repository, with three text conflicts and one binary, so the
// conflicts list has a row in each of its three states to measure.
//
// A FRESH one per theme, unlike mergeConflictRepo's single cached tree: this
// surface ANSWERS a row to produce the settled state, and main keeps its
// resolved set per repository root — so a reused tree would open the second
// theme with that row already done and no button left to press.
const walked = []
function mergeWalkRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-sweep-walk-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const names = ['config.yml', 'deploy.yml', 'values.yml']
  const write = (name, replicas) =>
    writeFileSync(join(dir, name), `service: diff-engine\nreplicas: ${replicas}\n`)
  const blob = (byte) => writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, byte]))
  git('init', '-q', '-b', 'main')
  for (const name of names) write(name, 3)
  blob(1)
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  for (const name of names) write(name, 9)
  blob(2)
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  for (const name of names) write(name, 5)
  blob(3)
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected: this is the conflict the surface is for.
  }
  walked.push(dir)
  return { dir, file: join(dir, 'config.yml') }
}

async function openConflictList(page, userDataDir) {
  const { dir, file } = mergeWalkRepo()
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  await new Promise((resolve) => {
    const child = spawn(
      ELECTRON,
      [MAIN, `--user-data-dir=${userDataDir}`, 'mergetool', file, file, file],
      { cwd: dir, env, stdio: 'ignore' }
    )
    child.on('exit', resolve)
    setTimeout(resolve, 8000)
  })
  await page.bringToFront()
  await page.getByTestId('conflicts-dialog').waitFor({ timeout: 20000 })
  // One row settled, so the done ink has something to measure.
  await page.getByTestId('conflict-row-values.yml').hover()
  await page.getByTestId('conflict-theirs-values.yml').click()
  await page.locator('.cf-row.done').first().waitFor({ timeout: 10000 })
}

async function openClaudePane(page) {
  await pickMenuItem(page, 'File', 'Settings…')
  const dlg = page.getByRole('dialog', { name: 'Settings' })
  await dlg.getByRole('button', { name: 'Claude', exact: true }).click()
  return dlg
}

// Retried while the grant the pane just signed is still on its way to disk.
async function proposeOverMcp(userDataDir) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const call = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'propose_snippet',
      arguments: {
        name: 'Rollback',
        content: 'kubectl rollout undo',
        note: 'The inverse of the deploy'
      }
    }
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const child = spawn(
      ELECTRON,
      [MAIN, `--user-data-dir=${userDataDir}`, '--use-mock-keychain', 'mcp'],
      {
        env
      }
    )
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stdin.end(`${JSON.stringify(call)}\n`)
    await new Promise((resolve) => child.on('exit', resolve))
    if (out.includes('proposalId')) return
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error('diffbro mcp never accepted the proposal')
}

let claudeInboxSeeded = false
async function seedClaudeInbox(page, userDataDir) {
  if (claudeInboxSeeded) return
  const dlg = await openClaudePane(page)
  await dlg.getByLabel('Enable Claude MCP connection').check()
  await dlg.getByRole('alertdialog').getByRole('button', { name: 'Enable', exact: true }).click()
  await dlg.getByLabel('Offer new snippets').check()
  await page.keyboard.press('Escape')
  await dlg.waitFor({ state: 'detached' })
  await proposeOverMcp(userDataDir)
  claudeInboxSeeded = true
}

const SURFACES = [
  {
    name: 'snippet-inline-edit',
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
      const area = page.locator('.snippet-doc:visible .editor-area')
      await area.hover()
      await page.locator('.edit-cue').waitFor()
    },
    close: async (page) => {
      await page.mouse.move(0, 0)
      await page.locator('.diff-tabs .tab.active .tab-close').click()
      await page.locator('.edit-cue').waitFor({ state: 'detached' })
    },
    probes: {
      'click-to-edit cue': ['.edit-cue', TEXT],
      'cue keyline': ['.edit-cue', DIM, 'border'],
      'hover ring': ['.editor-area:not(.editing) .editor', DIM, 'outline'],
      'drop hint': ['.snippet-doc .drop-hint', TEXT],
      // Disabled here (nothing to format in this syntax): an inactive control, held to DIM.
      'format button (disabled)': ['.snippet-doc .editor-header .btn:disabled', DIM]
    }
  },
  {
    name: 'snippet-tag-chips',
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
      const doc = page.locator('.snippet-doc:visible')
      await doc.getByRole('button', { name: 'Add tag' }).click()
      await doc.locator('.tag-pop').waitFor()
    },
    close: async (page) => {
      // Nothing was changed, so its tab closes without asking.
      await page.locator('.diff-tabs .tab.active .tab-close').click()
      await page.locator('.tag-row').waitFor({ state: 'detached' })
    },
    probes: {
      'add input text': ['.snippet-doc .input-pill .taginput', TEXT],
      count: ['.tag-pop .cap', TEXT],
      suggestion: ['.tag-pop .sugg', TEXT],
      'input keyline': ['.snippet-doc .input-pill', DIM, 'border']
    }
  },
  {
    name: 'snippet-status-bar',
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
      await page.locator('.snippet-doc:visible .tt-trigger').hover()
      await page.locator('.tt-pop').waitFor()
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /^Close Example — Claude review/ }).click()
      await page.locator('.editor-status').waitFor({ state: 'detached' })
    },
    probes: {
      'status text': ['.snippet-doc .editor-status', TEXT],
      'zoom level': ['.snippet-doc .es-level', TEXT],
      'line number': ['.snippet-doc .editor .line-numbers', TEXT],
      'popover hint': ['.tt-pop .tt-hint', TEXT],
      'built-in tag': ['.tt-pop .tt-tag', TEXT],
      'built-in value': ['.tt-pop .tt-value', TEXT],
      'fill-in chip': ['.tt-pop .tt-chip', TEXT]
    }
  },
  {
    name: 'editor-text',
    open: async (page) => {
      await pickMenuItem(page, 'File', 'Settings…')
      const dlg = page.getByRole('dialog', { name: 'Settings' })
      await dlg.getByRole('button', { name: 'Appearance', exact: true }).click()
      await dlg.locator('.font-preview').scrollIntoViewIfNeeded()
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'detached' })
    },
    probes: {
      hint: ['.settings-appearance .hint', TEXT],
      'zoom level': ['.zoom-level', TEXT],
      'reset button': ['.zoom-controls .btn:not(.btn-icon)', TEXT],
      preview: ['.font-preview', TEXT]
    }
  },
  {
    name: 'snippet-history',
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
      const doc = page.locator('.snippet-doc:visible')
      const actions = page.locator('#toolbar-doc-actions')
      const history = actions.getByRole('button', { name: 'History', exact: true })
      if (!(await history.isVisible())) {
        await doc.locator('.editor').click()
        await page.keyboard.press('ControlOrMeta+End')
        await page.keyboard.type(' ')
        await actions.getByRole('button', { name: 'Save', exact: true }).click()
      }
      await history.click()
      await page.locator('.hist-version').last().click()
      await page.locator('.hist-band .btn').first().waitFor()
    },
    close: async (page) => {
      await page.getByRole('button', { name: /^Close Example — Claude review/ }).click()
      await page.locator('.hist-panel').waitFor({ state: 'detached' })
    },
    probes: {
      'version label': ['.hist-version .hv-when', TEXT],
      'version time': ['.hist-version .hv-meta', TEXT],
      'selected version': ['.hist-version.on .hv-when', TEXT],
      'band text': ['.hist-band .hb-text', TEXT],
      'band meta': ['.hist-band .hb-meta', TEXT],
      'copy button': ['.hist-band .btn', TEXT],
      'lines added': ['.hist-band .hb-stats .add', TEXT],
      'lines removed': ['.hist-band .hb-stats .del', TEXT]
    }
  },
  {
    name: 'tour-consent',
    // Only a cold profile asks, so the sweep makes this one cold and reloads.
    open: async (page) => {
      await setOnboarding(page, { showTips: true, tourStep: 0, layout: 2 })
      await page.getByRole('dialog', { name: 'Take a one-minute tour?' }).waitFor()
    },
    close: async (page) => {
      await setOnboarding(page, { showTips: false, layout: 2 })
      await page.locator('[data-tour="slots"]').waitFor()
    },
    probes: {
      intro: ['.dialog .dialog-note', TEXT],
      topic: ['.tour-topics li', TEXT],
      'topic glyph': ['.tour-topics .glyph-well', TEXT],
      'start later': ['.tour-later', TEXT],
      'no thanks': ['.dialog .btn-ghost', TEXT]
    }
  },
  {
    name: 'update-notice',
    open: async (page, { app }) => {
      await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows())
          win.webContents.send('app:updated', '9.9.9')
      })
      await page.locator('.update-notice').waitFor()
    },
    close: async (page) => {
      await page.getByRole('button', { name: 'Dismiss the update notice' }).click()
      await page.locator('.update-notice').waitFor({ state: 'detached' })
    },
    probes: {
      message: ['.update-notice .un-text', TEXT],
      restart: ['.update-notice .btn', TEXT],
      icon: ['.update-notice .un-icon', DIM, 'text'],
      keyline: ['.update-notice', SEPARATOR, 'border']
    }
  },
  {
    name: 'conflict-list',
    // The row's three status inks are NEW roles (--mg-open / --mg-done /
    // --mg-blocked) and each is a WORD, so every one answers to the reading
    // floor rather than the 3:1 the --dg-* roles it derives from carry.
    open: (page, { userDataDir }) => openConflictList(page, userDataDir),
    // The whole merge, not just the dialog: closing the list marks it put away
    // for the rest of the walk, so a theme that left one open would find no
    // dialog on the next launch. Cancelling ends the walk and resets that.
    close: async (page) => {
      await page.getByTestId('conflicts-close').click()
      await page.getByTestId('conflicts-dialog').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.locator('.merge-view').waitFor({ state: 'detached' })
    },
    probes: {
      'file name': ['.cf-row.open .cf-name', TEXT],
      // The directory gives way first, but it is still read: --text-hint, never
      // --text-dim, which falls to 2.96 on a hovered row.
      directory: ['.cf-row.open .cf-dir', TEXT],
      'still to answer': ['.cf-row.open .cf-state', TEXT],
      answered: ['.cf-row.done .cf-state', TEXT],
      'cannot be opened': ['.cf-row.blocked .cf-state', TEXT],
      'files and progress': ['.cf-tally', TEXT]
    }
  },
  {
    name: 'merge-view',
    // The chrome only. The bands and the intra-line tints inside the panes are
    // Monaco decorations built from --dg-add / --dg-del / --dg-chg alone, and
    // check-theme-depth already holds those three to a contrast floor AND a
    // pairwise deltaE floor on every theme — measuring an overlay div that
    // carries no text of its own would report a number nothing depends on.
    open: (page, { userDataDir }) => openMerge(page, userDataDir),
    close: async (page) => {
      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.locator('.merge-view').waitFor({ state: 'detached' })
    },
    probes: {
      'pane label': ['.merge-pane.result .merge-head', TEXT],
      // The branch a side comes from: words a reader reads, so the reading floor
      // and not the hint one.
      'branch name': ['.merge-rev', TEXT],
      'conflicts left': ['.merge-count', TEXT],
      'file name': ['.merge-file', TEXT],
      "result pane's own head": ['.merge-pane.result .merge-hint', TEXT]
    }
  },
  {
    name: 'deps-diff',
    // Reached through PASTE mode, because a lockfile is recognised by its NAME
    // and paste lets a side be named. Three inks a table cannot settle: the two
    // versions are text at the reading floor (the raw --dg-* roles are 3:1
    // non-text and fell to 1.80 on nord), and the row's status keyline is the
    // only thing separating a bump from an addition.
    open: async (page) => {
      await page.getByRole('button', { name: 'Paste mode' }).click()
      const names = page.getByPlaceholder('Name this side')
      await names.first().fill('package-lock.json')
      await names.nth(1).fill('package-lock.json')
      await page.getByPlaceholder('Paste or type the original text').fill(LOCKFILE('3.4.21'))
      await page.getByPlaceholder('Paste or type the changed text').fill(LOCKFILE('3.5.13'))
      await page.getByRole('button', { name: 'Compare', exact: true }).click()
      await page.locator('.deps-row').first().waitFor()
    },
    close: clearComparison,
    probes: {
      'package name': ['.deps-name', TEXT],
      'old version': ['.deps-move .del', TEXT],
      'new version': ['.deps-move .add', TEXT],
      'asked-for tag': ['.deps-tag', DIM]
    }
  },
  {
    name: 'launcher-compose',
    window: 'launcher',
    // The launcher card is --bg-panel over a transparent window, a ground the
    // main window never presents. Its compose panel carries three inks the
    // theme table cannot settle on its own: the language pill, the syntax runs
    // in the body overlay, and the name ghost.
    open: async (page) => {
      await page.keyboard.press('ControlOrMeta+n')
      await page.locator('.ql-compose').waitFor()
      await page.locator('.ql-compose-name').fill('Exam')
      await page.locator('.ql-compose-text').fill('SELECT id FROM orders;')
      await page.locator('.ql-compose-hl .syn-keyword').first().waitFor()
    },
    close: (page) => page.keyboard.press('Escape'),
    probes: {
      'compose title': ['.ql-compose-title', TEXT],
      'language pill label': ['.ql-compose-lang', TEXT],
      'body keyword': ['.ql-compose-hl .syn-keyword', TEXT],
      'name ghost': ['.name-ghost', DIM]
    }
  },
  {
    name: 'snippet-name-ghost',
    // The inline name completion. Its ink is the one thing a computed-contrast
    // table cannot settle: the ghost has to read as clearly SECONDARY to the
    // typed text while staying legible, and that is a live-DOM judgement.
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.getByRole('button', { name: 'New snippet', exact: true }).click()
      const editor = page.getByRole('region', { name: 'New snippet' })
      await editor.getByPlaceholder('Snippet name…').fill('Exam')
      await editor.locator('.name-ghost').waitFor()
    },
    close: closeSnippetTab,
    probes: {
      'typed name': ['.ghost-field input', TEXT],
      // Hint ink, so the 3:1 floor --text-dim already carries elsewhere.
      'name ghost': ['.name-ghost', DIM]
    }
  },
  {
    name: 'snippet-head-row',
    // Applied tag labels are oklch(), which this parser cannot read; check:themes holds them.
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.getByRole('button', { name: 'New snippet', exact: true }).click()
      const doc = page.getByRole('region', { name: 'New snippet' })
      await doc.getByPlaceholder('Snippet name…').fill('Standup {{today}}')
      const input = doc.getByRole('textbox', { name: 'Add tag' })
      for (const tag of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']) {
        await input.fill(`${tag}-sweep-tag`)
        await input.press('Enter')
      }
      await doc.locator('.more-chip').click()
      await page.locator('.tag-more-pop').waitFor()
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await closeSnippetTab(page)
    },
    probes: {
      'saves-as hint': ['.name-templates .preview', DIM],
      '+N label': ['.more-chip', TEXT],
      '+N keyline': ['.more-chip', DIM, 'border']
    }
  },
  {
    name: 'rendered-editor',
    // The rendered view with a caret in it. caret-color is pinned to --text, so
    // the root's text ratio IS the caret's. The task box is the one pair no
    // computed check can settle (accent-color hands the tick to the UA).
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.getByRole('button', { name: 'New snippet', exact: true }).click()
      const editor = page.getByRole('region', { name: 'New snippet' })
      await editor.getByPlaceholder('Snippet name…').fill('Rendered')
      await editor.locator('.lang-picker select').selectOption('markdown')
      await editor.locator('.editor').click()
      // Both box states: accent-color only paints once a box is TICKED.
      await page.keyboard.type(
        '# Heading\n\nBody with **bold**.\n\n- [x] done\n- [ ] a task\n\n> quoted'
      )
      await page.getByRole('button', { name: 'Rendered', exact: true }).click()
      await page.locator('.rendered-editor').waitFor()
    },
    close: closeSnippetTab,
    probes: {
      // The editing surface's own ink, and so the caret's.
      'editable body': ['.rendered-editor', TEXT],
      heading: ['.rendered-editor .ji-h', TEXT],
      // Quote ink gives way deliberately, so it answers to the 3:1 floor.
      quoted: ['.rendered-editor .ji-quote', DIM],
      'task label': ['.rendered-editor .ji-task', TEXT]
    }
  },
  {
    name: 'tour-callout',
    // Summoned rather than waited for: the tour has usually been seen and
    // recorded by the time the sweep runs.
    open: async (page) => {
      await pickMenuItem(page, 'Help', 'Show Tour')
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
    name: 'sidebar-home',
    open: async (page) => {
      await showPanel(page, 'home')
      await page.locator('.home-row').first().waitFor()
      await page.locator('.home-item').first().hover()
    },
    close: async () => {},
    probes: {
      'segment glyph': ['.sidebar-nav .seg-opt:not(.on)', DIM],
      'segment glyph, open': ['.sidebar-nav .seg-opt.on', DIM],
      'edge handle, hovered': ['.sidebar-handle', DIM, 'text', 'hover'],
      'day label': ['.home-day', TEXT],
      'recent name': ['.home-row .row-2-name', TEXT],
      'recent meta': ['.home-row .row-2-meta', TEXT],
      'glyph on its well': ['.home-row .glyph-well', TEXT],
      'delete, shown': ['.home-item:hover .home-delete', DIM]
    }
  },
  {
    name: 'presentation-exit',
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
      await page.getByTestId('toolbar-present').click()
      await page.locator('.present-exit').waitFor()
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await page.locator('.present-exit').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: /^Close Example — Claude review/ }).click()
    },
    probes: {
      'exit label at rest': ['.present-exit', TEXT]
    }
  },
  {
    name: 'diffs-switch',
    open: async (page) => {
      await showPanel(page, 'diffs')
      await page.locator('.whose-opt.on').waitFor()
    },
    close: async () => {},
    probes: {
      'chosen label': ['.whose-opt.on', TEXT],
      'other label': ['.whose-opt:not(.on)', TEXT],
      'chosen underline': ['.whose-opt.on', DIM, 'shadow'],
      'count on the chosen': ['.whose-opt.on .count-chip', TEXT],
      'count on the other': ['.whose-opt:not(.on) .count-chip', TEXT],
      'toggle wash, hovered': ['.whose-opt:not(.on)', HOVER_STEP, 'step', 'hover'],
      'toggle label, hovered': ['.whose-opt:not(.on)', TEXT, 'text', 'hover']
    }
  },
  {
    name: 'sidebar-tools',
    // A tile edge is a separator, not the affordance: the well, card and lift are.
    open: async (page) => {
      await showPanel(page, 'tools')
      const cell = page.locator('.tt-cell').first()
      await cell.hover()
      await cell.locator('.tt-pin').click()
      await page.locator('.tt-cell').nth(2).hover()
    },
    close: async (page) => {
      await page.locator('.tt-pin.on').first().click()
      await showPanel(page, 'home')
    },
    probes: {
      'tool name': ['.tt-tile .tt-name', TEXT],
      'group label': ['.tt-head', TEXT],
      'glyph on its well': ['.tt-tile .glyph-well', TEXT],
      'star, pinned': ['.tt-pin.on', DIM],
      'tile face, hovered': ['.tt-tile', HOVER_STEP, 'step', 'hover'],
      'tile edge, hovered': ['.tt-tile', DIM, 'border', 'hover'],
      'Pinned group star': ['.tt-star', DIM],
      'tile edge': ['.tt-tile', SEPARATOR, 'border']
    }
  },
  {
    name: 'snippet-more',
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
      await page
        .locator('#toolbar-doc-actions')
        .getByRole('button', { name: 'More snippet actions' })
        .click()
      await page.locator('.ctx').waitFor()
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /^Close Example — Claude review/ }).click()
    },
    probes: {
      'menu item': ['.ctx .ctx-item', TEXT],
      'shortcut hint': ['.ctx .ctx-keys', TEXT],
      'menu keyline': ['.ctx', SEPARATOR, 'border']
    }
  },
  {
    name: 'diff-row-more',
    open: async (page) => {
      await page.locator('.diff-tabs .add').click()
      await page.getByRole('button', { name: 'Paste mode' }).click()
      await page.getByPlaceholder('Paste or type the original text').fill('before')
      await page.getByPlaceholder('Paste or type the changed text').fill('after')
      await page.getByRole('button', { name: 'Compare', exact: true }).click()
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      const save = page.getByRole('dialog', { name: 'Save diff' })
      await save.getByLabel('Name', { exact: true }).fill('Sweep more menu')
      await save.getByRole('button', { name: 'Save', exact: true }).click()
      await showPanel(page, 'diffs')
      const row = page.locator('li.diff', { hasText: 'Sweep more menu' })
      await row.hover()
      await row.getByRole('button', { name: 'More actions' }).click()
      await page.locator('.ctx').waitFor()
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      const row = page.locator('li.diff', { hasText: 'Sweep more menu' })
      await row.hover()
      await row.getByRole('button', { name: 'Delete now' }).click()
      const ask = page.getByRole('dialog').filter({ hasText: 'Sweep more menu' })
      await ask.getByRole('button', { name: /^Delete/ }).click()
      await row.waitFor({ state: 'detached' })
      await clearComparison(page)
    },
    probes: {
      'menu item': ['.ctx .ctx-item', TEXT],
      'menu keyline': ['.ctx', SEPARATOR, 'border']
    }
  },
  {
    name: 'start-surface',
    open: async (page) => {
      const plus = page.locator('.diff-tabs .add')
      if ((await plus.getAttribute('aria-pressed')) !== 'true') await plus.click()
      await page.locator('.start-card').first().waitFor()
    },
    close: async () => {},
    probes: {
      heading: ['.start-head h2', TEXT],
      subtitle: ['.start-head .meta', TEXT],
      'card title': ['.start-card .card-title', TEXT],
      'card text': ['.start-card .meta', TEXT],
      'glyph on its well': ['.start-card .glyph-well', TEXT],
      'key hint': ['.start-card .ql-kbd', TEXT],
      format: ['.start-formats .format', TEXT]
    }
  },
  {
    name: 'snippet-tab',
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.locator('.snippets-section .row .entry').first().click()
      await page.locator('.snippet-doc:visible').waitFor()
    },
    close: async (page) => {
      await page.locator('.diff-tabs .tab.active .tab-close').click()
      await showPanel(page, 'home')
    },
    probes: {
      'tab name': ['.diff-tabs .tab.active .name', TEXT],
      'tab kind glyph': ['.diff-tabs .tab.active .kind', DIM],
      'snippet name': ['.snippet-doc .doc-name input', TEXT],
      'editor header': ['.snippet-doc .editor-header', TEXT]
    }
  },
  {
    name: 'keys-panel',
    open: async (page) => {
      await showPanel(page, 'keys')
      await page.locator('.keys-panel .key-card').waitFor()
    },
    close: (page) => showPanel(page, 'home'),
    probes: {
      'key title': ['.keys-panel .key-title', TEXT],
      fingerprint: ['.keys-panel .key-fp', TEXT],
      heading: ['.keys-panel h3', TEXT],
      'guide step': ['.keys-panel .steps li', TEXT],
      'step number': ['.keys-panel .num', TEXT]
    }
  },
  {
    name: 'claude-settings',
    open: async (page) => {
      const dlg = await openClaudePane(page)
      const master = dlg.getByLabel('Enable Claude MCP connection')
      if (await master.isChecked()) await master.uncheck()
      await master.check()
      await dlg.getByRole('alertdialog').waitFor()
    },
    close: async (page) => {
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'detached' })
    },
    probes: {
      intro: ['.claude-settings .dialog-note', TEXT],
      'checkbox label': ['.claude-settings .setting-toggle span', TEXT],
      'warning title': ['.claude-warning-title', TEXT],
      'warning text': ['.claude-warning li', TEXT]
    }
  },
  {
    name: 'claude-connect',
    open: async (page) => {
      const dlg = await openClaudePane(page)
      const master = dlg.getByLabel('Enable Claude MCP connection')
      if (!(await master.isChecked())) {
        await master.check()
        await dlg
          .getByRole('alertdialog')
          .getByRole('button', { name: 'Enable', exact: true })
          .click()
      }
      await dlg.locator('.app-row').first().waitFor()
    },
    close: async (page) => {
      await page.getByLabel('Enable Claude MCP connection').uncheck()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'detached' })
    },
    probes: {
      'app name': ['.app-row .app-name', TEXT],
      'app status': ['.app-row .app-status', TEXT],
      'manual heading': ['.setup-manual', TEXT],
      command: ['.setup-block code', TEXT]
    }
  },
  {
    name: 'claude-inbox',
    open: async (page, { userDataDir }) => {
      await seedClaudeInbox(page, userDataDir)
      await showPanel(page, 'home')
      await page.locator('.inbox-item').first().waitFor()
    },
    close: async () => {},
    probes: {
      'proposal name': ['.inbox-item .row-2-name', TEXT],
      'proposal meta': ['.inbox-item .row-2-meta', TEXT],
      'proposal note': ['.inbox-note', TEXT],
      'glyph on its well': ['.inbox-item .glyph-well', TEXT]
    }
  },
  {
    name: 'status-band',
    // The startup diff is gone by now: deps-diff runs first and its close is a
    // Clear. Reload rather than assume — assuming is what left this surface
    // timing out on every run since deps-diff was added.
    open: async (page) => {
      if (!(await page.locator('.status-band').count())) await loadStructureDiff(page)
      await page.locator('.status-band').waitFor()
    },
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
      // A plain .btn is its label, so the label carries the affordance at rest.
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
    name: 'toolbar-snippet-actions',
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
      await page.locator('#toolbar-doc-actions .btn-primary').waitFor()
    },
    close: async (page) => {
      await page.getByRole('button', { name: /^Close Example — Claude review/ }).click()
      await page.locator('#toolbar-doc-actions .btn').first().waitFor({ state: 'detached' })
    },
    probes: {
      'action, resting': ['#toolbar-doc-actions .btn:not(:disabled):not(.btn-primary)', TEXT],
      'save, nothing to save': ['#toolbar-doc-actions .btn-primary:disabled', DIM]
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
    // Waits past the 4s wash so what is measured is the state that STAYS, not a
    // frame of an animation.
    open: async (page) => {
      await showPanel(page, 'snippets')
      await page.getByRole('button', { name: 'New snippet', exact: true }).click()
      const editor = page.getByRole('region', { name: 'New snippet' })
      await editor.getByPlaceholder('Snippet name…').fill('Theme sweep row')
      await editor.locator('.editor').click()
      await page.keyboard.type('sweep')
      await page
        .locator('#toolbar-doc-actions')
        .getByRole('button', { name: 'Save', exact: true })
        .click()
      await page.locator('.row.is-new .new-badge').waitFor()
      await page.waitForTimeout(4200)
    },
    // Delete, not retire: a leftover row shifts every later surface.
    close: async (page) => {
      await page.locator('.diff-tabs .tab.active .tab-close').click()
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
    name: 'settings-email',
    open: async (page) => {
      await pickMenuItem(page, 'File', 'Settings…')
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
  },
  {
    name: 'settings-appearance',
    // The theme picker. Its numbers were a table in a proposal; this is what
    // re-measures them. The tile label is --text on --bg-raised, the group
    // subhead --text-dim, and the selected ring --accent — solar is the
    // weakest of the fourteen at 3.52, which is why selection also thickens
    // the label rather than trusting colour alone.
    open: async (page) => {
      await pickMenuItem(page, 'File', 'Settings…')
      await page.getByRole('dialog', { name: 'Settings' }).waitFor()
      await page.locator('.settings-nav .nav-item', { hasText: 'Appearance' }).click()
      await page.locator('.theme-tile.active').waitFor()
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
    },
    probes: {
      'tile label': ['.theme-tile .tile-name', TEXT],
      'group subhead': ['.group-label', DIM],
      'selected tile ring': ['.theme-tile.active', DIM, 'border'],
      // The claim the redesign rests on: a RESTING cell has an edge. Nothing
      // measured it, and on 12 of the 14 it did not.
      'resting tile edge': ['.theme-tile:not(.active)', DIM, 'border']
    }
  },
  {
    name: 'sidebar-affordances',
    // The section header's "+" and the empty-section CTA. The "+" inherited
    // .btn-icon's flat ROW treatment and scored 2.82 on sepia against the
    // header band — an e2e runs in ONE theme, so `not.toBe(rowInk)` could never
    // have caught it. This is where that number gets checked on all 14.
    open: async (page) => {
      await showPanel(page, 'diffs')
      await page.locator('.actions-slot .btn-icon').first().waitFor()
      await page.locator('.empty-cta .btn-primary').first().waitFor()
    },
    close: async () => {},
    probes: {
      'section add button': ['.actions-slot .btn-icon', DIM],
      // 3, not 4.5: this is `.btn-primary`'s label on `--accent`, which
      // check-theme-depth already holds app-wide at 3 (`onAccent/accent`).
      // Measured here it is 3.58 (solar) / 3.75 (dark) / 4.18 (meridian) — an
      // app-wide property of the primary button, not of this CTA.
      'empty-section CTA label': ['.empty-cta .btn-primary', DIM],
      'empty-section prompt': ['.empty-cta p', DIM]
    }
  },
  {
    name: 'snippet-colour',
    // A colour the reader picked, painted across the row, plus the popover that
    // sets it. Both are composed rather than tokenised — the row's ground is the
    // picked ink re-lightened to --tag-l and mixed 16% into the panel, so no
    // static scan can know what it lands on. The row's meta ink is the reason
    // this surface exists: at --text-dim it falls under the 3.0 floor on nord
    // (2.97) and sepia (2.72), which is why the coloured row steps to
    // --text-hint and why that step is measured here on all twenty.
    open: async (page) => {
      await showPanel(page, 'snippets')
      const row = page.locator('.snippets-section .row').first()
      await row.waitFor()
      await row.click({ button: 'right' })
      await page.locator('.rcm').waitFor()
      // Teal: the darkest of the six once re-lightened on a light ground, so the
      // wash it makes is the worst case the name has to stay readable on.
      await page.locator('.rcm [data-color="teal"]').click()
      await page.locator('.rcm').waitFor({ state: 'detached' })
      await page.locator('.row[data-color]').first().waitFor()
      // Reopened, so the menu's own inks are on screen to measure with it.
      await row.click({ button: 'right' })
      await page.locator('.rcm').waitFor()
      await page.locator('.rcm [data-color="rose"]').hover()
    },
    // Put the library back the way the rest of the walk expects it.
    close: async (page) => {
      await page.locator('.rcm [data-color="none"]').click()
      await page.locator('.rcm').waitFor({ state: 'detached' })
    },
    probes: {
      'name on a coloured row': ['.row[data-color] .nm', TEXT],
      'menu label': ['.rcm-hd', DIM],
      // The card the popover floats on, and the keyline that separates it from
      // whatever it covers.
      'menu keyline': ['.rcm', SEPARATOR, 'border'],
      // The cursor's mark: an accent keyline is the only thing saying which
      // target a keypress would take.
      'cursor keyline': ['.rcm-sw.hot', DIM, 'border']
    }
  },
  {
    name: 'waiting-for-second',
    // Synthesized DragEvents, not a mouse path: Chromium will not begin a
    // native HTML5 drag from injected pointer input.
    open: async (page) => {
      // The pane may already hold a comparison (a persisted session, or a
      // previous surface): dropping into a full one gives a diff, not a wait.
      await clearComparison(page)
      await showPanel(page, 'snippets')
      await page.locator('.snippets-section .row[draggable="true"]').first().waitFor()
      /* global DataTransfer, DragEvent -- this body runs in the renderer */
      await page.evaluate(() => {
        const row = document.querySelector('.snippets-section .row[draggable="true"]')
        const dt = new DataTransfer()
        row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
        const slot = document.querySelector('.slot[data-side="left"]')
        slot.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
        slot.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
      })
      await page.locator('.waiting').waitFor()
    },
    // The sweep leaves ONE structure diff loaded for every later surface to
    // read; this is the only surface that has to disturb it, so it puts it back.
    close: async (page) => {
      await clearComparison(page)
      await loadStructureDiff(page)
    },
    probes: {
      'waiting slot label': ['.wait-slot.open .wait-label', TEXT],
      'waiting title': ['.wait-slot.open .wait-title', TEXT],
      'waiting hint': ['.wait-hint', DIM]
    }
  },
  {
    name: 'tool-dialog',
    // The description line is the one sentence a first-time user gets before
    // the input box. It is a read sentence, so it takes the reading floor —
    // --text-hint on the dialog panel, the pair the tokens alone cannot prove.
    open: async (page) => {
      await page.locator('.menubar').getByRole('button', { name: 'Menu', exact: true }).click()
      await page.locator('.menubar > .dropdown > .submenu > .item', { hasText: 'Tools' }).hover()
      await page.locator('.menubar .flyout > .submenu', { hasText: 'Format' }).hover()
      // Scoped to the flyout: the loaded diff can also say "JSON".
      await page.locator('.flyout .flyout').getByText('JSON', { exact: true }).click()
      await page.locator('.tt-desc').waitFor()
      await page.getByRole('dialog', { name: 'JSON' }).getByRole('textbox').first().fill('{"a":1}')
    },
    close: (page) => page.keyboard.press('Escape'),
    probes: {
      'tool description': ['.tt-desc', TEXT],
      'segment wash, hovered': ['.dialog .seg-opt:not(.on)', HOVER_STEP, 'step', 'hover'],
      'segment label, hovered': ['.dialog .seg-opt:not(.on)', TEXT, 'text', 'hover'],
      'input key': ['.tjs-in-field .syn-property', TEXT],
      'output key': ['.tjs-text .syn-property', TEXT],
      'output number': ['.tjs-text .syn-number', TEXT]
    }
  },
  {
    name: 'open-with-prompt',
    open: async (page, { userDataDir }) => {
      const files = openedFixtures()
      await openWithFile(userDataDir, files.first)
      await page.bringToFront()
      await page.locator('.es-opened').waitFor({ timeout: 20000 })
      await openWithFile(userDataDir, files.second)
      await page.getByRole('dialog', { name: /^Compare with/ }).waitFor({ timeout: 20000 })
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: /^Compare with/ }).waitFor({ state: 'detached' })
      await closeOpenedTabs(page)
    },
    probes: {
      'opened-from line': ['.es-opened', TEXT],
      'prompt sentence': ['.dialog-note', TEXT],
      'side label': ['.owp-label', TEXT],
      'side name': ['.owp-name', TEXT],
      'side keyline': ['.owp-side', SEPARATOR, 'border']
    }
  }
]

// The launcher is a SECOND BrowserWindow with its own card surface, and no
// surface here ever opened it — so its compose panel, body overlay and name
// ghost were only ever measured against the main window's ground.
// Asked of MAIN, not of the page: a hidden BrowserWindow keeps reporting its
// document as visible, so only the window itself knows.
const launcherShown = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => w.webContents.getURL().includes('quicklook') && w.isVisible()
    )
  )

async function launcherPage(app, page) {
  const open = app.windows().find((w) => w.url().includes('quicklook'))
  // The launcher hides itself whenever something else takes focus — which the
  // merge does, arriving in the main window from a second process. A hidden
  // window produces no frames, so screenshotting it HANGS rather than fails.
  if (open && !(await launcherShown(app))) {
    await page.evaluate(() => globalThis.api.quickLookToggle())
    for (let i = 0; i < 50 && !(await launcherShown(app)); i++) await page.waitForTimeout(100)
  }
  if (open) return open
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => globalThis.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await ql.waitForTimeout(200)
  return ql
}

// A named subset while a new surface is being built: the full walk is 20 themes
// across every surface, which is a slow way to find out a selector moved.
const chosenSurfaces = () => {
  const only = process.env.SWEEP_ONLY?.split(',').filter(Boolean)
  return only?.length ? SURFACES.filter((s) => only.includes(s.name)) : SURFACES
}

async function measureHovered(page, what, selector) {
  await page.mouse.move(0, 0)
  await page.waitForTimeout(200)
  const rest = (await page.evaluate(measureProbes, { selectors: { [what]: selector } }))[what]
  if (!rest) return null
  await page.locator(selector).first().hover()
  await page.waitForTimeout(200)
  const baseline = { [what]: rest.face }
  const got = await page.evaluate(measureProbes, { selectors: { [what]: selector }, baseline })
  await page.mouse.move(0, 0)
  return got[what]
}

async function sweepSurface({ app, main, surface, theme, findings, userDataDir }) {
  const page = surface.window === 'launcher' ? await launcherPage(app, main) : main
  await surface.open(page, { userDataDir, app })
  await page.waitForTimeout(120)

  const entries = Object.entries(surface.probes)
  const resting = entries.filter(([, probe]) => probe[3] !== 'hover')
  const selectors = Object.fromEntries(resting.map(([what, [sel]]) => [what, sel]))
  const probe = await page.evaluate(measureProbes, { selectors })
  for (const [what, [sel]] of entries.filter(([, p]) => p[3] === 'hover')) {
    probe[what] = await measureHovered(page, what, sel)
  }

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
      for (const surface of chosenSurfaces()) {
        await sweepSurface({ app, main: page, surface, theme, findings, userDataDir })
      }
      process.stdout.write(`  ${theme.padEnd(9)} ✓\n`)
    }
  } finally {
    await app.close()
    // The two scratch repositories the merge surfaces build, which are real
    // working trees and not worth leaving in the temp dir.
    for (const dir of [conflicted?.dir, openedFiles?.dir, ...walked]) {
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
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
