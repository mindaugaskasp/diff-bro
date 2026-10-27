import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openSettings
} from './fixtures.mjs'

const settingsDialog = (page) => page.getByRole('dialog', { name: 'Settings', exact: true })
const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme)

test('a change previews live but is dropped unless saved', async ({ page }) => {
  await openSettings(page)
  const dlg = settingsDialog(page)
  await dlg.locator('.theme-tile', { hasText: 'Nord' }).click()
  expect(await theme(page)).toBe('nord')

  await dlg.locator('.dialog-actions').getByRole('button', { name: 'Close', exact: true }).click()
  const ask = page.getByRole('dialog', { name: 'Save your settings?' })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Discard' }).click()
  await expect(dlg).toBeHidden()
  expect(await theme(page)).toBe('light')
})

test('closing with nothing changed does not ask', async ({ page }) => {
  await openSettings(page)
  await settingsDialog(page)
    .locator('.dialog-actions')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(settingsDialog(page)).toBeHidden()
})

test('Keep editing leaves the draft open', async ({ page }) => {
  await openSettings(page)
  const dlg = settingsDialog(page)
  await dlg.locator('.theme-tile', { hasText: 'Nord' }).click()
  await dlg.locator('.dialog-actions').getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(dlg).toBeVisible()
  expect(await theme(page)).toBe('nord')
})

test('Save keeps the change across a relaunch; an unsaved one is gone', async () => {
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  let page = await firstReadyPage(app)
  await openSettings(page)
  const dlg = settingsDialog(page)
  await dlg.locator('.theme-tile', { hasText: 'Nord' }).click()
  await dlg.getByRole('button', { name: 'Save', exact: true }).click()
  await dlg.locator('.theme-tile', { hasText: 'Sepia' }).click()
  await app.close()

  app = await launchApp(dir)
  page = await firstReadyPage(app)
  expect(await theme(page)).toBe('nord')
  await app.close()
})

test('the sample text follows the zoom', async ({ page }) => {
  await openSettings(page)
  const dlg = settingsDialog(page)
  const sample = dlg.locator('.font-preview')
  const size = () => sample.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const before = await size()
  await dlg.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(size).toBeGreaterThan(before)
})
