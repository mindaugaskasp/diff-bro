import { test, expect } from './fixtures.mjs'

// Geometry of the resizable Mermaid viewer — the parts jsdom can't measure (no
// layout). The window's own maximize follows OS fullscreen, and the panel can be
// dragged bigger from any corner. Both ride on the seeded example diagram.

async function openViewer(page) {
  const row = page.getByText('Example — Mermaid diagram')
  await expect(row).toBeVisible()
  await row.hover() // row actions reveal on hover
  await page.getByRole('button', { name: 'View diagram' }).click()
  const panel = page.locator('.viewer-backdrop .panel')
  await expect(panel).toBeVisible()
  return panel
}

test('the viewer fills the window when the app enters fullscreen', async ({ app, page }) => {
  const panel = await openViewer(page)
  const before = await panel.boundingBox()
  const innerW = await page.evaluate(() => window.innerWidth)
  expect(before.width).toBeLessThan(innerW * 0.95) // starts windowed

  // window.js pushes `window:fullscreen` on enter-full-screen. Xvfb can't truly
  // fullscreen, so drive the exact same main→renderer signal.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('window:fullscreen', true)
  })

  await expect.poll(async () => (await panel.boundingBox()).width).toBeGreaterThan(before.width)
  const after = await panel.boundingBox()
  expect(after.width).toBeGreaterThanOrEqual(innerW * 0.9)
})

test('the viewer resizes by dragging its SE corner, pinning the NW corner', async ({ page }) => {
  const panel = await openViewer(page)
  const before = await panel.boundingBox()

  const handle = page.locator('.resize-handle.se')
  const h = await handle.boundingBox()
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(h.x + h.width / 2 + 90, h.y + h.height / 2 + 70, { steps: 8 })
  await page.mouse.up()

  const after = await panel.boundingBox()
  expect(after.width).toBeGreaterThan(before.width + 60)
  expect(after.height).toBeGreaterThan(before.height + 50)
  // The opposite (NW) corner holds still while the SE corner is dragged out.
  expect(Math.abs(after.x - before.x)).toBeLessThan(3)
  expect(Math.abs(after.y - before.y)).toBeLessThan(3)
})
