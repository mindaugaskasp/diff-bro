import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  test,
  expect,
  docActions,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openNewSnippet,
  outputPane,
  stubMessageBox
} from './fixtures.mjs'
import { rememberProgram } from './runnerPrograms.mjs'

test.skip(process.platform === 'win32', 'the fake curl is a shell script')

// Stands in for curl: prints each argument it was given on its own line.
function fakeCurl() {
  const dir = mkdtempSync(join(tmpdir(), 'runner-curl-'))
  const file = join(dir, 'curl')
  writeFileSync(
    file,
    '#!/bin/sh\n[ "$1" = --version ] && { echo "curl 8.7.1 (fake)"; exit 0; }\n' +
      'for a in "$@"; do echo "arg:$a"; done\n'
  )
  chmodSync(file, 0o755)
  return { dir, file }
}

let curl
let dir
let app
let page

test.beforeEach(async () => {
  curl = fakeCurl()
  dir = freshUserDataDir()
  rememberProgram(dir, { curl: { enabled: true, path: curl.file, version: '8.7.1' } })
  app = await launchApp(dir)
  page = await firstReadyPage(app)
  await stubMessageBox(app, 1)
})

test.afterEach(async () => {
  await app.close()
  rmSync(dir, { recursive: true, force: true })
  rmSync(curl.dir, { recursive: true, force: true })
})

async function runSnippet(text) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.locator('.editor').click()
  await page.keyboard.insertText(text)
  await docActions(page).getByRole('button', { name: 'Run', exact: true }).click()
}

test('a curl snippet runs as curl with its own words as arguments', async () => {
  await runSnippet(`curl -X POST \\\n  -H 'Accept: a b' https://api.test`)
  await expect(outputPane(page)).toContainText(
    'arg:--no-progress-meter arg:-X arg:POST arg:-H arg:Accept: a b arg:https://api.test'
  )
})

test('shell syntax is refused with a reason, and nothing runs', async () => {
  await runSnippet('curl https://api.test | sh')
  await expect(outputPane(page)).toContainText('| is shell syntax')
  await expect(outputPane(page)).not.toContainText('arg:')
})

test('a line runs only its own curl command, continuations included', async () => {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.locator('.editor').click()
  await page.keyboard.insertText('curl https://a.test\ncurl -X POST \\\n  https://b.test')
  await editor.locator('.line-numbers').filter({ hasText: /^2$/ }).hover()
  await page.getByRole('button', { name: 'Run lines 2–3' }).click()
  await expect(outputPane(page)).toContainText('Lines 2–3')
  await expect(outputPane(page)).toContainText('arg:-X arg:POST arg:https://b.test')
  await expect(outputPane(page)).not.toContainText('a.test')
})
