import { test, expect } from './fixtures.mjs'

// The in-view search drives Monaco's findMatches + decorations per side. The
// pure regex guard is unit-tested; only a launch exercises the editor wiring —
// match counting, next/prev navigation, and the bad-regex flag.
async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
}

test('left-side search counts matches and steps through them', async ({ page }) => {
  await pasteCompare(page, 'apple\napple pie\napple sauce', 'pear')

  const left = page.locator('.diff-viewer .side', { hasText: 'left' })
  const count = left.locator('.count')

  await left.getByPlaceholder('Search left side…').fill('apple')
  await expect(count).toHaveText('1/3')

  await left.getByTitle('Next match').click()
  await expect(count).toHaveText('2/3')

  await left.getByTitle('Previous match').click()
  await expect(count).toHaveText('1/3')
})

test('whole-word narrows the matches', async ({ page }) => {
  await pasteCompare(page, 'car cart cartoon car', 'x')
  const left = page.locator('.diff-viewer .side', { hasText: 'left' })
  const count = left.locator('.count')

  await left.getByPlaceholder('Search left side…').fill('car')
  await expect(count).toHaveText('1/4') // car, cart, cartoon, car

  await left.locator('label.opt', { hasText: 'W' }).locator('input').check()
  await expect(count).toHaveText('1/2') // only the two standalone "car"
})

test('an unsafe regex is refused and flagged, not run', async ({ page }) => {
  await pasteCompare(page, 'aaaaaa', 'x')
  const left = page.locator('.diff-viewer .side', { hasText: 'left' })

  await left.locator('label.opt', { hasText: '.*' }).locator('input').check()
  await left.getByPlaceholder('Search left side…').fill('(') // invalid regex
  await expect(left.locator('.count')).toHaveText('bad regex')
})

test('the right side searches independently of the left', async ({ page }) => {
  await pasteCompare(page, 'alpha', 'beta beta beta')
  const right = page.locator('.diff-viewer .side', { hasText: 'right' })
  await right.getByPlaceholder('Search right side…').fill('beta')
  await expect(right.locator('.count')).toHaveText('1/3')

  // The left side, unqueried, shows no count.
  const left = page.locator('.diff-viewer .side', { hasText: 'left' })
  await expect(left.locator('.count')).toHaveText('')
})
