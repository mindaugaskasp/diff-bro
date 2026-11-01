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

// → drills into a tool from the end of the query.
async function enterBase64(ql) {
  await ql.locator('.ql-input').fill('base64')
  // Excluding the create row: hasText is a case-insensitive substring match, so
  // `Create snippet "base64"` matches 'Base64' too.
  await expect(ql.locator('.ql-res:not(.ql-res-create)', { hasText: 'Base64' })).toBeVisible()
  await ql.locator('.ql-input').press('ArrowRight')
  await expect(ql.locator('.qc-name')).toHaveText('Base64')
}

test('→ enters the tool and its panel converts inline', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await ql.getByLabel('Base64 input').fill('hello')
  await expect(ql.locator('.tb-text')).toHaveText('aGVsbG8=')
})

const launcherVisible = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) =>
      x.webContents.getURL().includes('quicklook')
    )
    return w ? w.isVisible() : false
  })

// Entering a tool lands the caret in its first field, so Escape works without
// clicking first — on body the keydown never reaches the panel's handler. Escape
// leaves the launcher from anywhere, a tool included.
test('Escape closes the launcher from a tool with no click first', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await expect(ql.getByLabel('Base64 input')).toBeFocused()
  await ql.keyboard.press('Escape')
  await expect.poll(() => launcherVisible(app), { timeout: 6000 }).toBe(false)
})

test('the ← key returns from an empty field to the list, and → comes back', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await ql.getByLabel('Base64 input').fill('')
  await ql.keyboard.press('ArrowLeft')
  await expect(ql.locator('.ql-input')).toBeFocused()
  await expect(ql.locator('.qc-name')).toBeHidden()
  await ql.locator('.ql-input').press('ArrowRight')
  await expect(ql.locator('.qc-name')).toHaveText('Base64')
})

test('the ← key moves the caret until it reaches the start, and the input survives', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  const input = ql.getByLabel('Base64 input')
  await input.fill('hi')
  await ql.keyboard.press('ArrowLeft')
  await ql.keyboard.press('ArrowLeft')
  await expect(ql.locator('.qc-name')).toBeVisible()
  await expect.poll(() => input.evaluate((el) => el.selectionStart)).toBe(0)
  await ql.keyboard.press('ArrowLeft')
  await expect(ql.locator('.ql-input')).toBeFocused()
  await ql.locator('.ql-input').press('ArrowRight')
  await expect(input).toHaveValue('hi')
})

test('the ← key closes the Tools section back to its row', async ({ app, page }) => {
  const ql = await summon(app, page)
  await expect(ql.locator('.ql-res.sel')).toContainText('Tools')
  await ql.locator('.ql-input').press('ArrowRight')
  await expect(ql.locator('.ql-res.sel')).not.toContainText('Tools')
  await ql.locator('.ql-input').press('ArrowLeft')
  await expect(ql.locator('.ql-res.sel')).toContainText('Tools')
  await expect(ql.locator('.ql-res', { hasText: 'Base64' })).toHaveCount(0)
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

// Leaving a panel used to destroy it, so going back threw away whatever you had
// typed. Re-entering must find the work still there.
test('a tool panel keeps its input when you leave and come back', async ({ app, page }) => {
  const ql = await summon(app, page)
  await enterBase64(ql)
  await ql.getByLabel('Base64 input').fill('keep me')
  await expect(ql.locator('.tb-text')).toHaveText('a2VlcCBtZQ==')

  await ql.locator('.qc-back').click()
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
