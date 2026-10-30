import { test, expect, showPanel, paneLabel } from './fixtures.mjs'

const rightEdge = (locator) => locator.first().evaluate((el) => el.getBoundingClientRect().right)

const expectLabelInsideDivider = async (page, divider) => {
  const label = await rightEdge(paneLabel(page, 'left'))
  expect(label).toBeLessThan(divider)
  expect(divider - label).toBeLessThanOrEqual(24)
}

test('in a comparison the left label ends just inside the pane divider', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('one\ntwo')
  await page.getByPlaceholder('Paste or type the changed text').fill('one\nTWO')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await page.waitForTimeout(400)
  await expectLabelInsideDivider(page, await rightEdge(page.locator('.editor.original')))
})

test('while waiting for the second side the label ends just inside the divider', async ({
  page
}) => {
  await showPanel(page, 'snippets')
  await page.locator('.snippets-section .row[draggable="true"]').first().waitFor()
  await page.evaluate(() => {
    const row = document.querySelector('.snippets-section .row[draggable="true"]')
    const dt = new DataTransfer()
    row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
    const start = document.querySelector('.start-surface')
    start.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
    start.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
  })
  await expect(page.locator('.waiting')).toBeVisible()
  await expectLabelInsideDivider(page, await rightEdge(page.locator('.wait-pane')))
})
