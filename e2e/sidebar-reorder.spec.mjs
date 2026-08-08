import { rmSync } from 'node:fs'
import { test, expect, firstReadyPage, freshUserDataDir, launchApp } from './fixtures.mjs'

// Sidebar rows rearrange by dragging one onto another. The lists were ordered
// by an accident of when things were captured, and the only lever was the star.
//
// Synthesized DragEvents rather than a mouse path: Chromium will not begin a
// native HTML5 drag from injected pointer input, so page.mouse proves nothing
// here (that is what made the first attempt at this pass with no feature).
const dragRowOnto = (page, listSelector, { from, to, half = 'above' }) =>
  page.evaluate(
    ({ list, fromIndex, toIndex, where }) => {
      const rows = [...document.querySelectorAll(list)]
      const src = rows[fromIndex]
      const dst = rows[toIndex]
      const dt = new DataTransfer()
      src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
      const box = dst.getBoundingClientRect()
      const clientY = box.top + (where === 'above' ? 2 : box.height - 2)
      for (const type of ['dragover', 'drop']) {
        dst.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, clientY }))
      }
      src.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }))
    },
    { list: listSelector, fromIndex: from, toIndex: to, where: half }
  )

const SNIPPETS = '.snippets-section .row'
const names = (page) => page.locator(`${SNIPPETS} .nm`).allTextContents()

// Its own rows rather than the seeded examples: a spec that skips because the
// fixture happened to ship two snippets proves nothing at all.
async function seedSnippets(page, labels) {
  for (const label of labels) {
    await page.getByRole('button', { name: 'New snippet' }).click()
    const editor = page.getByRole('dialog', { name: 'New Snippet' })
    await editor.getByPlaceholder('Snippet name…').fill(label)
    await editor.locator('.editor').click()
    await page.keyboard.type(`body of ${label}`)
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(editor).toBeHidden()
  }
  // Newest leads, so they come back in reverse of the order they were made.
  await expect(page.locator(`${SNIPPETS} .nm`).first()).toHaveText(labels.at(-1))
}

test('dragging a snippet onto one above it moves it there', async ({ page }) => {
  await seedSnippets(page, ['Alpha row', 'Bravo row', 'Charlie row'])
  const before = await names(page)

  await dragRowOnto(page, SNIPPETS, { from: 2, to: 0 })

  const after = await names(page)
  expect(after[0]).toBe(before[2])
  expect(after).toHaveLength(before.length)
  expect([...after].sort()).toEqual([...before].sort())
})

test('dropping below the last row sends it to the end', async ({ page }) => {
  await seedSnippets(page, ['Alpha row', 'Bravo row', 'Charlie row'])
  const before = await names(page)

  await dragRowOnto(page, SNIPPETS, { from: 0, to: before.length - 1, half: 'below' })

  const after = await names(page)
  expect(after.at(-1)).toBe(before[0])
})

// The favourite boundary is enforced by the group split, not by a guard: each
// group is its own list, so a drag confined to its list cannot cross. This is
// the test that would catch the split being collapsed into one list.
test('a plain snippet cannot be dropped above a favourite', async ({ page }) => {
  await seedSnippets(page, ['Alpha row', 'Bravo row', 'Charlie row'])
  const rows = page.locator(SNIPPETS)
  const total = await rows.count()

  // Star the LAST row, which lifts it into the favourites group at the top.
  await rows.nth(total - 1).hover()
  await rows
    .nth(total - 1)
    .getByRole('button', { name: /pin to top/i })
    .click()
  await expect(page.locator(`${SNIPPETS}.favorite`)).toHaveCount(1)

  const before = await names(page)
  // Row 1 is the first NON-favourite; try to drop it above the favourite at 0.
  await dragRowOnto(page, SNIPPETS, { from: 1, to: 0 })

  expect(await names(page)).toEqual(before)
  await expect(page.locator(`${SNIPPETS}.favorite`)).toHaveCount(1)

  // …and the same drag WITHIN the group still works, so this is the boundary
  // holding rather than reordering being broken.
  await dragRowOnto(page, SNIPPETS, { from: 2, to: 1 })
  const after = await names(page)
  expect(after[1]).toBe(before[2])
  expect(after[0]).toBe(before[0])
})

test('the order survives a relaunch', async () => {
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    let page = await firstReadyPage(app)
    await seedSnippets(page, ['Alpha row', 'Bravo row', 'Charlie row'])
    const before = await names(page)
    await dragRowOnto(page, SNIPPETS, { from: 2, to: 0 })
    await expect.poll(() => names(page)).not.toEqual(before)
    const wanted = await names(page)
    await app.close()

    app = await launchApp(dir)
    page = await firstReadyPage(app)
    await expect.poll(() => names(page)).toEqual(wanted)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
