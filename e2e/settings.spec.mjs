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

// The dialog resized under the pointer as you moved down the rail: 364px on
// Fun, 720px on Storage. The rail is a fixed target, so the window jumping
// 356px between two clicks moves the next item out from under the cursor.
// `.settings-pane` already carried a min-height meant to prevent exactly this;
// it was 232px, shorter than every pane that shipped after it was written.
test('the dialog keeps one height across every pane', async ({ page }) => {
  await openSettings(page)
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  const tabs = ['Appearance', 'Shortcuts', 'Storage', 'Limits', 'Logs', 'Email', 'Terminal', 'Fun']

  const heights = {}
  for (const name of tabs) {
    await dialog.getByRole('button', { name, exact: true }).click()
    await expect(dialog).toBeVisible()
    heights[name] = Math.round((await dialog.boundingBox()).height)
  }

  const seen = [...new Set(Object.values(heights))]
  expect(seen, `pane heights differ: ${JSON.stringify(heights)}`).toHaveLength(1)

  // A pane taller than the box scrolls inside it rather than growing the dialog.
  await dialog.getByRole('button', { name: 'Storage', exact: true }).click()
  const scrolls = await dialog
    .locator('.settings-pane')
    .evaluate(
      (el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto'
    )
  expect(scrolls).toBe(true)
})

// Two scroll-affordance defects, fixed together: the right-aligned controls
// crowded the bar (padding-right was --space-3), and the thumb was border-grey
// on a transparent track — invisible exactly when a pane had more below the
// fold. The pane's own scrollbar derives from --text, the one token guaranteed
// to read against the panel on every theme.
test('the pane that scrolls says so: a real gutter and a visible bar', async ({ page }) => {
  await openSettings(page)
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('button', { name: 'Storage', exact: true }).click()

  const metrics = await dialog.locator('.settings-pane').evaluate((el) => ({
    overflows: el.scrollHeight > el.clientHeight,
    paddingRight: parseFloat(getComputedStyle(el).paddingRight),
    barWidth: el.offsetWidth - el.clientWidth
  }))

  expect(metrics.overflows).toBe(true)
  expect(metrics.paddingRight).toBeGreaterThanOrEqual(16)
  // A bar that OCCUPIES width is the whole point: macOS overlay bars take no
  // layout space and only paint mid-scroll, which is exactly the "nothing says
  // there is more below" this test exists to prevent.
  expect(metrics.barWidth).toBeGreaterThanOrEqual(6)
})
