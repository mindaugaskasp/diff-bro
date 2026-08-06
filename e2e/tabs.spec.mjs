import { test, expect } from './fixtures.mjs'
import { MAX_TABS } from '../src/renderer/src/utils/tabs.js'

// Tabs are a claim about Monaco: each holds its own comparison, and only the
// one on screen owns an editor. Neither is checkable in jsdom — there is no
// real Monaco there to count or to swap models on.

async function compare(page, left, right) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()
}

const tabBar = (page) => page.locator('.diff-tabs')
// Scoped to the editor: tab LABELS now carry the pasted text's first line too,
// so an unscoped getByText would match the tab rather than the comparison.
const inDiff = (page, text) => page.locator('.diff-container').getByText(text)
// The sidebar offers the same action, so "new comparison" is named twice on
// purpose — the region says which one is meant.
const addTab = (page) =>
  page.locator('.diff-tabs').getByRole('button', { name: 'New comparison', exact: true })
const tabs = (page) => page.locator('.diff-tabs .tab')

// The × is a hover affordance on an inactive tab (keyboard closes the active
// one with the accelerator instead). Park the pointer first so the hover is a
// real arrival — after a dialog closes the cursor is wherever its button was.
async function clickClose(page, n = 0) {
  await page.mouse.move(0, 0)
  await tabs(page).nth(n).hover()
  await tabs(page)
    .nth(n)
    .getByRole('button', { name: /^Close/ })
    .click()
}

// The × on an inactive tab is revealed by hover, so asking whether it is THERE
// means hovering first — otherwise the answer depends on wherever the pointer
// was left by the previous step.
async function closeControl(page, n = 0) {
  await page.mouse.move(0, 0)
  await tabs(page).nth(n).hover()
  return tabs(page)
    .nth(n)
    .getByRole('button', { name: /^Close/ })
}

test('the bar is there from the start, so a second comparison is reachable', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  await expect(tabBar(page)).toBeVisible()
  await expect(tabs(page)).toHaveCount(1)

  await addTab(page).click()
  await expect(tabs(page)).toHaveCount(2)
})

test('each tab keeps its own comparison, and switching swaps it', async ({ page }) => {
  await compare(page, 'first-left', 'first-right')
  await addTab(page).click()
  await compare(page, 'second-left', 'second-right')
  await expect(inDiff(page, 'second-left').first()).toBeVisible()

  await tabs(page).first().click()
  await expect(inDiff(page, 'first-left').first()).toBeVisible()
  await expect(inDiff(page, 'second-left')).toHaveCount(0)

  await tabs(page).nth(1).click()
  await expect(inDiff(page, 'second-left').first()).toBeVisible()
})

// The memory bound the whole snapshot-swap design exists to guarantee.
test('only the visible tab owns a Monaco editor', async ({ page }) => {
  await compare(page, 'one', 'ONE')
  for (const [l, r] of [
    ['two', 'TWO'],
    ['three', 'THREE']
  ]) {
    await addTab(page).click()
    await compare(page, l, r)
  }
  await expect(tabs(page)).toHaveCount(3)
  expect(await page.locator('.monaco-diff-editor').count()).toBe(1)

  await tabs(page).first().click()
  await expect(inDiff(page, 'one').first()).toBeVisible()
  expect(await page.locator('.monaco-diff-editor').count()).toBe(1)
})

test('an unsaved tab confirms before it closes, and a kept one survives', async ({ page }) => {
  await compare(page, 'precious', 'PRECIOUS')
  await addTab(page).click()
  await compare(page, 'throwaway', 'THROWAWAY')

  await page.mouse.move(0, 0)
  await tabs(page).first().hover()
  await clickClose(page)
  const dialog = page.getByRole('dialog', { name: 'Close comparison?' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Keep it open' }).click()
  await expect(tabs(page)).toHaveCount(2)

  await clickClose(page)
  await page
    .getByRole('dialog', { name: 'Close comparison?' })
    .getByRole('button', { name: 'Close it' })
    .click()
  await expect(tabs(page)).toHaveCount(1)
  await expect(inDiff(page, 'throwaway').first()).toBeVisible()
})

test('closing the last comparison empties it rather than the window', async ({ page }) => {
  await compare(page, 'only', 'ONLY')
  await addTab(page).click()
  await expect(tabs(page)).toHaveCount(2)
  await expect(await closeControl(page, 0)).toHaveCount(1)

  // Park the pointer first, or
  await clickClose(page)
  await page
    .getByRole('dialog', { name: 'Close comparison?' })
    .getByRole('button', { name: 'Close it' })
    .click()
  await expect(tabs(page)).toHaveCount(1)
  await expect(tabs(page).first()).toContainText('Untitled')
  await expect(page.getByRole('button', { name: 'Paste mode' })).toBeVisible()
})

test('a saved diff is focused rather than opened twice', async ({ page }) => {
  await compare(page, 'saved-left', 'saved-right')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Save diff' })
  await save.getByLabel('Name', { exact: true }).fill('Tabbed diff')
  await save.getByRole('button', { name: 'Save', exact: true }).click()

  // A second, unrelated comparison.
  await addTab(page).click()
  await compare(page, 'other', 'OTHER')
  await expect(tabs(page)).toHaveCount(2)

  // Saving linked the first tab to the entry, so the sidebar focuses that tab
  // instead of stacking a third copy of the same comparison.
  const row = page.locator('li.diff', { hasText: 'Tabbed diff' })
  await row.locator('.stack').click()
  await expect(tabs(page)).toHaveCount(2)
  await expect(inDiff(page, 'saved-left').first()).toBeVisible()

  // And again, from the other tab.
  await tabs(page).nth(1).click()
  await row.locator('.stack').click()
  await expect(tabs(page)).toHaveCount(2)
  await expect(inDiff(page, 'saved-left').first()).toBeVisible()
})

test('a tab does not resize when the pointer enters it', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  await addTab(page).click()
  await compare(page, 'gamma', 'delta')

  const first = tabs(page).first()
  await page.mouse.move(0, 0)
  const before = await first.boundingBox()

  await first.hover()
  await expect(first.getByRole('button', { name: /^Close/ })).toBeVisible()
  const during = await first.boundingBox()

  expect(during.width).toBe(before.width)
  expect(during.x).toBe(before.x)

  // And the tab to its right has not been pushed along either.
  const neighbour = await tabs(page).nth(1).boundingBox()
  await page.mouse.move(0, 0)
  expect((await tabs(page).nth(1).boundingBox()).x).toBe(neighbour.x)
})

// Pressing + used to go through the same blank-tab reuse meant for OPENING a
// comparison, so on a fresh window it refilled the tab you were looking at and
// appeared to do nothing at all.
test('the + always adds a tab, even from an empty one', async ({ page }) => {
  await expect(tabs(page)).toHaveCount(1)
  await expect(tabs(page).first()).toContainText('Untitled')

  await addTab(page).click()
  await expect(tabs(page)).toHaveCount(2)

  await addTab(page).click()
  await expect(tabs(page)).toHaveCount(3)
})

// A tab is the one place a comparison already has a name, so renaming it should
// be how you name the thing — including when it is saved.
test('double-clicking a tab renames it', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  const tab = tabs(page).first()

  await tab.locator('.tab-open').dblclick()
  const box = page.locator('.diff-tabs .tab-rename')
  await expect(box).toBeVisible()
  await box.fill('prod vs staging')
  await box.press('Enter')

  await expect(tab).toContainText('prod vs staging')
  await expect(page.locator('.diff-tabs .tab-rename')).toHaveCount(0)
})

test('escape abandons a rename without changing the name', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  const tab = tabs(page).first()
  const before = (await tab.innerText()).trim()

  await tab.locator('.tab-open').dblclick()
  await page.locator('.diff-tabs .tab-rename').fill('discard me')
  await page.locator('.diff-tabs .tab-rename').press('Escape')

  await expect(page.locator('.diff-tabs .tab-rename')).toHaveCount(0)
  expect((await tab.innerText()).trim()).toBe(before)
})

test('a renamed tab keeps its name across a switch', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  await tabs(page).first().locator('.tab-open').dblclick()
  await page.locator('.diff-tabs .tab-rename').fill('the important one')
  await page.locator('.diff-tabs .tab-rename').press('Enter')

  await addTab(page).click()
  await compare(page, 'gamma', 'delta')
  await tabs(page).first().click()
  await expect(tabs(page).first()).toContainText('the important one')
})

test('the name you gave a tab is the name the save dialog offers', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  await tabs(page).first().locator('.tab-open').dblclick()
  await page.locator('.diff-tabs .tab-rename').fill('release candidate')
  await page.locator('.diff-tabs .tab-rename').press('Enter')

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('release candidate')

  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: 'release candidate' })).toBeVisible()
})

// A tab and the saved diff it holds are the same comparison, so they carry the
// same name in both directions.
test('reopening a saved diff restores its name into the tab', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill('Nightly config')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()

  // Saving names the tab it was saved from.
  await expect(tabs(page).first()).toContainText('Nightly config')

  // And reopening it elsewhere brings the name with it.
  await addTab(page).click()
  await compare(page, 'gamma', 'delta')
  await page.locator('li.diff', { hasText: 'Nightly config' }).locator('.stack').click()
  await expect(tabs(page).first()).toContainText('Nightly config')
})

test('renaming a saved diff’s tab renames it in the sidebar', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill('First name')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: 'First name' })).toBeVisible()

  await tabs(page).first().locator('.tab-open').dblclick()
  await page.locator('.diff-tabs .tab-rename').fill('Second name')
  await page.locator('.diff-tabs .tab-rename').press('Enter')

  await expect(page.locator('li.diff', { hasText: 'Second name' })).toBeVisible()
  await expect(page.locator('li.diff', { hasText: 'First name' })).toHaveCount(0)
})

// A lone tab has nothing to fall back to, so closing it would only empty the
// comparison the Clear button already empties — and the × implied otherwise.
test('a single tab has no close control', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  await expect(tabs(page)).toHaveCount(1)
  await expect(
    tabs(page)
      .first()
      .getByRole('button', { name: /^Close/ })
  ).toHaveCount(0)

  await addTab(page).click()
  await expect(await closeControl(page, 0)).toHaveCount(1)
})

// The name belonged to the comparison, so emptying the tab must take it too.
test('closing back to one tab does not leave the old name behind', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  await tabs(page).first().locator('.tab-open').dblclick()
  await page.locator('.diff-tabs .tab-rename').fill('the old one')
  await page.locator('.diff-tabs .tab-rename').press('Enter')

  await addTab(page).click()
  await clickClose(page, 0)
  await page
    .getByRole('dialog', { name: 'Close comparison?' })
    .getByRole('button', { name: 'Close it' })
    .click()

  await expect(tabs(page)).toHaveCount(1)
  await expect(tabs(page).first()).not.toContainText('the old one')
})

// The sidebar offers the same new-comparison action, and says why when it cannot.
test('the Saved diffs + opens a new paste comparison, and stops at the cap', async ({ page }) => {
  const add = page.locator('.sidebar-section', { hasText: 'Saved diffs' }).getByRole('button', {
    name: 'New comparison'
  })
  await add.click()
  await expect(tabs(page)).toHaveCount(2)
  await expect(page.getByPlaceholder('Paste original text here')).toBeVisible()

  while (await add.isEnabled()) await add.click()
  await expect(tabs(page)).toHaveCount(MAX_TABS)
  await expect(add).toBeDisabled()
  await expect(add).toHaveAttribute(
    'data-tip',
    new RegExp(`most comparisons at once \\(${MAX_TABS}\\)`)
  )
})

// A diff or snippet carries several tags, so the filter takes several too —
// selecting two shows the rows carrying either.
test('several tags can be selected, and they widen the list', async ({ page }) => {
  const save = async (name, tag) => {
    await compare(page, `left-${name}`, `right-${name}`)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const d = page.getByRole('dialog', { name: 'Save diff' })
    await d.getByLabel('Name', { exact: true }).fill(name)
    for (const t of tag) {
      await d.getByPlaceholder('add a tag…').fill(t)
      await d.getByPlaceholder('add a tag…').press('Enter')
    }
    await d.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('li.diff', { hasText: name })).toBeVisible()
    await addTab(page).click()
  }
  await save('Both tags', ['alpha', 'beta'])
  await save('Only alpha', ['alpha'])

  const chip = (t) => page.locator('.usb-tag', { hasText: t })
  await chip('beta').click()
  await expect(page.locator('li.diff')).toHaveCount(1)
  await expect(page.locator('li.diff', { hasText: 'Both tags' })).toBeVisible()

  // Adding a tag WIDENS: the alpha-only diff joins rather than being hidden for
  // lacking beta.
  await chip('alpha').click()
  await expect(chip('alpha')).toHaveClass(/on/)
  await expect(chip('beta')).toHaveClass(/on/)
  await expect(page.locator('li.diff')).toHaveCount(2)

  await chip('alpha').click()
  await expect(page.locator('li.diff')).toHaveCount(1)
})

// The tab you are looking at IS the live document: its snapshot is only
// refreshed when tabs switch, so anything that asks the snapshot about it is
// asking a stale copy. That let the × discard unsaved work in silence.
test('the × on the ACTIVE tab confirms before discarding its work', async ({ page }) => {
  await compare(page, 'first-left', 'first-right')
  await addTab(page).click()
  await compare(page, 'precious', 'PRECIOUS')

  await clickClose(page, 1)
  const dialog = page.getByRole('dialog', { name: 'Close comparison?' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Keep it open' }).click()
  await expect(tabs(page)).toHaveCount(2)
  await expect(inDiff(page, 'precious').first()).toBeVisible()
})

// The unsaved marker read the same stale snapshot, so it was wrong in both
// directions on the one tab a reader is actually looking at.
test('the unsaved marker follows the comparison on screen', async ({ page }) => {
  const dot = () => tabs(page).first().locator('.dirty')
  // A blank tab holds nothing to lose, so it is not "unsaved".
  await expect(dot()).toHaveCount(0)

  await compare(page, 'alpha', 'beta')
  await expect(dot()).toHaveCount(1)

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Save diff' })
  await save.getByLabel('Name', { exact: true }).fill('Marked diff')
  await save.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: 'Marked diff' })).toBeVisible()
  // Saved — and the marker goes now, not on the next tab switch.
  await expect(dot()).toHaveCount(0)

  // Editing it brings the marker straight back.
  await page.getByRole('button', { name: 'Swap sides' }).click()
  await expect(dot()).toHaveCount(1)
})

// The dialog names the comparison, and a name the reader typed IS its name.
test('the close confirmation calls a renamed tab by its name', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  await tabs(page).first().locator('.tab-open').dblclick()
  await page.locator('.diff-tabs .tab-rename').fill('prod vs staging')
  await page.locator('.diff-tabs .tab-rename').press('Enter')

  await addTab(page).click()
  await clickClose(page, 0)
  await expect(page.getByRole('dialog', { name: 'Close comparison?' })).toContainText(
    'prod vs staging'
  )
})

// The label watcher listed pasteLeft but not pasteRight, so filling only the
// "Changed" pane left the tab reading Untitled while the "Original" pane
// retitled it immediately.
test('a tab retitles from either paste pane', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await expect(tabs(page).first()).toContainText('Untitled')

  await page.getByPlaceholder('Paste changed text here').fill('right-hand side only')
  await expect(tabs(page).first()).toContainText('Pasted text')
})

// Saving a comparison that is already in the vault only ever added a second row
// saying the same thing, so the action is not offered until something changes.
test('a comparison cannot be saved twice into two rows', async ({ page }) => {
  await compare(page, 'alpha', 'beta')
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeEnabled()

  await save.click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill('Only once')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: 'Only once' })).toBeVisible()

  // Nothing has changed, so there is nothing to save.
  await expect(save).toBeDisabled()

  // Editing it offers the save again — and it rewrites the diff it came from
  // rather than stacking a duplicate beside it.
  await page.getByRole('button', { name: 'Swap sides' }).click()
  await expect(save).toBeEnabled()
  await save.click()
  const update = page.getByRole('dialog', { name: 'Update diff' })
  await expect(update.getByLabel('Name', { exact: true })).toHaveValue('Only once')
  await update.getByRole('button', { name: 'Update', exact: true }).click()

  await expect(page.locator('li.diff')).toHaveCount(1)
  await expect(save).toBeDisabled()
})
