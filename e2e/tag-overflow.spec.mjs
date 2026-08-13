import { test, expect } from './fixtures.mjs'

// The sidebar is FOR diffs and snippets. An unbounded tag bar pushed them into
// a sliver as soon as a library grew past a few dozen tags, which is a priority
// inversion only a real layout can show.
async function saveWithTags(page, name, tags) {
  const left = page.getByPlaceholder('Paste original text here')
  if (!(await left.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Paste mode' }).click()
  }
  await left.fill(`before ${name}`)
  await page.getByPlaceholder('Paste changed text here').fill(`after ${name}`)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  for (const t of tags) {
    await dialog.getByPlaceholder('add a tag…').fill(t)
    await dialog.getByPlaceholder('add a tag…').press('Enter')
  }
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: name })).toBeVisible()
}

const TAGS = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliet'
]

test('a long tag list stays bounded and the rest go behind a picker', async ({ page }) => {
  await saveWithTags(page, 'E2E many tags', TAGS)

  // Bounded by the shelf's own height, whatever the library holds — the seeded
  // examples carry tags of their own, so the bar is bounded by the depth, not by
  // this test. Nothing is clipped: the count is measured against that height.
  const shown = await page.locator('.usb-tags .usb-tag').count()
  expect(shown).toBeLessThan(TAGS.length)
  const box = await page.locator('.usb-shelf').boundingBox()
  for (const chip of await page.locator('.usb-shelf > *').all()) {
    const at = await chip.boundingBox()
    expect(at.y + at.height).toBeLessThanOrEqual(box.y + box.height + 1)
  }

  const more = page.locator('.usb-more')
  await expect(more).toBeVisible()
  await expect(more).toContainText(/^\s*\+\d+ more\s*$/)

  // The picker holds exactly what the bar could not — the "+N more" chip's own
  // N — and is searchable. Feeding it the whole registry buried the N it
  // promised inside a wall of tags already on screen.
  const overflow = Number((await more.innerText()).match(/\+(\d+)/)[1])
  await more.click()
  const picker = page.getByRole('dialog', { name: 'Collapsed tags' })
  await expect(picker.locator('.usb-tag')).toHaveCount(overflow)
  // The bar and the picker partition the registry — no tag in both, none lost.
  expect(shown + overflow).toBeGreaterThanOrEqual(TAGS.length)
  await picker.getByLabel('Find a tag').fill('juli')
  await expect(picker.locator('.usb-tag')).toHaveCount(1)

  // Picking from it filters, and pins the choice into the visible bar.
  await picker.locator('.usb-tag').first().click()
  await page.locator('.picker-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(page.locator('.usb-tags .usb-tag.on', { hasText: 'juliet' })).toBeVisible()
})

// Deselecting six tags one at a time is not a reasonable ask.
test('the filter line counts the selection and clears it in one', async ({ page }) => {
  await saveWithTags(page, 'E2E clearable', TAGS)

  await expect(page.locator('.usb-filtering')).toHaveCount(0)
  for (const t of ['alpha', 'bravo', 'charlie']) {
    await page.locator('.usb-tags .usb-tag', { hasText: t }).first().click()
  }
  await expect(page.locator('.usb-tags .usb-tag.on')).toHaveCount(3)
  // The line says how many are on, so the reader isn't counting pills.
  await expect(page.locator('.usb-filtering')).toContainText('3 tags selected')

  await page.locator('.usb-clear').click()
  await expect(page.locator('.usb-tags .usb-tag.on')).toHaveCount(0)
  await expect(page.locator('.usb-filtering')).toHaveCount(0)
})
