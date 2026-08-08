import { test, expect } from './fixtures.mjs'

// The keyboard-only capture path. Every case here must reach compose WITHOUT
// touching `.ql-add`: the button is the mouse affordance, and the whole point
// of these tests is that a hand never leaves the home row. Tab is deliberately
// never pressed either — it parks focus on a control and kills the arrow
// driver, which hangs off the search box's @keydown.
// The seeded snippet must be on screen BEFORE the launcher is summoned. The main
// window takes focus back as it finishes settling, and the launcher hides on
// blur — which reads here as the launcher simply never responding.
const EXAMPLE = 'Example — Mermaid diagram'

async function summon(app, page) {
  await expect(page.getByText(EXAMPLE)).toBeVisible()
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-input')).toBeVisible()
  return ql
}

const SQL = "SELECT order_id, status\nFROM orders\nWHERE status = 'stuck';"

test('Cmd+N opens compose with the query as the name, and saves', async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.locator('.ql-input').fill('deploy rollback')
  await ql.keyboard.press('ControlOrMeta+n')

  // The search band gives way to compose, the query lands in the name, and the
  // caret is already in the body — nothing to Tab to.
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-name')).toHaveValue('deploy rollback')
  await expect(ql.locator('.ql-compose-text')).toBeFocused()

  await ql.keyboard.type(SQL)
  await ql.keyboard.press('ControlOrMeta+Enter')
  await expect(ql.locator('.ql-compose')).toBeHidden()

  // Excluding the create row, which matches the same text by design — it stays
  // offered even when something already matches, so a near-duplicate name is
  // still one keystroke away.
  await ql.locator('.ql-input').fill('Deploy rollback')
  const saved = ql.locator('.ql-res:not(.ql-res-create)', { hasText: 'Deploy rollback' })
  await expect(saved).toHaveCount(1)
  await expect(ql.locator('.ql-res-create')).toBeVisible()
})

// Detection is what makes the launcher worth typing SQL into: the same body
// stored as plaintext carries no language and no format tag, so it is never
// findable by "sql" afterwards.
test('a saved snippet keeps the language its body was detected as', async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.locator('.ql-input').fill('stuck orders')
  await ql.keyboard.press('ControlOrMeta+n')
  await ql.keyboard.type(SQL)
  // `option:checked`, not the select's textContent — that would read EVERY
  // option and pass whatever is selected.
  await expect(ql.locator('.ql-compose-lang option:checked')).toHaveText(/SQL/)
  await ql.keyboard.press('ControlOrMeta+Enter')

  // Searching by the FORMAT finds it — formatTagFor only tags a non-plaintext
  // snippet, so this fails outright when the draft is forced to plaintext.
  await ql.locator('.ql-input').fill('sql')
  await expect(ql.locator('.ql-res', { hasText: 'Stuck orders' })).toBeVisible()
})

test('the create row appears for a query nothing matches, and Enter opens it', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)

  await expect(ql.locator('.ql-res-create')).toHaveCount(0)
  await ql.locator('.ql-input').fill('zzz nothing matches this')

  const create = ql.locator('.ql-res-create')
  await expect(create).toBeVisible()
  await expect(create).toContainText('zzz nothing matches this')

  await ql.keyboard.press('Enter')
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-name')).toHaveValue('zzz nothing matches this')
})

// The measurable thing, not a screenshot: the overlay really tokenizes, and it
// does so while typing rather than only after a save.
test('the compose body paints syntax roles as you type', async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.keyboard.press('ControlOrMeta+n')
  await ql.keyboard.type(SQL)

  const keyword = ql.locator('.ql-compose-hl .syn-keyword').first()
  await expect(keyword).toBeVisible()
  await expect(keyword).toHaveText('SELECT')

  // The two layers must stay registered, or the colour sits under the wrong
  // characters. Same box, same metrics.
  const [ta, hl] = await Promise.all([
    ql.locator('.ql-compose-text').evaluate((el) => {
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        font: s.fontFamily,
        size: s.fontSize,
        lh: s.lineHeight,
        ws: s.whiteSpace,
        x: Math.round(r.x),
        y: Math.round(r.y)
      }
    }),
    ql.locator('.ql-compose-hl').evaluate((el) => {
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        font: s.fontFamily,
        size: s.fontSize,
        lh: s.lineHeight,
        ws: s.whiteSpace,
        x: Math.round(r.x),
        y: Math.round(r.y)
      }
    })
  ])
  expect(hl).toEqual(ta)
  expect(ta.font).toMatch(/mono/i)

  // The overlay's tags are whitespace-jammed on purpose: a newline between them
  // renders as text and shifts every line, while both boxes stay identical — so
  // the geometry check above cannot see it. Read the runs back instead.
  const painted = await ql
    .locator('.ql-compose-hl')
    .evaluate((el) => [...el.children].map((line) => line.textContent).join('\n'))
  expect(painted).toBe(SQL)
})

// An explicit choice is a decision, not a hint: a later keystroke must not let
// the detector overwrite it.
test('picking a language stops detection from overriding it', async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.keyboard.press('ControlOrMeta+n')
  await ql.locator('.ql-compose-lang').selectOption('plaintext')
  await ql.keyboard.type(SQL)

  await expect(ql.locator('.ql-compose-lang')).toHaveValue('plaintext')
  await expect(ql.locator('.ql-compose-hl .syn-keyword')).toHaveCount(0)
})

// QA found three of these by hand. Each is a save-time or state bug that no
// unit test could reach, because they all need a real launch.

// The row carried only the RESOLVED language, so an unmodified inline edit
// wrote it back as the stored one: an explicit "keep this plain" became auto,
// and an auto snippet froze to whatever it had resolved to that day.
test('an unmodified inline edit does not rewrite the stored language', async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.keyboard.press('ControlOrMeta+n')
  await ql.locator('.ql-compose-name').fill('orders probe')
  await ql.locator('.ql-compose-text').fill(SQL)
  await expect(ql.locator('.ql-compose-lang option:checked')).toHaveText(/SQL/)
  await ql.keyboard.press('ControlOrMeta+Enter')

  await ql.locator('.ql-input').fill('orders probe')
  await ql.locator('.ql-res:not(.ql-res-create)', { hasText: 'Orders probe' }).first().click()
  await ql.locator('.ql-pv-head button', { hasText: 'Edit' }).click()

  // Still Auto — the picker would read a bare "SQL" if the language had frozen.
  await expect(ql.locator('.ql-compose-lang')).toHaveValue('auto')
  await ql.keyboard.press('ControlOrMeta+Enter')

  await ql.locator('.ql-input').fill('orders probe')
  await ql.locator('.ql-res:not(.ql-res-create)', { hasText: 'Orders probe' }).first().click()
  await ql.locator('.ql-pv-head button', { hasText: 'Edit' }).click()
  await expect(ql.locator('.ql-compose-lang')).toHaveValue('auto')
})

// ArrowLeft is the native way to change a CLOSED select on Windows and Linux,
// and the compose hints invite the user to Shift+Tab to it.
test('changing the language with an arrow key does not discard the draft', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)

  await ql.keyboard.press('ControlOrMeta+n')
  await ql.locator('.ql-compose-text').fill('keep me')
  await ql.locator('.ql-compose-lang').focus()
  await ql.keyboard.press('ArrowLeft')

  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-text')).toHaveValue('keep me')
})

// The launcher hides on blur and is kept warm, so a summon must land on a fresh
// search band. This could not pass until focusInput() stopped throwing: it runs
// first in onMounted, so it took the quicklook:show registration down with it
// and refresh() never ran at all.
test("a re-summon starts fresh, not on last time's draft", async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.locator('.ql-input').fill('marker-query')
  await ql.keyboard.press('ControlOrMeta+n')
  await ql.locator('.ql-compose-text').fill('half-written thought')
  await expect(ql.locator('.ql-compose')).toBeVisible()

  await page.evaluate(() => window.api.quickLookToggle())
  await page.evaluate(() => window.api.quickLookToggle())

  await expect(ql.locator('.ql-compose')).toBeHidden()
  await expect(ql.locator('.ql-input')).toBeVisible()
  await expect(ql.locator('.ql-input')).toHaveValue('')
})
