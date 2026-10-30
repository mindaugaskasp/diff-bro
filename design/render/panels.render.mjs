import { test, expect, showPanel, openNewSnippet, docActions } from '../../e2e/fixtures.mjs'
import { mkdirSync } from 'node:fs'
import { readFileSync } from 'node:fs'

// #144 slice 9: how a long pinned name sits in a three-column tile.
const OUT = 'design/render/out/panels'
const ICONS = readFileSync('design/render/redesign.render.mjs', 'utf8').match(
  /const PANELS_ICONS = `([^`]*)`/
)[1]

const NAMES = {
  today: null,
  'one-line': `
    .tile .row-2-name { max-width: 100%; }`,
  'two-lines': `
    .tile .row-2-name { white-space: normal !important; display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: center; overflow-wrap: anywhere; }`
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

async function pin(page, name) {
  const row = page.locator('.snippets-section .row', { hasText: name }).first()
  await row.hover()
  await row.locator('.star').click()
}

for (const theme of ['light', 'dark']) {
  test(`panels ${theme}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1280, height: 800 })
    if (theme === 'dark')
      await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
    for (const name of ['Restart api', 'Staging database connection string', 'Weekly report SQL'])
      await createSnippet(page, name, 'select 1')
    await showPanel(page, 'snippets')
    for (const name of ['Restart api', 'Staging database connection string', 'Weekly report SQL'])
      await pin(page, name)
    await showPanel(page, 'tools')
    const cell = page.locator('.tt-cell', { hasText: 'JSON' }).first()
    await cell.hover()
    await cell.locator('.tt-pin').click()
    for (const [variant, css] of Object.entries(NAMES)) {
      await page.evaluate(
        (text) => {
          document.querySelector('#render-patch')?.remove()
          const style = document.createElement('style')
          style.id = 'render-patch'
          style.textContent = text
          document.head.append(style)
        },
        css === null ? '' : ICONS + css
      )
      await showPanel(page, 'home')
      await page.locator('.home-pin').nth(1).hover()
      await page.waitForTimeout(300)
      await page.screenshot({
        path: `${OUT}/${variant}-home-${theme}.png`,
        clip: { x: 0, y: 0, width: 312, height: 640 }
      })
      await showPanel(page, 'tools')
      await page.locator('.tt-cell').nth(4).hover()
      await page.waitForTimeout(300)
      await page.screenshot({
        path: `${OUT}/${variant}-tools-${theme}.png`,
        clip: { x: 0, y: 0, width: 312, height: 640 }
      })
    }
  })
}
