import { test, expect } from './fixtures.mjs'

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
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('body text')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

const snippetRow = (page, name) =>
  page
    .locator('.sidebar-section')
    .filter({ hasText: 'Snippets' })
    .locator('.row')
    .filter({ hasText: name })

test('a newly created snippet marks itself with a rail and a NEW badge', async ({ page }) => {
  await addSnippet(page, 'E2E new row target')
  const row = snippetRow(page, 'E2E new row target')
  await expect(row).toHaveClass(/is-new/)

  const accent = await accentOf(page)

  const bar = await rail(row)
  expect(bar.width, 'the rail is 3px wide').toBe('3px')
  expect(bar.right, 'the rail sits on the RIGHT edge — the left carries the pin bar').toBe('0px')
  expect(bar.background, 'the rail is --accent, never a literal').toBe(accent)

  // The badge: the word carries the identification, so hue cannot fail it.
  const badge = row.locator('.new-badge')
  await expect(badge).toBeVisible()
  const chip = await badge.evaluate((el) => {
    const s = getComputedStyle(el)
    return { border: s.borderTopColor, color: s.color, text: el.textContent.trim() }
  })
  expect(chip.text.length, 'the badge says it in words').toBeGreaterThan(0)
  expect(chip.border, 'the accent goes on the keyline').toBe(accent)
  expect(chip.color, 'never on the label — it fails 4.5:1 on five themes').not.toBe(accent)
})

test('a starred new row keeps the pin bar AND the new rail', async ({ page }) => {
  await addSnippet(page, 'E2E starred new row')
  const row = snippetRow(page, 'E2E starred new row')
  await row.locator('.star').click()

  await expect(row).toHaveClass(/favorite/)
  await expect(row, 'starring is not the row being opened, so the marker stays').toHaveClass(
    /is-new/
  )

  // The pin bar is an inset box-shadow on the LEFT; the rail is a ::after on the
  // right. Two states, two edges, stacked rather than fighting.
  const shadow = await row.evaluate((el) => getComputedStyle(el).boxShadow)
  expect(shadow, 'the pin bar survives the new-row marker').toContain('inset')
  expect((await rail(row)).width, 'and the rail survives the star').toBe('3px')
})

test('opening the row retires the marker', async ({ page }) => {
  await addSnippet(page, 'E2E retiring row')
  const row = snippetRow(page, 'E2E retiring row')
  await expect(row).toHaveClass(/is-new/)

  await row.locator('.entry').click()
  await page.getByRole('dialog', { name: 'Snippet', exact: true }).waitFor()
  await page.keyboard.press('Escape')

  await expect(row).not.toHaveClass(/is-new/)
  await expect(row.locator('.new-badge')).toHaveCount(0)
})
