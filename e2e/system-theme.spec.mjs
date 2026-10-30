import {
  test,
  expect,
  openSettings,
  saveSettings,
  clickAppMenuItem,
  launchApp,
  freshUserDataDir,
  firstReadyPage
} from './fixtures.mjs'

// Playwright pins prefers-color-scheme to light unless told not to, which is
// also what keeps every other spec light on a dark Mac.
const launchFollowingOs = (dir) => launchApp(dir, { colorScheme: 'no-override' })

const setOs = (app, mode) =>
  app.evaluate(({ nativeTheme }, value) => {
    nativeTheme.themeSource = value
  }, mode)

const shown = (page) => page.evaluate(() => document.documentElement.dataset.theme)
const pickedTile = (page) => page.locator('.theme-tile.active')

const withApp = (run) => async () => {
  const dir = freshUserDataDir()
  const app = await launchFollowingOs(dir)
  try {
    await run({ app, page: await firstReadyPage(app) })
  } finally {
    await app.close()
  }
}

test(
  'a fresh install follows the OS, live',
  withApp(async ({ app, page }) => {
    await setOs(app, 'dark')
    await expect.poll(() => shown(page)).toBe('dark')
    await setOs(app, 'light')
    await expect.poll(() => shown(page)).toBe('light')

    await openSettings(page)
    await expect(pickedTile(page)).toHaveCount(1)
    await expect(pickedTile(page)).toContainText('System')
  })
)

test(
  'a named theme ignores the OS, and System takes it back',
  withApp(async ({ app, page }) => {
    await setOs(app, 'light')
    await openSettings(page)
    await page.locator('.theme-tile', { hasText: 'Nord' }).click()
    await saveSettings(page)
    await setOs(app, 'dark')
    await page.waitForTimeout(100)
    expect(await shown(page)).toBe('nord')

    await openSettings(page)
    await page.locator('.theme-tile', { hasText: 'System' }).click()
    await saveSettings(page)
    await expect.poll(() => shown(page)).toBe('dark')
  })
)

test(
  'Toggle Light/Dark flips what is showing and leaves System',
  withApp(async ({ app, page }) => {
    await setOs(app, 'dark')
    await expect.poll(() => shown(page)).toBe('dark')
    await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
    await expect.poll(() => shown(page)).toBe('light')

    await setOs(app, 'light')
    await setOs(app, 'dark')
    await page.waitForTimeout(100)
    expect(await shown(page)).toBe('light')
    await openSettings(page)
    await expect(pickedTile(page)).toContainText('Light')
  })
)

test('a saved Light survives a relaunch on a dark OS', async () => {
  const dir = freshUserDataDir()
  let app = await launchFollowingOs(dir)
  let page = await firstReadyPage(app)
  await openSettings(page)
  await page.locator('.theme-tile', { hasText: 'Light' }).first().click()
  await saveSettings(page)
  await app.close()

  app = await launchFollowingOs(dir)
  try {
    page = await firstReadyPage(app)
    await setOs(app, 'dark')
    await page.waitForTimeout(100)
    expect(await shown(page)).toBe('light')
  } finally {
    await app.close()
  }
})

test(
  'Quick Look follows the OS too',
  withApp(async ({ app, page }) => {
    await setOs(app, 'dark')
    await expect.poll(() => shown(page)).toBe('dark')
    const [launcher] = await Promise.all([
      app.waitForEvent('window'),
      page.evaluate(() => window.api.quickLookToggle())
    ])
    await launcher.waitForLoadState('domcontentloaded')
    await expect.poll(() => shown(launcher)).toBe('dark')
    await setOs(app, 'light')
    await expect.poll(() => shown(launcher)).toBe('light')
  })
)
