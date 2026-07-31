import { test, expect } from './fixtures.mjs'

// A pasted side has no filename, so it borrowed a placeholder and every paste
// comparison read the same. A name given here has to reach the file slots, the
// tab, and a saved diff — none of which jsdom can show.

// The sidebar offers the same action, so the region says which + is meant.
const addTab = (page) =>
  page.locator('.diff-tabs').getByRole('button', { name: 'New comparison', exact: true })

async function pasteNamed(page, { left, right, leftName, rightName }) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  const names = page.getByPlaceholder('Name this side…')
  if (leftName !== undefined) await names.nth(0).fill(leftName)
  if (rightName !== undefined) await names.nth(1).fill(rightName)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
}

test('a named side is what the comparison is labelled with', async ({ page }) => {
  await pasteNamed(page, {
    left: 'a',
    right: 'b',
    leftName: 'prod config',
    rightName: 'staging config'
  })

  // The file slots carry the names, not "Left (pasted)".
  await expect(page.locator('.file-slots-row')).toContainText('prod config')
  await expect(page.locator('.file-slots-row')).toContainText('staging config')
  await expect(page.locator('.file-slots-row')).not.toContainText('(pasted)')

  // And so does the tab.
  await expect(page.locator('.diff-tabs .tab').first()).toContainText(
    'prod config ↔ staging config'
  )
})

test('an unnamed side still falls back to the placeholder', async ({ page }) => {
  await pasteNamed(page, { left: 'a', right: 'b', leftName: 'only the left' })
  await expect(page.locator('.file-slots-row')).toContainText('only the left')
  await expect(page.locator('.file-slots-row')).toContainText('Right (pasted)')
})

test('the names survive a save and reopen', async ({ page }) => {
  await pasteNamed(page, { left: 'a', right: 'b', leftName: 'before', rightName: 'after' })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill('Named sides')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()

  // A different comparison, then reopen the saved one.
  await addTab(page).click()
  await pasteNamed(page, { left: 'x', right: 'y' })
  await page.locator('li.diff', { hasText: 'Named sides' }).locator('.stack').click()

  await expect(page.locator('.file-slots-row')).toContainText('before')
  await expect(page.locator('.file-slots-row')).toContainText('after')
})

test('the names travel with the tab they were typed in', async ({ page }) => {
  await pasteNamed(page, { left: 'a', right: 'b', leftName: 'first-tab' })
  await addTab(page).click()
  await pasteNamed(page, { left: 'c', right: 'd', leftName: 'second-tab' })

  await page.locator('.diff-tabs .tab').first().click()
  await expect(page.locator('.file-slots-row')).toContainText('first-tab')
  await page.locator('.diff-tabs .tab').nth(1).click()
  await expect(page.locator('.file-slots-row')).toContainText('second-tab')
})
