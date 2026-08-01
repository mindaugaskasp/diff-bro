import { test, expect } from './fixtures.mjs'

// The strip's floor and its scrolling are layout, so only a real window can
// answer them: jsdom has no widths to shrink and no scrollWidth to overflow.

const bar = (page) => page.locator('.diff-tabs')
const track = (page) => page.locator('.diff-tabs .track')
const tabs = (page) => page.locator('.diff-tabs .tab')
const chevrons = (page) => page.locator('.diff-tabs .scroll')

async function addTabs(page, count) {
  for (let i = 0; i < count; i++) {
    if (i > 0) await bar(page).getByRole('button', { name: 'New comparison' }).click()
    await page.getByRole('button', { name: 'Paste text' }).click()
    await page.getByPlaceholder('Paste original text here').fill(`left ${i}`)
    await page.getByPlaceholder('Paste changed text here').fill(`right ${i}`)
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
  }
  await expect(tabs(page)).toHaveCount(count)
}

test('more than six comparisons can be open at once', async ({ page }) => {
  await addTabs(page, 9)
  await expect(tabs(page)).toHaveCount(9)
})

test('a few tabs neither scroll nor show chevrons', async ({ page }) => {
  await addTabs(page, 3)
  await expect(chevrons(page)).toHaveCount(0)
})

// The floor is the whole point: without it the labels grind down to a couple of
// characters and every tab reads the same.
test('tabs stop shrinking at a readable width instead of vanishing', async ({ page }) => {
  await addTabs(page, 12)
  const widths = await tabs(page).evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().width)
  )
  expect(Math.min(...widths)).toBeGreaterThan(90)
})

test('past the floor the strip scrolls, and the chevrons appear', async ({ page }) => {
  await addTabs(page, 12)
  await expect(chevrons(page)).toHaveCount(2)

  const overflows = await track(page).evaluate((el) => el.scrollWidth > el.clientWidth + 1)
  expect(overflows).toBe(true)
})

// A 10px scrollbar inside a 30px band would eat a third of the row and sit on
// the active tab's accent rule.
test('the scrolling track shows no scrollbar of its own', async ({ page }) => {
  await addTabs(page, 12)
  const gap = await track(page).evaluate((el) => el.offsetHeight - el.clientHeight)
  expect(gap).toBe(0)
})

test('the chevrons scroll the strip and disable themselves at each end', async ({ page }) => {
  await addTabs(page, 12)
  const left = page.getByRole('button', { name: 'Scroll tabs left' })
  const right = page.getByRole('button', { name: 'Scroll tabs right' })

  // The newest tab is the active one, so the strip already sits at its end.
  await expect(right).toBeDisabled()
  await expect(left).toBeEnabled()

  const start = await track(page).evaluate((el) => el.scrollLeft)
  await left.click()
  await expect.poll(() => track(page).evaluate((el) => el.scrollLeft)).toBeLessThan(start)
  await expect(right).toBeEnabled()

  // Back to the start: the chevron disables itself rather than being clickable
  // with nowhere left to go.
  while (await left.isEnabled()) await left.click()
  await expect(left).toBeDisabled()
  expect(await track(page).evaluate((el) => el.scrollLeft)).toBeLessThanOrEqual(1)
})

// Stepping to a tab must bring it into view, or the strip walks somewhere the
// reader cannot see. Opening the twelfth is exactly that case: it is created
// off the right edge.
test('the active tab is always scrolled into view', async ({ page }) => {
  await addTabs(page, 12)

  const inView = (sel) =>
    page.locator(sel).evaluate((el) => {
      const t = el.closest('.track').getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return r.left >= t.left - 1 && r.right <= t.right + 1
    })
  expect(await inView('.diff-tabs .tab.active')).toBe(true)

  // ...and again after scrolling away and picking a different tab.
  await page.getByRole('button', { name: 'Scroll tabs left' }).click()
  await page.getByRole('button', { name: 'Scroll tabs left' }).click()
  const visible = tabs(page)
    .filter({ has: page.getByRole('tab') })
    .first()
  await visible.getByRole('tab').click()
  expect(await inView('.diff-tabs .tab.active')).toBe(true)
})

test('the bar keeps one unbroken keyline under the whole strip', async ({ page }) => {
  await addTabs(page, 12)
  const same = await bar(page).evaluate((el) => {
    const s = getComputedStyle(el)
    return { w: s.borderBottomWidth, style: s.borderBottomStyle }
  })
  expect(same.style).toBe('solid')
  expect(parseFloat(same.w)).toBeGreaterThan(0)
})

// The floor makes a tab wider than its label, and the padding either side of
// the name belonged to the ROW rather than to the button — so clicking a tab
// anywhere but on its text did nothing at all.
test('clicking anywhere on a tab activates it', async ({ page }) => {
  await addTabs(page, 5)
  const activeIdx = () =>
    tabs(page).evaluateAll((els) => els.findIndex((e) => e.classList.contains('active')))

  // Click each tab on its far edge — the part that used to belong to the row
  // rather than to the button.
  for (const i of [0, 3, 1, 4]) {
    const box = await tabs(page).nth(i).boundingBox()
    await page.mouse.click(box.x + 6, box.y + box.height / 2)
    await expect.poll(activeIdx).toBe(i)
  }
})
