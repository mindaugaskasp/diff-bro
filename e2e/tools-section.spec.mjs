import {
  test,
  expect,
  openMenu,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  showPanel
} from './fixtures.mjs'

const tiles = (page) => page.locator('.tool-tiles .tt-tile')
const names = (page) => tiles(page).locator('.tt-name')
const cell = (page, name) => page.locator('.tt-cell', { hasText: name })
const groups = (page) => page.locator('.tool-tiles .tt-head')

test('shows every tool, grouped by job, and opens one from its tile', async ({ page }) => {
  await showPanel(page, 'tools')
  await expect(tiles(page)).toHaveCount(12)
  await expect(groups(page)).toHaveText([
    'Encode',
    'Format',
    'Generate',
    'Inspect',
    'Secure & apply'
  ])

  await cell(page, 'JSON').locator('.tt-tile').click()
  await expect(page.getByRole('dialog', { name: 'JSON' })).toBeVisible()
})

test('pinning marks the tile and offers the tool on Home', async ({ page }) => {
  await showPanel(page, 'tools')
  const regex = cell(page, 'Regex')
  await regex.hover()
  await regex.locator('.tt-pin').click()
  await expect(regex.locator('.tt-pin')).toHaveAttribute('aria-pressed', 'true')

  await showPanel(page, 'home')
  const pinned = page.locator('.home-block', { hasText: 'Pinned' })
  await expect(pinned.getByRole('button', { name: /Regex/ })).toBeVisible()
})

test('a pin moves the tile into Pinned, and unpinning returns it', async ({ page }) => {
  await showPanel(page, 'tools')
  await cell(page, 'Regex').hover()
  await cell(page, 'Regex').locator('.tt-pin').click()

  await expect(groups(page).first()).toHaveText('Pinned')
  const pinnedGroup = page.locator('.tt-group').first()
  await expect(pinnedGroup.locator('.tt-name')).toHaveText(['Regex'])
  const inspect = page.locator('.tt-group', {
    has: page.locator('.tt-head', { hasText: 'Inspect' })
  })
  await expect(inspect.locator('.tt-name')).toHaveText(['JWT'])

  await pinnedGroup.locator('.tt-cell', { hasText: 'Regex' }).hover()
  await pinnedGroup.locator('.tt-pin').click()
  await expect(groups(page).first()).toHaveText('Encode')
  await expect(inspect.locator('.tt-name')).toHaveText(['JWT', 'Regex'])
})

test('using a tool does not move it', async ({ page }) => {
  await showPanel(page, 'tools')
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
    await showPanel(page, 'tools')
    await cell(page, 'XML').hover()
    await cell(page, 'XML').locator('.tt-pin').click()
    await expect(cell(page, 'XML').locator('.tt-pin')).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await app.close()
  }

  app = await launchApp(dir)
  page = await firstReadyPage(app)
  try {
    await showPanel(page, 'tools')
    await expect(cell(page, 'XML').locator('.tt-pin')).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await app.close()
  }
})

test('the panel search filters tools by name and by kind', async ({ page }) => {
  await showPanel(page, 'tools')
  await page.getByPlaceholder('Find a tool').fill('encode')

  // Base64 and URL both declare the Encode kind; the search reaches it.
  await expect(names(page)).toHaveText(['Base64', 'URL'])

  await page.getByPlaceholder('Find a tool').fill('zzzz')
  await expect(page.locator('.tt-empty')).toContainText('No tools match')
})
