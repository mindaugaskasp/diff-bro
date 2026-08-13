import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  newSnippetButton
} from './fixtures.mjs'

// The shelf's depth is a HEIGHT the grip drags, and what it shows at that height
// is measured — a chip is as wide as its name, so the four-per-row it used to
// assume made one row of pointer travel worth anything between half a rendered
// row and two. Only a launched app has widths to measure, so all of it is
// proven here: the seam tracking the pointer, the "+N more" count matching what
// was actually cut, and the depth surviving a relaunch.

// The first-run examples seed four tags (example, mermaid, claude, prompt);
// these guarantee the shelf overflows at every depth this test visits.
const TAG_COUNT = 36
// Whatever the shelf is dragged to, the sections keep this much of the column.
const LIST_FLOOR = 150
// var(--space-3) under the last chip row, matching the air over the shelf's
// separator: the strip's border used to sit 5px under the chips at every depth.
const BOTTOM_GAP = 10
// MAX_TAGS is 20 per snippet, so a deep shelf takes several.
const PER_SNIPPET = 18
const GAP = 4

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

const shelfHeight = async (page) => (await page.locator('.usb-shelf').boundingBox()).height
const rowStep = async (page) => (await page.locator('.usb-tag').first().boundingBox()).height + GAP

async function dragShelf(page, toY) {
  const box = await page.locator('.usb-shelf-grip').boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, toY(y), { steps: 6 })
  await page.mouse.up()
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

// Every chip the shelf shows is WHOLLY inside it: the count is measured, so a
// chip clipped at the bottom edge means the measurement is wrong.
async function expectNothingClipped(page) {
  const box = await page.locator('.usb-shelf').boundingBox()
  const chips = await page.locator('.usb-shelf > *').all()
  for (const chip of chips) {
    const at = await chip.boundingBox()
    expect(at.y + at.height).toBeLessThanOrEqual(box.y + box.height + 1)
  }
}

// "+N more" opens the N that did not fit — not the whole registry with the N
// promised lost inside it.
async function expectOverflowExact(page) {
  const shown = await page.locator('.usb-tag').count()
  const label = await page.locator('.usb-more').textContent()
  const promised = Number(label.match(/\d+/)[0])

  await page.locator('.usb-more').click()
  const picker = page.locator('.picker')
  await expect(picker.locator('.tag-chip')).toHaveCount(promised)
  await page.locator('.picker-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(picker).toHaveCount(0)
  return shown + promised
}

test('the grip moves the shelf with the pointer, and the depth survives a relaunch', async () => {
  test.setTimeout(120_000)
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  let dragged
  try {
    const page = await firstReadyPage(app)
    await seedTags(page)

    await expectHandleOnTheSeam(page)
    await expectNothingClipped(page)
    const total = await expectOverflowExact(page)
    const restingGap = await bottomGap(page)
    expect(restingGap).toBeGreaterThanOrEqual(BOTTOM_GAP)

    const step = await rowStep(page)
    const before = await shelfHeight(page)
    const shownBefore = await page.locator('.usb-tag').count()

    // Three rows of travel is three rows of shelf — within the rounding that
    // lands it on a whole row, not the half-to-double it used to be.
    await dragShelf(page, (y) => y + 3 * step)
    const after = await shelfHeight(page)
    expect(after - before).toBeGreaterThan(3 * step - GAP)
    expect(after - before).toBeLessThan(3 * step + GAP)

    expect(await page.locator('.usb-tag').count()).toBeGreaterThan(shownBefore)
    await expectNothingClipped(page)
    expect(await expectOverflowExact(page)).toBe(total)
    expect(await bottomGap(page)).toBeCloseTo(restingGap, 0)

    dragged = await page.locator('.usb-tag').count()
  } finally {
    await app.close()
  }

  // Same profile, fresh process: the dragged depth is the resting depth now.
  app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.usb-tag')).toHaveCount(dragged)
  } finally {
    await app.close()
  }
})

// Dragged to the floor of the window: the shelf goes as deep as the column
// allows, and the sections it shares that column with keep a usable slice —
// squeezed out, they take the grip off the bottom edge with them and there is no
// way left to make the shelf small again.
test('the shelf deepens to the floor without swallowing the sidebar', async ({ page }) => {
  test.setTimeout(120_000)
  await seedTags(page, 108)
  const resting = await page.locator('.usb-tag').count()

  const floor = await page.evaluate(() => window.innerHeight - 4)
  await dragShelf(page, () => floor)

  expect(await page.locator('.usb-tag').count()).toBeGreaterThan(resting * 3)

  const aside = await page.locator('.saved').boundingBox()
  const list = await page.locator('.usb-scroll').boundingBox()
  const grip = await page.locator('.usb-shelf-grip').boundingBox()
  expect(list.height).toBeGreaterThanOrEqual(LIST_FLOOR)
  expect(grip.y + grip.height).toBeLessThanOrEqual(aside.y + aside.height)
  expect(await bottomGap(page)).toBeGreaterThanOrEqual(BOTTOM_GAP)
  await expectHandleOnTheSeam(page)
})

// A drag was the only way to ask, and the seam carried no keyboard at all.
test('double-click opens the shelf to every tag, and rests it again', async ({ page }) => {
  test.setTimeout(120_000)
  await seedTags(page, 24)
  const resting = await shelfHeight(page)
  await expect(page.locator('.usb-more')).toBeVisible()

  await page.locator('.usb-shelf-grip').dblclick()
  await expect(page.locator('.usb-more')).toHaveCount(0)
  expect(await shelfHeight(page)).toBeGreaterThan(resting)
  await expectNothingClipped(page)

  await page.locator('.usb-shelf-grip').dblclick()
  await expect(page.locator('.usb-more')).toBeVisible()
  expect(await shelfHeight(page)).toBeCloseTo(resting, 0)
})

// LONG names, deliberately: wide chips do not fill the rows the stored height
// pays for, so the box hugs its chips and renders shorter than the setting. With
// the keys anchored on what was rendered, ↓ wrote a shallower depth and moved
// nothing, and the ↑ after it fell two rows. Short `tag-NN` names fill their
// rows, which is why the first version of this test never saw it.
test('the arrow keys step a row at a time even when the chips do not fill it', async ({ page }) => {
  test.setTimeout(120_000)
  const names = Array.from({ length: 30 }, (_, i) => `platform-migration-phase-${i + 10}`)
  for (let at = 0; at < names.length; at += PER_SNIPPET) {
    await seedSnippet(page, `Wide farm ${at}`, names.slice(at, at + PER_SNIPPET))
  }

  const depth = async () =>
    Number(
      (await page.evaluate(() => document.querySelector('.usb-shelf').style.maxHeight)).replace(
        'px',
        ''
      )
    )
  const step = await rowStep(page)

  // The first press snaps the resting default onto the measured row grid, so it
  // is the presses AFTER that which must each be worth exactly one row.
  await page.locator('.usb-shelf-grip').focus()
  await page.keyboard.press('ArrowDown')
  const onGrid = await depth()

  await page.keyboard.press('ArrowDown')
  const deeper = await depth()
  expect(deeper - onGrid).toBeGreaterThan(step - 1)
  expect(deeper - onGrid).toBeLessThan(step + 1)

  // And back to exactly where it was — the ↑ that used to fall two rows.
  await page.keyboard.press('ArrowUp')
  expect(await depth()).toBe(onGrid)
})

test('the arrow keys deepen the shelf a row at a time', async ({ page }) => {
  test.setTimeout(120_000)
  await seedTags(page, 24)
  const step = await rowStep(page)
  const before = await shelfHeight(page)

  await page.locator('.usb-shelf-grip').focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => shelfHeight(page)).toBeGreaterThan(before + step - GAP - 1)
  expect(await shelfHeight(page)).toBeLessThan(before + step + GAP)

  await page.keyboard.press('ArrowUp')
  await expect.poll(() => shelfHeight(page)).toBeCloseTo(before, 0)
})
