import { rmSync } from 'node:fs'
import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openMenu,
  openNewSnippet,
  showPanel,
  docActions
} from './fixtures.mjs'

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

// Untagged rows sit in their own section of the tag tree (#121); a drag stays in it.
const SNIPPETS = '.snippets-section .ts-head[data-path="∅"] + .ts-rows > .row'
const names = (page) => page.locator(`${SNIPPETS} .nm`).allTextContents()

// Its own rows rather than the seeded examples: a spec that skips because the
// fixture happened to ship two snippets proves nothing at all.
async function seedSnippets(page, labels) {
  for (const label of labels) {
    await openNewSnippet(page)
    const editor = page.getByRole('region', { name: 'New snippet' })
    await editor.getByPlaceholder('Snippet name…').fill(label)
    await editor.locator('.editor').click()
    await page.keyboard.type(`body of ${label}`)
    await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
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
// Favorites are their own section (#121), and a drag never leaves its section:
// a plain row dropped on a favourite stays where it was.
test('a plain snippet cannot be dropped among the favorites', async ({ page }) => {
  await seedSnippets(page, ['Alpha row', 'Bravo row', 'Charlie row'])
  const FAVORITES = '.snippets-section .ts-head[data-path="★"] + .ts-rows > .row'
  const rows = page.locator(SNIPPETS)
  await rows.last().hover()
  await rows
    .last()
    .getByRole('button', { name: /pin to top/i })
    .click()
  await expect(page.locator(FAVORITES)).toHaveCount(1)

  const before = await names(page)
  // Both lists in one selector: the favorite comes first in document order.
  await dragRowOnto(page, `${FAVORITES}, ${SNIPPETS}`, { from: 1, to: 0 })
  expect(await names(page)).toEqual(before)
  await expect(page.locator(FAVORITES)).toHaveCount(1)

  // …and a drag inside the section still works, so this is the boundary holding.
  await dragRowOnto(page, SNIPPETS, { from: 1, to: 0 })
  expect((await names(page))[0]).toBe(before[1])
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

// Seeding three saved diffs through the UI is slow — a vault round-trip each.
test.describe.configure({ timeout: 90_000 })

const DIFFS = 'li.diff'
const diffNames = (page) => page.locator(`${DIFFS} .name`).allTextContents()

async function seedDiffs(page, labels) {
  for (const label of labels) {
    // A saved tab is vault-backed and drops the mode toggle, so each diff needs
    // a fresh comparison to be made in. Through the menu, because the tab strip
    // hides itself while only one tab is open.
    await openMenu(page, 'File', 'New Comparison')
    await page.getByRole('button', { name: 'Paste mode' }).click()
    await page.getByPlaceholder('Paste or type the original text').fill(`before ${label}`)
    await page.getByPlaceholder('Paste or type the changed text').fill(`after ${label}`)
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Save diff' })
    await dialog.getByLabel('Name', { exact: true }).fill(label)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator(DIFFS, { hasText: label })).toBeVisible()
  }
}

// The user's report: a saved diff dropped in a new position snaps back. The
// snippet list was covered and this one was not, which is exactly the gap.
test('a saved diff dropped in a new position stays there', async ({ page }) => {
  await seedDiffs(page, ['Diff one', 'Diff two', 'Diff three'])
  const before = await diffNames(page)
  expect(before).toHaveLength(3)

  await dragRowOnto(page, DIFFS, { from: 2, to: 0 })

  await expect.poll(() => diffNames(page)).toEqual([before[2], before[0], before[1]])
})

test('a saved diff order survives a relaunch', async () => {
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    let page = await firstReadyPage(app)
    await seedDiffs(page, ['Diff one', 'Diff two', 'Diff three'])
    await dragRowOnto(page, DIFFS, { from: 2, to: 0 })
    const wanted = await diffNames(page)
    await app.close()

    app = await launchApp(dir)
    page = await firstReadyPage(app)
    await expect.poll(() => diffNames(page)).toEqual(wanted)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// A row wash once had a bite out of its left side, clipped to the list's indent.
test('a row wash sits evenly inside its list, with no bite out of one side', async ({ page }) => {
  await showPanel(page, 'snippets')
  const row = page.locator('.snippets-section .ts-rows > .row').first()
  await row.waitFor()
  // Against the SECTION, not the list: the list is already indented, so a row
  // that merely matches it still leaves the gap the reader is looking at.
  const { rowLeft, sectionLeft, rowRight, sectionRight } = await row.evaluate((el) => {
    const section = el.closest('.sidebar-section').getBoundingClientRect()
    const box = el.getBoundingClientRect()
    return {
      rowLeft: box.left,
      sectionLeft: section.left,
      rowRight: box.right,
      sectionRight: section.right
    }
  })
  expect(Math.abs(rowLeft - sectionLeft - (sectionRight - rowRight))).toBeLessThanOrEqual(1)
  expect(rowLeft - sectionLeft).toBeLessThanOrEqual(12)
})
