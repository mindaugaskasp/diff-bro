import { rmSync } from 'node:fs'
import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openMenu,
  openSettingsPage,
  saveSettings
} from './fixtures.mjs'
import { finishCoreTour } from './onboardingTour.mjs'

const settings = (page) => page.getByRole('dialog', { name: 'Settings' })
const row = (page, id) => page.locator(`[data-tour-row="${id}"]`)
const offerSwitch = (page) =>
  settings(page).locator('.setting-toggle', { hasText: 'Offer new tours after an update' })

test('General ▸ Tours lists the three tours, each ready to start', async ({ page }) => {
  const dialog = await openSettingsPage(page, 'Tours')
  await expect(
    dialog.getByText('Short walk-throughs you do yourself, on sample content.')
  ).toBeVisible()
  await expect(dialog.locator('.tour-row .tr-name')).toHaveText([
    'Compare, keep, find',
    'Snippets',
    'Diagrams'
  ])
  await expect(row(page, 'core')).toContainText('3 steps · about 20 seconds')
  await expect(dialog.locator('.tour-row .btn')).toHaveText(['Start', 'Start', 'Start'])
  await expect(dialog.locator('.tour-row .tr-state, .tour-row .new-badge')).toHaveCount(0)
  await expect(dialog.locator('.tour-row .glyph-well')).toHaveCount(3)
  await expect(offerSwitch(page).locator('input')).toBeChecked()
})

test('Behaviour no longer holds Show tour or the old tips switch', async ({ page }) => {
  const dialog = await openSettingsPage(page, 'Behaviour')
  await expect(dialog.getByText('Play a shutter sound when a diff image is captured')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Show tour' })).toHaveCount(0)
  await expect(dialog.getByText('Show tips after an update')).toHaveCount(0)
})

test('Start runs the core tour; once done its row says Done and Replay', async ({ page }) => {
  await openSettingsPage(page, 'Tours')
  await row(page, 'core').getByRole('button', { name: 'Start' }).click()
  await expect(settings(page)).toHaveCount(0)
  await finishCoreTour(page)
  await page.locator('.tour-done').getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.tour-done')).toHaveCount(0)

  await openSettingsPage(page, 'Tours')
  await expect(row(page, 'core').locator('.tr-state')).toHaveText('Done')
  await row(page, 'core').getByRole('button', { name: 'Replay' }).click()
  await expect(settings(page)).toHaveCount(0)
  await expect(page.locator('.sample-offer')).toContainText('Try it · 1 of 3')
})

test('Start runs the Snippets and the Diagrams tours', async ({ page }) => {
  await openSettingsPage(page, 'Tours')
  await row(page, 'snippets').getByRole('button', { name: 'Start' }).click()
  await expect(settings(page)).toHaveCount(0)
  await expect(page.locator('.coach-mark')).toContainText('Snippets · 1 of 4')
  await page.locator('.coach-mark').getByRole('button', { name: 'Skip' }).click()

  await openSettingsPage(page, 'Tours')
  await expect(row(page, 'snippets').locator('.tr-state')).toHaveCount(0)
  await row(page, 'diagrams').getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('.coach-mark')).toContainText('Diagrams · 1 of 3')
})

test('Help ▸ Tours… opens Settings on the Tours page', async ({ page }) => {
  await openMenu(page, 'Help', 'Tours…')
  await expect(settings(page)).toBeVisible()
  await expect(
    settings(page).locator('.settings-nav').getByRole('button', { name: 'Tours', exact: true })
  ).toHaveAttribute('aria-current', 'page')
  await expect(settings(page).locator('.tour-row')).toHaveCount(3)
})

test('the update switch persists across a relaunch', async () => {
  const dir = freshUserDataDir()
  const withApp = async (check) => {
    const app = await launchApp(dir)
    try {
      await check(await firstReadyPage(app))
    } finally {
      await app.close()
    }
  }
  try {
    await withApp(async (page) => {
      await openSettingsPage(page, 'Tours')
      await offerSwitch(page).locator('input').uncheck()
      await saveSettings(page)
    })
    await withApp(async (page) => {
      await openSettingsPage(page, 'Tours')
      await expect(offerSwitch(page).locator('input')).not.toBeChecked()
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
