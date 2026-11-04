import { test, expect, openNewSnippet, docActions, editInPlace } from './fixtures.mjs'

// #233: a button that appears or goes pushes its right-aligned neighbours, and
// a tab that grows pushes the tabs after it. Measured, not screenshotted.
async function saved(page, name, body) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  await doc.locator('.editor').click()
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(doc).toBeHidden()
}

const xOf = async (page, name) =>
  Math.round((await docActions(page).getByRole('button', { name, exact: true }).boundingBox()).x)

const openTab = (page, name) =>
  page.locator('.diff-tabs .tab-open', { hasText: name }).first().click()

test('the snippet toolbar keeps its buttons in place, with or without history', async ({
  page
}) => {
  await saved(page, 'Plain one', 'echo one')
  await saved(page, 'Edited one', 'echo two')
  await editInPlace(page)
  await page.keyboard.type(' again')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(docActions(page).getByRole('button', { name: 'History', exact: true })).toBeEnabled()
  const withHistory = await xOf(page, 'Copy')

  await openTab(page, 'Plain one')
  await expect(
    docActions(page).getByRole('button', { name: 'History', exact: true })
  ).toBeDisabled()
  expect(await xOf(page, 'Copy')).toBe(withHistory)

  await openNewSnippet(page)
  expect(await xOf(page, 'Copy')).toBe(withHistory)
})

test('an unsaved change does not widen its tab', async ({ page }) => {
  await saved(page, 'First', 'echo one')
  const tab = page.locator('.diff-tabs .tab.active')
  const before = Math.round((await tab.boundingBox()).width)
  await editInPlace(page)
  await page.keyboard.type(' more')
  await expect(page.locator('.diff-tabs .tab.active .dirty')).toBeAttached()
  expect(Math.round((await tab.boundingBox()).width)).toBe(before)
})
