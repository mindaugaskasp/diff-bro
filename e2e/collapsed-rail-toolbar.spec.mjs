import { test, expect } from './fixtures.mjs'

// The key pair centres over the sidebar COLUMN, cancelling the toolbar's inset
// with a negative margin so it starts where the sidebar does. Collapsed, the
// pair is wider than the 47px rail, so centring cannot move it and that
// negative margin dragged it flush against the window edge.
const insetOf = (page) =>
  page.evaluate(() => {
    const btn = document.querySelector('.key-actions .btn')
    const bar = document.querySelector('.app-toolbar') ?? btn.closest('header, .toolbar, div')
    return {
      buttonLeft: Math.round(btn.getBoundingClientRect().left),
      barPad:
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-pad')) || 12,
      barLeft: Math.round(bar.getBoundingClientRect().left)
    }
  })

test('the key buttons keep the toolbar inset when the sidebar is collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await expect(page.locator('.key-actions .btn').first()).toBeVisible()

  await page.locator('.sidebar-toggle').first().click()
  await page.locator('.rail').waitFor()
  await page.waitForTimeout(300)

  const { buttonLeft, barPad } = await insetOf(page)
  // Never flush against the window: it keeps at least the toolbar's own inset.
  expect(buttonLeft).toBeGreaterThanOrEqual(barPad)
})

test('the key buttons still centre over an expanded sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await expect(page.locator('.key-actions .btn').first()).toBeVisible()
  const { buttonLeft, barPad } = await insetOf(page)
  // Expanded, the block centres over a 256px column, so it starts well inside.
  expect(buttonLeft).toBeGreaterThan(barPad)
})
