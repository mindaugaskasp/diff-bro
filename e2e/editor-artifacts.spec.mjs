import { test, expect, clickAppMenuItem } from './fixtures.mjs'

// Monaco paints its stock-'vs' surfaces while the app tints its editors to
// token colours; every disagreement is a pale sliver, and it kept coming back
// because each fix targeted whichever SELECTOR was guilty that time. So this
// asserts the symptom in pixels: nothing may paint BRIGHTER than the editor's
// own surface. Text and highlights are darker or tinted, so the surface is the
// ceiling — a stray white hairline crosses it for most of the width.

const SURFACE_MARGIN = 10 // 8-bit levels; a hairline of white on grey is ~40
const SPAN = 0.5 // a sliver worth seeing runs at least half the width

// Measured in the main process so the bitmap never crosses IPC: returns the
// worst row, as a fraction of its pixels brighter than the surface.
async function brightestRow(app, rect) {
  return app.evaluate(
    async ({ BrowserWindow }, { area, margin }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      const image = await win.webContents.capturePage(area)
      const { width, height } = image.getSize()
      const data = image.toBitmap() // BGRA
      const stride = data.length / height
      const lum = (i) => 0.114 * data[i] + 0.587 * data[i + 1] + 0.299 * data[i + 2]

      const histogram = new Map()
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const v = Math.round(lum(y * stride + x * 4))
          histogram.set(v, (histogram.get(v) ?? 0) + 1)
        }
      }
      const surface = [...histogram.entries()].sort((a, b) => b[1] - a[1])[0][0]

      let worst = { row: -1, share: 0, peak: surface }
      for (let y = 0; y < height; y++) {
        let over = 0
        let peak = 0
        for (let x = 0; x < width; x++) {
          const v = lum(y * stride + x * 4)
          if (v > surface + margin) over++
          if (v > peak) peak = v
        }
        const share = over / width
        if (share > worst.share) worst = { row: y, share, peak: Math.round(peak) }
      }
      return { ...worst, surface, height }
    },
    { area: rect, margin: SURFACE_MARGIN }
  )
}

async function editorRect(page) {
  return page.evaluate(() => {
    const r = document.querySelector('.dialog .editor-area .editor').getBoundingClientRect()
    // Inset past the panel's own border, which is legitimately not the surface.
    return {
      x: Math.round(r.x + 2),
      y: Math.round(r.y + 2),
      width: Math.round(r.width - 4),
      height: Math.round(r.height - 4)
    }
  })
}

async function expectNoPaleSliver(app, page, what) {
  const worst = await brightestRow(app, await editorRect(page))
  expect(
    worst.share,
    `${what}: row ${worst.row}/${worst.height} paints ${(worst.share * 100).toFixed(0)}% of its width brighter than the editor surface (peak ${worst.peak} vs surface ${worst.surface})`
  ).toBeLessThan(SPAN)
}

test('the snippet editor shows no pale sliver in view mode', async ({ app, page }) => {
  await page.locator('li.row').first().click()
  await expect(page.getByRole('dialog', { name: 'Snippet', exact: true })).toBeVisible()
  await page.waitForTimeout(700)
  await expectNoPaleSliver(app, page, 'view mode')
})

// Seven of the fourteen themes are light-ground, so Monaco stays on its stock
// 'vs' palette while the app tints the surface to a token — the exact mismatch
// that produces the sliver. Sepia's parchment ground is the furthest from
// Monaco's near-white, so it is where a leak shows up first.
test('the snippet editor shows no pale sliver on a tinted light ground', async ({ app, page }) => {
  // The Electron menu, not the in-app MenuBar, which macOS does not render.
  await clickAppMenuItem(app, 'Settings')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Use the Sepia theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia')
  await page.keyboard.press('Escape')

  await page.locator('li.row').first().click()
  await expect(page.getByRole('dialog', { name: 'Snippet', exact: true })).toBeVisible()
  await page.waitForTimeout(700)
  await expectNoPaleSliver(app, page, 'sepia view mode')
})

test('the snippet editor shows no pale sliver in edit mode', async ({ app, page }) => {
  await page.locator('li.row').first().click()
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await view.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Edit Snippet' })).toBeVisible()
  await page.locator('.dialog .editor').click()
  await page.waitForTimeout(700)
  await expectNoPaleSliver(app, page, 'edit mode')
})
