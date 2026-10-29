import { rmSync } from 'node:fs'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

// Collapsing is layout and persistence, so it only answers in a real window:
// jsdom has no widths to animate and no relaunch to survive.

const aside = (page) => page.locator('aside.saved')
const widthOf = (page) => aside(page).evaluate((el) => el.getBoundingClientRect().width)
// The handle shows on the seam it sits on (#144, Q13).
async function collapse(page) {
  await page.locator('.usb-grip').hover()
  await page.getByRole('button', { name: 'Hide the sidebar' }).click()
}

test('collapsing gives the width back to the comparison', async ({ page }) => {
  const before = await widthOf(page)
  expect(before).toBeGreaterThan(200)

  const diffBefore = await page.locator('.pane').evaluate((el) => el.getBoundingClientRect().width)
  await collapse(page)

  await expect.poll(() => widthOf(page)).toBeLessThan(2)
  await expect(page.getByRole('button', { name: 'Show the sidebar' })).toHaveCount(1)
  const diffAfter = await page.locator('.pane').evaluate((el) => el.getBoundingClientRect().width)
  expect(diffAfter).toBeGreaterThan(diffBefore + 150)
})

// Across the divider the bands share their lines: the segmented band ends with
// the top bar (segmented-nav), and the search band with the file slots.
test('the search band ends on the same line as the file slots', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('a')
  await page.getByPlaceholder('Paste or type the changed text').fill('b')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()

  const rows = await page.evaluate(() => {
    const bottom = (s) => Math.round(document.querySelector(s).getBoundingClientRect().bottom)
    return { band: bottom('.usb-controls'), slots: bottom('.file-slots-row') }
  })
  expect(Math.abs(rows.band - rows.slots)).toBeLessThanOrEqual(1)
})

// Asked for explicitly: the comparison must not jump when the sidebar goes.
test('the width is animated rather than cut', async ({ page }) => {
  const transition = await aside(page).evaluate((el) => {
    const s = getComputedStyle(el)
    return { prop: s.transitionProperty, ms: s.transitionDuration }
  })
  expect(transition.prop).toContain('width')
  expect(parseFloat(transition.ms)).toBeGreaterThan(0)

  // From the element's own events, not a wall-clock sample mid-flight: a busy
  // machine overruns the animation, and "already at the end" measures the load.
  await aside(page).evaluate((el) => {
    window.widthTransition = []
    const note = (event) => {
      if (event.propertyName === 'width') window.widthTransition.push(event.type)
    }
    el.addEventListener('transitionstart', note)
    el.addEventListener('transitionend', note)
  })

  await collapse(page)
  await expect
    .poll(() => page.evaluate(() => window.widthTransition))
    .toEqual(['transitionstart', 'transitionend'])
  expect(await widthOf(page)).toBeLessThan(2)
})

// A preference, so it has to outlive the window that set it. Manages its own
// profile rather than using the per-test fixture, like session-restore does.
test('the collapsed sidebar survives a relaunch', async () => {
  const userDataDir = freshUserDataDir()
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)
    await collapse(page)
    await expect.poll(() => widthOf(page)).toBeLessThan(2)
    await app.close()

    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    await expect(page.getByRole('button', { name: 'Show the sidebar' })).toHaveCount(1)
    expect(await widthOf(page)).toBeLessThan(2)
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// Widen only, and it survives a relaunch. The other direction is collapsing; a
// half-narrow list truncates every name without freeing space worth having.
test('the sidebar drags wider, stops at the cap, and comes back that way', async () => {
  const dir = freshUserDataDir()
  const drag = async (page, dx) => {
    const grip = await page.locator('.usb-grip').boundingBox()
    const y = grip.y + grip.height / 2
    await page.mouse.move(grip.x + 3, y)
    await page.mouse.down()
    await page.mouse.move(grip.x + 3 + dx, y, { steps: 8 })
    await page.mouse.up()
    return (await page.locator('.saved').boundingBox()).width
  }

  try {
    const first = await launchApp(dir)
    const page = await firstReadyPage(first)
    const start = (await page.locator('.saved').boundingBox()).width

    expect(await drag(page, 30)).toBeGreaterThan(start)
    // Dragged back the other way it stops where it began, rather than shrinking
    // into a column too narrow to read a name in.
    expect(await drag(page, -400)).toBe(start)
    // And past the cap the pointer keeps going while the sidebar does not.
    const capped = await drag(page, 900)
    // Half again the default; the keyline on its right edge does not stretch.
    const edge = await aside(page).evaluate((el) =>
      parseFloat(getComputedStyle(el).borderRightWidth)
    )
    expect(Math.round(capped - edge)).toBe(Math.round((start - edge) * 1.5))
    await first.close()

    const second = await launchApp(dir)
    const back = await firstReadyPage(second)
    await expect(back.locator('.saved')).toBeVisible()
    expect((await back.locator('.saved').boundingBox()).width).toBe(capped)
    await second.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
