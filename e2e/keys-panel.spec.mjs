import { rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

const rail = (page) => page.getByRole('navigation', { name: 'Sidebar' })
const keysItem = (page) => rail(page).getByRole('button', { name: /^Keys/ })

test('the toolbar carries no key buttons; the rail has Keys at its foot', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'My key' })).toHaveCount(0)
  const items = rail(page).locator('.rail-item')
  await expect(items.last()).toHaveAttribute('data-panel', 'keys')
})

test('before any swap, the panel shows your key and how sharing starts', async ({ page }) => {
  await keysItem(page).click()
  await expect(page.getByText('Your key', { exact: true })).toBeVisible()
  await expect(page.locator('.key-fp')).toHaveText(/[0-9a-f]{4}/i)
  await expect(page.getByRole('heading', { name: 'Share diffs with someone' })).toBeVisible()
})

test('trusted keys are counted on the rail and listed in the panel', async () => {
  const dir = freshUserDataDir()
  const keys = ['Ana', 'Jonas', 'QA team'].map((label) => ({
    fingerprint: randomBytes(16).toString('hex'),
    label,
    sign: 'c2lnbg==',
    box: 'Ym94'
  }))
  writeFileSync(join(dir, 'trusted-keys.json'), JSON.stringify(keys))
  const app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await expect(keysItem(page)).toHaveAccessibleName('Keys, 3')
    await keysItem(page).click()
    await expect(page.getByRole('heading', { name: 'Trusted · 3' })).toBeVisible()
    await expect(page.locator('.keys-panel li.key')).toHaveCount(3)
  } finally {
    await app.close()
    rmSync(dir, { force: true, recursive: true })
  }
})
