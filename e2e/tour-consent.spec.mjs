import { test, expect, firstReadyPage, launchApp, freshUserDataDir } from './fixtures.mjs'
import { rmSync } from 'node:fs'

test.use({ tips: true })

const consent = (page) => page.getByRole('dialog', { name: 'Take a one-minute tour?' })
const callout = (page) => page.locator('.tour-callout')

async function relaunched(dir, check) {
  const app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await page.locator('[data-tour="slots"]').waitFor()
    await page.waitForTimeout(400)
    await check(page)
  } finally {
    await app.close()
  }
}

test('a cold launch asks before any veil comes down', async ({ page }) => {
  await expect(consent(page)).toBeVisible()
  await expect(consent(page).locator('.tour-topics li')).toHaveCount(4)
  await expect(callout(page)).toHaveCount(0)
  await expect(page.locator('.tour-tint')).toHaveCount(0)

  await consent(page).getByRole('button', { name: 'Start tour' }).click()
  await expect(consent(page)).toBeHidden()
  await expect(callout(page).locator('.tour-step-n')).toHaveText('Step 1 of 8')
})

test('No thanks ends it for good, across a relaunch', async () => {
  const dir = freshUserDataDir({ tips: true })
  try {
    await relaunched(dir, async (page) => {
      await consent(page).getByRole('button', { name: 'No thanks' }).click()
      await expect(consent(page)).toBeHidden()
      await expect(callout(page)).toHaveCount(0)
    })
    await relaunched(dir, async (page) => {
      await expect(consent(page)).toBeHidden()
      await expect(callout(page)).toHaveCount(0)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Escape on the question is "not now": it asks again next launch', async () => {
  const dir = freshUserDataDir({ tips: true })
  try {
    await relaunched(dir, async (page) => {
      await expect(consent(page)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(consent(page)).toBeHidden()
      await expect(callout(page)).toHaveCount(0)
    })
    await relaunched(dir, async (page) => {
      await expect(consent(page)).toBeVisible()
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Escape during the tour ends it, and it stays gone across a relaunch', async () => {
  const dir = freshUserDataDir({ tips: true })
  try {
    await relaunched(dir, async (page) => {
      await consent(page).getByRole('button', { name: 'Start tour' }).click()
      await expect(callout(page)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(callout(page)).toBeHidden()
    })
    await relaunched(dir, async (page) => {
      await expect(consent(page)).toBeHidden()
      await expect(callout(page)).toHaveCount(0)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
