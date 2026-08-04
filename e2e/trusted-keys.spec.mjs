import { rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage, openMenu } from './fixtures.mjs'

// The single-key trust round-trip is covered in sharing.spec. This one stresses
// the *manager* UI: does it stay stable and usable with a realistic org's worth
// of trusted keys (10–15)? The list is meant to bound itself (max-height +
// scroll) rather than push the dialog off-screen, and rename/remove must operate
// on the right row without disturbing the others.
const N = 15

// Seed the trusted-keys store directly (listing/rename/remove don't re-validate
// key material — only import does, and that's tested elsewhere). Each entry needs
// a unique fingerprint + a label; sign/box are unused by the manager.
function seedTrustedKeys(dir) {
  const keys = Array.from({ length: N }, (_, i) => ({
    fingerprint: randomBytes(16).toString('hex'),
    label: `Teammate ${String(i + 1).padStart(2, '0')}`,
    sign: 'c2lnbg==',
    box: 'Ym94'
  }))
  writeFileSync(join(dir, 'trusted-keys.json'), JSON.stringify(keys))
}

test('the trusted-keys manager stays stable with 15 keys', async () => {
  test.setTimeout(60_000)
  const dir = freshUserDataDir()
  seedTrustedKeys(dir)
  let app = await launchApp(dir)
  let page = await firstReadyPage(app)

  try {
    await openMenu(page, 'Security', 'Manage Trusted Keys')
    const mgr = page.getByRole('dialog', { name: 'Trusted keys' })
    await expect(mgr).toBeVisible()

    // Every key renders, and the list bounds itself with a scroll rather than
    // overflowing the dialog/window.
    await expect(mgr.locator('li.key')).toHaveCount(N)
    await expect(mgr.getByText('Teammate 01', { exact: true })).toBeVisible()
    await expect(mgr.getByText('Teammate 15', { exact: true })).toBeVisible()
    const scrolls = await mgr
      .locator('.keys')
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1)
    expect(scrolls).toBe(true)

    // Rename a mid-list key: only that row changes, the count holds.
    const target = mgr.locator('li.key', { hasText: 'Teammate 08' })
    await target.getByRole('button', { name: 'Rename' }).click()
    await mgr.locator('input.inline-edit').fill('Teammate 08 — laptop')
    await mgr.locator('input.inline-edit').press('Enter')
    await expect(mgr.getByText('Teammate 08 — laptop')).toBeVisible()
    await expect(mgr.locator('li.key')).toHaveCount(N)

    // Remove two different rows (each behind a confirmation): the count drops,
    // the removed ones vanish, the rest are untouched.
    const confirmRemove = () =>
      page
        .getByRole('dialog', { name: 'Remove trusted key?' })
        .getByRole('button', { name: 'Remove' })
        .click()
    await mgr
      .locator('li.key', { hasText: 'Teammate 03' })
      .getByRole('button', { name: 'Remove' })
      .click()
    await confirmRemove()
    await expect(mgr.locator('li.key')).toHaveCount(N - 1)
    await mgr
      .locator('li.key', { hasText: 'Teammate 12' })
      .getByRole('button', { name: 'Remove' })
      .click()
    await confirmRemove()
    await expect(mgr.locator('li.key')).toHaveCount(N - 2)
    await expect(mgr.getByText('Teammate 03', { exact: true })).toBeHidden()
    await expect(mgr.getByText('Teammate 12', { exact: true })).toBeHidden()
    await expect(mgr.getByText('Teammate 01', { exact: true })).toBeVisible()
    await expect(mgr.getByText('Teammate 08 — laptop')).toBeVisible()

    // The changes persist across a relaunch (the store was rewritten cleanly).
    await mgr.locator('.dialog-actions button', { hasText: 'Close' }).click()
    await app.close()
    app = await launchApp(dir)
    page = await firstReadyPage(app)
    await openMenu(page, 'Security', 'Manage Trusted Keys')
    const mgr2 = page.getByRole('dialog', { name: 'Trusted keys' })
    await expect(mgr2.locator('li.key')).toHaveCount(N - 2)
    await expect(mgr2.getByText('Teammate 08 — laptop')).toBeVisible()
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
