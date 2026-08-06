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
    await page.getByRole('button', { name: 'Paste mode' }).click()
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

// The floor is for a crowded strip. Held unconditionally, a lone tab was padded
// out to 20ch and read as a stray empty one.
test('a single tab is sized to its name, not to the floor', async ({ page }) => {
  await addTabs(page, 1)
  await expect(tabs(page)).toHaveCount(1)
  const only = await tabs(page)
    .first()
    .evaluate((el) => el.getBoundingClientRect().width)
  expect(only).toBeLessThan(126)

  // ...and the floor comes back the moment there is something to crowd it.
  await bar(page).getByRole('button', { name: 'New comparison' }).click()
  const widths = await tabs(page).evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().width)
  )
  expect(Math.min(...widths)).toBeGreaterThan(90)
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

// The chevrons carry the comparison, not just the view: panning the strip away
// from the tab you are on is what made scrolling feel disconnected from it.
test('the chevrons move the active comparison and bring it into view', async ({ page }) => {
  await addTabs(page, 12)
  const prev = page.getByRole('button', { name: 'Previous comparison' })
  const next = page.getByRole('button', { name: 'Next comparison' })
  const activeIdx = () =>
    tabs(page).evaluateAll((els) => els.findIndex((e) => e.classList.contains('active')))

  // The newest tab is active, so there is nowhere further right to go.
  expect(await activeIdx()).toBe(11)
  await expect(next).toBeDisabled()
  await expect(prev).toBeEnabled()

  await prev.click()
  await expect.poll(activeIdx).toBe(10)
  await expect(next).toBeEnabled()

  // Stepping far enough left leaves the tab off-screen unless it is revealed.
  for (let i = 0; i < 8; i++) await prev.click()
  await expect.poll(activeIdx).toBe(2)
  const shown = await page.locator('.diff-tabs .tab.active').evaluate((el) => {
    const t = el.closest('.track').getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return r.left >= t.left - 1 && r.right <= t.right + 1
  })
  expect(shown).toBe(true)

  // ...and it stops at the first tab rather than wrapping round.
  while (await prev.isEnabled()) await prev.click()
  await expect.poll(activeIdx).toBe(0)
  await expect(prev).toBeDisabled()
})

// A tab is created off the right edge once the strip is full, so opening one
// has to bring it into view or you land on a comparison you cannot see.
test('a newly opened tab is scrolled into view', async ({ page }) => {
  await addTabs(page, 12)
  const shown = await page.locator('.diff-tabs .tab.active').evaluate((el) => {
    const t = el.closest('.track').getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return r.left >= t.left - 1 && r.right <= t.right + 1
  })
  expect(shown).toBe(true)
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
