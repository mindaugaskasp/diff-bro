import { test, expect, newSnippetButton, showPanel } from './fixtures.mjs'

test('the snippet editor caret is one quiet pixel in the text ink', async ({ page }) => {
  await showPanel(page, 'snippets')
  await newSnippetButton(page).click()
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.locator('.monaco-editor').first().click()
  await page.keyboard.type('hello')
  const caret = doc.locator('.monaco-editor .cursor').first()
  await expect(caret).toBeVisible()
  const look = await caret.evaluate((el) => {
    const ink = document.createElement('span')
    ink.style.color = 'var(--text)'
    document.body.append(ink)
    const text = getComputedStyle(ink).color
    ink.remove()
    return {
      width: el.getBoundingClientRect().width,
      color: getComputedStyle(el).backgroundColor,
      text
    }
  })
  expect(look.width).toBe(1)
  expect(look.color).toBe(look.text)
})
