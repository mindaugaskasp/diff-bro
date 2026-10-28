import { test, expect } from './fixtures.mjs'

const strip = (page) => page.getByRole('tablist', { name: 'Open comparisons' })
const plus = (page) => page.getByRole('button', { name: 'New comparison' })

async function comparePasted(page) {
  await page.getByRole('button', { name: 'Pasted text' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('before')
  await page.getByPlaceholder('Paste or type the changed text').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
}

test('a cold window opens on the start surface, with no tab drawn for it', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'What are you comparing?' })).toBeVisible()
  await expect(strip(page).getByRole('tab')).toHaveCount(0)
  await expect(plus(page)).toHaveAttribute('aria-pressed', 'true')
})

test('a comparison started from it becomes a tab, and + returns to the surface', async ({
  page
}) => {
  await comparePasted(page)
  await expect(strip(page).getByRole('tab')).toHaveCount(1)
  await expect(plus(page)).toHaveAttribute('aria-pressed', 'false')

  await plus(page).click()
  await expect(page.getByRole('heading', { name: 'What are you comparing?' })).toBeVisible()
  await expect(strip(page).getByRole('tab')).toHaveCount(1)

  await strip(page).getByRole('tab').first().click()
  await expect(page.getByRole('heading', { name: 'What are you comparing?' })).toHaveCount(0)
})

test('New snippet opens a snippet tab in the main view', async ({ page }) => {
  await page.getByRole('button', { name: /New snippet/ }).click()
  await expect(page.getByRole('region', { name: 'New snippet' })).toBeVisible()
  await expect(strip(page).getByRole('tab')).toHaveCount(1)
})
