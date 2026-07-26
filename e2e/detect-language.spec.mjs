import { test, expect } from './fixtures.mjs'

// Auto-detect drives the snippet editor's syntax indicator live as you type: on
// 'Auto-detect', the picker shows "→ <detected>" recomputed from the Monaco
// content. Only a real launch exercises this end to end — Monaco typing feeding
// the detector feeding the reactive label — so this guards the wiring the unit
// tests can't (they call the pure detector directly, never through the editor).
test('the editor shows and updates the auto-detected syntax as you type', async ({ page }) => {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Snippet' })
  await expect(dialog).toBeVisible()

  // A blank draft detects as plaintext — the baseline the indicator starts on.
  const detected = dialog.locator('.lang-detected')
  await expect(detected).toHaveText('→ plaintext')

  // Type a shebang (bracket-free, so Monaco's auto-closing can't perturb it):
  // the detector reads the interpreter and the label flips to shell.
  await dialog.locator('.editor').click()
  await page.keyboard.type('#!/bin/bash')
  await expect(detected).toHaveText('→ shell')

  // Choosing an explicit syntax overrides auto-detect, and the "→" hint hides.
  await dialog.getByLabel('Syntax').selectOption('python')
  await expect(detected).toBeHidden()
})
