import { test, expect, openNewSnippet } from './fixtures.mjs'

const measure = (doc) =>
  doc.locator('.editor-area .monaco-editor').evaluate((editor) => {
    const margin = editor.querySelector('.margin')
    const numbers = [...editor.querySelectorAll('.line-numbers')].filter((n) => n.offsetWidth)
    const number = numbers.at(-1)
    const range = document.createRange()
    range.selectNodeContents(number)
    const digits = range.getBoundingClientRect()
    const text = editor.querySelector('.view-lines').getBoundingClientRect()
    const css = getComputedStyle(margin)
    return {
      inset: digits.left - editor.getBoundingClientRect().left,
      gap: text.left - digits.right,
      rule: css.boxShadow,
      sameGround:
        css.backgroundColor ===
        getComputedStyle(editor.querySelector('.monaco-editor-background')).backgroundColor,
      digits: number.textContent.trim()
    }
  })

test('text stands clear of the line numbers, with no rule between them', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.locator('.editor').first().click()
  await page.keyboard.type('Review this diff')
  const shape = await measure(doc)
  expect(shape.gap).toBeGreaterThanOrEqual(16)
  expect(shape.rule).toBe('none')
  expect(shape.sameGround).toBe(true)
})

test('a long file widens the gutter and keeps every digit clear of both edges', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 420 })
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.locator('.editor').first().click()
  await page.keyboard.insertText('\n'.repeat(1234))
  await expect(doc.locator('.editor-status')).toContainText('1235 lines')
  const shape = await measure(doc)
  expect(shape.digits).toHaveLength(4)
  expect(shape.inset).toBeGreaterThanOrEqual(4)
  expect(shape.gap).toBeGreaterThanOrEqual(12)
})
