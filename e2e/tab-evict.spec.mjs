import { test, expect, openMenu, openSettings } from './fixtures.mjs'
import { MAX_TABS } from '../src/renderer/src/utils/tabs.js'

// Past the cap `open()` refuses, which for a reader who treats tabs as
// scroll-back is a stop sign in front of the thing they asked for. Opt-in,
// because a comparison evicted without being asked is work silently lost.
//
// Sixteen comparisons through the UI is slow, and there is no faster honest way
// to reach a full strip.
test.describe.configure({ timeout: 180_000 })

const tabCount = (page) => page.locator('.diff-tabs .tab').count()

async function fillStrip(page) {
  for (let i = 1; i < MAX_TABS; i++) await openMenu(page, 'File', 'New Comparison')
  await expect.poll(() => tabCount(page)).toBe(MAX_TABS)
}

test('the full strip still refuses while the setting is off', async ({ page }) => {
  await fillStrip(page)
  await openMenu(page, 'File', 'New Comparison')
  expect(await tabCount(page)).toBe(MAX_TABS)
  await expect(page.locator('.notice, .toast').first()).toContainText(/close one first/i)
})

async function turnOn(page) {
  await openSettings(page)
  await page.getByRole('button', { name: 'Storage' }).click()
  await page.getByRole('checkbox', { name: /close the oldest comparison/i }).check()
  await page.keyboard.press('Escape')
}

// A blank tab holds nothing to lose, so it goes without a word — which is the
// whole point of the setting.
test('with it on, a disposable oldest tab just goes', async ({ page }) => {
  await turnOn(page)
  await fillStrip(page)

  await openMenu(page, 'File', 'New Comparison')
  await expect.poll(() => tabCount(page)).toBe(MAX_TABS)
  await expect(page.getByRole('dialog', { name: 'Make room?' })).toHaveCount(0)
})

test('an oldest tab holding work asks first', async ({ page }) => {
  await turnOn(page)
  // Give the FIRST tab something to lose before the rest are opened.
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('work in progress')
  await fillStrip(page)

  await openMenu(page, 'File', 'New Comparison')
  const dialog = page.getByRole('dialog', { name: 'Make room?' })
  await expect(dialog).toBeVisible()
  expect(await tabCount(page)).toBe(MAX_TABS)

  // Keeping it open opens nothing — the strip is exactly as it was.
  await dialog.getByRole('button', { name: 'Keep it open' }).click()
  await expect(dialog).toBeHidden()
  expect(await tabCount(page)).toBe(MAX_TABS)

  await openMenu(page, 'File', 'New Comparison')
  await page
    .getByRole('dialog', { name: 'Make room?' })
    .getByRole('button', { name: 'Close it and open' })
    .click()
  await expect.poll(() => tabCount(page)).toBe(MAX_TABS)
  await expect(page.locator('.diff-tabs .tab', { hasText: 'work in progress' })).toHaveCount(0)
})
