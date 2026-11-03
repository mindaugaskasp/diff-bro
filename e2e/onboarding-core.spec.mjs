import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, firstReadyPage, freshUserDataDir, launchApp } from './fixtures.mjs'

test.use({ tips: true })

const offer = (page) => page.locator('.sample-offer')
const coach = (page) => page.locator('.coach-mark')
const ring = (page) => page.locator('.target-ring')
const saveButton = (page) => page.locator('[data-tour="save"]')
const saveDialog = (page) => page.getByRole('dialog', { name: 'Save diff' })
const search = (page) => page.locator('.usb-top input[type="search"]')

async function dragChipIn(page) {
  await expect(offer(page)).toContainText('Try it · 1 of 3')
  await offer(page)
    .locator('.so-chip', { hasText: 'config-v1.json' })
    .dragTo(page.locator('.content'))
  await expect(page.locator('.pane-label[data-side="left"]')).toHaveText('config-v1.json')
  await expect(page.locator('.pane-label[data-side="right"]')).toHaveText('config-v2.json')
}

async function expectRinged(page, target) {
  const box = await target.boundingBox()
  const around = await ring(page).boundingBox()
  expect(around.x).toBeLessThan(box.x)
  expect(around.y).toBeLessThan(box.y)
  expect(around.x + around.width).toBeGreaterThan(box.x + box.width)
  expect(around.y + around.height).toBeGreaterThan(box.y + box.height)
}

const storedVault = (page) => page.evaluate(() => JSON.parse(window.api.storeLoad('vault')).entries)

async function withProfile(dir, check) {
  const app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await page.locator('.start-surface').waitFor()
    await check(page)
  } finally {
    await app.close()
  }
}

test('drag, save and find: the whole core tour on a fresh install', async ({ page }) => {
  await expect(offer(page)).toContainText('No files handy? Drag these two into the window.')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await dragChipIn(page)
  await expect(offer(page)).toHaveCount(0)
  await expect(coach(page)).toContainText('Try it · 2 of 3')
  await expect(coach(page)).toContainText('Keep this comparison')
  await expect(coach(page).locator('.ql-kbd')).toHaveText(['Ctrl', 'S'])
  await expectRinged(page, saveButton(page))

  await saveButton(page).click()
  await saveDialog(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(saveDialog(page)).toHaveCount(0)
  const [saved] = await storedVault(page)
  expect(saved.tags).toEqual(['example'])
  expect(saved.expiresAt).toBeNull()

  await expect(coach(page)).toContainText('Try it · 3 of 3')
  await expect(coach(page)).toContainText('Find it again')
  await expectRinged(page, page.locator('[data-tour="search"]'))

  await search(page).fill('conf')
  await expect(coach(page)).toHaveCount(0)
  const done = page.locator('.tour-done')
  await expect(done).toContainText('That’s the core: compare, keep, find.')
  await done.getByRole('button', { name: 'Close' }).click()
  await expect(done).toHaveCount(0)
})

test('Escape during the Save step closes the dialog, not the tour', async ({ page }) => {
  await offer(page).getByRole('button', { name: 'Load them for me' }).click()
  await expect(coach(page)).toContainText('Keep this comparison')

  await saveButton(page).click()
  await expect(saveDialog(page)).toBeVisible()
  await expect(coach(page)).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(saveDialog(page)).toHaveCount(0)
  await expect(coach(page)).toContainText('Keep this comparison')
  await expectRinged(page, saveButton(page))
})

test('Skip ends the tour from the coach mark', async ({ page }) => {
  await offer(page).getByRole('button', { name: 'Load them for me' }).click()
  await coach(page).getByRole('button', { name: 'Skip' }).click()
  await expect(coach(page)).toHaveCount(0)
  await expect(ring(page)).toHaveCount(0)
  await page.locator('.diff-tabs .tab.active .tab-close').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.start-surface')).toBeVisible()
  await expect(offer(page)).toHaveCount(0)
})

test('Skip on the offer takes it away for good', async () => {
  const dir = freshUserDataDir({ tips: true })
  try {
    await withProfile(dir, async (page) => {
      await offer(page).getByRole('button', { name: 'Skip' }).click()
      await expect(offer(page)).toHaveCount(0)
    })
    await withProfile(dir, async (page) => {
      await page.waitForTimeout(300)
      await expect(offer(page)).toHaveCount(0)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a finished tour is not offered again, and its sample tab is not restored', async () => {
  const dir = freshUserDataDir({ tips: true })
  try {
    await withProfile(dir, async (page) => {
      await dragChipIn(page)
      await saveButton(page).click()
      await saveDialog(page).getByRole('button', { name: 'Save', exact: true }).click()
      await search(page).fill('conf')
      await expect(page.locator('.tour-done')).toBeVisible()
    })
    await withProfile(dir, async (page) => {
      await page.waitForTimeout(300)
      await expect(offer(page)).toHaveCount(0)
      await expect(page.locator('.pane-label')).toHaveCount(0)
      await search(page).fill('conf')
      await expect(page.locator('li.diff', { hasText: 'config-v1.json' })).toHaveCount(1)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an existing profile is offered nothing', async () => {
  const dir = freshUserDataDir({ tips: true })
  const old = { showTips: true, tourStep: 8, seenVersion: '0.5.0', deferred: 0 }
  writeFileSync(join(dir, 'onboarding.json'), JSON.stringify(old))
  try {
    await withProfile(dir, async (page) => {
      await page.waitForTimeout(300)
      await expect(offer(page)).toHaveCount(0)
      await expect(coach(page)).toHaveCount(0)
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
