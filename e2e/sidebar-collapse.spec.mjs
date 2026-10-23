import { rmSync } from 'node:fs'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

// Collapsing is layout and persistence, so it only answers in a real window:
// jsdom has no widths to animate and no relaunch to survive.

const aside = (page) => page.locator('aside.saved')
const rail = (page) => page.locator('aside.saved .rail')
const collapse = (page) => page.getByRole('button', { name: 'Collapse the sidebar' })
const widthOf = (page) => aside(page).evaluate((el) => el.getBoundingClientRect().width)

test('collapsing gives the width back to the comparison', async ({ page }) => {
  const before = await widthOf(page)
  expect(before).toBeGreaterThan(200)

  const diffBefore = await page.locator('.pane').evaluate((el) => el.getBoundingClientRect().width)
  await collapse(page).click()

  await expect.poll(() => widthOf(page)).toBeLessThan(60)
  await expect(rail(page)).toBeVisible()
  const diffAfter = await page.locator('.pane').evaluate((el) => el.getBoundingClientRect().width)
  expect(diffAfter).toBeGreaterThan(diffBefore + 150)
})

// The reason the rail was chosen over hiding it outright: every entry point is
// still on screen.
test('the rail keeps every panel reachable, with its count', async ({ page }) => {
  await collapse(page).click()
  await expect(rail(page)).toBeVisible()
  for (const name of [/^Home/, /^Diffs/, /^Snippets/, /^Tools/]) {
    await expect(rail(page).getByRole('button', { name })).toBeVisible()
  }
})

test('a rail item opens the sidebar on that panel', async ({ page }) => {
  await collapse(page).click()
  await rail(page)
    .getByRole('button', { name: /^Snippets/ })
    .click()

  await expect.poll(() => widthOf(page)).toBeGreaterThan(200)
  await expect(page.getByPlaceholder('Search snippets')).toBeVisible()
})

// Expanding must not mean picking a section you did not want, so the way back
// out is its own control rather than a section glyph.
test('the rail has its own expand button', async ({ page }) => {
  await collapse(page).click()
  const expand = rail(page).getByRole('button', { name: 'Expand the sidebar' })
  await expect(expand).toBeVisible()
  await expand.click()
  await expect.poll(() => widthOf(page)).toBeGreaterThan(200)
  await expect(page.getByPlaceholder('Search everything')).toBeVisible()
})

// Reported twice from a build where the rail's toggle sat at the foot: it reads
// as the control having fallen off. The two states hold the SAME control, so it
// must not move — asserted as a vertical position, not a screenshot.
test('the toggle keeps its position when the sidebar collapses', async ({ page }) => {
  const centreOf = (sel) =>
    page.evaluate((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect()
      return r ? r.top + r.height / 2 : null
    }, sel)

  const expanded = await centreOf('aside.saved .rail-band .sidebar-toggle')
  expect(expanded).not.toBeNull()

  await collapse(page).click()
  await expect(rail(page)).toBeVisible()
  const collapsed = await centreOf('aside.saved .rail-band .sidebar-toggle')

  expect(collapsed).not.toBeNull()
  // It is in the TOP band — the failure being guarded against is it sliding to
  // the foot of the rail, which is half a window away.
  const railHeight = await rail(page).evaluate((el) => el.getBoundingClientRect().height)
  expect(collapsed).toBeLessThan(railHeight / 4)
  // ...and lands EXACTLY where it was. Both states put the same control in a
  // --band-row content box, so "the toggle never moves" is literal — a tolerance
  // here would just hide the next half-pixel of drift.
  expect(collapsed).toBe(expanded)
})

test('the collapse toggle sits level with the search box', async ({ page }) => {
  const centres = await page.evaluate(() => {
    const mid = (s) => {
      const r = document.querySelector(s).getBoundingClientRect()
      return r.top + r.height / 2
    }
    return { box: mid('.field-search'), toggle: mid('.rail-band .sidebar-toggle') }
  })
  expect(Math.abs(centres.box - centres.toggle)).toBeLessThanOrEqual(1)
})

// The rail is built from the shared size scale, never a bespoke box: its top
// cell is --band-row and its controls are --control-h, so collapsing changes
// the sidebar's width and nothing about its rhythm.
test('the rail is built from the size scale, not a bespoke box', async ({ page }) => {
  await collapse(page).click()
  await expect(rail(page)).toBeVisible()

  const scale = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const px = (name) => parseFloat(root.getPropertyValue(name))
    const band = document.querySelector('aside.saved .rail-band').getBoundingClientRect().height
    const item = document.querySelector('aside.saved .rail-item').getBoundingClientRect()
    return {
      band,
      bandToken: px('--band-row'),
      btnToken: px('--control-h'),
      item: item.height,
      itemToken: px('--rail-item')
    }
  })
  // The band is the shared row PLUS the tab strip above the comparison column,
  // which is what puts its rule on the same line as the file slots' — see the
  // alignment test below. Still composed from tokens, never a bespoke number.
  expect(scale.band).toBeCloseTo(scale.bandToken + scale.btnToken + 1, 0)
  expect(scale.item).toBeCloseTo(scale.itemToken, 0)
})

// "The side looks detached": the rail's first rule sat 31px above the line under
// the file slots, so the two columns read as unrelated grids.
test('the rail rule lands on the same line as the file slots', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('a')
  await page.getByPlaceholder('Paste changed text here').fill('b')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()
  await collapse(page).click()
  await expect(rail(page)).toBeVisible()

  const rows = await page.evaluate(() => {
    const bottom = (s) => Math.round(document.querySelector(s).getBoundingClientRect().bottom)
    return { band: bottom('.rail-band'), slots: bottom('.file-slots-row') }
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

  await collapse(page).click()
  await expect
    .poll(() => page.evaluate(() => window.widthTransition))
    .toEqual(['transitionstart', 'transitionend'])
  expect(await widthOf(page)).toBeLessThan(60)
})

// A preference, so it has to outlive the window that set it. Manages its own
// profile rather than using the per-test fixture, like session-restore does.
test('the collapsed sidebar survives a relaunch', async () => {
  const userDataDir = freshUserDataDir()
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)
    await collapse(page).click()
    await expect.poll(() => widthOf(page)).toBeLessThan(60)
    await app.close()

    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    await expect(page.locator('aside.saved .rail')).toBeVisible()
    expect(await widthOf(page)).toBeLessThan(60)
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// Widen only, and it survives a relaunch. The sidebar collapses to a rail for
// the other direction; a half-narrow list truncates every name without freeing
// space worth having.
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
    // The cap is the panel's; the rail beside it does not stretch.
    const railW = (await page.locator('.rail').boundingBox()).width
    expect(Math.round(capped - railW)).toBe(Math.round((start - railW) * 1.5))
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

// Section reorder moved to e2e/section-reorder.spec.mjs. The version that lived
// here dispatched dragstart/dragover/drop by hand, on the belief that "HTML5
// drag-and-drop is not driven by mouse events" — which is untrue, and is exactly
// why a reorder that was dead on Windows kept a green test.
