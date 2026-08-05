import { test, expect } from './fixtures.mjs'

// A {{today}} in a snippet name is resolved ONCE, at save. The unit tests own
// the token table; what only a launched app can show is that the resolved name
// is what reaches the library, survives the round trip through the encrypted
// store, and does not re-resolve when the snippet is opened again.

const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function newSnippet(app, page, name) {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Snippet' })
  await dialog.getByPlaceholder('Snippet name…').fill(name)
  await dialog.locator('.editor').click()
  await app.evaluate(({ clipboard }) => clipboard.writeText('some content'))
  await app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]).webContents.paste()
  )
  return dialog
}

test('a templated name is resolved when the snippet is saved', async ({ app, page }) => {
  const dialog = await newSnippet(app, page, 'Standup {{today}}')

  // The preview says what will happen before it happens.
  await expect(dialog.locator('.name-hint .preview')).toContainText(`Standup ${today()}`)

  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  // The field itself takes the resolved text, so the editor and the library
  // cannot show two different names for the same snippet. Read off the page,
  // not the dialog: saving drops back to view mode and retitles it.
  await expect(page.getByPlaceholder('Snippet name…')).toHaveValue(`Standup ${today()}`)
  await page.keyboard.press('Escape')

  await expect(
    page.locator('.snippets-section .row', { hasText: `Standup ${today()}` })
  ).toHaveCount(1)
  await expect(page.locator('.snippets-section .row', { hasText: '{{today}}' })).toHaveCount(0)
})

test('the hint stays out of the way of an ordinary name', async ({ app, page }) => {
  const dialog = await newSnippet(app, page, 'Just a name')
  await expect(dialog.locator('.name-hint')).toHaveCount(0)
})

test('an unknown token is kept, not silently dropped', async ({ app, page }) => {
  const dialog = await newSnippet(app, page, 'Build {{version}}')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByPlaceholder('Snippet name…')).toHaveValue('Build {{version}}')
})
