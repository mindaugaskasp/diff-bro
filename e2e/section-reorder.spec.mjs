import { rmSync } from 'node:fs'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

// The sidebar sections (Saved / External / Snippets) reorder by dragging a whole
// header, or via the per-header up/down steppers, and a single toolbar lock
// freezes the arrangement. The reorder maths and the drag guard are unit-tested;
// what only a real launch proves is that a drag actually moves a section and
// that the order + lock survive the store's file-backed persist across a
// relaunch — the seam jsdom can't see.

const titles = (page) => page.locator('.section-head .section-title').allTextContents()
const header = (page, name) => page.locator('.section-head', { hasText: name })

test('reorders sections with the steppers', async ({ page }) => {
  await expect(page.locator('.section-head').first()).toBeVisible()
  expect(await titles(page)).toEqual(['Saved diffs', 'External diffs', 'Snippets'])

  await header(page, 'Snippets').getByRole('button', { name: 'Move section up' }).click()
  expect(await titles(page)).toEqual(['Saved diffs', 'Snippets', 'External diffs'])
})

test('reorders sections by dragging a whole header', async ({ page }) => {
  await expect(page.locator('.section-head').first()).toBeVisible()
  // Drag "Snippets" (last) up onto "Saved diffs" (first) — it lands before it.
  await header(page, 'Snippets').dragTo(header(page, 'Saved diffs'))
  expect(await titles(page)).toEqual(['Snippets', 'Saved diffs', 'External diffs'])
})

test('the toolbar lock freezes reordering and both survive a relaunch', async () => {
  const userDataDir = freshUserDataDir()
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)
    const lock = () => page.getByTitle('Lock sidebar section order')
    const unlock = () => page.getByTitle('Unlock sidebar section order')
    const saved = () => header(page, 'Saved diffs')

    // Unlocked: the header is a drag handle and carries the steppers.
    await expect(saved()).toHaveAttribute('draggable', 'true')
    await expect(page.locator('.section-head .reorder-btn').first()).toBeVisible()

    // Lock from the toolbar: steppers vanish and the headers stop being draggable.
    await lock().click()
    await expect(page.locator('.section-head .reorder-btn')).toHaveCount(0)
    await expect(saved()).toHaveAttribute('draggable', 'false')
    await app.close()

    // Relaunch the same profile: the lock is remembered, so the sidebar stays put.
    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    await expect(saved()).toHaveAttribute('draggable', 'false') // still locked
    await unlock().click()
    await expect(saved()).toHaveAttribute('draggable', 'true') // unlock restores it
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
