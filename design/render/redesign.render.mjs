import {
  test,
  expect,
  showPanel,
  openNewSnippet,
  docActions,
  clickAppMenuItem,
  stubOpenDialog,
  openMenu,
  openSettings,
  saveSettings
} from '../../e2e/fixtures.mjs'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installKit } from './kit.mjs'
import { NAMES, overlay121 } from './overlays/121.mjs'
import { measureRedesign, FLOORS } from './overlays/measure.mjs'

// App-wide redesign: each variant is a stylesheet laid over the live app.
const OUT = 'design/render/out/redesign'
const ONLY = process.env.VARIANTS?.split(',')

const PLAIN = `
  :root { --btn-face: transparent; --btn-edge: transparent; }
  .btn:not(.btn-primary) { box-shadow: none; }
  .btn:disabled:not(.btn-primary) { border-color: transparent; }`

// Toolbar actions move into the tab strip's free right-hand side; its band goes.
const MERGE = () => {
  const options = document.querySelector('.toolbar .options')
  const tabs = document.querySelector('.diff-tabs')
  options.style.cssText =
    'margin-left:auto;display:flex;align-items:center;gap:4px;padding-right:8px'
  tabs.append(options)
  document.querySelector('.toolbar').style.display = 'none'
}
const MENU_BUTTON = () => {
  document.querySelector('.menubar').style.display = 'none'
  const b = document.createElement('button')
  b.className = 'btn btn-icon'
  b.setAttribute('aria-label', 'Menu')
  b.style.cssText = 'margin:0 4px 0 6px;align-self:center'
  b.innerHTML =
    '<svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
  document.querySelector('.diff-tabs').prepend(b)
}
// Text-only actions need an icon before labels can go; these are the ones the shell would add.
const ADD_ICONS = () => {
  const paths = {
    Copy: 'M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    'Compare with…': 'M7 4v6M4 7h6M4 17h6M15 4h5v16h-5'
  }
  document.querySelectorAll('.diff-tabs .options .btn').forEach((b) => {
    const d = paths[b.textContent.trim()]
    if (!d || b.querySelector('svg')) return
    b.insertAdjacentHTML(
      'afterbegin',
      `<svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`
    )
  })
  window.dispatchEvent(new Event('resize'))
}
const maskIcon = (d) =>
  `content:'';width:16px;height:16px;flex:none;background:currentColor;-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='${d}'/></svg>") center/contain no-repeat;`
const ICON_ONLY = `
  .doc-actions .btn:first-child:not(.btn-primary):not(.btn-icon)::before { ${maskIcon('M7 4v6M4 7h6M4 17h6M15 4h5v16h-5')} }
  .doc-actions .btn[aria-label='Copy']::before { ${maskIcon('M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')} }
  .diff-tabs .options .btn { font-size: 0; gap: 0; padding: 0 8px; }
  .diff-tabs .options .btn .app-icon { font-size: 16px; }
  .diff-tabs .options .btn-primary { font-size: var(--font-md); gap: 6px; padding: 0 12px; }`

const BASE = { css: PLAIN + ICON_ONLY, js: [MERGE, MENU_BUTTON, ADD_ICONS] }
const QUIET_SIDE = `
  .usb-shelf { display: none !important; }
  .monogram.glyph-well { background: transparent !important; color: var(--text-meta) !important; }
  .home-row .glyph-well { background: transparent !important; color: var(--text-meta) !important; }
  .row .when { visibility: hidden; }
  .row:hover .when { visibility: visible; }
  .section-head .actions-slot .btn:not(:first-child) { display: none; }`
const UNTINT_SEARCH = () => {
  const clear = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent'
  let band = document.querySelector('.usb-top')
  while (band && clear(getComputedStyle(band).backgroundColor)) band = band.parentElement
  if (!band) return
  band.style.background = 'var(--bg-panel)'
  band.style.borderBottom = '0'
}
const MORE_BUTTON = () => {
  const slot = document.querySelector('.section-head .actions-slot')
  if (!slot) return
  const b = document.createElement('button')
  b.className = 'btn btn-icon'
  b.setAttribute('aria-label', 'More')
  b.innerHTML =
    '<svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>'
  slot.append(b)
}
const NO_RAIL_LABELS = `
  .rail-label { display: none; }
  .rail-item { gap: 0; }`
// The rail's four places become a segmented control on top of the sidebar.
const SEGMENTED = () => {
  const rail = document.querySelector('.rail')
  const items = [...rail.querySelectorAll('.rail-item')].filter((i) => i.dataset.panel !== 'keys')
  const seg = document.createElement('div')
  seg.className = 'dk-seg'
  seg.style.cssText =
    'display:flex;gap:2px;margin:8px 10px 0;padding:2px;border-radius:var(--radius);background:color-mix(in srgb, var(--text) 7%, var(--bg-panel))'
  items.forEach((item) => {
    const b = document.createElement('button')
    b.className = item.classList.contains('on') ? 'btn btn-sm dk-on' : 'btn btn-sm'
    b.style.cssText = `flex:1;justify-content:center;box-shadow:none;${item.classList.contains('on') ? 'background:var(--bg);' : ''}`
    b.setAttribute('aria-label', item.getAttribute('aria-label'))
    b.append(item.querySelector('svg').cloneNode(true))
    const pending = [...item.querySelectorAll('.rail-count')].find((c) => c.style.left)
    if (pending) {
      const badge = document.createElement('span')
      badge.textContent = pending.textContent
      badge.style.cssText =
        'margin-left:4px;padding:0 5px;border-radius:9px;background:var(--hue-received);color:#fff;font-size:11px;font-weight:650;line-height:16px'
      b.append(badge)
    }
    seg.append(b)
  })
  const top = document.querySelector('.usb-top').parentElement
  top.parentElement.insertBefore(seg, top)
  rail.style.display = 'none'
}

// Decided so far: Q1 plain, Q2 one row with icons, Q3 no rail; #121 drawn in.
const DECIDED = {
  css: BASE.css + QUIET_SIDE,
  js: [...BASE.js, UNTINT_SEARCH, MORE_BUTTON, SEGMENTED],
  with121: true
}
const BORDERLESS_NAME = `
  .doc-name input, .doc-name .ghost-field { border-color: transparent !important; background: transparent !important; box-shadow: none !important; font-size: 20px; padding-left: 0; }
  .doc-secret { display: none !important; }
  .drop-hint { display: none !important; }
  .lang-detected { display: none !important; }`
const ONE_BAND = () => {
  const controls = document.querySelector('.snippet-doc .editor-controls')
  const head = document.querySelector('.snippet-doc .doc-head')
  if (!controls || !head) return
  controls.style.marginLeft = 'auto'
  head.append(controls)
  document.querySelector('.snippet-doc .editor-header').style.display = 'none'
}
const STATUS_ONLY = `
  .snippet-doc .editor-header { display: none !important; }`
const DOC_DECIDED =
  BORDERLESS_NAME +
  STATUS_ONLY +
  `
  .es-lang { text-decoration: underline; text-decoration-color: var(--text-meta); text-underline-offset: 3px; cursor: pointer; }`
const QUIET_SLOTS = `
  .file-slots-row .slot { border-color: transparent !important; background: transparent !important; box-shadow: none !important; }
  .file-slots-row .slot .name { font-weight: 600; }
  .shortcut-bar { display: none !important; }
  .status-band { min-height: 0 !important; height: 26px !important; padding: 0 12px !important; font-size: 11px !important; color: var(--text-meta); }`
const NO_SLOTS = `
  .file-slots-row { display: none !important; }`
// Each pane names its side in a quiet label once the slot band is gone.
const PANE_LABELS = () => {
  const host = document.querySelector('.diff-container')
  if (!host) return
  host.style.position = 'relative'
  ;['Left (pasted)', 'Right (pasted)'].forEach((text, i) => {
    const l = document.createElement('div')
    l.className = 'dk-pane-label'
    l.textContent = text
    l.style.cssText = `position:absolute;top:6px;${i ? 'right:16px' : 'right:calc(50% + 16px)'};z-index:5;font-size:11px;color:var(--text-meta);background:var(--bg);padding:1px 6px;border-radius:var(--radius-sm)`
    host.append(l)
  })
}
const with_ = (extra = {}) => ({
  css: DECIDED.css + (extra.css ?? ''),
  js: [...DECIDED.js, ...(extra.js ?? [])],
  with121: true
})

const with2 = (extra = {}) => with_({ css: DOC_DECIDED + (extra.css ?? ''), js: extra.js ?? [] })

const WAIT_COPY = () => {
  const hint = document.querySelector('.wait-hint')
  if (hint) hint.textContent = 'Drop a file or a snippet here, or click to choose one.'
}
const DECIDED5 = { css: QUIET_SLOTS + NO_SLOTS, js: [PANE_LABELS, WAIT_COPY] }
const START_LIST = `
  .start-cards { display: flex !important; flex-direction: column !important; gap: 2px !important; max-width: 620px; }
  .start-card { flex-direction: row !important; align-items: center !important; gap: 12px !important; outline: 0 !important; box-shadow: none !important; background: transparent !important; padding: 10px 12px !important; }
  .start-card:hover { background: var(--row-hover) !important; }
  .start-card .glyph-well { background: transparent !important; }
  .start-card .card-title { width: 120px; flex: none; font-size: var(--font-md) !important; }
  .start-card .meta { flex: 1; }
  .start-formats { display: none !important; }`
const START_MINIMAL = `
  .start { display: flex !important; align-items: center; justify-content: center; }
  .start-head { text-align: center; }
  .start-cards { display: flex !important; justify-content: center !important; gap: 4px !important; }
  .start-card { outline: 0 !important; box-shadow: none !important; background: transparent !important; padding: 6px 12px !important; color: var(--accent) !important; }
  .start-card:hover { background: var(--row-hover) !important; }
  .start-card .card-title { font-size: var(--font-md) !important; font-weight: 600 !important; }
  .start-card .glyph-well, .start-card .meta, .start-card .keys, .start-formats { display: none !important; }`
const with5 = (extra = {}) =>
  with2({ css: DECIDED5.css + (extra.css ?? ''), js: [...DECIDED5.js, ...(extra.js ?? [])] })
const START_SCREENS = ['start', 'waiting']

const DECIDED6 = START_MINIMAL
const with6 = (extra = {}) => with5({ css: DECIDED6 + (extra.css ?? ''), js: extra.js ?? [] })
const PANEL_SCREENS = ['home', 'tools']
const PANELS_LIST = `
  .tt-grid, .home-grid { display: flex !important; flex-direction: column !important; gap: 0 !important; }
  .tile { background: transparent !important; box-shadow: none !important; outline: 0 !important; border: 0 !important; min-height: 0 !important; height: 32px !important; justify-content: flex-start !important; padding: 0 8px !important; }
  .tile:hover { background: var(--row-hover) !important; }
  .tile .glyph-well { background: transparent !important; }
  .home-block:has(.home-grid) { display: none !important; }`
const PANELS_ICONS = `
  .tt-grid, .home-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 4px !important; }
  .tile { flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 6px !important; height: auto !important; min-height: 0 !important; padding: 10px 4px !important; background: transparent !important; box-shadow: none !important; outline: 0 !important; border: 0 !important; }
  .tile:hover { background: var(--row-hover) !important; }
  .tile .row-2-name { font-weight: 500 !important; font-size: var(--font-sm) !important; }`

// The gutter fits its digits: what lineNumbersMinChars 2, lineDecorationsWidth 8 and no folding give.
const NARROW_GUTTER = `
  .snippet-doc .monaco-editor .margin { width: 30px !important; border-right: 0 !important; box-shadow: none !important; }
  .snippet-doc .monaco-editor .margin-view-overlays, .snippet-doc .monaco-editor .margin-view-overlays > div { width: 30px !important; }
  .snippet-doc .monaco-editor .line-numbers { width: 22px !important; left: 0 !important; }
  .snippet-doc .monaco-editor .monaco-scrollable-element.editor-scrollable { left: 30px !important; width: calc(100% - 30px) !important; }
  .snippet-doc .editor-area, .snippet-doc .editor { border-left: 0 !important; }`
const DECIDED7 = PANELS_ICONS + NARROW_GUTTER
const with7 = (extra = {}) => with6({ css: DECIDED7 + (extra.css ?? ''), js: extra.js ?? [] })

const DIALOG_SCREENS = ['toolJson', 'settings']
const SHEET = `
  .dialog { background: var(--bg-raised) !important; border-color: transparent !important; border-radius: 14px !important; padding: 20px 22px !important; }
  .dialog-backdrop { background: color-mix(in srgb, var(--scrim) 55%, transparent) !important; }
  .dialog h3 { font-weight: 600 !important; }`
const QUIET_FIELDS = `
  .dialog textarea, .dialog input[type='text'], .dialog input[type='search'], .dialog input:not([type]), .dialog select { border-color: transparent !important; background: color-mix(in srgb, var(--text) 6%, var(--bg-raised)) !important; box-shadow: none !important; }`

const DECIDED8 = SHEET + QUIET_FIELDS
const with8 = (extra = {}) => with7({ css: DECIDED8 + (extra.css ?? ''), js: extra.js ?? [] })
const WEIGHT_REFINED = `
  .section-title, .tt-head, .home-head, .start-head h2, .dialog h3, .doc-name input, .card-title { font-weight: 600 !important; }
  .tile .row-2-name, .tab .name, .seg button { font-weight: 500 !important; }
  .nm, .row-2-name { font-weight: 400 !important; }
  .dk-taghead, .dk-grouphead { font-weight: 600 !important; }`
const WEIGHT_LIGHT = `
  .section-title, .tt-head, .home-head, .start-head h2, .dialog h3, .doc-name input, .card-title { font-weight: 500 !important; }
  .tile .row-2-name, .tab .name, .nm, .row-2-name { font-weight: 400 !important; }
  .dk-taghead, .dk-grouphead { font-weight: 500 !important; }`

// Dialogs never scroll as a whole: the header and the actions stay, the body scrolls.
const PINNED_DIALOG = `
  .dialog { overflow: hidden !important; }
  .dialog > * { flex: none; }
  .dialog > :not(.dialog-header):not(.dialog-actions):not(.dialog-note):not(p):not(.dlg-resize) { flex: 1 1 auto; min-height: 0; overflow: auto; }`
const FINAL = with8({ css: WEIGHT_REFINED + PINNED_DIALOG })
const ALL_SCREENS = [
  'snippet',
  'comparison',
  'start',
  'waiting',
  'home',
  'tools',
  'toolJson',
  'settings'
]

const VARIANTS = {
  final: { ...FINAL, screens: ALL_SCREENS },
  'weight-today': { ...with8(), screens: ['snippet', 'tools'] },
  'weight-refined': { ...with8({ css: WEIGHT_REFINED }), screens: ['snippet', 'tools'] },
  'weight-light': { ...with8({ css: WEIGHT_LIGHT }), screens: ['snippet', 'tools'] },
  'dlg-today': { ...with7(), screens: DIALOG_SCREENS },
  'dlg-sheet': { ...with7({ css: SHEET }), screens: DIALOG_SCREENS },
  'dlg-quiet': { ...with7({ css: SHEET + QUIET_FIELDS }), screens: DIALOG_SCREENS },
  'gutter-check': with7(),
  'panels-today': { ...with6(), screens: PANEL_SCREENS },
  'panels-list': { ...with6({ css: PANELS_LIST }), screens: PANEL_SCREENS },
  'panels-icons': { ...with6({ css: PANELS_ICONS }), screens: PANEL_SCREENS },
  'start-today': { ...with5(), screens: START_SCREENS },
  'start-list': { ...with5({ css: START_LIST }), screens: START_SCREENS },
  'start-minimal': { ...with5({ css: START_MINIMAL }), screens: START_SCREENS },
  'diff-today': with2(),
  'diff-quiet': with2({ css: QUIET_SLOTS }),
  'diff-noslots': with2({ css: QUIET_SLOTS + NO_SLOTS, js: [PANE_LABELS] }),
  'doc-today': with_(),
  'doc-oneband': with_({ css: BORDERLESS_NAME, js: [ONE_BAND] }),
  'doc-status': with_({ css: BORDERLESS_NAME + STATUS_ONLY }),
  'side-today': BASE,
  'side-quiet': { css: BASE.css + QUIET_SIDE, js: [...BASE.js, UNTINT_SEARCH, MORE_BUTTON] },
  'side-quiet-rail': {
    css: BASE.css + QUIET_SIDE + NO_RAIL_LABELS,
    js: [...BASE.js, UNTINT_SEARCH, MORE_BUTTON]
  },
  'side-segmented': {
    css: BASE.css + QUIET_SIDE,
    js: [...BASE.js, UNTINT_SEARCH, MORE_BUTTON, SEGMENTED]
  },
  'bands-today': { css: PLAIN },
  'bands-merged': { css: PLAIN, js: [MERGE] },
  'bands-merged-nomenu': { css: PLAIN, js: [MERGE, MENU_BUTTON] },
  'bands-icons': { css: PLAIN + ICON_ONLY, js: [MERGE, MENU_BUTTON, ADD_ICONS] },
  'controls-today': '',
  'controls-plain': `
    :root { --btn-face: transparent; --btn-edge: transparent; }
    .btn:not(.btn-primary) { box-shadow: none; }`,
  'controls-soft': `
    :root { --btn-edge: transparent; }
    .btn { box-shadow: none; }`,
  'controls-hairline': `
    :root { --btn-face: transparent; }
    .btn:not(.btn-primary) { box-shadow: none; }`
}

async function createSnippet(page, name, body) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function compare(page) {
  await page
    .locator('.diff-tabs')
    .getByRole('button', { name: 'New comparison', exact: true })
    .click()
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page
    .getByPlaceholder('Paste or type the original text')
    .fill('replicas: 3\nimage: api:1.41\nenv: production\nlog_level: warn\ntimeout: 30s')
  await page
    .getByPlaceholder('Paste or type the changed text')
    .fill('replicas: 3\nimage: api:1.42\nenv: production\nlog_level: debug\ntimeout: 30s')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()
}

const SCREENS = {
  toolJson: async (page) => {
    await openMenu(page, 'Tools', 'Format', 'JSON')
    await page
      .getByRole('dialog', { name: 'JSON' })
      .getByRole('textbox')
      .first()
      .fill('{"replicas": 3, "image": "api:1.42", "env": "production"}')
  },
  settings: async (page, app) => {
    await clickAppMenuItem(app, 'Settings…')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  },
  home: (page) => showPanel(page, 'home'),
  tools: (page) => showPanel(page, 'tools'),
  start: async (page) => {
    await showPanel(page, 'diffs')
    await page
      .locator('.diff-tabs')
      .getByRole('button', { name: 'New comparison', exact: true })
      .click()
  },
  waiting: async (page, app) => {
    await showPanel(page, 'diffs')
    await page
      .locator('.diff-tabs')
      .getByRole('button', { name: 'New comparison', exact: true })
      .click()
    const dir = mkdtempSync(join(tmpdir(), 'render-'))
    const file = join(dir, 'config.prod.yaml')
    writeFileSync(file, 'replicas: 3\nimage: api:1.41\n')
    await stubOpenDialog(app, file)
    await page.locator('.slot[data-side="left"] .open').click()
    await expect(page.locator('.waiting')).toBeVisible()
  },
  comparison: async (page) => {
    await showPanel(page, 'diffs')
    const existing = page.locator('.diff-tabs .tab', { hasText: 'replicas: 3' }).first()
    if (await existing.count()) await existing.locator('.tab-open').click()
    else await compare(page)
    await expect(page.locator('.diff-container')).toBeVisible()
  },
  snippet: async (page) => {
    await showPanel(page, 'snippets')
    await page.locator('li.row', { hasText: 'Restart api' }).locator('.entry').click()
  }
}

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme)

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
  'Contrast',
  'Volcano',
  'Amber',
  'Tide',
  'Ember',
  'Graphite',
  'Vector'
]
const THEME_SCREENS = ['snippet', 'comparison', 'tools']

async function useTheme(page, label) {
  await openSettings(page)
  await page.locator('.theme-tile', { hasText: label }).first().click()
  await saveSettings(page)
}

async function applyVariant(page, spec, screen) {
  if (spec.with121 && ['snippet', 'comparison'].includes(screen))
    await page.evaluate(overlay121, {
      state: screen === 'snippet' ? 'rest' : 'diffs-rest',
      names: NAMES
    })
  await page.evaluate((text) => {
    const style = document.createElement('style')
    style.textContent = text
    document.head.append(style)
  }, spec.css)
  for (const step of spec.js) await page.evaluate(step)
}

if (process.env.ALL_THEMES) {
  test('final design in every theme', async ({ app, page }) => {
    test.setTimeout(900_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await createSnippet(page, 'Restart api', 'kubectl rollout restart deployment/api')
    const dir = `${OUT}/themes`
    mkdirSync(dir, { recursive: true })
    const report = {}
    for (const label of THEMES) {
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)
      await useTheme(page, label)
      for (const screen of THEME_SCREENS) {
        await page.reload()
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(500)
        await showPanel(page, 'snippets')
        await page.locator('li.row').first().waitFor()
        await page.evaluate(installKit)
        await page.evaluate(() => window.dk.keepRowTemplate())
        await SCREENS[screen](page, app)
        await page.mouse.move(900, 600)
        await page.waitForTimeout(300)
        await page.evaluate(() =>
          document.querySelectorAll('.diff-tabs .tab:not(.active)').forEach((t) => {
            if (t.querySelector('.name')?.textContent.trim() !== 'Restart api') t.remove()
          })
        )
        await applyVariant(page, FINAL, screen)
        await page.waitForTimeout(400)
        await page.mouse.move(1270, 790)
        const slug = label.toLowerCase()
        await page.screenshot({ path: `${dir}/${slug}-${screen}.png` })
        const m = await page.evaluate(measureRedesign)
        report[slug] = {
          ...(report[slug] ?? {}),
          ...Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null))
        }
      }
    }
    writeFileSync(
      `${dir}/metrics.json`,
      JSON.stringify({ floors: FLOORS, themes: report }, null, 2)
    )
  })
} else {
  for (const theme of ['light', 'dark']) {
    test(`redesign ${theme}`, async ({ app, page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await createSnippet(page, 'Restart api', 'kubectl rollout restart deployment/api')
      for (const [variant, css] of Object.entries(VARIANTS)) {
        if (ONLY && !ONLY.some((v) => variant.startsWith(v))) continue
        const spec = typeof css === 'string' ? { css, js: [] } : { js: [], ...css }
        for (const screen of spec.screens ?? ['comparison', 'snippet']) {
          await renderOne({ app, page, theme, spec, screen })
          await page.screenshot({ path: `${OUT}/${variant}-${screen}-${theme}.png` })
        }
      }
    })
  }
}

async function prepareScreen(app, page, theme) {
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(600)
  if ((await themeOf(page)) !== theme) await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
  await expect.poll(() => themeOf(page)).toBe(theme)
}

async function renderOne({ app, page, theme, spec, screen }) {
  await prepareScreen(app, page, theme)
  if (spec.with121) {
    await showPanel(page, 'snippets')
    await page.locator('li.row').first().waitFor()
    await page.evaluate(installKit)
    await page.evaluate(() => window.dk.keepRowTemplate())
  }
  await SCREENS[screen](page, app)
  await page.mouse.move(900, 600)
  await page.waitForTimeout(400)
  await page.evaluate(() =>
    document.querySelectorAll('.diff-tabs .tab:not(.active)').forEach((t) => {
      if (t.querySelector('.name')?.textContent.trim() !== 'Restart api') t.remove()
    })
  )
  await applyVariant(
    page,
    { css: spec.css ?? '', js: spec.js ?? [], with121: spec.with121 },
    screen
  )
  await page.waitForTimeout(500)
  await page.mouse.move(1270, 790)
}
