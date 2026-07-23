import { test, expect } from './fixtures.mjs'

// Paste-compare is the one diff path that needs no native file dialog: type two
// texts, hit Compare, and Monaco must diff them. This proves the renderer's
// Monaco diff editor actually mounts, computes line changes, and reports them —
// jsdom has no layout, so the diff editor and its onDidUpdateDiff stats can't be
// exercised in a unit test.
test('paste-compare diffs two texts and reports the change stats', async ({ page }) => {
  // The empty state is what a fresh window shows; it must give way to the diff.
  await expect(page.getByText('Choose or drop two files to compare.')).toBeVisible()

  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('alpha\ngamma')
  await page.getByPlaceholder('Paste changed text here').fill('alpha\nZEBRA\ngamma')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()

  // The empty state is gone and the diff editor took over.
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()

  // One inserted line → one addition, no deletions, surfaced in the toolbar
  // stats (which only render once Monaco has finished a diff pass).
  await expect(page.locator('.stats .add')).toHaveText('+1')
  await expect(page.locator('.stats .del')).toContainText('0')

  // The inserted token exists only on the changed side, so seeing it confirms
  // Monaco painted the right model, not just that stats were computed.
  await expect(page.getByText('ZEBRA').first()).toBeVisible()
})
