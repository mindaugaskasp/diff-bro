import { rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  showPanel
} from './fixtures.mjs'

test('the toolbar carries no key buttons, and Keys is not a sidebar segment', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'My key' })).toHaveCount(0)
  await expect(page.locator('.sidebar-nav [data-value="keys"]')).toHaveCount(0)
})

test('before any swap, the panel shows your key and how sharing starts', async ({ page }) => {
  await showPanel(page, 'keys')
  await expect(page.getByText('Your key', { exact: true })).toBeVisible()
  await expect(page.locator('.key-fp')).toHaveText(/[0-9a-f]{4}/i)
  await expect(page.getByRole('heading', { name: 'Share diffs with someone' })).toBeVisible()
})

test('trusted keys are listed in the panel', async () => {
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
    await showPanel(page, 'keys')
    await expect(page.getByRole('heading', { name: 'Trusted · 3' })).toBeVisible()
    await expect(page.locator('.keys-panel li.key')).toHaveCount(3)
  } finally {
    await app.close()
    rmSync(dir, { force: true, recursive: true })
  }
})
