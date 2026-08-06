import { test, expect } from './fixtures.mjs'

// Deleting a tag reaches two stores at once: snippets and saved diffs share one
// tag registry. Whether the records go with it is a choice made in the confirm,
// and only a launched app proves the sidebar afterwards — the counts, the
// toggle, and the rows that survive are all rendered facts.

async function saveTaggedDiff(page, name, tag) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('{\n  "a": 1\n}')
  await page.getByPlaceholder('Paste changed text here').fill('{\n  "a": 2\n}')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByPlaceholder('add a tag…').fill(tag)
  await dialog.getByPlaceholder('add a tag…').press('Enter')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: name })).toBeVisible()
}

async function saveTaggedSnippet(page, name, tag) {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('seeded body')
  await editor.getByPlaceholder('add a tag…').fill(tag)
  await editor.getByPlaceholder('add a tag…').press('Enter')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.snippets-section .row', { hasText: name })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Snippet', exact: true })).toHaveCount(0)
}

const openTagManager = async (page, tag) => {
  // The sidebar's own tag bar — .tag-chip is also the class on the editor's
  // tag field, and only these chips open the manager.
  const chip = page.locator('.usb-tag', { hasText: tag }).first()
  await chip.click({ button: 'right' })
  await expect(page.locator('.manage')).toBeVisible()
}

test('deleting a tag keeps its records by default', async ({ page }) => {
  await saveTaggedSnippet(page, 'E2E keep note', 'doomed')
  await saveTaggedDiff(page, 'E2E keep me', 'doomed')
  await openTagManager(page, 'doomed')
  await page.getByRole('button', { name: 'Delete tag' }).click()

  const confirm = page.getByRole('dialog', { name: 'Delete tag?' })
  await expect(confirm).toBeVisible()
  // The sentence is about what WILL happen, counted before anything goes —
  // across BOTH stores, which share one tag registry.
  await expect(confirm).toContainText('1 snippet and 1 saved diff')
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.locator('li.diff', { hasText: 'E2E keep me' })).toBeVisible()
  await expect(page.locator('.snippets-section .row', { hasText: 'E2E keep note' })).toBeVisible()
  await expect(page.locator('.usb-tag', { hasText: 'doomed' })).toHaveCount(0)
})

test('the toggle takes the records with the tag, on both sides', async ({ page }) => {
  await saveTaggedSnippet(page, 'E2E doomed note', 'doomed')
  await saveTaggedDiff(page, 'E2E delete me', 'doomed')
  await openTagManager(page, 'doomed')
  await page.getByRole('button', { name: 'Delete tag' }).click()

  const confirm = page.getByRole('dialog', { name: 'Delete tag?' })
  await confirm.getByRole('checkbox').check()
  // The button names the damage once the toggle is on.
  await expect(confirm.getByRole('button', { name: /Delete tag and 2/ })).toBeVisible()
  await confirm.getByRole('button', { name: /Delete tag and 2/ }).click()

  await expect(page.locator('li.diff', { hasText: 'E2E delete me' })).toHaveCount(0)
  await expect(page.locator('.snippets-section .row', { hasText: 'E2E doomed note' })).toHaveCount(
    0
  )
  await expect(page.locator('.usb-tag', { hasText: 'doomed' })).toHaveCount(0)
})

// The bigger action must never be inherited from the last tag someone removed.
test('the toggle resets between one tag and the next', async ({ page }) => {
  await saveTaggedSnippet(page, 'E2E first', 'alpha')
  await saveTaggedSnippet(page, 'E2E second', 'beta')

  await openTagManager(page, 'alpha')
  await page.getByRole('button', { name: 'Delete tag' }).click()
  let confirm = page.getByRole('dialog', { name: 'Delete tag?' })
  await confirm.getByRole('checkbox').check()
  await confirm.getByRole('button', { name: /Delete tag and 1/ }).click()
  await expect(page.locator('.snippets-section .row', { hasText: 'E2E first' })).toHaveCount(0)

  await openTagManager(page, 'beta')
  await page.getByRole('button', { name: 'Delete tag' }).click()
  confirm = page.getByRole('dialog', { name: 'Delete tag?' })
  await expect(confirm.getByRole('checkbox')).not.toBeChecked()
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator('.snippets-section .row', { hasText: 'E2E second' })).toBeVisible()
})
