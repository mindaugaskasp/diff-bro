import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openSettingsPage,
  saveSettings
} from './fixtures.mjs'
import { expectRinged } from './onboardingTour.mjs'

// Today's tip already shown, so the launch's own focus brings none and each test moves the seam on.
const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const TIPS_ON = {
  schema: 2,
  offerTours: true,
  tours: {},
  offer: false,
  tips: { on: true, shownOn: TODAY }
}
const card = (page) => page.locator('.daily-tip')
const settings = (page) => page.getByRole('dialog', { name: 'Settings' })
const tipsSwitch = (page) =>
  settings(page).locator('.setting-toggle', { hasText: 'Show a tip each day' })
const bringBack = (page) =>
  settings(page).getByRole('button', { name: 'Bring back tips I said I knew' })

// The store's `today` is the date seam: the clock moves without touching the OS.
const setDay = (page, day) =>
  page.evaluate((d) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    pinia._s.get('onboarding').today = () => d
  }, day)
const comeToFront = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')))

async function frontOn(page, day) {
  await setDay(page, day)
  await comeToFront(page)
}

async function launchProfile(dir) {
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)
  await page.locator('.start-surface').waitFor()
  return { app, page }
}

let dir
let app
let page
test.beforeEach(async () => {
  dir = freshUserDataDir()
  writeFileSync(join(dir, 'onboarding.json'), JSON.stringify(TIPS_ON))
  ;({ app, page } = await launchProfile(dir))
})
test.afterEach(async () => {
  await app?.close()
  rmSync(dir, { recursive: true, force: true })
})

test('a tip shows top right on the first focus of a day, and not again that day', async () => {
  await frontOn(page, '2030-01-01')
  await expect(card(page)).toBeVisible()
  await expect(card(page).locator('.dt-kicker')).toHaveText('Did you know?')
  await expect(card(page).locator('.dt-title')).toHaveText('Type # to search one tag')
  await expect(card(page).locator('.tip-body')).toHaveText(
    'Start a sidebar search with # and a tag name to show only that tag and the tags nested under it.'
  )
  await expect(card(page).locator('.dt-off')).toHaveText('Don’t show tips again')
  await expect(card(page).locator('.btn-ghost')).toHaveText('Knew this already')
  await expect(card(page).locator('.btn-primary')).toHaveText('Show me')
  const box = await card(page).boundingBox()
  const pane = await page.locator('[data-tour="pane"]').boundingBox()
  const width = await page.evaluate(() => innerWidth)
  expect(Math.round(box.width)).toBe(390)
  expect(Math.round(width - box.x - box.width)).toBe(16)
  expect(Math.round(box.y - pane.y)).toBe(16)

  await card(page).getByRole('button', { name: 'Close' }).click()
  await expect(card(page)).toHaveCount(0)
  await comeToFront(page)
  await page.waitForTimeout(300)
  await expect(card(page)).toHaveCount(0)
})

test('the next day brings the next tip', async () => {
  await frontOn(page, '2030-01-01')
  await card(page).getByRole('button', { name: 'Close' }).click()
  await frontOn(page, '2030-01-02')
  await expect(card(page).locator('.dt-title')).toHaveText('Colour a snippet to spot it fast')
})

test('Knew this already removes the tip; Bring back restores it', async () => {
  await frontOn(page, '2030-01-01')
  await card(page).getByRole('button', { name: 'Knew this already' }).click()
  await expect(card(page)).toHaveCount(0)

  await openSettingsPage(page, 'Tours')
  await expect(settings(page).locator('.ts-sub').last()).toHaveText('Daily tips')
  await expect(tipsSwitch(page).locator('input')).toBeChecked()
  await expect(bringBack(page)).toBeEnabled()
  await bringBack(page).click()
  await expect(settings(page).getByRole('status')).toHaveText('Those tips will show again.')
  await expect(bringBack(page)).toBeDisabled()
  await saveSettings(page)

  await frontOn(page, '2030-01-02')
  await expect(card(page).locator('.dt-title')).toHaveText('Type # to search one tag')
})

test('Don’t show tips again stops them', async () => {
  await frontOn(page, '2030-01-01')
  await card(page).getByRole('button', { name: 'Don’t show tips again' }).click()
  await expect(card(page)).toHaveCount(0)
  await frontOn(page, '2030-01-02')
  await page.waitForTimeout(300)
  await expect(card(page)).toHaveCount(0)
  await openSettingsPage(page, 'Tours')
  await expect(tipsSwitch(page).locator('input')).not.toBeChecked()
})

test('Show me opens the sidebar and rings its search; any click ends it', async () => {
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    pinia._s.get('settings').setSidebarCollapsed(true)
  })
  await frontOn(page, '2030-01-01')
  await card(page).getByRole('button', { name: 'Show me' }).click()
  await expect(card(page)).toHaveCount(0)
  const search = page.locator('[data-tour="search"]')
  await expect(search).toBeVisible()
  await expect(page.locator('.tip-note')).toHaveText('Type # and a tag name here.')
  await expectRinged(page, search)
  await page.mouse.click(600, 400)
  await expect(page.locator('.tip-note')).toHaveCount(0)
  await expect(page.locator('.target-ring')).toHaveCount(0)
})

test('a tip waits for a dialog to close', async () => {
  await openSettingsPage(page, 'Tours')
  await frontOn(page, '2030-01-01')
  await page.waitForTimeout(300)
  await expect(card(page)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(settings(page)).toHaveCount(0)
  await expect(card(page)).toBeVisible()
})

test('the switch persists across a relaunch', async () => {
  await openSettingsPage(page, 'Tours')
  await tipsSwitch(page).locator('input').uncheck()
  await saveSettings(page)
  await app.close()
  ;({ app, page } = await launchProfile(dir))
  await openSettingsPage(page, 'Tours')
  await expect(tipsSwitch(page).locator('input')).not.toBeChecked()
})

test('a fresh install’s first day shows no tip before the core tour ends', async () => {
  await app.close()
  rmSync(dir, { recursive: true, force: true })
  dir = freshUserDataDir({ tips: true })
  ;({ app, page } = await launchProfile(dir))
  await expect(page.locator('.sample-offer')).toBeVisible()
  await comeToFront(page)
  await page.waitForTimeout(300)
  await expect(card(page)).toHaveCount(0)
  await page.locator('.sample-offer').getByRole('button', { name: 'Skip' }).click()
  await expect(card(page)).toBeVisible()
})
