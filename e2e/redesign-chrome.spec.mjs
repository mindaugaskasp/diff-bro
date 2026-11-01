import { test, expect } from './fixtures.mjs'

async function newComparison(page) {
  await page
    .locator('.diff-tabs')
    .getByRole('button', { name: 'New comparison', exact: true })
    .click()
}

test('the tabs and the actions share one row above the comparison', async ({ page }) => {
  await newComparison(page)
  const bar = page.locator('.topbar')
  await expect(bar.locator('.diff-tabs')).toBeVisible()
  await expect(bar.locator('.toolbar')).toBeVisible()
  await expect(page.locator('.app > .toolbar')).toHaveCount(0)

  const add = await bar.locator('.diff-tabs .add').boundingBox()
  const save = await bar.getByRole('button', { name: 'Save', exact: true }).boundingBox()
  expect(Math.abs(add.y + add.height / 2 - (save.y + save.height / 2))).toBeLessThanOrEqual(1)
})

// A control as tall as the band reads as part of its frame: each keeps clear of
// the row's edges.
test('every button in the top row keeps clear of its edges', async ({ page }) => {
  await newComparison(page)
  const bar = await page.locator('.topbar').boundingBox()
  const boxes = await page
    .locator('.topbar .btn:visible')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
  expect(boxes.length).toBeGreaterThan(3)
  for (const b of boxes) {
    expect(b.top - bar.y).toBeGreaterThanOrEqual(2)
    expect(bar.y + bar.height - b.bottom).toBeGreaterThanOrEqual(2)
  }
})

test('every action but Save is its icon, named for assistive tech', async ({ page }) => {
  await newComparison(page)
  const actions = page.locator('.toolbar .btn:visible')
  await expect(actions.first()).toBeVisible()
  for (const btn of await actions.all()) {
    const primary = await btn.evaluate((el) => el.classList.contains('btn-primary'))
    const text = (await btn.innerText()).trim()
    if (primary) expect(text).toBe('Save')
    else {
      expect(text, 'a non-primary action draws no word').toBe('')
      expect(await btn.getAttribute('aria-label')).toBeTruthy()
    }
  }
})
