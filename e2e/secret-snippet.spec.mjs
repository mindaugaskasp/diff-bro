import { test, expect } from './fixtures.mjs'

// A secret snippet is a claim about what is DRAWN, so it can only be checked in
// a launched app: the contents must be absent from the editor, the hover card
// and the launcher, yet still reach the OS clipboard intact. jsdom has neither
// a real Monaco nor a clipboard.

const SECRET = 'sk-live-DEADBEEF-0123456789'

async function createSecret(page, name = 'Prod API key') {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(SECRET)
  await editor.locator('.secret-toggle input[type="checkbox"]').check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  return page.getByRole('dialog', { name: 'Snippet', exact: true })
}

test('a saved secret is masked on screen but copies in full', async ({ app, page }) => {
  const view = await createSecret(page)
  await expect(view).toBeVisible()

  // Saving drops straight back behind the mask, with the notice.
  await expect(view.locator('.secret-mask')).toBeVisible()
  await expect(view.getByText(/Hidden secret snippet/)).toBeVisible()
  await expect(view.locator('.secret-mask')).toContainText('****')

  // The contents are nowhere in the rendered page.
  await expect(page.locator('body')).not.toContainText(SECRET)

  // But copying still yields the real thing — the whole point.
  await app.evaluate(({ clipboard }) => clipboard.clear())
  await view.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(view.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(SECRET)
})

test('Show reveals the contents, and Hide puts them back', async ({ page }) => {
  const view = await createSecret(page)

  await view.getByRole('button', { name: 'Show' }).click()
  await expect(view.locator('.secret-mask')).toHaveCount(0)
  await expect(page.locator('.monaco-editor').first()).toContainText('sk-live-DEADBEEF')

  await view.getByRole('button', { name: 'Hide' }).click()
  await expect(view.locator('.secret-mask')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(SECRET)
})

test('reopening a revealed secret starts masked again', async ({ page }) => {
  const view = await createSecret(page)
  await view.getByRole('button', { name: 'Show' }).click()
  await expect(view.locator('.secret-mask')).toHaveCount(0)
  await view.locator('.dialog-actions').getByRole('button', { name: 'Close' }).click()

  // Reveal is per-open and never stored, so the next look is hidden again.
  await page.locator('.snippets-section .row', { hasText: 'Prod API key' }).click()
  const reopened = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await expect(reopened.locator('.secret-mask')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(SECRET)
})

test('the hover card masks a secret and never decrypts it', async ({ page }) => {
  const view = await createSecret(page)
  await view.locator('.dialog-actions').getByRole('button', { name: 'Close' }).click()

  const row = page.locator('.snippets-section .row', { hasText: 'Prod API key' })
  await expect(row.locator('.secret-mark')).toBeVisible() // the lock marker
  // The card opens on mouseenter, which never fires if the pointer is already
  // resting on the row — park it away first so the hover is a real arrival.
  await page.mouse.move(0, 0)
  await row.locator('.nm').hover()

  const card = page.locator('.preview')
  await expect(card).toBeVisible()
  await expect(card.locator('.secret-mask')).toBeVisible()
  await expect(card).not.toContainText(SECRET)
})

test('an ordinary snippet is untouched by the feature', async ({ page }) => {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Plain note')
  await editor.locator('.editor').click()
  await page.keyboard.type('nothing secret here')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()

  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await expect(view.locator('.secret-mask')).toHaveCount(0)
  await expect(view.getByRole('button', { name: 'Show' })).toHaveCount(0)
  await expect(page.locator('.monaco-editor').first()).toContainText('nothing secret here')
})
