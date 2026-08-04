import { test, expect } from './fixtures.mjs'

// Drive the diff through the one path that needs no native file dialog:
// paste-compare. Leaves a real Monaco diff mounted so the toolbar actions,
// stats and layout can be asserted against a live editor — the half jsdom
// can't see.
async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
}

// Copy diff must land a valid git-style unified patch on the OS clipboard. Like
// the snippet-copy test, this is the seam the deny-all permission handler
// breaks: the write goes through window.api.copyText -> clipboard:write (main),
// never navigator.clipboard. Reading the clipboard back from the main process
// proves the whole compute -> copyText -> clipboard round-trip, not just that a
// notice fired.
test('Copy diff writes a unified patch to the OS clipboard', async ({ app, page }) => {
  await pasteCompare(page, 'alpha\ngamma\n', 'alpha\nBETA\ngamma\n')

  const copy = page.getByRole('button', { name: 'Copy diff' })
  await expect(copy).toBeEnabled()
  await copy.click()
  await expect(page.getByText('Unified diff copied to clipboard.')).toBeVisible()

  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toMatch(/^--- /m) // ---/+++ file header
  expect(clip).toMatch(/^\+\+\+ /m)
  expect(clip).toMatch(/^@@ .* @@$/m) // at least one hunk
  expect(clip).toContain('+BETA') // the inserted line
  expect(clip).toContain(' alpha') // an unchanged context line
})

// Two identical sides surface an affirmative "No differences" instead of a bare
// +0/−0 that reads as "did it even run?".
test('identical sides show a No differences state and copy nothing', async ({ page }) => {
  await pasteCompare(page, 'same\nlines\n', 'same\nlines\n')

  // The "no differences" note is a row label over the diff panes, not a toolbar
  // stat — and the toolbar shows no empty +0/−0 counts in that state.
  await expect(page.locator('.diff-viewer .identical-row')).toContainText('No differences')
  await expect(page.locator('.diff-viewer .status-band')).toBeHidden()

  // Copy diff on an identical comparison explains itself rather than copying an
  // empty patch.
  await page.getByRole('button', { name: 'Copy diff' }).click()
  await expect(page.getByText('The two sides are identical — nothing to copy.')).toBeVisible()
})

// Pasted content carries no file extension, so highlighting depends on the
// adapter's content sniffing. Monaco tokenizes JSON into several token classes;
// plaintext would collapse to one. Seeing >= 2 distinct .mtk* classes proves a
// grammar is active — i.e. the paste is coloured, not dumped as plaintext.
test('pasted content is syntax-highlighted via content detection', async ({ page }) => {
  await pasteCompare(page, '{"name":"a","count":1}', '{"name":"b","count":2}')

  await expect
    .poll(() =>
      page.evaluate(() => {
        const set = new Set()
        document
          .querySelectorAll('.diff-container .view-lines span[class*="mtk"]')
          .forEach((s) =>
            s.className.split(/\s+/).forEach((c) => c.startsWith('mtk') && set.add(c))
          )
        return set.size
      })
    )
    .toBeGreaterThanOrEqual(2)
})

// Layout guard for the band system (docs/standards.md): the new Copy diff button must
// sit in the toolbar band, line up with its neighbours, and never push the bar
// into a horizontal scroll. jsdom has no layout, so this can only be checked in
// a real launch.
test('the Copy diff button keeps the toolbar band aligned and un-overflowed', async ({ page }) => {
  await pasteCompare(page, 'a\n', 'b\n') // ready -> stats + every action render

  const toolbar = page.locator('.toolbar')
  const copy = page.getByRole('button', { name: 'Copy diff' })
  const clear = page.getByRole('button', { name: 'Clear', exact: true })
  await expect(copy).toBeVisible()

  const [tb, cb, clr] = await Promise.all([
    toolbar.boundingBox(),
    copy.boundingBox(),
    clear.boundingBox()
  ])

  // Inside the band, not clipped above/below or wrapped onto a second row.
  expect(cb.y).toBeGreaterThanOrEqual(tb.y - 1)
  expect(cb.y + cb.height).toBeLessThanOrEqual(tb.y + tb.height + 1)

  // Band rule: controls sharing a row are equal-height, flex-centred boxes, so
  // Copy diff and Clear must share a top edge and a height (within 1px).
  expect(Math.abs(cb.y - clr.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(cb.height - clr.height)).toBeLessThanOrEqual(1)

  // No sideways scroll: the toolbar stays within the viewport and the document
  // never gains horizontal overflow.
  const fits = await page.evaluate(() => {
    const bar = document.querySelector('.toolbar').getBoundingClientRect()
    const noPageScroll =
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    return bar.right <= window.innerWidth + 1 && noPageScroll
  })
  expect(fits).toBe(true)
})
