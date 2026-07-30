import { test, expect } from './fixtures.mjs'

// Text-convert tools live in the Quick Look launcher (a second, transparent
// window): summon it via the same IPC the menu uses, then drive the DOM — the
// flow runs entirely in the launcher, so text is converted without raising the
// app. HTML Entities is the vehicle (the rich tools render their own panel).
// (Screenshots are unreliable on the transparent/hide-on-blur window; DOM
// assertions are, because Playwright reads the page, not the OS window.)
async function summon(app, page) {
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-input')).toBeVisible()
  return ql
}

// → into a tool mirrors → into a snippet preview; the input auto-focuses so
// Escape returns to the list with no click.
async function enterHtml(ql) {
  await ql.locator('.ql-input').fill('html')
  await expect(ql.locator('.ql-res', { hasText: 'HTML Entities' })).toBeVisible()
  await ql.locator('.ql-input').press('ArrowRight')
  await expect(ql.locator('.qc-name')).toHaveText('HTML Entities')
  await expect(ql.locator('.qc-in')).toBeFocused()
}

test('→ enters the tool, converts inline, Tab reaches the output', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterHtml(ql)
  await ql.locator('.qc-in').fill('<a>')
  await expect(ql.locator('.qc-out')).toHaveValue('&lt;a&gt;')
  await ql.locator('.qc-in').press('Tab')
  await expect(ql.locator('.qc-out')).toBeFocused()
})

test('Escape returns to the list (input was auto-focused)', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterHtml(ql)
  await ql.keyboard.press('Escape')
  await expect(ql.locator('.ql-input')).toBeVisible()
})

test('← backs out and arrow navigation resumes on the list', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterHtml(ql)
  await ql.keyboard.press('ArrowLeft') // empty input, caret at 0 → back to list
  await expect(ql.locator('.ql-input')).toBeFocused() // focus restored to the search box
  await ql.keyboard.press('ArrowDown') // navigation works again
  await expect(ql.locator('.ql-res.sel')).toContainText('HTML Entities')
})

test('reports a conversion that fails', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterHtml(ql)
  await ql.locator('.qc-in').fill('&#x110000;') // out-of-range code point
  await expect(ql.locator('.qc-err')).toBeVisible()
})
