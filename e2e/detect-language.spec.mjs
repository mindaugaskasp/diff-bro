import { test, expect, openNewSnippet } from './fixtures.mjs'

// Monaco typing → detector → the footer's Auto label: only a real launch has that wiring.
test('the footer names the auto-detected syntax as you type', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  const syntax = doc.locator('.editor-status').getByRole('combobox', { name: 'Syntax' })
  await expect(syntax.locator('option:checked')).toHaveText('Auto-detect · Plain text')

  // Bracket-free, so Monaco's auto-closing can't perturb it.
  await doc.locator('.editor').click()
  await page.keyboard.type('#!/bin/bash')
  await expect(syntax.locator('option:checked')).toHaveText('Auto-detect · Bash / Shell')

  await syntax.selectOption('python')
  await expect(syntax.locator('option:checked')).toHaveText('Python')
})
