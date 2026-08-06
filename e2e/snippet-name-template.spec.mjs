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

// Typed, not pasted. Filling the editor through the OS clipboard is what made
// this spec (and compare-snippets) fail a release: under CI's parallel workers
// the paste sometimes did not land, content stayed empty, and Save sat disabled
// until the test timed out — reported as "page has been closed", which names
// nothing. Bracket-free text, so Monaco's auto-closing cannot perturb it.
async function newSnippet(page, name) {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Snippet' })
  await dialog.getByPlaceholder('Snippet name…').fill(name)
  await dialog.locator('.editor').click()
  await page.keyboard.type('some content')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  return dialog
}

test('a templated name is resolved when the snippet is saved', async ({ page }) => {
  const dialog = await newSnippet(page, 'Standup {{today}}')

  // The preview says what will happen before it happens.
  await expect(dialog.locator('.name-templates .preview')).toContainText(`Standup ${today()}`)

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

// The trigger is ALWAYS there — that is what makes the feature discoverable
// without already knowing it exists — but it costs one row, not three: the
// preview only appears with a placeholder typed, and the list only on request.
test('the tags button is always offered, the list and preview are not', async ({ page }) => {
  const dialog = await newSnippet(page, 'Just a name')
  const tags = dialog.getByRole('button', { name: 'Template tags' })
  await expect(tags).toBeVisible()
  await expect(dialog.locator('.name-templates .preview')).toHaveCount(0)
  await expect(dialog.locator('.name-templates .tokens')).toHaveCount(0)

  await tags.click()
  await expect(dialog.locator('.name-templates .tokens')).toBeVisible()
  await expect(dialog.locator('.name-templates .tokens code').first()).toHaveText('{{today}}')

  await tags.click()
  await expect(dialog.locator('.name-templates .tokens')).toHaveCount(0)
})

// The report that prompted the rework: nine tokens permanently under the field
// pushed the dialog body into a scrollbar on a small window.
test('the resting dialog does not scroll its body open', async ({ page }) => {
  await newSnippet(page, 'Standup {{today}}')
  const overflow = await page
    .locator('.dialog .dialog-body, .dialog')
    .first()
    .evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('an unknown token is kept, not silently dropped', async ({ page }) => {
  const dialog = await newSnippet(page, 'Build {{version}}')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByPlaceholder('Snippet name…')).toHaveValue('Build {{version}}')
})
