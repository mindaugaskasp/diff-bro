import { test, expect, openSettings, showPanel } from './fixtures.mjs'

test('Home search with no match says so, rather than "nothing here yet"', async ({ page }) => {
  await showPanel(page, 'home')
  await page.locator('.usb-top input[type="search"]').fill('zzzz-no-such-thing')
  const empty = page.locator('.home-empty')
  await expect(empty).toBeVisible()
  await expect(empty).not.toContainText('Nothing here yet')
  await expect(empty).toContainText('Nothing matches')
})

test('the delete confirm keeps a space between its sentences', async ({ page }) => {
  await showPanel(page, 'home')
  const item = page.locator('.home .home-item', { hasText: 'Example' }).first()
  await item.hover()
  await item.getByRole('button', { name: /^Delete / }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete snippet?' })
  await expect(confirm.locator('.dialog-note').first()).toContainText('”? This can’t be undone.')
})

test('Settings ▸ Storage lays out its backup row and hint like the rest', async ({ page }) => {
  await openSettings(page)
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByRole('button', { name: 'Storage' }).click()
  const row = settings.locator('.every')
  await expect(row).toBeVisible()
  const label = await row.locator('span').boundingBox()
  const select = await row.locator('select').boundingBox()
  expect(select.x).toBeGreaterThan(label.x + label.width - 1)

  const hint = settings.getByText('Taken after a save')
  const size = await hint.evaluate((el) => getComputedStyle(el).fontSize)
  expect(Number.parseFloat(size)).toBeLessThanOrEqual(12)
})

test('the Lines tool keeps room for its text, and its body scrolls', async ({ page }) => {
  await showPanel(page, 'tools')
  await page.locator('.tt-tile', { hasText: 'Lines' }).click()
  const dialog = page.getByRole('dialog', { name: 'Lines' })
  const input = dialog.locator('.tln-in')
  await input.fill(Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n'))

  expect((await input.boundingBox()).height).toBeGreaterThanOrEqual(88)
  const result = dialog.locator('.tln-text')
  await result.scrollIntoViewIfNeeded()
  const lines = await result.evaluate(
    (el) => el.clientHeight / Number.parseFloat(getComputedStyle(el).lineHeight)
  )
  expect(lines).toBeGreaterThanOrEqual(3)
})
