import { test, expect } from './fixtures.mjs'

// Geometry of the resizable Mermaid viewer — the parts jsdom can't measure (no
// layout). It opens filling the app; Restore shrinks it to a windowed size, OS
// fullscreen re-fills it, and the panel can be dragged bigger from any corner.
// All ride on the seeded example diagram.

async function openViewer(page) {
  const row = page.getByText('Example — Mermaid diagram')
  await expect(row).toBeVisible()
  await row.hover() // row actions reveal on hover
  await page.getByRole('button', { name: 'View diagram' }).click()
  const panel = page.locator('.viewer-backdrop .panel')
  await expect(panel).toBeVisible()
  return panel
}

// The viewer opens maximized, so shrink it to a windowed size first — both the
// resize and the fullscreen-refill checks need room to grow into.
async function restoreWindowed(page, panel, innerW) {
  await page.getByRole('button', { name: 'Restore size' }).click()
  await expect.poll(async () => (await panel.boundingBox()).width).toBeLessThan(innerW * 0.95)
}

test('the viewer opens filling the app, and refills after restore + fullscreen', async ({
  app,
  page
}) => {
  const panel = await openViewer(page)
  const innerW = await page.evaluate(() => window.innerWidth)
  // Opens maximized (full app size) by default.
  expect((await panel.boundingBox()).width).toBeGreaterThanOrEqual(innerW * 0.9)

  await restoreWindowed(page, panel, innerW)
  const windowed = await panel.boundingBox()

  // window.js pushes `window:fullscreen` on enter-full-screen. Xvfb can't truly
  // fullscreen, so drive the exact same main→renderer signal.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('window:fullscreen', true)
  })

  await expect.poll(async () => (await panel.boundingBox()).width).toBeGreaterThan(windowed.width)
  expect((await panel.boundingBox()).width).toBeGreaterThanOrEqual(innerW * 0.9)
})

test('the viewer resizes by dragging its SE corner, pinning the NW corner', async ({ page }) => {
  const panel = await openViewer(page)
  const innerW = await page.evaluate(() => window.innerWidth)
  await restoreWindowed(page, panel, innerW)
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
