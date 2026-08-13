import { test, expect } from './fixtures.mjs'

// The launcher is keyboard-first, but the mouse must not be a dead end: a click
// on a row did nothing but select it, so a tool, the Tools header and the create
// row all looked broken to anyone who reached for the pointer. One click now
// does exactly what ↵ does on that row.
const EXAMPLE = 'Example — Mermaid diagram'

async function summon(app, page) {
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-input')).toBeVisible()
  return ql
}

const row = (ql, name) => ql.locator('.ql-res:not(.ql-res-create)', { hasText: name })

test('one click opens the Tools section and then a tool', async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.locator('.ql-res.section').click()
  await expect(ql.locator('.ql-res.sub').first()).toBeVisible()

  await ql.locator('.ql-input').fill('base64')
  await row(ql, 'Base64').click()
  await expect(ql.locator('.qc-name')).toHaveText('Base64')
})

test('one click on the create row opens the compose panel', async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.locator('.ql-input').fill('Clicked into being')
  await ql.locator('.ql-res-create').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-name')).toHaveValue('Clicked into being')
})

test('one click on a snippet hands it to the main window', async ({ app, page }) => {
  await expect(page.getByText(EXAMPLE)).toBeVisible()
  const ql = await summon(app, page)

  await ql.locator('.ql-input').fill('Mermaid')
  await row(ql, EXAMPLE).click()

  // The same hand-off ↵ performs: the main window opens that snippet.
  const opened = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await expect(opened).toBeVisible()
  await expect(opened.getByPlaceholder('Snippet name…')).toHaveValue(EXAMPLE)
})

// Double-click WAS the activator until a single click became one, so it is the
// gesture most likely to arrive out of habit — and acting on both clicks opened
// the Tools section and shut it again in one go.
test('a double-click opens a row once, not twice', async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.locator('.ql-res.section').dblclick()
  await expect(ql.locator('.ql-res.sub').first()).toBeVisible()

  await ql.locator('.ql-input').fill('Doubled into being')
  await ql.locator('.ql-res-create').dblclick()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-name')).toHaveValue('Doubled into being')
})
