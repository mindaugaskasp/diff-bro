import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'
import { workerEnv } from './workerEnv.mjs'

// An "Open with" is a SECOND launch carrying paths and no verb — the shape that
// used to exit(1) before a window existed. Only a real process proves it.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
const ELECTRON = createRequire(import.meta.url)('electron')

function openWith(userDataDir, files) {
  const env = { ...process.env, ...workerEnv(userDataDir) }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(ELECTRON, [MAIN, `--user-data-dir=${userDataDir}`, ...files], {
      env,
      stdio: 'ignore'
    })
    p.on('exit', resolve)
    setTimeout(() => resolve(0), 8000)
  })
}

const slotNames = (page) =>
  page.locator('.file-slot .slot-name, .file-slots .name').allTextContents()

function fixtureFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-openwith-'))
  const write = (name, body) => {
    const path = join(dir, name)
    writeFileSync(path, body)
    return path
  }
  return {
    dir,
    alpha: write('alpha.txt', 'one\ntwo\nthree\n'),
    beta: write('beta.txt', 'one\ntwo CHANGED\nthree\n'),
    gamma: write('gamma.txt', 'gamma\n')
  }
}

test('a file opened from the OS fills the left pane, and a second joins it on the right', async () => {
  const userDataDir = freshUserDataDir()
  const files = fixtureFiles()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)

  await openWith(userDataDir, [files.alpha])
  await expect(page.locator('.diff-tabs')).toBeVisible()
  await expect(page.getByText('alpha.txt').first()).toBeVisible()

  // The SECOND file joins the first rather than taking a tab of its own.
  await openWith(userDataDir, [files.beta])
  await expect(page.getByText('beta.txt').first()).toBeVisible()
  expect(await page.locator('.diff-tabs .tab').count()).toBe(1)

  // The third starts the cycle again.
  await openWith(userDataDir, [files.gamma])
  await expect.poll(async () => page.locator('.diff-tabs .tab').count(), { timeout: 8000 }).toBe(2)

  await app.close()
  rmSync(files.dir, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
})

// Two files at once produced "Unknown command: <second path>" and exit(1),
// before any window existed — the app simply did not start.
test('two files selected at once open together instead of refusing to launch', async () => {
  const userDataDir = freshUserDataDir()
  const files = fixtureFiles()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)

  await openWith(userDataDir, [files.alpha, files.beta])

  await expect(page.getByText('alpha.txt').first()).toBeVisible()
  await expect(page.getByText('beta.txt').first()).toBeVisible()
  // Both sides of ONE comparison.
  expect(await page.locator('.diff-tabs .tab').count()).toBe(1)

  await app.close()
  rmSync(files.dir, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
})

test('the app still starts when handed a path, rather than treating it as a command', async () => {
  const userDataDir = freshUserDataDir()
  const files = fixtureFiles()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)

  await openWith(userDataDir, [files.alpha, files.beta, files.gamma])
  // Three files: two tabs, and the window is still alive to show them.
  await expect.poll(async () => page.locator('.diff-tabs .tab').count(), { timeout: 8000 }).toBe(2)
  expect(await slotNames(page)).toBeTruthy()

  await app.close()
  rmSync(files.dir, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
})
