import { test, expect, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Ctrl/Cmd+V with ONE file already loaded must paste into the empty side and
// keep the loaded file (not orphan it) — the whole chain: keydown shortcut →
// confirm dialog → main-process clipboard read → store.
test('Ctrl/Cmd+V pastes into the empty side of a single loaded file', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-paste-'))
  const f = join(dir, 'left.txt')
  writeFileSync(f, 'line one\nline two\n')
  try {
    await stubOpenDialog(app, [f])
    await page.locator('.slot[data-side="left"]').click()
    await expect(page.locator('.slot[data-side="left"] .name')).toHaveText('left.txt')

    await page.evaluate(() => window.api.copyText('line one\nCHANGED\nline two\n'))
    await page.keyboard.press('ControlOrMeta+v')

    const dlg = page.getByRole('dialog', { name: 'Paste detected' })
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: 'Paste', exact: true }).click()

    // Left file kept; pasted text is the right side; diff renders it.
    await expect(page.locator('.slot[data-side="left"] .name')).toHaveText('left.txt')
    await expect(page.locator('.slot[data-side="right"] .name')).toHaveText('Right (pasted)')
    await expect(page.getByText('CHANGED').first()).toBeVisible()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
