import { test, expect, openNewSnippet, showPanel, docActions } from './fixtures.mjs'

// #121: tags are paths, and the Snippets list is sections by tag, nested three deep.
async function snippetWith(page, name, tags) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('body')
  for (const tag of tags) {
    await editor.getByPlaceholder('add a tag…').fill(tag)
    await editor.getByPlaceholder('add a tag…').press('Enter')
  }
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

const section = (page, path) => page.locator(`.snippets-section .ts-head[data-path="${path}"]`)
const rowsUnder = (page, path) =>
  page.locator(`.snippets-section .ts-head[data-path="${path}"] + .ts-rows > .row`)

test.beforeEach(async ({ page }) => {
  await snippetWith(page, 'Restart api', ['ops/k8s/prod'])
  await snippetWith(page, 'Tail pod logs', ['ops/k8s'])
  await snippetWith(page, 'Postgres vacuum', ['data/prod', 'ops/k8s/prod'])
  await showPanel(page, 'snippets')
})

test('tag paths become nested sections, and a parent counts what is inside it', async ({
  page
}) => {
  await expect(section(page, 'ops').locator('.ts-count')).toHaveText('3')
  await expect(section(page, 'ops/k8s').locator('.ts-count')).toHaveText('3')
  await expect(section(page, 'ops/k8s/prod').locator('.ts-count')).toHaveText('2')
  await expect(section(page, 'data').locator('.ts-count')).toHaveText('1')
  await expect(rowsUnder(page, 'ops/k8s/prod').filter({ hasText: 'Postgres vacuum' })).toHaveCount(
    1
  )
  await expect(rowsUnder(page, 'data/prod').filter({ hasText: 'Postgres vacuum' })).toHaveCount(1)
})

test('a fourth level is refused, with the deepest the path can go', async ({ page }) => {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('add a tag…').fill('ops/k8s/prod/eu')
  await editor.getByPlaceholder('add a tag…').press('Enter')
  await expect(editor.getByRole('alert')).toContainText('"ops/k8s/prod" is the deepest')
  await expect(editor.getByPlaceholder('add a tag…')).toHaveValue('ops/k8s/prod/eu')
})

test('# scopes the list to one branch, and the chip takes it off', async ({ page }) => {
  const box = page.locator('.usb-top input[type="search"]')
  await page.getByRole('button', { name: 'Search inside a tag' }).click()
  await expect(box).toHaveValue('#')
  await page.keyboard.type('data')
  // Choosing a scope is not a text search: the list stays while # is open.
  await expect(page.locator('.snippets-section .row')).not.toHaveCount(0)
  await page.locator('.scope-list li', { hasText: /^data\/prod$/ }).click()

  const chip = page.locator('.usb-top .scope-chip')
  await expect(chip).toContainText('data/prod')
  await expect(page.locator('.snippets-section .row')).toHaveCount(1)
  await expect(section(page, 'ops')).toHaveCount(0)

  await chip.getByRole('button').click()
  await expect(section(page, 'ops')).toBeVisible()
})

test('a closed section stays closed after a reload', async ({ page }) => {
  await section(page, 'data').click()
  await expect(section(page, 'data')).toHaveAttribute('aria-expanded', 'false')
  await page.reload()
  await showPanel(page, 'snippets')
  await expect(section(page, 'data')).toHaveAttribute('aria-expanded', 'false')
  await expect(section(page, 'ops')).toHaveAttribute('aria-expanded', 'true')
})
