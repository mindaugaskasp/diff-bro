import { test, expect, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The strip asked the active tab "anything in THIS mode?" and every other tab
// "anything at all?". Switching mode on a loaded comparison hid it, + opened a
// tab behind it, and the old one came back under its name, then vanished on click.

const tabs = (page) => page.locator('.diff-tabs .tab')
const addTab = (page) =>
  page.locator('.diff-tabs').getByRole('button', { name: 'New comparison', exact: true })

test('switching to paste mode on a file comparison keeps its tab, and + opens a fresh one', async ({
  app,
  page
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'strip-mode-'))
  try {
    writeFileSync(join(dir, 'alpha.txt'), 'one\ntwo\n')
    writeFileSync(join(dir, 'beta.txt'), 'one\nthree\n')
    await stubOpenDialog(app, join(dir, 'alpha.txt'))
    await page.locator('.slot[data-side="left"] .open').click()
    await stubOpenDialog(app, join(dir, 'beta.txt'))
    await page.locator('.slot[data-side="right"] .open').click()
    await expect(page.locator('.diff-container')).toBeVisible()
    await expect(tabs(page)).toHaveCount(1)

    await page.getByRole('button', { name: 'Paste mode' }).click()
    await expect(tabs(page)).toHaveCount(1)
    await expect(tabs(page).first()).toContainText('alpha.txt')

    await addTab(page).click()
    await tabs(page).first().locator('.tab-open').click()
    await expect(tabs(page)).toHaveCount(1)
    await expect(tabs(page).first()).toHaveClass(/active/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
