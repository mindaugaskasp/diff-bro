import { test, expect, openSettings } from './fixtures.mjs'

// The Settings window is split into domain panes behind a left rail; only the
// selected pane renders. This guards that the rail actually swaps panes (a
// layout/interaction seam that used to be one long scroll).
test.describe('Settings domain panes', () => {
  test('opens on Appearance and switches panes from the left rail', async ({ page }) => {
    await openSettings(page)

    // Appearance is the default pane: theme swatches + the shortcut-bar toggle.
    await expect(page.getByTitle('Use the Light theme')).toBeVisible()
    await expect(page.getByText('Show the keyboard-shortcut bar over diffs')).toBeVisible()
    // Other panes' content is not mounted yet.
    await expect(page.getByRole('heading', { name: 'Data folder' })).toBeHidden()

    // Storage pane.
    await page.getByRole('button', { name: 'Storage', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Data folder' })).toBeVisible()
    await expect(page.getByTitle('Use the Light theme')).toBeHidden()

    // Limits pane.
    await page.getByRole('button', { name: 'Limits', exact: true }).click()
    await expect(page.getByText('Max comparison file (MB)')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Data folder' })).toBeHidden()
  })
})
