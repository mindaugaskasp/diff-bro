import { test, expect } from './fixtures.mjs'

// The card stays one size, and neither the chord nor Escape drops an unsaved draft.

const launcher = (app, read) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) =>
      x.webContents.getURL().includes('quicklook')
    )
    return w ? { bounds: w.getBounds(), visible: w.isVisible() } : null
  }, read)

const bounds = async (app) => (await launcher(app)).bounds
const isVisible = async (app) => (await launcher(app))?.visible === true
const toggle = (page) => page.evaluate(() => window.api.quickLookToggle())

async function summon(app, page) {
  const [ql] = await Promise.all([app.waitForEvent('window'), toggle(page)])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-input')).toBeVisible()
  return ql
}

test('composing keeps the card the same size and in the same place', async ({ app, page }) => {
  const ql = await summon(app, page)
  const resting = await bounds(app)

  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await ql.locator('.ql-compose-text').fill('line one\nline two')
  expect(await bounds(app)).toEqual(resting)

  await ql.locator('.ql-compose-back').click()
  await expect(ql.locator('.ql-compose')).toBeHidden()
  expect(await bounds(app)).toEqual(resting)
})

test('a re-summon keeps an unsaved draft', async ({ app, page }) => {
  const ql = await summon(app, page)
  await ql.locator('.ql-add').click()
  await ql.locator('.ql-compose-text').fill('line one\nline two\nline three')
  const composing = await bounds(app)

  await toggle(page)
  await expect.poll(() => isVisible(app), { timeout: 4000 }).toBe(false)
  await toggle(page)
  await expect.poll(() => isVisible(app), { timeout: 4000 }).toBe(true)

  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-text')).toHaveValue('line one\nline two\nline three')
  expect(await bounds(app)).toEqual(composing)
})

test('Escape from the sheet closes the launcher and keeps the draft', async ({ app, page }) => {
  const ql = await summon(app, page)
  await ql.locator('.ql-add').click()
  await ql.locator('.ql-compose-text').fill('half written')

  await ql.keyboard.press('Escape')
  await expect.poll(() => isVisible(app), { timeout: 4000 }).toBe(false)
  await toggle(page)
  await expect.poll(() => isVisible(app), { timeout: 4000 }).toBe(true)

  await expect(ql.locator('.ql-compose-text')).toHaveValue('half written')
})

// The other half of the rule: with nothing at stake a summon is still a fresh
// start, or a stale query outlives the search that typed it.
test('a summon with nothing typed into it still starts clean', async ({ app, page }) => {
  const ql = await summon(app, page)
  await ql.locator('.ql-input').fill('mermaid')
  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()

  await toggle(page)
  await expect.poll(() => isVisible(app), { timeout: 4000 }).toBe(false)
  await toggle(page)

  await expect(ql.locator('.ql-compose')).toBeHidden()
  await expect(ql.locator('.ql-input')).toHaveValue('')
})

test('the ← key leaves an untouched sheet for the list', async ({ app, page }) => {
  const ql = await summon(app, page)
  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose-text')).toBeFocused()
  await ql.keyboard.press('ArrowLeft')
  await expect(ql.locator('.ql-compose')).toBeHidden()
  await expect(ql.locator('.ql-input')).toBeFocused()
})

test('the ← key never leaves a sheet with unsaved work', async ({ app, page }) => {
  const ql = await summon(app, page)
  await ql.locator('.ql-add').click()
  await ql.locator('.ql-compose-text').fill('half a thought')
  await ql.locator('.ql-compose-text').press('Home')
  await ql.keyboard.press('ArrowLeft')
  await expect(ql.locator('.ql-compose-text')).toHaveValue('half a thought')
})
