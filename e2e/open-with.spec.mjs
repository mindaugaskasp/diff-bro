import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  paneLabel
} from './fixtures.mjs'
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

const paneNames = (page) => page.locator('.pane-label').allTextContents()

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

const newSnippet = (page) => page.getByRole('region', { name: 'New snippet' })
const comparePrompt = (page) => page.getByRole('dialog', { name: /^Compare with/ })
const tabCount = (page) => page.locator('.diff-tabs .tab').count()

async function launchWithFiles() {
  const userDataDir = freshUserDataDir()
  const files = fixtureFiles()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  const done = async () => {
    await app.close()
    rmSync(files.dir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }
  return { userDataDir, files, page, done }
}

test('one file opened from the OS opens as an unsaved snippet, not half a comparison', async () => {
  const { userDataDir, files, page, done } = await launchWithFiles()

  await openWith(userDataDir, [files.alpha])
  const doc = newSnippet(page)
  await expect(doc).toBeVisible()
  await expect(doc.getByPlaceholder('Snippet name…')).toHaveValue('alpha.txt')
  await expect(doc.locator('.view-lines')).toContainText('two')
  await expect(doc.locator('.editor-status')).toContainText('not in your library yet')
  await expect(page.locator('.waiting')).toHaveCount(0)
  await done()
})

test('a second file asks first; Compare puts the first on the left', async () => {
  const { userDataDir, files, page, done } = await launchWithFiles()

  await openWith(userDataDir, [files.alpha])
  await expect(newSnippet(page)).toBeVisible()
  await openWith(userDataDir, [files.beta])

  const prompt = comparePrompt(page)
  await expect(prompt).toContainText('alpha.txt')
  await prompt.getByRole('button', { name: 'Compare', exact: true }).click()

  await expect(paneLabel(page, 'left')).toContainText('alpha.txt')
  await expect(paneLabel(page, 'right')).toContainText('beta.txt')
  expect(await tabCount(page)).toBe(2)
  await done()
})

test('dismissing the prompt opens the second file in its own tab', async () => {
  const { userDataDir, files, page, done } = await launchWithFiles()

  await openWith(userDataDir, [files.alpha])
  await expect(newSnippet(page)).toBeVisible()
  await openWith(userDataDir, [files.beta])
  await expect(comparePrompt(page)).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(newSnippet(page).getByPlaceholder('Snippet name…')).toHaveValue('beta.txt')
  expect(await tabCount(page)).toBe(2)
  await done()
})

test('with the first file closed, a second opens without asking', async () => {
  const { userDataDir, files, page, done } = await launchWithFiles()

  await openWith(userDataDir, [files.alpha])
  await expect(newSnippet(page)).toBeVisible()
  await page.getByRole('button', { name: /^Close alpha\.txt/ }).click()
  await expect(newSnippet(page)).toHaveCount(0)

  await openWith(userDataDir, [files.beta])
  await expect(newSnippet(page).getByPlaceholder('Snippet name…')).toHaveValue('beta.txt')
  await expect(comparePrompt(page)).toHaveCount(0)
  await done()
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
  expect(await paneNames(page)).toBeTruthy()

  await app.close()
  rmSync(files.dir, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
})
