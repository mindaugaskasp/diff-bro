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

async function seedTags(page) {
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Tag farm')
  await editor.locator('.editor').click()
  await page.keyboard.type('seeded body')
  for (let i = 1; i <= TAG_COUNT; i++) {
    await editor.getByPlaceholder('add a tag…').fill(`tag-${String(i).padStart(2, '0')}`)
    await editor.getByPlaceholder('add a tag…').press('Enter')
  }
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function dragShelfDownOneRow(page) {
  const rowStep = (await page.locator('.usb-tag').first().boundingBox()).height + 4
  const box = await page.locator('.usb-shelf-grip').boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + rowStep, { steps: 6 })
  await page.mouse.up()
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

    // The handle IS the section's bottom edge: flush under the chips AND flush
    // with the strip's own boundary — floating anywhere between, it reads as
    // some other divider's handle.
    const tagsBox = await page.locator('.usb-tags').boundingBox()
    const gripBox = await page.locator('.usb-shelf-grip').boundingBox()
    const stripBox = await page.locator('.usb-controls').boundingBox()
    expect(gripBox.y - (tagsBox.y + tagsBox.height)).toBeLessThanOrEqual(1)
    expect(stripBox.y + stripBox.height - (gripBox.y + gripBox.height)).toBeLessThanOrEqual(1)

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
