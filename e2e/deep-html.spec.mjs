import { test, expect, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Monaco's HTML worker walks the document tree to build symbols with a plain
// recursion and no depth guard (provideFileSymbolsInternal → children.forEach →
// itself). An unclosed tag nests everything after it, so a generated or
// truncated HTML file recurses once per line and overflows the stack — which
// reaches the reader as a crash-report dialog over a file the app should simply
// have shown. Only a real launch runs the worker at all, so this lives here.

// Two frames per level, against a ~10k frame budget.
const DEPTH = 9000

const nested = (marker) =>
  `<html><body>\n${'<div>\n'.repeat(DEPTH)}${marker}\n${'</div>\n'.repeat(DEPTH)}</body></html>\n`

test('a deeply nested HTML file compares without overflowing the worker', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-deep-html-'))
  const left = join(dir, 'left.html')
  const right = join(dir, 'right.html')
  writeFileSync(left, nested('ALPHA'))
  writeFileSync(right, nested('OMEGA'))

  try {
    await stubOpenDialog(app, left)
    await page.locator('.slot[data-side="left"] .open').click()
    await stubOpenDialog(app, right)
    await page.locator('.slot[data-side="right"] .open').click()

    // The diff itself must land: one changed line, deep inside the nesting.
    await expect(page.locator('.status-band .del')).toContainText('1 removed', { timeout: 30_000 })

    // The symbol walk is kicked off after the model settles, so give it the
    // chance to blow up before declaring the file safe to open.
    await page.waitForTimeout(2000)
    await expect(page.getByRole('dialog', { name: 'Something went wrong' })).toHaveCount(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
