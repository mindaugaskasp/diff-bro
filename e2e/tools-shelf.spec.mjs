import { test, expect, openMenu } from './fixtures.mjs'

// The tools shelf shows only your recents plus one way into the full list; the
// full list is the command palette in its tools scope. A launch proves the
// wiring, that recents are recorded from any path, and that they survive a
// relaunch (they live in persisted settings).

test('starts with no recents, opens the tools palette, and runs a tool from it', async ({
  page
}) => {
  await expect(page.locator('.usb-tools-search')).toContainText('Browse all tools')
  // A chip IS a recent — the way into the full list is a plain .btn, not one of
  // them — so with nothing used yet there are none, and the strip whose label
  // names them is absent rather than an empty row under a heading.
  await expect(page.locator('.usb-tool')).toHaveCount(0)
  await expect(page.locator('.usb-recent-strip')).toHaveCount(0)

  await page.locator('.usb-tool-all').click()
  const palette = page.locator('.cp')
  await expect(palette).toBeVisible()
  await expect(palette.getByPlaceholder('Search tools…')).toBeVisible()
  // No recents yet, so a single section listing every tool.
  await expect(palette.locator('.cp-row[data-section]')).toHaveCount(1)
  await expect(palette.locator('.cp-row[data-section]')).toHaveAttribute(
    'data-section',
    'All tools'
  )

  await palette.locator('.cp-input').fill('uui')
  await expect(palette.locator('.cp-row')).toHaveCount(1)
  await palette.locator('.cp-row').click()
  await expect(page.getByRole('dialog', { name: 'UUID' })).toBeVisible()
})

test('records recents from the menu and surfaces them in the shelf and palette', async ({
  page
}) => {
  for (const tool of ['JSON', 'Base64']) {
    await openMenu(page, 'Tools', tool)
    await page.getByRole('dialog', { name: tool }).waitFor()
    await page.keyboard.press('Escape')
  }

  // Most-recent-first, each with its own icon, ahead of the search control.
  await expect(page.locator('.usb-recent-strip')).toContainText('Recent tools')
  const chips = page.locator('.usb-tool')
  await expect(chips).toHaveCount(2)
  await expect(chips.nth(0)).toContainText('Base64')
  await expect(chips.nth(1)).toContainText('JSON')

  await page.locator('.usb-tool-all').click()
  const sections = page.locator('.cp .cp-row[data-section]')
  await expect(sections).toHaveCount(2)
  await expect(sections.nth(0)).toHaveAttribute('data-section', 'Recent')
  await expect(sections.nth(1)).toHaveAttribute('data-section', 'Other tools')
  // A recent tool must not also appear below — that read as a duplicate row.
  await expect(page.locator('.cp-row .cp-name', { hasText: /^Base64$/ })).toHaveCount(1)
  // The row carries an accurate action word, never a blanket "Convert".
  await expect(page.locator('.cp-row').first()).toContainText('Encode')
})

test('a recent chip opens its tool', async ({ page }) => {
  await openMenu(page, 'Tools', 'Lines')
  await page.getByRole('dialog', { name: 'Lines' }).waitFor()
  await page.keyboard.press('Escape')

  await page.locator('.usb-tool').first().click()
  await expect(page.getByRole('dialog', { name: 'Lines' })).toBeVisible()
})
