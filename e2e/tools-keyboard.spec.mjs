import { test, expect } from './fixtures.mjs'

// The whole tool routine, keyboard only — the way it is actually used. These
// cover the seams a click-driven test walks straight past: what has focus when a
// panel opens, whether Tab can escape the dialog, and whether the launcher's
// arrow chain (list → section → panel → back) survives a refactor.

const TOOLS = [
  ['base', 'Base64'],
  ['json', 'JSON'],
  ['xml', 'XML'],
  ['jwt', 'JWT'],
  ['epoch', 'Epoch'],
  ['url', 'URL'],
  ['lines', 'Lines'],
  ['uuid', 'UUID']
]

test('every tool opens from the palette by typing, and Escape closes it', async ({ page }) => {
  for (const [query, name] of TOOLS) {
    await page.locator('.usb-tool-all').click()
    await expect(page.locator('.cp')).toBeVisible()
    await expect(page.locator('.cp-input')).toBeFocused()

    await page.keyboard.type(query)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name })).toBeHidden()
  }
})

test('a tool panel opens with the caret in its first field', async ({ page }) => {
  await page.locator('.usb-tool-all').click()
  await page.keyboard.type('json')
  await page.keyboard.press('Enter')
  const dlg = page.getByRole('dialog', { name: 'JSON' })
  await expect(dlg).toBeVisible()

  // Without this you cannot paste without reaching for the mouse.
  await expect(dlg.getByLabel('JSON', { exact: true })).toBeFocused()
  await page.keyboard.type('{"a":1}')
  await expect(dlg.locator('.tjs-text')).toContainText('"a": 1')
})

test('Tab cycles inside the dialog and never escapes it', async ({ page }) => {
  await page.locator('.usb-tool-all').click()
  await page.keyboard.type('uuid')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'UUID' })).toBeVisible()

  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    expect(inside, `focus left the dialog on Tab #${i + 1}`).toBe(true)
  }
})

test('the launcher arrow chain reaches a tool and comes back', async ({ app, page }) => {
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-input')).toBeVisible()

  // ↓ to the collapsed Tools header, → to expand it.
  const headerIndex = await ql
    .locator('.ql-res')
    .evaluateAll((rows) => rows.findIndex((r) => r.classList.contains('section')))
  for (let i = 0; i < headerIndex; i++) await ql.keyboard.press('ArrowDown')
  await expect(ql.locator('.ql-res.sel')).toContainText('Tools')
  await ql.keyboard.press('ArrowRight')
  await expect(ql.locator('.ql-res.sub').first()).toBeVisible()

  // ↓ onto a tool, → into its panel, with the caret in a field.
  await ql.keyboard.press('ArrowDown')
  await ql.keyboard.press('ArrowRight')
  await expect(ql.locator('.qc-name')).toBeVisible()
  await expect(ql.locator('.qc-panel input, .qc-panel textarea').first()).toBeFocused()

  // ← back out, and arrow navigation still works.
  await ql.keyboard.press('ArrowLeft')
  await expect(ql.locator('.ql-input')).toBeFocused()
  await ql.keyboard.press('ArrowDown')
  await expect(ql.locator('.ql-res.sel')).toBeVisible()
})

// The launcher window is short and the Lines panel is tall. With the caret in
// the first textarea, ArrowDown used to be swallowed by the field forever, so
// the result at the bottom was unreachable without a mouse.
test('a tall tool panel scrolls with the arrow keys in the launcher', async ({ app, page }) => {
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await ql.locator('.ql-input').fill('Lines')
  await ql.locator('.ql-input').press('ArrowRight')

  const panel = ql.locator('.qc-panel')
  await expect(panel).toBeVisible()
  const room = await panel.evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(room, 'the panel should overflow the launcher window').toBeGreaterThan(0)

  for (let i = 0; i < 12; i++) await ql.keyboard.press('ArrowDown')
  await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

  await ql.keyboard.press('PageUp')
  await expect.poll(() => panel.evaluate((el) => Math.round(el.scrollTop))).toBe(0)
})
