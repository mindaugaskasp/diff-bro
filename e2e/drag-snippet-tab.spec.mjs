import { test, expect, openNewSnippet, showPanel } from './fixtures.mjs'

const PROMPT = 'Example — Claude review prompt'
const strip = (page) => page.getByRole('tablist', { name: 'Open comparisons' })
const leftSlot = '.slot[data-side="left"]'

// One DataTransfer shared by dragstart and drop, as the browser does it.
// Resolves to whether the drag was allowed to start.
const dragTabTo = (page, title, target) =>
  page.evaluate(
    ({ title: name, target: selector }) => {
      const tab = [...document.querySelectorAll('.diff-tabs .tab')].find((t) =>
        t.textContent.includes(name)
      )
      const dt = new DataTransfer()
      const started = tab.dispatchEvent(
        new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true })
      )
      if (!started) return false
      const drop = document.querySelector(selector)
      drop.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
      drop.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
      return true
    },
    { title, target }
  )

async function newComparison(page) {
  await page.getByRole('button', { name: 'New comparison' }).click()
  await expect(page.locator(leftSlot)).toBeVisible()
}

test('a saved snippet tab dropped on a side loads there, and stays open', async ({ page }) => {
  await showPanel(page, 'snippets')
  await page.locator('.snippets-section .row', { hasText: PROMPT }).click()
  await expect(strip(page).getByRole('tab', { name: new RegExp(PROMPT) })).toBeVisible()
  await newComparison(page)

  expect(await dragTabTo(page, PROMPT, leftSlot)).toBe(true)
  await expect(page.locator(leftSlot)).toContainText(PROMPT, { timeout: 15000 })
  await expect(page.locator('.diff-tabs .tab:has(.kind)', { hasText: PROMPT })).toHaveCount(1)
})

test("an unsaved tab drops the text it shows now, under the tab's name", async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New Snippet' })
  await doc.getByPlaceholder('Snippet name…').fill('Draft notes')
  await doc.locator('.editor').click()
  await page.keyboard.type('typed but not saved')
  await newComparison(page)

  expect(await dragTabTo(page, 'Draft notes', leftSlot)).toBe(true)
  await expect(page.locator(leftSlot)).toContainText('Draft notes', { timeout: 15000 })
  await expect(page.locator('.wait-pane.loaded .view-lines')).toContainText('typed but not saved')
})

test('a secret snippet tab does not start a drag', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New Snippet' })
  await doc.getByPlaceholder('Snippet name…').fill('Hidden thing')
  await doc.locator('.editor').click()
  await page.keyboard.type('secret text')
  await doc.getByRole('checkbox', { name: 'Secret' }).check()
  await newComparison(page)

  expect(await dragTabTo(page, 'Hidden thing', leftSlot)).toBe(false)
})
