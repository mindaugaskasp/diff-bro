import { test, expect } from './fixtures.mjs'

// Composing in the launcher is WRITING, and it was being done in a card sized to
// read one line in. Two things have to hold: the window grows for the job, and
// pressing the chord twice — which is how the launcher is dismissed and brought
// back — does not take an unsaved draft with it.

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

// Main owns the resize, so the height is polled off the OS window rather than
// off anything the page can report about itself.
const height = (app) => expect.poll(async () => (await bounds(app)).height, { timeout: 4000 })

test('composing grows the card, and leaving it gives the size back', async ({ app, page }) => {
  const ql = await summon(app, page)
  const resting = await bounds(app)

  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await height(app).toBeGreaterThan(resting.height * 1.4)

  // It grew from where it already was — down and to the right. Re-centring
  // would slide the row under the pointer away mid-click, which is exactly what
  // ate two clicks on Edit.
  const grown = await bounds(app)
  expect(grown.width).toBeGreaterThan(resting.width)
  expect({ x: grown.x, y: grown.y }).toEqual({ x: resting.x, y: resting.y })

  await ql.getByRole('button', { name: 'Cancel' }).click()
  await height(app).toBe(resting.height)
})

test('a re-summon keeps an unsaved draft, and the card it was written in', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)
  await ql.locator('.ql-add').click()
  await ql.locator('.ql-compose-text').fill('line one\nline two\nline three')
  await height(app).toBeGreaterThan(600)
  const composing = await bounds(app)

  await toggle(page)
  await expect.poll(() => isVisible(app), { timeout: 4000 }).toBe(false)
  await toggle(page)
  await expect.poll(() => isVisible(app), { timeout: 4000 }).toBe(true)

  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-text')).toHaveValue('line one\nline two\nline three')
  expect((await bounds(app)).height).toBe(composing.height)
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
