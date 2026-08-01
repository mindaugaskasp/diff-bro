import { test, expect, stubOpenDialog } from './fixtures.mjs'
import { zipSync, strToU8 } from 'fflate'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Virtualization is only true in a real layout: the claim is that a sheet with
// thousands of rows puts a screenful in the DOM, still scrolls the full height,
// and reaches its last row. None of that is answerable in jsdom, which has no
// scroll geometry at all.

const XML = '<?xml version="1.0" encoding="UTF-8"?>'
const cell = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`
const ROWS = 4000

function workbook(marker) {
  const rows = Array.from(
    { length: ROWS },
    (_, i) =>
      `<row r="${i + 1}">${cell(`A${i + 1}`, `row-${i}`)}${cell(`B${i + 1}`, `${marker}${i}`)}</row>`
  ).join('')
  return Buffer.from(
    zipSync({
      'xl/workbook.xml': strToU8(
        `${XML}<workbook xmlns:r="r"><sheets>` +
          '<sheet name="Big" sheetId="1" r:id="rId1"/></sheets></workbook>'
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        `${XML}<Relationships><Relationship Id="rId1" ` +
          'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
          'Target="worksheets/sheet1.xml"/></Relationships>'
      ),
      'xl/worksheets/sheet1.xml': strToU8(
        `${XML}<worksheet><sheetData>${rows}</sheetData></worksheet>`
      )
    })
  )
}

async function openBigSheet(app, page) {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-virt-'))
  const left = join(dir, 'big-a.xlsx')
  const right = join(dir, 'big-b.xlsx')
  writeFileSync(left, workbook('v'))
  writeFileSync(right, workbook('w'))
  await stubOpenDialog(app, [left])
  await page.locator('.slot[data-side="left"]').click()
  await stubOpenDialog(app, [right])
  await page.locator('.slot[data-side="right"]').click()
  await expect(page.locator('.grids')).toBeVisible()
  return dir
}

test('a four-thousand-row sheet renders a screenful, not the sheet', async ({ app, page }) => {
  const dir = await openBigSheet(app, page)
  try {
    // Every row is a real difference, so the status strip proves all of them
    // were compared even though only a few are drawn.
    await expect(page.locator('.status .chg')).toContainText(`${ROWS} changed`)

    const drawn = await page.locator('.grid').first().locator('tbody tr:not(.pad)').count()
    expect(drawn).toBeGreaterThan(0)
    expect(drawn).toBeLessThan(120)

    // …while the scroller still measures the whole sheet.
    const { scrollHeight, clientHeight } = await page.locator('.grids').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }))
    expect(scrollHeight).toBeGreaterThan(ROWS * 20)
    expect(scrollHeight).toBeGreaterThan(clientHeight * 10)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('scrolling to the bottom reaches the last row', async ({ app, page }) => {
  const dir = await openBigSheet(app, page)
  try {
    await page.locator('.grids').evaluate((el) => (el.scrollTop = el.scrollHeight))
    await expect(
      page
        .locator('.grid')
        .first()
        .locator('tbody tr', { hasText: `row-${ROWS - 1}` })
    ).toBeVisible()
    // The first row is gone from the DOM entirely — it was never just hidden.
    await expect(
      page.locator('.grid').first().locator('tbody tr', { hasText: 'row-0' })
    ).toHaveCount(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// One window drives BOTH grids. If they ever windowed independently the two
// sides would show different rows at the same scroll position, which is the
// one thing a side-by-side diff cannot do.
test('both grids show the same rows at the same scroll position', async ({ app, page }) => {
  const dir = await openBigSheet(app, page)
  try {
    await page.locator('.grids').evaluate((el) => (el.scrollTop = 12_000))
    // Both grids are read in ONE frame. Two round-trips can straddle a
    // re-render, which reports a mismatch that never existed on screen.
    const sample = () =>
      page.locator('.grid').evaluateAll((grids) =>
        grids.map((g) => {
          const row = g.querySelector('tbody tr:not(.pad)')
          return {
            num: row.querySelector('th.rownum').textContent,
            top: row.getBoundingClientRect().top
          }
        })
      )
    await expect.poll(async () => (await sample())[0].num).not.toBe('1')

    const [left, right] = await sample()
    expect(left.num).toBe(right.num)
    expect(Math.abs(left.top - right.top)).toBeLessThan(2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
