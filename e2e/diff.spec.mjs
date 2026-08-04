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
  await expect(page.locator('.status-band .add')).toHaveText('1 added')
  await expect(page.locator('.status-band .del')).toContainText('0 removed')

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

// Monaco's diff worker throws "no diff result available" when it returns nothing
// because the models were replaced under it — which is what the re-diff above
// does. It guards the CANCELLED case and not this one. Left alone it reached the
// window as an unhandled rejection, raised the report dialog, and put a scrim
// across the app: the click that failed on CI was blocked by that backdrop, not
// by anything to do with the notice it was aiming at.
test('a diff worker losing a race with a model swap raises no dialog', async ({ page }) => {
  await page.evaluate(() => {
    // The shape the handler actually sees, not a synthetic call into the store.
    Promise.reject(new Error('no diff result available'))
  })
  await page.waitForTimeout(500)

  await expect(page.locator('.dialog-backdrop')).toHaveCount(0)
  await expect(page.locator('.err-msg')).toHaveCount(0)
})
