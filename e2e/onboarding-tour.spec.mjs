// The tour only exists on a cold profile, so this is the one place its real
// behaviour can be checked: a fresh launch, a relaunch of the SAME profile, and
// an overlay that measures live DOM. jsdom can prove the schedule; only this can
// prove the ring lands on the control the step names.
import {
  test,
  expect,
  clickAppMenuItem,
  firstReadyPage,
  launchApp,
  freshUserDataDir
} from './fixtures.mjs'
import { rmSync } from 'node:fs'

// The only spec that wants the tour: every other profile in the suite has tips
// off, or the veil would take the first click of each of them.
test.use({ tips: true })

const callout = (page) => page.locator('.tour-callout')
const ring = (page) => page.locator('.tour-ring')
// The primary carries the step's OWN label ("Open Settings", "Load a demo
// pair"), so it is located structurally rather than by text.
const next = (page) => callout(page).locator('.btn-primary')
const back = (page) => callout(page).getByRole('button', { name: 'Back' })
const advance = async (page, times = 1) => {
  for (let i = 0; i < times; i++) await next(page).click()
}
const stepCount = async (page) =>
  Number((await callout(page).locator('.tour-step-n').textContent()).split(' ').pop())
// Walks to the end of whatever run is open FROM WHEREVER IT IS, so a step added
// to one does not have to be counted into every spec by hand.
const finishRun = async (page) =>
  advance(page, (await stepCount(page)) - (await stepNumber(page)) + 1)
// Reaching a step by ID rather than by index, for the same reason.
const stepNumber = async (page) =>
  Number((await callout(page).locator('.tour-step-n').textContent()).split(' ')[1])

test('a cold launch opens run one on the file slots', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  await expect(callout(page).locator('.tour-step-n')).toHaveText(/^Step 1 of \d+$/)

  // The ring must actually cover what the step points at — the failure this
  // guards is a tour that keeps pointing after the layout moves under it.
  const ringBox = await ring(page).boundingBox()
  const slots = await page.locator('[data-tour="slots"]').boundingBox()
  expect(Math.abs(ringBox.x - slots.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(ringBox.width - slots.width)).toBeLessThanOrEqual(2)
})

// Nothing happens until the user asks for it. The demo pair arrives because
// Next said it would, not because arriving at a step opened something.
test('the demo pair loads on Next, and is shown before the tour moves on', async ({ page }) => {
  await expect(page.locator('[data-tour="slots"]')).not.toContainText('demo-config-v1.json')
  await expect(next(page)).toHaveText('Load a demo pair')
  await next(page).click()

  // The veil is down for the reveal beat: the comparison it just loaded is on
  // screen, unblurred, before the next step covers it again.
  await expect(page.locator('[data-tour="slots"]')).toContainText('demo-config-v1.json')
  await expect(page.locator('[data-tour="slots"]')).toContainText('demo-config-v2.json')
  await expect(callout(page)).toBeHidden()
  await expect(callout(page)).toBeVisible()
  await expect(callout(page).locator('.tour-step-n')).toHaveText(/^Step 2 of \d+$/)
})

// Asserted by hit-testing rather than by clicking: a click that passes through
// the veil usually lands on something inert, so the tour survives and the test
// says "fine". elementFromPoint names what would ACTUALLY receive the pointer.
test('the veil takes the pointer everywhere the step does not want it', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  // What would ACTUALLY receive the pointer, named rather than read off
  // className — an icon's className is an SVGAnimatedString, not a string.
  const at = (selector, dx, dy) =>
    page.evaluate(
      ([s, x, y]) => {
        const r = document.querySelector(s).getBoundingClientRect()
        const el = document.elementFromPoint(r.left + x, r.top + y)
        if (el?.closest('.tour-block')) return 'blocked'
        return el?.closest('.tour-tint') ? 'veiled' : 'live'
      },
      [selector, dx, dy]
    )

  // Outside: the tint is in front, so the app underneath cannot be clicked away.
  expect(await at('[data-tour="slots"]', 30, 300)).toBe('veiled')
  // Inside an INERT hole the target is visible but not reachable: a click here
  // would open a file dialog over the tour that is pointing at it.
  expect(await at('[data-tour="slots"]', 120, 4)).toBe('blocked')

  // A live step leaves its control alone: the editor step invites you to press
  // the Save it rings, so that one hole really is open.
  await finishRun(page)
  await page.getByRole('button', { name: 'Show me' }).click()
  await advance(page)
  expect(await at('[data-tour="snippet-save"]', 6, 6)).toBe('live')

  // The drop-zone step's hole is the whole pane, file slots and all — a click
  // there would open a picker over a step about dragging.
  await advance(page)
  expect(await at('[data-tour="slots"]', 120, 4)).toBe('blocked')
})

// The library step drives the search itself. The hole stays cut so the list is
// seen narrowing, but the pointer stops at the veil: a click landing in a box
// the tour is already typing into would fight it.
test('the library step types into the search and blocks the pointer', async ({ page }) => {
  await advance(page, 2)
  await expect(callout(page).locator('.tour-step-n')).toHaveText(/^Step 3 of \d+$/)
  await expect(page.locator('[data-tour="search"] input')).toHaveValue('mermaid')

  // The hole is the whole sidebar so the list is seen filtering, but the ring
  // is on the box being typed into — pointing at the sidebar's middle said
  // nothing about where the letters were landing.
  const ringBox = await ring(page).boundingBox()
  const search = await page.locator('[data-tour="search"]').boundingBox()
  expect(Math.abs(ringBox.x - search.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(ringBox.width - search.width)).toBeLessThanOrEqual(2)

  // And the beak sits ON the box, not at the card's midpoint: the card is far
  // taller than a search field, so a fixed 50% pointed well below it.
  const beak = await page.locator('.tour-beak').boundingBox()
  const beakMid = beak.y + beak.height / 2
  expect(beakMid).toBeGreaterThanOrEqual(search.y - 2)
  expect(beakMid).toBeLessThanOrEqual(search.y + search.height + 2)

  const inHole = await page.evaluate(() => {
    const box = document.querySelector('[data-tour="sidebar"]').getBoundingClientRect()
    return document.elementFromPoint(box.left + 40, box.top + 40)?.className ?? ''
  })
  expect(inHole).toContain('tour-block')

  // And the search goes when the step does — in EITHER direction, rather than
  // leaving the sidebar filtered by a word the user never typed.
  await back(page).click()
  await expect(page.locator('[data-tour="search"] input')).toHaveValue('')
  await next(page).click()
  await expect(page.locator('[data-tour="search"] input')).toHaveValue('mermaid')
  await advance(page)
  await expect(page.locator('[data-tour="search"] input')).toHaveValue('')
})

test('Escape ends it, and it stays gone across a relaunch', async () => {
  const dir = freshUserDataDir({ tips: true })
  try {
    const first = await launchApp(dir)
    const page = await firstReadyPage(first)
    await expect(callout(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(callout(page)).toBeHidden()
    await first.close()

    const second = await launchApp(dir)
    const back = await firstReadyPage(second)
    await back.waitForTimeout(400)
    await expect(back.locator('.tour-callout')).toBeHidden()
    await second.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('finishing run one asks about run two, and Not now closes it', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  await finishRun(page)
  const prompt = page.getByRole('dialog', { name: 'Three more tips?' })
  await expect(prompt).toBeVisible()
  // Run one walks THROUGH Settings, and a prompt stacked on top of an open
  // dialog is what a tour that does not put its props away looks like.
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
  await prompt.getByRole('button', { name: 'Not now' }).click()
  await expect(prompt).toBeHidden()
  await expect(callout(page)).toBeHidden()
})

test('Show me runs the rest straight away rather than waiting for a relaunch', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  await finishRun(page)
  await page.getByRole('button', { name: 'Show me' }).click()
  await expect(callout(page)).toBeVisible()
  await expect(callout(page).locator('.tour-step-n')).toHaveText(/^Step 1 of \d+$/)
})

test('Skip tips ends it, and Help ▸ Show Tour brings it back', async ({ app, page }) => {
  await expect(callout(page)).toBeVisible()
  await callout(page).getByRole('button', { name: 'Skip tips' }).click()
  await expect(callout(page)).toBeHidden()

  // Asking for it once is not consent to automatic tips, so the replay runs
  // while the setting stays off.
  await clickAppMenuItem(app, 'Show Tour')
  await expect(callout(page)).toBeVisible()
  // A replay plays every step of both runs as one run.
  expect(await stepCount(page)).toBeGreaterThan(6)
  await expect(callout(page).locator('.tour-step-n')).toHaveText(/^Step 1 of \d+$/)
})

// The wedge: a step whose control is not on screen used to render NOTHING while
// the tour stayed active — no card, no Next, no Skip. A collapsed sidebar is the
// everyday way in, and the tour must walk right through it.
test('every step still shows a card with the sidebar collapsed', async ({ app, page }) => {
  await expect(callout(page)).toBeVisible()
  await callout(page).getByRole('button', { name: 'Skip tips' }).click()
  await page.getByRole('button', { name: 'Collapse the sidebar' }).click()

  await clickAppMenuItem(app, 'Show Tour')
  const total = await stepCount(page)
  for (let i = 0; i < total; i++) {
    await expect(callout(page).locator('.tour-step-n')).toHaveText(`Step ${i + 1} of ${total}`)
    await next(page).click()
  }
  await expect(callout(page)).toBeHidden()
})

// Revisiting a step must also put back what the step before it opened, or the
// card returns to a control that is now behind a dialog.
test('Back returns a step, and closes what that step had opened', async ({ page }) => {
  await expect(back(page)).toHaveCount(0)
  await page.locator('.tour-callout').waitFor()
  while (!(await page.getByRole('dialog', { name: 'Settings' }).isVisible())) {
    await next(page).click()
  }
  const inside = await stepNumber(page)

  await back(page).click()
  expect(await stepNumber(page)).toBe(inside - 1)
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()

  // And forward again from there, rather than the tour losing its place.
  await next(page).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  expect(await stepNumber(page)).toBe(inside)
})

// A step whose target sits INSIDE a dialog must keep its callout inside that
// dialog too. Placed beside, it straddled the dialog's edge and spilled onto
// the blurred app behind, reading as unrelated to the row it points at.
test('a callout pointing into a dialog stays within it', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  await expect(next(page)).toHaveText('Load a demo pair')
  while (!(await page.getByRole('dialog', { name: 'Settings' }).isVisible())) {
    await next(page).click()
  }
  const fits = await page.evaluate(() => {
    const rect = (s) => document.querySelector(s).getBoundingClientRect()
    const c = rect('.tour-callout')
    const d = rect('.dialog')
    return c.left >= d.left - 1 && c.right <= d.right + 1
  })
  expect(fits).toBe(true)
})

// Run two's editor step: Save must be a control that can actually fire. The
// draft opened blank, so its Save was disabled the whole time it was ringed.
test('the snippet step opens a draft whose Save is live', async ({ page }) => {
  await finishRun(page)
  await page.getByRole('button', { name: 'Show me' }).click()
  await expect(next(page)).toHaveText('Open the editor')
  await next(page).click()

  await expect(page.locator('[data-tour="snippet-save"]')).toBeVisible()
  await expect(page.locator('[data-tour="snippet-save"]')).toBeEnabled()
})

// A full library makes the Snippets section taller than the window, so a ring on
// the section itself put the callout nowhere near anything the step names — and
// a tag filter of the user's hid the row entirely, leaving the card talking
// about a snippet that was not on screen.
test('the last step rings the Mermaid snippet, even behind a tag filter', async ({ app, page }) => {
  await callout(page).getByRole('button', { name: 'Skip tips' }).click()
  await page.locator('.usb-tag', { hasText: 'prompt' }).click()
  await expect(page.locator('[data-tour="snippet-diagram"]')).toHaveCount(0)

  await clickAppMenuItem(app, 'Show Tour')
  await advance(page, (await stepCount(page)) - 2)
  await expect(callout(page).locator('h6')).toHaveText('A Mermaid snippet draws itself')

  const ringBox = await ring(page).boundingBox()
  const row = await page.locator('[data-tour="snippet-diagram"]').first().boundingBox()
  expect(Math.abs(ringBox.y - row.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(ringBox.height - row.height)).toBeLessThanOrEqual(2)

  // And the filter it cleared to get there is the user's, so it comes back.
  await advance(page, 2)
  await expect(page.locator('.usb-tag.on', { hasText: 'prompt' })).toBeVisible()
})

// A blocked control has to say why. The shared tooltip could not: it anchors
// under its control, which is exactly where the card sits.
test('a blocked control explains itself without covering the card', async ({ page }) => {
  await expect(callout(page)).toBeVisible()
  // The block is what the pointer actually meets; the control is behind it.
  await page.locator('.tour-block').hover()

  const note = page.locator('.tour-note')
  await expect(note).toBeVisible()
  const [noteBox, cardBox] = await Promise.all([note.boundingBox(), callout(page).boundingBox()])
  const overlaps =
    noteBox.x < cardBox.x + cardBox.width &&
    noteBox.x + noteBox.width > cardBox.x &&
    noteBox.y < cardBox.y + cardBox.height &&
    noteBox.y + noteBox.height > cardBox.y
  expect(overlaps).toBe(false)
})

// The last step shows a diagram CHANGE rather than describing one: the step
// before it loads two revisions of the same flow and turns the diagram view on.
test('the tour ends on a real diagram comparison', async ({ page }) => {
  await finishRun(page)
  await page.getByRole('button', { name: 'Show me' }).click()
  await advance(page, (await stepCount(page)) - 1)

  await expect(callout(page).locator('h6')).toHaveText('A diagram change, as a diagram')
  await expect(page.locator('[data-tour="slots"]')).toContainText('demo-flow-v1.mmd')
  await expect(page.locator('.diagram-diff, .dg-stage, [class*="diagram"]').first()).toBeVisible()
})

// A REPLAY plays every step as one run, so the scratch tab from step one is
// still open when the diagram step asks for its own pair. It bailed on the tab
// already existing and left the JSON diff on screen under a card describing a
// diagram change.
test('a replay swaps the demo pair rather than keeping the first one', async ({ app, page }) => {
  await callout(page).getByRole('button', { name: 'Skip tips' }).click()
  await clickAppMenuItem(app, 'Show Tour')

  await advance(page, (await stepCount(page)) - 1)
  await expect(callout(page).locator('h6')).toHaveText('A diagram change, as a diagram')
  await expect(page.locator('[data-tour="slots"]')).toContainText('demo-flow-v1.mmd')
  await expect(page.locator('[data-tour="slots"]')).not.toContainText('demo-config-v1.json')
  // One scratch tab, not two: the second pair replaced the first in place.
  await expect(page.locator('.tab')).toHaveCount(2)
})

// The whole stage is the tour's own: the comparison it loaded and the snippet it
// saved both go when it ends, rather than becoming a library the user has to
// tidy up after something they were only shown.
test('the demo comparison and the demo snippet leave with the tour', async ({ page }) => {
  const rows = page.locator('[data-tour="snippets"] .rows li, [data-tour="snippets"] .rows > *')
  const seeded = await rows.count()

  await finishRun(page)
  await page.getByRole('button', { name: 'Show me' }).click()
  await advance(page)
  // The ringed Save is the live one, and pressing it is the only way the
  // example is kept — so this is also the path cleanup has to catch.
  await page.locator('[data-tour="snippet-save"]').click()
  await expect(rows).toHaveCount(seeded + 1)

  await finishRun(page)
  await expect(page.locator('.tour-callout')).toBeHidden()
  await expect(rows).toHaveCount(seeded)
  await expect(page.locator('[data-tour="slots"]')).not.toContainText('demo-config-v1.json')
})
