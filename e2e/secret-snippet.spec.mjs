import { test, expect, openNewSnippet, closeSnippet, docActions, markSecret } from './fixtures.mjs'

// A secret snippet is a claim about what is DRAWN, so it can only be checked in
// a launched app: the contents must be absent from the editor and the
// launcher, yet still reach the OS clipboard intact. jsdom has neither
// a real Monaco nor a clipboard.

const SECRET = 'sk-live-DEADBEEF-0123456789'

async function createSecret(page, name = 'Prod API key') {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(SECRET)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await markSecret(page, name)
  // Save closes the editor, so the read-only view is reached the way a reader
  // reaches it: by opening the row.
  await expect(editor).toBeHidden()
  await page.locator('.snippets-section .row', { hasText: name }).first().locator('.entry').click()
  const view = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(view).toBeVisible()
  return view
}

test('a saved secret is masked on screen but copies in full', async ({ app, page }) => {
  const view = await createSecret(page)
  await expect(view).toBeVisible()

  // Saving drops straight back behind the mask, with the notice.
  await expect(view.locator('.secret-mask')).toBeVisible()
  await expect(view.getByText(/Hidden — copy it/)).toBeVisible()
  await expect(view.locator('.secret-mask')).toContainText('****')

  // The contents are nowhere in the rendered page.
  await expect(page.locator('body')).not.toContainText(SECRET)

  // But copying still yields the real thing — the whole point.
  await app.evaluate(({ clipboard }) => clipboard.clear())
  const copy = docActions(page).getByRole('button', { name: 'Copy', exact: true })
  await copy.click()
  // The NAME is stable across the flash — only the visible word swaps — so the
  // acknowledgement is read off the text, not off a second accessible name.
  await expect(copy).toHaveClass(/copied/)
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(SECRET)
})

test('Show reveals the contents, and Hide puts them back', async ({ page }) => {
  const view = await createSecret(page)

  await docActions(page).getByRole('button', { name: 'Show' }).click()
  await expect(view.locator('.secret-mask')).toHaveCount(0)
  await expect(page.locator('.monaco-editor').first()).toContainText('sk-live-DEADBEEF')

  await docActions(page).getByRole('button', { name: 'Hide' }).click()
  await expect(view.locator('.secret-mask')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(SECRET)
})

test('reopening a revealed secret starts masked again', async ({ page }) => {
  const view = await createSecret(page)
  await docActions(page).getByRole('button', { name: 'Show' }).click()
  await expect(view.locator('.secret-mask')).toHaveCount(0)
  await closeSnippet(page)

  // Reveal is per-open and never stored, so the next look is hidden again.
  await page.locator('.snippets-section .row', { hasText: 'Prod API key' }).first().click()
  const reopened = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(reopened.locator('.secret-mask')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(SECRET)
})

test('an ordinary snippet is untouched by the feature', async ({ page }) => {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Plain note')
  await editor.locator('.editor').click()
  await page.keyboard.type('nothing secret here')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()

  await page
    .locator('.snippets-section .row', { hasText: 'Plain note' })
    .first()
    .locator('.entry')
    .click()
  const view = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(view).toBeVisible()
  await expect(view.locator('.secret-mask')).toHaveCount(0)
  await expect(docActions(page).getByRole('button', { name: 'Show' })).toHaveCount(0)
  await expect(page.locator('.monaco-editor').first()).toContainText('nothing secret here')
})
