import { test, expect, clickAppMenuItem, openViewMenu } from './fixtures.mjs'

// The View menu and the overflow menu. Both are launch-only: the fold is driven
// by real measurement, and the checkbox appearance faults these controls used to
// carry are computed styles jsdom does not have.

async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
}

test('the display options open, toggle, and close again', async ({ page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  const sideBySide = page.locator('.monaco-diff-editor.side-by-side')
  await expect(sideBySide).toHaveCount(1)

  await openViewMenu(page)
  await page.getByRole('checkbox', { name: 'Split view' }).uncheck()
  await expect(sideBySide).toHaveCount(0) // now inline

  // Escape closes it, and does not also close something behind it.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: 'View' })).toBeHidden()
})

test('a press outside closes the panel', async ({ page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  await openViewMenu(page)
  await page.mouse.click(400, 400)
  await expect(page.getByRole('group', { name: 'View' })).toBeHidden()
})

// Inline, an unavailable toggle had nowhere to say why but a tooltip. The panel
// has room for the sentence, so it must actually carry it.
test('an unavailable option is disabled and says why', async ({ page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc') // plain text: no structured view
  await openViewMenu(page)

  const structure = page.getByRole('checkbox', { name: 'Structure' })
  await expect(structure).toBeDisabled()
  await expect(page.locator('.popover-row', { hasText: 'Structure' })).toContainText(
    'no structured view'
  )
})

// The chip counts what the reader has CHANGED. Split view and diagram focus both
// default to on, so a count of "options that are on" would sit at 2 on an
// untouched comparison and mean nothing.
test('the count chip tracks changed options, not enabled ones', async ({ page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  const chip = page.locator('.count')
  await expect(chip).toBeHidden() // nothing changed yet, though Split view is on

  await openViewMenu(page)
  await page.getByRole('checkbox', { name: 'Ignore whitespace' }).check()
  await expect(chip).toHaveText('1')

  await page.getByRole('checkbox', { name: 'Split view' }).uncheck()
  await expect(chip).toHaveText('2')
})

// Both faults were invisible to every existing test: nothing set color-scheme, so
// a stock checkbox painted a light-mode box on all seven dark themes, and nothing
// set accent-color, so a ticked one wore the OPERATING SYSTEM's accent instead of
// the theme's. Asserted as computed styles, not as a screenshot.
test('the option controls follow the theme, not the OS', async ({ page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  await page.evaluate(() => (document.documentElement.dataset.theme = 'matrix'))
  await openViewMenu(page)

  const box = page.getByRole('checkbox', { name: 'Split view' })
  expect(await box.evaluate((el) => getComputedStyle(el).colorScheme)).toBe('dark')

  const accent = await box.evaluate((el) => {
    const own = getComputedStyle(el).accentColor
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    document.body.append(probe)
    const themeAccent = getComputedStyle(probe).color
    probe.remove()
    return { own, themeAccent }
  })
  expect(accent.own).toBe(accent.themeAccent)
})

// The action row is rendered by ToolbarOverflow, whose template has TWO roots
// (the row and its Teleport). Vue cannot forward a parent's scope id onto a
// fragment, so AppToolbar's scoped `.group` rules silently stopped applying to
// it and the buttons lost their flex row: display fell back to block, and every
// gap to 0. Layout, so it is measured — not screenshotted.
test('the document actions keep the toolbar cluster gap between them', async ({ page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')

  const row = await page.locator('.group.actions').evaluate((el) => {
    const rects = [...el.children].map((k) => k.getBoundingClientRect())
    return {
      display: getComputedStyle(el).display,
      gaps: rects.slice(1).map((r, i) => Math.round(r.x - (rects[i].x + rects[i].width))),
      heights: rects.map((r) => Math.round(r.height))
    }
  })

  expect(row.display).toBe('flex')
  expect(row.gaps.length).toBeGreaterThan(2)
  expect(row.gaps).toEqual(row.gaps.map(() => 6))
  expect(new Set(row.heights).size).toBe(1) // one band row, equal-height boxes
})

// The backdrop is `position: fixed; inset: 0` at z-index 20, and the anchor had
// no z-index of its own — so only the PANEL (21) cleared it and the trigger
// underneath was covered. Hover and the pointer cursor went to the backdrop, and
// a control plainly still on screen stopped reading as pressable the moment it
// was pressed. Asserted as the element actually under the cursor, not as a style.
test('the View trigger stays pressable while its panel is open', async ({ page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  const trigger = page.locator('.toolbar .anchor > .btn').first()
  await openViewMenu(page)

  const box = await trigger.boundingBox()
  const onTop = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return { backdrop: !!el.closest('.popover-backdrop'), cursor: getComputedStyle(el).cursor }
    },
    [box.x + box.width / 2, box.y + box.height / 2]
  )
  expect(onTop.backdrop).toBe(false)
  expect(onTop.cursor).toBe('pointer')

  // And it still closes on its own press rather than the backdrop swallowing it.
  await trigger.click()
  await expect(page.getByRole('group', { name: 'View' })).toBeHidden()
})

// The ladder, all three rungs in one pass. A control loses its WORD before it
// loses its PLACE — a bar that folded straight from labelled to a menu would
// hide something the reader could still have reached with a glyph.
test('the bar sheds words before it sheds controls', async ({ app, page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  const actions = page.locator('.group.actions [data-action]')
  const more = page.getByRole('button', { name: /More actions|Ṁōřé àçţĩōńş/u })
  const wordy = () => actions.first().evaluate((el) => el.textContent.trim().length > 0)

  // Rung 1 — room for the words.
  const all = await actions.count()
  expect(all).toBeGreaterThan(3)
  expect(await wordy()).toBe(true)
  await expect(more).toBeHidden()

  // Rung 2 — no room for the words, room for every control. The narrowest the
  // app goes at 100% zoom, in the longest locale.
  const win = await app.browserWindow(page)
  const [w, h] = await win.evaluate((b) => b.getMinimumSize())
  await win.evaluate((b, size) => b.setBounds({ width: size[0], height: size[1] }), [w, h])
  const grip = page.locator('.usb-grip')
  const box = await grip.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 200, { steps: 8 })
  await page.mouse.up()
  await clickAppMenuItem(app, 'Settings')
  await page.getByRole('combobox', { name: /Language|Łàńğūàğé/u }).selectOption('en-XA')
  await page.keyboard.press('Escape')

  await expect.poll(wordy).toBe(false)
  await expect(actions).toHaveCount(all) // nothing folded yet
  await expect(more).toBeHidden()

  // Rung 3 — not even the glyphs fit.
  await win.evaluate((b) => b.webContents.setZoomLevel(2.5))
  await expect(more).toBeVisible()
  expect(await actions.count()).toBeLessThan(all)
})

// The overflow menu earns its place only if it can actually fire. The widest
// reachable layout does it: minimum window, sidebar at its cap, longest locale,
// maximum zoom. Nothing folds short of that — which is the other half of the
// contract, asserted first.
test('the overflow menu appears only when the row runs out of room', async ({ app, page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  // Named in both locales: the fold only fires after the switch to en-XA, where
  // the accessible name is pseudolocalized too.
  const more = page.getByRole('button', { name: /More actions|Ṁōřé àçţĩōńş/u })
  await expect(more).toBeHidden()
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible()

  const win = await app.browserWindow(page)
  const [w, h] = await win.evaluate((b) => b.getMinimumSize())
  await win.evaluate((b, size) => b.setBounds({ width: size[0], height: size[1] }), [w, h])
  // Still inline at the minimum: the View menu alone bought enough room.
  await expect(more).toBeHidden()

  // Drag the sidebar to its cap: `.key-actions` is `width: var(--sidebar-w)`, so
  // this is the one term in the bar's width the reader moves.
  const grip = page.locator('.usb-grip')
  const box = await grip.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 200, { steps: 8 })
  await page.mouse.up()

  await clickAppMenuItem(app, 'Settings')
  await page.getByRole('combobox', { name: /Language|Łàńğūàğé/u }).selectOption('en-XA')
  await page.keyboard.press('Escape')
  await win.evaluate((b) => b.webContents.setZoomLevel(2.5))

  await expect(more).toBeVisible()
  // And what folded is reachable, not lost.
  await more.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem').first()).toBeVisible()
})

// The overflow anchor is `v-if="hidden.length"` and its backdrop is teleported
// to body under `v-if="open"`. Widening the window while the menu is open
// unfolds everything and unmounts the anchor — taking the panel AND the Escape
// handler with it, while `open` stayed true and left a full-window backdrop in
// the document. It ate the next click anywhere in the app, and narrowing again
// re-opened the menu nobody had pressed.
test('unfolding the row while its menu is open takes the backdrop with it', async ({
  app,
  page
}) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  const more = page.getByRole('button', { name: /More actions|Ṁōřé àçţĩōńş/u })
  const win = await app.browserWindow(page)
  const [w, h] = await win.evaluate((b) => b.getMinimumSize())
  await win.evaluate((b, size) => b.setBounds({ width: size[0], height: size[1] }), [w, h])

  const grip = page.locator('.usb-grip')
  const box = await grip.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 200, { steps: 8 })
  await page.mouse.up()
  await clickAppMenuItem(app, 'Settings')
  await page.getByRole('combobox', { name: /Language|Łàńğūàğé/u }).selectOption('en-XA')
  await page.keyboard.press('Escape')
  await win.evaluate((b) => b.webContents.setZoomLevel(2.5))

  await expect(more).toBeVisible()
  await more.click()
  await expect(page.getByRole('menu')).toBeVisible()

  // Give the row its room back: everything unfolds and the trigger goes.
  await win.evaluate((b) => b.webContents.setZoomLevel(0))
  await expect(more).toBeHidden()

  // The backdrop must have gone with it, or the next click lands on nothing.
  await expect(page.locator('.popover-backdrop')).toHaveCount(0)
})
