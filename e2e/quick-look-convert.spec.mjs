import { test, expect } from './fixtures.mjs'

// Tools live in the Quick Look launcher (a second, transparent window): summon
// it via the same IPC the menu uses, then drive the DOM — the flow runs entirely
// in the launcher, so a value is converted without raising the app. Every tool
// renders its own rich panel there. (Screenshots are unreliable on the
// transparent/hide-on-blur window; DOM assertions are, because Playwright reads
// the page, not the OS window.)
async function summon(app, page) {
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-input')).toBeVisible()
  return ql
}

// → into a tool mirrors → into a snippet preview.
async function enterBase64(ql) {
  await ql.locator('.ql-input').fill('base64')
  await expect(ql.locator('.ql-res', { hasText: 'Base64' })).toBeVisible()
  await ql.locator('.ql-input').press('ArrowRight')
  await expect(ql.locator('.qc-name')).toHaveText('Base64')
}

test('→ enters the tool and its panel converts inline', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await ql.getByLabel('Base64 input').fill('hello')
  await expect(ql.locator('.tb-text')).toHaveText('aGVsbG8=')
})

// Entering a tool lands the caret in its first field, so Escape works without
// clicking first — on body the keydown never reaches the panel's handler.
test('Escape returns to the list with no click first', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await expect(ql.getByLabel('Base64 input')).toBeFocused()
  await ql.keyboard.press('Escape')
  await expect(ql.locator('.ql-input')).toBeVisible()
})

// ← is the mirror of the → that entered the panel. It must not fire while the
// caret can still move inside a field.
test('← returns to the list from the panel, but not mid-field', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await ql.getByLabel('Base64 input').fill('hello')
  await ql.keyboard.press('ArrowLeft') // caret is at the end — the field keeps it
  await expect(ql.locator('.qc-name')).toHaveText('Base64')

  await ql.getByLabel('Base64 input').fill('')
  await ql.keyboard.press('ArrowLeft') // nothing left to give up — back out
  await expect(ql.locator('.ql-input')).toBeVisible()
})

test('the back button returns to the list and navigation resumes', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await ql.locator('.qc-back').click()
  await expect(ql.locator('.ql-input')).toBeFocused() // focus restored to the search box
  await ql.keyboard.press('ArrowDown') // navigation works again
  await expect(ql.locator('.ql-res.sel')).toBeVisible()
})

test('a tool panel reports bad input instead of failing silently', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await ql.locator('.seg-opt', { hasText: 'Decode' }).click()
  await ql.getByLabel('Base64 input').fill('%%% not base64 %%%')
  await expect(ql.locator('.tb-err')).toBeVisible()
})

// Leaving a panel used to destroy it, so an accidental Escape threw away
// whatever you had typed. Re-entering must find the work still there.
test('a tool panel keeps its input when you leave and come back', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await ql.getByLabel('Base64 input').fill('keep me')
  await expect(ql.locator('.tb-text')).toHaveText('a2VlcCBtZQ==')

  await ql.keyboard.press('Escape')
  await expect(ql.locator('.ql-input')).toBeVisible()

  await enterBase64(ql)
  await expect(ql.getByLabel('Base64 input')).toHaveValue('keep me')
  await expect(ql.locator('.tb-text')).toHaveText('a2VlcCBtZQ==')
})

// Options are part of that state too — a re-entered panel that silently reset
// its mode would encode when you had asked it to decode.
test('a tool panel keeps its mode and options too', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await ql.locator('.seg-opt', { hasText: 'Decode' }).click()
  await ql.getByLabel('Base64 input').fill('a2VlcCBtZQ==')
  await expect(ql.locator('.tb-text')).toHaveText('keep me')

  await ql.locator('.qc-back').click()
  await enterBase64(ql)
  await expect(ql.locator('.seg-opt.on')).toHaveText('Decode')
  await expect(ql.locator('.tb-text')).toHaveText('keep me')
})
