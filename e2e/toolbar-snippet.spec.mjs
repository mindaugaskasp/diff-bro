import { test, expect, showPanel, docActions } from './fixtures.mjs'

test('with a snippet in front, the toolbar holds its actions and none of a comparison', async ({
  page
}) => {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()

  const bar = page.locator('.toolbar')
  for (const name of ['View', 'Paste mode', 'Share', 'Copy diff']) {
    await expect(bar.getByRole('button', { name, exact: true }), name).toHaveCount(0)
  }
  await expect(bar.getByRole('button', { name: 'Save', exact: true })).toHaveCount(1)
  await expect(docActions(page).getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  await expect(page.locator('.snippet-doc:visible .doc-actions')).toHaveCount(0)
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
