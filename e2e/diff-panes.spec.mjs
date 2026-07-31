import { test, expect } from './fixtures.mjs'

// Split view is two panes of the same comparison, so the furniture down their
// right edges has to match. Monaco adds a diff overview ruler to the modified
// side only, which made the right scrollbar visibly wider than the left.
test('both panes carry the same scrollbar furniture', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste text' }).click()
  const many = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n')
  await page.getByPlaceholder('Paste original text here').fill(many)
  await page.getByPlaceholder('Paste changed text here').fill(many.replace('line 5', 'LINE 5!'))
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await page.waitForTimeout(500)

  const chrome = await page.evaluate(() => {
    const w = (el) => (el ? el.getBoundingClientRect().width : 0)
    const inPane = (side) => w(document.querySelector(`.editor.${side} .decorationsOverviewRuler`))
    const diffRuler = w(document.querySelector('.diffOverview, .diffOverviewRuler'))
    return { left: inPane('original'), right: inPane('modified') + diffRuler, diffRuler }
  })

  expect(chrome.left).toBeGreaterThan(0) // the change marks are still there
  expect(chrome.right).toBe(chrome.left)
})

// The panes themselves were already equal; this pins that too, so a future
// change to the ruler cannot quietly start stealing width from one side.
test('the two panes are the same width', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('one\ntwo')
  await page.getByPlaceholder('Paste changed text here').fill('one\nTWO')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await page.waitForTimeout(400)

  const panes = await page.evaluate(() => {
    const w = (s) => Math.round(document.querySelector(s).getBoundingClientRect().width)
    return { original: w('.editor.original'), modified: w('.editor.modified') }
  })
  expect(panes.modified).toBe(panes.original)
})

// Monaco's 14px default read as a slab down each pane; the app's own scrollbars
// are slimmer, so the diff was the odd one out.
test('the pane scrollbars are slim, and the same on both sides', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste text' }).click()
  const many = Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n')
  await page.getByPlaceholder('Paste original text here').fill(many)
  await page.getByPlaceholder('Paste changed text here').fill(many.replace('line 5', 'CHANGED'))
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await page.waitForTimeout(400)

  const bars = await page.evaluate(() => {
    const w = (s) => {
      const el = document.querySelector(s)
      return el ? Math.round(el.getBoundingClientRect().width) : null
    }
    return {
      left: w('.editor.original .scrollbar.vertical'),
      right: w('.editor.modified .scrollbar.vertical')
    }
  })
  expect(bars.left).toBe(bars.right)
  expect(bars.left).toBeLessThan(14) // Monaco's default
})
