import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// The `diffbro` command is a SECOND launch: Electron's single-instance lock
// hands its argv to the running app, which is the only way this works — nothing
// listens on a port. Only a real second process proves that round trip, so this
// spawns one rather than calling the store.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
// The package exports the real binary path — it is nested inside Electron.app
// on macOS, so it cannot be joined by hand.
const ELECTRON = createRequire(import.meta.url)('electron')

function runCli(userDataDir, args) {
  // DELETE the key — assigning undefined leaves "undefined" in the child env,
  // which Electron reads as truthy and runs itself as plain Node (CLAUDE.md).
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(ELECTRON, [MAIN, `--user-data-dir=${userDataDir}`, ...args], {
      env,
      stdio: 'ignore'
    })
    p.on('exit', resolve)
    setTimeout(() => resolve(0), 8000)
  })
}

test('`diffbro compare` opens the files in the running app', async () => {
  const userDataDir = freshUserDataDir()
  const work = mkdtempSync(join(tmpdir(), 'diffbro-cli-'))
  const left = join(work, 'left.json')
  const right = join(work, 'right.json')
  writeFileSync(left, '{"a":1}')
  writeFileSync(right, '{"a":2}')
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.slot[data-side="left"]')).toBeVisible()

    await runCli(userDataDir, ['compare', left, right])

    await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.slot[data-side="left"]')).toContainText('left.json')
    await expect(page.locator('.slot[data-side="right"]')).toContainText('right.json')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  }
})

test('`diffbro cb save` stores the clipboard and opens it in the editor', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.slot[data-side="left"]')).toBeVisible()
    await page.evaluate(() => window.api.copyText('cli-clipboard-body'))

    await runCli(userDataDir, ['cb', 'save'])

    const editor = page.getByRole('dialog', { name: /Snippet/i })
    await expect(editor).toBeVisible({ timeout: 15000 })
    // inputValue(), not [value^=…]: v-model sets the property, never the
    // attribute, so an attribute selector never matches a Vue-bound field.
    await expect
      .poll(() => editor.locator('input').first().inputValue())
      .toMatch(/^Clipboard - \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    await expect(editor).toContainText('cli-clipboard-body')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
