import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'
import { workerEnv } from './workerEnv.mjs'
import { execFileSync } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
const ELECTRON = createRequire(import.meta.url)('electron')

// Only a real launch proves this: main has to find the repository, read a blob
// out of git, write it somewhere the app may open, and hand the renderer two
// ordinary paths.
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-repo-'))
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'T',
        GIT_AUTHOR_EMAIL: 't@e',
        GIT_COMMITTER_NAME: 'T',
        GIT_COMMITTER_EMAIL: 't@e'
      }
    })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'app.json'), '{\n  "replicas": 3\n}\n')
  git('add', '.')
  git('commit', '-qm', 'first')
  writeFileSync(join(dir, 'app.json'), '{\n  "replicas": 9\n}\n')
  git('add', '.')
  git('commit', '-qm', 'second')
  return dir
}

function runCli(userDataDir, cwd, args) {
  const env = { ...workerEnv(userDataDir) }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(ELECTRON, [MAIN, `--user-data-dir=${userDataDir}`, ...args], {
      cwd,
      env,
      stdio: 'ignore'
    })
    p.on('exit', () => resolve())
    setTimeout(resolve, 8000)
  })
}

test('compares a file against the revision it names', async () => {
  const repo = makeRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runCli(userDataDir, repo, ['compare', 'HEAD~1:app.json', 'app.json'])

    // Both sides arrived: the old one out of git, the new one off disk.
    await expect(page.locator('.slot[data-side="left"] .name')).toContainText('app.json', {
      timeout: 20000
    })
    await expect(page.locator('.slot[data-side="right"] .name')).toContainText('app.json')

    // And it is a real comparison of the two revisions, not the file with
    // itself: 3 became 9.
    const editor = page.locator('.monaco-diff-editor')
    await expect(editor).toBeVisible({ timeout: 20000 })
    await expect(editor).toContainText('3')
    await expect(editor).toContainText('9')
  } finally {
    await app.close().catch(() => {})
    rmSync(repo, { recursive: true, force: true })
  }
})

test('says so when the revision does not exist, and opens nothing', async () => {
  const repo = makeRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runCli(userDataDir, repo, ['compare', 'no-such-ref:app.json', 'app.json'])
    // The refusal is total: a half-loaded comparison would be worse than none.
    await page.waitForTimeout(1500)
    await expect(page.locator('.slot[data-side="left"] .name')).toHaveCount(0)
  } finally {
    await app.close().catch(() => {})
    rmSync(repo, { recursive: true, force: true })
  }
})
