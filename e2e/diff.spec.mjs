import { test, expect, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

// A file moving under the comparison changes what you are looking at, so it is
// reported by a label that holds and can be dismissed — not the 5 s toast.
test('a change on disk raises a dismissible label', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-watch-'))
  const left = join(dir, 'alpha.txt')
  const right = join(dir, 'beta.txt')
  writeFileSync(left, 'one\ntwo\n')
  writeFileSync(right, 'one\nTWO\n')

  await stubOpenDialog(app, left)
  await page.locator('.slot[data-side="left"]').click()
  await stubOpenDialog(app, right)
  await page.locator('.slot[data-side="right"]').click()
  await expect(page.locator('.diff-container')).toBeVisible()
  await expect(page.locator('.disk-notice')).toHaveCount(0)

  writeFileSync(right, 'one\nTHREE\nfour\n')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))

  const label = page.locator('.disk-notice')
  await expect(label).toBeVisible()
  await expect(label).toContainText('beta.txt')
  await expect(label).toContainText('changed on disk')

  // It is still up well past the toast's five seconds…
  await page.waitForTimeout(6000)
  await expect(label).toBeVisible()

  // …and the × takes it away at once.
  await label.getByRole('button', { name: /Dismiss/ }).click()
  await expect(label).toHaveCount(0)

  rmSync(dir, { recursive: true, force: true })
})
