import { rmSync } from 'node:fs'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

// Sidebar sections reorder by dragging their headers, and until this spec the
// whole interaction was invisible to the suite: the unit test called the
// handlers with fabricated events, so it passed on every platform while the real
// drag was dead on Windows.
//
// Driven with page.mouse — a real pointer sequence Chromium turns into the same
// events a hand does — so it fails for ANY reason a user would hit. It caught
// one immediately: pointer capture taken on the press swallowed the click of
// every control living inside a section header.

const header = (page, id) => page.locator(`.head[data-section="${id}"]`)

const sectionOrder = (page) =>
  page.locator('.head[data-section]').evaluateAll((els) => els.map((el) => el.dataset.section))

// A press, a deliberate multi-step travel (one jump reads as a click), a release.
async function dragHeader(page, fromId, toId) {
  const from = await header(page, fromId).boundingBox()
  const to = await header(page, toId).boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  for (let step = 1; step <= 6; step += 1) {
    const ratio = step / 6
    await page.mouse.move(
      from.x + from.width / 2 + (to.x - from.x) * ratio,
      from.y + from.height / 2 + (to.y - from.y) * ratio
    )
  }
  await page.mouse.up()
}

test('dragging a section header above another reorders the sidebar', async ({ page }) => {
  expect(await sectionOrder(page)).toEqual(['saved', 'external', 'snippets', 'tools'])

  await dragHeader(page, 'snippets', 'saved')

  await expect.poll(() => sectionOrder(page)).toEqual(['snippets', 'saved', 'external', 'tools'])
})

test('the dragged header marks its drop target while travelling', async ({ page }) => {
  const from = await header(page, 'snippets').boundingBox()
  const to = await header(page, 'saved').boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 4)
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2)

  await expect(header(page, 'saved')).toHaveClass(/drop-target/)
  await expect(header(page, 'snippets')).toHaveClass(/dragging/)

  await page.mouse.up()
  await expect(header(page, 'saved')).not.toHaveClass(/drop-target/)
})

// The header is both a drag handle and a collapse toggle, so the drag has to
// swallow exactly one click and no more. Getting that wrong in either direction
// is silent: too greedy and the section stops collapsing, too shy and every
// reorder collapses whatever it landed on.
test('a plain click still collapses the section, and a drag does not', async ({ page }) => {
  const chevron = header(page, 'snippets').locator('.chev')
  await expect(chevron).toHaveClass(/open/)

  await header(page, 'snippets').click()
  await expect(chevron).not.toHaveClass(/open/)
  await header(page, 'snippets').click()
  await expect(chevron).toHaveClass(/open/)

  await dragHeader(page, 'snippets', 'saved')
  await expect.poll(() => sectionOrder(page)).toEqual(['snippets', 'saved', 'external', 'tools'])
  // Moved, not collapsed.
  await expect(header(page, 'snippets').locator('.chev')).toHaveClass(/open/)
})

// A section header carries SVG icons, and an inline <svg> is a native drag
// source in Chromium (`-webkit-user-drag: auto`). On real hardware, grabbing the
// icon starts a native image-drag that fires `pointercancel` and kills the
// pointer-capture reorder — invisible to page.mouse, which never engages the OS
// drag controller. The header must therefore REFUSE to become a drag source, so
// no native drag can ever race the gesture.
test('the header refuses to become a native drag source', async ({ page }) => {
  const preventedFrom = (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel)
      const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true })
      el.dispatchEvent(ev)
      return ev.defaultPrevented
    }, selector)

  expect(await preventedFrom('.head[data-section="snippets"] svg')).toBe(true)
  expect(await preventedFrom('.head[data-section="snippets"] .section-title')).toBe(true)
  expect(await preventedFrom('.head[data-section="snippets"]')).toBe(true)
})

test('a reorder survives a relaunch', async () => {
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    let page = await firstReadyPage(app)
    await dragHeader(page, 'snippets', 'saved')
    await expect.poll(() => sectionOrder(page)).toEqual(['snippets', 'saved', 'external', 'tools'])
    await app.close()

    app = await launchApp(dir)
    page = await firstReadyPage(app)
    await expect.poll(() => sectionOrder(page)).toEqual(['snippets', 'saved', 'external', 'tools'])
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
