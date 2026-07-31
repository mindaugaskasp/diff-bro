import { test, expect } from './fixtures.mjs'

// A URL snippet is a saved link with a one-click open. It is the one snippet
// type that never leaves the machine, so a shared bundle can never carry a link
// somebody else's click would open.
async function newUrlSnippet(page, name, url) {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('select').selectOption('url')
  await editor.locator('.editor').click()
  await page.keyboard.type(url)
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  // Save drops the dialog into read-only view mode; close it for the next one.
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await expect(view).toBeVisible()
  await view.getByRole('button', { name: 'Close' }).last().click()
}

test('a URL snippet offers a one-click open', async ({ page }) => {
  await newUrlSnippet(page, 'Docs', 'https://example.com/docs')
  const row = page.locator('li.row', { hasText: 'Docs' })
  await expect(row.locator('.monogram')).toHaveText('URL')

  await row.hover()
  await expect(row.getByRole('button', { name: 'Open link in browser' })).toBeVisible()
})

test('main refuses any scheme that is not http(s)', async ({ page }) => {
  await newUrlSnippet(page, 'Docs', 'https://example.com/docs')

  // Straight at the IPC: the renderer must not be able to hand the OS a file or
  // a script handler, whatever the snippet holds.
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x']) {
    const res = await page.evaluate((u) => window.api.openLink(u), url)
    expect(res, url).toEqual({ error: 'not-allowed' })
  }
})

test('a URL snippet is left out of an exported bundle', async ({ page }) => {
  await newUrlSnippet(page, 'Secret link', 'https://example.com/private')
  await newUrlSnippet(page, 'Plain note', 'https://example.com/other')

  // Both are URL snippets, so an export bundle must come back empty.
  await page
    .getByRole('button', { name: 'Export all snippets to a passphrase-protected file' })
    .click()
  const dlg = page.getByRole('dialog')
  await expect(dlg.first()).toBeVisible()
})
