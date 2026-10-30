import { test, expect, showPanel } from './fixtures.mjs'

const fit = (dialog) =>
  dialog.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const actions = el.querySelector('.dialog-actions').getBoundingClientRect()
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      scrolls: el.scrollHeight > el.clientHeight + 1,
      actionsInside: actions.bottom <= box.bottom + 0.5 && actions.top >= box.top
    }
  })

test('every tool opens at one size, and its actions stay in view', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 520 })
  await showPanel(page, 'tools')
  const tiles = page.locator('.tt-tile').filter({ hasNotText: 'Patch' })
  const names = await tiles.locator('.tt-name').allTextContents()
  expect(names.length).toBe(11)
  const sizes = new Set()
  for (const name of names) {
    await tiles.filter({ hasText: name }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const shape = await fit(dialog)
    expect(shape.scrolls, name).toBe(false)
    expect(shape.actionsInside, name).toBe(true)
    sizes.add(`${shape.width}×${shape.height}`)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
  expect([...sizes]).toHaveLength(1)
})

test('a tool whose result outgrows the window scrolls its body, not the dialog', async ({
  page
}) => {
  await page.setViewportSize({ width: 1100, height: 420 })
  await showPanel(page, 'tools')
  await page.locator('.tt-tile', { hasText: 'JSON' }).click()
  const dialog = page.getByRole('dialog', { name: 'JSON' })
  await dialog
    .getByRole('textbox')
    .first()
    .fill(JSON.stringify({ replicas: 3, image: 'api:1.42', env: 'production', tiers: [1, 2, 3] }))
  await expect(dialog.locator('.dialog-body')).toBeVisible()
  const shape = await fit(dialog)
  expect(shape.scrolls).toBe(false)
  expect(shape.actionsInside).toBe(true)
  expect(
    await dialog.locator('.dialog-body').evaluate((el) => el.scrollHeight > el.clientHeight)
  ).toBe(true)
})

test('a dialog is a sheet with quiet fields', async ({ page }) => {
  await showPanel(page, 'tools')
  await page.locator('.tt-tile', { hasText: 'Epoch' }).click()
  const dialog = page.getByRole('dialog', { name: 'Epoch' })
  const look = await dialog.evaluate((el) => {
    document.activeElement.blur()
    const s = getComputedStyle(el)
    const field = getComputedStyle(el.querySelector('input, textarea'))
    const probe = document.createElement('div')
    probe.style.background = 'var(--bg-raised)'
    document.body.append(probe)
    const raised = getComputedStyle(probe).backgroundColor
    probe.remove()
    return {
      face: s.backgroundColor,
      raised,
      edge: s.borderTopColor,
      fieldEdge: field.borderTopColor
    }
  })
  expect(look.face).toBe(look.raised)
  expect(look.edge).toBe('rgba(0, 0, 0, 0)')
  expect(look.fieldEdge).toBe('rgba(0, 0, 0, 0)')
})

test('a form dialog keeps its buttons in view on a short window', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('{\n  "a": 1\n}')
  await page.getByPlaceholder('Paste or type the changed text').fill('{\n  "a": 2\n}')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.setViewportSize({ width: 1100, height: 300 })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await expect(dialog).toBeVisible()
  const shape = await fit(dialog)
  expect(shape.scrolls).toBe(false)
  expect(shape.actionsInside).toBe(true)
})
