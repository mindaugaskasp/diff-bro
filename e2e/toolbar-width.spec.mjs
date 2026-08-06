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
test('the toolbar has nothing to scroll vertically at the minimum size', async ({ app, page }) => {
  await minimumSize(app, page)

  const options = page.locator('.toolbar .options')
  await expect.poll(() => options.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0)

  // And the axis stays named, so `overflow-x` alone cannot silently reintroduce
  // the vertical bar the next time something in here grows.
  expect(await options.evaluate((el) => getComputedStyle(el).overflowY)).toBe('hidden')
})

// A translated build is where this re-breaks: en-XA pads every message by ~40%,
// so a minimum tuned only to English silently reintroduces the scrollbar the
// moment anyone switches language. The toolbar absorbs it internally.
test('a longer locale scrolls the toolbar, never the application', async ({ app, page }) => {
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
})
