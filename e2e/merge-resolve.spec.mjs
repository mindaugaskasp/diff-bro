import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'
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
  const env = { ...process.env }
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
