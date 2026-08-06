import { test, expect, clickAppMenuItem, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Zoom used to be Chromium's own (webContents.setZoomLevel), which scaled the
// WHOLE window — toolbar, sidebar and menus with it. That is what let the bar
// run past the window's own minimum width, and it is not what anyone reaching
// for Cmd+ over a diff wants. It now scales the COMPARISON and nothing else.

async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
}

// The layout's own width in CSS pixels. setZoomLevel moves this; a diff-only
// zoom cannot, which is precisely the difference being asserted.
const chrome = (page) =>
  page.evaluate(() => ({
    innerWidth: window.innerWidth,
    toolbar: Math.round(document.querySelector('.toolbar').getBoundingClientRect().width),
    sidebar: Math.round(document.querySelector('.key-actions').getBoundingClientRect().width)
  }))

const editorFontPx = (page) =>
  page
    .locator('.monaco-editor .view-lines')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))

test('zoom scales the diff and leaves the window alone', async ({ app, page }) => {
  await pasteCompare(page, 'alpha\nbeta', 'alpha\ngamma')
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()

  const before = await chrome(page)
  const baseFont = await editorFontPx(page)
  expect(baseFont).toBeGreaterThan(0)

  await clickAppMenuItem(app, 'Zoom In')
  await clickAppMenuItem(app, 'Zoom In')

  // The comparison got bigger…
  await expect.poll(() => editorFontPx(page)).toBeGreaterThan(baseFont)
  // …and the chrome did not move a pixel. Under setZoomLevel every one of these
  // three changes, so this is the assertion that tells the two apart.
  expect(await chrome(page)).toEqual(before)

  await clickAppMenuItem(app, 'Reset Zoom')
  await expect.poll(() => editorFontPx(page)).toBe(baseFont)
})

test('zoom out steps below the resting size, and the ladder has ends', async ({ app, page }) => {
  await pasteCompare(page, 'alpha\nbeta', 'alpha\ngamma')
  const baseFont = await editorFontPx(page)

  await clickAppMenuItem(app, 'Zoom Out')
  await expect.poll(() => editorFontPx(page)).toBeLessThan(baseFont)

  // Far past the end of the ladder: it clamps rather than collapsing to nothing.
  for (let i = 0; i < 12; i++) await clickAppMenuItem(app, 'Zoom Out')
  expect(await editorFontPx(page)).toBeGreaterThan(0)
  const floor = await editorFontPx(page)
  await clickAppMenuItem(app, 'Zoom Out')
  expect(await editorFontPx(page)).toBe(floor)
})

// A zoom nobody can see is a zoom nobody can undo: the level has to be stated,
// and stating it has to be the way back to 100%.
test('the level is shown while zoomed, and pressing it resets', async ({ app, page }) => {
  await pasteCompare(page, 'alpha\nbeta', 'alpha\ngamma')
  const chip = page.locator('.zoom-level')
  const baseFont = await editorFontPx(page)

  // Nothing to say at the resting size — it must not spend toolbar width there.
  await expect(chip).toHaveCount(0)

  await clickAppMenuItem(app, 'Zoom In')
  await expect(chip).toBeVisible()
  await expect(chip).toHaveText('110%')
  await clickAppMenuItem(app, 'Zoom In')
  await expect(chip).toHaveText('125%')

  await chip.click()
  await expect(chip).toHaveCount(0)
  expect(await editorFontPx(page)).toBe(baseFont)
})

// The grid and the structural view are VIRTUALIZED on an exact row height, so a
// font that grew without the row growing with it makes the spacers describe a
// list of a different size than the one drawn.
test('a zoomed grid keeps its rows and its row height in step', async ({ app, page }) => {
  // A delimited PAIR opens on the grid, and only files reach that path.
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-zoom-csv-'))
  const left = join(dir, 'a.csv')
  const right = join(dir, 'b.csv')
  writeFileSync(left, 'id,name\n1,alpha\n2,beta\n')
  writeFileSync(right, 'id,name\n1,alpha\n2,BETA\n')
  try {
    await stubOpenDialog(app, [left])
    await page.locator('.slot[data-side="left"]').click()
    await stubOpenDialog(app, [right])
    await page.locator('.slot[data-side="right"]').click()

    const grid = page.locator('.grid').first()
    await expect(grid).toBeVisible()

    const rowBox = () =>
      grid
        .locator('tbody tr')
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().height))
    const before = await rowBox()

    await clickAppMenuItem(app, 'Zoom In')
    await clickAppMenuItem(app, 'Zoom In')
    await expect.poll(rowBox).toBeGreaterThan(before)

    // Every row still measures what the virtualization was TOLD they measure —
    // the spacers are computed from that number, so a drift here is a scroll
    // that runs past the end of the list.
    const declared = await page
      .locator('.grids')
      .evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--grid-row-h')))
    expect(Math.abs((await rowBox()) - declared)).toBeLessThanOrEqual(1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
