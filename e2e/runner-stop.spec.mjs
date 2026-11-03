import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  test,
  expect,
  docActions,
  enablePython,
  newSnippetButton,
  outputPane,
  PYTHON,
  showPanel
} from './fixtures.mjs'

test.skip(!PYTHON, 'needs python3 on the machine')

const pane = outputPane
const runButton = (page) => docActions(page).getByRole('button', { name: 'Run', exact: true })
const toolbarStop = (page) => docActions(page).getByRole('button', { name: 'Stop', exact: true })

let dir
test.beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'runner-stop-'))))
test.afterEach(() => rmSync(dir, { recursive: true, force: true }))

const pidFile = () => join(dir, 'pid')
const ticker = ({ ignoreTerm = false } = {}) =>
  [
    '#!/usr/bin/env python3',
    'import os, signal, time',
    ignoreTerm ? 'signal.signal(signal.SIGTERM, signal.SIG_IGN)' : '',
    `open(${JSON.stringify(pidFile())}, "w").write(str(os.getpid()))`,
    'while True:',
    "    print('tick', flush=True)",
    '    time.sleep(0.2)'
  ].join('\n')

async function openScript(app, page, code) {
  await enablePython(app, page)
  await showPanel(page, 'snippets')
  await newSnippetButton(page).click()
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.locator('.monaco-editor').first().click()
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), code)
  await page.keyboard.press('ControlOrMeta+v')
  await expect(runButton(page)).toBeVisible()
  return doc
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function expectStoppedAndDead(page) {
  await expect(pane(page)).toContainText('Stopped')
  const pid = Number(readFileSync(pidFile(), 'utf8'))
  await expect.poll(() => isAlive(pid)).toBe(false)
  const ticks = await pane(page).locator('.run-out').textContent()
  await page.waitForTimeout(600)
  expect(await pane(page).locator('.run-out').textContent()).toBe(ticks)
}

test('Stop ends a script that ignores SIGTERM', async ({ app, page }) => {
  await openScript(app, page, ticker({ ignoreTerm: true }))
  await runButton(page).click()
  await expect(pane(page)).toContainText('tick')
  await toolbarStop(page).click()
  await expectStoppedAndDead(page)
})

test('a run from the gutter can be stopped', async ({ app, page }) => {
  await openScript(app, page, ticker())
  await page.locator('.snippet-doc:visible .line-numbers').filter({ hasText: /^5$/ }).hover()
  await page.getByRole('button', { name: /Run up to line/ }).click()
  await expect(pane(page)).toContainText('tick')
  await toolbarStop(page).click()
  await expectStoppedAndDead(page)
})

test('Stop stays while the script is rewritten mid-run', async ({ app, page }) => {
  const doc = await openScript(app, page, ticker())
  await runButton(page).click()
  await expect(pane(page)).toContainText('tick')
  await doc.locator('.monaco-editor').first().click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('shopping list')
  await expect(doc.locator('.view-lines')).toContainText('shopping list')
  await toolbarStop(page).click()
  await expectStoppedAndDead(page)
})
