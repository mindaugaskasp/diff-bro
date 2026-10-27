import { test, expect, showPanel } from './fixtures.mjs'

// A comparison's controls over a snippet act on something nobody can see.
test('with a snippet in front, the comparison controls are disabled', async ({ page }) => {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()

  const bar = page.locator('.toolbar')
  for (const name of ['View', 'Paste mode', 'Save', 'Share', 'Copy diff', 'Capture']) {
    await expect(bar.getByRole('button', { name, exact: true }), name).toBeDisabled()
  }
  await expect(bar.getByRole('button', { name: 'Paste mode', exact: true })).toHaveAttribute(
    'data-tip',
    /For comparisons/
  )
})

test('back on a comparison, the controls come back', async ({ page }) => {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
  await page.getByRole('button', { name: 'New comparison' }).click()
  await expect(
    page.locator('.toolbar').getByRole('button', { name: 'Paste mode', exact: true })
  ).toBeEnabled()
  await expect(
    page.locator('.toolbar').getByRole('button', { name: 'View', exact: true })
  ).toBeEnabled()
})
