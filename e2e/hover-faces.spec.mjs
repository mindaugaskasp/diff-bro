import { test, expect, paneLabel } from './fixtures.mjs'

// These float over code, so a translucent hover face lets the code run behind the label.
const settledFaceOf = (control) =>
  control.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished))
    return getComputedStyle(el).backgroundColor
  })

const expectOpaqueWash = async (control) => {
  const rest = await settledFaceOf(control)
  await control.hover()
  const hovered = await settledFaceOf(control)
  expect(hovered).not.toBe(rest)
  expect(hovered).not.toMatch(/\/|rgba/)
}

async function compare(page) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('one\ntwo')
  await page.getByPlaceholder('Paste or type the changed text').fill('one\nTWO')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('What are you comparing?')).toBeHidden()
}

test('a hovered pane label stays opaque over the code', async ({ page }) => {
  await compare(page)
  await expectOpaqueWash(paneLabel(page, 'left'))
})

test('the hovered presentation exit stays opaque over the code', async ({ page }) => {
  await compare(page)
  await page.getByTestId('toolbar-present').click()
  await expectOpaqueWash(page.getByRole('button', { name: 'Exit presentation mode' }))
})
