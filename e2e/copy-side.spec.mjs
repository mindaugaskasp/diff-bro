import { test, expect, clickAppMenuItem, stubOpenDialog } from './fixtures.mjs'
import { zipSync, strToU8 } from 'fflate'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Copying one SIDE puts that file's own text on the real OS clipboard, which is
// the half a unit test cannot see: the write goes main-process (clipboard:write,
// since navigator.clipboard is denied here) and the control only exists once the
// slot has laid out. So drive it the way a reader does and read the clipboard
// back through Electron.

const LEFT_TEXT = 'one\ntwo\nthree\n'
const RIGHT_TEXT = 'one\nTWO\nthree\n'

function twoFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-copyside-'))
  const left = join(dir, 'alpha.txt')
  const right = join(dir, 'beta.txt')
  writeFileSync(left, LEFT_TEXT)
  writeFileSync(right, RIGHT_TEXT)
  return { dir, left, right }
}

async function loadPair(app, page, left, right) {
  await stubOpenDialog(app, left)
  await page.locator('.slot[data-side="left"] .open').click()
  await stubOpenDialog(app, right)
  await page.locator('.slot[data-side="right"] .open').click()
  await expect(page.locator('.slot[data-side="right"] .name')).toHaveText('beta.txt')
}

const readClipboard = (app) => app.evaluate(({ clipboard }) => clipboard.readText())
const clearClipboard = (app) => app.evaluate(({ clipboard }) => clipboard.clear())

const copyButton = (page, side) => page.locator(`.slot[data-side="${side}"] .copy`)

test('each slot copies its own side verbatim, not the diff between them', async ({ app, page }) => {
  const { dir, left, right } = twoFiles()
  try {
    await loadPair(app, page, left, right)

    await clearClipboard(app)
    await copyButton(page, 'left').click()
    await expect(page.locator('.notice')).toContainText('alpha.txt')
    expect(await readClipboard(app)).toBe(LEFT_TEXT)

    await clearClipboard(app)
    await copyButton(page, 'right').click()
    expect(await readClipboard(app)).toBe(RIGHT_TEXT)

    // The give-away that this is the side and not Copy Diff as Patch, which
    // shares the toolbar and would have written a ---/+++ header.
    expect(await readClipboard(app)).not.toContain('---')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The Edit menu (and so the palette and Cmd+Shift+1/2, which dispatch the same
// two actions) reaches the same two sides. Driven through the menu item rather
// than a keypress: a CDP-injected key never reaches a native accelerator, so
// asserting on one would prove nothing about the binding.
test('the Edit menu reaches the same two sides', async ({ app, page }) => {
  const { dir, left, right } = twoFiles()
  try {
    await loadPair(app, page, left, right)

    await clearClipboard(app)
    await clickAppMenuItem(app, 'Copy Left Side')
    await expect.poll(() => readClipboard(app)).toBe(LEFT_TEXT)

    await clearClipboard(app)
    await clickAppMenuItem(app, 'Copy Right Side')
    await expect.poll(() => readClipboard(app)).toBe(RIGHT_TEXT)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// An opacity-0 button still takes clicks, so the thing that keeps it from
// stealing one meant for the slot is that it sits BESIDE the name, never over
// it. Assert the boxes are disjoint rather than trusting the flex row to stay
// that way.
test('the copy control stays out of the resting row and clear of the name', async ({
  app,
  page
}) => {
  const { dir, left, right } = twoFiles()
  try {
    await loadPair(app, page, left, right)
    const copy = copyButton(page, 'left')

    await expect(copy).toHaveCSS('opacity', '0')
    await page.locator('.slot[data-side="left"]').hover()
    await expect(copy).toHaveCSS('opacity', '1')

    const open = await page.locator('.slot[data-side="left"] .open').boundingBox()
    const box = await copy.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(open.x + open.width - 1)

    // Icon buttons come off the control scale, never padding + font-size.
    const scale = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--control-h-sm').trim()
    )
    expect(Math.round(box.height)).toBe(parseInt(scale, 10))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A spreadsheet side carries sheets and no text, so there is nothing to put on
// the clipboard — it gets no control rather than one that refuses.
test('a spreadsheet side offers no copy control at all', async ({ app, page }) => {
  const XML = '<?xml version="1.0" encoding="UTF-8"?>'
  const cell = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`
  const book = (value) =>
    Buffer.from(
      zipSync({
        'xl/workbook.xml': strToU8(
          `${XML}<workbook xmlns:r="r"><sheets>` +
            '<sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>'
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          `${XML}<Relationships><Relationship Id="rId1" ` +
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
            'Target="worksheets/sheet1.xml"/></Relationships>'
        ),
        'xl/worksheets/sheet1.xml': strToU8(
          `${XML}<worksheet><sheetData><row r="1">` +
            `${cell('A1', 'Region')}${cell('B1', value)}</row></sheetData></worksheet>`
        )
      })
    )

  const dir = mkdtempSync(join(tmpdir(), 'diffbro-copyside-xlsx-'))
  const left = join(dir, 'a.xlsx')
  const right = join(dir, 'b.xlsx')
  writeFileSync(left, book('100'))
  writeFileSync(right, book('150'))
  try {
    await stubOpenDialog(app, left)
    await page.locator('.slot[data-side="left"] .open').click()
    await stubOpenDialog(app, right)
    await page.locator('.slot[data-side="right"] .open').click()
    await expect(page.locator('.slot[data-side="right"] .name')).toHaveText('b.xlsx')

    await page.locator('.slot[data-side="left"]').hover()
    await expect(copyButton(page, 'left')).toHaveCount(0)
    await expect(copyButton(page, 'right')).toHaveCount(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
