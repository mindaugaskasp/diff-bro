import { expect } from './fixtures.mjs'

export async function expectRinged(page, target, ring = page.locator('.target-ring').first()) {
  const box = await target.boundingBox()
  const around = await ring.boundingBox()
  expect(around.x).toBeLessThan(box.x)
  expect(around.y).toBeLessThan(box.y)
  expect(around.x + around.width).toBeGreaterThan(box.x + box.width)
  expect(around.y + around.height).toBeGreaterThan(box.y + box.height)
}

export async function finishCoreTour(page) {
  await page
    .locator('.sample-offer .so-chip', { hasText: 'config-v1.json' })
    .dragTo(page.locator('.content'))
  await page.locator('[data-tour="save"]').click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.locator('.usb-top input[type="search"]').fill('conf')
  await expect(page.locator('.tour-done')).toContainText('That’s the core: compare, keep, find.')
}
