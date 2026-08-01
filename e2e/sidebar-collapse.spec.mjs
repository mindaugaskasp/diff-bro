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

// The row is one control strip: a borderless glyph jammed against a bordered
// field read as dropped in rather than placed.
test('the collapse control matches the search box it sits beside', async ({ page }) => {
  const row = await page.evaluate(() => {
    const box = document.querySelector('.usb-search').getBoundingClientRect()
    const btn = document.querySelector('.usb-collapse').getBoundingClientRect()
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
  expect(scale.band).toBeCloseTo(scale.bandToken, 0)
  expect(scale.btn).toBeCloseTo(scale.btnToken, 0)
})

// Asked for explicitly: the comparison must not jump when the sidebar goes.
test('the width is animated rather than cut', async ({ page }) => {
  const transition = await aside(page).evaluate((el) => {
    const s = getComputedStyle(el)
    return { prop: s.transitionProperty, ms: s.transitionDuration }
  })
  expect(transition.prop).toContain('width')
  expect(parseFloat(transition.ms)).toBeGreaterThan(0)

  // Mid-flight it is between the two widths, not already at the end.
  await collapse(page).click()
  await page.waitForTimeout(60)
  const mid = await widthOf(page)
  expect(mid).toBeGreaterThan(48)
  expect(mid).toBeLessThan(256)
  await expect.poll(() => widthOf(page)).toBeLessThan(60)
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
