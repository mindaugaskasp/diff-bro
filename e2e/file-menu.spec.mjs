import { rmSync } from 'node:fs'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage, openMenu } from './fixtures.mjs'

const fileItems = async (page) => {
  await page.locator('.menubar').getByRole('button', { name: 'File', exact: true }).click()
  const labels = await page.locator('.menubar .menu > .dropdown > .item').allTextContents()
  await page.keyboard.press('Escape')
  return labels.map((l) => l.trim())
}

test('File offers no Next or Previous Comparison, and Ctrl+Tab still moves between tabs', async ({
  page
}) => {
  const labels = await fileItems(page)
  expect(labels.some((l) => /Next Comparison|Previous Comparison/.test(l))).toBe(false)

  const tabs = page.locator('.diff-tabs .tab')
  const newTab = page
    .locator('.diff-tabs')
    .getByRole('button', { name: 'New comparison', exact: true })
  await newTab.click()
  await newTab.click()
  expect(await tabs.count()).toBeGreaterThanOrEqual(2)
  const active = () =>
    tabs.evaluateAll((els) => els.findIndex((el) => el.classList.contains('active')))
  const second = await active()
  await page.keyboard.press('Control+Tab')
  await expect.poll(active).not.toBe(second)
  await page.keyboard.press('Control+Shift+Tab')
  await expect.poll(active).toBe(second)
})

test('File ▸ Exit quits the app outright', async () => {
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    const closed = new Promise((resolve) => app.once('close', resolve))
    await openMenu(page, 'File', 'Exit')
    await closed
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})
