import { rmSync } from 'node:fs'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage, openMenu } from './fixtures.mjs'

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
test('the rail keeps every section reachable, with its count', async ({ page }) => {
  await collapse(page).click()
  await expect(rail(page)).toBeVisible()
  for (const name of [/^Saved diffs/, /^External diffs/, /^Snippets/, 'Tools']) {
    await expect(rail(page).getByRole('button', { name })).toBeVisible()
  }
})

test('a rail section opens the sidebar on that section', async ({ page }) => {
  await collapse(page).click()
  await rail(page)
    .getByRole('button', { name: /^Snippets/ })
    .click()

  await expect.poll(() => widthOf(page)).toBeGreaterThan(200)
  await expect(page.getByPlaceholder('Search diffs & snippets…')).toBeVisible()
})

// Expanding must not mean picking a section you did not want, so the way back
// out is its own control rather than a section glyph.
test('the rail has its own expand button', async ({ page }) => {
  await collapse(page).click()
  const expand = rail(page).getByRole('button', { name: 'Expand the sidebar' })
  await expect(expand).toBeVisible()
  await expand.click()
  await expect.poll(() => widthOf(page)).toBeGreaterThan(200)
  await expect(page.getByPlaceholder('Search diffs & snippets…')).toBeVisible()
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

  const expanded = await centreOf('aside.saved .usb-top .sidebar-toggle')
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

// The row is one control strip: a borderless glyph jammed against a bordered
// field read as dropped in rather than placed.
test('the collapse control matches the search box it sits beside', async ({ page }) => {
  const row = await page.evaluate(() => {
    const box = document.querySelector('.field-search').getBoundingClientRect()
    const btn = document.querySelector('.sidebar-toggle').getBoundingClientRect()
    return { gap: btn.left - box.right, boxH: box.height, btnH: btn.height }
  })
  expect(row.gap).toBeGreaterThanOrEqual(5)
  expect(Math.abs(row.boxH - row.btnH)).toBeLessThanOrEqual(2)
})

test('the search icon opens the sidebar with the box focused', async ({ page }) => {
  await collapse(page).click()
  await rail(page).getByRole('button', { name: 'Search diffs and snippets' }).click()
  await expect(page.getByPlaceholder('Search diffs & snippets…')).toBeFocused()
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
    const btn = document.querySelector('aside.saved .rail-btn').getBoundingClientRect()
    return { band, bandToken: px('--band-row'), btn: btn.height, btnToken: px('--control-h') }
  })
  // The band is the shared row PLUS the tab strip above the comparison column,
  // which is what puts its rule on the same line as the file slots' — see the
  // alignment test below. Still composed from tokens, never a bespoke number.
  expect(scale.band).toBeCloseTo(scale.bandToken + scale.btnToken + 1, 0)
  expect(scale.btn).toBeCloseTo(scale.btnToken, 0)
})

// "The side looks detached": the rail's first rule sat 31px above the line under
// the file slots, so the two columns read as unrelated grids.
test('the rail rule lands on the same line as the file slots', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste text' }).click()
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

// Open a tool from the menu and close it again, so it lands in the recents.
// Through the in-app bar, whose Tools dropdown labels them the way the rail
// does — the OS menu spells several out ("JWT Decode"), so its labels and the
// rail's would have to be kept in step by hand.
async function useTool(page, name) {
  await openMenu(page, 'Tools', name)
  const dialog = page.getByRole('dialog', { name })
  await expect(dialog).toBeVisible()
  await dialog.locator('.dialog-actions').getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)
}

// Driving the in-app menu bar, which exists on Windows and Linux only (App.vue
// gates it on !isMac) — on a Mac there is nothing there to click. `make e2e`
// runs in the Linux container, which is where these belong.
const NEEDS_MENU_BAR = [process.platform === 'darwin', 'the in-app menu bar is Windows/Linux only']

// Collapsing used to cost you the tools: the rail's only tools control expands
// the sidebar again. Recents now open where they stand.
test('the rail runs a recent tool without expanding the sidebar', async ({ page }) => {
  test.skip(...NEEDS_MENU_BAR)
  // Use two tools so there is a recents list at all.
  await useTool(page, 'Base64')
  await useTool(page, 'UUID')

  await collapse(page).click()
  await expect(rail(page)).toBeVisible()

  // Most-recent-first, under the rule that groups the tools corner.
  await expect(rail(page).locator('.rail-rule')).toBeVisible()
  const tools = rail(page).locator('.rail-recent .rail-btn')
  await expect(tools).toHaveCount(2)

  await rail(page).getByRole('button', { name: 'Generate UUID' }).click()
  await expect(page.getByRole('dialog', { name: 'UUID' })).toBeVisible()
  // ...and the sidebar is still collapsed, which is the whole point.
  await expect(rail(page)).toBeVisible()
  await expect(page.locator('.usb-top')).toHaveCount(0)
})

// Nine is what the rail has room for; the shelf keeps its measured three.
test('the rail remembers as many tools as it has room for', async ({ page }) => {
  test.skip(...NEEDS_MENU_BAR)
  const used = [
    'Base64',
    'UUID',
    'JWT',
    'Epoch',
    'URL',
    'Lines',
    'XML',
    'JSON',
    'Checksum',
    'Regex'
  ]
  for (const name of used) await useTool(page, name)
  await collapse(page).click()
  await expect(rail(page).locator('.rail-recent .rail-btn')).toHaveCount(9)
  // The oldest fell off rather than the newest never arriving.
  await expect(rail(page).getByRole('button', { name: 'Test Regex' })).toBeVisible()
  await expect(rail(page).getByRole('button', { name: 'Encode Base64' })).toHaveCount(0)
})

// Asked for explicitly: the tools take the leftover column. A fixed count either
// wastes a tall window or is clipped on a short one, so the rail measures.
test('the rail fits its tools to the window, and re-fits when it changes', async ({
  app,
  page
}) => {
  test.skip(...NEEDS_MENU_BAR)
  const used = ['Base64', 'UUID', 'JWT', 'Epoch', 'URL', 'Lines', 'XML', 'JSON', 'Checksum']
  for (const name of used) await useTool(page, name)
  await collapse(page).click()
  await expect(rail(page)).toBeVisible()

  const shown = () => rail(page).locator('.rail-recent .rail-btn').count()
  const setHeight = (h) =>
    app.evaluate(({ BrowserWindow }, height) => {
      const [w] = BrowserWindow.getAllWindows()
      const [width] = w.getContentSize()
      w.setContentSize(width, height)
    }, h)

  await setHeight(900)
  await expect.poll(shown).toBe(9) // everything remembered fits

  await setHeight(420)
  // Fewer, and never a clipped one: what is drawn still ends inside the box.
  await expect.poll(shown).toBeLessThan(9)
  const fits = await page.evaluate(() => {
    const box = document.querySelector('.rail-recent').getBoundingClientRect()
    const last = [...document.querySelectorAll('.rail-recent .rail-btn')].at(-1)
    return !last || last.getBoundingClientRect().bottom <= box.bottom + 1
  })
  expect(fits).toBe(true)

  await setHeight(900)
  await expect.poll(shown).toBe(9) // ...and back
})

// The wrench used to expand the sidebar, which is the one thing a collapsed
// rail's tools control must not do.
test('the rail wrench opens the tools palette, sidebar still collapsed', async ({ page }) => {
  await collapse(page).click()
  await rail(page).getByRole('button', { name: 'Tools' }).click()
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  await expect(rail(page)).toBeVisible()
  await expect(page.locator('.usb-top')).toHaveCount(0)
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

    // The toolbar's key pair is centred on this column, so it has to follow the
    // drag — it cancels the toolbar's own inset to do it.
    const offset = async () => {
      const [k, side] = await Promise.all([
        page.locator('.key-actions').boundingBox(),
        page.locator('.saved').boundingBox()
      ])
      return Math.abs(k.x + k.width / 2 - (side.x + side.width / 2))
    }
    expect(await offset()).toBeLessThanOrEqual(1)

    expect(await drag(page, 30)).toBeGreaterThan(start)
    expect(await offset()).toBeLessThanOrEqual(1)
    // Dragged back the other way it stops where it began, rather than shrinking
    // into a column too narrow to read a name in.
    expect(await drag(page, -400)).toBe(start)
    // And past the cap the pointer keeps going while the sidebar does not.
    const capped = await drag(page, 900)
    expect(capped).toBe(Math.round(start * 1.5))
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

// The order is the store's, and the headers are the handles. Dragging one past
// another has to survive a relaunch, or it is a preference the app forgets.
test('a sidebar section drags to a new place and stays there', async () => {
  const dir = freshUserDataDir()
  const order = (page) =>
    page
      .locator('.usb-scroll .section-head')
      .evaluateAll((els) => els.map((e) => e.dataset.section))

  try {
    const first = await launchApp(dir)
    const page = await firstReadyPage(first)
    expect(await order(page)).toStrictEqual(['saved', 'external', 'snippets'])

    // HTML5 drag-and-drop is not driven by mouse events, so the handlers are
    // called the way the browser would call them.
    await page.locator('[data-section="snippets"]').dispatchEvent('dragstart')
    await page.locator('[data-section="saved"]').dispatchEvent('dragover')
    await page.locator('[data-section="saved"]').dispatchEvent('drop')
    expect(await order(page)).toStrictEqual(['snippets', 'saved', 'external'])
    await first.close()

    const second = await launchApp(dir)
    const back = await firstReadyPage(second)
    await expect(back.locator('.usb-scroll .section-head').first()).toBeVisible()
    expect(await order(back)).toStrictEqual(['snippets', 'saved', 'external'])
    await second.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
