import { test, expect, showPanel } from './fixtures.mjs'

const swapCentre = (page) =>
  page.locator('.file-slots-row .swap').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.x + r.width / 2
  })

const rightEdge = (page, selector) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().right)

test('in a comparison the pane divider runs straight down from the swap button', async ({
  page
}) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('one\ntwo')
  await page.getByPlaceholder('Paste or type the changed text').fill('one\nTWO')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await page.waitForTimeout(400)
  const divider = await rightEdge(page, '.editor.original')
  expect(Math.abs(divider - (await swapCentre(page)))).toBeLessThanOrEqual(1)
})

test('while waiting for the second side the divider lines up with the swap button', async ({
  page
}) => {
  await showPanel(page, 'snippets')
  await page.locator('.snippets-section .row[draggable="true"]').first().waitFor()
  await page.evaluate(() => {
    const row = document.querySelector('.snippets-section .row[draggable="true"]')
    const dt = new DataTransfer()
    row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
    const slot = document.querySelector('.slot[data-side="left"]')
    slot.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
    slot.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
  })
  await expect(page.locator('.waiting')).toBeVisible()
  const divider = await rightEdge(page, '.wait-pane')
  expect(Math.abs(divider - (await swapCentre(page)))).toBeLessThanOrEqual(1)
})
