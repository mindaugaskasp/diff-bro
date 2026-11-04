import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  test,
  expect,
  docActions,
  enablePython,
  markSecret,
  newSnippetButton,
  outputPane,
  PYTHON,
  showPanel
} from './fixtures.mjs'

test.skip(!PYTHON, 'needs python3 on the machine')

const SHEBANG = '#!/usr/bin/env python3\n'

async function newScript(app, page, code) {
  await showPanel(page, 'snippets')
  await newSnippetButton(page).click()
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.locator('.monaco-editor').first().click()
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), SHEBANG + code)
  await page.keyboard.press('ControlOrMeta+v')
  await expect(doc.locator('.view-lines')).toContainText('python3')
  return doc
}

const runButton = (page) => docActions(page).getByRole('button', { name: 'Run', exact: true })
const pane = outputPane

test('Run shows the output in a pane under the editor', async ({ app, page }) => {
  await enablePython(app, page)
  const doc = await newScript(app, page, 'print("hello from python")')
  await runButton(page).click()
  await expect(pane(page).locator('.run-out')).toHaveText('hello from python\n', {
    useInnerText: false
  })
  await expect(pane(page)).toContainText('Finished')
  await expect(pane(page)).toContainText('exit 0')
  await expect(pane(page)).toContainText(/Python \d+\.\d+/)

  const [editor, output] = await Promise.all([
    doc.locator('.editor-area').boundingBox(),
    pane(page).boundingBox()
  ])
  expect(output.y).toBeGreaterThanOrEqual(editor.y + editor.height - 1)
})

test('a failure says so, with stderr on its wash', async ({ app, page }) => {
  await enablePython(app, page)
  await newScript(app, page, 'print("before")\nraise ValueError("nope")')
  await runButton(page).click()
  await expect(pane(page)).toContainText('Failed')
  await expect(pane(page)).toContainText('exit 1')
  await expect(pane(page).locator('.run-err')).toContainText('ValueError: nope')
  await expect(pane(page).locator('.run-out')).toContainText('before')
})

test('it runs the text on screen, saved or not', async ({ app, page }) => {
  await enablePython(app, page)
  await newScript(app, page, 'print("first")')
  await runButton(page).click()
  await expect(pane(page)).toContainText('first')
  await page.getByRole('region', { name: 'New snippet' }).locator('.monaco-editor').first().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText('\nprint("second")')
  await pane(page).getByRole('button', { name: 'Run again' }).click()
  await expect(pane(page).locator('.run-out')).toContainText('second')
})

test('Stop replaces Run while it runs', async ({ app, page }) => {
  await enablePython(app, page)
  await newScript(app, page, 'import time\nprint("started", flush=True)\ntime.sleep(60)')
  await runButton(page).click()
  await expect(pane(page)).toContainText('Running')
  await expect(pane(page)).toContainText('started')
  await expect(pane(page).getByRole('button', { name: 'Run again' })).toHaveCount(0)
  await docActions(page).getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(pane(page)).toContainText('Stopped')
  await expect(runButton(page)).toBeVisible()
})

test('output can be copied, cleared and closed', async ({ app, page }) => {
  await enablePython(app, page)
  await newScript(app, page, 'print("keep me")')
  await runButton(page).click()
  await expect(pane(page)).toContainText('keep me')

  await pane(page).getByRole('button', { name: 'Copy output' }).click()
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('keep me\n')

  await pane(page).getByRole('button', { name: 'Clear' }).click()
  await expect(pane(page).locator('.run-out')).toHaveText('')
  await pane(page).getByRole('button', { name: 'Close' }).click()
  await expect(pane(page)).toHaveCount(0)
})

test('output saves as its own snippet, which cannot run', async ({ app, page }) => {
  await enablePython(app, page)
  await newScript(app, page, 'print("worth keeping")')
  await runButton(page).click()
  await expect(pane(page)).toContainText('worth keeping')
  await pane(page).getByRole('button', { name: 'Save as snippet' }).click()
  const saved = page.locator('.snippet-doc:visible')
  await expect(saved.locator('.view-lines')).toContainText('worth keeping')
  await expect(saved.locator('.view-lines')).not.toContainText('python3')
  await expect(runButton(page)).toHaveCount(0)
})

test('no Run until the language is enabled, and none for other languages', async ({
  app,
  page
}) => {
  await newScript(app, page, 'print("hi")')
  await expect(runButton(page)).toHaveCount(0)
  await enablePython(app, page)
  await page.reload()
  await showPanel(page, 'snippets')
  await page
    .locator('li.row', { hasText: /Example — Mermaid diagram(?!, v2)/ })
    .first()
    .click()
  await expect(page.locator('.snippet-doc:visible')).toBeVisible()
  await expect(runButton(page)).toHaveCount(0)
})

test('a secret snippet cannot run', async ({ app, page }) => {
  await enablePython(app, page)
  const doc = await newScript(app, page, 'print("hush")')
  await doc.locator('.doc-name input').fill('Hush script')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.row', { hasText: 'Hush script' }).first()).toBeVisible()
  await markSecret(page, 'Hush script')
  await page.locator('li.row', { hasText: 'Hush script' }).first().click()
  await expect(runButton(page)).toBeDisabled()
})

const SCRIPT_SLEEP_MS = 1500

test('closing the tab stops the run', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'runner-pane-'))
  const marker = join(dir, 'ran-too-long')
  try {
    await enablePython(app, page)
    const code = `import time\nprint("started", flush=True)\ntime.sleep(${SCRIPT_SLEEP_MS / 1000})\nopen(${JSON.stringify(marker)}, "w").close()`
    await newScript(app, page, code)
    await runButton(page).click()
    await expect(pane(page)).toContainText('started')
    await page.locator('.diff-tabs .tab.active .tab-close').click()
    const ask = page.getByRole('dialog', { name: /^Close/ })
    await ask.getByRole('button', { name: 'Close it', exact: true }).click()
    await expect(page.locator('.diff-tabs .tab', { hasText: 'python' })).toHaveCount(0)
    await page.waitForTimeout(SCRIPT_SLEEP_MS + 1000)
    expect(existsSync(marker)).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
