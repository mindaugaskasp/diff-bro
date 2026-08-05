import { test, expect, openMenu, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

// Tools is a sidebar section like the other three: every tool is reachable, a
// row opens its panel, and PINS decide the order. The shelf this replaced showed
// three of twelve and moved the tool you had just used to the front, so the row
// under the cursor changed as a side effect of clicking it.

const section = (page) => page.locator('.sidebar-section').filter({ hasText: 'Tools' })
const rows = (page) => section(page).locator('.row')
const names = (page) => rows(page).locator('.nm')

test('lists tools in registry order and opens one from its row', async ({ page }) => {
  // Six at rest plus the disclosure — the cap that keeps Tools from crowding
  // out the library above it.
  await expect(names(page)).toHaveText(['Base64', 'JSON', 'XML', 'UUID', 'JWT', 'Epoch'])
  await expect(section(page).locator('.disclosure')).toContainText('6 more tools')

  await rows(page).filter({ hasText: 'JSON' }).locator('.entry').click()
  await expect(page.getByRole('dialog', { name: 'JSON' })).toBeVisible()
})

test('the disclosure reveals the rest and folds them back', async ({ page }) => {
  await section(page).locator('.disclosure .entry').click()
  await expect(names(page)).toHaveCount(12)
  await expect(section(page).locator('.disclosure')).toContainText('Show fewer')

  await section(page).locator('.disclosure .entry').click()
  await expect(names(page)).toHaveCount(6)
})

test('pinning moves a tool to the top and marks the row', async ({ page }) => {
  const regex = rows(page).filter({ hasText: 'Regex' })
  await section(page).locator('.disclosure .entry').click() // Regex is past the resting six
  await regex.locator('.star').click()

  // Pinned rows head the list, so it is now first — and stays visible when the
  // list folds back, because a pin is not subject to the resting cap.
  await expect(names(page).first()).toHaveText('Regex')
  await expect(rows(page).first()).toHaveClass(/pinned/)
})

// The whole argument for pins over recents. Under the old shelf this assertion
// was false by construction: using a tool moved it to the front.
test('using a tool does not move it', async ({ page }) => {
  const before = await names(page).allTextContents()

  await openMenu(page, 'Tools', 'Epoch')
  await page.getByRole('dialog', { name: 'Epoch' }).waitFor()
  await page.keyboard.press('Escape')

  await expect(names(page)).toHaveText(before)
})

// Pins live in their own persisted store, which only a real launch proves: the
// name has to be in the main process's STORE_NAMES allowlist or store:save is
// rejected and the pin is silently dropped on quit.
test('a pin survives a relaunch', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  let page = await firstReadyPage(app)

  try {
    await rows(page).filter({ hasText: 'XML' }).locator('.star').click()
    await expect(rows(page).first()).toContainText('XML')
  } finally {
    await app.close()
  }

  app = await launchApp(dir)
  page = await firstReadyPage(app)
  try {
    await expect(names(page).first()).toHaveText('XML')
    await expect(rows(page).first()).toHaveClass(/pinned/)
  } finally {
    await app.close()
  }
})

test('the sidebar search filters tools alongside everything else', async ({ page }) => {
  await page.getByPlaceholder('Search diffs & snippets…').fill('encode')

  // Base64 and URL both declare the Encode kind; the search reaches it.
  await expect(names(page)).toHaveText(['Base64', 'URL'])
  // A filtered section reports its count, including the sections with none.
  await expect(section(page).locator('.section-count')).toHaveText('2')

  await page.getByPlaceholder('Search diffs & snippets…').fill('zzzz')
  await expect(section(page).locator('.empty')).toContainText('No tools match')
})

test('the section collapses and the Tools pill hides it', async ({ page }) => {
  // v-show, so the rows stay in the DOM — visibility is the assertion, not count.
  await section(page).locator('.section-head').click()
  await expect(names(page).first()).toBeHidden()
  await section(page).locator('.section-head').click()
  await expect(names(page).first()).toBeVisible()

  // The sidebar's own pill, not the menu bar's Tools menu.
  await page.locator('.usb-seg').getByRole('button', { name: 'Tools', exact: true }).click()
  await expect(section(page)).toBeHidden()
})
