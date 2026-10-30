import { test, expect, openNewSnippet, docActions, clickAppMenuItem } from '../../e2e/fixtures.mjs'
import { mkdirSync } from 'node:fs'

// #144 slice 7: where Markdown and Jira's Rendered/Plain switch goes once the Content band is gone.
const OUT = 'design/render/out/document'

const FOOTER = () => {
  const side = document.querySelectorAll('.editor-status .es-side')[1]
  const seg = document.createElement('span')
  seg.className = 'es-view'
  seg.innerHTML =
    '<button class="es-btn on">Rendered</button><span>/</span><button class="es-btn">Plain</button>'
  side.prepend(seg)
  const style = document.createElement('style')
  style.textContent = `
    .es-view { display: inline-flex; align-items: center; margin-right: var(--space-3); }
    .es-view .es-btn { color: var(--text-meta); background: none; border: 0; font: inherit; padding: 0 4px; cursor: pointer; }
    .es-view .es-btn.on { color: var(--text); text-decoration: underline; text-underline-offset: 3px; }`
  document.head.append(style)
}

const TOOLBAR = () => {
  const actions = document.querySelector('#toolbar-doc-actions')
  const copy = actions.querySelector('button[aria-label="Copy"]')
  const btn = copy.cloneNode(true)
  btn.setAttribute('aria-label', 'Show plain text')
  btn
    .querySelector('svg')
    .replaceWith(document.querySelector('.diff-tabs .tab.active svg').cloneNode(true))
  copy.before(btn)
}

const MENU = () => {
  const menu = document.querySelector('.ctx[role="menu"]')
  const first = menu.querySelector('.ctx-item')
  const item = first.cloneNode(true)
  item.disabled = false
  item.querySelector('.ctx-label').textContent = 'Show plain text'
  item
    .querySelector('svg')
    .replaceWith(document.querySelector('.diff-tabs .tab.active svg').cloneNode(true))
  const sep = document.createElement('div')
  sep.className = 'ctx-sep'
  menu.prepend(item, sep)
}

const OPTIONS = { footer: [FOOTER], toolbar: [TOOLBAR], menu: [MENU] }

async function markdownSnippet(page) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill('Release notes')
  await doc
    .locator('.editor-status')
    .getByRole('combobox', { name: 'Syntax' })
    .selectOption('markdown')
  await doc.locator('.editor').first().click()
  await page.keyboard.type('Plain controls, one row of tabs, and a quieter sidebar.')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()
}

for (const theme of ['light', 'dark']) {
  test(`document ${theme}`, async ({ app, page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1280, height: 800 })
    if (theme === 'dark') await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
    await markdownSnippet(page)
    await page.mouse.move(1270, 790)

    for (const [name, steps] of Object.entries(OPTIONS)) {
      if (name === 'menu')
        await docActions(page).getByRole('button', { name: 'More snippet actions' }).click()
      for (const step of steps) await page.evaluate(step)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}/toggle-${name}-${theme}.png` })
      await page.keyboard.press('Escape')
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.locator('li.row', { hasText: 'Release notes' }).first().locator('.entry').click()
      await page.waitForTimeout(500)
    }

    await page.locator('li.row', { hasText: 'Release notes' }).first().click({ button: 'right' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/row-menu-${theme}.png` })
    await page.keyboard.press('Escape')
    await docActions(page).getByRole('button', { name: 'More snippet actions' }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/more-menu-${theme}.png` })
  })
}
