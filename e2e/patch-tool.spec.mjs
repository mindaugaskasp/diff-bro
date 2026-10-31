import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  clickAppMenuItem,
  openNewSnippet,
  paneLabel,
  snippetDoc
} from './fixtures.mjs'

const PATCH = '--- original\n+++ changed\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n'

async function applyPatch(app, dir) {
  mkdirSync(dir, { recursive: true })
  const base = join(dir, 'config.js')
  const patch = join(dir, 'change.patch')
  writeFileSync(base, 'a\nb\nc\n')
  writeFileSync(patch, PATCH)
  await app.evaluate(
    ({ dialog }, picks) => {
      const queue = [...picks]
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [queue.shift()] })
    },
    [base, patch]
  )
  await clickAppMenuItem(app, 'Apply Patch')
}

test('Patch opens beside an unsaved comparison and leaves it alone', async ({
  app,
  page
}, testInfo) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('mine')
  await page.getByPlaceholder('Paste or type the changed text').fill('MINE')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('What are you comparing?')).toBeHidden()

  await applyPatch(app, testInfo.outputDir)

  await expect(paneLabel(page, 'right')).toContainText('config.js (patched)')
  await expect(page.locator('.diff-tabs .tab')).toHaveCount(2)
  await page.locator('.diff-tabs .tab').first().click()
  await expect(page.getByText('MINE').first()).toBeVisible()
})

test('Patch shows its comparison when a snippet is in front', async ({ app, page }, testInfo) => {
  await openNewSnippet(page)
  await expect(snippetDoc(page)).toBeVisible()

  await applyPatch(app, testInfo.outputDir)

  await expect(snippetDoc(page)).toHaveCount(0)
  await expect(paneLabel(page, 'right')).toContainText('config.js (patched)')
})
