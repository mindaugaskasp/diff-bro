import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openSettings,
  openSettingsPage,
  closeSettings
} from './fixtures.mjs'

// The registry ships no release tour, so fixtures are pushed into the store through Pinia.
const fixtureTour = (id, introducedIn, copy) => ({
  id,
  introducedIn,
  release: true,
  nameKey: `${copy}.title`,
  summaryKey: `${copy}.body`,
  hue: 'snippet',
  icon: 'code',
  labelKey: 'onboarding.snippets.label',
  steps: [
    {
      id: 'new',
      advanceOn: 'fixture-never',
      target: '[data-tour="snippet-new"]',
      side: 'right',
      titleKey: 'onboarding.snippets.new.title',
      bodyKey: 'onboarding.snippets.new.body'
    }
  ]
})
const NEW_SNIPPET = fixtureTour('fixture-snippet', '0.10.0', 'onboarding.snippets.new')
const OPEN_DIAGRAM = fixtureTour('fixture-diagram', '0.11.0', 'onboarding.diagrams.open')

const shipReleaseTours = (page, tours) =>
  page.evaluate((list) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    pinia._s.get('onboarding').registry.push(...list)
  }, tours)

const card = (page) => page.locator('[data-release-card]')
const settings = (page) => page.getByRole('dialog', { name: 'Settings' })
const EXISTING_USER = {
  schema: 2,
  offerTours: true,
  tours: {},
  offer: false,
  version: '0.9.0',
  tips: { on: false }
}

async function launchProfile(dir) {
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)
  await page.locator('.start-surface').waitFor()
  return { app, page }
}

let dir
test.beforeEach(() => {
  dir = freshUserDataDir()
  writeFileSync(join(dir, 'onboarding.json'), JSON.stringify(EXISTING_USER))
})
test.afterEach(() => rmSync(dir, { recursive: true, force: true }))

test('a release tour is offered once, bottom right; Later keeps it New', async () => {
  let { app, page } = await launchProfile(dir)
  try {
    await shipReleaseTours(page, [NEW_SNIPPET])
    await expect(card(page)).toBeVisible()
    await expect(card(page).locator('.rc-kicker')).toHaveText('New in 0.10.0')
    await expect(card(page).locator('.rc-title')).toHaveText('Keep text you reuse')
    await expect(card(page).locator('.rc-body')).toHaveText('Press + to start a snippet.')
    await expect(card(page).locator('.btn-ghost')).toHaveText('Later')
    await expect(card(page).locator('.btn-primary')).toHaveText('Show me · 1 step')
    const box = await card(page).boundingBox()
    const view = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
    expect(Math.round(view.w - box.x - box.width)).toBe(16)
    expect(Math.round(view.h - box.y - box.height)).toBe(16)

    await card(page).getByRole('button', { name: 'Later' }).click()
    await expect(card(page)).toHaveCount(0)
    await openSettingsPage(page, 'Tours')
    await expect(settings(page).locator('.ts-sub').first()).toHaveText('New in 0.10.0')
    const row = settings(page).locator('[data-tour-row="fixture-snippet"]')
    await expect(row.locator('.new-badge')).toHaveText('New')
    await expect(row.getByRole('button', { name: 'Start' })).toBeVisible()
  } finally {
    await app.close()
  }

  ;({ app, page } = await launchProfile(dir))
  try {
    await shipReleaseTours(page, [NEW_SNIPPET])
    await openSettingsPage(page, 'Tours')
    await expect(
      settings(page).locator('[data-tour-row="fixture-snippet"] .new-badge')
    ).toBeVisible()
    await closeSettings(page)
    await expect(settings(page)).toHaveCount(0)
    await page.waitForTimeout(500)
    await expect(card(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('× closes the card, and the tour is no longer New', async () => {
  const { app, page } = await launchProfile(dir)
  try {
    await shipReleaseTours(page, [NEW_SNIPPET])
    await card(page).getByRole('button', { name: 'Close' }).click()
    await expect(card(page)).toHaveCount(0)
    await openSettingsPage(page, 'Tours')
    const row = settings(page).locator('[data-tour-row="fixture-snippet"]')
    await expect(row).toBeVisible()
    await expect(row.locator('.new-badge')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('Show me starts the tour', async () => {
  const { app, page } = await launchProfile(dir)
  try {
    await shipReleaseTours(page, [NEW_SNIPPET])
    await card(page).getByRole('button', { name: 'Show me · 1 step' }).click()
    await expect(card(page)).toHaveCount(0)
    await expect(page.locator('.coach-mark')).toContainText('Snippets · 1 of 1')
  } finally {
    await app.close()
  }
})

test('the card waits for an open dialog to close', async () => {
  const { app, page } = await launchProfile(dir)
  try {
    await openSettings(page)
    await shipReleaseTours(page, [NEW_SNIPPET])
    await page.waitForTimeout(300)
    await expect(card(page)).toHaveCount(0)
    await closeSettings(page)
    await expect(settings(page)).toHaveCount(0)
    await expect(card(page)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('several skipped releases give one card that opens Settings ▸ Tours', async () => {
  const { app, page } = await launchProfile(dir)
  try {
    await shipReleaseTours(page, [NEW_SNIPPET, OPEN_DIAGRAM])
    await expect(card(page)).toHaveCount(1)
    await expect(card(page).locator('.rc-kicker')).toHaveText('New in 0.11.0')
    await expect(card(page).locator('.rc-title')).toHaveText(
      '2 new tours since you last opened Diff Bro'
    )
    await expect(card(page).locator('.rc-body')).toHaveText(
      'Keep text you reuse and Open the example diagram'
    )
    await card(page).getByRole('button', { name: 'Show tours' }).click()
    await expect(card(page)).toHaveCount(0)
    await expect(settings(page)).toBeVisible()
    await expect(
      settings(page).locator('.settings-nav').getByRole('button', { name: 'Tours', exact: true })
    ).toHaveAttribute('aria-current', 'page')
    await expect(settings(page).locator('.ts-sub')).toHaveText([
      'New in 0.11.0',
      'New in 0.10.0',
      'After an update',
      'Daily tips'
    ])
    await expect(settings(page).locator('.new-badge')).toHaveCount(2)
  } finally {
    await app.close()
  }
})

test('a fresh install is never offered a release tour', async () => {
  rmSync(join(dir, 'onboarding.json'))
  const { app, page } = await launchProfile(dir)
  try {
    await expect(page.locator('.sample-offer')).toBeVisible()
    await shipReleaseTours(page, [NEW_SNIPPET])
    await page.waitForTimeout(500)
    await expect(card(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})
