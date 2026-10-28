import { test, expect, showPanel } from './fixtures.mjs'

const TOOLS = [
  ['Base64', 'Base64'],
  ['JSON', 'JSON'],
  ['XML', 'XML'],
  ['UUID', 'UUID'],
  ['JWT', 'JWT'],
  ['Epoch', 'Epoch'],
  ['URL', 'URL'],
  ['Lines', 'Lines'],
  ['Checksum', 'Checksum'],
  ['Regex', 'Regex'],
  ['Encrypt', 'Encrypt / decrypt text']
]

const panel = (page) => page.locator('.dialog').last()

async function openTool(page, tile, title) {
  await showPanel(page, 'tools')
  await page.locator('.tt-tile', { hasText: tile }).first().click()
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  return dialog
}

async function clickOutside(page) {
  await page.mouse.click(4, 400)
}

test('every tool opens at one size, and fits the minimum window without scrolling', async ({
  page
}) => {
  await page.setViewportSize({ width: 1120, height: 640 })
  for (const [tile, title] of TOOLS) {
    const dialog = await openTool(page, tile, title)
    const box = await panel(page).boundingBox()
    expect([Math.round(box.width), Math.round(box.height)], title).toEqual([720, 540])
    expect(box.y, title).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height, title).toBeLessThanOrEqual(640)
    const scrolls = await panel(page).evaluate((el) => el.scrollHeight > el.clientHeight + 1)
    expect(scrolls, `${title} scrolls`).toBe(false)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
})

test('a resize in one tool is the size the next one opens at', async ({ page }) => {
  await openTool(page, 'JSON', 'JSON')
  const box = await panel(page).boundingBox()
  const handle = panel(page).locator('.dlg-resize.se')
  const grip = await handle.boundingBox()
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + 60, grip.y + 40, { steps: 5 })
  await page.mouse.up()
  const resized = await panel(page).boundingBox()
  expect(resized.width).toBeGreaterThan(box.width)
  await page.keyboard.press('Escape')

  await openTool(page, 'Encrypt', 'Encrypt / decrypt text')
  const next = await panel(page).boundingBox()
  expect(Math.round(next.width)).toBe(Math.round(resized.width))
  expect(Math.round(next.height)).toBe(Math.round(resized.height))
})

test('a click outside closes any tool, and its input is still there on reopening', async ({
  page
}) => {
  const dialog = await openTool(page, 'Base64', 'Base64')
  await dialog.getByRole('textbox').first().fill('keep me')
  await clickOutside(page)
  await expect(dialog).toHaveCount(0)

  const again = await openTool(page, 'Base64', 'Base64')
  await expect(again.getByRole('textbox').first()).toHaveValue('keep me')
})

test('a drag that starts inside a tool and ends outside does not close it', async ({ page }) => {
  const dialog = await openTool(page, 'Lines', 'Lines')
  const box = await panel(page).boundingBox()
  await page.mouse.move(box.x + 40, box.y + 120)
  await page.mouse.down()
  await page.mouse.move(4, 400, { steps: 5 })
  await page.mouse.up()
  await expect(dialog).toBeVisible()
})

test('the JSON tool colours its input and its output', async ({ page }) => {
  const dialog = await openTool(page, 'JSON', 'JSON')
  await dialog.getByRole('textbox', { name: 'JSON' }).fill('{"name":"billing","port":8080}')

  await expect(dialog.locator('.tjs-in-field .syn-property').first()).toHaveText('"name"')
  await expect(dialog.locator('.tjs-text .syn-string').first()).toHaveText('"billing"')
  await expect(dialog.locator('.tjs-text .syn-number').first()).toHaveText('8080')
})
