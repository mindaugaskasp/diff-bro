import { test, expect, clickAppMenuItem } from './fixtures.mjs'

// The window's own minimum is the contract: at the smallest size the app lets
// itself be opened at, nothing may push the DOCUMENT wider than the viewport.
// A sideways-scrolling app takes the sidebar, the panes and the status band with
// it, and the toolbar had been 334px over that line since it grew its fourth
// toggle.
//
// Asserted against getMinimumSize() rather than a literal, so raising or
// lowering the minimum re-aims the test instead of stranding it.

const minimumSize = async (app, page) => {
  const win = await app.browserWindow(page)
  const [width, height] = await win.evaluate((w) => w.getMinimumSize())
  await win.evaluate((w, size) => w.setBounds({ width: size[0], height: size[1] }), [width, height])
  return { width, height }
}

const overflow = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
  })

test('the app does not scroll sideways at its minimum window size', async ({ app, page }) => {
  const { width } = await minimumSize(app, page)
  expect(width).toBeGreaterThan(0)

  await expect
    .poll(async () => {
      const { scrollWidth, clientWidth } = await overflow(page)
      return scrollWidth - clientWidth
    })
    .toBe(0)
})

// The stronger half: the toolbar must FIT at the minimum, not merely be
// contained. Without this the minimum could be set one pixel under the bar's
// intrinsic width and the first test would still pass, with the last action
// silently clipped behind an internal scroll.
test('the toolbar is not clipped at the minimum window size', async ({ app, page }) => {
  await minimumSize(app, page)

  await expect
    .poll(() => page.locator('.toolbar .options').evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBe(0)
})

// Neither assertion above notices a SCROLLBAR. The regression that shipped past
// them was the group divider bleeding into the bar's padding with a negative
// margin: once `.options` became a scroll container that bleed was the only
// thing overflowing it, which bought a stepper-arrow scrollbar on the band's
// right edge for 8px of line. It was caught by LOOKING at screenshots.
//
// Measured as overflow rather than as a gutter: macOS draws overlay scrollbars,
// which consume no layout width, so offsetWidth - clientWidth stays 0 there even
// with a bar on screen.
test('the toolbar has nothing to scroll at the minimum size', async ({ app, page }) => {
  await minimumSize(app, page)

  const options = page.locator('.toolbar .options')
  await expect.poll(() => options.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0)

  // This used to assert `overflowY === 'hidden'`, which guarded the old
  // mechanism: `.options` was `overflow: auto hidden`, and naming only overflow-x
  // would have computed overflow-y to `auto` and bought a stepper scrollbar on
  // the band's edge. The row is not a scroll container at all now — the View menu
  // and the overflow menu keep it inside its width instead of hiding the end of
  // it — so the invariant is the stronger one: NEITHER axis may scroll. It also
  // has to stay visible for either popover to hang below the bar rather than be
  // clipped by it.
  const { overflowX, overflowY } = await options.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { overflowX: cs.overflowX, overflowY: cs.overflowY }
  })
  expect(overflowX).toBe('visible')
  expect(overflowY).toBe('visible')
})

const hiddenInBar = (page) =>
  page.locator('.toolbar .options').evaluate((el) => el.scrollWidth - el.clientWidth)

// Drag the sidebar seam to its cap. `.key-actions` is `width: var(--sidebar-w)`,
// so every pixel the sidebar gains is a pixel the bar's controls lose — the one
// term in the toolbar's width that the READER moves.
async function widenSidebarToCap(page) {
  const grip = page.locator('.usb-grip')
  const box = await grip.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  // Past SIDEBAR_MAX on purpose; clampSidebarWidth pins it to 384.
  await page.mouse.move(box.x + 400, box.y + 200, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(() =>
      page.locator('.saved').evaluate((el) => Math.round(el.getBoundingClientRect().width))
    )
    .toBe(384)
}

const setZoom = (app, page, level) =>
  app
    .browserWindow(page)
    .then((win) => win.evaluate((w, z) => w.webContents.setZoomLevel(z), level))

// A translated build is where this re-breaks: en-XA pads every message by ~40%,
// so a minimum tuned only to English silently reintroduces the scrollbar the
// moment anyone switches language.
//
// This used to assert only that the DOCUMENT stayed put, and its name said the
// toolbar "absorbs it internally" — which is precisely the bug. Absorbing it
// means Save, Share and the three icon buttons scroll out of sight behind a
// hairline track, with nothing to say they left. Both halves are asserted now.
test('a longer locale fits the toolbar as well as the application', async ({ app, page }) => {
  await minimumSize(app, page)
  // The application menu, not the in-app MenuBar: the latter only exists on
  // Windows/Linux, and this invariant is not platform-specific.
  await clickAppMenuItem(app, 'Settings')
  await page.getByRole('combobox', { name: /Language|Łàńğūàğé/u }).selectOption('en-XA')
  await page.keyboard.press('Escape')

  await expect
    .poll(async () => {
      const { scrollWidth, clientWidth } = await overflow(page)
      return scrollWidth - clientWidth
    })
    .toBe(0)
  await expect.poll(() => hiddenInBar(page)).toBe(0)
})

// The widest reachable layout: minimum window, sidebar dragged to its cap. Both
// are things a reader does deliberately, and together they cost the bar 128px it
// never had.
test('the toolbar fits with the sidebar dragged to its cap', async ({ app, page }) => {
  await minimumSize(app, page)
  await widenSidebarToCap(page)

  await expect.poll(() => hiddenInBar(page)).toBe(0)
})

// The two together, at 100% zoom — the gap between the two tests above, and the
// one state neither of them reaches. It matters because a language switch
// changes what every control MEASURES without changing the size of the row it
// sits in: the ResizeObserver never fires, so the bar has to notice on its own
// or it goes on believing the widths it learned in English.
test('a longer locale re-measures the bar even at an unchanged window size', async ({
  app,
  page
}) => {
  await minimumSize(app, page)
  await widenSidebarToCap(page)
  await clickAppMenuItem(app, 'Settings')
  await page.getByRole('combobox', { name: /Language|Łàńğūàğé/u }).selectOption('en-XA')
  await page.keyboard.press('Escape')

  await expect
    .poll(async () => {
      const { scrollWidth, clientWidth } = await overflow(page)
      return scrollWidth - clientWidth
    })
    .toBe(0)
  await expect.poll(() => hiddenInBar(page)).toBe(0)
})

// Zoom is the case no fixed layout survives on its own. ZOOM_MAX is 2.5
// (src/main/menu.js), a factor of 1.2^2.5 ≈ 1.577, so the minimum window offers
// the layout ~710 CSS px — well under the bar's intrinsic width however short
// the language is. Read off getMinimumSize() and the live zoom level rather than
// hardcoded, so changing either bound re-aims the test instead of stranding it.
test('the toolbar fits at maximum zoom, in a long locale, at the cap', async ({ app, page }) => {
  await minimumSize(app, page)
  await widenSidebarToCap(page)
  await clickAppMenuItem(app, 'Settings')
  await page.getByRole('combobox', { name: /Language|Łàńğūàğé/u }).selectOption('en-XA')
  await page.keyboard.press('Escape')
  await setZoom(app, page, 2.5)

  // Proves the zoom actually took, so a silently-ignored setZoomLevel cannot
  // turn this into a second copy of the test above.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.clientWidth))
    .toBeLessThan(800)
  await expect.poll(() => hiddenInBar(page)).toBe(0)
})
