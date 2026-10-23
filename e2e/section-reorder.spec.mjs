import { rmSync } from 'node:fs'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

// Real pointer input: the unit test fabricates events and once passed while the drag was dead.

const item = (page, panel) => page.locator(`.rail-item[data-panel="${panel}"]`)

const railOrder = (page) =>
  page.locator('.rail-item').evaluateAll((els) => els.map((el) => el.dataset.panel))

// A press, a deliberate multi-step travel (one jump reads as a click), a release.
async function dragItem(page, from, to) {
  const a = await item(page, from).boundingBox()
  const b = await item(page, to).boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  for (let step = 1; step <= 6; step += 1) {
    const ratio = step / 6
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + (b.y - a.y) * ratio)
  }
  await page.mouse.up()
}

test('dragging a rail item above another reorders the rail', async ({ page }) => {
  expect(await railOrder(page)).toEqual(['home', 'diffs', 'snippets', 'tools', 'keys'])
  await dragItem(page, 'snippets', 'diffs')
  await expect.poll(() => railOrder(page)).toEqual(['home', 'snippets', 'diffs', 'tools', 'keys'])
})

test('the dragged item marks its drop target while travelling', async ({ page }) => {
  const a = await item(page, 'tools').boundingBox()
  const b = await item(page, 'diffs').boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 4)
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)

  await expect(item(page, 'diffs')).toHaveClass(/drop-target/)
  await expect(item(page, 'tools')).toHaveClass(/dragging/)

  await page.mouse.up()
  await expect(item(page, 'diffs')).not.toHaveClass(/drop-target/)
})

// The item is both drag handle and button: a drag swallows its own click and no more.
test('a plain click opens the panel, and a drag does not', async ({ page }) => {
  await item(page, 'snippets').click()
  await expect(item(page, 'snippets')).toHaveAttribute('aria-pressed', 'true')
  await item(page, 'home').click()

  await dragItem(page, 'snippets', 'diffs')
  await expect.poll(() => railOrder(page)).toEqual(['home', 'snippets', 'diffs', 'tools', 'keys'])
  await expect(item(page, 'home')).toHaveAttribute('aria-pressed', 'true')
})

test('Home stays first', async ({ page }) => {
  await dragItem(page, 'home', 'tools')
  await dragItem(page, 'tools', 'home')
  expect((await railOrder(page))[0]).toBe('home')
})

// A native <svg> drag fires pointercancel on real hardware, which page.mouse never reproduces.
test('a rail item refuses to become a native drag source', async ({ page }) => {
  const preventedFrom = (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel)
      const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true })
      el.dispatchEvent(ev)
      return ev.defaultPrevented
    }, selector)

  expect(await preventedFrom('.rail-item[data-panel="snippets"] svg')).toBe(true)
  expect(await preventedFrom('.rail-item[data-panel="snippets"]')).toBe(true)
})

test('a reorder survives a relaunch', async () => {
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    let page = await firstReadyPage(app)
    await dragItem(page, 'snippets', 'diffs')
    await expect.poll(() => railOrder(page)).toEqual(['home', 'snippets', 'diffs', 'tools', 'keys'])
    await app.close()

    app = await launchApp(dir)
    page = await firstReadyPage(app)
    await expect.poll(() => railOrder(page)).toEqual(['home', 'snippets', 'diffs', 'tools', 'keys'])
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
