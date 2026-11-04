import {
  test,
  expect,
  showPanel,
  openNewSnippet,
  docActions,
  snippetMoreMenu,
  snippetDoc,
  editInPlace,
  openSettingsPage,
  setViewOption,
  clickAppMenuItem
} from '../../e2e/fixtures.mjs'
import { installKit } from './kit.mjs'

// #233: eight snippet fixes, each drawn as today → proposed on the live app.
const OUT = 'design/render/out/233'
const THEMES = ['light', 'dark']

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme)
async function ensureTheme(app, page, theme) {
  if ((await themeOf(page)) !== theme) await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
  await expect.poll(() => themeOf(page)).toBe(theme)
}

async function createSnippet(page, { name, body, tags = [], syntax }) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  for (const tag of tags) {
    await doc.locator('.taginput').fill(tag)
    await doc.locator('.taginput').press('Enter')
  }
  await doc.locator('.editor').click()
  await page.keyboard.type(body)
  if (syntax)
    await doc
      .locator('.editor-status')
      .getByRole('combobox', { name: 'Syntax' })
      .selectOption(syntax)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(doc).toBeHidden()
}

const row = (page, name) => page.locator('.snippets-section .row', { hasText: name }).first()
const open = async (page, name) => {
  await row(page, name).locator('.entry').click()
  await expect(snippetDoc(page)).toBeVisible()
}

const hideUnusedTemplateTags = () =>
  document.querySelectorAll('.editor-status .tt').forEach((t) => {
    if (!/\d/.test(t.textContent)) t.remove()
  })

async function shoot(page, theme, state, { keepMouse = false, proposed = true } = {}) {
  if (proposed) await page.evaluate(hideUnusedTemplateTags)
  if (!keepMouse) await page.mouse.move(1270, 750)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${theme}-${state}.png` })
}

async function fresh(app, page, theme) {
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(600)
  await ensureTheme(app, page, theme)
  await page.evaluate(installKit)
  await page.evaluate(() => window.dk.designFont())
  await showPanel(page, 'snippets')
}

const LIBRARY = [
  { name: 'Restart api', body: 'kubectl rollout restart deployment/api', tags: ['kubernetes'] },
  {
    name: 'Scale workers',
    body: 'kubectl scale deployment/worker --replicas=5',
    tags: ['kubernetes', 'prod']
  },
  { name: 'Tail logs', body: 'kubectl logs -f deployment/api --since=10m', tags: ['prod'] },
  {
    name: 'Deploy notice',
    body: 'Deploying {{service}} to {{env}} at {{time}}. Ping #ops if it looks off.',
    tags: ['ops']
  }
]

async function seed(page, extra = []) {
  for (const s of [...LIBRARY, ...extra]) await createSnippet(page, s)
}

const unclipStatusBar = () =>
  [...document.querySelectorAll('.snippet-doc')]
    .find((d) => d.offsetParent)
    .querySelectorAll('.editor-status .es-side')
    .forEach((s) => (s.style.overflow = 'visible'))
const removeTemplateTags = () =>
  [...document.querySelectorAll('.editor-status .tt')].find((t) => t.offsetParent)?.remove()

for (const theme of THEMES) {
  test(`233 template tags ${theme}`, async ({ app, page }) => {
    await seed(page)
    await fresh(app, page, theme)
    await open(page, 'Restart api')
    await page.locator('.snippet-doc:visible .editor-status .tt-trigger').hover()
    await shoot(page, theme, '1-today-hover', { keepMouse: true, proposed: false })
    await page.evaluate(removeTemplateTags)
    await shoot(page, theme, '1-hidden')
    await open(page, 'Deploy notice')
    await page.evaluate(unclipStatusBar)
    await page.locator('.snippet-doc:visible .editor-status .tt-trigger').click()
    await page.locator('.snippet-doc:visible .editor-status .tt-trigger').hover()
    await shoot(page, theme, '1-open', { keepMouse: true })
  })

  test(`233 drop and format ${theme}`, async ({ app, page }) => {
    await seed(page)
    await fresh(app, page, theme)
    await open(page, 'Restart api')
    await shoot(page, theme, '2-before-drop', { proposed: false })
    await openNewSnippet(page)
    const draft = page.getByRole('region', { name: 'New snippet' })
    await draft.getByPlaceholder('Snippet name…').fill('deploy.yaml')
    await draft.locator('.editor').click()
    await page.keyboard.type('apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n')
    await shoot(page, theme, '2-after-drop')

    await open(page, 'Scale workers')
    await editInPlace(page)
    await page.keyboard.type(' ')
    await page.locator('.diff-tabs .tab.active .tab-close').click()
    const confirm = page.getByRole('dialog').last()
    await expect(confirm).toBeVisible()
    await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].pop()
      const title = d.querySelector('.dialog-title, h2, h3')
      if (title) title.textContent = 'Format this snippet?'
      const body = d.querySelector('.dialog-body')
      if (body)
        body.textContent =
          'Scale workers is saved. Formatting replaces its content; Cmd+Z undoes it.'
      const actions = d.querySelector('.dialog-actions') ?? d.querySelector('footer')
      const [first] = actions.querySelectorAll('button')
      actions.replaceChildren()
      const cancel = first.cloneNode(false)
      cancel.className = 'btn btn-ghost'
      cancel.textContent = 'Cancel'
      const format = first.cloneNode(false)
      format.className = 'btn btn-primary'
      format.textContent = 'Format'
      actions.append(cancel, format)
    })
    await shoot(page, theme, '2-format-confirm')
  })

  test(`233 tags today ${theme}`, async ({ app, page }) => {
    await seed(page)
    await fresh(app, page, theme)
    await shoot(page, theme, '3-today', { proposed: false })
  })

  test(`233 tags nested ${theme}`, async ({ app, page }) => {
    for (const s of LIBRARY) {
      const nested = s.tags.length > 1 ? [[...s.tags].sort().join('/')] : s.tags
      await createSnippet(page, { ...s, tags: nested })
    }
    await fresh(app, page, theme)
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.snippets-section .row')]
      const tagOf = (name, word) => {
        const r = rows.find((x) => x.textContent.includes(name))
        const leaf = [...r.querySelectorAll('*')].find(
          (n) => !n.children.length && n.textContent.trim() === word
        )
        return leaf.parentElement
      }
      const kube = tagOf('Restart api', 'kubernetes')
      const prod = tagOf('Tail logs', 'prod')
      const merged = tagOf('Scale workers', 'kubernetes/prod')
      merged.replaceWith(kube.cloneNode(true), prod.cloneNode(true))
    })
    await shoot(page, theme, '3-nested')
    const dialog = await openSettingsPage(page, 'Behaviour')
    await page.evaluate(() => {
      const first = document.querySelector('.settings-behaviour .hint')
      const toggle = first.previousElementSibling.cloneNode(true)
      const label = [...toggle.querySelectorAll('*')].find(
        (n) => n.children.length === 0 && n.textContent.trim().length > 8
      )
      if (label) label.textContent = 'List an item with several tags once, nested by its tags'
      toggle.querySelector('input')?.setAttribute('checked', '')
      const box = toggle.querySelector('input')
      if (box) box.checked = true
      const hint = first.cloneNode(true)
      hint.textContent = 'Off: it is listed under each of its tags.'
      first.after(toggle, hint)
    })
    await expect(dialog).toBeVisible()
    await shoot(page, theme, '3-setting')
  })

  test(`233 rendered draft ${theme}`, async ({ app, page }) => {
    await fresh(app, page, theme)
    await openNewSnippet(page)
    const doc = page.getByRole('region', { name: 'New snippet' })
    await doc.getByPlaceholder('Snippet name…').fill('Release notes')
    await doc.locator('.editor').click()
    await page.keyboard.type('h2. Release 4.2\n* faster sidebar search\n* *bold* fix for tags\n')
    await doc
      .locator('.editor-status')
      .getByRole('combobox', { name: 'Syntax' })
      .selectOption('jira')
    await shoot(page, theme, '4-today', { proposed: false })
    await doc.locator('.editor-status').getByRole('button', { name: 'Rendered' }).click()
    await shoot(page, theme, '4-rendered')
  })

  test(`233 history ${theme}`, async ({ app, page }) => {
    await seed(page)
    await fresh(app, page, theme)
    await open(page, 'Tail logs')
    await editInPlace(page)
    await page.keyboard.type(' -n api')
    await shoot(page, theme, '5-editing')
    await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
    await snippetMoreMenu(page).click()
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('[role="menuitem"]')]
      const last = items.at(-1)
      const history = last.cloneNode(true)
      const label = [...history.querySelectorAll('*')].find(
        (n) => n.children.length === 0 && n.textContent.trim()
      )
      ;(label ?? history).textContent = 'History'
      history.querySelectorAll('kbd, .ctx-keys').forEach((k) => k.remove())
      const clock = document.querySelector('#toolbar-doc-actions [aria-label="History"] svg')
      const icon = history.querySelector('svg')
      if (clock && icon) icon.replaceWith(clock.cloneNode(true))
      last.parentElement.insertBefore(history, items[0])
    })
    await shoot(page, theme, '5-menu')
    await page.keyboard.press('Escape')
    await docActions(page).getByRole('button', { name: 'History', exact: true }).click()
    await page.evaluate(() => {
      const versions = [...document.querySelectorAll('.hist-version')]
      versions.slice(1).forEach((v) => v.remove())
      const panel = document.querySelector('.hist-panel')
      panel.querySelector('.hb-text').textContent =
        'No earlier versions yet. The next change keeps this one.'
      panel.querySelector('.hb-stats')?.remove()
      const diff = panel.querySelector('.hist-diff')
      const plain = document.createElement('pre')
      plain.style.cssText = 'margin:0;padding:8px 12px;font:13px/20px monospace;color:var(--text)'
      plain.textContent = 'kubectl logs -f deployment/api --since=10m -n api'
      diff.replaceWith(plain)
    })
    await shoot(page, theme, '5-panel-current-only')
  })

  test(`233 colour ${theme}`, async ({ app, page }) => {
    await seed(page)
    await fresh(app, page, theme)
    await row(page, 'Restart api').click({ button: 'right' })
    await page.locator('.rcm [data-color="green"]').click()
    await row(page, 'Restart api').click({ button: 'right' })
    await shoot(page, theme, '6-menu-on-green', { proposed: false })
    await page.locator('.rcm [data-color="none"]').click()
    await shoot(page, theme, '6-after-reclick')
  })

  test(`233 data folder ${theme}`, async ({ app, page }) => {
    await fresh(app, page, theme)
    await openSettingsPage(page, 'Storage')
    await shoot(page, theme, '7-today', { proposed: false })
  })

  test(`233 search ${theme}`, async ({ app, page }) => {
    await seed(page)
    await fresh(app, page, theme)
    const input = page.locator('.sidebar-search input, input[type="search"]').first()
    await input.click()
    await shoot(page, theme, '8-today-focus', { proposed: false })
    await input.fill('#')
    await page.evaluate(() => {
      const box = document.querySelector('.sidebar-search input, input[type="search"]')
      box.value = ''
    })
    await shoot(page, theme, '8-focus')
    await input.fill('#ku')
    const list = await page.evaluate(() => document.querySelector('.scope-list')?.outerHTML)
    await input.fill('ku')
    await page.evaluate((html) => {
      const box = document.querySelector('.sidebar-search input, input[type="search"]')
      const host = box.closest('.sidebar-search') ?? box.parentElement
      if (html && !host.querySelector('.scope-list')) host.insertAdjacentHTML('beforeend', html)
    }, list)
    await shoot(page, theme, '8-typing')
  })
}

const MMD_A =
  'flowchart TD\n  A[Ingest] --> B{Valid?}\n  B -- yes --> C[Transform]\n  B -- no --> D[Reject]'
const MMD_B =
  'flowchart TD\n  A[Ingest] --> B{Valid?}\n  B -- yes --> E[Enrich]\n  E --> C[Transform]\n  B -- no --> Q[Quarantine]'

async function pasteMermaid(page) {
  await page
    .locator('.diff-tabs')
    .getByRole('button', { name: 'New comparison', exact: true })
    .click()
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill(MMD_A)
  await page.getByPlaceholder('Paste or type the changed text').fill(MMD_B)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.dg-stage svg').first()).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(800)
}

const PLUS_STYLES = {
  face: 'background: var(--btn-face); color: var(--text); border-radius: var(--radius-sm, 6px); border-left: 0; width: var(--control-h-sm); height: var(--control-h-sm); margin: 0 6px;',
  keyline:
    'background: transparent; color: var(--text); border: 1px solid var(--btn-edge); border-radius: var(--radius-sm); width: var(--control-h-sm); height: var(--control-h-sm); margin: 0 6px;',
  ink: 'color: var(--text); font-size: 16px;'
}

for (const theme of THEMES) {
  test(`233 options ${theme}`, async ({ app, page }) => {
    await seed(page)
    await fresh(app, page, theme)
    await open(page, 'Tail logs')
    await editInPlace(page)
    await page.keyboard.type(' -n api')
    await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
    const historyHtml = await page.evaluate(
      () => document.querySelector('#toolbar-doc-actions [aria-label="History"]').outerHTML
    )
    await open(page, 'Restart api')
    await shoot(page, theme, '9-today-no-history', { proposed: false })
    await page.evaluate((html) => {
      const more = document.querySelector(
        '#toolbar-doc-actions [aria-label="More snippet actions"]'
      )
      more.insertAdjacentHTML('afterend', html)
      const h = more.nextElementSibling
      h.disabled = true
      h.style.opacity = '0.4'
    }, historyHtml)
    await shoot(page, theme, '9-slots-no-history')
    await open(page, 'Tail logs')
    await shoot(page, theme, '9-slots-history')

    await editInPlace(page)
    await page.keyboard.type(' ')
    await shoot(page, theme, '9-today-dirty-tab', { proposed: false })
    await page.evaluate(() => {
      const tab = document.querySelector('.diff-tabs .tab.active')
      const dot = tab.querySelector('.dirty')
      const close = tab.querySelector('.tab-close')
      if (dot && close) {
        dot.remove()
        close.replaceChildren(dot)
        dot.style.margin = '0'
      }
    })
    await shoot(page, theme, '9-dot-in-close')

    await pasteMermaid(page)
    await shoot(page, theme, '10-split', { proposed: false })
    await setViewOption(page, 'Split view', false)
    await page.waitForTimeout(1200)
    await shoot(page, theme, '10-today-unsplit', { proposed: false })
    await page.evaluate(() => {
      const stage = document.querySelector('.dg-body')
      const band = document.createElement('p')
      band.className = 'dg-drift'
      for (const a of stage.attributes)
        if (a.name.startsWith('data-v-')) band.setAttribute(a.name, '')
      band.textContent =
        'One layout carries both revisions, so an unchanged node stays where it is.'
      band.style.background = 'var(--bg-panel)'
      band.style.borderLeftColor = 'var(--border)'
      stage.previousElementSibling.before(band)
    })
    await shoot(page, theme, '10-band-kept-unsplit')
    await page.evaluate(() => document.querySelector('.dg-drift')?.remove())
    await setViewOption(page, 'Split view', true)
    await page.waitForTimeout(1200)
    await page.evaluate(() => {
      const drift = document.querySelector('.dg-drift')
      const band = document.querySelector('.status-band')
      drift.remove()
      const note = document.createElement('span')
      note.textContent = 'Each side laid out on its own'
      note.style.cssText =
        'margin-left:auto;margin-right:12px;color:var(--text-meta);white-space:nowrap;'
      band.lastElementChild?.before(note)
    })
    await shoot(page, theme, '10-note-in-status')
    for (const [name, css] of Object.entries(PLUS_STYLES)) {
      await page.evaluate((style) => {
        const add = document.querySelector('.diff-tabs .add')
        add.removeAttribute('style')
        add.style.cssText = style
      }, css)
      await page.locator('.diff-tabs').screenshot({ path: `${OUT}/${theme}-11-${name}.png` })
    }
    await page.evaluate(() => document.querySelector('.diff-tabs .add').removeAttribute('style'))
    await page.locator('.diff-tabs').screenshot({ path: `${OUT}/${theme}-11-today.png` })
  })
}
