import { test, expect, openNewSnippet, docActions } from './fixtures.mjs'

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
  await openNewSnippet(page)
  const dialog = page.getByRole('region', { name: 'New snippet' })
  await dialog.getByPlaceholder('Snippet name…').fill(name)
  await dialog.locator('.editor').click()
  await page.keyboard.type('some content')
  await expect(docActions(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  return dialog
}

test('a templated name is resolved when the snippet is saved', async ({ page }) => {
  const dialog = await newSnippet(page, 'Standup {{today}}')

  // The preview says what will happen before it happens.
  await expect(dialog.locator('.name-templates .preview')).toContainText(`Standup ${today()}`)

  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()

  // Saving resolves the template into the STORED name, so the row is what says
  // whether it worked — the editor is gone by then.
  await expect(
    page.locator('.snippets-section .row', { hasText: `Standup ${today()}` })
  ).toHaveCount(1)
  await expect(page.locator('.snippets-section .row', { hasText: '{{today}}' })).toHaveCount(0)
})

// Always offered, now from the editor's status bar: the name field carries
// only the "Saves as" preview, and only while the name holds a tag.
test('the template tags are always offered, with what each saves as', async ({ page }) => {
  const dialog = await newSnippet(page, 'Just a name')
  await expect(dialog.locator('.name-templates')).toHaveCount(0)

  const trigger = dialog.locator('.editor-status .tt-trigger')
  await expect(trigger).toBeVisible()
  await trigger.hover()
  const pop = page.getByRole('dialog', { name: 'Template tags' })
  await expect(pop).toContainText('{{today}}')
  await expect(pop).toContainText('{{week}}')
  await expect(pop).toContainText(today()) // the same clock the preview uses
  await expect(pop.locator('.tt-row')).toHaveCount(9)
})

// The report that prompted the rework: nine tokens permanently under the field
// pushed the dialog body into a scrollbar on a small window.
test('the resting document does not scroll its body open', async ({ page }) => {
  await newSnippet(page, 'Standup {{today}}')
  const overflow = await page
    .locator('.snippet-doc:visible')
    .evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('an unknown token is kept, not silently dropped', async ({ page }) => {
  const dialog = await newSnippet(page, 'Build {{version}}')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.locator('.snippets-section .row', { hasText: 'Build {{version}}' })
  ).toHaveCount(1)
})
