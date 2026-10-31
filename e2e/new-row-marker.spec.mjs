import { test, expect, openNewSnippet, showPanel, docActions } from './fixtures.mjs'

test.beforeEach(async ({ page }) => {
  await showPanel(page, 'snippets')
})

// A snippet you just made lands below every starred row, in a panel that is
// usually scrolled, and nothing marked it. The marker is four channels; three of
// them are measurable off the live DOM, so that is what this asserts — a
// bounding box, a computed colour, a box-shadow — never a screenshot.
//
// The rail goes on the RIGHT because the left edge already carries the pin bar.
// Starring a row you just made is the ordinary response to finding it, so the
// two states genuinely co-occur and must stack rather than fight.

const accentOf = (page) =>
  page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })

const rail = (row) =>
  row.evaluate((el) => {
    const s = getComputedStyle(el, '::after')
    return { width: s.width, background: s.backgroundColor, right: s.right }
  })

async function addSnippet(page, name) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('body text')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

const snippetRow = (page, name) =>
  page
    .locator('.sidebar-section')
    .filter({ hasText: 'Snippets' })
    .locator('.row')
    .filter({ hasText: name })

test('a newly created snippet marks itself with a soft rail and a quiet badge', async ({
  page
}) => {
  await addSnippet(page, 'E2E new row target')
  const row = snippetRow(page, 'E2E new row target')
  await expect(row).toHaveClass(/is-new/)

  const accent = await accentOf(page)

  const bar = await rail(row)
  expect(bar.width, 'the rail is a thin 2px').toBe('2px')
  expect(bar.right, 'the rail sits on the RIGHT edge — the left carries the pin bar').toBe('0px')
  expect(bar.background, 'the rail is faded, not full --accent').not.toBe(accent)

  // The badge: the word carries the identification, so hue cannot fail it.
  const badge = row.locator('.new-badge')
  await expect(badge).toBeVisible()
  const chip = await badge.evaluate((el) => {
    const s = getComputedStyle(el)
    return { border: s.borderTopColor, color: s.color, text: el.textContent.trim() }
  })
  expect(chip.text.length, 'the badge says it in words').toBeGreaterThan(0)
  expect(chip.border, 'the badge stays neutral').not.toBe(accent)
  expect(chip.color, 'never on the label — it fails 4.5:1 on five themes').not.toBe(accent)
  const peak = await row.evaluate((el) => {
    const wash = el
      .getAnimations({ subtree: true })
      .find((a) => a.effect.pseudoElement === '::before')
    wash.pause()
    wash.currentTime = 0
    return getComputedStyle(el, '::before').backgroundColor
  })
  expect(peak, 'the wash peaks at a soft 10%').toMatch(/\/ 0\.1\)$/)
})

// The wash is the part a reader sees from across the screen, and the first
// version eased out over 1.4s — gone before anyone looking elsewhere turned
// back. A floor rather than an exact value, so the timing can still be tuned.
test('the wash lingers long enough to be seen', async ({ page }) => {
  await addSnippet(page, 'E2E lingering wash')
  const row = snippetRow(page, 'E2E lingering wash')

  const wash = await row.evaluate((el) => {
    const s = getComputedStyle(el, '::before')
    return { duration: s.animationDuration, name: s.animationName }
  })
  expect(wash.name, 'the row draws a wash at all').toBe('new-wash')
  expect(parseFloat(wash.duration), 'the wash must outlast a glance away').toBeGreaterThanOrEqual(3)
})

test('a starred new row keeps its star AND the new rail', async ({ page }) => {
  await addSnippet(page, 'E2E starred new row')
  const row = snippetRow(page, 'E2E starred new row')
  await row.hover()
  await row.locator('.star').click()

  await expect(row, 'starring is not the row being opened, so the marker stays').toHaveClass(
    /is-new/
  )
  await page.mouse.move(0, 0)
  await expect(row.locator('.star.on'), 'the star survives the new-row marker').toBeVisible()
  expect((await rail(row)).width, 'and the rail survives the star').toBe('2px')
})

test('opening the row retires the marker', async ({ page }) => {
  await addSnippet(page, 'E2E retiring row')
  const row = snippetRow(page, 'E2E retiring row')
  await expect(row).toHaveClass(/is-new/)

  await row.locator('.entry').click()
  await page.getByRole('region', { name: 'Snippet', exact: true }).waitFor()
  await page.keyboard.press('Escape')

  await expect(row).not.toHaveClass(/is-new/)
  await expect(row.locator('.new-badge')).toHaveCount(0)
})

test('hovering a new row hides the NEW badge behind its actions entirely', async ({ page }) => {
  await addSnippet(page, 'E2E new row hover')
  const row = snippetRow(page, 'E2E new row hover')
  await row.hover()
  await expect(row.locator('.rowacts')).toBeVisible()
  await expect(row.locator('.new-badge')).toBeHidden()
})
