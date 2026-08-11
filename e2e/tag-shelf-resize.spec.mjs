import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  newSnippetButton
} from './fixtures.mjs'

// The tag shelf's depth has exactly one affordance — the grip — so the drag is
// proven against real layout (quantised on the measured chip row) and its
// persistence is proven the only way it can be: a relaunch of the same profile.
// Only a launched app renders either.

// The first-run examples already seed four tags (example, mermaid, claude,
// prompt); ten more guarantee the shelf overflows at every depth this test
// visits, so the +N chip stays observable on both sides of the drag.
const TAG_COUNT = 10
const RESTING_CHIPS = 8 // MIN_TAG_ROWS (2) × TAGS_PER_ROW (4)
const DRAGGED_CHIPS = 12 // one row deeper
const OLD_CEILING_CHIPS = 48 // what twelve rows used to be worth
// var(--space-3) under the last chip row, matching the air over the shelf's
// separator: the strip's border used to sit 5px under the chips at every depth.
const BOTTOM_GAP = 10
// Whatever the shelf is dragged to, the sections keep this much of the column.
const LIST_FLOOR = 150
// MAX_TAGS is 20 per snippet, so a deep shelf takes several.
const PER_SNIPPET = 18

async function seedSnippet(page, name, tags) {
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('seeded body')
  for (const tag of tags) {
    await editor.getByPlaceholder('add a tag…').fill(tag)
    await editor.getByPlaceholder('add a tag…').press('Enter')
  }
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function seedTags(page, count = TAG_COUNT) {
  const names = Array.from({ length: count }, (_, i) => `tag-${String(i + 1).padStart(2, '0')}`)
  for (let at = 0; at < names.length; at += PER_SNIPPET) {
    await seedSnippet(page, `Tag farm ${at}`, names.slice(at, at + PER_SNIPPET))
  }
}

async function dragShelf(page, toY) {
  const box = await page.locator('.usb-shelf-grip').boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, toY(y), { steps: 6 })
  await page.mouse.up()
}

async function dragShelfDownOneRow(page) {
  const rowStep = (await page.locator('.usb-tag').first().boundingBox()).height + 4
  await dragShelf(page, (y) => y + rowStep)
}

// The air between the last chip row and the strip's border, which is the same
// number at every depth.
async function bottomGap(page) {
  const tags = await page.locator('.usb-tags').boundingBox()
  const strip = await page.locator('.usb-controls').boundingBox()
  return strip.y + strip.height - (tags.y + tags.height)
}

// The divider under the shelf is the ONE thing that looks draggable, so it has
// to be the thing that is: both the paint and the hit area straddle it. Adrift
// in the air above, the handle lights up somewhere the pointer is not and the
// seam itself grabs nothing.
async function expectHandleOnTheSeam(page) {
  const strip = await page.locator('.usb-controls').boundingBox()
  const grip = await page.locator('.usb-shelf-grip').boundingBox()
  const seam = strip.y + strip.height
  expect(Math.abs(grip.y + grip.height / 2 - seam)).toBeLessThanOrEqual(1)
  const onSeam = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.className ?? '',
    [strip.x + strip.width / 2, seam - 0.5]
  )
  expect(onSeam).toContain('usb-shelf-grip')
}

test('the shelf grip deepens the tag rows, and the depth survives a relaunch', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await seedTags(page)

    const chips = page.locator('.usb-tag')
    await expect(chips).toHaveCount(RESTING_CHIPS)
    await expect(page.locator('.usb-more')).toBeVisible()

    await expectHandleOnTheSeam(page)
    const restingGap = await bottomGap(page)
    expect(restingGap).toBeGreaterThanOrEqual(BOTTOM_GAP)

    // "+6 more" opens the SIX that did not fit — not the whole registry with
    // the promised six lost inside it.
    await page.locator('.usb-more').click()
    const picker = page.locator('.picker')
    await expect(picker).toBeVisible()
    await expect(picker.locator('.tag-chip')).toHaveCount(6)
    await expect(picker.locator('.tag-chip', { hasText: 'tag-05' })).toBeVisible()
    await expect(picker.locator('.tag-chip', { hasText: 'example' })).toHaveCount(0)
    await page.locator('.picker-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(picker).toHaveCount(0)

    await dragShelfDownOneRow(page)

    // One row deeper: four more chips show and the overflow count falls in step.
    await expect(chips).toHaveCount(DRAGGED_CHIPS)
    await expect(page.locator('.usb-more')).toContainText('+2')
    // And the air under the shelf is the air it had before the drag.
    expect(await bottomGap(page)).toBeCloseTo(restingGap, 0)
  } finally {
    await app.close()
  }

  // Same profile, fresh process: the dragged depth is the resting depth now.
  app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.usb-tag')).toHaveCount(DRAGGED_CHIPS)
  } finally {
    await app.close()
  }
})

// Dragged to the floor of the window: the shelf goes far deeper than the dozen
// rows it used to stop at, and the sections it shares the column with keep a
// usable slice of it — squeezed out, they take the grip off the bottom edge with
// them and there is no way left to make the shelf small again.
test('the shelf deepens past the old ceiling without swallowing the sidebar', async ({ page }) => {
  test.setTimeout(120_000)
  await seedTags(page, 108)
  await expect(page.locator('.usb-tag')).toHaveCount(RESTING_CHIPS)

  const floor = await page.evaluate(() => window.innerHeight - 4)
  await dragShelf(page, () => floor)

  expect(await page.locator('.usb-tag').count()).toBeGreaterThan(OLD_CEILING_CHIPS)

  const aside = await page.locator('.saved').boundingBox()
  const list = await page.locator('.usb-scroll').boundingBox()
  const grip = await page.locator('.usb-shelf-grip').boundingBox()
  expect(list.height).toBeGreaterThanOrEqual(LIST_FLOOR)
  expect(grip.y + grip.height).toBeLessThanOrEqual(aside.y + aside.height)
  expect(await bottomGap(page)).toBeGreaterThanOrEqual(BOTTOM_GAP)
  await expectHandleOnTheSeam(page)
})
