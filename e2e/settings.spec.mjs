import { test, expect, openSettings } from './fixtures.mjs'

// The Settings window is split into domain panes behind a left rail; only the
// selected pane renders. This guards that the rail actually swaps panes (a
// layout/interaction seam that used to be one long scroll).
test.describe('Settings domain panes', () => {
  test('opens on Appearance and switches panes from the left rail', async ({ page }) => {
    await openSettings(page)

    // Appearance is the default pane: theme swatches + the shortcut-bar toggle.
    await expect(page.getByRole('button', { name: 'Use the Light theme' })).toBeVisible()
    await expect(page.getByText('Show the keyboard-shortcut bar over diffs')).toBeVisible()
    // Other panes' content is not mounted yet.
    await expect(page.getByRole('heading', { name: 'Data folder' })).toBeHidden()

    // Storage pane.
    await page.getByRole('button', { name: 'Storage', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Data folder' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use the Light theme' })).toBeHidden()

    // Limits pane (per-file-type size caps).
    await page.getByRole('button', { name: 'Limits', exact: true }).click()
    await expect(page.getByText('Max Spreadsheet (.xlsx) file (MB)')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Data folder' })).toBeHidden()

    // Logs pane.
    await page.getByRole('button', { name: 'Logs', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible()
  })
})

// Every Settings pane links the shared pane CSS. CliSettings did not, and
// scoped styles cannot reach into a child — so the Terminal pane rendered its
// path as bare body text with no box at all.
test('the Terminal pane is styled like every other Settings pane', async ({ page }) => {
  await openSettings(page)
  const dialog = page.getByRole('dialog', { name: 'Settings' })

  await dialog.getByRole('button', { name: 'Storage', exact: true }).click()
  const storageBox = await dialog.locator('.path').evaluate((el) => {
    const s = getComputedStyle(el)
    return { border: s.borderTopWidth, radius: s.borderTopLeftRadius, display: s.display }
  })
  expect(storageBox.display).toBe('flex')
  expect(parseFloat(storageBox.border)).toBeGreaterThan(0)

  await dialog.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(dialog.locator('.path')).toBeVisible()
  const cliBox = await dialog.locator('.path').evaluate((el) => {
    const s = getComputedStyle(el)
    return { border: s.borderTopWidth, radius: s.borderTopLeftRadius, display: s.display }
  })
  expect(cliBox).toEqual(storageBox)
})
