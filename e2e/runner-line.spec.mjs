import { execSync } from 'node:child_process'
import {
  test,
  expect,
  docActions,
  newSnippetButton,
  showPanel,
  stubMessageBox,
  stubOpenDialog
} from './fixtures.mjs'

const PYTHON = execSync('command -v python3', { shell: '/bin/sh' }).toString().trim()
const SCRIPT = [
  '#!/usr/bin/env python3',
  '# totals',
  'orders = [3, 1, 2]',
  'print(len(orders))',
  'for o in orders:',
  '    print(o * 10)',
  '',
  'print("sent")'
].join('\n')

const pane = (page) => page.getByRole('region', { name: 'Output' })
const lineNumber = (page, n) =>
  page.locator('.snippet-doc:visible .line-numbers').filter({ hasText: new RegExp(`^${n}$`) })

async function openScript(app, page) {
  await stubMessageBox(app, 1)
  await stubOpenDialog(app, PYTHON)
  await page.evaluate(() => window.api.runEnable('python'))
  await showPanel(page, 'snippets')
  await newSnippetButton(page).click()
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.locator('.monaco-editor').first().click()
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), SCRIPT)
  await page.keyboard.press('Control+v')
  await expect(docActions(page).getByRole('button', { name: 'Run', exact: true })).toBeVisible()
}

test('hovering a block line offers to run up to its end, and runs exactly that', async ({
  app,
  page
}) => {
  await openScript(app, page)
  await lineNumber(page, 5).hover()
  const play = page.getByRole('button', { name: 'Run up to line 6' })
  await expect(play).toBeVisible()
  await play.click()
  await expect(pane(page)).toContainText('Finished')
  await expect(pane(page)).toContainText('Up to line 6')
  await expect(pane(page).locator('.run-out')).toHaveText('3\n30\n10\n20\n', { useInnerText: false })
})

test('a comment or blank line gets no button', async ({ app, page }) => {
  await openScript(app, page)
  for (const n of [1, 2, 7]) {
    await lineNumber(page, n).hover()
    await expect(page.locator('.run-gutter')).toHaveCount(0)
  }
  await lineNumber(page, 4).hover()
  await expect(page.getByRole('button', { name: 'Run up to line 4' })).toBeVisible()
})

test('Run again repeats a line run, and toolbar Run still runs everything', async ({
  app,
  page
}) => {
  await openScript(app, page)
  await lineNumber(page, 4).hover()
  await page.getByRole('button', { name: 'Run up to line 4' }).click()
  await expect(pane(page).locator('.run-out')).toHaveText('3\n', { useInnerText: false })
  await pane(page).getByRole('button', { name: 'Run again' }).click()
  await expect(pane(page)).toContainText('Up to line 4')
  await expect(pane(page).locator('.run-out')).toHaveText('3\n', { useInnerText: false })

  await docActions(page).getByRole('button', { name: 'Run', exact: true }).click()
  await expect(pane(page).locator('.run-out')).toContainText('sent')
  await expect(pane(page)).not.toContainText('Up to line')
})
