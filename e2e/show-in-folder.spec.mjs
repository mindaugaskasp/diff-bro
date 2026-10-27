import { test, expect, showPanel } from './fixtures.mjs'

async function captureReveals(app) {
  await app.evaluate(({ shell }) => {
    globalThis.__revealed = []
    shell.showItemInFolder = (path) => globalThis.__revealed.push(path)
  })
}

const revealed = (app) => app.evaluate(() => globalThis.__revealed)

test('a snippet row reveals the encrypted snippet store', async ({ app, page }) => {
  await captureReveals(app)
  await showPanel(page, 'snippets')
  const row = page.locator('.snippets-section .row').first()
  await row.hover()
  await row.getByRole('button', { name: 'Show in folder' }).click()

  await expect.poll(() => revealed(app)).toHaveLength(1)
  expect((await revealed(app))[0]).toMatch(/[\\/]snippets\.json$/)
})

test('a saved diff row reveals the encrypted vault store', async ({ app, page }) => {
  await captureReveals(app)
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('before')
  await page.getByPlaceholder('Paste changed text here').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill('kept')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()

  const row = page.locator('li.diff', { hasText: 'kept' })
  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Show in folder' }).click()

  await expect.poll(() => revealed(app)).toHaveLength(1)
  expect((await revealed(app))[0]).toMatch(/[\\/]vault\.json$/)
})

test('main refuses to reveal anything but the two stores', async ({ app, page }) => {
  await captureReveals(app)
  for (const name of ['settings', '../vault', '/etc/passwd']) {
    expect(await page.evaluate((n) => globalThis.api.storeReveal(n), name)).toEqual({
      error: 'unknown-store'
    })
  }
  expect(await revealed(app)).toEqual([])
})
