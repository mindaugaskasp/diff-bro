import { test, expect } from './fixtures.mjs'

// The launcher can write a snippet, and a Jira or Markdown one is written with
// markup — but the compose panel offered no formatting row at all, so choosing
// either language in the launcher gave a plain textarea while the main editor
// gave a toolbar. Same two languages, same buttons, wherever the writing happens.

async function summon(app, page) {
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-input')).toBeVisible()
  return ql
}

const compose = async (app, page) => {
  const ql = await summon(app, page)
  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  return ql
}

const toolbar = (ql) => ql.locator('.ql-compose .format-toolbar')

test('choosing Markdown brings up its formatting row, and the buttons work', async ({
  app,
  page
}) => {
  const ql = await compose(app, page)
  // Plaintext has no markup, so it has no row — the toolbar is a property of the
  // language, not decoration on the panel.
  await expect(toolbar(ql)).toHaveCount(0)

  await ql.locator('.ql-compose-lang').selectOption('markdown')
  await expect(toolbar(ql)).toBeVisible()

  await ql.locator('.ql-compose-text').fill('release notes')
  await ql.locator('.ql-compose-text').evaluate((el) => el.setSelectionRange(0, 7))
  await toolbar(ql).getByRole('button', { name: /Bold/ }).click()
  await expect(ql.locator('.ql-compose-text')).toHaveValue('**release** notes')

  // The caret stays inside what was just wrapped, so typing continues there
  // rather than after the markers.
  const sel = await ql
    .locator('.ql-compose-text')
    .evaluate((el) => [el.selectionStart, el.selectionEnd])
  expect(sel).toEqual([2, 9])
})

test('choosing Jira brings up ITS row, with its own syntax', async ({ app, page }) => {
  const ql = await compose(app, page)
  await ql.locator('.ql-compose-lang').selectOption('jira')
  await expect(toolbar(ql)).toBeVisible()

  await ql.locator('.ql-compose-text').fill('deploy notes')
  await ql.locator('.ql-compose-text').evaluate((el) => el.setSelectionRange(0, 6))
  await toolbar(ql).getByRole('button', { name: /Bold/ }).click()
  // Jira's bold is a single asterisk, Markdown's is two.
  await expect(ql.locator('.ql-compose-text')).toHaveValue('*deploy* notes')
})

// Auto is the default, and it is what the language actually resolves to that
// decides — a body that reads as Markdown gets the Markdown row without anyone
// naming the language.
test('a detected Markdown body gets the row on Auto', async ({ app, page }) => {
  const ql = await compose(app, page)
  await ql.locator('.ql-compose-text').fill('# Heading\n\n- one\n- two\n\n**bold** text\n')
  await expect(toolbar(ql)).toBeVisible()
  await expect(ql.locator('.ql-compose-lang')).toHaveValue('auto')
})

test('the row goes away again when the language stops having markup', async ({ app, page }) => {
  const ql = await compose(app, page)
  await ql.locator('.ql-compose-lang').selectOption('markdown')
  await expect(toolbar(ql)).toBeVisible()

  await ql.locator('.ql-compose-lang').selectOption('sql')
  await expect(toolbar(ql)).toHaveCount(0)
})

// Markup is written to be READ as its rendered form, so the launcher shows that
// form beside the raw text and keeps it current as you type — it used to show
// nothing but the syntax, which is the one view the snippet is not for.
const preview = (ql) => ql.locator('.ql-compose-preview')

test('the rendered form appears beside the syntax, and follows the typing', async ({
  app,
  page
}) => {
  const ql = await compose(app, page)
  await expect(preview(ql)).toHaveCount(0)

  await ql.locator('.ql-compose-lang').selectOption('markdown')
  await expect(preview(ql)).toBeVisible()

  await ql.locator('.ql-compose-text').fill('# Release notes\n\n- **one**\n- two\n')
  await expect(preview(ql).locator('h1')).toHaveText('Release notes')
  await expect(preview(ql).locator('li')).toHaveCount(2)
  await expect(preview(ql).locator('strong')).toHaveText('one')

  // Still an editor: the raw text is right there and takes the next keystroke.
  await ql.locator('.ql-compose-text').fill('# Release notes\n\n- **one**\n- two\n- three\n')
  await expect(preview(ql).locator('li')).toHaveCount(3)
  await expect(ql.locator('.ql-compose-text')).toHaveValue(/three/)
})

test('Jira renders its own markup, and plaintext renders nothing', async ({ app, page }) => {
  const ql = await compose(app, page)
  await ql.locator('.ql-compose-lang').selectOption('jira')
  await ql.locator('.ql-compose-text').fill('h1. Deploy steps\n\n* first\n* second\n')
  await expect(preview(ql).locator('h1')).toHaveText('Deploy steps')
  await expect(preview(ql).locator('li')).toHaveCount(2)

  await ql.locator('.ql-compose-lang').selectOption('sql')
  await expect(preview(ql)).toHaveCount(0)
})

// The four the toolbars gained, driven the way a reader drives them: select,
// press, read the rendered pane back.
test('strikethrough, tasks, nesting and a table all reach the preview', async ({ app, page }) => {
  test.setTimeout(120_000)
  const ql = await compose(app, page)
  await ql.locator('.ql-compose-lang').selectOption('markdown')
  const body = ql.locator('.ql-compose-text')

  await body.fill('gone tomorrow')
  await body.evaluate((el) => el.setSelectionRange(0, 4))
  await toolbar(ql).getByRole('button', { name: /Strikethrough/ }).click()
  await expect(body).toHaveValue('~~gone~~ tomorrow')
  await expect(preview(ql).locator('s')).toHaveText('gone')

  await body.fill('ship it')
  await body.evaluate((el) => el.setSelectionRange(0, 7))
  await toolbar(ql).getByRole('button', { name: /Task list/ }).click()
  await expect(body).toHaveValue('- [ ] ship it')
  await expect(preview(ql).locator('input[type=checkbox]')).not.toBeChecked()

  await toolbar(ql).getByRole('button', { name: /^Indent/ }).click()
  await expect(body).toHaveValue('  - [ ] ship it')
  await toolbar(ql).getByRole('button', { name: /^Outdent/ }).click()
  await expect(body).toHaveValue('- [ ] ship it')

  await body.fill('')
  await toolbar(ql).getByRole('button', { name: /Table/ }).click()
  await expect(preview(ql).locator('th')).toHaveCount(2)
  await expect(preview(ql).locator('tbody tr')).toHaveCount(1)
  // The first heading is selected, so it is typed over rather than deleted.
  await ql.keyboard.type('Env')
  await expect(preview(ql).locator('th').first()).toHaveText('Env')
})

test('Jira gets nesting and its own table syntax', async ({ app, page }) => {
  test.setTimeout(120_000)
  const ql = await compose(app, page)
  await ql.locator('.ql-compose-lang').selectOption('jira')
  const body = ql.locator('.ql-compose-text')

  await body.fill('* one')
  await body.evaluate((el) => el.setSelectionRange(0, 5))
  await toolbar(ql).getByRole('button', { name: /^Indent/ }).click()
  await expect(body).toHaveValue('** one')

  await body.fill('')
  await toolbar(ql).getByRole('button', { name: /Table/ }).click()
  await expect(body).toHaveValue('||Column||Column||\n| | |\n')
  await expect(preview(ql).locator('th')).toHaveCount(2)
})
