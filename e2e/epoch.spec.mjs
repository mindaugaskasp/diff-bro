import { test, expect, openMenu } from './fixtures.mjs'

// The Epoch tool is a rich panel (ToolEpoch), not a Monaco buffer — a launch
// proves the menu → panel → pure-util wiring and the per-row OS-clipboard write.

test('epoch → date rows render and a row copies to the clipboard', async ({ app, page }) => {
  await openMenu(page, 'Tools', 'Epoch / Date')
  const dlg = page.getByRole('dialog', { name: 'Epoch' })
  await expect(dlg).toBeVisible()

  await dlg.getByLabel('Unix timestamp').fill('0')
  const isoRow = dlg.locator('.te-res', { hasText: 'ISO 8601' })
  await expect(isoRow.locator('.te-res-v')).toHaveText('1970-01-01T00:00:00.000Z')

  await isoRow.getByRole('button').click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe('1970-01-01T00:00:00.000Z')
})

test('a picked date converts to its Unix timestamp', async ({ page }) => {
  await openMenu(page, 'Tools', 'Epoch / Date')
  const dlg = page.getByRole('dialog', { name: 'Epoch' })
  await dlg.getByLabel('Date and time, as YYYY-MM-DD HH:MM').fill('2025-07-30 13:00')
  const expected = String(Math.floor(Date.parse('2025-07-30T13:00Z') / 1000))
  await expect(dlg.locator('.te-out-v')).toHaveText(expected)
})
