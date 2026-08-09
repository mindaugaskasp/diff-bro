import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'
import { workerEnv } from './workerEnv.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
const ELECTRON = createRequire(import.meta.url)('electron')

// A conflict git actually produced, resolved through the app, and the file git
// is left holding. Only a real launch proves the whole chain: main reads
// $MERGED, the renderer resolves, and main writes the path it has held since.
function conflictedRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const file = join(dir, 'app.txt')
  git('init', '-q', '-b', 'main')
  writeFileSync(file, 'one\nbase\nthree\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(file, 'one\ntheirs\nthree\n')
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  writeFileSync(file, 'one\nours\nthree\n')
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected: this is the conflict under test.
  }
  return { dir, file }
}

function runMergetool(userDataDir, dir, file) {
  const env = { ...workerEnv(userDataDir) }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(
      ELECTRON,
      [MAIN, `--user-data-dir=${userDataDir}`, 'mergetool', file, file, file],
      { cwd: dir, env, stdio: 'ignore' }
    )
    p.on('exit', () => resolve())
    setTimeout(resolve, 8000)
  })
}

test('resolves a real conflict and writes the merged file back', async () => {
  const { dir, file } = conflictedRepo()
  expect(readFileSync(file, 'utf8')).toContain('<<<<<<<')

  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)

    const dialog = page.getByRole('dialog', { name: 'Resolve merge conflicts' })
    await expect(dialog).toBeVisible({ timeout: 20000 })

    // The two conflicting versions are what the README promises and what the
    // dialog sits over — they used to open EMPTY, because the merge route
    // returned before vouching for either path.
    await expect(page.locator('.slot[data-side="left"] .name')).toContainText('app.txt')
    await expect(page.locator('.slot[data-side="right"] .name')).toContainText('app.txt')

    // Nothing may be written while a conflict is undecided.
    const save = page.getByTestId('merge-save')
    await expect(save).toBeDisabled()

    await page.getByTestId('merge-theirs-0').click()
    await expect(save).toBeEnabled()
    await save.click()
    await expect(dialog).toHaveCount(0, { timeout: 10000 })

    // The file git is left holding: their side, no markers.
    const merged = readFileSync(file, 'utf8')
    expect(merged).toBe('one\ntheirs\nthree\n')
    expect(merged).not.toContain('<<<<<<<')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

test('declining leaves the file exactly as git left it', async () => {
  const { dir, file } = conflictedRepo()
  const before = readFileSync(file)
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    const dialog = page.getByRole('dialog', { name: 'Resolve merge conflicts' })
    await expect(dialog).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)

    // Untouched, markers and all — the reader said no.
    expect(readFileSync(file).equals(before)).toBe(true)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// git calls the mergetool for a BINARY conflict too, and leaves it with no
// markers. Reading it as text turned every invalid byte into U+FFFD and one
// click wrote that over the file.
test('refuses a binary conflict instead of destroying it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-bin-'))
  const file = join(dir, 'blob.bin')
  const bytes = Buffer.from([0x00, 0x01, 0x02, 0x07, 0xff, 0xfe, 0x00, 0x0a])
  writeFileSync(file, bytes)
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await page.waitForTimeout(1500)
    await expect(page.getByRole('dialog', { name: 'Resolve merge conflicts' })).toHaveCount(0)
    expect(readFileSync(file).equals(bytes)).toBe(true)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// A file with no markers is not "already resolved" — it is a file this tool has
// no business rewriting.
test('refuses a file with no conflict markers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-plain-'))
  const file = join(dir, 'plain.txt')
  writeFileSync(file, 'nothing to resolve\n')
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await page.waitForTimeout(1500)
    await expect(page.getByRole('dialog', { name: 'Resolve merge conflicts' })).toHaveCount(0)
    expect(readFileSync(file, 'utf8')).toBe('nothing to resolve\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})
