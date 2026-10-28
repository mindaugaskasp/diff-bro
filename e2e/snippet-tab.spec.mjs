import { test, expect, editInPlace, docActions } from './fixtures.mjs'

const strip = (page) => page.getByRole('tablist', { name: 'Open comparisons' })

async function newSnippet(page, name, body) {
  await page.getByRole('button', { name: /New snippet/ }).click()
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  await doc.locator('.editor').click()
  await page.keyboard.type(body)
  return doc
}

test('a saved snippet stays open, named in its tab', async ({ page }) => {
  await newSnippet(page, 'Deploy notes', 'kubectl rollout restart')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  const view = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(view).toBeVisible()
  await expect(strip(page).getByRole('tab', { name: /Deploy notes/ })).toBeVisible()
})

test('switching away keeps an unsaved draft, and closing it asks first', async ({ page }) => {
  await newSnippet(page, 'Half done', 'first line')
  await page.getByRole('button', { name: 'New comparison' }).click()
  await expect(page.getByRole('heading', { name: 'What are you comparing?' })).toBeVisible()

  await strip(page)
    .getByRole('tab', { name: /Half done/ })
    .click()
  const doc = page.getByRole('region', { name: 'New snippet' })
  await expect(doc.locator('.view-lines')).toContainText('first line')

  await page.getByRole('button', { name: /^Close Half done/ }).click()
  await expect(page.getByRole('dialog').filter({ hasText: /unsaved|discard/i })).toBeVisible()
})

test('Compare with… opens a comparison with the snippet on the left', async ({ page }) => {
  await newSnippet(page, 'Left side', 'alpha')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Compare with…' }).click()
  await expect(page.locator('.slot[data-side="left"]')).toContainText('Left side')
  await expect(strip(page).getByRole('tab', { name: /Left side/ })).toHaveCount(2)
})

test('history docks beside the snippet once it has an earlier version', async ({ page }) => {
  await newSnippet(page, 'Versioned', 'v1')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  const view = page.getByRole('region', { name: 'Snippet', exact: true })
  await editInPlace(page)
  const edit = page.getByRole('region', { name: 'Edit snippet' })
  await edit.locator('.editor').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' and v2')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await docActions(page)
    .getByRole('button', { name: /History/ })
    .click()
  await expect(page.getByRole('complementary', { name: /Versioned/ })).toBeVisible()
  await expect(view).toBeVisible()
})
